import EmployeeClockInController from "../../controllers/EmployeeClockIn.controller.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

async function insertClockIn(
	employeeId: number,
	clockInSql: string,
	clockOutSql: string | null
) {
	await query(
		`INSERT INTO EmployeeClockIn (employee_id, clock_in, clock_out, pay_deduction)
		 VALUES ($1, ${clockInSql}, ${clockOutSql ?? "NULL"}, 0);`,
		[employeeId]
	);
}

function localDay(offsetDays = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate()
	)}`;
}

describe("EmployeeClockInController", () => {
	let mockRequest: any;
	let mockResponse: any;
	let insertedData: TestData;

	/** Body of the most recent `res.status(...).json(...)` call. */
	function responseBody() {
		return mockResponse.status().json.calls.mostRecent().args[0];
	}

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();

		mockResponse = {
			status: jasmine.createSpy("status").and.returnValue({
				json: jasmine.createSpy("json"),
				send: jasmine.createSpy("send")
			}),
			json: jasmine.createSpy("json")
		};
	});

	describe("getAllClockIns", () => {
		it("should return the first page in the shared envelope", async () => {
			mockRequest = { query: {} };

			await EmployeeClockInController.getAllClockIns(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(200);
			const body = responseBody();
			expect(Array.isArray(body.data)).toBeTrue();
			expect(body.data.length).toBe(2);
			expect(body.total).toBe(2);
			expect(body.page).toBe(1);
			expect(body.pageSize).toBe(10);
		});

		it("should honour page and pageSize", async () => {
			mockRequest = { query: { page: "2", pageSize: "1" } };

			await EmployeeClockInController.getAllClockIns(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.page).toBe(2);
			expect(body.pageSize).toBe(1);
			expect(body.data.length).toBe(1);
			expect(body.total).toBe(2);
		});

		it("should pass the status filter through to the model", async () => {
			mockRequest = { query: { status: "closed" } };

			await EmployeeClockInController.getAllClockIns(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.total).toBe(1);
			expect(body.data[0].clock_out).not.toBeNull();
		});

		it("should ignore malformed filters without failing", async () => {
			mockRequest = {
				query: {
					status: "bogus",
					sort: "nope",
					dir: "sideways",
					from: "14-11-2026",
					to: "not-a-date"
				}
			};

			await EmployeeClockInController.getAllClockIns(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(200);
			const body = responseBody();
			expect(body.total).toBe(2);
		});
	});

	describe("getClockedInEmployees", () => {
		it("should return the active page in the shared envelope", async () => {
			mockRequest = { query: {} };

			await EmployeeClockInController.getClockedInEmployees(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.total).toBe(1);
			expect(body.data.length).toBe(1);
			expect(body.data[0].clock_out).toBeNull();
			expect(body.page).toBe(1);
			expect(body.pageSize).toBe(10);
		});

		it("should return the whole active set with all=true", async () => {
			mockRequest = { query: { all: "true" } };

			await EmployeeClockInController.getClockedInEmployees(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.page).toBe(1);
			expect(body.pageSize).toBe(body.data.length);
			expect(body.data.length).toBe(body.total);
		});

		it("should filter missing clock-outs with today", async () => {
			await dbHelper.clearEmployeeClockIns();
			const employeeId = insertedData.employees[0].employee_id;
			await insertClockIn(
				employeeId,
				"date_trunc('day', now()) - interval '3 days' + interval '9 hours'",
				null
			);
			await insertClockIn(
				employeeId,
				"date_trunc('day', now()) + interval '1 day'",
				null
			);
			mockRequest = {
				query: { missingOnly: "true", today: localDay(0) }
			};

			await EmployeeClockInController.getClockedInEmployees(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.total).toBe(1);
			expect(
				body.data.every(
					(row: { clock_out: string | null }) => row.clock_out === null
				)
			).toBeTrue();
		});
	});

	describe("getClockedInStats", () => {
		it("should return the aggregate figures", async () => {
			await dbHelper.clearEmployeeClockIns();
			await insertClockIn(
				insertedData.employees[0].employee_id,
				"now() - interval '13 hours'",
				null
			);
			mockRequest = { query: {} };

			await EmployeeClockInController.getClockedInStats(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.activeCount).toBe(1);
			expect(body.over12hCount).toBe(1);
			expect(Array.isArray(body.openEmployeeIds)).toBeTrue();
			expect(Array.isArray(body.duplicateEmployeeIds)).toBeTrue();
			expect(body.openEmployeeIds).toEqual([
				insertedData.employees[0].employee_id
			]);
		});

		it("should ignore an invalid today value", async () => {
			mockRequest = { query: { today: "not-a-date" } };

			await EmployeeClockInController.getClockedInStats(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(200);
			const body = responseBody();
			expect(typeof body.activeCount).toBe("number");
			expect(typeof body.missingCount).toBe("number");
		});
	});
});
