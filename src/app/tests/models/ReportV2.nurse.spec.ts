// src/app/tests/models/ReportV2.nurse.spec.ts
//
// Phase 6.11.3 — nurse report. Covers which employees are in the population
// (nurses only, in range), the deduplicated summary, day/hour roll-ups, the
// daily-assignment accordion, patient search, the overlapping-admission
// diagnosis, paging/sorting and the four-query export.

import NurseReportModel, {
	NURSE_PATIENT_SORT_COLUMNS,
	NURSE_SORT_COLUMNS,
	type NursePatientListQuery,
	type NurseReportListQuery,
} from "../../models/reports/NurseReport.model.js";
import { NotFoundError } from "../../models/reports/shared.js";
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

function localStamp(offsetDays: number, time = "10:00:00"): string {
	return `${localDate(offsetDays)} ${time}`;
}

const TODAY = localDate(0);
const RANGE_START = localDate(-30);
const RANGE_END = TODAY;

const RANGE = { startDate: RANGE_START, endDate: RANGE_END };

const NURSE_SORT_DEFAULT = {
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
	/** Seeded nurses (Mary Brown, James Wilson). */
	mary: number;
	james: number;
	/** Non-nurses: assignments for them must never enter the report. */
	attendingDoctor: number;
	admin: number;
	patientA: number;
	patientB: number;
	patientC: number;
}

/**
 * Assignment matrix (range `[start, end]` = last 30 days):
 *
 *   Mary   A -5 (2h), A -4 (2h), A -1 (2h), B -1 (2h), A today (1h)
 *          → 2 patients, 4 days, 9h, last work date = today
 *   James  A -3 (3h), C -2 (3h), C -1 (2h)
 *          → 2 patients, 3 days, 8h
 *
 * Plus noise that must never be counted: an out-of-range yesterday-31 Mary
 * row, a tomorrow row, and assignments for a doctor and for an `other`
 * employee.
 *
 * Whole-set summary: 2 nurses, 3 unique patients, 4 assignments, 7 days,
 * 17 hours.
 *
 * Admissions: A is admitted 10 days ago and still in the ward ("Pneumonia"),
 * B was discharged yesterday ("Observation"), C was admitted 60 days ago and
 * is still admitted ("Chronic care") — C's stay starts **before** the report
 * range, which is what the overlapping-admission lateral exists for.
 */
async function buildFixture(data: TestData): Promise<Fixture> {
	const mary = data.employees[2].employee_id;
	const james = data.employees[3].employee_id;
	const attendingDoctor = data.doctors[0].doctor_id;
	const admin = data.employees[4].employee_id;

	const patientA = data.patients[0].patient_id;
	const patientB = data.patients[1].patient_id;
	const patientC = data.patients[2].patient_id;

	await query(
		`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
		 VALUES
		     ($1, $3, $8::date, 2),
		     ($1, $3, $9::date, 2),
		     ($1, $3, $10::date, 2),
		     ($1, $4, $10::date, 2),
		     ($1, $3, $11::date, 1),
		     ($2, $3, $12::date, 3),
		     ($2, $5, $13::date, 3),
		     ($2, $5, $10::date, 2),
		     -- outside the range (before start and after end)
		     ($1, $3, $14::date, 5),
		     ($1, $3, $15::date, 4),
		     -- wrong employee types
		     ($6, $3, $10::date, 8),
		     ($7, $3, $10::date, 8)`,
		[
			mary,
			james,
			patientA,
			patientB,
			patientC,
			attendingDoctor,
			admin,
			localDate(-5),
			localDate(-4),
			localDate(-1),
			TODAY,
			localDate(-3),
			localDate(-2),
			localDate(-60),
			localDate(1),
		]
	);

	// A: still admitted, diagnosis inside the range.
	await query(
		`UPDATE PatientHistory
		    SET admission_time = $2::timestamp,
		        discharge_time = NULL,
		        diagnosis = 'Pneumonia'
		  WHERE patient_history_id = $1`,
		[data.patientHistories[0].patient_history_id, localStamp(-10)]
	);
	// B: discharged yesterday.
	await query(
		`UPDATE PatientHistory
		    SET admission_time = $2::timestamp,
		        discharge_time = $3::timestamp,
		        diagnosis = 'Observation'
		  WHERE patient_history_id = $1`,
		[
			data.patientHistories[1].patient_history_id,
			localStamp(-2, "09:00:00"),
			localStamp(-1, "12:00:00"),
		]
	);
	// C: admitted before the report range and still in the ward.
	await query(
		`INSERT INTO PatientHistory
		     (patient_id, quick_check, diagnosis, admission_time, discharge_time)
		 VALUES ($1, false, 'Chronic care', $2::timestamp, NULL)`,
		[patientC, localStamp(-60)]
	);

	return {
		data,
		mary,
		james,
		attendingDoctor,
		admin,
		patientA,
		patientB,
		patientC,
	};
}

function listQuery(
	overrides: Partial<NurseReportListQuery> = {}
): NurseReportListQuery {
	return {
		range: RANGE,
		nurseId: null,
		search: null,
		paging: PAGING,
		sort: NURSE_SORT_DEFAULT,
		...overrides,
	};
}

function patientQuery(
	overrides: Partial<NursePatientListQuery> = {}
): NursePatientListQuery {
	return {
		range: RANGE,
		search: null,
		paging: PAGING,
		sort: PATIENT_SORT_DEFAULT,
		...overrides,
	};
}

/* ------------------------------------------------------------------ */
/* Specs                                                               */
/* ------------------------------------------------------------------ */

describe("Reports v2 — nurse report", () => {
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

	describe("listNurses", () => {
		it("lists only nurses with in-range assignments", async () => {
			const result = await NurseReportModel.listNurses(listQuery());

			expect(result.total).toBe(2);
			expect(result.page).toBe(1);
			expect(result.page_size).toBe(25);
			expect(result.data.map((row) => row.nurse_name)).toEqual([
				"Nurse James Wilson",
				"Nurse Mary Brown",
			]);
		});

		it("rolls up patients, days, hours and the last work date", async () => {
			const result = await NurseReportModel.listNurses(listQuery());
			const [james, mary] = result.data;

			expect(james.patients_count).toBe(2);
			expect(james.days_worked).toBe(3);
			expect(james.total_hours).toBe(8);
			expect(james.last_work_date).toBe(localDate(-1));

			expect(mary.patients_count).toBe(2);
			expect(mary.days_worked).toBe(4);
			expect(mary.total_hours).toBe(9);
			// The half-open window includes the end date itself...
			expect(mary.last_work_date).toBe(TODAY);
		});

		it("summarises the whole set with deduplicated patients", async () => {
			const result = await NurseReportModel.listNurses(listQuery());

			expect(result.summary).toEqual({
				total_nurses: 2,
				// A, B and C — not 4 assignments.
				total_patients: 3,
				total_patient_assignments: 4,
				// 4 (Mary) + 3 (James); additive because a day is per nurse.
				total_days: 7,
				total_hours: 17,
			});
		});

		it("narrows to one nurse with nurse_id", async () => {
			const result = await NurseReportModel.listNurses(
				listQuery({ nurseId: fixture.mary })
			);

			expect(result.data.map((row) => row.nurse_id)).toEqual([fixture.mary]);
			expect(result.summary.total_nurses).toBe(1);
			expect(result.summary.total_patient_assignments).toBe(2);
			expect(result.summary.total_days).toBe(4);
		});

		it("searches nurse names", async () => {
			const result = await NurseReportModel.listNurses(
				listQuery({ search: "james" })
			);

			expect(result.data.map((row) => row.nurse_name)).toEqual([
				"Nurse James Wilson",
			]);
			expect(result.summary.total_nurses).toBe(1);
			expect(result.summary.total_patients).toBe(2);
		});

		it("sorts by hours descending", async () => {
			const result = await NurseReportModel.listNurses(
				listQuery({
					sort: {
						column: "hours",
						direction: "desc",
						sql: NURSE_SORT_COLUMNS.hours + " DESC",
					},
				})
			);

			expect(result.data.map((row) => row.total_hours)).toEqual([9, 8]);
		});

		it("pages without losing the whole-set summary", async () => {
			const result = await NurseReportModel.listNurses(
				listQuery({ paging: { page: 2, pageSize: 1, offset: 1, limit: 1 } })
			);

			expect(result.data).toHaveSize(1);
			expect(result.data[0].nurse_name).toBe("Nurse Mary Brown");
			expect(result.total).toBe(2);
			expect(result.summary.total_nurses).toBe(2);
		});

		it("includes the end date and excludes the day after it", async () => {
			// tomorrow's 4h row exists in the fixture but must never be counted.
			const includingToday = await NurseReportModel.listNurses(
				listQuery({ nurseId: fixture.mary })
			);
			expect(includingToday.data[0].total_hours).toBe(9);
			expect(includingToday.data[0].days_worked).toBe(4);
			expect(includingToday.data[0].last_work_date).toBe(TODAY);

			const endingYesterday = await NurseReportModel.listNurses(
				listQuery({
					nurseId: fixture.mary,
					range: { startDate: RANGE_START, endDate: localDate(-1) },
				})
			);
			expect(endingYesterday.data[0].total_hours).toBe(8);
			expect(endingYesterday.data[0].days_worked).toBe(3);
			expect(endingYesterday.data[0].last_work_date).toBe(localDate(-1));
		});
	});

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	describe("getNurseDetail", () => {
		it("returns the header, summary, patients and daily assignments", async () => {
			const detail = await NurseReportModel.getNurseDetail(
				fixture.mary,
				patientQuery()
			);

			expect(detail.nurse).toEqual({
				nurse_id: fixture.mary,
				nurse_name: "Nurse Mary Brown",
			});
			expect(detail.summary).toEqual({ patients: 2, days: 4, hours: 9 });
			expect(detail.total).toBe(2);
			expect(detail.data.map((row) => row.patient_name)).toEqual([
				"Bob Johnson",
				"John Patient",
			]);

			const bob = detail.data[0];
			expect(bob.days_assigned).toBe(1);
			expect(bob.hours_worked).toBe(2);
			expect(bob.payment_type).toBe("cash");
			expect(bob.diagnosis).toBe("Observation");
			expect(bob.last_discharge_time).not.toBeNull();

			const john = detail.data[1];
			expect(john.days_assigned).toBe(4);
			expect(john.hours_worked).toBe(7);
			expect(john.diagnosis).toBe("Pneumonia");
			expect(john.last_discharge_time).toBeNull();
		});

		it("groups the accordion by date with per-day totals", async () => {
			const detail = await NurseReportModel.getNurseDetail(
				fixture.mary,
				patientQuery()
			);

			expect(detail.daily_assignments.map((day) => day.work_date)).toEqual([
				TODAY,
				localDate(-1),
				localDate(-4),
				localDate(-5),
			]);

			const twoPatientDay = detail.daily_assignments[1];
			expect(twoPatientDay.patient_count).toBe(2);
			expect(twoPatientDay.total_hours).toBe(4);
			expect(
				twoPatientDay.patients.map((row) => row.patient_name)
			).toEqual(["Bob Johnson", "John Patient"]);
			expect(twoPatientDay.patients[0].hours_worked).toBe(2);
			expect(twoPatientDay.patients[0].diagnosis).toBe("Observation");

			const today = detail.daily_assignments[0];
			expect(today.patient_count).toBe(1);
			expect(today.total_hours).toBe(1);
		});

		it("uses the latest overlapping admission, even one that started before the range", async () => {
			const detail = await NurseReportModel.getNurseDetail(
				fixture.james,
				patientQuery()
			);

			const chronic = detail.data.find(
				(row) => row.patient_id === fixture.patientC
			);
			expect(chronic?.diagnosis).toBe("Chronic care");
			expect(chronic?.days_assigned).toBe(2);
			expect(chronic?.hours_worked).toBe(5);
			// The admission itself predates the report window.
			expect(chronic?.last_admission_time).toContain(localDate(-60));
		});

		it("applies the patient search to the table, summary and accordion alike", async () => {
			const detail = await NurseReportModel.getNurseDetail(
				fixture.mary,
				patientQuery({ search: "bob" })
			);

			expect(detail.data.map((row) => row.patient_name)).toEqual([
				"Bob Johnson",
			]);
			expect(detail.summary).toEqual({ patients: 1, days: 1, hours: 2 });
			expect(detail.total).toBe(1);
			expect(detail.daily_assignments).toHaveSize(1);
			expect(detail.daily_assignments[0].patients).toHaveSize(1);
			expect(detail.daily_assignments[0].patients[0].patient_name).toBe(
				"Bob Johnson"
			);
		});

		it("sorts patients by hours descending", async () => {
			const detail = await NurseReportModel.getNurseDetail(
				fixture.mary,
				patientQuery({
					sort: {
						column: "hours",
						direction: "desc",
						sql: NURSE_PATIENT_SORT_COLUMNS.hours + " DESC",
					},
				})
			);

			expect(detail.data.map((row) => row.hours_worked)).toEqual([7, 2]);
		});

		it("404s for an id that is not a nurse", async () => {
			await expectAsync(
				NurseReportModel.getNurseDetail(
					fixture.attendingDoctor,
					patientQuery()
				)
			).toBeRejectedWithError(NotFoundError);
		});

		it("404s for an unknown id", async () => {
			await expectAsync(
				NurseReportModel.getNurseDetail(999_999, patientQuery())
			).toBeRejectedWithError(NotFoundError);
		});
	});

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	describe("exportNurses", () => {
		it("returns every nurse with patients and daily assignments", async () => {
			const payload = await NurseReportModel.exportNurses(
				listQuery() as NurseReportListQuery
			);

			expect(payload.generated_at).toBeTruthy();
			expect(payload.range).toEqual({
				start_date: RANGE_START,
				end_date: RANGE_END,
			});
			expect(payload.summary.total_nurses).toBe(2);
			expect(payload.data.map((row) => row.nurse_name)).toEqual([
				"Nurse James Wilson",
				"Nurse Mary Brown",
			]);

			const mary = payload.data[1];
			expect(mary.totals).toEqual({ patients: 2, days: 4, hours: 9 });
			expect(mary.patients.map((row) => row.patient_name)).toEqual([
				"Bob Johnson",
				"John Patient",
			]);
			expect(mary.daily_assignments).toHaveSize(4);
			expect(mary.daily_assignments[1].patient_count).toBe(2);
		});

		it("honours nurse_id and the nurse-name search", async () => {
			const one = await NurseReportModel.exportNurses(
				listQuery({ nurseId: fixture.james }) as NurseReportListQuery
			);
			expect(one.data.map((row) => row.nurse_id)).toEqual([fixture.james]);

			const searched = await NurseReportModel.exportNurses(
				listQuery({ search: "mary" }) as NurseReportListQuery
			);
			expect(searched.data.map((row) => row.nurse_name)).toEqual([
				"Nurse Mary Brown",
			]);
			expect(searched.summary.total_nurses).toBe(1);
		});

		it("does not page", async () => {
			const payload = await NurseReportModel.exportNurses(
				listQuery({ paging: { page: 2, pageSize: 1, offset: 1, limit: 1 } })
			);
			expect(payload.data).toHaveSize(2);
		});

		it("returns an empty document for a range with no assignments", async () => {
			const payload = await NurseReportModel.exportNurses(
				listQuery({
					// Before every assignment in the fixture (the oldest is -60).
					range: { startDate: localDate(-80), endDate: localDate(-61) },
				})
			);

			expect(payload.data).toEqual([]);
			expect(payload.summary).toEqual({
				total_nurses: 0,
				total_patients: 0,
				total_patient_assignments: 0,
				total_days: 0,
				total_hours: 0,
			});
		});
	});
});
