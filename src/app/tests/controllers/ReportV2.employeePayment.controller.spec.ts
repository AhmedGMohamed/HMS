// src/app/tests/controllers/ReportV2.employeePayment.controller.spec.ts
//
// Phase 6.11.5 — payroll controller. Covers the query contract (snake_case
// params in, snake_case envelope out), the filter defaults, the 400/404 paths
// and the export envelope.

import type { Request, Response } from "express";

import ReportV2Controller from "../../controllers/ReportV2.controller.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

interface MockResponse {
	status: jasmine.Spy;
	json: jasmine.Spy;
}

function makeResponse(): MockResponse {
	const json = jasmine.createSpy("json");
	const status = jasmine.createSpy("status").and.callFake(() => ({ json }));
	return { status, json };
}

function asResponse(response: MockResponse): Response {
	return response as unknown as Response;
}

function makeRequest(
	queryParams: Record<string, unknown>,
	params: Record<string, string> = {},
	user: Request["user"] = {
		userId: 1,
		username: "admin",
		role: "Admin",
		permissions: [],
	}
): Request {
	return { user, query: queryParams, params } as unknown as Request;
}

/** Local `YYYY-MM-DD`. */
function localDate(offsetDays = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

function localStamp(offsetDays: number, time = "10:00:00"): string {
	return `${localDate(offsetDays)} ${time}`;
}

const RANGE = { start_date: localDate(-30), end_date: localDate(0) };

function lastPayload(res: MockResponse): any {
	return res.json.calls.mostRecent().args[0];
}

describe("ReportV2Controller — employee payments", () => {
	let data: TestData;
	let doctorId: string;
	let nurseId: string;
	let doctorPaymentId: string;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		data = await dbHelper.seedDatabase();

		await query("DELETE FROM EmployeePayment");
		await query("DELETE FROM EmployeeClockIn");

		doctorId = String(data.employees[0].employee_id);
		nurseId = String(data.employees[2].employee_id);

		const { rows } = await query(
			`INSERT INTO EmployeePayment
			     (employee_id, payment_amount, extra_amount, payment_type,
			      is_paid, is_void, issued_timestamp, paid_by_user_id)
			 VALUES ($1, 1000, 200, 'salary', true, false, $2::timestamp, $3)
			 RETURNING payment_id`,
			[
				data.employees[0].employee_id,
				localStamp(-3),
				data.users[0].user_id,
			]
		);
		doctorPaymentId = String(rows[0].payment_id);

		await query(
			`INSERT INTO EmployeePayment
			     (employee_id, payment_amount, payment_type, is_paid, is_void, issued_timestamp)
			 VALUES ($1, 800, 'salary', false, false, $2::timestamp)`,
			[data.employees[2].employee_id, localStamp(-1)]
		);

		await query(
			`INSERT INTO EmployeeClockIn (employee_id, clock_in, clock_out, pay_deduction)
			 VALUES ($1, $2::timestamp, $3::timestamp, 40)`,
			[
				data.employees[0].employee_id,
				localStamp(-3, "09:30:00"),
				localStamp(-3, "17:00:00"),
			]
		);
	});

	it("returns the list envelope with snake_case keys", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"summary",
			"charts",
			"data",
			"total",
			"page",
			"page_size",
		]);
		expect(payload.page).toBe(1);
		expect(payload.page_size).toBe(25);
		expect(payload.total).toBe(2);
		expect(Object.keys(payload.summary)).toEqual([
			"total_employees",
			"total_payments",
			"total_base_pay",
			"total_extra_pay",
			"total_deductions",
			"total_paid",
			"total_unpaid",
			"total_net",
		]);
		expect(payload.summary.total_net).toBe(1960); // 1160 (doctor) + 800 (nurse)
		expect(Object.keys(payload.data[0])).toEqual([
			"employee_id",
			"employee_name",
			"employee_type",
			"hire_date",
			"payment_count",
			"total_base_pay",
			"total_extra_pay",
			"total_deductions",
			"total_paid",
			"total_unpaid",
			"net_payment",
		]);
		expect(Object.keys(payload.charts)).toEqual(["timeline", "by_type"]);
	});

	it("defaults the grouping to month and the employee type to all", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		const payload = lastPayload(res);
		// One calendar month is at most two buckets over a 30-day window.
		expect(payload.charts.timeline.length).toBeLessThanOrEqual(2);
		expect(payload.total).toBe(2);
	});

	it("accepts employee_type, employee_id, search, grouping, sort and paging", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({
				...RANGE,
				employee_type: "doctor",
				employee_id: doctorId,
				search: "smith",
				grouping: "day",
				sort: "base",
				dir: "asc",
				page: "1",
				page_size: "10",
			}),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(payload.page_size).toBe(10);
		expect(payload.data).toHaveSize(1);
		expect(payload.data[0].employee_name).toBe("Dr. John Smith");
		expect(payload.charts.timeline).toHaveSize(31);
	});

	it("400s when the dates are missing", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({ start_date: localDate(-1) }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("end_date");
	});

	it("400s on an unknown employee_type", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({ ...RANGE, employee_type: "contractor" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("employee_type");
	});

	it("400s on an unknown grouping", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({ ...RANGE, grouping: "week" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("grouping");
	});

	it("400s on an unknown sort key", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({ ...RANGE, sort: "salary" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("sort");
	});

	it("400s on a page size outside the whitelist", async () => {
		const res = makeResponse();
		await ReportV2Controller.listEmployeePayments(
			makeRequest({ ...RANGE, page_size: "999" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("page_size");
	});

	it("returns the detail envelope with breakdown, payments and deductions", async () => {
		const res = makeResponse();
		await ReportV2Controller.getEmployeePayment(
			makeRequest({ ...RANGE, page_size: "10" }, { employeeId: doctorId }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"employee",
			"breakdown",
			"summary",
			"payments",
			"period_deductions",
			"total",
			"page",
			"page_size",
		]);
		expect(payload.employee.employee_name).toBe("Dr. John Smith");
		expect(payload.breakdown.shift_start_time).toBe("08:00:00");
		expect(payload.summary.net_payment).toBe(1160); // 1000 + 200 − 40
		expect(payload.payments).toHaveSize(1);
		expect(payload.period_deductions).toHaveSize(1);
		expect(payload.period_deductions[0].status).toBe("late");
		expect(payload.total).toBe(1);
	});

	it("404s for an unknown employee", async () => {
		const res = makeResponse();
		await ReportV2Controller.getEmployeePayment(
			makeRequest({ ...RANGE }, { employeeId: "999999" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(lastPayload(res).error).toBe("Employee not found");
	});

	it("returns the associations for one payment", async () => {
		const res = makeResponse();
		await ReportV2Controller.getPaymentAssociations(
			makeRequest(
				{},
				{ employeeId: doctorId, paymentId: doctorPaymentId }
			),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual(["payment", "associations"]);
		expect(payload.payment.payment_id).toBe(Number(doctorPaymentId));
		expect(payload.associations).toHaveSize(0);
	});

	it("404s when the payment belongs to another employee", async () => {
		const res = makeResponse();
		await ReportV2Controller.getPaymentAssociations(
			makeRequest(
				{},
				{ employeeId: nurseId, paymentId: doctorPaymentId }
			),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(lastPayload(res).error).toBe("Payment not found");
	});

	it("returns the export envelope without paging", async () => {
		const res = makeResponse();
		await ReportV2Controller.exportEmployeePayments(
			makeRequest({ ...RANGE, page: "2", page_size: "10" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"generated_at",
			"range",
			"grouping",
			"summary",
			"charts",
			"data",
		]);
		expect(payload.range).toEqual({
			start_date: RANGE.start_date,
			end_date: RANGE.end_date,
		});
		expect(payload.grouping).toBe("month");
		expect(payload.data).toHaveSize(2);
		expect(payload.data[0].totals).toBeDefined();
		expect(
			payload.data.map((row: any) => [
				row.employee_name,
				row.payments.length,
				row.period_deductions.length,
			])
		).toEqual([
			["Dr. John Smith", 1, 1],
			["Nurse Mary Brown", 1, 0],
		]);
	});
});
