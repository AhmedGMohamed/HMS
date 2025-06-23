import { DrugCardController } from "../../controllers/DrugCard.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";
import { UnitConversion } from "../../utils/types/drugs.js";

describe("DrugCardController", () => {
	let drugCardController: DrugCardController;
	let insertedData: TestData;
	let mockRequest: any;
	let mockResponse: any;

	const validUnitConversion: UnitConversion = {
		larger: "box",
		smaller: "tablet",
		ratio: 100
	};

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugCardController = new DrugCardController();
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

	describe("getAllDrugCards", () => {
		it("should return all drug cards", async () => {
			mockRequest = {};

			await drugCardController.getAllDrugCards(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe("getDrugCardById", () => {
		it("should return drug card by valid ID", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugCards[0].drug_id.toString()
				}
			};

			await drugCardController.getDrugCardById(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.drug_id).toBe(insertedData.drugCards[0].drug_id);
		});

		it("should return 404 for non-existent drug", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await drugCardController.getDrugCardById(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Drug not found"
			});
		});
	});

	describe("createDrugCard", () => {
		it("should create valid drug card", async () => {
			mockRequest = {
				body: {
					name: "Test Drug",
					manufacturer: "Test Manufacturer",
					provider: "Test Provider",
					is_obligatory_continuous: true,
					sale_quantity: 100,
					frequency: "12 hours",
					min_stock_alert: 50,
					max_days_expiry_alert: 90,
					unit_conversion: validUnitConversion
				},
				user: {
					userId: insertedData.users.find(
						(user) => user.username === "admin"
					)!.user_id
				}
			};

			await drugCardController.createDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.name).toBe(mockRequest.body.name);
		});

		it("should reject missing required fields", async () => {
			mockRequest = {
				body: {
					name: "Test Drug"
					// Missing required fields
				},
				user: {
					userId: insertedData.users.find(
						(user) => user.username === "admin"
					)!.user_id
				}
			};

			await drugCardController.createDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid unit conversion", async () => {
			mockRequest = {
				body: {
					name: "Test Drug",
					sale_quantity: 100,
					unit_conversion: {
						larger: "box",
						smaller: "tablet",
						ratio: -1 // Invalid ratio
					}
				},
				user: {
					userId: insertedData.users.find(
						(user) => user.username === "admin"
					)!.user_id
				}
			};

			await drugCardController.createDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Invalid unit conversion format"
			});
		});

		it("should reject invalid numeric values", async () => {
			mockRequest = {
				body: {
					name: "Test Drug",
					sale_quantity: -1, // Invalid negative value
					unit_conversion: validUnitConversion
				},
				user: {
					userId: insertedData.users.find(
						(user) => user.username === "admin"
					)!.user_id
				}
			};

			await drugCardController.createDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Sale quantity must be greater than 0"
			});
		});
	});

	describe("updateDrugCard", () => {
		it("should update drug card with valid data", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugCards[0].drug_id.toString()
				},
				body: {
					name: "Updated Drug",
					manufacturer: "Updated Manufacturer"
				}
			};

			await drugCardController.updateDrugCard(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.name).toBe("Updated Drug");
		});

		it("should reject invalid numeric updates", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugCards[0].drug_id.toString()
				},
				body: {
					sale_quantity: -1
				}
			};

			await drugCardController.updateDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});

		it("should reject invalid unit conversion update", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugCards[0].drug_id.toString()
				},
				body: {
					unit_conversion: {
						larger: "",
						smaller: "",
						ratio: 0
					}
				}
			};

			await drugCardController.updateDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("deleteDrugCard", () => {
		it("should delete drug card", async () => {
			// Create a new drug without dependencies
			await drugCardController.createDrugCard(
				{
					body: {
						name: "To Delete Drug",
						is_obligatory_continuous: false,
						sale_quantity: 50,
						unit_conversion: validUnitConversion
					},
					user: {
						userId: insertedData.users.find(
							(user) => user.username === "admin"
						)!.user_id
					}
				} as any,
				mockResponse
			);
			const newDrug = mockResponse.status().json.calls.mostRecent().args[0];

			// Reset mock
			mockResponse.status.calls.reset();
			mockResponse.json.calls.reset();

			mockRequest = {
				params: {
					id: newDrug.drug_id.toString()
				}
			};

			await drugCardController.deleteDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(204);
		});

		it("should handle deletion constraints", async () => {
			mockRequest = {
				params: {
					id: insertedData.drugCards[0].drug_id.toString()
				}
			};

			await drugCardController.deleteDrugCard(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("searchDrugs", () => {
		it("should return search results", async () => {
			mockRequest = {
				query: {
					q: "Para"
				}
			};

			await drugCardController.searchDrugs(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
		});

		it("should reject empty search term", async () => {
			mockRequest = {
				query: {
					q: ""
				}
			};

			await drugCardController.searchDrugs(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getDrugSuggestions", () => {
		it("should return suggestions", async () => {
			mockRequest = {
				query: {
					prefix: "Par"
				}
			};

			await drugCardController.getDrugSuggestions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
		});

		it("should reject empty prefix", async () => {
			mockRequest = {
				query: {
					prefix: ""
				}
			};

			await drugCardController.getDrugSuggestions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getLowStockDrugs", () => {
		it("should return low stock drugs", async () => {
			mockRequest = {};

			await drugCardController.getLowStockDrugs(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
		});
	});

	describe("getNearExpiryDrugs", () => {
		it("should return near expiry drugs", async () => {
			mockRequest = {};

			await drugCardController.getNearExpiryDrugs(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
