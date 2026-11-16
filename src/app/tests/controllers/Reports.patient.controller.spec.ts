// src/app/tests/controllers/Reports.patient.controller.spec.ts
//
// Phase 6.11.1 — patient report controller. Covers the query contract
// (snake_case params in, snake_case envelope out), the 400/404/500 paths and
// the `insurance_id`-only-with-insurance rule.

import type { Request, Response } from "express";

import ReportsController from "../../controllers/Reports.controller.js";
import PatientReportModel from "../../models/reports/PatientReport.model.js";
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
	query: Record<string, unknown>,
	params: Record<string, string> = {},
	user: Request["user"] = {
		userId: 1,
		username: "admin",
		role: "Admin",
		permissions: [],
	}
): Request {
	return { user, query, params } as unknown as Request;
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

describe("ReportsController — patient report", () => {
	let data: TestData;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportsSchema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		data = await dbHelper.seedDatabase();
	});

	it("returns the list envelope with snake_case keys", async () => {
		const res = makeResponse();
		await ReportsController.listPatients(
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
		expect(Array.isArray(payload.data)).toBeTrue();
		expect(Object.keys(payload.summary)).toEqual([
			"total_patients",
			"total_admissions",
			"total_billed",
			"total_paid",
			"total_outstanding",
		]);
	});

	it("honours payment_type, search and pagination", async () => {
		const res = makeResponse();
		await ReportsController.listPatients(
			makeRequest({
				...RANGE,
				payment_type: "cash",
				search: "John",
				page: "1",
				page_size: "10",
			}),
			asResponse(res)
		);

		const payload = lastPayload(res);
		expect(payload.page_size).toBe(10);
		payload.data.forEach((row: any) => {
			expect(row.payment_type).toBe("cash");
		});
	});

	it("ignores insurance_id unless payment_type is insurance", async () => {
		const companyId = data.insuranceCompanies[0].insurance_id;

		const cash = makeResponse();
		await ReportsController.listPatients(
			makeRequest({
				...RANGE,
				payment_type: "cash",
				insurance_id: String(companyId),
			}),
			asResponse(cash)
		);
		// Would be empty if the id leaked into the cash query.
		expect(lastPayload(cash).summary.total_patients).toBeGreaterThan(0);
	});

	it("rejects a missing or malformed date range with 400", async () => {
		const missing = makeResponse();
		await ReportsController.listPatients(
			makeRequest({ end_date: RANGE.end_date }),
			asResponse(missing)
		);
		expect(missing.status).toHaveBeenCalledWith(400);
		expect(lastPayload(missing).error).toContain("start_date");

		const malformed = makeResponse();
		await ReportsController.listPatients(
			makeRequest({ start_date: "30/09/2026", end_date: RANGE.end_date }),
			asResponse(malformed)
		);
		expect(malformed.status).toHaveBeenCalledWith(400);
		expect(lastPayload(malformed).error).toContain("YYYY-MM-DD");

		const inverted = makeResponse();
		await ReportsController.listPatients(
			makeRequest({ start_date: RANGE.end_date, end_date: RANGE.start_date }),
			asResponse(inverted)
		);
		expect(inverted.status).toHaveBeenCalledWith(400);
	});

	it("rejects an unsupported page size and sort column with 400", async () => {
		const pageSize = makeResponse();
		await ReportsController.listPatients(
			makeRequest({ ...RANGE, page_size: "5000" }),
			asResponse(pageSize)
		);
		expect(pageSize.status).toHaveBeenCalledWith(400);
		expect(lastPayload(pageSize).error).toContain("page_size");

		const sort = makeResponse();
		await ReportsController.listPatients(
			makeRequest({ ...RANGE, sort: "national_id" }),
			asResponse(sort)
		);
		expect(sort.status).toHaveBeenCalledWith(400);
		expect(lastPayload(sort).error).toContain("sort must be one of");
	});

	it("rejects an unknown payment type with 400", async () => {
		const res = makeResponse();
		await ReportsController.listPatients(
			makeRequest({ ...RANGE, payment_type: "barrier" }),
			asResponse(res)
		);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("payment_type");
	});

	it("returns the patient detail envelope", async () => {
		const patientId = String(data.patients[0].patient_id);
		const res = makeResponse();
		await ReportsController.getPatient(
			makeRequest({ ...RANGE }, { patientId }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual(["patient", "admissions"]);
		expect(payload.patient.patient_id).toBe(data.patients[0].patient_id);
		expect(Array.isArray(payload.admissions)).toBeTrue();
	});

	it("returns 404 for an unknown patient and 400 for a bad id", async () => {
		const missing = makeResponse();
		await ReportsController.getPatient(
			makeRequest({ ...RANGE }, { patientId: "999999" }),
			asResponse(missing)
		);
		expect(missing.status).toHaveBeenCalledWith(404);
		expect(lastPayload(missing)).toEqual({ error: "Patient not found" });

		const bad = makeResponse();
		await ReportsController.getPatient(
			makeRequest({ ...RANGE }, { patientId: "abc" }),
			asResponse(bad)
		);
		expect(bad.status).toHaveBeenCalledWith(400);
	});

	it("returns the export envelope without paging keys", async () => {
		const res = makeResponse();
		await ReportsController.exportPatients(
			makeRequest({ ...RANGE }),
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
	});

	it("returns 500 without leaking the underlying error", async () => {
		const res = makeResponse();
		spyOn(PatientReportModel, "listPatients").and.returnValue(
			Promise.reject(new Error("kaboom"))
		);

		await ReportsController.listPatients(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(lastPayload(res)).toEqual({ error: "Failed to load patient report" });
	});
});
