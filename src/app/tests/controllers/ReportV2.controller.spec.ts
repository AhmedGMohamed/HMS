// src/app/tests/controllers/ReportV2.controller.spec.ts
//
// Phase 6.11.0 — foundations. Verifies the `/api/reports/v2/options`
// controller: response envelope, permission-driven payroll filtering, admin
// bypass, and the 500 path.

import type { Request, Response } from "express";

import ReportV2Controller, {
	userHasAllPermissions,
	userHasPermission,
} from "../../controllers/ReportV2.controller.js";
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

describe("ReportV2Controller — options", () => {
	let insertedData: TestData;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	it("returns every picker list for a view_reports user", async () => {
		const res = makeResponse();
		await ReportV2Controller.getOptions(
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
		await ReportV2Controller.getOptions(
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
		await ReportV2Controller.getOptions(
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
		await ReportV2Controller.getOptions(
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

		await ReportV2Controller.getOptions(
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

describe("ReportV2Controller — permission helpers", () => {
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
