import EmployeePaymentController from "../../controllers/EmployeePayment.controller.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/** Insert a system-issued (unpaid, unstamped) payment. */
async function insertPendingPayment(
	employeeId: number,
	paymentAmount: number,
	issuedSql = "CURRENT_TIMESTAMP"
) {
	const { rows } = await query(
		`INSERT INTO EmployeePayment (
			employee_id, payment_amount, payment_type, issued_timestamp
		 ) VALUES ($1, $2, 'salary', ${issuedSql})
		 RETURNING *;`,
		[employeeId, paymentAmount]
	);
	return rows[0];
}

describe("EmployeePaymentController", () => {
	let mockRequest: any;
	let mockResponse: any;
	let insertedData: TestData;

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

	function responseBody() {
		return mockResponse.status().json.calls.mostRecent().args[0];
	}

	describe("getAllPayments", () => {
		it("should return the shared envelope", async () => {
			mockRequest = { query: {} };

			await EmployeePaymentController.getAllPayments(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(Array.isArray(body.data)).toBeTrue();
			expect(body.data.length).toBe(2);
			expect(body.total).toBe(2);
			expect(body.page).toBe(1);
			expect(body.pageSize).toBe(25);
		});

		it("should honour page/pageSize and all=true", async () => {
			mockRequest = { query: { page: "2", pageSize: "1" } };
			await EmployeePaymentController.getAllPayments(
				mockRequest,
				mockResponse
			);
			let body = responseBody();
			expect(body.page).toBe(2);
			expect(body.pageSize).toBe(1);
			expect(body.data.length).toBe(1);

			mockRequest = { query: { all: "true" } };
			await EmployeePaymentController.getAllPayments(
				mockRequest,
				mockResponse
			);
			body = responseBody();
			expect(body.data.length).toBe(body.total);
			expect(body.page).toBe(1);
			expect(body.pageSize).toBe(body.total);
		});
	});

	describe("getPendingPaymentGroups", () => {
		it("should return grouped rows in the envelope", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPendingPayment(emp0, 100);
			await insertPendingPayment(emp0, 50);
			await insertPendingPayment(emp2, 70);

			mockRequest = { query: {} };

			await EmployeePaymentController.getPendingPaymentGroups(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.total).toBe(2);
			expect(body.data.length).toBe(2);
			expect(body.data[0].employee_id).toBe(emp0);
			expect(body.data[0].payment_count).toBe(2);
			expect(body.data[0].total_amount).toBe(150);
			expect(body.page).toBe(1);
			expect(body.pageSize).toBe(25);
		});

		it("should pass search, pagination, and sort through", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPendingPayment(emp0, 100);
			await insertPendingPayment(emp2, 70);

			mockRequest = {
				query: { search: "Mary", page: "1", pageSize: "10" }
			};
			await EmployeePaymentController.getPendingPaymentGroups(
				mockRequest,
				mockResponse
			);
			let body = responseBody();
			expect(body.total).toBe(1);
			expect(body.data[0].employee_id).toBe(emp2);

			mockRequest = {
				query: { sort: "totalAmount", dir: "desc", pageSize: "1" }
			};
			await EmployeePaymentController.getPendingPaymentGroups(
				mockRequest,
				mockResponse
			);
			body = responseBody();
			expect(body.data.length).toBe(1);
			expect(body.data[0].employee_id).toBe(emp0);
			expect(body.total).toBe(2);
		});

		it("should fall back on invalid filters instead of failing", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			await insertPendingPayment(emp0, 100);

			mockRequest = {
				query: {
					sort: "bogus",
					dir: "sideways",
					from: "14-11-2026",
					to: "not-a-date"
				}
			};

			await EmployeePaymentController.getPendingPaymentGroups(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.total).toBe(1);
			expect(body.data[0].employee_id).toBe(emp0);
		});
	});

	describe("getPendingPaymentStats", () => {
		it("should return pending and employee counts", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			await insertPendingPayment(emp0, 100);
			await insertPendingPayment(emp0, 50);

			mockRequest = { query: {} };

			await EmployeePaymentController.getPendingPaymentStats(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(body.pending_count).toBe(2);
			expect(body.employee_count).toBe(1);
		});
	});

	describe("getPendingPaymentsForEmployee", () => {
		it("should return that employee's pending rows", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPendingPayment(emp0, 100);
			await insertPendingPayment(emp0, 50);
			await insertPendingPayment(emp2, 70);

			mockRequest = { params: { id: String(emp0) }, query: {} };

			await EmployeePaymentController.getPendingPaymentsForEmployee(
				mockRequest,
				mockResponse
			);

			const body = responseBody();
			expect(Array.isArray(body)).toBeTrue();
			expect(body.length).toBe(2);
			expect(body.every((p: any) => p.employee_id === emp0)).toBeTrue();
		});
	});

	describe("bulk actions", () => {
		it("should mark all pending payments of one employee paid", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPendingPayment(emp0, 100);
			await insertPendingPayment(emp0, 50);
			await insertPendingPayment(emp2, 70);

			mockRequest = {
				params: { id: String(emp0) },
				query: {},
				user: { userId: insertedData.users[0].user_id }
			};

			await EmployeePaymentController.markPendingPaymentsPaidForEmployee(
				mockRequest,
				mockResponse
			);

			expect(responseBody()).toEqual({ updated: 2 });

			mockRequest = { query: {} };
			await EmployeePaymentController.getPendingPaymentStats(
				mockRequest,
				mockResponse
			);
			expect(responseBody().pending_count).toBe(1);
		});

		it("should void all pending payments of one employee", async () => {
			const emp2 = insertedData.employees[2].employee_id;
			await insertPendingPayment(emp2, 70);

			mockRequest = { params: { id: String(emp2) }, query: {} };

			await EmployeePaymentController.voidPendingPaymentsForEmployee(
				mockRequest,
				mockResponse
			);

			expect(responseBody()).toEqual({ updated: 1 });

			mockRequest = { query: {} };
			await EmployeePaymentController.getPendingPaymentGroups(
				mockRequest,
				mockResponse
			);
			expect(responseBody().total).toBe(0);
		});
	});
});
