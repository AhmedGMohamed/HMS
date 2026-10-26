// src/app/tests/controllers/Vault.controller.spec.ts
import { VaultController } from "../../controllers/Vault.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("VaultController (new report endpoints)", () => {
	let vaultController: VaultController;	let insertedData: TestData;
	let mockRequest: any;
	let mockResponse: any;

	const wideParams = {
		start_date: "2024-01-01",
		end_date: "2030-12-31"
	};

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		vaultController = new VaultController();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();

		mockResponse = {
			status: jasmine.createSpy("status").and.returnValue({
				json: jasmine.createSpy("json"),
				send: jasmine.createSpy("send")
			}),
			json: jasmine.createSpy("json")
		};
	});

	function expectMissingDatesRejected(handler: string) {
		it("should reject when start/end dates are missing", async () => {
			mockRequest = { query: {} };

			await (vaultController as any)[handler](mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Start date and end date are required"
			});
		});
	}

	function expectSuccessfulFetch(
		handler: string,
		expectedLength: number,
		requiredKeys: string[]
	) {
		it("should fetch report rows for a valid date range", async () => {
			mockRequest = { query: { ...wideParams } };

			await (vaultController as any)[handler](mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(200);
			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBe(expectedLength);
			requiredKeys.forEach((key) => {
				expect(Object.keys(response[0])).toContain(key);
			});
		});

		it("should return an empty array for a range without data", async () => {
			mockRequest = {
				query: { start_date: "2020-01-01", end_date: "2020-01-01" }
			};

			await (vaultController as any)[handler](mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(200);
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response).toEqual([]);
		});
	}

	describe("getSupplyShipmentCosts", () => {
		expectMissingDatesRejected("getSupplyShipmentCosts");
		expectSuccessfulFetch("getSupplyShipmentCosts", 2, [
			"shipment_id",
			"supply_id",
			"supply_name",
			"manufacturer",
			"total_cost",
			"received_date",
			"warehouse_name"
		]);
	});

	describe("getSupplySalesRevenue", () => {
		expectMissingDatesRejected("getSupplySalesRevenue");
		expectSuccessfulFetch("getSupplySalesRevenue", 2, [
			"transaction_id",
			"transaction_type",
			"supply_id",
			"supply_name",
			"total_revenue",
			"timestamp",
			"sale_type"
		]);
	});

	describe("getSupplySalesProfit", () => {
		expectMissingDatesRejected("getSupplySalesProfit");
		expectSuccessfulFetch("getSupplySalesProfit", 1, [
			"supply_id",
			"supply_name",
			"manufacturer",
			"total_quantity_sold",
			"total_revenue",
			"total_cost",
			"total_profit",
			"transaction_count"
		]);
	});

	describe("getPatientMedicalTestsRevenue", () => {
		expectMissingDatesRejected("getPatientMedicalTestsRevenue");
		expectSuccessfulFetch("getPatientMedicalTestsRevenue", 1, [
			"patient_name",
			"bill_id",
			"generated_at",
			"medical_tests_amount"
		]);
	});
});
