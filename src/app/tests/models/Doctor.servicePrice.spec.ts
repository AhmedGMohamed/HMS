import DoctorModel from "../../models/Doctor.model.js";
import pool from "../../models/database/connection.js";

/**
 * Phase 6.7 — doctor service-price override storage.
 *
 * Covers the upsert (`setDoctorServicePrice`) and the removal path
 * (`deleteDoctorServicePrice`) that backs the UI's `price: null`
 * entries in `servicePrices[]` (see `phase_6.7_backend_plan.md`).
 * The pool is mocked — no database required (same pattern as
 * `Employee.Model.spec.ts`).
 */
describe("DoctorModel — service price overrides", () => {
	let mockPoolQuery: jasmine.Spy;

	beforeEach(() => {
		const emptyResult = { rows: [] } as unknown as Awaited<
			ReturnType<typeof pool.query>
		>;
		mockPoolQuery = spyOn(pool, "query") as jasmine.Spy<
			(...args: unknown[]) => Promise<unknown>
		>;
		mockPoolQuery.and.returnValue(Promise.resolve(emptyResult));
	});

	afterEach(() => {
		mockPoolQuery.calls.reset();
	});

	it("should upsert a service price override", async () => {
		await DoctorModel.setDoctorServicePrice(7, 3, 250.5);
		expect(mockPoolQuery).toHaveBeenCalledWith(
			jasmine.stringContaining("INSERT INTO DoctorServicePrice"),
			[7, 3, 250.5]
		);
	});

	it("should upsert with ON CONFLICT semantics (update existing override)", async () => {
		await DoctorModel.setDoctorServicePrice(7, 3, 100);
		const sql = mockPoolQuery.calls.mostRecent().args[0] as string;
		expect(sql).toContain("ON CONFLICT (doctor_id, service_id)");
		expect(sql).toContain("DO UPDATE SET");
	});

	it("should delete a service price override", async () => {
		await DoctorModel.deleteDoctorServicePrice(7, 3);
		expect(mockPoolQuery).toHaveBeenCalledWith(
			jasmine.stringContaining("DELETE FROM DoctorServicePrice"),
			[7, 3]
		);
	});
});
