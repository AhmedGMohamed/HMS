// src/app/tests/controllers/DrugUsage.controller.spec.ts
import { DrugUsageController } from "../../controllers/DrugUsage.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("DrugUsageController", () => {
	let drugUsageController: DrugUsageController;
	let insertedData: TestData;
	let mockRequest: any;
	let mockResponse: any;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugUsageController = new DrugUsageController();
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

	describe("getAllDrugUsages", () => {
		it("should return all drug usages", async () => {
			mockRequest = {};

			await drugUsageController.getAllDrugUsages(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe("getDrugUsageById", () => {
		it("should return drug usage by valid ID", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugUsages[0].usage_id.toString()
				}
			};

			await drugUsageController.getDrugUsageById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.usage_id).toBe(insertedData.drugUsages[0].usage_id);
		});

		it("should return 404 for non-existent usage", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await drugUsageController.getDrugUsageById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("createDrugUsage", () => {
		it("should create valid drug usage", async () => {
			mockRequest = {
				body: {
					patient_id: insertedData.patients[0].patient_id,
					drug_id: insertedData.drugCards[0].drug_id,
					shipment_id: insertedData.drugShipments[0].shipment_id,
					quantity: 0.1,
					price: 100.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugUsageController.createDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.patient_id).toBe(mockRequest.body.patient_id);
			expect(response.drug_id).toBe(mockRequest.body.drug_id);
		});

		it("should reject invalid numeric values", async () => {
			mockRequest = {
				body: {
					patient_id: insertedData.patients[0].patient_id,
					drug_id: insertedData.drugCards[0].drug_id,
					shipment_id: insertedData.drugShipments[0].shipment_id,
					quantity: -1,
					price: 100.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugUsageController.createDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject missing required fields", async () => {
			mockRequest = {
				body: {
					patient_id: 1
					// Missing other required fields
				},
				user: {
					userId: 1
				}
			};

			await drugUsageController.createDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject missing shipment_id", async () => {
			mockRequest = {
				body: {
					patient_id: insertedData.patients[0].patient_id,
					drug_id: insertedData.drugCards[0].drug_id,
					// Missing shipment_id
					quantity: 1,
					price: 100.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugUsageController.createDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Missing or invalid required fields"
			});
		});

		it("should reject invalid shipment for drug", async () => {
			mockRequest = {
				body: {
					patient_id: insertedData.patients[0].patient_id,
					drug_id: insertedData.drugCards[0].drug_id,
					shipment_id: insertedData.drugShipments[1].shipment_id, // Shipment for different drug
					quantity: 1,
					price: 100.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugUsageController.createDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Invalid shipment for this drug"
			});
		});

		it("should reject insufficient quantity in specific shipment", async () => {
			mockRequest = {
				body: {
					patient_id: insertedData.patients[0].patient_id,
					drug_id: insertedData.drugCards[0].drug_id,
					shipment_id: insertedData.drugShipments[0].shipment_id,
					quantity: 99999, // More than available in this shipment
					price: 100.0
				},
				user: {
					userId: insertedData.users[0].user_id
				}
			};

			await drugUsageController.createDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Insufficient quantity in selected shipment"
			});
		});
	});

	describe("updateDrugUsage", () => {
		it("should update drug usage", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugUsages[0].usage_id.toString()
				},
				body: {
					remaining_quantity: 5,
					last_administered: new Date().toISOString()
				}
			};

			await drugUsageController.updateDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.remaining_quantity).toBe(
				mockRequest.body.remaining_quantity
			);
		});

		it("should reject negative remaining quantity", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugUsages[0].usage_id.toString()
				},
				body: {
					remaining_quantity: -1
				}
			};

			await drugUsageController.updateDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid administration date", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugUsages[0].usage_id.toString()
				},
				body: {
					last_administered: "invalid-date"
				}
			};

			await drugUsageController.updateDrugUsage(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getPendingAdministrations", () => {
		it("should return pending administrations", async () => {
			mockRequest = {};

			await drugUsageController.getPendingAdministrations(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
		});
	});

	describe("getDrugUsageHistory", () => {
		it("should return history with no filters", async () => {
			mockRequest = {
				query: {}
			};

			await drugUsageController.getDrugUsageHistory(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
		});

		it("should filter by patient ID", async () => {
			mockRequest = {
				query: {
					patientId: insertedData.patients[0].patient_id.toString()
				}
			};

			await drugUsageController.getDrugUsageHistory(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(
				response.every(
					(r: any) =>
						r.patient_id === insertedData.patients[0].patient_id
				)
			).toBeTrue();
		});

		it("should reject invalid IDs", async () => {
			mockRequest = {
				query: {
					patientId: "invalid"
				}
			};

			await drugUsageController.getDrugUsageHistory(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getAvailableShipments", () => {
		it("should return available shipments for valid drug ID", async () => {
			mockRequest = {
				params: {
					drugId: insertedData.drugCards[0].drug_id.toString()
				}
			};

			await drugUsageController.getAvailableShipments(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
			expect(response[0]).toEqual(
				jasmine.objectContaining({
					shipment_id: jasmine.any(Number),
					warehouse_name: jasmine.any(String),
					quantity: jasmine.any(Number),
					quantity_in_larger_unit: jasmine.any(Number)
				})
			);
		});

		it("should reject invalid drug ID", async () => {
			mockRequest = {
				params: {
					drugId: "invalid"
				}
			};

			await drugUsageController.getAvailableShipments(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Invalid drug ID"
			});
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
