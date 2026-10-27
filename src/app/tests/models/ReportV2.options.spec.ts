// src/app/tests/models/ReportV2.options.spec.ts
//
// Phase 6.11.0 — foundations. Covers the `/api/reports/v2/options` data
// source and the `Bill.model.recalculateTotal` refactor onto the shared
// `calculateBillFinancials` helper (a parity check against fixed, seeded
// bills).

import OptionsReportModel from "../../models/reports/OptionsReport.model.js";
import billModel from "../../models/Bill.model.js";
import { calculateBillFinancials } from "../../utils/billFinancials.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

type DetailRow = Record<string, unknown>;

/** Sums `BillDetail` lines of one category off a `getBillById` payload. */
function detailSum(
	details: DetailRow[],
	key: "service_id" | "drug_shipment_id" | "medical_supply_shipment_id"
): number {
	return (details || [])
		.filter((detail) => detail[key] !== null && detail[key] !== undefined)
		.reduce(
			(sum, detail) => sum + Number(detail.quantity) * Number(detail.unit_price),
			0
		);
}

describe("Reports v2 — foundations", () => {
	let insertedData: TestData;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	/* -------------------------------------------------------------- */
	/* Options                                                         */
	/* -------------------------------------------------------------- */

	describe("OptionsReportModel.getOptions", () => {
		it("returns every picker list with numeric ids and sorted names", async () => {
			const options = await OptionsReportModel.getOptions(true);

			expect(options.insurance_companies.length).toBe(2);
			expect(options.insurance_companies.map((o) => o.name)).toEqual([
				"HealthFirst",
				"MediCare Insurance",
			]);

			expect(options.doctors.length).toBe(2);
			options.doctors.forEach((doctor) => {
				expect(typeof doctor.id).toBe("number");
				expect(typeof doctor.name).toBe("string");
				expect(typeof doctor.doctor_type).toBe("string");
				expect(typeof doctor.is_active).toBe("boolean");
			});

			expect(options.nurses.length).toBe(2);
			expect(options.nurses.map((o) => o.name)).toEqual([
				"Nurse James Wilson",
				"Nurse Mary Brown",
			]);

			expect(options.payroll_employees.length).toBe(5);
			expect(options.clock_in_employees.length).toBe(2);
		});

		it("omits the payroll list when includePayroll is false", async () => {
			const options = await OptionsReportModel.getOptions(false);

			expect(options.payroll_employees).toEqual([]);
			// Everything else is unaffected.
			expect(options.nurses.length).toBe(2);
			expect(options.doctors.length).toBe(2);
			expect(options.clock_in_employees.length).toBe(2);
		});

		it("lists exactly the seeded active nurses as nurse options", async () => {
			const options = await OptionsReportModel.getOptions(false);
			const expected = insertedData.employees
				.filter(
					(employee) => employee.employee_type === "nurse" && employee.is_active
				)
				.map((employee) => employee.employee_id)
				.sort((a, b) => a - b);

			expect(options.nurses.map((o) => o.id).sort((a, b) => a - b)).toEqual(expected);
		});

		it("lists exactly the employees that need to clock in as clock-in options", async () => {
			const options = await OptionsReportModel.getOptions(false);
			const expected = insertedData.employees
				.filter((employee) => employee.need_clock_in && employee.is_active)
				.map((employee) => employee.employee_id)
				.sort((a, b) => a - b);

			expect(
				options.clock_in_employees.map((o) => o.id).sort((a, b) => a - b)
			).toEqual(expected);
		});

		it("orders every list by name", async () => {
			const options = await OptionsReportModel.getOptions(true);
			for (const list of [
				options.insurance_companies,
				options.doctors,
				options.nurses,
				options.payroll_employees,
				options.clock_in_employees,
			]) {
				const names = list.map((option) => option.name);
				expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
			}
		});
	});

	/* -------------------------------------------------------------- */
	/* Bill math parity                                                */
	/* -------------------------------------------------------------- */

	describe("BillModel.recalculateTotal (shared helper parity)", () => {
		it("recomputes the seeded percentage-discount bill to the expected total", async () => {
			const bill = insertedData.bills[0];
			await billModel.recalculateTotal(bill.bill_id);

			const updated = await billModel.getBillById(bill.bill_id);
			// services 1000 + drugs 10 + tests 120 = 1130
			// 10% discount on everything = 113 -> 1017
			// VAT 5% on (1017 + 50 admin) = 53.35
			// total = 1017 + 53.35 + 50 = 1120.35
			expect(Number(updated!.total_amount)).toBeCloseTo(1120.35, 2);
		});

		it("recomputes the seeded fixed-discount bill to the expected total", async () => {
			const bill = insertedData.bills[1];
			await billModel.recalculateTotal(bill.bill_id);

			const updated = await billModel.getBillById(bill.bill_id);
			// services 100, fixed discount 100 -> 0
			// VAT 5% on (0 + 25 admin) = 1.25
			// total = 1.25 + 25 = 26.25
			expect(Number(updated!.total_amount)).toBeCloseTo(26.25, 2);
		});

		it("stores exactly what calculateBillFinancials computes from the same inputs", async () => {
			const bill = insertedData.bills[0];
			const before = await billModel.getBillById(bill.bill_id);
			// `getBillById` returns `b.*` plus a `bill_details` JSON aggregate;
			// the declared `Bill` type predates those scope columns.
			const beforeRow = before as unknown as Record<string, unknown> & {
				bill_details?: DetailRow[];
			};
			const details = beforeRow.bill_details ?? [];

			const expected = calculateBillFinancials({
				services: detailSum(details, "service_id"),
				drugs: detailSum(details, "drug_shipment_id"),
				supplies: detailSum(details, "medical_supply_shipment_id"),
				tests: Number(beforeRow.medical_tests_amount),
				discount: Number(beforeRow.discount),
				discountType: beforeRow.discount_type as "fixed" | "percentage" | null,
				discountScope: beforeRow.discount_scope as string[] | null,
				vatPercentage: Number(beforeRow.vat_percentage),
				vatScope: beforeRow.vat_scope_custom as string[] | null,
				administrativeExpenses: Number(beforeRow.administrative_expenses),
			});

			await billModel.recalculateTotal(bill.bill_id);
			const after = await billModel.getBillById(bill.bill_id);

			expect(Number(after!.total_amount)).toBeCloseTo(
				Math.round(expected.finalTotal * 100) / 100,
				2
			);
		});

		it("respects a scoped discount on the real Bill row", async () => {
			const bill = insertedData.bills[0];
			await billModel.updateBill(bill.bill_id, {
				discount_scope: ["services"],
			} as unknown as Parameters<typeof billModel.updateBill>[1]);

			const updated = await billModel.getBillById(bill.bill_id);
			// 10% of the 1000 services only = 100 -> afterDiscount 1030
			// VAT scope is still all: base 1130, overlap 1000,
			// vattableDiscount = (1000/1000)*100 = 100 -> 1030
			// VAT 5% on (1030 + 50) = 54
			// total = 1030 + 54 + 50 = 1134
			expect(Number(updated!.total_amount)).toBeCloseTo(1134, 2);
		});
	});
});
