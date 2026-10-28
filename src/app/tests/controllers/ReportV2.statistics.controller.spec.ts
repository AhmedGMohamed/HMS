// src/app/tests/controllers/ReportV2.statistics.controller.spec.ts
//
// Phase 6.11.4 — statistics controller. Covers the query contract (grouping
// default + validation, 400 paths) and the export envelope.

import type { Request, Response } from "express";

import ReportV2Controller from "../../controllers/ReportV2.controller.js";
import { query } from "../../models/database/connection.js";
import { dbHelper } from "../helpers/db.helper.js";

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

function makeRequest(queryParams: Record<string, unknown>): Request {
	return {
		user: {
			userId: 1,
			username: "admin",
			role: "Admin",
			permissions: [],
		},
		query: queryParams,
		params: {},
	} as unknown as Request;
}

const RANGE = { start_date: "2026-01-01", end_date: "2026-03-31" };

function lastPayload(res: MockResponse): any {
	return res.json.calls.mostRecent().args[0];
}

describe("ReportV2Controller — statistics", () => {
	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		const data = await dbHelper.seedDatabase();

		// One admission + one bill inside the range, so the envelope is not
		// trivially empty.
		await query(
			`UPDATE PatientHistory
			    SET admission_time = '2026-02-01 09:00:00',
			        discharge_time = '2026-02-05 09:00:00'
			  WHERE patient_history_id = $1`,
			[data.patientHistories[0].patient_history_id]
		);
		await query(`UPDATE Bill SET generated_at = '2026-02-02 10:00:00'`);
	});

	it("returns the statistics document with snake_case keys", async () => {
		const res = makeResponse();
		await ReportV2Controller.getStatistics(
			makeRequest({ ...RANGE, grouping: "month" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)).toEqual([
			"range",
			"kpis",
			"patient_census",
			"distribution",
			"average_stay",
			"revenue_trends",
			"admission_discharge",
			"top_services",
			"top_drugs",
			"staff_utilization",
		]);
		expect(payload.range).toEqual({
			start_date: RANGE.start_date,
			end_date: RANGE.end_date,
			grouping: "month",
		});
		expect(payload.patient_census).toHaveSize(3);
		expect(Object.keys(payload.kpis)).toEqual([
			"total_patients",
			"total_admissions",
			"total_discharges",
			"avg_stay_days",
			"total_billed",
			"total_collected",
			"total_outstanding",
		]);
		expect(payload.kpis.total_billed).toBe(2300);
	});

	it("defaults to daily buckets when grouping is absent", async () => {
		const res = makeResponse();
		await ReportV2Controller.getStatistics(
			makeRequest({ ...RANGE }),
			asResponse(res)
		);

		const payload = lastPayload(res);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(payload.range.grouping).toBe("day");
		// 90 days in the quarter.
		expect(payload.patient_census).toHaveSize(90);
	});

	it("rejects an unknown grouping with 400", async () => {
		const res = makeResponse();
		await ReportV2Controller.getStatistics(
			makeRequest({ ...RANGE, grouping: "week" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("grouping");
	});

	it("rejects a reversed range with 400", async () => {
		const res = makeResponse();
		await ReportV2Controller.getStatistics(
			makeRequest({ start_date: "2026-03-31", end_date: "2026-01-01" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(lastPayload(res).error).toContain("start_date");
	});

	it("returns the export envelope with generated_at", async () => {
		const res = makeResponse();
		await ReportV2Controller.exportStatistics(
			makeRequest({ ...RANGE, grouping: "month" }),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = lastPayload(res);
		expect(Object.keys(payload)[0]).toBe("generated_at");
		expect(payload.kpis.total_patients).toBe(1);
		expect(payload.revenue_trends).toHaveSize(3);
	});
});
