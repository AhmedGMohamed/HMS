// src/app/tests/models/DrugTransaction.model.spec.ts
import DrugShipmentModel from "../../models/DrugShipment.model.js";
import { DrugTransactionModel } from "../../models/DrugTransaction.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("DrugTransactionModel", () => {
	let drugTransactionModel: DrugTransactionModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugTransactionModel = new DrugTransactionModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllTransactions", () => {
		it("should return all transactions with details", async () => {
			const result = await drugTransactionModel.getAllTransactions();

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toEqual(
				jasmine.objectContaining({
					transaction_id: jasmine.any(Number),
					drug_name: jasmine.any(String),
					warehouse_name: jasmine.any(String),
					unit_conversion: jasmine.any(Object),
					profit: jasmine.any(String)
				})
			);
		});

		it("should calculate profit correctly", async () => {
			const result = await drugTransactionModel.getAllTransactions();

			result.forEach((transaction) => {
				const expectedProfit =
					parseInt(transaction.price as string) *
						transaction.quantity -
					transaction.shipment_buy_price * transaction.quantity;
				expect(transaction.profit).toBe(expectedProfit.toFixed(2));
			});
		});

		it("should order by timestamp descending", async () => {
			const result = await drugTransactionModel.getAllTransactions();

			for (let i = 1; i < result.length; i++) {
				expect(
					new Date(result[i - 1].timestamp).getTime()
				).toBeGreaterThanOrEqual(
					new Date(result[i].timestamp).getTime()
				);
			}
		});
	});

	describe("getTransactionById", () => {
		it("should return transaction with full details", async () => {
			const result = await drugTransactionModel.getTransactionById(
				insertedData.drugTransactions[0].transaction_id
			);

			expect(result).not.toBeNull();
			expect(result?.drug_name).toBeDefined();
			expect(result?.warehouse_name).toBeDefined();
			expect(result?.unit_conversion).toBeDefined();
			expect(result?.profit).toBeDefined();
		});

		it("should return null for non-existent transaction", async () => {
			const result = await drugTransactionModel.getTransactionById(999);
			expect(result).toBeNull();
		});

		it("should calculate profit correctly for single transaction", async () => {
			const result = await drugTransactionModel.getTransactionById(
				insertedData.drugTransactions[0].transaction_id
			);

			const expectedProfit =
				(result!.price as number) * result!.quantity -
				result!.shipment_buy_price * result!.quantity;
			expect(result!.profit).toBe(expectedProfit.toFixed(2));
		});
	});

	describe("createTransaction", () => {
		it("should create transaction and update shipment quantity", async () => {
			const shipment = insertedData.drugShipments[0];
			const initialQuantity = shipment.quantity;

			const transactionData = {
				shipment_id: shipment.shipment_id,
				transaction_type: "outside" as const,
				quantity: 1,
				price: 150.0
			};

			const result = await drugTransactionModel.createTransaction(
				transactionData,
				insertedData.users[0].user_id
			);

			// Verify transaction created
			expect(result.shipment_id).toBe(transactionData.shipment_id);
			expect(result.transaction_type).toBe(
				transactionData.transaction_type
			);
			expect(result.quantity).toBe(
				transactionData.quantity *
					insertedData.drugCards[0].unit_conversion.ratio
			);

			// Verify shipment quantity updated
			const updatedShipment = (await DrugShipmentModel.getShipmentById(
				shipment.shipment_id
			))!;
			expect(updatedShipment.quantity).toBe(
				initialQuantity -
					transactionData.quantity *
						insertedData.drugCards[0].unit_conversion.ratio
			);
		});

		it("should reject transaction with insufficient quantity", async () => {
			const shipment = insertedData.drugShipments[0];
			const tooLargeQuantity = shipment.quantity + 1;

			const transactionData = {
				shipment_id: shipment.shipment_id,
				transaction_type: "outside" as const,
				quantity: tooLargeQuantity,
				price: 150.0
			};

			await expectAsync(
				drugTransactionModel.createTransaction(
					transactionData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Insufficient quantity in shipment");
		});

		it("should reject transaction for non-existent shipment", async () => {
			const transactionData = {
				shipment_id: 999,
				transaction_type: "outside" as const,
				quantity: 1,
				price: 150.0
			};

			await expectAsync(
				drugTransactionModel.createTransaction(
					transactionData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Shipment not found");
		});
	});

	describe("getTransactionsByFilters", () => {
		it("should filter by date range", async () => {
			const startDate = "2024-01-01";
			const endDate = "2024-12-31";
			const filters = { startDate, endDate };

			const result = await drugTransactionModel.getTransactionsByFilters(
				filters
			);

			result.forEach((transaction) => {
				const transactionDate = new Date(transaction.timestamp);
				expect(transactionDate.getTime()).toBeGreaterThanOrEqual(
					new Date(startDate).getTime()
				);
				expect(transactionDate.getTime()).toBeLessThanOrEqual(
					new Date(endDate).getTime()
				);
			});
		});

		it("should filter by transaction type", async () => {
			const filters = { transactionType: "outside" as const };

			const result = await drugTransactionModel.getTransactionsByFilters(
				filters
			);

			expect(
				result.every((t) => t.transaction_type === "outside")
			).toBeTrue();
		});

		it("should filter by drug", async () => {
			const filters = { drugId: insertedData.drugCards[0].drug_id };

			const result = await drugTransactionModel.getTransactionsByFilters(
				filters
			);

			expect(
				result.every((t) => t.drug_id === filters.drugId)
			).toBeTrue();
		});

		it("should filter by warehouse", async () => {
			const filters = {
				warehouseId: insertedData.warehouses[0].warehouse_id
			};

			const result = await drugTransactionModel.getTransactionsByFilters(
				filters
			);

			expect(
				result.every((t) => t.warehouse_id === filters.warehouseId)
			).toBeTrue();
		});

		it("should handle multiple filters", async () => {
			const filters = {
				transactionType: "outside" as const,
				drugId: insertedData.drugCards[0].drug_id,
				warehouseId: insertedData.warehouses[0].warehouse_id
			};

			const result = await drugTransactionModel.getTransactionsByFilters(
				filters
			);

			result.forEach((transaction) => {
				expect(transaction.transaction_type).toBe(
					filters.transactionType
				);
				expect(transaction.drug_id).toBe(filters.drugId);
				expect(transaction.warehouse_id).toBe(filters.warehouseId);
			});
		});
	});

	describe("getTransactionSummary", () => {
		it("should calculate correct totals for all transactions", async () => {
			const result = await drugTransactionModel.getTransactionSummary({});

			expect(result.total_quantity).toBeGreaterThanOrEqual(0);
			expect(result.total_sales).toBeGreaterThanOrEqual(0);
			expect(result.total_cost).toBeGreaterThanOrEqual(0);
			expect(result.total_profit).toBe(
				result.total_sales - result.total_cost
			);
			expect(result.transaction_count).toBeGreaterThan(0);
		});

		it("should calculate summary for filtered transactions", async () => {
			const filters = {
				transactionType: "outside" as const,
				drugId: insertedData.drugCards[0].drug_id
			};

			const result = await drugTransactionModel.getTransactionSummary(
				filters
			);
			const transactions =
				await drugTransactionModel.getTransactionsByFilters(filters);

			expect(result.transaction_count).toBe(transactions.length);
			expect(result.total_quantity).toBe(
				transactions.reduce((sum, t) => sum + t.quantity, 0)
			);
			expect(result.total_sales).toBe(
				transactions.reduce(
					(sum, t) => sum + parseInt(t.price as string) * t.quantity,
					0
				)
			);
		});

		it("should return zero values when no transactions match filters", async () => {
			const filters = {
				startDate: "2030-01-01",
				endDate: "2030-12-31"
			};

			const result = await drugTransactionModel.getTransactionSummary(
				filters
			);

			expect(result.total_quantity).toBe(0);
			expect(result.total_sales).toBe(0);
			expect(result.total_cost).toBe(0);
			expect(result.total_profit).toBe(0);
			expect(result.transaction_count).toBe(0);
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
