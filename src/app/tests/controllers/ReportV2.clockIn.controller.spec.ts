// src/app/tests/controllers/ReportV2.clockIn.controller.spec.ts
//
// Phase 6.11.6 — clock-in controller. Covers the wire contract (snake_case in,
// snake_case out), the sort/status whitelists, paging, the 400/404 paths and
// the export envelope.

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

describe("ReportV2Controller — clock-ins", () => {
	let data: TestData;
	let doctorId: string;
	let nurseId: string;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		data = await dbHelper.seedDatabase();

		await query("DELETE FROM EmployeeClockIn");

		doctorId = String(data.employees[0].employee_id);
		nurseId = String(data.employees[2].employee_id);

		await query(
			`INSERT INTO EmployeeClockIn (employee_id, clock_in, clock_out, pay_deduction)
			 VALUES ($1, $2::timestamp, $3::timestamp, 0)`,
			[
				data.employees[0].employee_id,
				localStamp(-4, "08:00:00"),
				localStamp(-4, "17:00:00"),
			]
		);

		await query(
			`INSERT INTO EmployeeClockIn (employee_id, clock_in, clock_out, pay_deduction)
			 VALUES ($1, $2::timestamp, $3::timestamp, 40)`,
			[
				data.employees[2].employee_id,
				localStamp(-3, "09:30:00"),
				localStamp(-3, "17:00:00"),
			]
		);
	});

	it("returns the list envelope with snake_case keys", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
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
		// Doctor (clocked in), Mary (clocked in), James (expected, no session).
		expect(payload.total).toBe(3);
		expect(Object.keys(payload.summary)).toEqual([
			"total_employees",
			"total_clock_ins",
			"total_hours",
			"total_worked_days",
			"avg_hours_per_day",
			"avg_hours_per_employee",
			"total_deductions",
			"total_missing_days",
		]);
		expect(payload.summary.total_clock_ins).toBe(2);
		expect(payload.summary.total_hours).toBe(16.5);
		expect(payload.summary.total_worked_days).toBe(2);
		expect(payload.summary.total_deductions).toBe(40);
		// Mary has 30 absent days (31 in range, one worked); James has all 31.
		expect(payload.summary.total_missing_days).toBe(61);
		expect(Object.keys(payload.data[0])).toEqual([
			"employee_id",
			"employee_name",
			"employee_type",
			"hire_date",
			"is_active",
			"need_clock_in",
			"shift_type",
			"shift_start_time",
			"shift_end_time",
			"clock_in_count",
			"total_hours",
			"avg_hours_per_day",
			"total_deductions",
			"attendance_summary",
		]);
		expect(Object.keys(payload.charts)).toEqual([
			"hours_by_employee",
			"status_distribution",
		]);
	});

	it("defaults to sorting by name and to the whole staff", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		const payload = lastPayload(res);
		expect(payload.data.map((row: any) => row.employee_name)).toEqual([
			"Dr. John Smith",
			"Nurse James Wilson",
			"Nurse Mary Brown",
		]);
	});

	it("accepts employee_type, employee_id, search, sort, dir and paging", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
			makeRequest({
				...RANGE,
				employee_type: "doctor",
				employee_id: doctorId,
				search: "smith",
				sort: "hours",
				dir: "desc",
				page: "1",
				page_size: "10",
			}),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(payload.page_size).toBe(10);
		expect(payload.total).toBe(1);
		expect(payload.data[0].employee_name).toBe("Dr. John Smith");
	});

	it("400s when the dates are missing", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
			makeRequest({ start_date: localDate(-1) }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("end_date");
	});

	it("400s on an unknown employee_type", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
			makeRequest({ ...RANGE, employee_type: "contractor" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("employee_type");
	});

	it("400s on an unknown sort key", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
			makeRequest({ ...RANGE, sort: "salary" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("sort");
	});

	it("400s on an unknown direction", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
			makeRequest({ ...RANGE, dir: "up" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("dir");
	});

	it("400s on a page size outside the whitelist", async () => {
		const res = makeResponse();
		await ReportV2Controller.listClockIns(
			makeRequest({ ...RANGE, page_size: "999" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("page_size");
	});

	it("returns the detail envelope with the attendance summary", async () => {
		const res = makeResponse();
		await ReportV2Controller.getClockInEmployee(
			makeRequest({ ...RANGE, page_size: "10" }, { employeeId: nurseId }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"employee",
			"attendance_summary",
			"records",
			"total",
			"page",
			"page_size",
		]);
		expect(Object.keys(payload.employee)).toEqual([
			"employee_id",
			"employee_name",
			"employee_type",
			"hire_date",
			"is_active",
			"need_clock_in",
			"shift_type",
			"shift_start_time",
			"shift_end_time",
		]);
		expect(payload.employee.employee_name).toBe("Nurse Mary Brown");
		expect(payload.attendance_summary.worked_days).toBe(1);
		expect(payload.attendance_summary.late_days).toBe(1);
		expect(payload.attendance_summary.missing_days).toBe(30);
		// One session plus 30 synthesized absent days.
		expect(payload.total).toBe(31);
		expect(payload.records).toHaveSize(10);
		expect(Object.keys(payload.records[0])).toEqual([
			"clock_id",
			"date",
			"clock_in",
			"clock_out",
			"hours_worked",
			"pay_deduction",
			"status",
			"is_missing",
			"late_minutes",
			"early_minutes",
			"patients",
			"patient_count",
		]);
	});

	it("filters the detail records by status", async () => {
		const res = makeResponse();
		await ReportV2Controller.getClockInEmployee(
			makeRequest(
				{ ...RANGE, status: "late", page_size: "10" },
				{ employeeId: nurseId }
			),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(payload.total).toBe(1);
		expect(payload.records[0].status).toBe("late");
		expect(payload.records[0].late_minutes).toBe(60);
		expect(payload.records[0].pay_deduction).toBe(40);
	});

	it("400s on an unknown status", async () => {
		const res = makeResponse();
		await ReportV2Controller.getClockInEmployee(
			makeRequest({ ...RANGE, status: "absent" }, { employeeId: nurseId }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("status");
	});

	it("404s for an unknown employee", async () => {
		const res = makeResponse();
		await ReportV2Controller.getClockInEmployee(
			makeRequest({ ...RANGE }, { employeeId: "999999" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(lastPayload(res).error).toBe("Employee not found");
	});

	it("returns the export envelope without paging", async () => {
		const res = makeResponse();
		await ReportV2Controller.exportClockIns(
			makeRequest({ ...RANGE, page: "2", page_size: "10" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"generated_at",
			"range",
			"summary",
			"charts",
			"data",
		]);
		expect(payload.range).toEqual({
			start_date: RANGE.start_date,
			end_date: RANGE.end_date,
		});
		expect(payload.data).toHaveSize(3);
		expect(payload.summary.total_clock_ins).toBe(2);
		expect(payload.data[0].records).toEqual(jasmine.any(Array));
	});
});
