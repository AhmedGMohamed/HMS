/**
 * Clock-in report — Phase 6.11.6.
 *
 * Replaces `Report.getEmployeeClockInReports`, which was wrong in ways a
 * reviewer could not see from the page:
 *
 *   - **N+1.** It fetched the employee list, then ran two more queries *per
 *     employee* (records + assignments). A month over the whole staff was
 *     ~2,000 statements.
 *   - **Missing days ignored hire date and today.** It synthesized every date in
 *     the range, so a nurse hired last week showed a year of "missing" days and
 *     a report over 2030 showed the future as absent.
 *   - **Multiple sessions per day were silently dropped.** Records were keyed
 *     into a `Map` by date, so the second clock-in of a double shift overwrote
 *     the first.
 *   - **`avg_hours_per_day` divided by the clock-in count**, not by worked days,
 *     which understates the average for anyone with two sessions.
 *   - **Status defaulted to `late` whenever a deduction existed without a
 *     shift**, so an early clock-out with no shift was reported as late.
 *   - **The patient join duplicated overlapping admissions** (a plain
 *     `LEFT JOIN PatientHistory … BETWEEN` returns one row per admission the
 *     work date falls inside).
 *
 * ## Fixed cost
 *
 *   - `listClockIns`: **2** queries — the eligible employees (with their shift
 *     and hire date) and every clock-in in range for the filtered population.
 *     Missing days are arithmetic, not rows: an employee's absent-day count is
 *     `eligibleDays − distinctWorkedDates`, which needs no per-day loop.
 *   - `getEmployeeDetail`: **3** queries — header, records, assignments. One
 *     employee's range is small enough to merge, synthesize and paginate in
 *     memory, which is also the only way `status` can filter synthesized rows.
 *   - `exportClockIns`: **3** queries for the whole document.
 *
 * ## Days vs. sessions
 *
 * A day can hold several sessions. The **records** are one row per session; the
 * **attendance summary** is one classification per day, taking the worst status
 * of that day (`on_time < early < late < incomplete`). That keeps the summary
 * arithmetic closed — `on_time + late + early + incomplete = worked_days` and
 * `worked_days + missing = total_days` — while the records table still shows
 * every session. `clock_in_count` counts sessions; `worked_days` counts dates.
 *
 * ## Missing days
 *
 * Synthesized only for **active** employees, from `max(range.start, hire_date)`
 * to `min(range.end, today)` (plan D14). No weekend or holiday assumptions —
 * there is no schedule source. A day with patient assignments but no clock-in
 * is still missing; it simply carries the assignments so the detail dialog can
 * show what the employee was expected to do.
 */

import type {
	AttendanceSummary,
	ClockInDetailDTO,
	ClockInExportPayload,
	ClockInExportRow,
	ClockInPatientRow,
	ClockInRecordRow,
	ClockInReportCharts,
	ClockInReportDTO,
	ClockInReportRow,
	ClockInReportSummary,
} from "../../utils/types/reportV2.js";
import { query } from "../database/connection.js";
import {
	END_EXCLUSIVE_OFFSET,
	NotFoundError,
	type DateRangeQuery,
	type PagingQuery,
	type SortDirection,
	type ClockStatus,
	clockStatusFor,
	enumerateDates,
	hoursBetween,
	inclusiveDayCount,
	likePattern,
	maxDate,
	minDate,
	roundTo,
	safeDivide,
	todayDateOnly,
	toDbDateOnly,
	toTimestampString,
} from "./shared.js";

/** `?employee_type=` values; `other` is "neither doctor nor nurse". */
export const CLOCK_IN_TYPE_FILTERS = [
	"all",
	"doctor",
	"nurse",
	"other",
] as const;

export type ClockInTypeFilter = (typeof CLOCK_IN_TYPE_FILTERS)[number];

/** `?status=` on the detail endpoint (the records table's filter). */
export const CLOCK_IN_STATUS_FILTERS = [
	"all",
	"on_time",
	"late",
	"early",
	"incomplete",
	"missing",
] as const;

export type ClockInStatusFilter = (typeof CLOCK_IN_STATUS_FILTERS)[number];

/**
 * Sort keys the clock-in list accepts (`?sort=`).
 *
 * Unlike the other tabs these are **not** SQL fragments: the rows are
 * aggregated in TS (the attendance status rule lives in `clockStatusFor`, and
 * duplicating it in SQL is exactly how the legacy page drifted), so the sort is
 * a comparator over the finished rows.
 */
export const CLOCK_IN_SORT_KEYS = [
	"name",
	"clock_ins",
	"days",
	"hours",
	"avg_per_day",
	"on_time",
	"late",
	"early",
	"incomplete",
	"missing",
	"punctuality",
	"deductions",
] as const;

export type ClockInSortKey = (typeof CLOCK_IN_SORT_KEYS)[number];

export interface ClockInFilters {
	range: DateRangeQuery;
	employeeType: ClockInTypeFilter;
	/** `null` = every eligible employee. */
	employeeId: number | null;
	/** Matches the employee's name. */
	search: string | null;
}

export interface ClockInListQuery extends ClockInFilters {
	paging: PagingQuery;
	sort: { column: ClockInSortKey; direction: SortDirection };
}

export interface ClockInDetailQuery {
	range: DateRangeQuery;
	status: ClockInStatusFilter;
	paging: PagingQuery;
}

/* ------------------------------------------------------------------ */
/* SQL                                                                 */
/* ------------------------------------------------------------------ */

/**
 * An employee is in the report when they are expected to clock in **or** they
 * actually did (or were assigned) inside the range.
 *
 * The second and third clauses matter for terminated staff and for anyone whose
 * `need_clock_in` was turned off after the fact: their work in the window is
 * still work. `$1`/`$2` are the range dates in every statement in this model.
 */
const ELIGIBLE_SQL = `(
	  (COALESCE(e.need_clock_in, false) = true
	     AND COALESCE(e.is_active, true) = true
	     AND e.hire_date <= $2::date)
	  OR EXISTS (
	       SELECT 1 FROM EmployeeClockIn ec
	        WHERE ec.employee_id = e.employee_id
	          AND ec.clock_in >= $1::date
	          AND ec.clock_in < ($2::date + ${END_EXCLUSIVE_OFFSET})
	     )
	  OR EXISTS (
	       SELECT 1 FROM DailyStaffAssignment dsa
	        WHERE dsa.employee_id = e.employee_id
	          AND dsa.work_date >= $1::date
	          AND dsa.work_date < ($2::date + ${END_EXCLUSIVE_OFFSET})
	     )
	)`;

const EMPLOYEE_COLUMNS = `e.employee_id,
	e.name AS employee_name,
	e.employee_type::text AS employee_type,
	e.hire_date,
	COALESCE(e.is_active, true) AS is_active,
	COALESCE(e.need_clock_in, false) AS need_clock_in,
	e.shift_type::text AS shift_type,
	e.shift_start_time,
	e.shift_end_time`;

/** Builds the filter fragment shared by every statement. */
function buildFilters(filters: ClockInFilters): {
	sql: string[];
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

	return { sql: conditions, params };
}

function whereSql(conditions: string[]): string {
	return conditions.length > 0 ? `AND ${conditions.join("\n\t  AND ")}` : "";
}

/**
 * Every clock-in of the filtered population in one statement.
 *
 * The day key comes from Postgres (`clock_in::date`) so the grouping uses the
 * same calendar as the range comparison; the raw timestamps come along because
 * `clockStatusFor` needs the wall clock and `hoursBetween` needs both ends.
 */
function clockRowsSql(conditions: string[]): string {
	return `SELECT ec.employee_id,
		ec.clock_id,
		ec.clock_in,
		ec.clock_out,
		COALESCE(ec.pay_deduction, 0) AS pay_deduction,
		to_char(ec.clock_in::date, 'YYYY-MM-DD') AS work_date
	FROM EmployeeClockIn ec
	JOIN Employee e ON e.employee_id = ec.employee_id
	WHERE ec.clock_in >= $1::date
	  AND ec.clock_in < ($2::date + ${END_EXCLUSIVE_OFFSET})
	  ${whereSql(conditions)}
	ORDER BY ec.employee_id, ec.clock_in`;
}

/**
 * The admission that covers the work date.
 *
 * A `LEFT JOIN … BETWEEN` returns one row per overlapping admission, which is
 * how the legacy report multiplied patient assignments. A `LATERAL … LIMIT 1`
 * picks the most recent admission that actually covers the day.
 */
const ASSIGNMENT_LATERAL = `LEFT JOIN LATERAL (
		SELECT ph.diagnosis, ph.admission_time, ph.discharge_time
		FROM PatientHistory ph
		WHERE ph.patient_id = dsa.patient_id
		  AND dsa.work_date >= ph.admission_time::date
		  AND (ph.discharge_time IS NULL OR dsa.work_date <= ph.discharge_time::date)
		ORDER BY ph.admission_time DESC
		LIMIT 1
	) ph ON true`;

const ASSIGNMENT_COLUMNS = `dsa.employee_id,
	to_char(dsa.work_date, 'YYYY-MM-DD') AS work_date,
	dsa.patient_id,
	p.name AS patient_name,
	p.payment_type::text AS payment_type,
	COALESCE(dsa.hours_worked, 0) AS hours_worked,
	ph.diagnosis,
	ph.admission_time,
	ph.discharge_time`;

function assignmentRowsSql(conditions: string[]): string {
	return `SELECT ${ASSIGNMENT_COLUMNS}
	FROM DailyStaffAssignment dsa
	JOIN Patient p ON p.patient_id = dsa.patient_id
	JOIN Employee e ON e.employee_id = dsa.employee_id
	${ASSIGNMENT_LATERAL}
	WHERE dsa.work_date >= $1::date
	  AND dsa.work_date < ($2::date + ${END_EXCLUSIVE_OFFSET})
	  ${whereSql(conditions)}
	ORDER BY dsa.employee_id, dsa.work_date DESC, p.name ASC`;
}

/* ------------------------------------------------------------------ */
/* Raw shapes                                                          */
/* ------------------------------------------------------------------ */

interface EmployeeRecord {
	employee_id: number;
	employee_name: string;
	employee_type: string;
	hire_date: string | null;
	is_active: boolean;
	need_clock_in: boolean;
	shift_type: string | null;
	shift_start_time: string | null;
	shift_end_time: string | null;
}

interface ClockRow {
	employee_id: number;
	clock_id: number;
	clock_in: unknown;
	clock_out: unknown;
	pay_deduction: number;
	work_date: string;
}

interface AssignmentRow {
	employee_id: number;
	work_date: string;
	patient: ClockInPatientRow;
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

function toEmployee(raw: Record<string, unknown>): EmployeeRecord {
	return {
		employee_id: Number(raw.employee_id),
		employee_name: String(raw.employee_name ?? ""),
		employee_type: String(raw.employee_type ?? "other"),
		hire_date: toDbDateOnly(raw.hire_date),
		is_active: raw.is_active !== false,
		need_clock_in: raw.need_clock_in === true,
		shift_type: raw.shift_type === null ? null : String(raw.shift_type),
		shift_start_time:
			raw.shift_start_time === null ? null : String(raw.shift_start_time),
		shift_end_time:
			raw.shift_end_time === null ? null : String(raw.shift_end_time),
	};
}

function toClockRow(raw: Record<string, unknown>): ClockRow {
	return {
		employee_id: Number(raw.employee_id),
		clock_id: Number(raw.clock_id),
		clock_in: raw.clock_in,
		clock_out: raw.clock_out ?? null,
		pay_deduction: Number(raw.pay_deduction ?? 0),
		work_date: String(raw.work_date ?? ""),
	};
}

function toAssignmentRow(raw: Record<string, unknown>): AssignmentRow {
	return {
		employee_id: Number(raw.employee_id),
		work_date: String(raw.work_date ?? ""),
		patient: {
			patient_id: Number(raw.patient_id),
			patient_name: String(raw.patient_name ?? ""),
			payment_type: String(raw.payment_type ?? "cash"),
			diagnosis: raw.diagnosis === null ? null : String(raw.diagnosis),
			hours_worked: roundTo(raw.hours_worked, 2),
			admission_time: toTimestampString(raw.admission_time),
			discharge_time: toTimestampString(raw.discharge_time),
		},
	};
}

function groupAssignments(rows: AssignmentRow[]): Map<string, ClockInPatientRow[]> {
	const byDate = new Map<string, ClockInPatientRow[]>();
	for (const row of rows) {
		const key = `${row.employee_id}|${row.work_date}`;
		const bucket = byDate.get(key);
		if (bucket) bucket.push(row.patient);
		else byDate.set(key, [row.patient]);
	}
	return byDate;
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Worst-status precedence for a day with several sessions.
 *
 * A missing clock-out (`incomplete`) says more about the day than a late start,
 * so it wins; `on_time` only survives if every session was on time.
 */
const STATUS_RANK: Record<ClockStatus, number> = {
	on_time: 0,
	early: 1,
	late: 2,
	incomplete: 3,
	missing: 4,
};

interface EmployeeAggregate {
	clockInCount: number;
	totalHours: number;
	totalDeductions: number;
	/** One status per worked date (the worst of that date's sessions). */
	byDate: Map<string, ClockStatus>;
}

function emptyAggregate(): EmployeeAggregate {
	return {
		clockInCount: 0,
		totalHours: 0,
		totalDeductions: 0,
		byDate: new Map<string, ClockStatus>(),
	};
}

/** Folds one clock-in row into the employee's aggregate. */
function accumulate(aggregate: EmployeeAggregate, employee: EmployeeRecord, row: ClockRow): void {
	const status = clockStatusFor({
		clockIn: row.clock_in,
		clockOut: row.clock_out,
		shiftStart: employee.shift_start_time,
		shiftEnd: employee.shift_end_time,
		payDeduction: row.pay_deduction,
	});

	aggregate.clockInCount += 1;
	aggregate.totalHours += hoursBetween(row.clock_in, row.clock_out);
	aggregate.totalDeductions += row.pay_deduction;

	const previous = aggregate.byDate.get(row.work_date);
	if (previous === undefined || STATUS_RANK[status.status] > STATUS_RANK[previous]) {
		aggregate.byDate.set(row.work_date, status.status);
	}
}

/**
 * Days the employee was expected to be at work.
 *
 * `0` unless the employee is **active and expected to clock in**: a doctor who
 * never clocks in is not absent, they simply do not use the clock. They can
 * still appear in the report through an actual clock-in or an assignment, but
 * their absent-day count stays zero. Clamped at both ends so a hire date after
 * the range, or a range in the future, yields zero instead of a negative.
 */
function eligibleDaysFor(employee: EmployeeRecord, range: DateRangeQuery): number {
	if (!employee.is_active || !employee.need_clock_in) return 0;

	const start = maxDate(range.startDate, employee.hire_date ?? range.startDate);
	const end = minDate(range.endDate, todayDateOnly());
	if (start > end) return 0;

	return inclusiveDayCount(start, end);
}

/** Counts one classification per worked date. */
function toAttendanceSummary(
	byDate: Map<string, ClockStatus>,
	missingDays: number
): AttendanceSummary {
	let onTime = 0;
	let late = 0;
	let early = 0;
	let incomplete = 0;

	for (const status of byDate.values()) {
		if (status === "on_time") onTime += 1;
		else if (status === "late") late += 1;
		else if (status === "early") early += 1;
		else if (status === "incomplete") incomplete += 1;
	}

	const workedDays = byDate.size;
	const classified = onTime + late + early + incomplete;

	return {
		total_days: workedDays + missingDays,
		worked_days: workedDays,
		on_time_days: onTime,
		late_days: late,
		early_days: early,
		incomplete_days: incomplete,
		missing_days: missingDays,
		// Missing days are deliberately **not** in the denominator: an absence
		// is not an unpunctual arrival, and including it would make the rate
		// fall with the range length instead of with behaviour.
		punctuality_rate: roundTo(safeDivide(onTime, classified) * 100, 2),
	};
}

function buildRow(
	employee: EmployeeRecord,
	aggregate: EmployeeAggregate,
	range: DateRangeQuery
): ClockInReportRow {
	const missingDays = Math.max(
		0,
		eligibleDaysFor(employee, range) - aggregate.byDate.size
	);

	const attendance = toAttendanceSummary(aggregate.byDate, missingDays);

	return {
		employee_id: employee.employee_id,
		employee_name: employee.employee_name,
		employee_type: employee.employee_type,
		hire_date: employee.hire_date,
		is_active: employee.is_active,
		need_clock_in: employee.need_clock_in,
		shift_type: employee.shift_type,
		shift_start_time: employee.shift_start_time,
		shift_end_time: employee.shift_end_time,
		clock_in_count: aggregate.clockInCount,
		total_hours: roundTo(aggregate.totalHours, 2),
		// Per **worked day**, not per clock-in (the legacy bug).
		avg_hours_per_day: roundTo(
			safeDivide(aggregate.totalHours, attendance.worked_days),
			2
		),
		total_deductions: roundTo(aggregate.totalDeductions, 2),
		attendance_summary: attendance,
	};
}

/**
 * The envelope summary, folded from the same rows the table and the export
 * print. `avg_hours_per_day` uses the summed worked days, so it is the true
 * average over the population and not the average of per-employee averages.
 */
function summariseRows(rows: ClockInReportRow[]): ClockInReportSummary {
	const totals = rows.reduce(
		(acc, row) => ({
			clockIns: acc.clockIns + row.clock_in_count,
			hours: acc.hours + row.total_hours,
			workedDays: acc.workedDays + row.attendance_summary.worked_days,
			missingDays: acc.missingDays + row.attendance_summary.missing_days,
			deductions: acc.deductions + row.total_deductions,
		}),
		{ clockIns: 0, hours: 0, workedDays: 0, missingDays: 0, deductions: 0 }
	);

	return {
		total_employees: rows.length,
		total_clock_ins: totals.clockIns,
		total_hours: roundTo(totals.hours, 2),
		total_worked_days: totals.workedDays,
		avg_hours_per_day: roundTo(
			safeDivide(totals.hours, totals.workedDays),
			2
		),
		avg_hours_per_employee: roundTo(
			safeDivide(totals.hours, rows.length),
			2
		),
		total_deductions: roundTo(totals.deductions, 2),
		total_missing_days: totals.missingDays,
	};
}

/**
 * The two chart series.
 *
 * `hours_by_employee` is capped at twelve bars: a horizontal bar chart with a
 * thousand categories is a wall, and the table below is the complete list. The
 * cap is by hours **descending**, so the bars always answer "who worked most".
 */
const HOURS_CHART_LIMIT = 12;

function buildCharts(rows: ClockInReportRow[]): ClockInReportCharts {
	const hoursByEmployee = rows
		.filter((row) => row.total_hours > 0)
		.map((row) => ({
			employee_id: row.employee_id,
			employee_name: row.employee_name,
			hours: row.total_hours,
		}))
		.sort((a, b) => b.hours - a.hours || a.employee_name.localeCompare(b.employee_name, "en"))
		.slice(0, HOURS_CHART_LIMIT);

	const totals = rows.reduce(
		(acc, row) => ({
			on_time: acc.on_time + row.attendance_summary.on_time_days,
			late: acc.late + row.attendance_summary.late_days,
			early: acc.early + row.attendance_summary.early_days,
			incomplete: acc.incomplete + row.attendance_summary.incomplete_days,
			missing: acc.missing + row.attendance_summary.missing_days,
		}),
		{ on_time: 0, late: 0, early: 0, incomplete: 0, missing: 0 }
	);

	return {
		hours_by_employee: hoursByEmployee,
		// Missing is included: the table and the KPI strip both report it, and a
		// donut that silently dropped a fifth of the days would look broken.
		status_distribution: [
			{ status: "on_time", count: totals.on_time },
			{ status: "late", count: totals.late },
			{ status: "early", count: totals.early },
			{ status: "incomplete", count: totals.incomplete },
			{ status: "missing", count: totals.missing },
		],
	};
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

function sortValue(row: ClockInReportRow, column: ClockInSortKey): number {
	switch (column) {
		case "clock_ins":
			return row.clock_in_count;
		case "days":
			return row.attendance_summary.total_days;
		case "hours":
			return row.total_hours;
		case "avg_per_day":
			return row.avg_hours_per_day;
		case "on_time":
			return row.attendance_summary.on_time_days;
		case "late":
			return row.attendance_summary.late_days;
		case "early":
			return row.attendance_summary.early_days;
		case "incomplete":
			return row.attendance_summary.incomplete_days;
		case "missing":
			return row.attendance_summary.missing_days;
		case "punctuality":
			return row.attendance_summary.punctuality_rate;
		case "deductions":
			return row.total_deductions;
		case "name":
		default:
			return 0;
	}
}

function sortRows(
	rows: ClockInReportRow[],
	sort: { column: ClockInSortKey; direction: SortDirection }
): ClockInReportRow[] {
	const factor = sort.direction === "desc" ? -1 : 1;

	return [...rows].sort((a, b) => {
		if (sort.column !== "name") {
			const delta = sortValue(a, sort.column) - sortValue(b, sort.column);
			if (delta !== 0) return delta * factor;
		}
		// Ties (and the name sort) fall back to a stable, locale-free order so
		// two renders and the export always agree.
		const byName = a.employee_name.localeCompare(b.employee_name, "en");
		if (byName !== 0) return sort.column === "name" ? byName * factor : byName;
		return a.employee_id - b.employee_id;
	});
}

/* ------------------------------------------------------------------ */
/* Records (detail + export)                                           */
/* ------------------------------------------------------------------ */

function toRecord(
	employee: EmployeeRecord,
	row: ClockRow,
	patients: ClockInPatientRow[]
): ClockInRecordRow {
	const status = clockStatusFor({
		clockIn: row.clock_in,
		clockOut: row.clock_out,
		shiftStart: employee.shift_start_time,
		shiftEnd: employee.shift_end_time,
		payDeduction: row.pay_deduction,
	});

	return {
		clock_id: row.clock_id,
		date: row.work_date,
		clock_in: toTimestampString(row.clock_in),
		clock_out: toTimestampString(row.clock_out),
		hours_worked: hoursBetween(row.clock_in, row.clock_out),
		pay_deduction: roundTo(row.pay_deduction, 2),
		status: status.status,
		is_missing: false,
		late_minutes: status.late_minutes,
		early_minutes: status.early_minutes,
		patients,
		patient_count: patients.length,
	};
}

function missingRecord(date: string, patients: ClockInPatientRow[]): ClockInRecordRow {
	return {
		clock_id: null,
		date,
		clock_in: null,
		clock_out: null,
		hours_worked: 0,
		pay_deduction: 0,
		status: "missing",
		is_missing: true,
		late_minutes: 0,
		early_minutes: 0,
		patients,
		patient_count: patients.length,
	};
}

/**
 * Every session plus every synthesized missing day for one employee, newest
 * first, sessions of the same day in clock-in order.
 *
 * `synthesizeMissing` is off for the export: a document that prints every
 * absent day for every employee would be millions of rows for a wide range, and
 * an absence has no record to print anyway. The export states the missing count
 * in the employee's attendance block instead.
 */
function buildRecords(
	employee: EmployeeRecord,
	rows: ClockRow[],
	assignments: Map<string, ClockInPatientRow[]>,
	range: DateRangeQuery,
	{ synthesizeMissing = true }: { synthesizeMissing?: boolean } = {}
): ClockInRecordRow[] {
	const patientsOn = (date: string) =>
		assignments.get(`${employee.employee_id}|${date}`) ?? [];

	const records = rows.map((row) => toRecord(employee, row, patientsOn(row.work_date)));

	const workedDates = new Set(rows.map((row) => row.work_date));
	const missingFrom = maxDate(range.startDate, employee.hire_date ?? range.startDate);
	const missingTo = minDate(range.endDate, todayDateOnly());

	if (
		synthesizeMissing &&
		employee.is_active &&
		employee.need_clock_in &&
		missingFrom <= missingTo
	) {
		for (const date of enumerateDates(missingFrom, missingTo)) {
			if (!workedDates.has(date)) records.push(missingRecord(date, patientsOn(date)));
		}
	}

	records.sort((a, b) => {
		if (a.date !== b.date) return a.date < b.date ? 1 : -1;
		if (a.is_missing !== b.is_missing) return a.is_missing ? 1 : -1;
		return (a.clock_in ?? "").localeCompare(b.clock_in ?? "");
	});

	return records;
}

/** Per-day classification over a record list (the worst status wins). */
function recordsByDate(records: ClockInRecordRow[]): {
	byDate: Map<string, ClockStatus>;
	missingDays: number;
} {
	const byDate = new Map<string, ClockStatus>();
	let missingDays = 0;

	for (const record of records) {
		const status = record.status as ClockStatus;
		if (status === "missing") {
			missingDays += 1;
			continue;
		}
		const previous = byDate.get(record.date);
		if (previous === undefined || STATUS_RANK[status] > STATUS_RANK[previous]) {
			byDate.set(record.date, status);
		}
	}

	return { byDate, missingDays };
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

class ClockInReportModel {
	/**
	 * One page of employees plus the whole-set summary and both chart series.
	 *
	 * Two statements regardless of headcount. The rows are aggregated and sorted
	 * in TS because the attendance rule lives in `clockStatusFor` (contract 51);
	 * a SQL copy of it is what let the legacy page drift.
	 */
	static async listClockIns(input: ClockInListQuery): Promise<ClockInReportDTO> {
		const { sql: conditions, params } = buildFilters(input);

		const [employeeResult, clockResult] = await Promise.all([
			query(
				`SELECT ${EMPLOYEE_COLUMNS}
				 FROM Employee e
				 WHERE ${ELIGIBLE_SQL}
				   ${whereSql(conditions)}
				 ORDER BY e.name ASC, e.employee_id ASC`,
				params
			),
			query(clockRowsSql(conditions), params),
		]);

		const employees = employeeResult.rows.map(toEmployee);
		const aggregates = new Map<number, EmployeeAggregate>(
			employees.map((employee) => [employee.employee_id, emptyAggregate()])
		);
		const byId = new Map(employees.map((employee) => [employee.employee_id, employee]));

		for (const raw of clockResult.rows as Array<Record<string, unknown>>) {
			const row = toClockRow(raw);
			const employee = byId.get(row.employee_id);
			const aggregate = aggregates.get(row.employee_id);
			if (employee && aggregate) accumulate(aggregate, employee, row);
		}

		const allRows = employees.map((employee) =>
			buildRow(employee, aggregates.get(employee.employee_id) ?? emptyAggregate(), input.range)
		);

		const sorted = sortRows(allRows, input.sort);
		const start = input.paging.offset;

		return {
			summary: summariseRows(allRows),
			charts: buildCharts(allRows),
			data: sorted.slice(start, start + input.paging.limit),
			// The summary count is authoritative, so the footer and the KPI card
			// agree even for an out-of-range page.
			total: allRows.length,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/**
	 * One employee: identity, attendance summary over the whole range, and one
	 * page of records (synthesized missing days included).
	 *
	 * The status filter and the pagination apply **after** synthesis — a missing
	 * day does not exist in the database, so it can only be filtered once it has
	 * been produced.
	 */
	static async getEmployeeDetail(
		employeeId: number,
		input: ClockInDetailQuery
	): Promise<ClockInDetailDTO> {
		// `clockRowsSql` and `assignmentRowsSql` both join `Employee e`, so the
		// filter fragment is shared verbatim.
		const conditions = [`e.employee_id = $3`];

		const [headerResult, clockResult, assignmentResult] = await Promise.all([
			query(
				`SELECT ${EMPLOYEE_COLUMNS} FROM Employee e WHERE e.employee_id = $1`,
				[employeeId]
			),
			query(clockRowsSql(conditions), [
				input.range.startDate,
				input.range.endDate,
				employeeId,
			]),
			query(assignmentRowsSql(conditions), [
				input.range.startDate,
				input.range.endDate,
				employeeId,
			]),
		]);

		if (headerResult.rows.length === 0) {
			throw new NotFoundError("Employee not found");
		}

		const employee = toEmployee(headerResult.rows[0]);
		const assignments = groupAssignments(
			(assignmentResult.rows as Array<Record<string, unknown>>).map(toAssignmentRow)
		);
		const records = buildRecords(
			employee,
			(clockResult.rows as Array<Record<string, unknown>>).map(toClockRow),
			assignments,
			input.range
		);

		const summarySource = recordsByDate(records);
		const attendance = toAttendanceSummary(
			summarySource.byDate,
			summarySource.missingDays
		);

		const filtered =
			input.status === "all"
				? records
				: records.filter((record) => record.status === input.status);
		const start = input.paging.offset;

		return {
			employee: {
				employee_id: employee.employee_id,
				employee_name: employee.employee_name,
				employee_type: employee.employee_type,
				hire_date: employee.hire_date,
				is_active: employee.is_active,
				need_clock_in: employee.need_clock_in,
				shift_type: employee.shift_type,
				shift_start_time: employee.shift_start_time,
				shift_end_time: employee.shift_end_time,
			},
			attendance_summary: attendance,
			records: filtered.slice(start, start + input.paging.limit),
			total: filtered.length,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/**
	 * The whole document: every eligible employee with every record.
	 *
	 * Three statements, never one per employee. The envelope summary is derived
	 * from the same rows the document prints, so the cover page cannot disagree
	 * with the tables.
	 */
	static async exportClockIns(input: ClockInFilters): Promise<ClockInExportPayload> {
		const { sql: conditions, params } = buildFilters(input);

		const [employeeResult, clockResult, assignmentResult] = await Promise.all([
			query(
				`SELECT ${EMPLOYEE_COLUMNS}
				 FROM Employee e
				 WHERE ${ELIGIBLE_SQL}
				   ${whereSql(conditions)}
				 ORDER BY e.name ASC, e.employee_id ASC`,
				params
			),
			query(clockRowsSql(conditions), params),
			query(assignmentRowsSql(conditions), params),
		]);

		const employees = employeeResult.rows.map(toEmployee);
		const clockRows = (clockResult.rows as Array<Record<string, unknown>>).map(toClockRow);
		const assignments = groupAssignments(
			(assignmentResult.rows as Array<Record<string, unknown>>).map(toAssignmentRow)
		);

		const rowsByEmployee = new Map<number, ClockRow[]>();
		for (const row of clockRows) {
			const bucket = rowsByEmployee.get(row.employee_id);
			if (bucket) bucket.push(row);
			else rowsByEmployee.set(row.employee_id, [row]);
		}

		const data: ClockInExportRow[] = employees.map((employee) => {
			const employeeRows = rowsByEmployee.get(employee.employee_id) ?? [];
			const aggregate = emptyAggregate();
			for (const row of employeeRows) accumulate(aggregate, employee, row);

			return {
				...buildRow(employee, aggregate, input.range),
				records: buildRecords(employee, employeeRows, assignments, input.range, {
					synthesizeMissing: false,
				}),
			};
		});

		const summary = summariseRows(data);

		return {
			generated_at: new Date().toISOString(),
			range: {
				start_date: input.range.startDate,
				end_date: input.range.endDate,
			},
			summary,
			charts: buildCharts(data),
			data,
		};
	}
}

export default ClockInReportModel;
