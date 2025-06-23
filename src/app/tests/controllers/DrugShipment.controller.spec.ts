// src/app/tests/controllers/DrugShipment.controller.spec.ts
import { DrugShipmentController } from "../../controllers/DrugShipment.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("DrugShipmentController", () => {
	let drugShipmentController: DrugShipmentController;
	let insertedData: TestData;
	let mockRequest: any;
	let mockResponse: any;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugShipmentController = new DrugShipmentController();
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

	describe("getAllShipments", () => {
		it("should return all shipments", async () => {
			mockRequest = {};

			await drugShipmentController.getAllShipments(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe("getShipmentById", () => {
		it("should return shipment by valid ID", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugShipments[0].shipment_id.toString()
				}
			};

			await drugShipmentController.getShipmentById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.shipment_id).toBe(
				insertedData.drugShipments[0].shipment_id
			);
		});

		it("should return 404 for non-existent shipment", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await drugShipmentController.getShipmentById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("createShipment", () => {
		it("should create valid shipment", async () => {
			mockRequest = {
				body: {
					drug_id: insertedData.drugCards[0].drug_id,
					warehouse_id: insertedData.warehouses[0].warehouse_id,
					quantity: 5,
					buy_price: 100.0,
					prices: [
						{
							pricelist_id:
								insertedData.priceLists[0].pricelist_id,
							price: 100.0,
							requires_prepayment: true,
							prepayment_type: "fixed",
							prepayment_amount: 10
						}
					],
					expiry_date: "2025-12-31"
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugShipmentController.createShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.drug_id).toBe(mockRequest.body.drug_id);
		});

		it("should reject missing required fields", async () => {
			mockRequest = {
				body: {
					drug_id: 1
					// Missing other required fields
				},
				user: {
					userId: 1
				}
			};

			await drugShipmentController.createShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid numeric values", async () => {
			mockRequest = {
				body: {
					drug_id: insertedData.drugCards[0].drug_id,
					warehouse_id: insertedData.warehouses[0].warehouse_id,
					quantity: -1, // Invalid negative quantity
					buy_price: 100.0,
					prices: [
						{
							pricelist_id:
								insertedData.priceLists[0].pricelist_id,
							price: 100.0,
							requires_prepayment: true,
							prepayment_type: "fixed",
							prepayment_amount: 10
						}
					],
					expiry_date: "2025-12-31"
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugShipmentController.createShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid dates", async () => {
			mockRequest = {
				body: {
					drug_id: insertedData.drugCards[0].drug_id,
					warehouse_id: insertedData.warehouses[0].warehouse_id,
					quantity: 5,
					buy_price: 100.0,
					prices: [
						{
							pricelist_id:
								insertedData.priceLists[0].pricelist_id,
							price: 100.0,
							requires_prepayment: true,
							prepayment_type: "fixed",
							prepayment_amount: 10
						}
					],
					expiry_date: "2023-12-31" // Past date
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugShipmentController.createShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("updateShipment", () => {
		it("should update shipment with valid data", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugShipments[0].shipment_id.toString()
				},
				body: {
					quantity: 10,
					prices: [
						{
							pricelist_id:
								insertedData.priceLists[0].pricelist_id,
							price: 100.0,
							requires_prepayment: true,
							prepayment_type: "fixed",
							prepayment_amount: 10
						}
					]
				}
			};

			await drugShipmentController.updateShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.prices.price).toBe(mockRequest.body.prices.price);
		});

		it("should reject invalid numeric updates", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugShipments[0].shipment_id.toString()
				},
				body: {
					quantity: -1
				}
			};

			await drugShipmentController.updateShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid dates", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugShipments[0].shipment_id.toString()
				},
				body: {
					expiry_date: "invalid-date"
				}
			};

			await drugShipmentController.updateShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("deleteShipment", () => {
		it("should delete shipment with no transactions", async () => {
			// Create a new shipment without transactions
			await drugShipmentController.createShipment(
				{
					body: {
						drug_id: insertedData.drugCards[0].drug_id,
						warehouse_id: insertedData.warehouses[0].warehouse_id,
						quantity: 5,
						buy_price: 100.0,
						prices: [
							{
								pricelist_id:
									insertedData.priceLists[0].pricelist_id,
								price: 100.0,
								requires_prepayment: true,
								prepayment_type: "fixed",
								prepayment_amount: 10
							}
						],
						expiry_date: "2025-12-31"
					},
					user: {
						userId: insertedData.users[0].user_id
					}
				} as any,
				mockResponse
			);

			const newShipment = mockResponse.status().json.calls.mostRecent()
				.args[0];

			// Reset mock
			mockResponse.status.calls.reset();
			mockResponse.json.calls.reset();

			mockRequest = {
				params: {
					id: newShipment.shipment_id.toString()
				}
			};

			await drugShipmentController.deleteShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(204);
		});

		it("should reject deleting shipment with transactions", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugShipments[0].shipment_id.toString()
				}
			};

			await drugShipmentController.deleteShipment(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getShipmentsByDrug", () => {
		it("should return shipments for specific drug", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugCards[0].drug_id.toString()
				}
			};

			await drugShipmentController.getShipmentsByDrug(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(
				response.every(
					(s: any) => s.drug_id === insertedData.drugCards[0].drug_id
				)
			).toBeTrue();
		});
	});

	describe("getShipmentsByWarehouse", () => {
		it("should return shipments for specific warehouse", async () => {
			mockRequest = {
				params: {
					id:
						insertedData.warehouses[0].warehouse_id.toString()
				}
			};

			await drugShipmentController.getShipmentsByWarehouse(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(
				response.every(
					(s: any) =>
						s.warehouse_id ===
						insertedData.warehouses[0].warehouse_id
				)
			).toBeTrue();
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
