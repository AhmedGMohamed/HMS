/**
 * Doctor report — Phase 6.11.2.
 *
 * Replaces the legacy doctor endpoints, which loaded the doctor list and then
 * ran **one patient query per doctor** (`getAllPatientsReferredByDoctors` →
 * `getPatientsReferredByDoctor` → `getDoctorPatientDetails`). The v2 model is
 * fixed-cost:
 *
 *   - `listDoctors`: 2 queries — the page and the whole-set summary, both
 *     built from the same `pairs` CTE so they can never disagree about which
 *     admissions belong to the report.
 *   - `getDoctorDetail`: 2 queries — doctor + summary (one statement), then
 *     one page of that doctor's patients.
 *   - `exportDoctors`: 3 queries without admission detail (doctors + summary
 *     in parallel, then every doctor's patients in one statement). A
 *     single-doctor export with `includeAdmissions` adds **four** more: one
 *     for the doctor's `(patient, admission)` pairs and the three batched
 *     admission queries from `PatientReportModel`, so the printed admission
 *     sections are exactly the stays the doctor is credited with.
 *
 * ## Relationships
 *
 *   - `referred`  — the patient's `referring_doctor_id` points at the doctor.
 *   - `attended`  — a `DoctorPatientHistory` row links the doctor to an
 *     admission in range.
 *   - `supervised` — the attended expression, restricted to doctors whose
 *     `doctor_type` is `supervising`. A supervising doctor's patient set is
 *     therefore identical to their attended set by construction; the report
 *     populations differ, which is why the relationship is echoed in the
 *     summary.
 *
 * ## What the summary counts
 *
 * The KPI strip describes the report population, not the sum of the rows: a
 * patient seen by three doctors is one unique patient, and an admission shared
 * by two doctors is one admission with one bill. `total_patient_assignments`
 * is the only additive figure (it is the sum of the per-doctor counts), which
 * is what makes "unique patients" and the per-doctor table reconcile.
 */

import { parseEgyptianNationalId } from "../../utils/nationalId.js";
import type {
	DoctorDetailDTO,
	DoctorExportRow,
	DoctorPatientRow,
	DoctorRelationship,
	DoctorReportRow,
	DoctorReportSummary,
	PatientReportAdmission,
	ReportExportEnvelope,
	ReportListEnvelope,
} from "../../utils/types/reportV2.js";
import { query } from "../database/connection.js";
import PatientReportModel from "./PatientReport.model.js";
import {
	END_EXCLUSIVE_OFFSET,
	NotFoundError,
	ReportValidationError,
	type DateRangeQuery,
	type PagingQuery,
	type SortDirection,
	likePattern,
	rangeEndLocalDate,
	roundMoney,
	toTimestampString,
} from "./shared.js";

/** Sort keys the doctor list accepts (`?sort=`). */
export const DOCTOR_SORT_COLUMNS = {
	name: "e.name",
	patients: "a.patients_count",
	admissions: "a.admissions_count",
	billed: "a.total_billed",
	paid: "a.total_paid",
} as const;

export type DoctorSortColumn = keyof typeof DOCTOR_SORT_COLUMNS;

/** Sort keys for the per-doctor patient table. */
export const DOCTOR_PATIENT_SORT_COLUMNS = {
	name: "p.name",
	admissions: "agg.admissions_count",
	billed: "agg.total_billed",
	paid: "agg.total_paid",
	last_admission: "latest.admission_time",
} as const;

export interface DoctorReportFilters {
	range: DateRangeQuery;
	relationship: DoctorRelationship;
	/** `null` = every doctor in the relationship. */
	doctorId: number | null;
	/** Matches the doctor's name. */
	search: string | null;
}

export interface DoctorReportListQuery extends DoctorReportFilters {
	paging: PagingQuery;
	sort: { column: string; direction: SortDirection; sql: string };
}

export interface DoctorPatientListQuery {
	range: DateRangeQuery;
	relationship: DoctorRelationship;
	/** Patient-name search inside the doctor's population. */
	search: string | null;
	paging: PagingQuery;
	sort: { column: string; direction: SortDirection; sql: string };
}

/* ------------------------------------------------------------------ */
/* CTE + filter builders                                               */
/* ------------------------------------------------------------------ */

/**
 * The relationship's `(doctor, patient, admission)` triples.
 *
 * `$1` = start date, `$2` = end date for every relationship, so the filter
 * parameters that follow always start at `$3`. One row per admission, which
 * is what makes the aggregates below plain `COUNT`/`SUM` (no fan-out).
 */
function buildPairsCte(relationship: DoctorRelationship): string {
	const inRange = `ph.admission_time >= $1::date
		AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})`;

	// `patient_name` is carried so the detail page can search patients without
	// re-joining `Patient` after the aggregate.
	const columns = `d.doctor_id,
		p.patient_id,
		p.name AS patient_name,
		ph.patient_history_id,
		ph.admission_time,
		ph.discharge_time,
		ph.diagnosis,
		COALESCE(b.total_amount, 0) AS billed,
		COALESCE(b.paid_amount, 0) AS paid`;

	if (relationship === "referred") {
		return `
		WITH pairs AS (
			SELECT ${columns}
			FROM Doctor d
			JOIN Patient p ON p.referring_doctor_id = d.doctor_id
			JOIN PatientHistory ph ON ph.patient_id = p.patient_id AND ${inRange}
			LEFT JOIN Bill b ON b.bill_id = ph.bill_id
		)`;
	}

	// `attended` and `supervised` share the join; only the doctor-type filter
	// differs (a supervising doctor attends, a supervising report is the same
	// population narrowed to supervising doctors).
	const supervising = relationship === "supervised";
	return `
		WITH pairs AS (
			SELECT ${columns}
			FROM Doctor d
			JOIN DoctorPatientHistory dph ON dph.doctor_id = d.doctor_id
			JOIN PatientHistory ph ON ph.patient_history_id = dph.patient_history_id AND ${inRange}
			JOIN Patient p ON p.patient_id = ph.patient_id
			LEFT JOIN Bill b ON b.bill_id = ph.bill_id
			${supervising ? "WHERE d.doctor_type = 'supervising'" : ""}
		)`;
}

interface FilterSql {
	/** `WHERE …` (or empty) over the `d` / `e` aliases. */
	where: string;
	params: unknown[];
}

/**
 * Doctor id + name filters. `$1`/`$2` are always the dates, so the first
 * filter lands on `$3` in every statement that uses the pairs CTE.
 */
function buildDoctorFilters(
	filters: Pick<DoctorReportFilters, "range" | "doctorId" | "search">
): FilterSql {
	const params: unknown[] = [filters.range.startDate, filters.range.endDate];
	const conditions: string[] = [];

	if (filters.doctorId) {
		params.push(filters.doctorId);
		conditions.push(`d.doctor_id = $${params.length}`);
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

/**
 * Detail filter — one doctor, optionally narrowed by patient name.
 *
 * `$1`/`$2` are the dates (the pairs CTE), `$3` is the doctor and any search
 * term follows, so both detail queries stay parameter-aligned.
 */
function buildDetailFilter(
	input: DoctorPatientListQuery,
	doctorId: number
): FilterSql {
	const params: unknown[] = [input.range.startDate, input.range.endDate, doctorId];
	const conditions = ["doctor_id = $3"];

	if (input.search) {
		params.push(likePattern(input.search));
		conditions.push(`patient_name ILIKE $${params.length}`);
	}

	return { where: `WHERE ${conditions.join(" AND ")}`, params };
}

/** `filtered` CTE: pairs restricted to the doctors the user asked for. */
const FILTERED_CTE = `filtered AS (
	SELECT pairs.*
	FROM pairs
	JOIN Doctor d ON d.doctor_id = pairs.doctor_id
	JOIN Employee e ON e.employee_id = pairs.doctor_id
	WHERE_PLACEHOLDER
)`;

/** Per-doctor aggregates over `filtered`. */
const DOCTOR_AGG_CTE = `agg AS (
	SELECT doctor_id,
	       COUNT(DISTINCT patient_id)::int AS patients_count,
	       COUNT(DISTINCT patient_history_id)::int AS admissions_count,
	       COALESCE(SUM(billed), 0) AS total_billed,
	       COALESCE(SUM(paid), 0) AS total_paid
	FROM filtered
	GROUP BY doctor_id
)`;

/** Per-doctor, per-patient aggregates over `filtered`. */
const PATIENT_AGG_CTE = `agg AS (
	SELECT doctor_id,
	       patient_id,
	       COUNT(DISTINCT patient_history_id)::int AS admissions_count,
	       COALESCE(SUM(billed), 0) AS total_billed,
	       COALESCE(SUM(paid), 0) AS total_paid
	FROM filtered
	GROUP BY doctor_id, patient_id
)`;

/**
 * Latest admission inside the range for the row's patient.
 *
 * A `LATERAL` (not `MAX(diagnosis)` / `MAX(discharge_time)`, which the legacy
 * query mixed from different admissions and could pair a diagnosis with the
 * wrong stay).
 */
const LATEST_ADMISSION_LATERAL = `LEFT JOIN LATERAL (
	SELECT ph.admission_time, ph.discharge_time, ph.diagnosis
	FROM PatientHistory ph
	WHERE ph.patient_id = agg.patient_id
	  AND ph.admission_time >= $1::date
	  AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})
	ORDER BY ph.admission_time DESC
	LIMIT 1
) latest ON true`;

/** Patient columns shared by the detail page and the export. */
const PATIENT_SELECT = `p.patient_id,
	p.name AS patient_name,
	p.national_id,
	p.gender,
	p.payment_type,
	p.insurance_card_id,
	p.insurance_form_id,
	ic.name AS insurance_company,
	agg.admissions_count,
	agg.total_billed,
	agg.total_paid,
	latest.admission_time AS last_admission_time,
	latest.discharge_time AS last_discharge_time,
	latest.diagnosis AS last_diagnosis`;

const PATIENT_FROM = `FROM agg
	JOIN Patient p ON p.patient_id = agg.patient_id
	LEFT JOIN InsuranceCompany ic ON ic.insurance_id = p.insurance_id
	${LATEST_ADMISSION_LATERAL}`;

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

/** Money is rounded once, at the boundary, so the sums stay consistent. */
function toDoctorRow(raw: Record<string, unknown>): DoctorReportRow {
	return {
		doctor_id: Number(raw.doctor_id),
		doctor_name: String(raw.doctor_name ?? ""),
		doctor_type: raw.doctor_type == null ? null : String(raw.doctor_type),
		patients_count: Number(raw.patients_count ?? 0),
		admissions_count: Number(raw.admissions_count ?? 0),
		total_billed: roundMoney(raw.total_billed),
		total_paid: roundMoney(raw.total_paid),
	};
}

function toPatientRow(
	raw: Record<string, unknown>,
	referenceDate: Date
): DoctorPatientRow {
	const nationalId =
		raw.national_id === null || raw.national_id === undefined
			? null
			: String(raw.national_id);
	const derived = parseEgyptianNationalId(nationalId, referenceDate);

	return {
		patient_id: Number(raw.patient_id),
		patient_name: String(raw.patient_name ?? ""),
		national_id: nationalId,
		gender: raw.gender == null ? null : String(raw.gender),
		age: derived?.age ?? null,
		payment_type: String(raw.payment_type ?? "cash"),
		insurance_company:
			raw.insurance_company == null ? null : String(raw.insurance_company),
		insurance_card_id:
			raw.insurance_card_id == null ? null : String(raw.insurance_card_id),
		insurance_form_id:
			raw.insurance_form_id == null ? null : String(raw.insurance_form_id),
		admissions_count: Number(raw.admissions_count ?? 0),
		total_billed: roundMoney(raw.total_billed),
		total_paid: roundMoney(raw.total_paid),
		last_admission_time: toTimestampString(raw.last_admission_time),
		last_discharge_time: toTimestampString(raw.last_discharge_time),
		last_diagnosis: raw.last_diagnosis == null ? null : String(raw.last_diagnosis),
	};
}

/** Counts, money and the relationship echo — never the row sums. */
function toSummary(
	raw: Record<string, unknown>,
	relationship: DoctorRelationship
): DoctorReportSummary {
	return {
		relationship,
		total_doctors: Number(raw.total_doctors ?? 0),
		total_patients: Number(raw.total_patients ?? 0),
		total_patient_assignments: Number(raw.total_patient_assignments ?? 0),
		total_admissions: Number(raw.total_admissions ?? 0),
		total_billed: roundMoney(raw.total_billed),
		total_paid: roundMoney(raw.total_paid),
	};
}

export default class DoctorReportModel {
	/* -------------------------------------------------------------- */
	/* List                                                            */
	/* -------------------------------------------------------------- */

	/**
	 * One page of doctors with at least one patient in the relationship and
	 * range, plus the summary of the **whole** filtered set.
	 */
	static async listDoctors(
		input: DoctorReportListQuery
	): Promise<ReportListEnvelope<DoctorReportSummary, DoctorReportRow>> {
		const { where, params } = buildDoctorFilters(input);
		const cte = buildPairsCte(input.relationship);

		const pageParams = [...params, input.paging.limit, input.paging.offset];
		const pageSql = `${cte},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")},
			${DOCTOR_AGG_CTE}
			SELECT d.doctor_id,
			       e.name AS doctor_name,
			       d.doctor_type,
			       a.patients_count,
			       a.admissions_count,
			       a.total_billed,
			       a.total_paid
			FROM agg a
			JOIN Doctor d ON d.doctor_id = a.doctor_id
			JOIN Employee e ON e.employee_id = d.doctor_id
			ORDER BY ${input.sort.sql}, e.name ASC, d.doctor_id ASC
			LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

		const [pageResult, summary] = await Promise.all([
			query(pageSql, pageParams),
			DoctorReportModel.getSummary(input),
		]);

		return {
			summary,
			data: pageResult.rows.map(toDoctorRow),
			// The summary count is authoritative: an out-of-range page returns
			// no rows, and a window function would report 0.
			total: summary.total_doctors,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/**
	 * Summary over the whole filtered set.
	 *
	 * `total_patients` / `total_admissions` / money are **deduplicated** across
	 * doctors (one patient, one admission, one bill), while
	 * `total_patient_assignments` is the additive per-doctor sum. That is the
	 * difference between "how big is the report population" and "how much work
	 * did the doctors do".
	 */
	static async getSummary(
		filters: DoctorReportFilters
	): Promise<DoctorReportSummary> {
		const { where, params } = buildDoctorFilters(filters);
		const cte = buildPairsCte(filters.relationship);

		const sql = `${cte},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")},
			per_doctor AS (
				SELECT doctor_id, COUNT(DISTINCT patient_id)::int AS patients_count
				FROM filtered
				GROUP BY doctor_id
			),
			admissions AS (
				SELECT DISTINCT patient_history_id, billed, paid FROM filtered
			)
			SELECT (SELECT COUNT(*)::int FROM per_doctor) AS total_doctors,
			       (SELECT COUNT(DISTINCT patient_id)::int FROM filtered) AS total_patients,
			       (SELECT COALESCE(SUM(patients_count), 0)::int FROM per_doctor) AS total_patient_assignments,
			       (SELECT COUNT(*)::int FROM admissions) AS total_admissions,
			       (SELECT COALESCE(SUM(billed), 0) FROM admissions) AS total_billed,
			       (SELECT COALESCE(SUM(paid), 0) FROM admissions) AS total_paid`;

		const { rows } = await query(sql, params);
		return toSummary(rows[0] ?? {}, filters.relationship);
	}

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	/**
	 * One doctor: identity, summary and one page of their patients.
	 *
	 * Two queries regardless of how many patients the doctor saw.
	 */
	static async getDoctorDetail(
		doctorId: number,
		input: DoctorPatientListQuery
	): Promise<DoctorDetailDTO> {
		const [header, patients] = await Promise.all([
			DoctorReportModel.getDoctorSummary(doctorId, input),
			DoctorReportModel.listDoctorPatients(doctorId, input),
		]);

		return {
			doctor: header.doctor,
			summary: header.summary,
			data: patients.rows,
			// The summary's patient count is the whole filtered set, so the
			// pagination footer cannot disagree with the KPI card.
			total: header.summary.patients,
			page: input.paging.page,
			page_size: input.paging.pageSize,
		};
	}

	/** Query 1 — doctor row + summary for that doctor. */
	private static async getDoctorSummary(
		doctorId: number,
		input: DoctorPatientListQuery
	): Promise<{
		doctor: { doctor_id: number; doctor_name: string; doctor_type: string | null };
		summary: DoctorDetailDTO["summary"];
	}> {
		const cte = buildPairsCte(input.relationship);
		const { where, params } = buildDetailFilter(input, doctorId);

		const sql = `${cte},
			filtered AS (SELECT * FROM pairs ${where}),
			doctor AS (
				SELECT d.doctor_id, e.name AS doctor_name, d.doctor_type
				FROM Doctor d
				JOIN Employee e ON e.employee_id = d.doctor_id
				WHERE d.doctor_id = $3
			)
			SELECT doctor.doctor_id,
			       doctor.doctor_name,
			       doctor.doctor_type,
			       (SELECT COUNT(DISTINCT patient_id)::int FROM filtered) AS patients,
			       (SELECT COUNT(DISTINCT patient_history_id)::int FROM filtered) AS admissions,
			       (SELECT COALESCE(SUM(billed), 0) FROM filtered) AS billed,
			       (SELECT COALESCE(SUM(paid), 0) FROM filtered) AS paid
			FROM doctor`;

		const { rows } = await query(sql, params);
		if (rows.length === 0) {
			throw new NotFoundError(`Doctor ${doctorId} not found`);
		}

		const row = rows[0];
		const doctorType = row.doctor_type == null ? null : String(row.doctor_type);

		// The supervised report is defined over supervising doctors only, so a
		// non-supervising id is a client mistake rather than an empty report.
		if (input.relationship === "supervised" && doctorType !== "supervising") {
			throw new ReportValidationError(
				"relationship=supervised requires a supervising doctor"
			);
		}

		return {
			doctor: {
				doctor_id: Number(row.doctor_id),
				doctor_name: String(row.doctor_name ?? ""),
				doctor_type: doctorType,
			},
			summary: {
				patients: Number(row.patients ?? 0),
				admissions: Number(row.admissions ?? 0),
				billed: roundMoney(row.billed),
				paid: roundMoney(row.paid),
			},
		};
	}

	/** Query 2 — one page of the doctor's patients. */
	private static async listDoctorPatients(
		doctorId: number,
		input: DoctorPatientListQuery
	): Promise<{ rows: DoctorPatientRow[] }> {
		const cte = buildPairsCte(input.relationship);
		const { where, params: filterParams } = buildDetailFilter(input, doctorId);
		const params = [
			...filterParams,
			input.paging.limit,
			input.paging.offset,
		];

		const sql = `${cte},
			filtered AS (SELECT * FROM pairs ${where}),
			${PATIENT_AGG_CTE}
			SELECT ${PATIENT_SELECT}
			${PATIENT_FROM}
			ORDER BY ${input.sort.sql}, p.name ASC, p.patient_id ASC
			LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`;

		const { rows } = await query(sql, params);
		const referenceDate = rangeEndLocalDate(input.range);
		return { rows: rows.map((row) => toPatientRow(row, referenceDate)) };
	}

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	/**
	 * Every doctor in the filtered set with every patient, plus — for a
	 * single-doctor export — each patient's admissions.
	 *
	 * `includeAdmissions` is only honoured together with `doctorId`: the
	 * all-doctors document is a summary report, and attaching every admission
	 * of every doctor's patients would multiply the payload for sections the
	 * document never prints.
	 */
	static async exportDoctors(
		input: DoctorReportFilters & {
			sort: { column: string; direction: SortDirection; sql: string };
			includeAdmissions: boolean;
		}
	): Promise<ReportExportEnvelope<DoctorReportSummary, DoctorExportRow>> {
		const { where, params } = buildDoctorFilters(input);
		const cte = buildPairsCte(input.relationship);

		const rowsSql = `${cte},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")},
			${DOCTOR_AGG_CTE}
			SELECT d.doctor_id,
			       e.name AS doctor_name,
			       d.doctor_type,
			       a.patients_count,
			       a.admissions_count,
			       a.total_billed,
			       a.total_paid
			FROM agg a
			JOIN Doctor d ON d.doctor_id = a.doctor_id
			JOIN Employee e ON e.employee_id = d.doctor_id
			ORDER BY ${input.sort.sql}, e.name ASC, d.doctor_id ASC`;

		const [rowsResult, summary] = await Promise.all([
			query(rowsSql, params),
			DoctorReportModel.getSummary(input),
		]);

		const doctors = rowsResult.rows.map(toDoctorRow);
		const patientsByDoctor = await DoctorReportModel.getPatientsByDoctor(
			input,
			doctors.map((doctor) => doctor.doctor_id)
		);

		const patientIds = new Set<number>();
		for (const list of patientsByDoctor.values()) {
			for (const patient of list) patientIds.add(patient.patient_id);
		}

		// Only the single-doctor document prints admission sections, so only it
		// pays for them. `pairRefs` keeps the sections aligned with the counts:
		// an attending doctor credited with one of a patient's three stays must
		// not print the other two under their name.
		const attachAdmissions = input.includeAdmissions && input.doctorId !== null;
		const [withAdmissions, pairRefs] = attachAdmissions
			? await Promise.all([
					PatientReportModel.getAdmissionsByPatient(
						[...patientIds],
						input.range
					),
					DoctorReportModel.getPairRefs(input),
				])
			: [null, null];

		const admissionsFor = (
			doctorId: number,
			patientId: number
		): PatientReportAdmission[] => {
			if (withAdmissions === null) return [];
			const allowed = pairRefs?.get(doctorId)?.get(patientId);
			const admissions = withAdmissions.get(patientId) ?? [];
			// `allowed` is undefined only when the doctor has no pair for the
			// patient, which cannot happen for a row in this export — but an empty
			// list is the safe reading rather than printing unearned stays.
			if (!allowed) return [];
			return admissions.filter((admission) =>
				allowed.has(admission.patient_history_id)
			);
		};

		const data: DoctorExportRow[] = doctors.map((doctor) => {
			const patients = patientsByDoctor.get(doctor.doctor_id) ?? [];
			return {
				doctor_id: doctor.doctor_id,
				doctor_name: doctor.doctor_name,
				doctor_type: doctor.doctor_type,
				// Totals come from the doctor row's SQL aggregate (authoritative,
				// identical to the index row), never re-summed from the patients.
				totals: {
					patients: doctor.patients_count,
					admissions: doctor.admissions_count,
					billed: doctor.total_billed,
					paid: doctor.total_paid,
				},
				patients:
					withAdmissions === null
						? patients
						: patients.map((patient) => ({
								...patient,
								admissions: admissionsFor(doctor.doctor_id, patient.patient_id),
							})),
			};
		});

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
	 * `(doctorId → patientId → admission ids)` for the filtered set.
	 *
	 * One statement over the same CTE as the list, used only by the
	 * single-doctor export so its admission sections match the row counts.
	 */
	private static async getPairRefs(
		filters: DoctorReportFilters
	): Promise<Map<number, Map<number, Set<number>>>> {
		const { where, params } = buildDoctorFilters(filters);
		const cte = buildPairsCte(filters.relationship);

		const sql = `${cte},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")}
			SELECT doctor_id, patient_id, patient_history_id
			FROM filtered`;

		const { rows } = await query(sql, params);
		const byDoctor = new Map<number, Map<number, Set<number>>>();

		for (const row of rows) {
			const doctorId = Number(row.doctor_id);
			const patientId = Number(row.patient_id);
			const admissionId = Number(row.patient_history_id);
			let byPatient = byDoctor.get(doctorId);
			if (!byPatient) {
				byPatient = new Map<number, Set<number>>();
				byDoctor.set(doctorId, byPatient);
			}
			const admissions = byPatient.get(patientId);
			if (admissions) admissions.add(admissionId);
			else byPatient.set(patientId, new Set([admissionId]));
		}

		return byDoctor;
	}

	/**
	 * Every patient of every doctor in **one** statement, grouped by doctor.
	 *
	 * The doctor ids are passed as `ANY(ids)` so the export never runs a query
	 * per doctor (the legacy `getAllPatientsReferredByDoctors` did exactly
	 * that).
	 */
	private static async getPatientsByDoctor(
		filters: DoctorReportFilters,
		doctorIds: number[]
	): Promise<Map<number, DoctorPatientRow[]>> {
		const grouped = new Map<number, DoctorPatientRow[]>();
		if (doctorIds.length === 0) return grouped;

		const { where, params } = buildDoctorFilters(filters);
		const cte = buildPairsCte(filters.relationship);
		const idsParam = params.length + 1;

		const sql = `${cte},
			${FILTERED_CTE.replace("WHERE_PLACEHOLDER", where || "WHERE true")},
			selected AS (
				SELECT * FROM filtered WHERE doctor_id = ANY($${idsParam}::int[])
			),
			agg AS (
				SELECT doctor_id,
				       patient_id,
				       COUNT(DISTINCT patient_history_id)::int AS admissions_count,
				       COALESCE(SUM(billed), 0) AS total_billed,
				       COALESCE(SUM(paid), 0) AS total_paid
				FROM selected
				GROUP BY doctor_id, patient_id
			)
			SELECT agg.doctor_id,
			       ${PATIENT_SELECT}
			${PATIENT_FROM}
			ORDER BY agg.doctor_id, p.name ASC, p.patient_id ASC`;

		const { rows } = await query(sql, [...params, doctorIds]);
		const referenceDate = rangeEndLocalDate(filters.range);

		for (const row of rows) {
			const doctorId = Number(row.doctor_id);
			const patient = toPatientRow(row, referenceDate);
			const list = grouped.get(doctorId);
			if (list) list.push(patient);
			else grouped.set(doctorId, [patient]);
		}

		return grouped;
	}
}
