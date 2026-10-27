// src/app/tests/controllers/ReportV2.nurse.controller.spec.ts
//
// Phase 6.11.3 — nurse report controller. Covers the query contract
// (snake_case params in, snake_case envelope out), the 400/404 paths and the
// export envelope.

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

const RANGE = { start_date: localDate(-30), end_date: localDate(0) };

function lastPayload(res: MockResponse): any {
	return res.json.calls.mostRecent().args[0];
}

describe("ReportV2Controller — nurse report", () => {
	let data: TestData;
	let nurseId: string;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		data = await dbHelper.seedDatabase();
		nurseId = String(data.employees[2].employee_id);

		// Two in-range assignments for the same nurse/patient pair on
		// different days, plus one for a different patient.
		await query(
			`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
			 VALUES ($1, $2, $4::date, 2), ($1, $2, $5::date, 3), ($1, $3, $4::date, 1)`,
			[
				data.employees[2].employee_id,
				data.patients[0].patient_id,
				data.patients[1].patient_id,
				localDate(-2),
				localDate(-1),
			]
		);
	});

	it("returns the list envelope with snake_case keys", async () => {
		const res = makeResponse();
		await ReportV2Controller.listNurses(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"summary",
			"data",
			"total",
			"page",
			"page_size",
		]);
		expect(payload.page).toBe(1);
		expect(payload.page_size).toBe(25);
		expect(payload.total).toBe(1);
		expect(Object.keys(payload.summary)).toEqual([
			"total_nurses",
			"total_patients",
			"total_patient_assignments",
			"total_days",
			"total_hours",
		]);
		expect(payload.summary.total_hours).toBe(6);
		expect(Object.keys(payload.data[0])).toEqual([
			"nurse_id",
			"nurse_name",
			"patients_count",
			"days_worked",
			"total_hours",
			"last_work_date",
		]);
	});

	it("accepts nurse_id, search, sort and paging", async () => {
		const res = makeResponse();
		await ReportV2Controller.listNurses(
			makeRequest({
				...RANGE,
				nurse_id: nurseId,
				search: "mary",
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
		expect(payload.data[0].nurse_name).toBe("Nurse Mary Brown");
	});

	it("400s when the dates are missing", async () => {
		const res = makeResponse();
		await ReportV2Controller.listNurses(
			makeRequest({ start_date: localDate(-1) }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("end_date");
	});

	it("400s on an unknown sort key", async () => {
		const res = makeResponse();
		await ReportV2Controller.listNurses(
			makeRequest({ ...RANGE, sort: "salary" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("sort");
	});

	it("400s on a page size outside the whitelist", async () => {
		const res = makeResponse();
		await ReportV2Controller.listNurses(
			makeRequest({ ...RANGE, page_size: "999" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("page_size");
	});

	it("returns the detail envelope with the daily accordion", async () => {
		const res = makeResponse();
		await ReportV2Controller.getNurse(
			makeRequest({ ...RANGE, page_size: "10" }, { nurseId }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"nurse",
			"summary",
			"data",
			"daily_assignments",
			"total",
			"page",
			"page_size",
		]);
		expect(payload.nurse.nurse_name).toBe("Nurse Mary Brown");
		expect(payload.summary).toEqual({ patients: 2, days: 2, hours: 6 });
		expect(payload.daily_assignments).toHaveSize(2);
		// Newest day first; the earlier day carries both patients.
		expect(payload.daily_assignments[0].patient_count).toBe(1);
		expect(payload.daily_assignments[1].patient_count).toBe(2);
		expect(Object.keys(payload.data[0])).toEqual([
			"patient_id",
			"patient_name",
			"payment_type",
			"last_admission_time",
			"last_discharge_time",
			"diagnosis",
			"days_assigned",
			"hours_worked",
		]);
	});

	it("404s for an unknown nurse", async () => {
		const res = makeResponse();
		await ReportV2Controller.getNurse(
			makeRequest({ ...RANGE }, { nurseId: "999999" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(404);
	});

	it("404s when the id belongs to a doctor", async () => {
		const res = makeResponse();
		await ReportV2Controller.getNurse(
			makeRequest(
				{ ...RANGE },
				{ nurseId: String(data.doctors[0].doctor_id) }
			),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(404);
	});

	it("returns the export envelope without paging", async () => {
		const res = makeResponse();
		await ReportV2Controller.exportNurses(
			makeRequest({ ...RANGE, page: "2", page_size: "10" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"generated_at",
			"range",
			"summary",
			"data",
		]);
		expect(payload.range).toEqual({
			start_date: RANGE.start_date,
			end_date: RANGE.end_date,
		});
		expect(payload.data).toHaveSize(1);
		expect(payload.data[0].patients).toHaveSize(2);
		expect(payload.data[0].daily_assignments).toHaveSize(2);
	});
});
