import { DrugTransactionController } from "../../controllers/DrugTransaction.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("DrugTransactionController", () => {
	let drugTransactionController: DrugTransactionController;
	let insertedData: TestData;
	let mockRequest: any;
	let mockResponse: any;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugTransactionController = new DrugTransactionController();
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

	describe("getAllTransactions", () => {
		it("should return all transactions", async () => {
			mockRequest = {};

			await drugTransactionController.getAllTransactions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe("getTransactionById", () => {
		it("should return transaction by valid ID", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugTransactions[0].transaction_id.toString()
				}
			};

			await drugTransactionController.getTransactionById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.transaction_id).toBe(
				insertedData.drugTransactions[0].transaction_id
			);
		});

		it("should return 404 for non-existent transaction", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await drugTransactionController.getTransactionById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("createTransaction", () => {
		it("should create valid transaction", async () => {
			mockRequest = {
				body: {
					shipment_id: insertedData.drugShipments[0].shipment_id,
					transaction_type: "outside",
					quantity: 1,
					price: 150.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugTransactionController.createTransaction(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.shipment_id).toBe(mockRequest.body.shipment_id);
		});

		it("should reject missing required fields", async () => {
			mockRequest = {
				body: {
					shipment_id: 1
					// Missing other required fields
				},
				user: {
					userId: 1
				}
			};

			await drugTransactionController.createTransaction(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid numeric values", async () => {
			mockRequest = {
				body: {
					shipment_id: insertedData.drugShipments[0].shipment_id,
					transaction_type: "outside",
					quantity: -1, // Invalid negative quantity
					price: 150.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugTransactionController.createTransaction(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid transaction type", async () => {
			mockRequest = {
				body: {
					shipment_id: insertedData.drugShipments[0].shipment_id,
					transaction_type: "invalid",
					quantity: 1,
					price: 150.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugTransactionController.createTransaction(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getFilteredTransactions", () => {
		it("should return filtered transactions", async () => {
			mockRequest = {
				query: {
					transactionType: "outside"
				}
			};

			await drugTransactionController.getFilteredTransactions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(
				response.every((t: any) => t.transaction_type === "outside")
			).toBeTrue();
		});

		it("should reject invalid date filters", async () => {
			mockRequest = {
				query: {
					startDate: "invalid-date"
				}
			};

			await drugTransactionController.getFilteredTransactions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid date range", async () => {
			mockRequest = {
				query: {
					startDate: "2024-12-31",
					endDate: "2024-01-01" // End before start
				}
			};

			await drugTransactionController.getFilteredTransactions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getTransactionSummary", () => {
		it("should return summary for all transactions", async () => {
			mockRequest = {
				query: {}
			};

			await drugTransactionController.getTransactionSummary(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.total_quantity).toBeDefined();
			expect(response.total_sales).toBeDefined();
			expect(response.total_profit).toBeDefined();
			expect(response.transaction_count).toBeDefined();
		});

		it("should return summary for filtered transactions", async () => {
			mockRequest = {
				query: {
					drugId: insertedData.drugCards[0].drug_id.toString(),
					transactionType: "outside"
				}
			};

			await drugTransactionController.getTransactionSummary(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.transaction_count).toBeGreaterThanOrEqual(0);
		});

		it("should reject invalid filters", async () => {
			mockRequest = {
				query: {
					startDate: "invalid-date"
				}
			};

			await drugTransactionController.getTransactionSummary(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
