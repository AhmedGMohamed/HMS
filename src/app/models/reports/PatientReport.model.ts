/**
 * Patient report — Phase 6.11.1.
 *
 * Replaces the legacy `Report.model.getPatientReports` / `getPatientReportFormatted`
 * pair, which ran **one query per patient** (and then three more per
 * admission). The v2 model is fixed-cost:
 *
 *   - `listPatients`: 2 queries (page + summary) over one CTE. Both share
 *     `buildAggregateCte` so the page and the summary can never disagree
 *     about which patients matched.
 *   - `exportPatients`: 5 queries — the same page + summary, then the
 *     admissions, their bill details and the daily staff for **all** exported
 *     patients at once (`ANY(patientIds)`), because the export document
 *     carries every admission in full.
 *   - `getPatientDetail`: exactly 3 queries — (1) patient + admissions,
 *     (2) every `BillDetail` row for those bills, (3) the patient's
 *     `DailyStaffAssignment` rows. Grouping happens in JS.
 *
 * Money: `Bill.total_amount` is authoritative (§3.7 of the phase record) —
 * it is what the patient was billed and what `paid_amount` is reconciled
 * against. The component breakdown (`calculateBillFinancials`) is derived for
 * display only and never overrides the stored total.
 *
 * Dates: admissions are filtered with the half-open timestamp window
 * `[start_date, end_date + 1 day)` — never `BETWEEN` — so an admission at
 * 13:00 on the end date is included.
 */

import {
	calculateBillFinancials,
	roundMoney,
	toMoneyNumber,
} from "../../utils/billFinancials.js";
import { parseEgyptianNationalId } from "../../utils/nationalId.js";
import type {
	PatientReportAdmission,
	PatientReportDetailDTO,
	PatientReportExportRow,
	PatientReportItem,
	PatientReportItemGroup,
	PatientReportRow,
	PatientReportStaffDay,
	PatientReportStaffMember,
	PatientReportSummary,
	ReportExportEnvelope,
	ReportListEnvelope,
} from "../../utils/types/reportV2.js";
import { query } from "../database/connection.js";
import {
	END_EXCLUSIVE_OFFSET,
	NotFoundError,
	type DateRangeQuery,
	type PagingQuery,
	type SortDirection,
	likePattern,
	toDbDateOnly,
	toTimestampString,
} from "./shared.js";

/** Sort keys the list endpoint accepts (`?sort=`). */
export const PATIENT_SORT_COLUMNS = {
	name: "p.name",
	admissions: "a.admissions_count",
	first_admission: "a.first_admission",
	last_admission: "a.last_admission",
	total_billed: "a.total_billed",
	total_paid: "a.total_paid",
	outstanding: "(a.total_billed - a.total_paid)",
} as const;

export type PatientSortColumn = keyof typeof PATIENT_SORT_COLUMNS;

export interface PatientReportFilters {
	range: DateRangeQuery;
	/** `null` = all payment types. */
	paymentType: string | null;
	/** Only applied when `paymentType === "insurance"` (legacy parity). */
	insuranceId: number | null;
	/** Matches patient name, national id or phone. */
	search: string | null;
}

export interface PatientReportListQuery extends PatientReportFilters {
	paging: PagingQuery;
	sort: { column: string; direction: SortDirection; sql: string };
}

/* ------------------------------------------------------------------ */
/* CTE + filter builder                                                */
/* ------------------------------------------------------------------ */

interface AggregateSql {
	cte: string;
	where: string;
	params: unknown[];
}

/**
 * Builds the admissions CTE, the per-patient aggregate and the filter clause.
 *
 * `$1` = start date, `$2` = end date, then one parameter per active filter —
 * the same array is reused by the page query, the summary query and the
 * export query, so a filter can never be applied to one and forgotten in
 * another.
 */
export function buildAggregateCte(filters: PatientReportFilters): AggregateSql {
	const params: unknown[] = [filters.range.startDate, filters.range.endDate];
	const conditions: string[] = [];

	if (filters.paymentType && filters.paymentType !== "all") {
		params.push(filters.paymentType);
		conditions.push(`p.payment_type = $${params.length}`);
	}

	if (filters.insuranceId) {
		params.push(filters.insuranceId);
		conditions.push(`p.insurance_id = $${params.length}`);
	}

	if (filters.search) {
		params.push(likePattern(filters.search));
		const index = params.length;
		conditions.push(
			`(p.name ILIKE $${index} OR p.national_id ILIKE $${index} OR p.phone ILIKE $${index})`
		);
	}

	const cte = `
		WITH admissions AS (
			SELECT ph.patient_id,
			       ph.patient_history_id,
			       ph.admission_time,
			       ph.discharge_time,
			       ph.bill_id,
			       COALESCE(b.total_amount, 0) AS billed,
			       COALESCE(b.paid_amount, 0) AS paid
			FROM PatientHistory ph
			LEFT JOIN Bill b ON b.bill_id = ph.bill_id
			WHERE ph.admission_time >= $1::date
			  AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})
		),
		agg AS (
			SELECT patient_id,
			       COUNT(*)::int AS admissions_count,
			       MIN(admission_time) AS first_admission,
			       MAX(admission_time) AS last_admission,
			       COALESCE(BOOL_OR(discharge_time IS NULL), false) AS has_active_admission,
			       COALESCE(SUM(billed), 0) AS total_billed,
			       COALESCE(SUM(paid), 0) AS total_paid
			FROM admissions
			GROUP BY patient_id
		)`;

	return {
		cte,
		where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
		params,
	};
}

/** `FROM agg` join block shared by the page, summary and export queries. */
const AGG_FROM = `
		FROM agg a
		JOIN Patient p ON p.patient_id = a.patient_id
		LEFT JOIN InsuranceCompany ic ON ic.insurance_id = p.insurance_id
		LEFT JOIN Doctor d ON d.doctor_id = p.referring_doctor_id
		LEFT JOIN Employee rd ON rd.employee_id = d.doctor_id`;

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

/** Maps one raw aggregate row to the wire shape (money coerced, age derived). */
function toPatientRow(raw: Record<string, unknown>): PatientReportRow {
	const nationalId =
		raw.national_id === null || raw.national_id === undefined
			? null
			: String(raw.national_id);
	const derived = parseEgyptianNationalId(nationalId);

	const totalBilled = toMoneyNumber(raw.total_billed);
	const totalPaid = toMoneyNumber(raw.total_paid);

	return {
		patient_id: Number(raw.patient_id),
		patient_name: String(raw.patient_name ?? ""),
		national_id: nationalId,
		gender: raw.gender == null ? null : String(raw.gender),
		age: raw.age === undefined || raw.age === null ? derived?.age ?? null : Number(raw.age),
		birth_date: raw.birth_date ? toDbDateOnly(raw.birth_date) : derived?.birthDate ?? null,
		phone: raw.phone == null ? null : String(raw.phone),
		address: raw.address == null ? null : String(raw.address),
		payment_type: String(raw.payment_type ?? "cash"),
		insurance_company:
			raw.insurance_company == null ? null : String(raw.insurance_company),
		insurance_form_id:
			raw.insurance_form_id == null ? null : String(raw.insurance_form_id),
		insurance_card_id:
			raw.insurance_card_id == null ? null : String(raw.insurance_card_id),
		referring_doctor_name:
			raw.referring_doctor_name == null
				? null
				: String(raw.referring_doctor_name),
		admissions_count: Number(raw.admissions_count ?? 0),
		first_admission: toTimestampString(raw.first_admission),
		last_admission: toTimestampString(raw.last_admission),
		has_active_admission: Boolean(raw.has_active_admission),
		total_billed: roundMoney(totalBilled),
		total_paid: roundMoney(totalPaid),
		total_outstanding: roundMoney(totalBilled - totalPaid),
	};
}

export default class PatientReportModel {
	/* -------------------------------------------------------------- */
	/* List                                                            */
	/* -------------------------------------------------------------- */

	/**
	 * One page of patients with admissions inside the range, plus the summary
	 * for the **whole** filtered set (not just this page).
	 */
	static async listPatients(
		input: PatientReportListQuery
	): Promise<ReportListEnvelope<PatientReportSummary, PatientReportRow>> {
		const { cte, where, params } = buildAggregateCte(input);

		const pageParams = [...params, input.paging.limit, input.paging.offset];
		const pageSql = `${cte}
			SELECT p.patient_id,
			       p.name AS patient_name,
			       p.national_id,
			       p.gender,
			       p.phone,
			       p.address,
			       p.payment_type,
			       p.insurance_form_id,
			       p.insurance_card_id,
			       ic.name AS insurance_company,
			       rd.name AS referring_doctor_name,
			       a.admissions_count,
			       a.first_admission,
			       a.last_admission,
			       a.has_active_admission,
			       a.total_billed,
			       a.total_paid,
			       (a.total_billed - a.total_paid) AS total_outstanding
			${AGG_FROM}
			${where}
			ORDER BY ${input.sort.sql}, p.patient_id ASC
			LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

		const [pageResult, summary] = await Promise.all([
			query(pageSql, pageParams),
			PatientReportModel.getSummary(input),
		]);

		// `total` comes from the summary, not from `COUNT(*) OVER()`: an
		// out-of-range page has no rows, so the window function would report
		// `0` and the pagination footer would collapse back to page 1.
		// `summary.total_patients` is the count of the whole filtered set by
		// definition, and it is already being fetched.
		return {
			summary,
			data: pageResult.rows.map(toPatientRow),
			total: summary.total_patients,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/**
	 * Every matching patient (no paging) — the export data source.
	 *
	 * Each row also carries **every admission in the range** with its billed
	 * items and daily staff, because the exported report is a full document
	 * rather than the paginated table. Still fixed-cost: 5 queries total
	 * (rows + summary in parallel, then admissions, bill details and staff),
	 * never one per patient.
	 */
	static async exportPatients(
		input: PatientReportFilters & {
			sort: { column: string; direction: SortDirection; sql: string };
		}
	): Promise<ReportExportEnvelope<PatientReportSummary, PatientReportExportRow>> {
		const { cte, where, params } = buildAggregateCte(input);

		const sql = `${cte}
			SELECT p.patient_id,
			       p.name AS patient_name,
			       p.national_id,
			       p.gender,
			       p.phone,
			       p.address,
			       p.payment_type,
			       p.insurance_form_id,
			       p.insurance_card_id,
			       ic.name AS insurance_company,
			       rd.name AS referring_doctor_name,
			       a.admissions_count,
			       a.first_admission,
			       a.last_admission,
			       a.has_active_admission,
			       a.total_billed,
			       a.total_paid,
			       (a.total_billed - a.total_paid) AS total_outstanding
			${AGG_FROM}
			${where}
			ORDER BY ${input.sort.sql}, p.patient_id ASC`;

		const [rowsResult, summary] = await Promise.all([
			query(sql, params),
			PatientReportModel.getSummary(input),
		]);

		const rows = rowsResult.rows.map(toPatientRow);

		return {
			generated_at: new Date().toISOString(),
			range: {
				start_date: input.range.startDate,
				end_date: input.range.endDate,
			},
			summary,
			data: await PatientReportModel.attachAdmissions(rows, input.range),
		};
	}

	/**
	 * Hydrates every exported row with its admissions (items + staff included).
	 *
	 * Three batched queries for the whole document — the same three the detail
	 * endpoint runs for one patient, but scoped to `ANY(patientIds)`.
	 */
	private static async attachAdmissions(
		rows: PatientReportRow[],
		range: DateRangeQuery
	): Promise<PatientReportExportRow[]> {
		if (rows.length === 0) return [];

		const patientIds = rows.map((row) => row.patient_id);
		const admissionRows = await PatientReportModel.getAdmissionsForPatients(
			patientIds,
			range
		);
		const billIds = admissionRows
			.map((row) => row.bill_id)
			.filter((id): id is number => typeof id === "number" && id > 0);

		const [itemsByBill, staffByPatient] = await Promise.all([
			PatientReportModel.getItemsByBill(billIds),
			PatientReportModel.getStaffByPatient(patientIds, range),
		]);

		const byPatient = new Map<number, PatientReportAdmission[]>();
		for (const row of admissionRows) {
			const patientId = Number(row.patient_id);
			const staffByDate =
				staffByPatient.get(patientId) ??
				new Map<string, PatientReportStaffDay>();
			const admission = PatientReportModel.toAdmission(
				row,
				itemsByBill,
				staffByDate
			);
			const list = byPatient.get(patientId);
			if (list) list.push(admission);
			else byPatient.set(patientId, [admission]);
		}

		return rows.map((row) => ({
			...row,
			admissions: byPatient.get(row.patient_id) ?? [],
		}));
	}

	/**
	 * Admissions for a set of patients in one statement.
	 *
	 * `LEFT JOIN` on `Bill` (not `JOIN`) so an admission without a bill still
	 * appears, with `total_amount = null` → the computed breakdown is used.
	 */
	private static async getAdmissionsForPatients(
		patientIds: number[],
		range: DateRangeQuery
	): Promise<Array<Record<string, unknown> & { bill_id: number | null }>> {
		if (patientIds.length === 0) return [];

		const sql = `
			SELECT ph.patient_id,
			       ph.patient_history_id,
			       ph.admission_time,
			       ph.discharge_time,
			       ph.diagnosis,
			       ph.leave_reason,
			       ph.bill_id,
			       b.total_amount,
			       b.paid_amount,
			       b.discount,
			       b.discount_type,
			       b.discount_scope,
			       b.vat_percentage,
			       b.vat_scope_custom,
			       b.administrative_expenses,
			       b.medical_tests_amount
			FROM PatientHistory ph
			LEFT JOIN Bill b ON b.bill_id = ph.bill_id
			WHERE ph.patient_id = ANY($1::int[])
			  AND ph.admission_time >= $2::date
			  AND ph.admission_time < ($3::date + ${END_EXCLUSIVE_OFFSET})
			ORDER BY ph.patient_id, ph.admission_time DESC`;

		const { rows } = await query(sql, [
			patientIds,
			range.startDate,
			range.endDate,
		]);
		return rows;
	}

	/**
	 * Summary over the whole filtered set.
	 *
	 * Deliberately a second aggregate on the same CTE rather than a sum of the
	 * current page: the KPI strip must describe the report, not the page.
	 */
	static async getSummary(
		filters: PatientReportFilters
	): Promise<PatientReportSummary> {
		const { cte, where, params } = buildAggregateCte(filters);

		const sql = `${cte}
			SELECT COUNT(*)::int AS total_patients,
			       COALESCE(SUM(a.admissions_count), 0)::int AS total_admissions,
			       COALESCE(SUM(a.total_billed), 0) AS total_billed,
			       COALESCE(SUM(a.total_paid), 0) AS total_paid,
			       COALESCE(SUM(a.total_billed - a.total_paid), 0) AS total_outstanding
			${AGG_FROM}
			${where}`;

		const { rows } = await query(sql, params);
		const row = rows[0] ?? {};

		return {
			total_patients: Number(row.total_patients ?? 0),
			total_admissions: Number(row.total_admissions ?? 0),
			total_billed: roundMoney(row.total_billed),
			total_paid: roundMoney(row.total_paid),
			total_outstanding: roundMoney(row.total_outstanding),
		};
	}

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	/**
	 * Full patient report for one patient: patient summary, admissions with
	 * their billed items grouped by date, and the daily staff assignments.
	 *
	 * Three queries regardless of how many admissions the patient has.
	 */
	static async getPatientDetail(
		patientId: number,
		range: DateRangeQuery
	): Promise<PatientReportDetailDTO> {
		const admissionsRows = await PatientReportModel.getPatientWithAdmissions(
			patientId,
			range
		);
		if (admissionsRows.length === 0) {
			throw new NotFoundError(`Patient ${patientId} not found`);
		}

		const patientColumns = admissionsRows[0];
		// The join is `LEFT` so an existing patient with no admission in range
		// still yields exactly one row (all admission columns `null`). Those
		// placeholder rows are dropped here rather than turned into a bogus
		// admission — the detail then renders "no admissions in this period".
		const admissionRows = admissionsRows.filter(
			(row) => row.patient_history_id !== null && row.patient_history_id !== undefined
		);
		const billIds = admissionRows
			.map((row) => row.bill_id)
			.filter((id): id is number => typeof id === "number" && id > 0);

		const [itemsByBill, staffByPatient] = await Promise.all([
			PatientReportModel.getItemsByBill(billIds),
			PatientReportModel.getStaffByPatient([patientId], range),
		]);
		const staffByDate =
			staffByPatient.get(patientId) ??
			new Map<string, PatientReportStaffDay>();

		const admissions: PatientReportAdmission[] = admissionRows.map((row) =>
			PatientReportModel.toAdmission(row, itemsByBill, staffByDate)
		);

		const totalBilled = admissions.reduce(
			(sum, admission) => sum + admission.final_total,
			0
		);
		const totalPaid = admissions.reduce(
			(sum, admission) => sum + admission.paid_amount,
			0
		);

		// The summary line mirrors the list row, so drilling in from the table
		// and opening the same patient directly show identical totals.
		const patient: PatientReportRow = toPatientRow({
			...patientColumns,
			admissions_count: admissions.length,
			first_admission: admissions.reduce<string | null>(
				(first, admission) =>
					admission.admission_time && (!first || admission.admission_time < first)
						? admission.admission_time
						: first,
				null
			),
			last_admission: admissions.reduce<string | null>(
				(last, admission) =>
					admission.admission_time && (!last || admission.admission_time > last)
						? admission.admission_time
						: last,
				null
			),
			has_active_admission: admissions.some(
				(admission) => admission.discharge_time === null
			),
			total_billed: totalBilled,
			total_paid: totalPaid,
		});

		return { patient, admissions };
	}

	/** Query 1 — patient columns plus one row per admission in range. */
	private static async getPatientWithAdmissions(
		patientId: number,
		range: DateRangeQuery
	): Promise<Array<Record<string, unknown> & { bill_id: number | null }>> {
		const sql = `
			SELECT p.patient_id,
			       p.name AS patient_name,
			       p.national_id,
			       p.gender,
			       p.phone,
			       p.address,
			       p.payment_type,
			       p.insurance_form_id,
			       p.insurance_card_id,
			       ic.name AS insurance_company,
			       rd.name AS referring_doctor_name,
			       ph.patient_history_id,
			       ph.admission_time,
			       ph.discharge_time,
			       ph.diagnosis,
			       ph.leave_reason,
			       ph.bill_id,
			       b.total_amount,
			       b.paid_amount,
			       b.discount,
			       b.discount_type,
			       b.discount_scope,
			       b.vat_percentage,
			       b.vat_scope_custom,
			       b.administrative_expenses,
			       b.medical_tests_amount
			FROM Patient p
			LEFT JOIN InsuranceCompany ic ON ic.insurance_id = p.insurance_id
			LEFT JOIN Doctor d ON d.doctor_id = p.referring_doctor_id
			LEFT JOIN Employee rd ON rd.employee_id = d.doctor_id
			LEFT JOIN PatientHistory ph
			       ON ph.patient_id = p.patient_id
			      AND ph.admission_time >= $2::date
			      AND ph.admission_time < ($3::date + ${END_EXCLUSIVE_OFFSET})
			LEFT JOIN Bill b ON b.bill_id = ph.bill_id
			WHERE p.patient_id = $1
			ORDER BY ph.admission_time DESC NULLS LAST`;

		const { rows } = await query(sql, [
			patientId,
			range.startDate,
			range.endDate,
		]);
		return rows;
	}

	/**
	 * Query 2 — every `BillDetail` line for the patient's bills, in one
	 * statement. Returns a map keyed by `bill_id`.
	 */
	private static async getItemsByBill(
		billIds: number[]
	): Promise<Map<number, PatientReportItemGroup[]>> {
		const grouped = new Map<number, PatientReportItemGroup[]>();
		if (billIds.length === 0) return grouped;

		const sql = `
			SELECT bd.bill_id,
			       bd.generated_at::date AS service_date,
			       CASE
			         WHEN bd.service_id IS NOT NULL THEN 'service'
			         WHEN bd.drug_shipment_id IS NOT NULL THEN 'drug'
			         ELSE 'supply'
			       END AS item_type,
			       COALESCE(s.name, dc.name, ms.name) AS item_name,
			       bd.quantity,
			       bd.unit_price,
			       (bd.quantity * bd.unit_price) AS total_price
			FROM BillDetail bd
			LEFT JOIN Service s ON s.service_id = bd.service_id
			LEFT JOIN DrugShipment ds ON ds.shipment_id = bd.drug_shipment_id
			LEFT JOIN DrugCard dc ON dc.drug_id = ds.drug_id
			LEFT JOIN MedicalSupplyShipment mss
			       ON mss.shipment_id = bd.medical_supply_shipment_id
			LEFT JOIN MedicalSupply ms ON ms.supply_id = mss.supply_id
			WHERE bd.bill_id = ANY($1::int[])
			ORDER BY bd.bill_id, bd.generated_at::date, item_name`;

		const { rows } = await query(sql, [billIds]);

		// bill_id → service_date → "type:name" → item
		const buckets = new Map<number, Map<string, Map<string, PatientReportItem>>>();

		for (const row of rows) {
			const billId = Number(row.bill_id);
			const serviceDate = toDbDateOnly(row.service_date);
			if (!serviceDate) continue;

			const itemType = String(row.item_type);
			const itemName = String(row.item_name ?? "");
			const key = `${itemType}:${itemName}`;

			let byDate = buckets.get(billId);
			if (!byDate) {
				byDate = new Map();
				buckets.set(billId, byDate);
			}
			let items = byDate.get(serviceDate);
			if (!items) {
				items = new Map();
				byDate.set(serviceDate, items);
			}

			const existing = items.get(key);
			if (existing) {
				existing.quantity += Number(row.quantity ?? 0);
				existing.total_price = roundMoney(
					existing.total_price + toMoneyNumber(row.total_price)
				);
			} else {
				items.set(key, {
					item_type: itemType,
					item_name: itemName,
					quantity: Number(row.quantity ?? 0),
					unit_price: roundMoney(row.unit_price),
					total_price: roundMoney(row.total_price),
				});
			}
		}

		for (const [billId, byDate] of buckets) {
			const days: PatientReportItemGroup[] = [...byDate.entries()]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([serviceDate, items]) => {
					const list = [...items.values()].sort(
						(left, right) =>
							(CATEGORY_ORDER[left.item_type] ?? 99) -
								(CATEGORY_ORDER[right.item_type] ?? 99) ||
							left.item_name.localeCompare(right.item_name)
					);
					return {
						service_date: serviceDate,
						date_total: roundMoney(
							list.reduce((sum, item) => sum + item.total_price, 0)
						),
						items: list,
					};
				});
			grouped.set(billId, days);
		}

		return grouped;
	}

	/**
	 * Query 3 — staff assignments inside the range for one or more patients,
	 * grouped by patient then work date. Zero-hour assignments ("assigned, did
	 * not work") are dropped, matching what the legacy printed report showed.
	 */
	private static async getStaffByPatient(
		patientIds: number[],
		range: DateRangeQuery
	): Promise<Map<number, Map<string, PatientReportStaffDay>>> {
		const byPatient = new Map<number, Map<string, PatientReportStaffDay>>();
		if (patientIds.length === 0) return byPatient;

		const sql = `
			SELECT dsa.patient_id,
			       dsa.work_date,
			       e.employee_id,
			       e.name AS employee_name,
			       e.employee_type,
			       dsa.hours_worked
			FROM DailyStaffAssignment dsa
			JOIN Employee e ON e.employee_id = dsa.employee_id
			WHERE dsa.patient_id = ANY($1::int[])
			  AND dsa.work_date >= $2::date
			  AND dsa.work_date < ($3::date + ${END_EXCLUSIVE_OFFSET})
			  AND dsa.hours_worked > 0
			ORDER BY dsa.patient_id, dsa.work_date, e.employee_type, e.name`;

		const { rows } = await query(sql, [
			patientIds,
			range.startDate,
			range.endDate,
		]);

		for (const row of rows) {
			const workDate = toDbDateOnly(row.work_date);
			if (!workDate) continue;

			const patientId = Number(row.patient_id);
			let byDate = byPatient.get(patientId);
			if (!byDate) {
				byDate = new Map<string, PatientReportStaffDay>();
				byPatient.set(patientId, byDate);
			}

			let day = byDate.get(workDate);
			if (!day) {
				day = { work_date: workDate, doctors: [], nurses: [] };
				byDate.set(workDate, day);
			}

			const member: PatientReportStaffMember = {
				employee_id: Number(row.employee_id),
				name: String(row.employee_name ?? ""),
				hours_worked: roundMoney(row.hours_worked),
			};

			if (row.employee_type === "doctor") day.doctors.push(member);
			else if (row.employee_type === "nurse") day.nurses.push(member);
		}

		return byPatient;
	}

	/** Shapes one admission (already-fetching rows) into the wire DTO. */
	private static toAdmission(
		row: Record<string, unknown> & { bill_id: number | null },
		itemsByBill: Map<number, PatientReportItemGroup[]>,
		staffByDate: Map<string, PatientReportStaffDay>
	): PatientReportAdmission {
		const billId = row.bill_id ?? null;
		const itemsByDate = billId ? itemsByBill.get(billId) ?? [] : [];

		const totals = itemsByDate.reduce(
			(acc, group) => {
				for (const item of group.items) {
					if (item.item_type === "service") acc.services += item.total_price;
					else if (item.item_type === "drug") acc.drugs += item.total_price;
					else acc.supplies += item.total_price;
				}
				return acc;
			},
			{ services: 0, drugs: 0, supplies: 0 }
		);

		const tests = toMoneyNumber(row.medical_tests_amount);
		const discountScope = toStringArray(row.discount_scope);
		const vatScope = toStringArray(row.vat_scope_custom);

		const financials = calculateBillFinancials({
			services: totals.services,
			drugs: totals.drugs,
			supplies: totals.supplies,
			tests,
			discount: toMoneyNumber(row.discount),
			discountType: (row.discount_type ?? null) as
				| "fixed"
				| "percentage"
				| null
				| undefined,
			discountScope,
			vatPercentage: toMoneyNumber(row.vat_percentage),
			vatScope,
			administrativeExpenses: toMoneyNumber(row.administrative_expenses),
		});

		const paid = toMoneyNumber(row.paid_amount);
		// `Bill.total_amount` wins: it is the authoritative billed amount and
		// the number `paid_amount` was reconciled against. The computed total
		// only fills in when the admission has no bill at all.
		const storedTotal = row.total_amount === null ? null : toMoneyNumber(row.total_amount);
		const finalTotal = roundMoney(storedTotal ?? financials.finalTotal);

		const admissionTime = toTimestampString(row.admission_time);
		const dischargeTime = toTimestampString(row.discharge_time);

		return {
			patient_history_id: Number(row.patient_history_id),
			bill_id: billId,
			admission_time: admissionTime,
			discharge_time: dischargeTime,
			diagnosis: row.diagnosis == null ? null : String(row.diagnosis),
			leave_reason: row.leave_reason == null ? null : String(row.leave_reason),
			length_of_stay_days: stayDays(admissionTime, dischargeTime),
			base_total: roundMoney(financials.subtotal),
			medical_tests_amount: roundMoney(tests),
			discount_type: row.discount_type == null ? null : String(row.discount_type),
			discount: roundMoney(row.discount),
			discount_scope: discountScope,
			calculated_discount: roundMoney(financials.discountAmount),
			vat_percentage: roundMoney(row.vat_percentage),
			vat_scope_custom: vatScope,
			calculated_vat: roundMoney(financials.vatAmount),
			administrative_expenses: roundMoney(financials.administrativeExpenses),
			final_total: finalTotal,
			paid_amount: roundMoney(paid),
			outstanding_amount: roundMoney(finalTotal - paid),
			items_by_date: itemsByDate,
			daily_staff: staffDaysForAdmission(
				staffByDate,
				admissionTime,
				dischargeTime
			),
		};
	}
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Display order of the bill categories (matches `BILL_CATEGORIES`). */
const CATEGORY_ORDER: Record<string, number> = {
	service: 0,
	drug: 1,
	supply: 2,
};

/** `JSONB`/`TEXT[]` scope columns → string array (never throws on bad JSON). */
function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((entry) => String(entry));
	if (typeof value === "string" && value.trim().length > 0) {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
		} catch {
			return [];
		}
	}
	return [];
}

/** Whole days between admission and discharge (0 for an active admission). */
function stayDays(admission: string | null, discharge: string | null): number {
	if (!admission || !discharge) return 0;
	const start = new Date(admission).getTime();
	const end = new Date(discharge).getTime();
	if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
	return Math.max(0, Math.round((end - start) / 86_400_000));
}

/**
 * Staff days that fall inside one admission's stay.
 *
 * Compared on calendar dates (`YYYY-MM-DD`, lexicographic == chronological):
 * an admission that starts at 22:00 still owns the whole of that work date,
 * which is how `DailyStaffAssignment` records it (`work_date` is a DATE).
 */
function staffDaysForAdmission(
	staffByDate: Map<string, PatientReportStaffDay>,
	admission: string | null,
	discharge: string | null
): PatientReportStaffDay[] {
	if (!admission) return [];

	const startDate = admission.slice(0, 10);
	const endDate = (discharge ?? "9999-12-31").slice(0, 10);

	return [...staffByDate.values()]
		.filter((day) => day.work_date >= startDate && day.work_date <= endDate)
		.sort((left, right) => left.work_date.localeCompare(right.work_date));
}
