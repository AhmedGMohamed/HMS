// src/app/tests/models/Vault.model.spec.ts
import vaultModel from "../../models/Vault.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("VaultModel (new report endpoints)", () => {
	let insertedData: TestData;

	// Seeds use CURRENT_TIMESTAMP/CURRENT_DATE defaults (overridePgDate keeps
	// them wall-clock), so a same-day range exercises every endpoint boundary.
	const TODAY = new Date().toISOString().slice(0, 10);
	const wideRange = { startDate: "2024-01-01", endDate: "2030-12-31" };
	const todayRange = { startDate: TODAY, endDate: TODAY };
	const emptyRange = { startDate: "2020-01-01", endDate: "2020-01-01" };

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getPatientMedicalTestsRevenue", () => {
		it("should return bills with positive medical tests amount in expected shape", async () => {
			const rows = await vaultModel.getPatientMedicalTestsRevenue(
				wideRange.startDate,
				wideRange.endDate
			);

			// Seed: bill[0] has medical_tests_amount=120, bill[1] has 0
			expect(rows.length).toBe(1);
			expect(rows[0]).toEqual(
				jasmine.objectContaining({
					patient_name: insertedData.patients[0].name,
					bill_id: insertedData.bills[0].bill_id,
					generated_at: jasmine.any(Date),
					medical_tests_amount: "120.00"
				})
			);
		});

		it("should be inclusive of rows on the end date (+1 day interval)", async () => {
			const rows = await vaultModel.getPatientMedicalTestsRevenue(
				todayRange.startDate,
				todayRange.endDate
			);

			expect(rows.length).toBe(1);
		});

		it("should return empty rows outside the date range", async () => {
			const rows = await vaultModel.getPatientMedicalTestsRevenue(
				emptyRange.startDate,
				emptyRange.endDate
			);

			expect(rows).toEqual([]);
		});
	});

	describe("getSupplyShipmentCosts", () => {
		it("should return supply shipments with computed total_cost", async () => {
			const rows = await vaultModel.getSupplyShipmentCosts(
				wideRange.startDate,
				wideRange.endDate
			);

			expect(rows.length).toBe(2);
			const first = rows[0];
			expect(first).toEqual(
				jasmine.objectContaining({
					supply_name: jasmine.any(String),
					manufacturer: jasmine.any(String),
					warehouse_name: jasmine.any(String)
				})
			);
			rows.forEach((row) => {
				expect(parseFloat(row.total_cost)).toBe(
					row.buy_quantity * row.buy_price
				);
			});
		});

		it("should not mix in drug shipments", async () => {
			const rows = await vaultModel.getSupplyShipmentCosts(
				wideRange.startDate,
				wideRange.endDate
			);

			expect(
				rows.every(
					(row) =>
						!insertedData.drugShipments.some(
							(ds) => ds.shipment_id === row.shipment_id
						)
				)
			).toBeTrue();
		});

		it("should be inclusive on bare DATE boundaries (received_date)", async () => {
			const rows = await vaultModel.getSupplyShipmentCosts(
				todayRange.startDate,
				todayRange.endDate
			);

			// received_date defaults to CURRENT_DATE → both seed rows included
			expect(rows.length).toBe(2);
		});
	});

	describe("getSupplySalesRevenue", () => {
		it("should exclude 'patient' transactions and map sale_type", async () => {
			const rows = await vaultModel.getSupplySalesRevenue(
				wideRange.startDate,
				wideRange.endDate
			);

			// Seed: (outside, 50@4.0), (check, 10@9.0); 'patient' excluded
			expect(rows.length).toBe(2);
			expect(
				rows.every(
					(row) =>
						row.transaction_type === "outside" ||
						row.transaction_type === "check"
				)
			).toBeTrue();

			const outside = rows.find(
				(row) => row.transaction_type === "outside"
			)!;
			const check = rows.find(
				(row) => row.transaction_type === "check"
			)!;
			expect(outside.sale_type).toBe("Outside Sale");
			expect(check.sale_type).toBe("Medical Check");
			expect(parseFloat(outside.total_revenue)).toBe(
				outside.quantity * outside.price
			);
		});

		it("should be inclusive of rows on the end date (+1 day interval)", async () => {
			const rows = await vaultModel.getSupplySalesRevenue(
				todayRange.startDate,
				todayRange.endDate
			);

			expect(rows.length).toBe(2);
		});

		it("should be ordered by timestamp descending", async () => {
			const rows = await vaultModel.getSupplySalesRevenue(
				wideRange.startDate,
				wideRange.endDate
			);

			for (let i = 1; i < rows.length; i++) {
				expect(
					new Date(rows[i - 1].timestamp).getTime()
				).toBeGreaterThanOrEqual(
					new Date(rows[i].timestamp).getTime()
				);
			}
		});
	});

	describe("getSupplySalesProfit", () => {
		it("should aggregate per supply with correct totals", async () => {
			const rows = await vaultModel.getSupplySalesProfit(
				wideRange.startDate,
				wideRange.endDate
			);

			// Only the syringe supply has out-of-patient transactions:
			// 50 @ 4.0 (outside shipment 2) + 10 @ 9.0 (check shipment 1)
			expect(rows.length).toBe(1);
			const profit = rows[0];
			expect(profit.supply_id).toBe(
				insertedData.medicalSupplies[0].supply_id
			);
			expect(profit.total_quantity_sold).toBe("60");
			expect(profit.total_revenue).toBe("290.00"); // 50*4 + 10*9
			expect(profit.total_cost).toBe("120.00"); // 60 * 2.0 buy_price
			expect(profit.total_profit).toBe("170.00");
			expect(profit.transaction_count).toBe("2");
		});

		it("should exclude 'patient' transactions from the aggregation", async () => {
			const rows = await vaultModel.getSupplySalesProfit(
				wideRange.startDate,
				wideRange.endDate
			);

			// 'patient' 10@8.0 excluded → qty stays 60, not 70
			expect(rows[0].total_quantity_sold).toBe("60");
		});
	});
});
