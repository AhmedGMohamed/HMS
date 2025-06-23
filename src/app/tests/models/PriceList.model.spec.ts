import { PriceListModel } from "../../models/PriceList.model.js";
import { TestData, dbHelper } from "../helpers/db.helper.js";

describe("PriceListModel", () => {
	let priceListModel: PriceListModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		priceListModel = new PriceListModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllPriceLists", () => {
		it("should return all price lists", async () => {
			const result = await priceListModel.getAllPriceLists();
			const defaultList = result.find(
				p => p.is_default === true
			)

			expect(result.length).toBe(3);
			expect(result.some(p => p.name === "Standard")).toBeTrue();
			expect(defaultList).toBeDefined();
			expect(result[2].name).toBeTruthy();
		});

		it("should return empty array when no price lists exist", async () => {
			await dbHelper.clearDatabase();

			const result = await priceListModel.getAllPriceLists();
			expect(result.length).toBe(0);
		});
	});

	describe("getPriceListById", () => {
		it("should return price list by id", async () => {
			const seededList = insertedData.priceLists[0];

			const result = await priceListModel.getPriceListById(
				seededList.pricelist_id
			);

			expect(result).not.toBeNull();
			expect(result.name).toBe(seededList.name);
		});

		it("should throw error for non-existent price list", async () => {
			await expectAsync(
				priceListModel.getPriceListById(99999)
			).toBeRejectedWithError("Price list not found");
		});
	});

	describe("createPriceList", () => {
		it("should create a new price list", async () => {
			const result = await priceListModel.createPriceList({
				name: "New Price List",
				is_default: false
			});

			expect(result.name).toBe("New Price List");
			expect(result.is_default).toBeFalse();
		});

		it("should handle default price list creation", async () => {
			// Create another default price list
			await priceListModel.createPriceList({
				name: "New Default List",
				is_default: true
			});

			// Verify only the new one is default
			const allLists = await priceListModel.getAllPriceLists();
			const defaultLists = allLists.filter((list) => list.is_default);

			expect(defaultLists.length).toBe(1);
			expect(defaultLists[0].name).toBe("New Default List");
		});
	});

	describe("updatePriceList", () => {
		it("should update price list name", async () => {
			const seededList = insertedData.priceLists[0];
			const result = await priceListModel.updatePriceList(
				seededList.pricelist_id,
				{ name: "Updated Name" }
			);

			expect(result.name).toBe("Updated Name");
		});

		it("should handle default status update", async () => {
			const list1 = insertedData.priceLists[0];
			const list2 = insertedData.priceLists[1];

			await priceListModel.updatePriceList(list2.pricelist_id, {
				is_default: true
			});

			const updatedLists = await priceListModel.getAllPriceLists();
			expect(
				updatedLists.find((l) => l.pricelist_id === list1.pricelist_id)!
					.is_default
			).toBeFalse();
			expect(
				updatedLists.find((l) => l.pricelist_id === list2.pricelist_id)!
					.is_default
			).toBeTrue();
		});
	});

	describe("deletePriceList", () => {
		it("should delete non-default price list", async () => {
			const seededList = insertedData.priceLists[1];

			await priceListModel.deletePriceList(seededList.pricelist_id);

			const lists = await priceListModel.getAllPriceLists();
			expect(lists.length).toBe(2);
		});

		it("should not allow deletion of default price list", async () => {
			const seededList = insertedData.priceLists[0];

			await expectAsync(
				priceListModel.deletePriceList(seededList.pricelist_id)
			).toBeRejectedWithError("Cannot delete the default price list");
		});
	});

	afterAll(async () => {
		await dbHelper.clearDatabase();
	});
});
