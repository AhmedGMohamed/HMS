/**
 * Employee payments (payroll) report — Phase 6.11.5.
 *
 * Replaces the legacy payroll endpoint, which ran **one payment query, one
 * association query per payment and one 30-day deduction query per payment per
 * employee** — a report over ten employees could issue hundreds of statements
 * and the same clock-in deduction was counted once per payment in the window.
 * The v2 model is fixed-cost:
 *
 *   - `listEmployeePayments`: 4 queries — the page, the whole-set summary, and
 *     the two chart series. The page and the summary share the same CTEs, so
 *     the footer cannot disagree with the KPI strip.
 *   - `getEmployeeDetail`: 3 queries — header + config + summary (one
 *     statement), one page of payments, and the period deductions.
 *   - `getPaymentAssociations`: 1 query for the payment being expanded.
 *   - `exportEmployeePayments`: 5 queries — rows and both chart series, then the
 *     per-employee configuration, then every payment with its associations in
 *     one `ANY(ids)` statement, then every deduction. The envelope summary is
 *     derived from the rows (`summariseRows`), so it cannot disagree with them.
 *     Five fixed statements for the whole document, never one per employee or
 *     per payment.
 *
 * ## The three money rules (plan D15 / §3.4)
 *
 *   1. **Deductions are period-scoped, once per employee.** `pay_deduction` is
 *      summed over `EmployeeClockIn` rows inside the range and subtracted once
 *      from the employee's net — never attributed to individual payments, which
 *      is what made the legacy figures double-count.
 *   2. **Paid and unpaid are gross** (`payment_amount + extra_amount`). The net
 *      is the only figure that subtracts deductions, and every label says so.
 *   3. **Void payments are excluded everywhere** — list, summary, charts,
 *      detail, export. A voided payment is not money.
 *
 * ## Which timestamp scopes the range
 *
 * `EmployeePayment.issued_timestamp` (when the payment was raised), half-open
 * `[start, end + 1 day)` so a payment issued at 13:00 on the end date is
 * included — the legacy `BETWEEN $1 AND $2::date + INTERVAL '1 day'` also
 * worked, but only because it compared a timestamp against an exclusive
 * midnight; stating the rule once here keeps the export and the screen aligned.
 *
 * ## Why the charts are generated from buckets
 *
 * The timeline uses the same `generate_series` approach as the statistics tab:
 * a month with no payments is a zero row, so the line is honest instead of
 * jumping between the periods that did have activity.
 */

import type {
	EmployeePaymentAssociationsDTO,
	EmployeePaymentBreakdown,
	EmployeePaymentCharts,
	EmployeePaymentDetailDTO,
	EmployeePaymentDetailRow,
	EmployeePaymentExportPayload,
	EmployeePaymentExportPayment,
	EmployeePaymentExportRow,
	EmployeePaymentReportDTO,
	EmployeePaymentRow,
	EmployeePaymentSummary,
	PaymentAssociationRow,
	PeriodDeductionRow,
	ReportGrouping,
} from "../../utils/types/reportV2.js";
import { query } from "../database/connection.js";
import {
	END_EXCLUSIVE_OFFSET,
	NotFoundError,
	type DateRangeQuery,
	type PagingQuery,
	type SortDirection,
	clockStatusFor,
	likePattern,
	readWindowTotal,
	roundTo,
	stripWindowTotal,
	toDbDateOnly,
	toTimestampString,
} from "./shared.js";

/** `?employee_type=` values; `other` is "neither doctor nor nurse". */
export const EMPLOYEE_PAYMENT_TYPE_FILTERS = [
	"all",
	"doctor",
	"nurse",
	"other",
] as const;

export type EmployeePaymentTypeFilter =
	(typeof EMPLOYEE_PAYMENT_TYPE_FILTERS)[number];

/** Timeline bucket sizes. */
export const EMPLOYEE_PAYMENT_GROUPINGS = ["day", "month", "year"] as const;

export type EmployeePaymentGrouping = (typeof EMPLOYEE_PAYMENT_GROUPINGS)[number];

/** Sort keys the payroll list accepts (`?sort=`). */
export const EMPLOYEE_PAYMENT_SORT_COLUMNS = {
	name: "e.name",
	payments: "agg.payment_count",
	base: "agg.total_base_pay",
	extra: "agg.total_extra_pay",
	deductions: "agg.total_deductions",
	net: "agg.net_payment",
} as const;

export type EmployeePaymentSortColumn =
	keyof typeof EMPLOYEE_PAYMENT_SORT_COLUMNS;

export interface EmployeePaymentFilters {
	range: DateRangeQuery;
	employeeType: EmployeePaymentTypeFilter;
	/** `null` = every employee with a payment in range. */
	employeeId: number | null;
	/** Matches the employee's name. */
	search: string | null;
	grouping: EmployeePaymentGrouping;
}

export interface EmployeePaymentListQuery extends EmployeePaymentFilters {
	paging: PagingQuery;
	sort: { column: string; direction: SortDirection; sql: string };
}

export interface EmployeePaymentDetailQuery {
	range: DateRangeQuery;
	paging: PagingQuery;
}

/* ------------------------------------------------------------------ */
/* CTEs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Non-void payments in the range, already narrowed by the employee filters.
 *
 * `$1`/`$2` are the dates for every query in this model, so filter parameters
 * always start at `$3`. `extra_amount` is `COALESCE`d here so no downstream sum
 * has to remember it is nullable.
 */
const PAYMENTS_CTE = `payments AS (
	SELECT ep.payment_id,
	       ep.employee_id,
	       ep.payment_amount,
	       COALESCE(ep.extra_amount, 0) AS extra_amount,
	       ep.payment_type,
	       COALESCE(ep.is_paid, false) AS is_paid,
	       ep.issued_timestamp
	FROM EmployeePayment ep
	JOIN Employee e ON e.employee_id = ep.employee_id
	WHERE ep.is_void = false
	  AND ep.issued_timestamp >= $1::date
	  AND ep.issued_timestamp < ($2::date + ${END_EXCLUSIVE_OFFSET})
	  FILTERS_PLACEHOLDER
)`;

/**
 * Deductions **per employee for the whole period** (rule 1).
 *
 * Deliberately not joined to `payments`: one row per employee is what makes it
 * impossible to count the same deduction twice.
 */
const DEDUCTIONS_CTE = `deductions AS (
	SELECT ec.employee_id,
	       COALESCE(SUM(ec.pay_deduction), 0) AS total_deductions
	FROM EmployeeClockIn ec
	WHERE ec.clock_in >= $1::date
	  AND ec.clock_in < ($2::date + ${END_EXCLUSIVE_OFFSET})
	  AND COALESCE(ec.pay_deduction, 0) > 0
	GROUP BY ec.employee_id
)`;

/**
 * Per-employee roll-up over `payments`.
 *
 * `net_payment` is computed once, here, so the list column, the KPI strip and
 * the export row are literally the same expression.
 */
const AGG_CTE = `agg AS (
	SELECT p.employee_id,
	       COUNT(*)::int AS payment_count,
	       COALESCE(SUM(p.payment_amount), 0) AS total_base_pay,
	       COALESCE(SUM(p.extra_amount), 0) AS total_extra_pay,
	       COALESCE(SUM(CASE WHEN p.is_paid THEN p.payment_amount + p.extra_amount ELSE 0 END), 0) AS total_paid,
	       COALESCE(SUM(CASE WHEN p.is_paid THEN 0 ELSE p.payment_amount + p.extra_amount END), 0) AS total_unpaid,
	       COALESCE(d.total_deductions, 0) AS total_deductions,
	       COALESCE(SUM(p.payment_amount), 0)
	         + COALESCE(SUM(p.extra_amount), 0)
	         - COALESCE(d.total_deductions, 0) AS net_payment
	FROM payments p
	LEFT JOIN deductions d ON d.employee_id = p.employee_id
	GROUP BY p.employee_id, d.total_deductions
)`;

/** Employee columns shared by the list and the export. */
const ROW_SELECT = `e.employee_id,
	e.name AS employee_name,
	e.employee_type::text AS employee_type,
	e.hire_date,
	agg.payment_count,
	agg.total_base_pay,
	agg.total_extra_pay,
	agg.total_deductions,
	agg.total_paid,
	agg.total_unpaid,
	agg.net_payment`;

const ROW_FROM = `FROM agg
	JOIN Employee e ON e.employee_id = agg.employee_id`;

/**
 * Builds the filter fragment appended to `payments`.
 *
 * The employee-type filter is applied **inside** `payments`, so the list, the
 * summary and both charts describe exactly the same population — the legacy
 * page filtered the employee list but charted every payment.
 */
function buildFilters(filters: EmployeePaymentFilters): {
	sql: string;
	params: unknown[];
} {
	const params: unknown[] = [filters.range.startDate, filters.range.endDate];
	const conditions: string[] = [];

	if (filters.employeeType === "other") {
		conditions.push(`e.employee_type::text NOT IN ('doctor', 'nurse')`);
	} else if (filters.employeeType !== "all") {
		params.push(filters.employeeType);
		conditions.push(`e.employee_type::text = $${params.length}`);
	}

	if (filters.employeeId !== null) {
		params.push(filters.employeeId);
		conditions.push(`e.employee_id = $${params.length}`);
	}

	if (filters.search) {
		params.push(likePattern(filters.search));
		conditions.push(`e.name ILIKE $${params.length}`);
	}

	return {
		sql: conditions.length > 0 ? `AND ${conditions.join("\n\t  AND ")}` : "",
		params,
	};
}

function paymentsCte(filters: EmployeePaymentFilters): {
	cte: string;
	params: unknown[];
} {
	const { sql, params } = buildFilters(filters);
	return { cte: PAYMENTS_CTE.replace("FILTERS_PLACEHOLDER", sql), params };
}

/* ------------------------------------------------------------------ */
/* Bucket SQL (timeline)                                               */
/* ------------------------------------------------------------------ */

interface BucketPlan {
	from: string;
	to: string;
	step: string;
}

/** Same truncation rule as the statistics tab, so the two timelines match. */
function bucketPlan(grouping: ReportGrouping): BucketPlan {
	switch (grouping) {
		case "year":
			return {
				from: "date_trunc('year', $1::date)",
				to: "date_trunc('year', $2::date)",
				step: "INTERVAL '1 year'",
			};
		case "month":
			return {
				from: "date_trunc('month', $1::date)",
				to: "date_trunc('month', $2::date)",
				step: "INTERVAL '1 month'",
			};
		default:
			return {
				from: "$1::date",
				to: "$2::date",
				step: "INTERVAL '1 day'",
			};
	}
}

function bucketsCte(grouping: ReportGrouping): string {
	const plan = bucketPlan(grouping);
	return `buckets AS (
	SELECT b AS bucket_start,
	       b + ${plan.step} AS bucket_end
	FROM generate_series(${plan.from}, ${plan.to}, ${plan.step}) AS b
)`;
}

/**
 * The chart x label for a bucket: `YYYY-MM-DD`, `YYYY-MM` or `YYYY`.
 *
 * Built from the components Postgres returned rather than from a JS `Date`,
 * because `pg` deserializes `timestamp` in the server's local zone and a UTC
 * read would shift a bucket across midnight.
 */
function periodOf(
	row: { day_label: string; year: number; month: number },
	grouping: ReportGrouping
): string {
	if (grouping === "year") return String(Number(row.year) || 0);
	if (grouping === "month") {
		return `${Number(row.year) || 0}-${String(Number(row.month) || 0).padStart(2, "0")}`;
	}
	return row.day_label;
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

function toSummary(raw: Record<string, unknown>): EmployeePaymentSummary {
	const base = roundTo(raw.total_base_pay, 2);
	const extra = roundTo(raw.total_extra_pay, 2);
	const deductions = roundTo(raw.total_deductions, 2);

	return {
		total_employees: Number(raw.total_employees ?? 0),
		total_payments: Number(raw.total_payments ?? 0),
		total_base_pay: base,
		total_extra_pay: extra,
		total_deductions: deductions,
		total_paid: roundTo(raw.total_paid, 2),
		total_unpaid: roundTo(raw.total_unpaid, 2),
		// Derived from the same three totals the cards show: a fourth
		// aggregate could round differently and print a net that does not add up.
		total_net: roundTo(base + extra - deductions, 2),
	};
}

/**
 * The envelope summary, folded from the same rows the export prints.
 *
 * Uses the identical arithmetic as `toSummary` (net = base + extra −
 * deductions) so the cover page and the tables can never drift apart.
 */
function summariseRows(rows: EmployeePaymentRow[]): EmployeePaymentSummary {
	const totals = rows.reduce(
		(acc, row) => ({
			payments: acc.payments + row.payment_count,
			base: acc.base + row.total_base_pay,
			extra: acc.extra + row.total_extra_pay,
			deductions: acc.deductions + row.total_deductions,
			paid: acc.paid + row.total_paid,
			unpaid: acc.unpaid + row.total_unpaid,
		}),
		{ payments: 0, base: 0, extra: 0, deductions: 0, paid: 0, unpaid: 0 }
	);

	const base = roundTo(totals.base, 2);
	const extra = roundTo(totals.extra, 2);
	const deductions = roundTo(totals.deductions, 2);

	return {
		total_employees: rows.length,
		total_payments: totals.payments,
		total_base_pay: base,
		total_extra_pay: extra,
		total_deductions: deductions,
		total_paid: roundTo(totals.paid, 2),
		total_unpaid: roundTo(totals.unpaid, 2),
		total_net: roundTo(base + extra - deductions, 2),
	};
}

function toRow(raw: Record<string, unknown>): EmployeePaymentRow {
	return {
		employee_id: Number(raw.employee_id),
		employee_name: String(raw.employee_name ?? ""),
		employee_type: String(raw.employee_type ?? "other"),
		hire_date: toDbDateOnly(raw.hire_date),
		payment_count: Number(raw.payment_count ?? 0),
		total_base_pay: roundTo(raw.total_base_pay, 2),
		total_extra_pay: roundTo(raw.total_extra_pay, 2),
		total_deductions: roundTo(raw.total_deductions, 2),
		total_paid: roundTo(raw.total_paid, 2),
		total_unpaid: roundTo(raw.total_unpaid, 2),
		net_payment: roundTo(raw.net_payment, 2),
	};
}

function toDetailRow(raw: Record<string, unknown>): EmployeePaymentDetailRow {
	return {
		payment_id: Number(raw.payment_id),
		payment_date: toTimestampString(raw.payment_date) ?? "",
		payment_amount: roundTo(raw.payment_amount, 2),
		extra_amount: roundTo(raw.extra_amount, 2),
		extra_payment_type:
			raw.extra_payment_type == null ? null : String(raw.extra_payment_type),
		payment_type: String(raw.payment_type ?? "manual"),
		percentage_scope:
			raw.percentage_scope == null ? null : String(raw.percentage_scope),
		is_paid: Boolean(raw.is_paid),
		paid_timestamp: toTimestampString(raw.paid_timestamp),
		paid_by: raw.paid_by == null ? null : String(raw.paid_by),
		patient_count: Number(raw.patient_count ?? 0),
	};
}

function toBreakdown(raw: Record<string, unknown>): EmployeePaymentBreakdown {
	return {
		base_pay: roundTo(raw.base_pay, 2),
		base_extra_amount: roundTo(raw.base_extra_amount, 2),
		base_extra_payment_type:
			raw.base_extra_payment_type == null
				? null
				: String(raw.base_extra_payment_type),
		per_patient_payment_type:
			raw.per_patient_payment_type == null
				? null
				: String(raw.per_patient_payment_type),
		percentage_scope:
			raw.percentage_scope == null ? null : String(raw.percentage_scope),
		need_clock_in: Boolean(raw.need_clock_in),
		shift_type: raw.shift_type == null ? null : String(raw.shift_type),
		shift_start_time:
			raw.shift_start_time == null ? null : String(raw.shift_start_time),
		shift_end_time:
			raw.shift_end_time == null ? null : String(raw.shift_end_time),
		total_work_days: Number(raw.total_work_days ?? 0),
		total_patients_served: Number(raw.total_patients_served ?? 0),
	};
}

function toAssociation(raw: Record<string, unknown>): PaymentAssociationRow {
	return {
		payment_patient_id: Number(raw.payment_patient_id),
		patient_id: Number(raw.patient_id),
		patient_name: String(raw.patient_name ?? ""),
		patient_history_id:
			raw.patient_history_id == null ? null : Number(raw.patient_history_id),
		admission_time: toTimestampString(raw.admission_time),
		discharge_time: toTimestampString(raw.discharge_time),
		diagnosis: raw.diagnosis == null ? null : String(raw.diagnosis),
		work_date: toDbDateOnly(raw.work_date) ?? "",
		hours_worked: roundTo(raw.hours_worked, 2),
		payment_amount: roundTo(raw.payment_amount, 2),
		payment_type: String(raw.payment_type ?? ""),
	};
}

/* ------------------------------------------------------------------ */
/* Statements                                                          */
/* ------------------------------------------------------------------ */

const DETAIL_HEADER_SQL = `SELECT e.employee_id,
	e.name AS employee_name,
	e.employee_type::text AS employee_type,
	e.hire_date,
	COALESCE(e.base_pay, 0) AS base_pay,
	COALESCE(e.extra_amount, 0) AS base_extra_amount,
	e.extra_payment_type AS base_extra_payment_type,
	e.per_patient_payment_type,
	e.percentage_scope::text AS percentage_scope,
	COALESCE(e.need_clock_in, false) AS need_clock_in,
	e.shift_type::text AS shift_type,
	to_char(e.shift_start_time, 'HH24:MI:SS') AS shift_start_time,
	to_char(e.shift_end_time, 'HH24:MI:SS') AS shift_end_time,
	(SELECT COUNT(DISTINCT dsa.work_date)::int
	   FROM DailyStaffAssignment dsa
	  WHERE dsa.employee_id = e.employee_id
	    AND dsa.work_date >= $2::date
	    AND dsa.work_date < ($3::date + ${END_EXCLUSIVE_OFFSET})) AS total_work_days,
	(SELECT COUNT(DISTINCT dsa.patient_id)::int
	   FROM DailyStaffAssignment dsa
	  WHERE dsa.employee_id = e.employee_id
	    AND dsa.work_date >= $2::date
	    AND dsa.work_date < ($3::date + ${END_EXCLUSIVE_OFFSET})) AS total_patients_served,
	(SELECT COUNT(*)::int
	   FROM EmployeePayment ep
	  WHERE ep.employee_id = e.employee_id
	    AND ep.is_void = false
	    AND ep.issued_timestamp >= $2::date
	    AND ep.issued_timestamp < ($3::date + ${END_EXCLUSIVE_OFFSET})) AS total_payments,
	(SELECT COALESCE(SUM(ep.payment_amount), 0)
	   FROM EmployeePayment ep
	  WHERE ep.employee_id = e.employee_id
	    AND ep.is_void = false
	    AND ep.issued_timestamp >= $2::date
	    AND ep.issued_timestamp < ($3::date + ${END_EXCLUSIVE_OFFSET})) AS total_base_pay,
	(SELECT COALESCE(SUM(COALESCE(ep.extra_amount, 0)), 0)
	   FROM EmployeePayment ep
	  WHERE ep.employee_id = e.employee_id
	    AND ep.is_void = false
	    AND ep.issued_timestamp >= $2::date
	    AND ep.issued_timestamp < ($3::date + ${END_EXCLUSIVE_OFFSET})) AS total_extra_pay,
	(SELECT COALESCE(SUM(ep.payment_amount + COALESCE(ep.extra_amount, 0)), 0)
	   FROM EmployeePayment ep
	  WHERE ep.employee_id = e.employee_id
	    AND ep.is_void = false
	    AND ep.is_paid = true
	    AND ep.issued_timestamp >= $2::date
	    AND ep.issued_timestamp < ($3::date + ${END_EXCLUSIVE_OFFSET})) AS total_paid,
	(SELECT COALESCE(SUM(ep.payment_amount + COALESCE(ep.extra_amount, 0)), 0)
	   FROM EmployeePayment ep
	  WHERE ep.employee_id = e.employee_id
	    AND ep.is_void = false
	    AND ep.is_paid = false
	    AND ep.issued_timestamp >= $2::date
	    AND ep.issued_timestamp < ($3::date + ${END_EXCLUSIVE_OFFSET})) AS total_unpaid,
	(SELECT COALESCE(SUM(ec.pay_deduction), 0)
	   FROM EmployeeClockIn ec
	  WHERE ec.employee_id = e.employee_id
	    AND ec.clock_in >= $2::date
	    AND ec.clock_in < ($3::date + ${END_EXCLUSIVE_OFFSET})
	    AND COALESCE(ec.pay_deduction, 0) > 0) AS total_deductions
FROM Employee e
WHERE e.employee_id = $1`;

/** One page of payments, `COUNT(*) OVER()` for the footer. */
const DETAIL_PAYMENTS_SQL = `SELECT ep.payment_id,
	ep.issued_timestamp AS payment_date,
	ep.payment_amount,
	COALESCE(ep.extra_amount, 0) AS extra_amount,
	ep.extra_payment_type,
	ep.payment_type,
	ep.percentage_scope::text AS percentage_scope,
	COALESCE(ep.is_paid, false) AS is_paid,
	ep.paid_timestamp,
	u.username AS paid_by,
	(SELECT COUNT(*)::int
	   FROM EmployeePaymentPatient epp
	  WHERE epp.payment_id = ep.payment_id) AS patient_count,
	COUNT(*) OVER() AS total_count
FROM EmployeePayment ep
LEFT JOIN "User" u ON u.user_id = ep.paid_by_user_id
WHERE ep.employee_id = $1
  AND ep.is_void = false
  AND ep.issued_timestamp >= $2::date
  AND ep.issued_timestamp < ($3::date + ${END_EXCLUSIVE_OFFSET})
ORDER BY ep.issued_timestamp DESC, ep.payment_id DESC
LIMIT $4 OFFSET $5`;

/** Deductions that actually reduced pay, for one employee or many. */
const DEDUCTIONS_SQL = `SELECT ec.employee_id,
	ec.clock_id,
	ec.clock_in,
	ec.clock_out,
	COALESCE(ec.pay_deduction, 0) AS pay_deduction,
	EXTRACT(EPOCH FROM (ec.clock_out - ec.clock_in)) / 3600.0 AS hours_worked
FROM EmployeeClockIn ec
WHERE ec.employee_id = ANY($1::int[])
  AND ec.clock_in >= $2::date
  AND ec.clock_in < ($3::date + ${END_EXCLUSIVE_OFFSET})
  AND COALESCE(ec.pay_deduction, 0) > 0
ORDER BY ec.clock_in DESC, ec.clock_id DESC`;

const ASSOCIATIONS_SQL = `SELECT epp.payment_patient_id,
	epp.patient_id,
	p.name AS patient_name,
	epp.patient_history_id,
	ph.admission_time,
	ph.discharge_time,
	ph.diagnosis,
	epp.work_date,
	COALESCE(epp.hours_worked, 0) AS hours_worked,
	epp.payment_amount,
	epp.payment_type
FROM EmployeePaymentPatient epp
JOIN Patient p ON p.patient_id = epp.patient_id
LEFT JOIN PatientHistory ph ON ph.patient_history_id = epp.patient_history_id
WHERE epp.payment_id = $1
ORDER BY epp.work_date DESC, epp.payment_patient_id ASC`;

/**
 * Every payment of the given employees **with its associations**, one statement.
 *
 * Used by the export only: the detail dialog expands one payment at a time and
 * asks `ASSOCIATIONS_SQL` for it. Joining here instead of issuing a query per
 * payment is what keeps the export fixed-cost.
 */
const EXPORT_PAYMENTS_SQL = `SELECT ep.employee_id,
	ep.payment_id,
	ep.issued_timestamp AS payment_date,
	ep.payment_amount,
	COALESCE(ep.extra_amount, 0) AS extra_amount,
	ep.extra_payment_type,
	ep.payment_type,
	ep.percentage_scope::text AS percentage_scope,
	COALESCE(ep.is_paid, false) AS is_paid,
	ep.paid_timestamp,
	u.username AS paid_by,
	epp.payment_patient_id,
	epp.patient_id,
	p.name AS patient_name,
	epp.patient_history_id,
	ph.admission_time,
	ph.discharge_time,
	ph.diagnosis,
	epp.work_date,
	epp.hours_worked,
	epp.payment_amount AS association_amount,
	epp.payment_type AS association_type
FROM EmployeePayment ep
LEFT JOIN "User" u ON u.user_id = ep.paid_by_user_id
LEFT JOIN EmployeePaymentPatient epp ON epp.payment_id = ep.payment_id
LEFT JOIN Patient p ON p.patient_id = epp.patient_id
LEFT JOIN PatientHistory ph ON ph.patient_history_id = epp.patient_history_id
WHERE ep.employee_id = ANY($1::int[])
  AND ep.is_void = false
  AND ep.issued_timestamp >= $2::date
  AND ep.issued_timestamp < ($3::date + ${END_EXCLUSIVE_OFFSET})
ORDER BY ep.employee_id ASC, ep.issued_timestamp DESC, ep.payment_id DESC,
         epp.work_date DESC, epp.payment_patient_id ASC`;

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export default class EmployeePaymentReportModel {
	/* -------------------------------------------------------------- */
	/* List + charts                                                   */
	/* -------------------------------------------------------------- */

	/**
	 * One page of employees with a payment in range, plus the summary and both
	 * chart series over the **whole** filtered set.
	 *
	 * Four statements in parallel; an employee with no in-range payment has no
	 * row in `agg` and is therefore excluded without a `HAVING`.
	 */
	static async listEmployeePayments(
		input: EmployeePaymentListQuery
	): Promise<EmployeePaymentReportDTO> {
		const { cte, params } = paymentsCte(input);

		const pageSql = `WITH ${cte},
			${DEDUCTIONS_CTE},
			${AGG_CTE}
			SELECT ${ROW_SELECT}
			${ROW_FROM}
			ORDER BY ${input.sort.sql}, e.name ASC, e.employee_id ASC
			LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

		const [pageResult, summary, charts] = await Promise.all([
			query(pageSql, [...params, input.paging.limit, input.paging.offset]),
			EmployeePaymentReportModel.getSummary(input),
			EmployeePaymentReportModel.getCharts(input),
		]);

		return {
			summary,
			charts,
			data: pageResult.rows.map(toRow),
			// The summary count is authoritative: the KPI card and the footer
			// must agree even when an out-of-range page returns no rows.
			total: summary.total_employees,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/** Summary over the whole filtered set (never just the page). */
	static async getSummary(
		filters: EmployeePaymentFilters
	): Promise<EmployeePaymentSummary> {
		const { cte, params } = paymentsCte(filters);

		const sql = `WITH ${cte},
			${DEDUCTIONS_CTE},
			${AGG_CTE}
			SELECT (SELECT COUNT(*)::int FROM agg) AS total_employees,
			       (SELECT COALESCE(SUM(payment_count), 0)::int FROM agg) AS total_payments,
			       (SELECT COALESCE(SUM(total_base_pay), 0) FROM agg) AS total_base_pay,
			       (SELECT COALESCE(SUM(total_extra_pay), 0) FROM agg) AS total_extra_pay,
			       (SELECT COALESCE(SUM(total_deductions), 0) FROM agg) AS total_deductions,
			       (SELECT COALESCE(SUM(total_paid), 0) FROM agg) AS total_paid,
			       (SELECT COALESCE(SUM(total_unpaid), 0) FROM agg) AS total_unpaid`;

		const { rows } = await query(sql, params);
		return toSummary(rows[0] ?? {});
	}

	/**
	 * The two chart series, over the filtered set.
	 *
	 * Both are **gross** (`payment_amount + extra_amount`): deductions are a
	 * per-employee period total, so spreading them over the timeline would be
	 * an invented attribution.
	 */
	static async getCharts(
		filters: EmployeePaymentFilters
	): Promise<EmployeePaymentCharts> {
		const { cte, params } = paymentsCte(filters);

		const timelineSql = `WITH ${cte},
			${bucketsCte(filters.grouping)}
			SELECT b.bucket_start,
			       to_char(b.bucket_start, 'YYYY-MM-DD') AS day_label,
			       EXTRACT(YEAR FROM b.bucket_start)::int AS year,
			       EXTRACT(MONTH FROM b.bucket_start)::int AS month,
			       COALESCE(SUM(p.payment_amount + p.extra_amount), 0) AS total,
			       COUNT(p.payment_id)::int AS payment_count
			FROM buckets b
			LEFT JOIN payments p
			       ON p.issued_timestamp >= b.bucket_start
			      AND p.issued_timestamp < b.bucket_end
			GROUP BY b.bucket_start
			ORDER BY b.bucket_start`;

		const typeSql = `WITH ${cte}
			SELECT p.payment_type,
			       COALESCE(SUM(p.payment_amount + p.extra_amount), 0) AS total
			FROM payments p
			GROUP BY p.payment_type
			ORDER BY total DESC, p.payment_type ASC`;

		const [timelineResult, typeResult] = await Promise.all([
			query(timelineSql, params),
			query(typeSql, params),
		]);

		return {
			timeline: (timelineResult.rows as Array<Record<string, unknown>>).map(
				(row) => ({
					period: periodOf(
						row as unknown as { day_label: string; year: number; month: number },
						filters.grouping
					),
					total: roundTo(row.total, 2),
				})
			),
			by_type: (typeResult.rows as Array<Record<string, unknown>>).map((row) => ({
				payment_type: String(row.payment_type ?? "manual"),
				total: roundTo(row.total, 2),
			})),
		};
	}

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	/**
	 * One employee: identity, pay configuration, summary, one page of payments
	 * and every period deduction.
	 *
	 * Three queries regardless of how many payments the employee has. The
	 * period deductions are **not** attached to individual payments (rule 1),
	 * which is exactly what the detail dialog states above the table.
	 */
	static async getEmployeeDetail(
		employeeId: number,
		input: EmployeePaymentDetailQuery
	): Promise<EmployeePaymentDetailDTO> {
		const [header, paymentsResult, deductions] = await Promise.all([
			query(DETAIL_HEADER_SQL, [
				employeeId,
				input.range.startDate,
				input.range.endDate,
			]),
			query(DETAIL_PAYMENTS_SQL, [
				employeeId,
				input.range.startDate,
				input.range.endDate,
				input.paging.limit,
				input.paging.offset,
			]),
			query(DEDUCTIONS_SQL, [
				[employeeId],
				input.range.startDate,
				input.range.endDate,
			]),
		]);

		if (header.rows.length === 0) {
			throw new NotFoundError(`Employee ${employeeId} not found`);
		}

		const raw = header.rows[0] as Record<string, unknown>;
		const breakdown = toBreakdown(raw);
		const base = roundTo(raw.total_base_pay, 2);
		const extra = roundTo(raw.total_extra_pay, 2);
		const deductionsTotal = roundTo(raw.total_deductions, 2);

		const payments = stripWindowTotal(
			paymentsResult.rows as Array<Record<string, unknown>>
		).map(toDetailRow);

		return {
			employee: {
				employee_id: Number(raw.employee_id),
				employee_name: String(raw.employee_name ?? ""),
				employee_type: String(raw.employee_type ?? "other"),
				hire_date: toDbDateOnly(raw.hire_date),
			},
			breakdown,
			summary: {
				total_payments: Number(raw.total_payments ?? 0),
				total_base_pay: base,
				total_extra_pay: extra,
				total_deductions: deductionsTotal,
				total_paid: roundTo(raw.total_paid, 2),
				total_unpaid: roundTo(raw.total_unpaid, 2),
				net_payment: roundTo(base + extra - deductionsTotal, 2),
			},
			payments,
			period_deductions: EmployeePaymentReportModel.mapDeductions(
				deductions.rows as Array<Record<string, unknown>>,
				breakdown
			),
			total: readWindowTotal(paymentsResult.rows as Array<Record<string, unknown>>),
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/**
	 * The patient work behind one payment — the dialog's expandable row.
	 *
	 * One statement, deterministic order (`work_date DESC`, then id), so the
	 * expansion does not reshuffle between renders.
	 *
	 * The associations belong to the **payment**, not to the report window:
	 * filtering them by the selected range would print a payment whose patient
	 * work appears empty, which misstates the payment.
	 */
	static async getPaymentAssociations(
		employeeId: number,
		paymentId: number
	): Promise<EmployeePaymentAssociationsDTO> {
		const paymentResult = await query(
			`SELECT ep.payment_id,
				ep.issued_timestamp AS payment_date,
				ep.payment_amount,
				COALESCE(ep.extra_amount, 0) AS extra_amount,
				ep.extra_payment_type,
				ep.payment_type,
				ep.percentage_scope::text AS percentage_scope,
				COALESCE(ep.is_paid, false) AS is_paid,
				ep.paid_timestamp,
				u.username AS paid_by,
				(SELECT COUNT(*)::int
				   FROM EmployeePaymentPatient epp
				  WHERE epp.payment_id = ep.payment_id) AS patient_count
			FROM EmployeePayment ep
			LEFT JOIN "User" u ON u.user_id = ep.paid_by_user_id
			WHERE ep.payment_id = $1
			  AND ep.employee_id = $2
			  AND ep.is_void = false`,
			[paymentId, employeeId]
		);

		if (paymentResult.rows.length === 0) {
			throw new NotFoundError(
				`Payment ${paymentId} not found for employee ${employeeId}`
			);
		}

		const { rows } = await query(ASSOCIATIONS_SQL, [paymentId]);

		return {
			payment: toDetailRow(paymentResult.rows[0] as Record<string, unknown>),
			associations: rows.map(toAssociation),
		};
	}

	/**
	 * Maps clock-in rows to deduction rows and derives the attendance status.
	 *
	 * Status comes from `clockStatusFor` (shared with the clock-in report,
	 * contract 51) so "late" means the same thing in both tabs.
	 */
	private static mapDeductions(
		rows: Array<Record<string, unknown>>,
		breakdown: EmployeePaymentBreakdown
	): PeriodDeductionRow[] {
		return rows.map((row) => {
			const clockIn = toTimestampString(row.clock_in);
			const clockOut = toTimestampString(row.clock_out);
			// Pass the **raw** timestamps, not the normalized ISO strings: the
			// status compares a wall clock against the employee's local shift,
			// and `toISOString()` has already shifted it to UTC.
			const { status } = clockStatusFor({
				clockIn: row.clock_in,
				clockOut: row.clock_out,
				shiftStart: breakdown.shift_start_time,
				shiftEnd: breakdown.shift_end_time,
				payDeduction: row.pay_deduction,
			});

			return {
				clock_id: Number(row.clock_id),
				clock_in: clockIn ?? "",
				clock_out: clockOut,
				hours_worked: roundTo(row.hours_worked, 2),
				pay_deduction: roundTo(row.pay_deduction, 2),
				status,
			};
		});
	}

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	/**
	 * The whole payroll document: every employee in the filtered set with every
	 * payment, every payment's associations and every period deduction.
	 *
	 * **Five** statements, never one per employee (contract 52): the employee
	 * rows and the chart series, then the pay configuration, then every payment
	 * (with its associations folded in) and every deduction.
	 *
	 * The envelope `summary` is derived from these same `rows` rather than
	 * re-queried: a second aggregate over the same CTEs is one more chance for
	 * the cover page to disagree with the tables printed below it, and the
	 * per-employee roll-up is `totals`, never `summary` (contract 36).
	 */
	static async exportEmployeePayments(
		input: EmployeePaymentFilters & {
			sort: { column: string; direction: SortDirection; sql: string };
		}
	): Promise<EmployeePaymentExportPayload> {
		const { cte, params } = paymentsCte(input);

		const rowsSql = `WITH ${cte},
			${DEDUCTIONS_CTE},
			${AGG_CTE}
			SELECT ${ROW_SELECT}
			${ROW_FROM}
			ORDER BY ${input.sort.sql}, e.name ASC, e.employee_id ASC`;

		const [rowsResult, charts] = await Promise.all([
			query(rowsSql, params),
			EmployeePaymentReportModel.getCharts(input),
		]);

		const rows = rowsResult.rows.map(toRow);
		const employeeIds = rows.map((row) => row.employee_id);

		let paymentsByEmployee = new Map<number, EmployeePaymentExportPayment[]>();
		let deductionsByEmployee = new Map<number, PeriodDeductionRow[]>();
		let breakdowns = new Map<number, EmployeePaymentBreakdown>();

		if (employeeIds.length > 0) {
			// Configuration has to land first: each deduction row's status is
			// derived from the employee's shift, so the deduction query cannot
			// run in the same round as the query that describes the shift.
			breakdowns = await EmployeePaymentReportModel.getBreakdowns(employeeIds);

			[paymentsByEmployee, deductionsByEmployee] = await Promise.all([
				EmployeePaymentReportModel.getExportPayments(employeeIds, input.range),
				EmployeePaymentReportModel.getExportDeductions(
					employeeIds,
					input.range,
					breakdowns
				),
			]);
		}

		const data: EmployeePaymentExportRow[] = rows.map((row) => ({
			employee_id: row.employee_id,
			employee_name: row.employee_name,
			employee_type: row.employee_type,
			hire_date: row.hire_date,
			totals: {
				payments: row.payment_count,
				base_pay: row.total_base_pay,
				extra_pay: row.total_extra_pay,
				deductions: row.total_deductions,
				paid: row.total_paid,
				unpaid: row.total_unpaid,
				net: row.net_payment,
			},
			breakdown:
				breakdowns.get(row.employee_id) ?? {
					base_pay: 0,
					base_extra_amount: 0,
					base_extra_payment_type: null,
					per_patient_payment_type: null,
					percentage_scope: null,
					need_clock_in: false,
					shift_type: null,
					shift_start_time: null,
					shift_end_time: null,
					total_work_days: 0,
					total_patients_served: 0,
				},
			payments: paymentsByEmployee.get(row.employee_id) ?? [],
			period_deductions: deductionsByEmployee.get(row.employee_id) ?? [],
		}));

		return {
			generated_at: new Date().toISOString(),
			range: {
				start_date: input.range.startDate,
				end_date: input.range.endDate,
			},
			grouping: input.grouping,
			summary: summariseRows(rows),
			charts,
			data,
		};
	}

	/**
	 * Every payment of the given employees with its associations folded in.
	 *
	 * One statement; rows arrive ordered by employee and payment so the grouping
	 * below preserves that order without a second sort.
	 */
	private static async getExportPayments(
		employeeIds: number[],
		range: DateRangeQuery
	): Promise<Map<number, EmployeePaymentExportPayment[]>> {
		const byEmployee = new Map<number, EmployeePaymentExportPayment[]>();
		if (employeeIds.length === 0) return byEmployee;

		const { rows } = await query(EXPORT_PAYMENTS_SQL, [
			employeeIds,
			range.startDate,
			range.endDate,
		]);

		const byPayment = new Map<number, EmployeePaymentExportPayment>();

		for (const raw of rows as Array<Record<string, unknown>>) {
			const employeeId = Number(raw.employee_id);
			const paymentId = Number(raw.payment_id);

			let payment = byPayment.get(paymentId);
			if (!payment) {
				payment = {
					...toDetailRow({
						...raw,
						// `patient_count` is derived below from the joined rows so
						// the export and the detail dialog agree on the number.
						patient_count: 0,
					}),
					associations: [],
				};
				byPayment.set(paymentId, payment);

				const list = byEmployee.get(employeeId);
				if (list) list.push(payment);
				else byEmployee.set(employeeId, [payment]);
			}

			// `LEFT JOIN` means a payment with no patient work yields one row
			// with null association columns.
			if (raw.payment_patient_id != null) {
				payment.associations.push(
					toAssociation({
						payment_patient_id: raw.payment_patient_id,
						patient_id: raw.patient_id,
						patient_name: raw.patient_name,
						patient_history_id: raw.patient_history_id,
						admission_time: raw.admission_time,
						discharge_time: raw.discharge_time,
						diagnosis: raw.diagnosis,
						work_date: raw.work_date,
						hours_worked: raw.hours_worked,
						payment_amount: raw.association_amount,
						payment_type: raw.association_type,
					})
				);
			}
		}

		for (const payment of byPayment.values()) {
			payment.patient_count = payment.associations.length;
		}

		return byEmployee;
	}

	/**
	 * Every deduction of the given employees — one statement.
	 *
	 * `breakdowns` is passed in rather than fetched here: the caller already
	 * needed it, and a nested fetch would make the export's query count depend
	 * on how the helpers happen to be factored.
	 */
	private static async getExportDeductions(
		employeeIds: number[],
		range: DateRangeQuery,
		breakdowns: Map<number, EmployeePaymentBreakdown>
	): Promise<Map<number, PeriodDeductionRow[]>> {
		const byEmployee = new Map<number, PeriodDeductionRow[]>();
		if (employeeIds.length === 0) return byEmployee;

		const deductions = await query(DEDUCTIONS_SQL, [
			employeeIds,
			range.startDate,
			range.endDate,
		]);

		const byId = new Map<number, Array<Record<string, unknown>>>();
		for (const row of deductions.rows as Array<Record<string, unknown>>) {
			const employeeId = Number(row.employee_id);
			const list = byId.get(employeeId);
			if (list) list.push(row);
			else byId.set(employeeId, [row]);
		}

		for (const [employeeId, rows] of byId) {
			const breakdown = breakdowns.get(employeeId);
			byEmployee.set(
				employeeId,
				EmployeePaymentReportModel.mapDeductions(
					rows,
					breakdown ?? {
						base_pay: 0,
						base_extra_amount: 0,
						base_extra_payment_type: null,
						per_patient_payment_type: null,
						percentage_scope: null,
						need_clock_in: false,
						shift_type: null,
						shift_start_time: null,
						shift_end_time: null,
						total_work_days: 0,
						total_patients_served: 0,
					}
				)
			);
		}

		return byEmployee;
	}

	/**
	 * Pay configuration for the given employees — one statement.
	 *
	 * Needed by the export to label each deduction's status with the same shift
	 * the detail dialog uses; without it the export would have to guess.
	 */
	private static async getBreakdowns(
		employeeIds: number[]
	): Promise<Map<number, EmployeePaymentBreakdown>> {
		const byEmployee = new Map<number, EmployeePaymentBreakdown>();
		if (employeeIds.length === 0) return byEmployee;

		const { rows } = await query(
			`SELECT e.employee_id,
				COALESCE(e.base_pay, 0) AS base_pay,
				COALESCE(e.extra_amount, 0) AS base_extra_amount,
				e.extra_payment_type AS base_extra_payment_type,
				e.per_patient_payment_type,
				e.percentage_scope::text AS percentage_scope,
				COALESCE(e.need_clock_in, false) AS need_clock_in,
				e.shift_type::text AS shift_type,
				to_char(e.shift_start_time, 'HH24:MI:SS') AS shift_start_time,
				to_char(e.shift_end_time, 'HH24:MI:SS') AS shift_end_time,
				0 AS total_work_days,
				0 AS total_patients_served
			FROM Employee e
			WHERE e.employee_id = ANY($1::int[])`,
			[employeeIds]
		);

		for (const row of rows as Array<Record<string, unknown>>) {
			byEmployee.set(Number(row.employee_id), toBreakdown(row));
		}

		return byEmployee;
	}
}
