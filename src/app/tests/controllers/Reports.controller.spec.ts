// src/app/tests/controllers/Reports.controller.spec.ts
//
// Phase 6.11.0 — foundations. Verifies the `/api/reports/options`
// controller: response envelope, permission-driven payroll filtering, admin
// bypass, and the 500 path.

import type { Request, Response } from "express";

import ReportsController, {
	EXPORT_ROW_WARNING_THRESHOLD,
	countStatisticsExportRows,
	userHasAllPermissions,
	userHasPermission,
	warnIfLargeExport,
} from "../../controllers/Reports.controller.js";
import OptionsReportModel from "../../models/reports/OptionsReport.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/** Minimal Express-ish response double (spies, no real HTTP). */
interface MockResponse {
	status: jasmine.Spy;
	json: jasmine.Spy;
}

function makeResponse(): MockResponse {
	const json = jasmine.createSpy("json");
	const status = jasmine.createSpy("status").and.callFake(() => ({ json }));
	return { status, json };
}

/** Wraps a response double in the `Response` type the controller expects. */
function asResponse(response: MockResponse): Response {
	return response as unknown as Response;
}

function makeRequest(
	user: Request["user"],
	query: Record<string, unknown> = {}
): Request {
	return { user, query } as unknown as Request;
}

describe("ReportsController — options", () => {
	let insertedData: TestData;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportsSchema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	it("returns every picker list for a view_reports user", async () => {
		const res = makeResponse();
		await ReportsController.getOptions(
			makeRequest({
				userId: 1,
				username: "viewer",
				role: "User",
				permissions: ["view_reports"],
			}),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = res.json.calls.mostRecent().args[0];
		expect(Object.keys(payload)).toEqual([
			"insurance_companies",
			"doctors",
			"nurses",
			"payroll_employees",
			"clock_in_employees",
		]);
		expect(payload.insurance_companies.length).toBe(2);
		expect(payload.doctors.length).toBe(2);
		expect(payload.nurses.length).toBe(2);
		expect(payload.clock_in_employees.length).toBe(2);
	});

	it("withholds the payroll employee list without manage_employees", async () => {
		const res = makeResponse();
		await ReportsController.getOptions(
			makeRequest({
				userId: 2,
				username: "reporter",
				role: "User",
				permissions: ["view_reports", "manage_reports"],
			}),
			asResponse(res)
		);

		const payload = res.json.calls.mostRecent().args[0];
		expect(payload.payroll_employees).toEqual([]);
	});

	it("includes the payroll employee list with manage_employees", async () => {
		const res = makeResponse();
		await ReportsController.getOptions(
			makeRequest({
				userId: 3,
				username: "hr",
				role: "User",
				permissions: ["view_reports", "manage_employees"],
			}),
			asResponse(res)
		);

		const payload = res.json.calls.mostRecent().args[0];
		expect(payload.payroll_employees.length).toBe(insertedData.employees.length);
	});

	it("treats Admin as holding every permission", async () => {
		const res = makeResponse();
		await ReportsController.getOptions(
			makeRequest({
				userId: 4,
				username: "admin",
				role: "Admin",
				permissions: [],
			}),
			asResponse(res)
		);

		const payload = res.json.calls.mostRecent().args[0];
		expect(payload.payroll_employees.length).toBe(insertedData.employees.length);
	});

	it("returns 500 without leaking the underlying error", async () => {
		const res = makeResponse();
		spyOn(OptionsReportModel, "getOptions").and.returnValue(
			Promise.reject(new Error("kaboom"))
		);

		await ReportsController.getOptions(
			makeRequest({
				userId: 5,
				username: "viewer",
				role: "User",
				permissions: ["view_reports"],
			}),
			asResponse(res)
		);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json.calls.mostRecent().args[0]).toEqual({
			error: "Failed to load report options",
		});
	});
});

describe("ReportsController — permission helpers", () => {
	it("userHasPermission mirrors the server middleware", () => {
		const plain = makeRequest({
			userId: 1,
			username: "u",
			role: "User",
			permissions: ["view_reports"],
		});
		expect(userHasPermission(plain, "view_reports")).toBeTrue();
		expect(userHasPermission(plain, "manage_reports")).toBeFalse();
		expect(
			userHasPermission(
				makeRequest({ userId: 1, username: "a", role: "Admin", permissions: [] }),
				"manage_reports"
			)
		).toBeTrue();
		expect(userHasPermission(makeRequest(undefined), "view_reports")).toBeFalse();
	});

	it("userHasAllPermissions requires every permission", () => {
		const req = makeRequest({
			userId: 1,
			username: "u",
			role: "User",
			permissions: ["view_reports", "manage_employees"],
		});
		expect(
			userHasAllPermissions(req, ["view_reports", "manage_employees"])
		).toBeTrue();
		expect(
			userHasAllPermissions(req, ["view_reports", "manage_reports"])
		).toBeFalse();
	});
});

/**
 * Plan §3.7 — exports are uncapped, so the server logs anything above the
 * threshold and the client shows the same warning. The helper is pure, so it
 * needs no database.
 */
describe("ReportsController — large export warning", () => {
	const originalWarn = console.warn;

	afterEach(() => {
		console.warn = originalWarn;
	});

	it("stays quiet at or below the threshold", () => {
		const warn = jasmine.createSpy("warn");
		console.warn = warn;

		warnIfLargeExport("patients", 0);
		warnIfLargeExport("patients", 1);
		warnIfLargeExport("patients", EXPORT_ROW_WARNING_THRESHOLD);

		expect(warn).not.toHaveBeenCalled();
	});

	it("warns above the threshold with the label and the count", () => {
		const warn = jasmine.createSpy("warn");
		console.warn = warn;

		warnIfLargeExport("clock-ins", EXPORT_ROW_WARNING_THRESHOLD + 1);

		expect(warn).toHaveBeenCalledTimes(1);
		const message = String(warn.calls.mostRecent().args[0]);
		expect(message).toContain("clock-ins");
		expect(message).toContain(String(EXPORT_ROW_WARNING_THRESHOLD + 1));
	});

	it("ignores a non-finite row count instead of warning", () => {
		const warn = jasmine.createSpy("warn");
		console.warn = warn;

		warnIfLargeExport("nurses", Number.NaN);

		expect(warn).not.toHaveBeenCalled();
	});

	it("counts every statistics series, not just the first", () => {
		const rows = countStatisticsExportRows({
			patient_census: [1, 2],
			revenue_trends: [1, 2, 3],
			admission_discharge: [1],
			average_stay: [],
			top_services: [1, 2, 3, 4],
			top_drugs: [1],
			staff_utilization: [1, 2],
		});

		expect(rows).toBe(13);
	});
});
