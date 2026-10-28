// src/app/tests/models/ReportV2.clockIn.spec.ts
//
// Phase 6.11.6 — clock-in report. Covers the four things the legacy report got
// wrong: missing days ignored the hire date and today, a second session on the
// same day was silently dropped, `avg_hours_per_day` divided by the session
// count instead of worked days, and a plain `LEFT JOIN PatientHistory …
// BETWEEN` duplicated an assignment once per overlapping admission.
//
// The fixture is deliberately small enough to recompute by hand:
//
//   Doctor (shift 08:00–17:00, need_clock_in = false)
//     -10d 08:00→12:00  early     4h   ← left before shift end − 30
//     -10d 13:00→17:00  late      4h   ← second session, same day; day = late
//      -5d 08:00→17:00  on_time   9h
//      -3d 08:00→16:00  early     8h
//      -2d 08:00→null   incomplete 0h, 40 deduction
//     → 5 sessions, 4 worked days, 25h, avg 6.25, no missing (does not clock in)
//
//   Nurse Mary (shift 08:00–17:00, need_clock_in = true, hired 6 months ago)
//      -4d 08:00→17:00  on_time   9h
//      -3d 09:00→17:00  late      8h
//      -1d 08:00→16:00  early     8h   ← carries one patient assignment
//     today 08:00→null   incomplete 0h, 30 deduction
//     tomorrow          ← out of range, must not be counted
//     → 4 sessions, 4 worked days, 25h, 27 missing (31 days − 4 worked)
//
//   Nurse James (need_clock_in = true, inactive)
//      -2d 08:00→17:00  on_time   9h   → 1 worked day, 0 missing
//
//   Admin Jane (need_clock_in = false, `other`)
//     one assignment, no clock-in → eligible through the assignment clause only
//
// Whole set: 4 employees, 10 sessions, 9 worked days, 59h, 70 deductions,
// 27 missing. Status days: on_time 3, late 2, early 2, incomplete 2.

import ClockInReportModel, {
	CLOCK_IN_SORT_KEYS,
	type ClockInDetailQuery,
	type ClockInFilters,
	type ClockInListQuery,
} from "../../models/reports/ClockInReport.model.js";
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
const RANGE = { startDate: localDate(-30), endDate: TODAY };

const PAGING = { page: 1, pageSize: 25, offset: 0, limit: 25 };

const SORT_NAME = { column: "name" as const, direction: "asc" as const };

interface Fixture {
	data: TestData;
	/** Employee 0 — clock-ins without `need_clock_in`, two sessions on one day. */
	doctor: number;
	/** Employee 2 — the clock-in employee with missing days and assignments. */
	nurse: number;
	/** Employee 3 — inactive: keeps the sessions, gets no synthesized absences. */
	inactiveNurse: number;
	/** Employee 4 — `other`, eligible through an assignment only. */
	admin: number;
}

async function insertClockIn(values: {
	employeeId: number;
	clockIn: string;
	clockOut: string | null;
	deduction?: number;
}): Promise<void> {
	await query(
		`INSERT INTO EmployeeClockIn (employee_id, clock_in, clock_out, pay_deduction)
		 VALUES ($1, $2::timestamp, $3::timestamp, $4)`,
		[values.employeeId, values.clockIn, values.clockOut, values.deduction ?? 0]
	);
}

async function insertAssignment(values: {
	employeeId: number;
	patientId: number;
	workDate: string;
	hours?: number;
}): Promise<void> {
	await query(
		`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
		 VALUES ($1, $2, $3::date, $4)`,
		[values.employeeId, values.patientId, values.workDate, values.hours ?? 2]
	);
}

/** A second admission for the same patient, so two of them cover one day. */
async function insertAdmission(values: {
	patientId: number;
	fromDays: number;
	toDays: number | null;
	diagnosis: string;
}): Promise<void> {
	await query(
		`INSERT INTO PatientHistory (patient_id, quick_check, diagnosis, admission_time, discharge_time)
		 VALUES ($1, false, $2, $3::timestamp, $4::timestamp)`,
		[
			values.patientId,
			values.diagnosis,
			localStamp(values.fromDays, "09:00:00"),
			values.toDays === null ? null : localStamp(values.toDays, "09:00:00"),
		]
	);
}

async function buildFixture(data: TestData): Promise<Fixture> {
	const doctor = data.employees[0].employee_id;
	const nurse = data.employees[2].employee_id;
	const inactiveNurse = data.employees[3].employee_id;
	const admin = data.employees[4].employee_id;

	// The doctor does not need to clock in, but does — five sessions.
	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-10, "08:00:00"),
		clockOut: localStamp(-10, "12:00:00"),
	});
	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-10, "13:00:00"),
		clockOut: localStamp(-10, "17:00:00"),
	});
	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-5, "08:00:00"),
		clockOut: localStamp(-5, "17:00:00"),
	});
	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-3, "08:00:00"),
		clockOut: localStamp(-3, "16:00:00"),
	});
	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-2, "08:00:00"),
		clockOut: null,
		deduction: 40,
	});

	// The nurse: on time, late, early, incomplete, plus a session tomorrow.
	await insertClockIn({
		employeeId: nurse,
		clockIn: localStamp(-4, "08:00:00"),
		clockOut: localStamp(-4, "17:00:00"),
	});
	await insertClockIn({
		employeeId: nurse,
		clockIn: localStamp(-3, "09:00:00"),
		clockOut: localStamp(-3, "17:00:00"),
	});
	await insertClockIn({
		employeeId: nurse,
		clockIn: localStamp(-1, "08:00:00"),
		clockOut: localStamp(-1, "16:00:00"),
	});
	await insertClockIn({
		employeeId: nurse,
		clockIn: localStamp(0, "08:00:00"),
		clockOut: null,
		deduction: 30,
	});
	await insertClockIn({
		employeeId: nurse,
		clockIn: localStamp(1, "08:00:00"),
		clockOut: localStamp(1, "17:00:00"),
	});

	// The inactive nurse keeps the one session she worked.
	await insertClockIn({
		employeeId: inactiveNurse,
		clockIn: localStamp(-2, "08:00:00"),
		clockOut: localStamp(-2, "17:00:00"),
	});
	await query("UPDATE Employee SET is_active = false WHERE employee_id = $1", [
		inactiveNurse,
	]);

	// Two admissions for patient 0 that both cover -7d. A plain
	// `LEFT JOIN … BETWEEN` would return the assignment twice.
	await insertAdmission({
		patientId: data.patients[0].patient_id,
		fromDays: -20,
		toDays: null,
		diagnosis: "Overlap older",
	});
	await insertAdmission({
		patientId: data.patients[0].patient_id,
		fromDays: -10,
		toDays: null,
		diagnosis: "Overlap newer",
	});

	// A day the nurse was assigned work but never clocked in: the day is
	// missing *and* carries the assignment.
	await insertAssignment({
		employeeId: nurse,
		patientId: data.patients[0].patient_id,
		workDate: localDate(-7),
		hours: 3,
	});

	// A day she did clock in, so the assignment lands on a real record.
	await insertAssignment({
		employeeId: nurse,
		patientId: data.patients[1].patient_id,
		workDate: localDate(-1),
		hours: 2,
	});

	// The admin is assigned work but never clocks in (and is not expected to).
	await insertAssignment({
		employeeId: admin,
		patientId: data.patients[0].patient_id,
		workDate: localDate(-6),
		hours: 4,
	});

	return { data, doctor, nurse, inactiveNurse, admin };
}

function listQuery(
	overrides: Partial<ClockInListQuery> = {}
): ClockInListQuery {
	return {
		range: RANGE,
		employeeType: "all",
		employeeId: null,
		search: null,
		paging: PAGING,
		sort: SORT_NAME,
		...overrides,
	};
}

function filters(overrides: Partial<ClockInFilters> = {}): ClockInFilters {
	return {
		range: RANGE,
		employeeType: "all",
		employeeId: null,
		search: null,
		...overrides,
	};
}

function detailQuery(
	overrides: Partial<ClockInDetailQuery> = {}
): ClockInDetailQuery {
	return {
		range: RANGE,
		status: "all",
		paging: PAGING,
		...overrides,
	};
}

function rowFor(
	rows: Array<{ employee_id: number }>,
	employeeId: number
): any {
	const row = rows.find((candidate) => candidate.employee_id === employeeId);
	if (!row) throw new Error(`employee ${employeeId} missing from the report`);
	return row;
}

/* ------------------------------------------------------------------ */
/* Specs                                                               */
/* ------------------------------------------------------------------ */

describe("Reports v2 — clock-ins", () => {
	let fixture: Fixture;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		const data = await dbHelper.seedDatabase();
		// `seedDatabase` seeds payments and clock-ins of its own; start from the
		// fixture's matrix so every expectation is exact.
		await query("DELETE FROM EmployeePayment");
		await query("DELETE FROM EmployeeClockIn");
		fixture = await buildFixture(data);
	});

	/* -------------------------------------------------------------- */
	/* List                                                            */
	/* -------------------------------------------------------------- */

	describe("listClockIns", () => {
		it("includes anyone expected to clock in, plus anyone with work in range", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());

			expect(result.total).toBe(4);
			expect(result.page).toBe(1);
			expect(result.page_size).toBe(25);
			expect(result.data.map((row) => row.employee_name)).toEqual([
				"Admin Jane Doe",
				"Dr. John Smith",
				"Nurse James Wilson",
				"Nurse Mary Brown",
			]);
		});

		it("counts sessions and worked days separately", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());
			const doctor = rowFor(result.data, fixture.doctor);

			// Two of the five sessions share a date, so the average is per day.
			expect(doctor.clock_in_count).toBe(5);
			expect(doctor.attendance_summary.worked_days).toBe(4);
			expect(doctor.total_hours).toBe(25);
			expect(doctor.avg_hours_per_day).toBe(6.25);
			expect(doctor.total_deductions).toBe(40);
		});

		it("classifies a day by its worst session", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());
			const doctor = rowFor(result.data, fixture.doctor);

			// -10d holds an on-time and a late session: the day is late.
			expect(doctor.attendance_summary).toEqual({
				total_days: 4,
				worked_days: 4,
				on_time_days: 1,
				late_days: 1,
				early_days: 1,
				incomplete_days: 1,
				missing_days: 0,
				punctuality_rate: 25,
			});
		});

		it("synthesizes missing days from the hire date to today", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());
			const nurse = rowFor(result.data, fixture.nurse);

			// 31 days in the range, 4 with a session: 27 absent days.
			expect(nurse.attendance_summary.worked_days).toBe(4);
			expect(nurse.attendance_summary.missing_days).toBe(27);
			expect(nurse.attendance_summary.total_days).toBe(31);
			// The missing days are not in the punctuality denominator.
			expect(nurse.attendance_summary.punctuality_rate).toBe(25);
		});

		it("does not synthesize missing days for employees who do not clock in", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());

			const doctor = rowFor(result.data, fixture.doctor);
			expect(doctor.need_clock_in).toBe(false);
			expect(doctor.attendance_summary.missing_days).toBe(0);
			expect(doctor.attendance_summary.total_days).toBe(4);

			// The admin is eligible only through an assignment.
			const admin = rowFor(result.data, fixture.admin);
			expect(admin.clock_in_count).toBe(0);
			expect(admin.attendance_summary.missing_days).toBe(0);
			expect(admin.attendance_summary.total_days).toBe(0);
		});

		it("gives an inactive employee no missing days", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());
			const inactive = rowFor(result.data, fixture.inactiveNurse);

			expect(inactive.is_active).toBe(false);
			expect(inactive.clock_in_count).toBe(1);
			expect(inactive.attendance_summary.worked_days).toBe(1);
			expect(inactive.attendance_summary.missing_days).toBe(0);
			expect(inactive.attendance_summary.total_days).toBe(1);
			expect(inactive.attendance_summary.punctuality_rate).toBe(100);
		});

		it("stops at the end date", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());
			const nurse = rowFor(result.data, fixture.nurse);

			// The session inserted for tomorrow is outside the range.
			expect(nurse.clock_in_count).toBe(4);
			expect(result.summary.total_clock_ins).toBe(10);
		});

		it("rolls the whole set into the summary", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());

			expect(result.summary).toEqual({
				total_employees: 4,
				total_clock_ins: 10,
				total_hours: 59,
				total_worked_days: 9,
				avg_hours_per_day: 6.56,
				avg_hours_per_employee: 14.75,
				total_deductions: 70,
				total_missing_days: 27,
			});
		});

		it("filters by employee type, employee id and name", async () => {
			const nurses = await ClockInReportModel.listClockIns(
				listQuery({ employeeType: "nurse" })
			);
			expect(nurses.total).toBe(2);

			const others = await ClockInReportModel.listClockIns(
				listQuery({ employeeType: "other" })
			);
			expect(others.total).toBe(1);
			expect(others.data[0].employee_name).toBe("Admin Jane Doe");

			const single = await ClockInReportModel.listClockIns(
				listQuery({ employeeId: fixture.doctor })
			);
			expect(single.total).toBe(1);
			expect(single.data[0].employee_name).toBe("Dr. John Smith");

			const searched = await ClockInReportModel.listClockIns(
				listQuery({ search: "mary" })
			);
			expect(searched.total).toBe(1);
			expect(searched.data[0].employee_id).toBe(fixture.nurse);
		});

		it("sorts and pages over the finished rows", async () => {
			const byHours = await ClockInReportModel.listClockIns(
				listQuery({ sort: { column: "hours", direction: "desc" } })
			);
			expect(byHours.data.map((row) => row.total_hours)).toEqual([
				25, 25, 9, 0,
			]);

			const byMissing = await ClockInReportModel.listClockIns(
				listQuery({ sort: { column: "missing", direction: "desc" } })
			);
			expect(byMissing.data[0].employee_id).toBe(fixture.nurse);
			// Everyone else ties at zero, so the name breaks the tie.
			expect(byMissing.data.slice(1).map((row) => row.employee_name)).toEqual([
				"Admin Jane Doe",
				"Dr. John Smith",
				"Nurse James Wilson",
			]);

			const page2 = await ClockInReportModel.listClockIns(
				listQuery({
					paging: { page: 2, pageSize: 2, offset: 2, limit: 2 },
				})
			);
			expect(page2.data.map((row) => row.employee_name)).toEqual([
				"Nurse James Wilson",
				"Nurse Mary Brown",
			]);
			expect(page2.total).toBe(4);
			expect(page2.summary.total_employees).toBe(4);
		});

		it("builds both chart series", async () => {
			const result = await ClockInReportModel.listClockIns(listQuery());

			expect(result.charts.hours_by_employee).toEqual([
				{
					employee_id: fixture.doctor,
					employee_name: "Dr. John Smith",
					hours: 25,
				},
				{
					employee_id: fixture.nurse,
					employee_name: "Nurse Mary Brown",
					hours: 25,
				},
				{
					employee_id: fixture.inactiveNurse,
					employee_name: "Nurse James Wilson",
					hours: 9,
				},
			]);

			expect(result.charts.status_distribution).toEqual([
				{ status: "on_time", count: 3 },
				{ status: "late", count: 2 },
				{ status: "early", count: 2 },
				{ status: "incomplete", count: 2 },
				{ status: "missing", count: 27 },
			]);
		});

		it("returns an empty document when nobody is eligible", async () => {
			const result = await ClockInReportModel.listClockIns(
				listQuery({
					range: { startDate: localDate(-400), endDate: localDate(-390) },
				})
			);

			expect(result.total).toBe(0);
			expect(result.data).toEqual([]);
			expect(result.summary).toEqual({
				total_employees: 0,
				total_clock_ins: 0,
				total_hours: 0,
				total_worked_days: 0,
				avg_hours_per_day: 0,
				avg_hours_per_employee: 0,
				total_deductions: 0,
				total_missing_days: 0,
			});
			expect(result.charts.hours_by_employee).toEqual([]);
			expect(result.charts.status_distribution).toEqual([
				{ status: "on_time", count: 0 },
				{ status: "late", count: 0 },
				{ status: "early", count: 0 },
				{ status: "incomplete", count: 0 },
				{ status: "missing", count: 0 },
			]);
		});

		it("exposes the sort whitelist", () => {
			expect(CLOCK_IN_SORT_KEYS).toContain("punctuality");
			expect(CLOCK_IN_SORT_KEYS).toContain("missing");
		});
	});

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	describe("getEmployeeDetail", () => {
		it("returns every session plus the synthesized missing days, newest first", async () => {
			const result = await ClockInReportModel.getEmployeeDetail(
				fixture.nurse,
				detailQuery()
			);

			expect(result.employee.employee_name).toBe("Nurse Mary Brown");
			expect(result.employee.shift_start_time).toBe("08:00:00");
			expect(result.total).toBe(31);
			expect(result.records).toHaveSize(25);
			expect(result.records[0].date).toBe(TODAY);
			expect(result.records[0].status).toBe("incomplete");

			// Newest first, and the synthesized absences sit between the sessions.
			expect(
				result.records
					.filter((record) => !record.is_missing)
					.map((record) => record.date)
			).toEqual([TODAY, localDate(-1), localDate(-3), localDate(-4)]);
			expect(result.records[1].date).toBe(localDate(-1));
			expect(result.records[2].is_missing).toBe(true);
			expect(result.records[2].date).toBe(localDate(-2));
			expect(result.attendance_summary).toEqual({
				total_days: 31,
				worked_days: 4,
				on_time_days: 1,
				late_days: 1,
				early_days: 1,
				incomplete_days: 1,
				missing_days: 27,
				punctuality_rate: 25,
			});
		});

		it("keeps every session of a day", async () => {
			const result = await ClockInReportModel.getEmployeeDetail(
				fixture.doctor,
				detailQuery()
			);

			expect(result.total).toBe(5);
			expect(result.records.every((record) => !record.is_missing)).toBe(true);

			const shared = result.records.filter(
				(record) => record.date === localDate(-10)
			);
			expect(shared).toHaveSize(2);
			expect(shared.map((record) => record.hours_worked)).toEqual([4, 4]);
			expect(shared.map((record) => record.status)).toEqual([
				"early",
				"late",
			]);
			expect(shared[1].late_minutes).toBe(270);
		});

		it("reports early minutes against the shift end", async () => {
			const result = await ClockInReportModel.getEmployeeDetail(
				fixture.doctor,
				detailQuery()
			);
			const early = result.records.find(
				(record) => record.date === localDate(-3)
			);

			expect(early?.status).toBe("early");
			expect(early?.early_minutes).toBe(30);
			expect(early?.hours_worked).toBe(8);
		});

		it("applies the status filter after synthesis", async () => {
			const late = await ClockInReportModel.getEmployeeDetail(
				fixture.nurse,
				detailQuery({ status: "late" })
			);
			expect(late.total).toBe(1);
			expect(late.records[0].date).toBe(localDate(-3));

			const missing = await ClockInReportModel.getEmployeeDetail(
				fixture.nurse,
				detailQuery({ status: "missing" })
			);
			expect(missing.total).toBe(27);
			expect(missing.records.every((record) => record.is_missing)).toBe(true);
			// The summary still describes the whole range, not the filtered page.
			expect(missing.attendance_summary.worked_days).toBe(4);
		});

		it("pages the records", async () => {
			const result = await ClockInReportModel.getEmployeeDetail(
				fixture.nurse,
				detailQuery({
					paging: { page: 2, pageSize: 10, offset: 10, limit: 10 },
				})
			);

			expect(result.total).toBe(31);
			expect(result.records).toHaveSize(10);
			expect(result.page).toBe(2);
		});

		it("carries the patient assignment on a missing day", async () => {
			const result = await ClockInReportModel.getEmployeeDetail(
				fixture.nurse,
				detailQuery({ paging: { page: 1, pageSize: 100, offset: 0, limit: 100 } })
			);
			const absent = result.records.find(
				(record) => record.date === localDate(-7)
			);

			expect(absent?.is_missing).toBe(true);
			expect(absent?.patient_count).toBe(1);
			expect(absent?.patients[0].patient_name).toBe("John Patient");
			// Two admissions cover the day; the most recent one wins.
			expect(absent?.patients[0].diagnosis).toBe("Overlap newer");
			expect(absent?.patients[0].hours_worked).toBe(3);
		});

		it("attaches the assignment to a real session too", async () => {
			const result = await ClockInReportModel.getEmployeeDetail(
				fixture.nurse,
				detailQuery()
			);
			const worked = result.records.find(
				(record) => record.date === localDate(-1)
			);

			expect(worked?.is_missing).toBe(false);
			expect(worked?.patient_count).toBe(1);
			expect(worked?.patients[0].patient_name).toBe("Bob Johnson");
			expect(worked?.patients[0].diagnosis).toBe("Regular check-up");
		});

		it("returns no synthesized days for an inactive employee", async () => {
			const result = await ClockInReportModel.getEmployeeDetail(
				fixture.inactiveNurse,
				detailQuery()
			);

			expect(result.total).toBe(1);
			expect(result.attendance_summary.missing_days).toBe(0);
			expect(result.employee.is_active).toBe(false);
		});

		it("404s for an unknown employee", async () => {
			await expectAsync(
				ClockInReportModel.getEmployeeDetail(999_999, detailQuery())
			).toBeRejectedWithError(NotFoundError, /not found/);
		});
	});

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	describe("exportClockIns", () => {
		it("returns one row per employee with every session and no synthesized days", async () => {
			const payload = await ClockInReportModel.exportClockIns(filters());

			expect(payload.data).toHaveSize(4);
			expect(payload.range).toEqual({
				start_date: RANGE.startDate,
				end_date: RANGE.endDate,
			});
			expect(typeof payload.generated_at).toBe("string");

			const nurse = rowFor(payload.data, fixture.nurse);
			expect(nurse.records).toHaveSize(4);
			expect(nurse.records.every((record: any) => !record.is_missing)).toBe(true);
			// The absence count is still stated, just not materialised.
			expect(nurse.attendance_summary.missing_days).toBe(27);

			const admin = rowFor(payload.data, fixture.admin);
			expect(admin.records).toEqual([]);
		});

		it("derives the summary from the same rows", async () => {
			const [payload, list] = await Promise.all([
				ClockInReportModel.exportClockIns(filters()),
				ClockInReportModel.listClockIns(listQuery()),
			]);

			expect(payload.summary).toEqual(list.summary);
			expect(payload.charts).toEqual(list.charts);
		});

		it("honours the filters", async () => {
			const payload = await ClockInReportModel.exportClockIns(
				filters({ employeeType: "nurse", employeeId: fixture.nurse })
			);

			expect(payload.data).toHaveSize(1);
			expect(payload.summary.total_clock_ins).toBe(4);
			expect(payload.summary.total_employees).toBe(1);
		});
	});
});
