// src/app/tests/controllers/Reports.doctor.controller.spec.ts
//
// Phase 6.11.2 — doctor report controller. Covers the query contract
// (snake_case params in, snake_case envelope out), the relationship default
// and validation, the 400/404/500 paths and the export's admission flag.

import type { Request, Response } from "express";

import ReportsController from "../../controllers/Reports.controller.js";
import DoctorReportModel from "../../models/reports/DoctorReport.model.js";
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

describe("ReportsController — doctor report", () => {
	let data: TestData;
	let referringId: string;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportsSchema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		data = await dbHelper.seedDatabase();
		referringId = String(data.doctors[1].doctor_id);

		// One attended admission so the `attended` population is not empty.
		await query(
			`INSERT INTO DoctorPatientHistory (patient_history_id, doctor_id)
			 VALUES ($1, $2)`,
			[data.patientHistories[0].patient_history_id, data.doctors[0].doctor_id]
		);
	});

	it("returns the list envelope with snake_case keys", async () => {
		const res = makeResponse();
		await ReportsController.listDoctors(
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
			"relationship",
			"total_doctors",
			"total_patients",
			"total_patient_assignments",
			"total_admissions",
			"total_billed",
			"total_paid",
		]);
	});

	it("defaults to the referred population", async () => {
		const res = makeResponse();
		await ReportsController.listDoctors(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		const payload = lastPayload(res);
		expect(payload.summary.relationship).toBe("referred");
		expect(payload.data.length).toBe(1);
		expect(payload.data[0].doctor_id).toBe(data.doctors[1].doctor_id);
		expect(payload.data[0].doctor_type).toBe("referring");
	});

	it("honours the relationship, doctor_id, search and paging params", async () => {
		const attended = makeResponse();
		await ReportsController.listDoctors(
			makeRequest({ ...RANGE, relationship: "attended" }),
			asResponse(attended)
		);
		const attendedPayload = lastPayload(attended);
		expect(attendedPayload.summary.relationship).toBe("attended");
		expect(attendedPayload.data[0].doctor_id).toBe(data.doctors[0].doctor_id);

		const one = makeResponse();
		await ReportsController.listDoctors(
			makeRequest({
				...RANGE,
				doctor_id: referringId,
				search: "Sarah",
				page: "1",
				page_size: "10",
			}),
			asResponse(one)
		);
		const onePayload = lastPayload(one);
		expect(onePayload.page_size).toBe(10);
		expect(onePayload.data.length).toBe(1);
		expect(onePayload.data[0].doctor_id).toBe(data.doctors[1].doctor_id);
	});

	it("rejects an unknown relationship, page size or sort with 400", async () => {
		const relationship = makeResponse();
		await ReportsController.listDoctors(
			makeRequest({ ...RANGE, relationship: "haunted" }),
			asResponse(relationship)
		);
		expect(relationship.status).toHaveBeenCalledWith(400);
		expect(lastPayload(relationship).error).toContain("relationship");

		const pageSize = makeResponse();
		await ReportsController.listDoctors(
			makeRequest({ ...RANGE, page_size: "5000" }),
			asResponse(pageSize)
		);
		expect(pageSize.status).toHaveBeenCalledWith(400);
		expect(lastPayload(pageSize).error).toContain("page_size");

		const sort = makeResponse();
		await ReportsController.listDoctors(
			makeRequest({ ...RANGE, sort: "national_id" }),
			asResponse(sort)
		);
		expect(sort.status).toHaveBeenCalledWith(400);
		expect(lastPayload(sort).error).toContain("sort must be one of");
	});

	it("rejects a missing date range with 400", async () => {
		const res = makeResponse();
		await ReportsController.listDoctors(
			makeRequest({ end_date: RANGE.end_date }),
			asResponse(res)
		);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("start_date");
	});

	it("returns the detail envelope", async () => {
		const res = makeResponse();
		await ReportsController.getDoctor(
			makeRequest({ ...RANGE }, { doctorId: referringId }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"doctor",
			"summary",
			"data",
			"total",
			"page",
			"page_size",
		]);
		expect(payload.doctor.doctor_id).toBe(data.doctors[1].doctor_id);
		expect(Object.keys(payload.summary)).toEqual([
			"patients",
			"admissions",
			"billed",
			"paid",
		]);
		expect(payload.total).toBe(payload.summary.patients);
	});

	it("returns 404 for an unknown doctor and 400 for a bad id", async () => {
		const missing = makeResponse();
		await ReportsController.getDoctor(
			makeRequest({ ...RANGE }, { doctorId: "999999" }),
			asResponse(missing)
		);
		expect(missing.status).toHaveBeenCalledWith(404);
		expect(lastPayload(missing)).toEqual({ error: "Doctor not found" });

		const bad = makeResponse();
		await ReportsController.getDoctor(
			makeRequest({ ...RANGE }, { doctorId: "abc" }),
			asResponse(bad)
		);
		expect(bad.status).toHaveBeenCalledWith(400);
	});

	it("rejects a supervised report for a non-supervising doctor with 400", async () => {
		const res = makeResponse();
		await ReportsController.getDoctor(
			makeRequest(
				{ ...RANGE, relationship: "supervised" },
				{ doctorId: referringId }
			),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("supervising");
	});

	it("returns the export envelope without paging keys", async () => {
		const res = makeResponse();
		await ReportsController.exportDoctors(
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
		expect(Object.keys(payload.data[0])).toEqual([
			"doctor_id",
			"doctor_name",
			"doctor_type",
			"totals",
			"patients",
		]);
		expect(payload.data[0].patients[0].admissions).toBeUndefined();
	});

	it("attaches admissions only for a single-doctor export", async () => {
		const single = makeResponse();
		await ReportsController.exportDoctors(
			makeRequest({
				...RANGE,
				doctor_id: referringId,
				include_admissions: "true",
			}),
			asResponse(single)
		);
		const payload = lastPayload(single);
		expect(payload.data.length).toBe(1);
		expect(payload.data[0].patients.length).toBeGreaterThan(0);
		expect(Array.isArray(payload.data[0].patients[0].admissions)).toBeTrue();

		// Without `doctor_id` the flag is ignored, not an error.
		const all = makeResponse();
		await ReportsController.exportDoctors(
			makeRequest({ ...RANGE, include_admissions: "true" }),
			asResponse(all)
		);
		expect(lastPayload(all).data[0].patients[0].admissions).toBeUndefined();
	});

	it("accepts include_admissions=false as false", async () => {
		const res = makeResponse();
		await ReportsController.exportDoctors(
			makeRequest({
				...RANGE,
				doctor_id: referringId,
				include_admissions: "false",
			}),
			asResponse(res)
		);

		expect(lastPayload(res).data[0].patients[0].admissions).toBeUndefined();
	});

	it("returns 500 without leaking the underlying error", async () => {
		const res = makeResponse();
		spyOn(DoctorReportModel, "listDoctors").and.returnValue(
			Promise.reject(new Error("kaboom"))
		);

		await ReportsController.listDoctors(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(lastPayload(res)).toEqual({ error: "Failed to load doctor report" });
	});
});
