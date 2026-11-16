import EmployeeClockInModel from "../../models/EmployeeClockIn.model.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/**
 * Insert a clock-in with SQL expressions for the timestamps so the
 * fixtures stay relative to `now()` inside the database (the columns
 * are `timestamp`, not `timestamptz`).
 */
async function insertClockIn(
	employeeId: number,
	clockInSql: string,
	clockOutSql: string | null,
	payDeduction = 0
) {
	const { rows } = await query(
		`INSERT INTO EmployeeClockIn (employee_id, clock_in, clock_out, pay_deduction)
		 VALUES ($1, ${clockInSql}, ${clockOutSql ?? "NULL"}, $2)
		 RETURNING *;`,
		[employeeId, payDeduction]
	);
	return rows[0] as {
		clock_id: number;
		employee_id: number;
		clock_in: string;
		clock_out: string | null;
		pay_deduction: string;
	};
}

/** Local `YYYY-MM-DD` for N days from today (the client sends these). */
function localDay(offsetDays = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate()
	)}`;
}

describe("EmployeeClockInModel", () => {
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllClockIns", () => {
		it("should return a page plus the full total", async () => {
			const { rows, total } = await EmployeeClockInModel.getAllClockIns();

			// seedDatabase: one closed row (now - 8h) and one open row
			// (now - 12h).
			expect(total).toBe(2);
			expect(rows.length).toBe(2);
		});

		it("should default to clock_in descending", async () => {
			const { rows } = await EmployeeClockInModel.getAllClockIns();

			expect(rows[0].employee_id).toBe(
				insertedData.employees[2].employee_id
			);
			expect(rows[1].employee_id).toBe(
				insertedData.employees[3].employee_id
			);
		});

		it("should paginate with a stable total", async () => {
			const first = await EmployeeClockInModel.getAllClockIns({
				offset: 0,
				limit: 1
			});
			expect(first.total).toBe(2);
			expect(first.rows.length).toBe(1);

			const second = await EmployeeClockInModel.getAllClockIns({
				offset: 1,
				limit: 1
			});
			expect(second.total).toBe(2);
			expect(second.rows.length).toBe(1);
			expect(second.rows[0].clock_id).not.toBe(first.rows[0].clock_id);
		});

		it("should filter by status", async () => {
			const closed = await EmployeeClockInModel.getAllClockIns({
				status: "closed"
			});
			expect(closed.total).toBe(1);
			expect(closed.rows[0].clock_out).not.toBeNull();

			const active = await EmployeeClockInModel.getAllClockIns({
				status: "active"
			});
			expect(active.total).toBe(1);
			expect(active.rows[0].clock_out).toBeNull();
		});

		it("should search the joined employee name", async () => {
			const byName = await EmployeeClockInModel.getAllClockIns({
				search: "Mary"
			});
			expect(byName.total).toBe(1);
			expect(byName.rows[0].employee_id).toBe(
				insertedData.employees[2].employee_id
			);

			const byType = await EmployeeClockInModel.getAllClockIns({
				search: "Nurse"
			});
			expect(byType.total).toBe(2);
		});

		it("should apply an inclusive from/to date range", async () => {
			await dbHelper.clearEmployeeClockIns();
			const employeeId = insertedData.employees[0].employee_id;
			await insertClockIn(
				employeeId,
				"date_trunc('day', now()) + interval '12 hours'",
				"date_trunc('day', now()) + interval '14 hours'"
			);
			await insertClockIn(
				employeeId,
				"date_trunc('day', now()) - interval '1 day' + interval '12 hours'",
				"date_trunc('day', now()) - interval '1 day' + interval '14 hours'"
			);
			await insertClockIn(
				employeeId,
				"date_trunc('day', now()) - interval '3 days' + interval '12 hours'",
				"date_trunc('day', now()) - interval '3 days' + interval '14 hours'"
			);

			const all = await EmployeeClockInModel.getAllClockIns();
			expect(all.total).toBe(3);

			const todayOnly = await EmployeeClockInModel.getAllClockIns({
				from: localDay(0)
			});
			expect(todayOnly.total).toBe(1);

			const untilYesterday = await EmployeeClockInModel.getAllClockIns({
				to: localDay(-1)
			});
			expect(untilYesterday.total).toBe(2);

			const window = await EmployeeClockInModel.getAllClockIns({
				from: localDay(-1),
				to: localDay(0)
			});
			expect(window.total).toBe(2);
		});

		it("should sort by employee name in both directions", async () => {
			// "Nurse James Wilson" (employee[3]) precedes "Nurse Mary Brown"
			// (employee[2]) alphabetically.
			const asc = await EmployeeClockInModel.getAllClockIns({
				sort: "employee",
				dir: "asc"
			});
			expect(asc.rows.map((row) => row.employee_id)).toEqual([
				insertedData.employees[3].employee_id,
				insertedData.employees[2].employee_id
			]);

			const desc = await EmployeeClockInModel.getAllClockIns({
				sort: "employee",
				dir: "desc"
			});
			expect(desc.rows.map((row) => row.employee_id)).toEqual([
				insertedData.employees[2].employee_id,
				insertedData.employees[3].employee_id
			]);
		});

		it("should sort by duration using clock_out (now for open rows)", async () => {
			// Closed row ran 8h; the open row started 12h ago.
			const asc = await EmployeeClockInModel.getAllClockIns({
				sort: "duration",
				dir: "asc"
			});
			expect(asc.rows[0].clock_out).not.toBeNull();

			const desc = await EmployeeClockInModel.getAllClockIns({
				sort: "duration",
				dir: "desc"
			});
			expect(desc.rows[0].clock_out).toBeNull();
		});

		it("should sort by pay deduction", async () => {
			await dbHelper.clearEmployeeClockIns();
			await insertClockIn(
				insertedData.employees[0].employee_id,
				"now() - interval '5 hours'",
				"now() - interval '1 hour'",
				100
			);
			await insertClockIn(
				insertedData.employees[1].employee_id,
				"now() - interval '4 hours'",
				"now() - interval '1 hour'",
				25
			);

			const asc = await EmployeeClockInModel.getAllClockIns({
				sort: "payDeduction",
				dir: "asc"
			});
			expect(Number(asc.rows[0].pay_deduction)).toBe(25);

			const desc = await EmployeeClockInModel.getAllClockIns({
				sort: "payDeduction",
				dir: "desc"
			});
			expect(Number(desc.rows[0].pay_deduction)).toBe(100);
		});
	});

	describe("getClockedInEmployees", () => {
		it("should return only open rows with the shift window", async () => {
			const { rows, total } =
				await EmployeeClockInModel.getClockedInEmployees({

				});

			expect(total).toBe(1);
			expect(rows.length).toBe(1);
			expect(rows[0].employee_id).toBe(
				insertedData.employees[3].employee_id
			);
			expect(rows[0].clock_out).toBeNull();
			expect(rows[0].shift_start_time).toBeTruthy();
			expect(rows[0].shift_end_time).toBeTruthy();
		});

		it("should paginate with a stable total", async () => {
			await dbHelper.clearEmployeeClockIns();
			const ids = insertedData.employees.map(
				(employee) => employee.employee_id
			);
			for (const id of ids.slice(0, 3)) {
				await insertClockIn(id, "now() - interval '1 hour'", null);
			}

			const first = await EmployeeClockInModel.getClockedInEmployees({
				offset: 0,
				limit: 2
			});
			expect(first.total).toBe(3);
			expect(first.rows.length).toBe(2);

			const second = await EmployeeClockInModel.getClockedInEmployees({
				offset: 2,
				limit: 2
			});
			expect(second.total).toBe(3);
			expect(second.rows.length).toBe(1);
		});

		it("should filter missing clock-outs against the given day", async () => {
			await dbHelper.clearEmployeeClockIns();
			const employeeId = insertedData.employees[0].employee_id;
			await insertClockIn(
				employeeId,
				"date_trunc('day', now()) - interval '3 days' + interval '10 hours'",
				null
			);
			await insertClockIn(
				employeeId,
				"date_trunc('day', now()) + interval '1 day'",
				null
			);

			const all = await EmployeeClockInModel.getClockedInEmployees({});
			expect(all.total).toBe(2);

			const missing = await EmployeeClockInModel.getClockedInEmployees({
				missingOnly: true,
				today: localDay(0)
			});
			expect(missing.total).toBe(1);
		});

		it("should sort by employee name", async () => {
			await dbHelper.clearEmployeeClockIns();
			await insertClockIn(
				insertedData.employees[2].employee_id,
				"now() - interval '1 hour'",
				null
			);
			await insertClockIn(
				insertedData.employees[3].employee_id,
				"now() - interval '2 hours'",
				null
			);

			const asc = await EmployeeClockInModel.getClockedInEmployees({
				sort: "employee",
				dir: "asc"
			});
			expect(asc.rows.map((row) => row.employee_id)).toEqual([
				insertedData.employees[3].employee_id,
				insertedData.employees[2].employee_id
			]);
		});

		it("should invert the direction for the duration sort", async () => {
			await dbHelper.clearEmployeeClockIns();
			const longId = insertedData.employees[0].employee_id;
			const shortId = insertedData.employees[1].employee_id;
			await insertClockIn(longId, "now() - interval '10 hours'", null);
			await insertClockIn(shortId, "now() - interval '2 hours'", null);

			// asc = shortest first → the 2h shift leads.
			const asc = await EmployeeClockInModel.getClockedInEmployees({
				sort: "duration",
				dir: "asc"
			});
			expect(asc.rows[0].employee_id).toBe(shortId);

			const desc = await EmployeeClockInModel.getClockedInEmployees({
				sort: "duration",
				dir: "desc"
			});
			expect(desc.rows[0].employee_id).toBe(longId);
		});

		it("should return the whole set when unbounded", async () => {
			await dbHelper.clearEmployeeClockIns();
			for (const employee of insertedData.employees.slice(0, 4)) {
				await insertClockIn(
					employee.employee_id,
					"now() - interval '1 hour'",
					null
				);
			}

			const { rows, total } =
				await EmployeeClockInModel.getClockedInEmployees({});
			expect(total).toBe(4);
			expect(rows.length).toBe(4);
		});
	});

	describe("getClockedInStats", () => {
		it("should count open rows", async () => {
			const stats = await EmployeeClockInModel.getClockedInStats();
			expect(stats.activeCount).toBe(1);
		});

		it("should report a zero-anomaly open row", async () => {
			await dbHelper.clearEmployeeClockIns();
			await insertClockIn(
				insertedData.employees[0].employee_id,
				"date_trunc('day', now()) + interval '1 day'",
				null
			);

			const stats = await EmployeeClockInModel.getClockedInStats(
				localDay(0)
			);
			expect(stats.activeCount).toBe(1);
			expect(stats.missingCount).toBe(0);
			expect(stats.over12hCount).toBe(0);
		});

		it("should count shifts beyond the 12h fatigue ceiling", async () => {
			await dbHelper.clearEmployeeClockIns();
			await insertClockIn(
				insertedData.employees[0].employee_id,
				"now() - interval '13 hours'",
				null
			);

			const stats = await EmployeeClockInModel.getClockedInStats();
			expect(stats.activeCount).toBe(1);
			expect(stats.over12hCount).toBe(1);
		});

		it("should count open rows that predate today", async () => {
			await dbHelper.clearEmployeeClockIns();
			await insertClockIn(
				insertedData.employees[0].employee_id,
				"now() - interval '3 days'",
				null
			);

			const stats = await EmployeeClockInModel.getClockedInStats(
				localDay(0)
			);
			expect(stats.missingCount).toBe(1);
		});

		it("should list open and duplicate employee ids", async () => {
			await dbHelper.clearEmployeeClockIns();
			const duplicateId = insertedData.employees[0].employee_id;
			const singleId = insertedData.employees[1].employee_id;
			await insertClockIn(
				duplicateId,
				"now() - interval '1 hour'",
				null
			);
			await insertClockIn(
				duplicateId,
				"now() - interval '2 hours'",
				null
			);
			await insertClockIn(singleId, "now() - interval '3 hours'", null);
			await insertClockIn(
				singleId,
				"now() - interval '9 hours'",
				"now() - interval '1 hour'"
			);

			const stats = await EmployeeClockInModel.getClockedInStats();
			expect(stats.activeCount).toBe(3);
			expect([...stats.openEmployeeIds].sort()).toEqual(
				[duplicateId, singleId].sort()
			);
			expect(stats.duplicateEmployeeIds).toEqual([duplicateId]);
		});
	});
});
