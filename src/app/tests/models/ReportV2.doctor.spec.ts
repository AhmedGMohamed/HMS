// src/app/tests/models/ReportV2.doctor.spec.ts
//
// Phase 6.11.2 — doctor report. Covers the relationship populations
// (referred / attended / supervised), the deduplicated summary, paging,
// sorting, the half-open end-date window, the two-query detail and the
// single-doctor export (with and without admission sections).

import DoctorReportModel, {
	DOCTOR_PATIENT_SORT_COLUMNS,
	DOCTOR_SORT_COLUMNS,
	type DoctorPatientListQuery,
	type DoctorReportListQuery,
} from "../../models/reports/DoctorReport.model.js";
import {
	NotFoundError,
	ReportValidationError,
	parseSort,
} from "../../models/reports/shared.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Local `YYYY-MM-DD` (never `toISOString()` — that is the UTC date). */
function localDate(offsetDays = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD HH:MM:SS` for a local calendar date. */
function localStamp(offsetDays: number, time = "10:00:00"): string {
	return `${localDate(offsetDays)} ${time}`;
}

const TODAY = localDate(0);
const YESTERDAY = localDate(-1);
const RANGE_START = localDate(-30);
const RANGE_END = TODAY;

const RANGE = { startDate: RANGE_START, endDate: RANGE_END };

const DOCTOR_SORT_DEFAULT = {
	column: "name",
	direction: "asc" as const,
	sql: "e.name ASC",
};
const PATIENT_SORT_DEFAULT = {
	column: "name",
	direction: "asc" as const,
	sql: "p.name ASC",
};
const PAGING = { page: 1, pageSize: 25, offset: 0, limit: 25 };

interface Fixture {
	data: TestData;
	/** Seeded attending doctor (Dr. John Smith). */
	attending: number;
	/** Seeded referring doctor (Dr. Sarah Johnson) — refers patients A and B. */
	referring: number;
	/** Extra doctor: second referrer (Dr. Adam Referrer) — refers patient C. */
	secondReferring: number;
	/** Extra doctor: the only supervising doctor in the data set. */
	supervising: number;
	patientA: number;
	patientB: number;
	patientC: number;
	admissionA: number;
	admissionB: number;
	/** Patient B's second in-range stay, on the end date at 13:00. */
	admissionBToday: number;
	admissionC: number;
}

/**
 * Populations built by the fixture (range `[start, end]`):
 *
 *   referred    Sarah → A, B (3 admissions); Adam → C (1 admission)
 *   attended    Attending → A, B (first stay), C; Supervising → A
 *   supervised  Supervising → A
 *
 * So the attended list has two doctors over three unique patients with four
 * assignments and three unique admissions — the deduplication case.
 */
async function buildFixture(data: TestData): Promise<Fixture> {
	const attending = data.doctors[0].doctor_id;
	const referring = data.doctors[1].doctor_id;

	const extraEmployees = await query(
		`INSERT INTO Employee (
		     name, phone, is_facility_employee, hire_date, is_active, employee_type
		 ) VALUES
		     ('Dr. Adam Referrer', '5550000001', false,
		      CURRENT_DATE - INTERVAL '1 year', true, 'doctor'),
		     ('Dr. Zoe Supervisor', '5550000002', false,
		      CURRENT_DATE - INTERVAL '1 year', true, 'doctor')
		 RETURNING employee_id`
	);
	const extraDoctors = await query(
		`INSERT INTO Doctor (doctor_id, doctor_type, is_active)
		 VALUES ($1, 'referring', true), ($2, 'supervising', true)
		 RETURNING doctor_id, doctor_type`,
		[extraEmployees.rows[0].employee_id, extraEmployees.rows[1].employee_id]
	);
	const secondReferring = Number(extraDoctors.rows[0].doctor_id);
	const supervising = Number(extraDoctors.rows[1].doctor_id);

	const patientA = data.patients[0].patient_id;
	const patientB = data.patients[1].patient_id;
	const patientC = data.patients[2].patient_id;

	// Patient C switches referrer so the referred list can paginate.
	await query(`UPDATE Patient SET referring_doctor_id = $2 WHERE patient_id = $1`, [
		patientC,
		secondReferring,
	]);

	// Deterministic admission windows. A is still admitted; B's first stay is
	// discharged; B also has a stay late on the report's end date.
	await query(
		`UPDATE PatientHistory
		    SET admission_time = $2::timestamp,
		        discharge_time = NULL,
		        bill_id = $3,
		        diagnosis = 'Pneumonia'
		  WHERE patient_history_id = $1`,
		[data.patientHistories[0].patient_history_id, localStamp(-3), data.bills[0].bill_id]
	);
	await query(
		`UPDATE PatientHistory
		    SET admission_time = $2::timestamp,
		        discharge_time = $3::timestamp,
		        bill_id = $4,
		        diagnosis = 'Observation'
		  WHERE patient_history_id = $1`,
		[
			data.patientHistories[1].patient_history_id,
			localStamp(-2, "09:00:00"),
			localStamp(-1, "12:00:00"),
			data.bills[1].bill_id,
		]
	);

	const insertAdmission = async (
		patientId: number,
		admission: string,
		discharge: string | null,
		diagnosis: string
	): Promise<number> => {
		const result = await query(
			`INSERT INTO PatientHistory
			     (patient_id, quick_check, diagnosis, admission_time, discharge_time)
			 VALUES ($1, false, $4, $2::timestamp, $3::timestamp)
			 RETURNING patient_history_id`,
			[patientId, admission, discharge, diagnosis]
		);
		return Number(result.rows[0].patient_history_id);
	};

	const admissionC = await insertAdmission(
		patientC,
		localStamp(-20, "14:00:00"),
		localStamp(-18, "09:00:00"),
		"Recovery"
	);
	// Outside the range: must never appear in any population.
	await insertAdmission(
		patientA,
		localStamp(-60, "10:00:00"),
		localStamp(-58, "10:00:00"),
		"Old stay"
	);
	const admissionBToday = await insertAdmission(
		patientB,
		localStamp(0, "13:00:00"),
		null,
		"Today review"
	);

	// Doctors present at each admission.
	const admissionA = data.patientHistories[0].patient_history_id;
	const admissionB = data.patientHistories[1].patient_history_id;
	await query(
		`INSERT INTO DoctorPatientHistory (patient_history_id, doctor_id)
		 VALUES ($1, $2), ($3, $2), ($4, $2), ($1, $5)`,
		[admissionA, attending, admissionB, admissionC, supervising]
	);

	return {
		data,
		attending,
		referring,
		secondReferring,
		supervising,
		patientA,
		patientB,
		patientC,
		admissionA,
		admissionB,
		admissionBToday,
		admissionC,
	};
}

function listQuery(
	overrides: Partial<DoctorReportListQuery> = {}
): DoctorReportListQuery {
	return {
		range: RANGE,
		relationship: "referred",
		doctorId: null,
		search: null,
		paging: PAGING,
		sort: DOCTOR_SORT_DEFAULT,
		...overrides,
	};
}

function patientQuery(
	overrides: Partial<DoctorPatientListQuery> = {}
): DoctorPatientListQuery {
	return {
		range: RANGE,
		relationship: "referred",
		search: null,
		paging: PAGING,
		sort: PATIENT_SORT_DEFAULT,
		...overrides,
	};
}

/* ------------------------------------------------------------------ */
/* Specs                                                               */
/* ------------------------------------------------------------------ */

describe("Reports v2 — doctor report", () => {
	let fixture: Fixture;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		const data = await dbHelper.seedDatabase();
		fixture = await buildFixture(data);
	});

	/* -------------------------------------------------------------- */
	/* List                                                            */
	/* -------------------------------------------------------------- */

	describe("listDoctors", () => {
		it("lists referred doctors with their patient roll-ups", async () => {
			const result = await DoctorReportModel.listDoctors(listQuery());

			expect(result.total).toBe(2);
			expect(result.page).toBe(1);
			expect(result.page_size).toBe(25);
			expect(result.data.map((row) => row.doctor_name)).toEqual([
				"Dr. Adam Referrer",
				"Dr. Sarah Johnson",
			]);

			const sarah = result.data[1];
			expect(sarah.doctor_id).toBe(fixture.referring);
			expect(sarah.doctor_type).toBe("referring");
			expect(sarah.patients_count).toBe(2);
			// A (-3), B (-2) and B again late on the end date.
			expect(sarah.admissions_count).toBe(3);
			expect(sarah.total_billed).toBe(2300);
			expect(sarah.total_paid).toBe(1800);

			const adam = result.data[0];
			expect(adam.patients_count).toBe(1);
			expect(adam.admissions_count).toBe(1);
			expect(adam.total_billed).toBe(0);
			expect(adam.total_paid).toBe(0);
		});

		it("summarizes the whole filtered set with deduplicated patients and admissions", async () => {
			const result = await DoctorReportModel.listDoctors(listQuery());
			const { summary } = result;

			expect(summary.relationship).toBe("referred");
			expect(summary.total_doctors).toBe(2);
			expect(summary.total_patients).toBe(3);
			// Sarah's two plus Adam's one.
			expect(summary.total_patient_assignments).toBe(3);
			// A, B (-2), B (end date at 13:00), C.
			expect(summary.total_admissions).toBe(4);
			expect(summary.total_billed).toBe(2300);
			expect(summary.total_paid).toBe(1800);
		});

		it("deduplicates patients, admissions and bills across doctors", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ relationship: "attended" })
			);

			expect(result.total).toBe(2);
			const byName = new Map(
				result.data.map((row) => [row.doctor_name, row])
			);
			const attending = byName.get("Dr. John Smith");
			const supervising = byName.get("Dr. Zoe Supervisor");

			expect(attending?.patients_count).toBe(3);
			expect(attending?.admissions_count).toBe(3);
			expect(supervising?.patients_count).toBe(1);
			expect(supervising?.admissions_count).toBe(1);

			// Three patients, four assignments, three unique admissions:
			// patient A is attended by both doctors but counted once.
			expect(result.summary.total_patients).toBe(3);
			expect(result.summary.total_patient_assignments).toBe(4);
			expect(result.summary.total_admissions).toBe(3);
			expect(result.summary.total_billed).toBe(2300);
			expect(result.summary.total_paid).toBe(1800);
		});

		it("restricts the supervised population to supervising doctors", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ relationship: "supervised" })
			);

			expect(result.total).toBe(1);
			expect(result.data[0].doctor_id).toBe(fixture.supervising);
			expect(result.data[0].doctor_type).toBe("supervising");
			expect(result.data[0].patients_count).toBe(1);
			expect(result.data[0].admissions_count).toBe(1);
			expect(result.summary.relationship).toBe("supervised");
			expect(result.summary.total_doctors).toBe(1);
		});

		it("filters to one doctor", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ doctorId: fixture.referring })
			);

			expect(result.data.length).toBe(1);
			expect(result.data[0].doctor_id).toBe(fixture.referring);
			// The summary describes the filter, not the unfiltered set.
			expect(result.summary.total_patients).toBe(2);
			expect(result.summary.total_doctors).toBe(1);
			expect(result.total).toBe(1);
		});

		it("searches by doctor name", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ relationship: "attended", search: "john" })
			);

			expect(result.data.length).toBe(1);
			expect(result.data[0].doctor_id).toBe(fixture.attending);
			expect(result.total).toBe(1);
		});

		it("paginates without losing the whole-set total", async () => {
			const first = await DoctorReportModel.listDoctors(
				listQuery({
					paging: { page: 1, pageSize: 1, offset: 0, limit: 1 },
				})
			);
			const second = await DoctorReportModel.listDoctors(
				listQuery({
					paging: { page: 2, pageSize: 1, offset: 1, limit: 1 },
				})
			);
			const pastEnd = await DoctorReportModel.listDoctors(
				listQuery({
					paging: { page: 9, pageSize: 1, offset: 8, limit: 1 },
				})
			);

			expect(first.data.map((row) => row.doctor_name)).toEqual([
				"Dr. Adam Referrer",
			]);
			expect(second.data.map((row) => row.doctor_name)).toEqual([
				"Dr. Sarah Johnson",
			]);
			expect(pastEnd.data).toEqual([]);
			// An out-of-range page must not collapse the pagination footer.
			expect(pastEnd.total).toBe(2);
		});

		it("sorts by every whitelisted column", async () => {
			const byPatients = await DoctorReportModel.listDoctors(
				listQuery({
					sort: parseSort(
						{ sort: "patients", dir: "desc" },
						DOCTOR_SORT_COLUMNS,
						"name"
					),
				})
			);
			expect(byPatients.data[0].doctor_id).toBe(fixture.referring);

			const byBilled = await DoctorReportModel.listDoctors(
				listQuery({
					sort: parseSort(
						{ sort: "billed", dir: "desc" },
						DOCTOR_SORT_COLUMNS,
						"name"
					),
				})
			);
			expect(byBilled.data[0].doctor_id).toBe(fixture.referring);
		});

		it("rejects an unknown sort column instead of interpolating it", () => {
			expect(() =>
				parseSort(
					{ sort: "drop table" },
					DOCTOR_SORT_COLUMNS,
					"name"
				)
			).toThrowError(ReportValidationError);
		});

		it("includes a stay that started late on the end date", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ doctorId: fixture.referring })
			);
			expect(result.data[0].admissions_count).toBe(3);
		});

		it("excludes the end date entirely when the range stops the day before", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ range: { startDate: RANGE_START, endDate: YESTERDAY } })
			);

			const sarah = result.data.find(
				(row) => row.doctor_id === fixture.referring
			);
			expect(sarah?.admissions_count).toBe(2);
			expect(result.summary.total_admissions).toBe(3);
		});

		it("excludes stays outside the range", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ doctorId: fixture.referring })
			);

			// Patient A also has a 60-day-old stay; it is not counted.
			expect(result.data[0].admissions_count).toBe(3);
		});

		it("returns an empty report (and zeros) when nothing matches", async () => {
			const result = await DoctorReportModel.listDoctors(
				listQuery({ doctorId: fixture.supervising, relationship: "referred" })
			);

			expect(result.data).toEqual([]);
			expect(result.total).toBe(0);
			expect(result.summary.total_doctors).toBe(0);
			expect(result.summary.total_patients).toBe(0);
			expect(result.summary.total_patient_assignments).toBe(0);
			expect(result.summary.total_admissions).toBe(0);
			expect(result.summary.total_billed).toBe(0);
			expect(result.summary.total_paid).toBe(0);
		});
	});

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	describe("getDoctorDetail", () => {
		it("returns the doctor, the summary and one page of patients", async () => {
			const result = await DoctorReportModel.getDoctorDetail(
				fixture.referring,
				patientQuery()
			);

			expect(result.doctor).toEqual({
				doctor_id: fixture.referring,
				doctor_name: "Dr. Sarah Johnson",
				doctor_type: "referring",
			});
			expect(result.summary).toEqual({
				patients: 2,
				admissions: 3,
				billed: 2300,
				paid: 1800,
			});
			expect(result.total).toBe(2);
			expect(result.data.map((row) => row.patient_name)).toEqual([
				"Bob Johnson",
				"John Patient",
			]);
		});

		it("surfaces the latest admission, discharge and diagnosis", async () => {
			const result = await DoctorReportModel.getDoctorDetail(
				fixture.referring,
				patientQuery()
			);
			const bob = result.data[0];
			const john = result.data[1];

			expect(bob.admissions_count).toBe(2);
			expect(bob.total_billed).toBe(800);
			expect(bob.total_paid).toBe(800);
			expect(bob.last_admission_time).not.toBeNull();
			expect(bob.last_admission_time?.startsWith(RANGE_END)).toBe(true);
			expect(bob.last_discharge_time).toBeNull();
			expect(bob.last_diagnosis).toBe("Today review");

			expect(john.admissions_count).toBe(1);
			expect(john.total_billed).toBe(1500);
			expect(john.total_paid).toBe(1000);
			expect(john.last_discharge_time).toBeNull();
			expect(john.last_diagnosis).toBe("Pneumonia");
		});

		it("exposes the insurance identity for an insurance patient", async () => {
			const result = await DoctorReportModel.getDoctorDetail(
				fixture.secondReferring,
				patientQuery()
			);

			expect(result.data.length).toBe(1);
			const patient = result.data[0];
			expect(patient.patient_name).toBe("Sarah Insurance");
			expect(patient.payment_type).toBe("insurance");
			expect(patient.insurance_company).toBe("MediCare Insurance");
			expect(patient.insurance_card_id).toBe("INS123456");
		});

		it("searches the doctor's patients by name", async () => {
			const result = await DoctorReportModel.getDoctorDetail(
				fixture.referring,
				patientQuery({ search: "john p" })
			);

			expect(result.data.length).toBe(1);
			expect(result.data[0].patient_id).toBe(fixture.patientA);
			// The summary follows the search so the KPIs match the table.
			expect(result.summary.patients).toBe(1);
			expect(result.summary.admissions).toBe(1);
			expect(result.summary.billed).toBe(1500);
			expect(result.total).toBe(1);
		});

		it("paginates the patient table with the full total", async () => {
			const second = await DoctorReportModel.getDoctorDetail(
				fixture.referring,
				patientQuery({
					paging: { page: 2, pageSize: 1, offset: 1, limit: 1 },
				})
			);

			expect(second.data.map((row) => row.patient_name)).toEqual([
				"John Patient",
			]);
			expect(second.total).toBe(2);
			expect(second.summary.patients).toBe(2);
		});

		it("sorts patients by the latest admission", async () => {
			const result = await DoctorReportModel.getDoctorDetail(
				fixture.referring,
				patientQuery({
					sort: parseSort(
						{ sort: "last_admission", dir: "desc" },
						DOCTOR_PATIENT_SORT_COLUMNS,
						"name"
					),
				})
			);

			expect(result.data[0].patient_name).toBe("Bob Johnson");
		});

		it("returns the doctor header with zeros when the doctor has no patients in range", async () => {
			const result = await DoctorReportModel.getDoctorDetail(
				fixture.referring,
				patientQuery({ relationship: "attended" })
			);

			expect(result.doctor.doctor_name).toBe("Dr. Sarah Johnson");
			expect(result.data).toEqual([]);
			expect(result.summary).toEqual({
				patients: 0,
				admissions: 0,
				billed: 0,
				paid: 0,
			});
		});

		it("throws NotFoundError for an unknown doctor", async () => {
			await expectAsync(
				DoctorReportModel.getDoctorDetail(9_999_999, patientQuery())
			).toBeRejectedWithError(NotFoundError);
		});

		it("rejects a supervised report for a non-supervising doctor", async () => {
			await expectAsync(
				DoctorReportModel.getDoctorDetail(
					fixture.attending,
					patientQuery({ relationship: "supervised" })
				)
			).toBeRejectedWithError(
				ReportValidationError,
				"relationship=supervised requires a supervising doctor"
			);
		});

		it("accepts a supervised report for a supervising doctor", async () => {
			const result = await DoctorReportModel.getDoctorDetail(
				fixture.supervising,
				patientQuery({ relationship: "supervised" })
			);

			expect(result.doctor.doctor_type).toBe("supervising");
			expect(result.summary.patients).toBe(1);
			expect(result.summary.admissions).toBe(1);
		});
	});

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	describe("exportDoctors", () => {
		it("returns every matching doctor with their patients and totals", async () => {
			const result = await DoctorReportModel.exportDoctors({
				...listQuery(),
				sort: DOCTOR_SORT_DEFAULT,
				includeAdmissions: false,
			});

			expect(result.range).toEqual({
				start_date: RANGE_START,
				end_date: RANGE_END,
			});
			expect(result.summary.total_doctors).toBe(2);
			expect(result.data.length).toBe(2);

			const sarah = result.data[1];
			expect(sarah.doctor_name).toBe("Dr. Sarah Johnson");
			expect(sarah.totals).toEqual({
				patients: 2,
				admissions: 3,
				billed: 2300,
				paid: 1800,
			});
			expect(sarah.patients.map((patient) => patient.patient_name)).toEqual([
				"Bob Johnson",
				"John Patient",
			]);
			// Without `include_admissions` the patients carry no admission data.
			expect(sarah.patients[0].admissions).toBeUndefined();
		});

		it("applies the same filters as the list", async () => {
			const result = await DoctorReportModel.exportDoctors({
				...listQuery({ relationship: "attended", search: "zoe" }),
				sort: DOCTOR_SORT_DEFAULT,
				includeAdmissions: false,
			});

			expect(result.data.length).toBe(1);
			expect(result.data[0].doctor_id).toBe(fixture.supervising);
			expect(result.summary.total_doctors).toBe(1);
		});

		it("attaches the doctor's admissions for a single-doctor export", async () => {
			const result = await DoctorReportModel.exportDoctors({
				...listQuery({ doctorId: fixture.referring }),
				sort: DOCTOR_SORT_DEFAULT,
				includeAdmissions: true,
			});

			expect(result.data.length).toBe(1);
			const patients = result.data[0].patients;
			const bob = patients.find((p) => p.patient_id === fixture.patientB);
			const john = patients.find((p) => p.patient_id === fixture.patientA);

			expect(john?.admissions?.length).toBe(1);
			expect(john?.admissions?.[0].patient_history_id).toBe(fixture.admissionA);
			expect(john?.admissions?.[0].final_total).toBe(1500);
			expect(john?.admissions?.[0].paid_amount).toBe(1000);
			expect(john?.admissions?.[0].items_by_date.length).toBeGreaterThan(0);

			expect(bob?.admissions?.length).toBe(2);
			// Newest first, as the patient model orders them.
			expect(bob?.admissions?.[0].patient_history_id).toBe(
				fixture.admissionBToday
			);
		});

		it("keeps the printed admissions equal to the counted ones", async () => {
			const result = await DoctorReportModel.exportDoctors({
				...listQuery({
					doctorId: fixture.attending,
					relationship: "attended",
				}),
				sort: DOCTOR_SORT_DEFAULT,
				includeAdmissions: true,
			});

			const doctor = result.data[0];
			expect(doctor.doctor_name).toBe("Dr. John Smith");

			const printed = doctor.patients.reduce(
				(total, patient) => total + (patient.admissions?.length ?? 0),
				0
			);
			// Patient B has a second in-range stay the doctor did not attend; it
			// must not be printed under this doctor.
			expect(printed).toBe(doctor.totals.admissions);
			const bob = doctor.patients.find((p) => p.patient_id === fixture.patientB);
			expect(bob?.admissions?.length).toBe(1);
			expect(bob?.admissions?.[0].patient_history_id).toBe(fixture.admissionB);
		});

		it("ignores include_admissions without a doctor id", async () => {
			const result = await DoctorReportModel.exportDoctors({
				...listQuery(),
				sort: DOCTOR_SORT_DEFAULT,
				includeAdmissions: true,
			});

			for (const doctor of result.data) {
				for (const patient of doctor.patients) {
					expect(patient.admissions).toBeUndefined();
				}
			}
		});

		it("does not attach admissions that fall outside the range", async () => {
			const result = await DoctorReportModel.exportDoctors({
				...listQuery({ doctorId: fixture.referring }),
				sort: DOCTOR_SORT_DEFAULT,
				includeAdmissions: true,
			});

			const john = result.data[0].patients.find(
				(p) => p.patient_id === fixture.patientA
			);
			expect(john?.admissions?.length).toBe(1);
		});
	});
});
