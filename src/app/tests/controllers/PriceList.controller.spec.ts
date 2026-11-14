// src/app/tests/controllers/PriceList.controller.spec.ts
import { PriceListController } from "../../controllers/PriceList.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("PriceListController", () => {
	let priceListController: PriceListController;
	let mockRequest: any;
	let mockResponse: any;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		priceListController = new PriceListController();
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

	describe("getAllPriceLists", () => {
		it("should return the first page in the shared envelope", async () => {
			mockRequest = {};

			await priceListController.getAllPriceLists(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeFalse();
			expect(Array.isArray(response.data)).toBeTrue();
			expect(response.data.length).toBeGreaterThan(0);
			expect(response.total).toBeGreaterThan(0);
			expect(response.page).toBe(1);
			expect(response.pageSize).toBe(10);
		});

		it("should honour page and pageSize", async () => {
			mockRequest = { query: { page: "2", pageSize: "2" } };

			await priceListController.getAllPriceLists(
				mockRequest,
				mockResponse
			);

			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.page).toBe(2);
			expect(response.pageSize).toBe(2);
			expect(response.data.length).toBe(1);
			expect(response.total).toBe(3);
		});

		it("should return the whole list with all=true", async () => {
			mockRequest = { query: { all: "true" } };

			await priceListController.getAllPriceLists(
				mockRequest,
				mockResponse
			);

			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.data.length).toBe(response.total);
			expect(response.page).toBe(1);
			expect(response.pageSize).toBe(response.total);
		});

		it("should filter by search", async () => {
			mockRequest = { query: { search: "Stan" } };

			await priceListController.getAllPriceLists(
				mockRequest,
				mockResponse
			);

			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.total).toBe(1);
			expect(response.data[0].name).toBe("Standard");
		});
	});

	describe("getPriceListById", () => {
		it("should return price list by valid ID", async () => {
			mockRequest = {
				params: {
					id: insertedData.priceLists[0].pricelist_id.toString()
				}
			};

			await priceListController.getPriceListById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.pricelist_id).toBe(
				insertedData.priceLists[0].pricelist_id
			);
		});

		it("should return 404 for non-existent price list", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await priceListController.getPriceListById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Price list not found"
			});
		});
	});

	describe("createPriceList", () => {
		it("should create new price list", async () => {
			mockRequest = {
				body: {
					name: "New Price List",
					is_default: false
				}
			};

			await priceListController.createPriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.name).toBe("New Price List");
		});
	});

	describe("updatePriceList", () => {
		it("should update existing price list", async () => {
			mockRequest = {
				params: {
					id: insertedData.priceLists[0].pricelist_id.toString()
				},
				body: {
					name: "Updated Price List"
				}
			};

			await priceListController.updatePriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.name).toBe("Updated Price List");
		});

		it("should return 404 for non-existent price list", async () => {
			mockRequest = {
				params: {
					id: "999"
				},
				body: {
					name: "Updated Price List"
				}
			};

			await priceListController.updatePriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("deletePriceList", () => {
		it("should delete non-default price list", async () => {
			const nonDefaultPriceListId = insertedData.priceLists.find(
				(pl) => !pl.is_default
			)!.pricelist_id.toString();
			mockRequest = {
				params: {
					id: nonDefaultPriceListId
				}
			};

			await priceListController.deletePriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(204);
		});

		it("should not delete default price list", async () => {
			const defaultPriceListId = insertedData.priceLists.find(
				(pl) => pl.is_default
			)!.pricelist_id.toString();
			mockRequest = {
				params: {
					id: defaultPriceListId
				}
			};

			await priceListController.deletePriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Cannot delete the default price list"
			});
		});

		it("should return 404 for non-existent price list", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await priceListController.deletePriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("getDefaultPriceList", () => {
		it("should return default price list", async () => {
			const defaultPriceList = insertedData.priceLists.find(
				(pl) => pl.is_default
			)
			mockRequest = {};

			await priceListController.getDefaultPriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.is_default).toBeTrue();
			expect(response.name).toBe(defaultPriceList!.name);
		});

		it("should return 404 when no default price list exists", async () => {
			await dbHelper.clearDatabase();
			mockRequest = {};

			await priceListController.getDefaultPriceList(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "No default price list found"
			});
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
