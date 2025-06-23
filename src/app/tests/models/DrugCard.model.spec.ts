import { DrugCardModel } from "../../models/DrugCard.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";
import { UnitConversion } from "../../utils/types/drugs.js";

describe("DrugCardModel", () => {
	let drugCardModel: DrugCardModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugCardModel = new DrugCardModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	const validUnitConversion: UnitConversion = {
		larger: "box",
		smaller: "tablet",
		ratio: 100
	};

	describe("getAllDrugCards", () => {
		it("should return all drug cards", async () => {
			const result = await drugCardModel.getAllDrugCards();

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0].name).toBeDefined();
			expect(result[0].unit_conversion).toBeDefined();
		});
	});

	describe("getDrugCardById", () => {
		it("should return drug card by valid ID", async () => {
			const result = await drugCardModel.getDrugCardById(
				insertedData.drugCards[0].drug_id
			);

			expect(result).not.toBeNull();
			expect(result?.drug_id).toBe(insertedData.drugCards[0].drug_id);
		});

		it("should return null for non-existent ID", async () => {
			const result = await drugCardModel.getDrugCardById(999);
			expect(result).toBeNull();
		});
	});

	describe("createDrugCard", () => {
		it("should create drug card with all fields", async () => {
			const drugData = {
				name: "Test Drug",
				manufacturer: "Test Manufacturer",
				provider: "Test Provider",
				is_obligatory_continuous: true,
				sale_quantity: 100,
				frequency: "12 hours",
				min_stock_alert: 50,
				max_days_expiry_alert: 90,
				unit_conversion: validUnitConversion
			};

			const result = await drugCardModel.createDrugCard(
				drugData,
				insertedData.users[0].user_id
			);

			expect(result.name).toBe(drugData.name);
			expect(result.unit_conversion).toEqual(drugData.unit_conversion);
			expect(result.is_obligatory_continuous).toBeTrue();
		});

		it("should create drug card with minimal required fields", async () => {
			const drugData = {
				name: "Minimal Drug",
				is_obligatory_continuous: false,
				sale_quantity: 50,
				unit_conversion: validUnitConversion
			};

			const result = await drugCardModel.createDrugCard(
				drugData,
				insertedData.users[0].user_id
			);

			expect(result.name).toBe(drugData.name);
			expect(result.manufacturer).toBeNull();
			expect(result.provider).toBeNull();
		});

		it("should reject duplicate drug name", async () => {
			const drugData = {
				name: insertedData.drugCards[0].name,
				is_obligatory_continuous: false,
				sale_quantity: 50,
				unit_conversion: validUnitConversion
			};

			await expectAsync(
				drugCardModel.createDrugCard(
					drugData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Drug name already exists");
		});

		it("should reject invalid unit conversion", async () => {
			const drugData = {
				name: "Invalid Unit Drug",
				is_obligatory_continuous: false,
				sale_quantity: 50,
				unit_conversion: {
					larger: "box",
					smaller: "tablet",
					ratio: -1 // Invalid ratio
				}
			};

			await expectAsync(
				drugCardModel.createDrugCard(
					drugData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Invalid unit conversion data");
		});
	});

	describe("updateDrugCard", () => {
		it("should update drug card fields", async () => {
			const updateData = {
				drug_id: insertedData.drugCards[0].drug_id,
				name: "Updated Drug",
				manufacturer: "Updated Manufacturer"
			};

			const result = await drugCardModel.updateDrugCard(updateData);

			expect(result.name).toBe(updateData.name);
			expect(result.manufacturer).toBe(updateData.manufacturer);
		});

		it("should update unit conversion", async () => {
			const newUnitConversion: UnitConversion = {
				larger: "bottle",
				smaller: "ml",
				ratio: 500
			};

			const updateData = {
				drug_id: insertedData.drugCards[0].drug_id,
				unit_conversion: newUnitConversion
			};

			const result = await drugCardModel.updateDrugCard(updateData);

			expect(result.unit_conversion).toEqual(newUnitConversion);
		});

		it("should reject non-existent drug", async () => {
			const updateData = {
				drug_id: 999,
				name: "Updated Drug"
			};

			await expectAsync(
				drugCardModel.updateDrugCard(updateData)
			).toBeRejectedWithError("Drug not found");
		});

		it("should reject duplicate name", async () => {
			const updateData = {
				drug_id: insertedData.drugCards[1].drug_id,
				name: insertedData.drugCards[0].name
			};

			await expectAsync(
				drugCardModel.updateDrugCard(updateData)
			).toBeRejectedWithError("Drug name already exists");
		});
	});

	describe("deleteDrugCard", () => {
		it("should delete drug with no dependencies", async () => {
			// Create a new drug without any shipments or service associations
			const newDrug = await drugCardModel.createDrugCard(
				{
					name: "To Delete Drug",
					is_obligatory_continuous: false,
					sale_quantity: 50,
					unit_conversion: validUnitConversion
				},
				insertedData.users[0].user_id
			);

			await drugCardModel.deleteDrugCard(newDrug.drug_id);

			const deletedDrug = await drugCardModel.getDrugCardById(
				newDrug.drug_id
			);
			expect(deletedDrug).toBeNull();
		});

		it("should reject deleting drug with shipments", async () => {
			// Use a drug that has shipments from seed data
			await expectAsync(
				drugCardModel.deleteDrugCard(insertedData.drugCards[0].drug_id)
			).toBeRejectedWithError(
				"Cannot delete drug with existing shipments"
			);
		});

		it("should reject deleting drug associated with services", async () => {
			// Assuming the seed data includes a drug associated with a service
			const drugWithService = insertedData.drugCards.find((d) => {
				insertedData.serviceDrugs.some((sd) => {
					if (
						!insertedData.drugShipments.find((sd) => {
							sd.drug_id === d.drug_id;
						})
					) {
						return sd.drug_id === d.drug_id;
					}
				});
				insertedData.drugShipments.some(
					(ds) => ds.drug_id === d.drug_id
				);
			});

			if (drugWithService) {
				await expectAsync(
					drugCardModel.deleteDrugCard(drugWithService.drug_id)
				).toBeRejectedWithError(
					"Cannot delete drug associated with services"
				);
			}
		});
	});

	describe("searchDrugs", () => {
		it("should return matching drugs", async () => {
			const searchTerm = insertedData.drugCards[0].name.substring(0, 3);

			const results = await drugCardModel.searchDrugs(searchTerm);

			expect(Array.isArray(results)).toBeTrue();
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].name.toLowerCase()).toContain(
				searchTerm.toLowerCase()
			);
		});

		it("should handle case-insensitive search", async () => {
			const searchTerm = insertedData.drugCards[0].name.toUpperCase();

			const results = await drugCardModel.searchDrugs(searchTerm);

			expect(results.length).toBeGreaterThan(0);
			expect(results[0].name.toLowerCase()).toContain(
				searchTerm.toLowerCase()
			);
		});

		it("should return empty array for no matches", async () => {
			const results = await drugCardModel.searchDrugs("NonexistentDrug");
			expect(results.length).toBe(0);
		});
	});

	describe("getDrugSuggestions", () => {
		it("should return suggestions starting with prefix", async () => {
			const prefix = insertedData.drugCards[0].name.substring(0, 2);

			const results = await drugCardModel.getDrugSuggestions(prefix);

			expect(Array.isArray(results)).toBeTrue();
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].name.toLowerCase()).toContain(
				prefix.toLowerCase()
			);
		});

		it("should limit number of suggestions", async () => {
			const prefix = "a"; // Common prefix to match multiple drugs

			const results = await drugCardModel.getDrugSuggestions(prefix);

			expect(results.length).toBeLessThanOrEqual(5);
		});
	});

	describe("getLowStockDrugs", () => {
		it("should return drugs below min stock alert", async () => {
			const results = await drugCardModel.getLowStockDrugs();

			expect(Array.isArray(results)).toBeTrue();
			expect(results.length).toBeGreaterThan(0);
			results.forEach((drug) => {
				expect(drug.total_quantity).toBeLessThanOrEqual(
					drug.min_stock_alert!
				);
			});
		});
	});

	describe("getNearExpiryDrugs", () => {
		it("should return drugs near expiry", async () => {
			const results = await drugCardModel.getNearExpiryDrugs();

			expect(Array.isArray(results)).toBeTrue();
			expect(results.length).toEqual(1);
			results.forEach((drug) => {
				expect(drug.days_until_expiry).toBeLessThanOrEqual(
					drug.max_days_expiry_alert
				);
			});
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
