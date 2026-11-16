/**
 * Nurse report — Phase 6.11.3.
 *
 * Replaces the legacy nurse endpoints, which listed the nurses and then ran a
 * **patient query and a daily-assignment query per nurse** (the accordion was
 * built client-side from N responses). The Reports model is fixed-cost:
 *
 *   - `listNurses`: 2 queries — the page and the whole-set summary, both over
 *     the same `pairs` CTE so they cannot disagree about the population.
 *   - `getNurseDetail`: 3 queries — nurse + summary (one statement), one page
 *     of patients, and **one** daily-assignment statement for the whole
 *     accordion.
 *   - `exportNurses`: 4 queries — rows + summary, then every nurse's patients
 *     and every nurse's daily assignments, each in a single `ANY(ids)` query.
 *
 * ## What a "pair" is
 *
 * One row per `(nurse, patient, work_date)` from `DailyStaffAssignment`, which
 * has a `UNIQUE(employee_id, patient_id, work_date)` constraint — so the pairs
 * CTE can never fan out and the aggregates below are plain `COUNT`/`SUM`.
 *
 * The range is applied to `work_date`, not to an admission: a nurse is
 * credited for the days they were assigned inside the window, even when the
 * patient was admitted before it and is still in the ward.
 *
 * ## Where the diagnosis comes from
 *
 * Not `MAX(diagnosis)` (the legacy bug): a `LATERAL` picks the **latest
 * admission overlapping the range**, so a patient admitted before `start_date`
 * still carries the stay they are actually in, and a discharge/diagnosis pair
 * always belongs to the same admission.
 *
 * ## Summary semantics
 *
 * `total_patients` is deduplicated across nurses while
 * `total_patient_assignments` is the additive per-nurse sum — the same split as
 * the doctor report (6.11.2, contract 18). `total_days` is also additive
 * because a day is already scoped to one nurse (`COUNT(DISTINCT work_date)`
 * per nurse), so summing it cannot double-count the same calendar day.
 */

import type {
	NurseDailyAssignment,
	NurseDetailDTO,
	NurseExportRow,
	NursePatientRow,
	NurseReportRow,
	NurseReportSummary,
	ReportExportEnvelope,
	ReportListEnvelope,
} from "../../utils/types/reportsApi.js";
import { query } from "../database/connection.js";
import {
	END_EXCLUSIVE_OFFSET,
	NotFoundError,
	type DateRangeQuery,
	type PagingQuery,
	type SortDirection,
	likePattern,
	roundTo,
	toDbDateOnly,
	toTimestampString,
} from "./shared.js";

/** Sort keys the nurse list accepts (`?sort=`). */
export const NURSE_SORT_COLUMNS = {
	name: "e.name",
	patients: "a.patients_count",
	days: "a.days_worked",
	hours: "a.total_hours",
	last_work: "a.last_work_date",
} as const;

export type NurseSortColumn = keyof typeof NURSE_SORT_COLUMNS;

/** Sort keys for the per-nurse patient table. */
export const NURSE_PATIENT_SORT_COLUMNS = {
	name: "p.name",
	days: "agg.days_assigned",
	hours: "agg.hours_worked",
	last_admission: "latest.admission_time",
} as const;

export interface NurseReportFilters {
	range: DateRangeQuery;
	/** `null` = every nurse with at least one assignment in range. */
	nurseId: number | null;
	/** Matches the nurse's name on the list/export endpoints. */
	search: string | null;
}

export interface NurseReportListQuery extends NurseReportFilters {
	paging: PagingQuery;
	sort: { column: string; direction: SortDirection; sql: string };
}

export interface NursePatientListQuery {
	range: DateRangeQuery;
	/** Patient-name search inside the nurse's population. */
	search: string | null;
	paging: PagingQuery;
	sort: { column: string; direction: SortDirection; sql: string };
}

/* ------------------------------------------------------------------ */
/* CTE + filter builders                                               */
/* ------------------------------------------------------------------ */

/**
 * The `(nurse, patient, work_date)` triples inside the range.
 *
 * `$1`/`$2` are the dates for every query in this model, so filter parameters
 * always start at `$3` — the detail/export statements rely on that alignment.
 *
 * `hours_worked` is `COALESCE`d because the column defaults but is nullable on
 * old rows; a `NULL` would poison `SUM` and print an empty hours cell.
 */
const PAIRS_CTE = `pairs AS (
	SELECT dsa.employee_id AS nurse_id,
	       dsa.patient_id,
	       p.name AS patient_name,
	       dsa.work_date,
	       COALESCE(dsa.hours_worked, 0) AS hours_worked
	FROM DailyStaffAssignment dsa
	JOIN Employee e ON e.employee_id = dsa.employee_id
	JOIN Patient p ON p.patient_id = dsa.patient_id
	WHERE e.employee_type = 'nurse'
	  AND dsa.work_date >= $1::date
	  AND dsa.work_date < ($2::date + ${END_EXCLUSIVE_OFFSET})
)`;

function buildNurseFilters(filters: NurseReportFilters): {
	where: string;
	params: unknown[];
} {
	const params: unknown[] = [filters.range.startDate, filters.range.endDate];
	const conditions: string[] = [];

	if (filters.nurseId !== null) {
		params.push(filters.nurseId);
		conditions.push(`pairs.nurse_id = $${params.length}`);
	}

	if (filters.search) {
		params.push(likePattern(filters.search));
		conditions.push(`e.name ILIKE $${params.length}`);
	}

	return {
		where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
		params,
	};
}

/** `filtered` CTE: pairs restricted to the nurses the user asked for. */
const FILTERED_CTE = `filtered AS (
	SELECT pairs.*
	FROM pairs
	JOIN Employee e ON e.employee_id = pairs.nurse_id
	WHERE_PLACEHOLDER
)`;

/** Per-nurse aggregates over `filtered`. */
const NURSE_AGG_CTE = `agg AS (
	SELECT nurse_id,
	       COUNT(DISTINCT patient_id)::int AS patients_count,
	       COUNT(DISTINCT work_date)::int AS days_worked,
	       COALESCE(SUM(hours_worked), 0) AS total_hours,
	       MAX(work_date) AS last_work_date
	FROM filtered
	GROUP BY nurse_id
)`;

/** Per-nurse, per-patient aggregates over `filtered`. */
const NURSE_PATIENT_AGG_CTE = `agg AS (
	SELECT nurse_id,
	       patient_id,
	       COUNT(DISTINCT work_date)::int AS days_assigned,
	       COALESCE(SUM(hours_worked), 0) AS hours_worked
	FROM filtered
	GROUP BY nurse_id, patient_id
)`;

/**
 * Latest admission **overlapping** the range for the row's patient.
 *
 * Overlap (not "admitted inside the range") is the point: a nurse's patients
 * are often admitted before the report window starts, and picking only
 * in-window admissions would show "-" for them. A `LATERAL` keeps admission,
 * discharge and diagnosis together — the legacy `MAX()` mix could pair one
 * stay's diagnosis with another stay's discharge date.
 */
const LATEST_ADMISSION_LATERAL = `LEFT JOIN LATERAL (
	SELECT ph.admission_time, ph.discharge_time, ph.diagnosis
	FROM PatientHistory ph
	WHERE ph.patient_id = agg.patient_id
	  AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})
	  AND (ph.discharge_time IS NULL OR ph.discharge_time >= $1::date)
	ORDER BY ph.admission_time DESC
	LIMIT 1
) latest ON true`;

/** Patient columns shared by the detail page and the export. */
const PATIENT_SELECT = `p.patient_id,
	p.name AS patient_name,
	p.payment_type,
	agg.days_assigned,
	agg.hours_worked,
	latest.admission_time AS last_admission_time,
	latest.discharge_time AS last_discharge_time,
	latest.diagnosis`;

const PATIENT_FROM = `FROM agg
	JOIN Patient p ON p.patient_id = agg.patient_id
	${LATEST_ADMISSION_LATERAL}`;

/**
 * One row per `(nurse, patient, work_date)` with the patient's latest
 * overlapping admission diagnosis — the raw material of the accordion.
 *
 * `$1`/`$2` = dates, `$3` = the nurse id array, optional `$4` = patient-name
 * pattern. The same statement serves the detail dialog (one id, search
 * honoured) and the export (all ids, no patient search), so the two can never
 * drift.
 */
const DAILY_ASSIGNMENTS_SQL = `SELECT dsa.employee_id AS nurse_id,
	       dsa.work_date,
	       dsa.patient_id,
	       p.name AS patient_name,
	       p.payment_type,
	       COALESCE(dsa.hours_worked, 0) AS hours_worked,
	       latest.diagnosis
	FROM DailyStaffAssignment dsa
	JOIN Employee e ON e.employee_id = dsa.employee_id
	JOIN Patient p ON p.patient_id = dsa.patient_id
	LEFT JOIN LATERAL (
		SELECT ph.diagnosis
		FROM PatientHistory ph
		WHERE ph.patient_id = dsa.patient_id
		  AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})
		  AND (ph.discharge_time IS NULL OR ph.discharge_time >= $1::date)
		ORDER BY ph.admission_time DESC
		LIMIT 1
	) latest ON true
	WHERE e.employee_type = 'nurse'
	  AND dsa.employee_id = ANY($3::int[])
	  AND dsa.work_date >= $1::date
	  AND dsa.work_date < ($2::date + ${END_EXCLUSIVE_OFFSET})
	  SEARCH_PLACEHOLDER
	ORDER BY dsa.work_date DESC, p.name ASC, dsa.patient_id ASC`;

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

function toNurseRow(raw: Record<string, unknown>): NurseReportRow {
	return {
		nurse_id: Number(raw.nurse_id),
		nurse_name: String(raw.nurse_name ?? ""),
		patients_count: Number(raw.patients_count ?? 0),
		days_worked: Number(raw.days_worked ?? 0),
		total_hours: roundTo(raw.total_hours, 2),
		last_work_date: toDbDateOnly(raw.last_work_date),
	};
}

function toPatientRow(raw: Record<string, unknown>): NursePatientRow {
	return {
		patient_id: Number(raw.patient_id),
		patient_name: String(raw.patient_name ?? ""),
		payment_type: String(raw.payment_type ?? "cash"),
		last_admission_time: toTimestampString(raw.last_admission_time),
		last_discharge_time: toTimestampString(raw.last_discharge_time),
		diagnosis: raw.diagnosis == null ? null : String(raw.diagnosis),
		days_assigned: Number(raw.days_assigned ?? 0),
		hours_worked: roundTo(raw.hours_worked, 2),
	};
}

function toSummary(raw: Record<string, unknown>): NurseReportSummary {
	return {
		total_nurses: Number(raw.total_nurses ?? 0),
		total_patients: Number(raw.total_patients ?? 0),
		total_patient_assignments: Number(raw.total_patient_assignments ?? 0),
		total_days: Number(raw.total_days ?? 0),
		total_hours: roundTo(raw.total_hours, 2),
	};
}

export default class NurseReportModel {
	/* -------------------------------------------------------------- */
	/* List                                                            */
	/* -------------------------------------------------------------- */

	/**
	 * One page of nurses with at least one assignment in the range, plus the
	 * summary of the **whole** filtered set.
	 *
	 * A nurse with no rows in `filtered` has no row in `agg`, so empty nurses
	 * are excluded by construction (no `HAVING` needed).
	 */
	static async listNurses(
		input: NurseReportListQuery
	): Promise<ReportListEnvelope<NurseReportSummary, NurseReportRow>> {
		const { where, params } = buildNurseFilters(input);

		const pageParams = [...params, input.paging.limit, input.paging.offset];
		const pageSql = `WITH ${PAIRS_CTE},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")},
			${NURSE_AGG_CTE}
			SELECT e.employee_id AS nurse_id,
			       e.name AS nurse_name,
			       a.patients_count,
			       a.days_worked,
			       a.total_hours,
			       a.last_work_date
			FROM agg a
			JOIN Employee e ON e.employee_id = a.nurse_id
			ORDER BY ${input.sort.sql}, e.name ASC, e.employee_id ASC
			LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

		const [pageResult, summary] = await Promise.all([
			query(pageSql, pageParams),
			NurseReportModel.getSummary(input),
		]);

		return {
			summary,
			data: pageResult.rows.map(toNurseRow),
			// Same rule as the patient/doctor tabs: the summary count is
			// authoritative, so the footer and the KPI card agree even when an
			// out-of-range page returns no rows.
			total: summary.total_nurses,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/**
	 * Summary over the whole filtered set.
	 *
	 * `total_patients` is deduplicated across nurses; the assignment and day
	 * figures are the additive per-nurse sums (see the module header).
	 */
	static async getSummary(
		filters: NurseReportFilters
	): Promise<NurseReportSummary> {
		const { where, params } = buildNurseFilters(filters);

		const sql = `WITH ${PAIRS_CTE},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")},
			per_nurse AS (
				SELECT nurse_id,
				       COUNT(DISTINCT patient_id)::int AS patients_count,
				       COUNT(DISTINCT work_date)::int AS days_worked,
				       COALESCE(SUM(hours_worked), 0) AS hours_worked
				FROM filtered
				GROUP BY nurse_id
			)
			SELECT (SELECT COUNT(*)::int FROM per_nurse) AS total_nurses,
			       (SELECT COUNT(DISTINCT patient_id)::int FROM filtered) AS total_patients,
			       (SELECT COALESCE(SUM(patients_count), 0)::int FROM per_nurse) AS total_patient_assignments,
			       (SELECT COALESCE(SUM(days_worked), 0)::int FROM per_nurse) AS total_days,
			       (SELECT COALESCE(SUM(hours_worked), 0) FROM per_nurse) AS total_hours`;

		const { rows } = await query(sql, params);
		return toSummary(rows[0] ?? {});
	}

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	/**
	 * One nurse: identity, summary, one page of their patients and the whole
	 * daily-assignment accordion.
	 *
	 * Three queries regardless of how many patients or days are involved.
	 * `search` narrows **patients** — and the daily assignments follow the same
	 * filter, so the accordion never lists a patient the table does not.
	 */
	static async getNurseDetail(
		nurseId: number,
		input: NursePatientListQuery
	): Promise<NurseDetailDTO> {
		const [header, patients, daily] = await Promise.all([
			NurseReportModel.getNurseSummary(nurseId, input),
			NurseReportModel.listNursePatients(nurseId, input),
			NurseReportModel.getDailyAssignments([nurseId], input.range, input.search),
		]);

		return {
			nurse: header.nurse,
			summary: header.summary,
			data: patients,
			daily_assignments: daily.get(nurseId) ?? [],
			// The header summary describes the same filtered set the page does.
			total: header.summary.patients,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/**
	 * Query 1 — nurse identity + summary.
	 *
	 * The `nurse` CTE filters `employee_type = 'nurse'`, so a doctor id is a
	 * 404 rather than an empty report (the same "wrong population" rule the
	 * doctor report applies to `relationship=supervised`).
	 */
	private static async getNurseSummary(
		nurseId: number,
		input: NursePatientListQuery
	): Promise<{
		nurse: { nurse_id: number; nurse_name: string };
		summary: NurseDetailDTO["summary"];
	}> {
		const params: unknown[] = [
			input.range.startDate,
			input.range.endDate,
			nurseId,
		];
		const conditions = ["nurse_id = $3"];

		if (input.search) {
			params.push(likePattern(input.search));
			conditions.push(`patient_name ILIKE $${params.length}`);
		}

		const sql = `WITH ${PAIRS_CTE},
			filtered AS (SELECT * FROM pairs WHERE ${conditions.join(" AND ")}),
			nurse AS (
				SELECT e.employee_id AS nurse_id, e.name AS nurse_name
				FROM Employee e
				WHERE e.employee_id = $3 AND e.employee_type = 'nurse'
			)
			SELECT nurse.nurse_id,
			       nurse.nurse_name,
			       (SELECT COUNT(DISTINCT patient_id)::int FROM filtered) AS patients,
			       (SELECT COUNT(DISTINCT work_date)::int FROM filtered) AS days,
			       (SELECT COALESCE(SUM(hours_worked), 0) FROM filtered) AS hours
			FROM nurse`;

		const { rows } = await query(sql, params);
		if (rows.length === 0) {
			throw new NotFoundError(`Nurse ${nurseId} not found`);
		}

		const row = rows[0];
		return {
			nurse: {
				nurse_id: Number(row.nurse_id),
				nurse_name: String(row.nurse_name ?? ""),
			},
			summary: {
				patients: Number(row.patients ?? 0),
				days: Number(row.days ?? 0),
				hours: roundTo(row.hours, 2),
			},
		};
	}

	/** Query 2 — one page of the nurse's patients. */
	private static async listNursePatients(
		nurseId: number,
		input: NursePatientListQuery
	): Promise<NursePatientRow[]> {
		const params: unknown[] = [
			input.range.startDate,
			input.range.endDate,
			nurseId,
		];
		const conditions = ["nurse_id = $3"];

		if (input.search) {
			params.push(likePattern(input.search));
			conditions.push(`patient_name ILIKE $${params.length}`);
		}

		const pageParams = [...params, input.paging.limit, input.paging.offset];
		const sql = `WITH ${PAIRS_CTE},
			filtered AS (SELECT * FROM pairs WHERE ${conditions.join(" AND ")}),
			${NURSE_PATIENT_AGG_CTE}
			SELECT ${PATIENT_SELECT}
			${PATIENT_FROM}
			ORDER BY ${input.sort.sql}, p.name ASC, p.patient_id ASC
			LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

		const { rows } = await query(sql, pageParams);
		return rows.map(toPatientRow);
	}

	/**
	 * Query 3 — every daily assignment for the given nurses, grouped by date.
	 *
	 * One statement for the whole accordion (and for the whole export). The
	 * result is `nurseId → days` with days newest-first and patients ordered by
	 * name inside a day, so the accordion is stable between renders.
	 */
	static async getDailyAssignments(
		nurseIds: number[],
		range: DateRangeQuery,
		search: string | null
	): Promise<Map<number, NurseDailyAssignment[]>> {
		const byNurse = new Map<number, NurseDailyAssignment[]>();
		if (nurseIds.length === 0) return byNurse;

		const params: unknown[] = [range.startDate, range.endDate, nurseIds];
		let searchSql = "";
		if (search) {
			params.push(likePattern(search));
			searchSql = `AND p.name ILIKE $${params.length}`;
		}

		const { rows } = await query(
			DAILY_ASSIGNMENTS_SQL.replace("SEARCH_PLACEHOLDER", searchSql),
			params
		);

		// Rows arrive ordered by date DESC then patient name, so pushing into
		// the per-date bucket preserves that order without a second sort.
		const buckets = new Map<number, Map<string, NurseDailyAssignment>>();

		for (const row of rows) {
			const nurseId = Number(row.nurse_id);
			const workDate = toDbDateOnly(row.work_date);
			if (!workDate) continue;

			let byDate = buckets.get(nurseId);
			if (!byDate) {
				byDate = new Map<string, NurseDailyAssignment>();
				buckets.set(nurseId, byDate);
			}

			let day = byDate.get(workDate);
			if (!day) {
				day = { work_date: workDate, patient_count: 0, total_hours: 0, patients: [] };
				byDate.set(workDate, day);
			}

			const hours = roundTo(row.hours_worked, 2);
			day.patients.push({
				patient_id: Number(row.patient_id),
				patient_name: String(row.patient_name ?? ""),
				payment_type: String(row.payment_type ?? "cash"),
				diagnosis: row.diagnosis == null ? null : String(row.diagnosis),
				hours_worked: hours,
			});
			day.patient_count = day.patients.length;
			day.total_hours = roundTo(day.total_hours + hours, 2);
		}

		for (const [nurseId, byDate] of buckets) {
			byNurse.set(nurseId, Array.from(byDate.values()));
		}

		return byNurse;
	}

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	/**
	 * Every nurse in the filtered set with every patient and every daily
	 * assignment — **four** queries, never one per nurse.
	 *
	 * The patient query is un-paged (the document is the whole report) but keeps
	 * the same `LATERAL` diagnosis and the same row mapper as the detail page.
	 * `search` keeps its list meaning here (nurse name), so the patient and
	 * daily queries run unsearched for exactly the nurses in `data`.
	 */
	static async exportNurses(
		input: NurseReportFilters & {
			sort: { column: string; direction: SortDirection; sql: string };
		}
	): Promise<ReportExportEnvelope<NurseReportSummary, NurseExportRow>> {
		const { where, params } = buildNurseFilters(input);

		const rowsSql = `WITH ${PAIRS_CTE},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")},
			${NURSE_AGG_CTE}
			SELECT e.employee_id AS nurse_id,
			       e.name AS nurse_name,
			       a.patients_count,
			       a.days_worked,
			       a.total_hours,
			       a.last_work_date
			FROM agg a
			JOIN Employee e ON e.employee_id = a.nurse_id
			ORDER BY ${input.sort.sql}, e.name ASC, e.employee_id ASC`;

		const [rowsResult, summary] = await Promise.all([
			query(rowsSql, params),
			NurseReportModel.getSummary(input),
		]);

		const rows = rowsResult.rows.map(toNurseRow);
		const nurseIds = rows.map((row) => row.nurse_id);

		const [patientsByNurse, dailyByNurse] = await Promise.all([
			NurseReportModel.getPatientsForNurses(nurseIds, input.range),
			NurseReportModel.getDailyAssignments(nurseIds, input.range, null),
		]);

		const data: NurseExportRow[] = rows.map((row) => ({
			nurse_id: row.nurse_id,
			nurse_name: row.nurse_name,
			totals: {
				patients: row.patients_count,
				days: row.days_worked,
				hours: row.total_hours,
			},
			patients: patientsByNurse.get(row.nurse_id) ?? [],
			daily_assignments: dailyByNurse.get(row.nurse_id) ?? [],
		}));

		return {
			generated_at: new Date().toISOString(),
			range: {
				start_date: input.range.startDate,
				end_date: input.range.endDate,
			},
			summary,
			data,
		};
	}

	/**
	 * Every `(nurse, patient)` row for the given nurses — one statement.
	 *
	 * Un-paged twin of `listNursePatients`: same aggregate, same `LATERAL`,
	 * same mapper, no `LIMIT`. Empty ids short-circuit so an empty report never
	 * sends `ANY('{}')` back to the database.
	 */
	private static async getPatientsForNurses(
		nurseIds: number[],
		range: DateRangeQuery
	): Promise<Map<number, NursePatientRow[]>> {
		const byNurse = new Map<number, NursePatientRow[]>();
		if (nurseIds.length === 0) return byNurse;

		const sql = `WITH ${PAIRS_CTE},
			filtered AS (SELECT * FROM pairs WHERE nurse_id = ANY($3::int[])),
			${NURSE_PATIENT_AGG_CTE}
			SELECT agg.nurse_id, ${PATIENT_SELECT}
			${PATIENT_FROM}
			ORDER BY agg.nurse_id ASC, p.name ASC, p.patient_id ASC`;

		const { rows } = await query(sql, [
			range.startDate,
			range.endDate,
			nurseIds,
		]);

		for (const row of rows) {
			const nurseId = Number(row.nurse_id);
			const list = byNurse.get(nurseId);
			if (list) list.push(toPatientRow(row));
			else byNurse.set(nurseId, [toPatientRow(row)]);
		}

		return byNurse;
	}
}
