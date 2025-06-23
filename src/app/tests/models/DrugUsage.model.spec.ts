import { DrugUsageModel } from "../../models/DrugUsage.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("DrugUsageModel", () => {
	let drugUsageModel: DrugUsageModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugUsageModel = new DrugUsageModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllDrugUsages", () => {
		it("should return all drug usages with details", async () => {
			const result = await drugUsageModel.getAllDrugUsages();

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toEqual(
				jasmine.objectContaining({
					usage_id: jasmine.any(Number),
					drug_name: jasmine.any(String),
					patient_name: jasmine.any(String),
					unit_conversion: jasmine.any(Object),
					frequency: jasmine.any(Object)
				})
			);
		});

		it("should order by patient name and drug name", async () => {
			const result = await drugUsageModel.getAllDrugUsages();

			// Check patient name ordering
			for (let i = 1; i < result.length; i++) {
				if (result[i - 1].patient_name === result[i].patient_name) {
					// For same patient, check drug name ordering
					expect(
						result[i - 1].drug_name.localeCompare(
							result[i].drug_name
						)
					).toBeLessThanOrEqual(0);
				} else {
					expect(
						result[i - 1].patient_name.localeCompare(
							result[i].patient_name
						)
					).toBeLessThanOrEqual(0);
				}
			}
		});
	});

	describe("getDrugUsageById", () => {
		it("should return drug usage with full details", async () => {
			const result = await drugUsageModel.getDrugUsageById(
				insertedData.drugUsages[0].usage_id
			);

			expect(result).not.toBeNull();
			expect(result?.drug_name).toBeDefined();
			expect(result?.patient_name).toBeDefined();
			expect(result?.unit_conversion).toBeDefined();
			expect(result?.frequency).toBeDefined();
			expect(result?.is_obligatory_continuous).toBeDefined();
		});

		it("should return null for non-existent usage", async () => {
			const result = await drugUsageModel.getDrugUsageById(999);
			expect(result).toBeNull();
		});
	});

	describe("createDrugUsage", () => {
		it("should create drug usage with transaction", async () => {
			const usageData = {
				patient_id: insertedData.patients[0].patient_id,
				drug_id: insertedData.drugCards[0].drug_id,
				shipment_id: insertedData.drugShipments[0].shipment_id,
				quantity: 0.1, // In larger units
				price: 100.0
			};

			const result = await drugUsageModel.createDrugUsage(
				usageData,
				insertedData.users[0].user_id
			);

			expect(result.patient_id).toBe(usageData.patient_id);
			expect(result.drug_id).toBe(usageData.drug_id);
			expect(result.remaining_quantity).toBe(
				usageData.quantity * insertedData.drugCards[0].unit_conversion.ratio
			);
			expect(result.transaction_id).toBeDefined();
		});

		it("should reject invalid shipment for drug", async () => {
			const usageData = {
				patient_id: insertedData.patients[0].patient_id,
				drug_id: insertedData.drugCards[0].drug_id,
				shipment_id: insertedData.drugShipments[1].shipment_id, // Shipment for different drug
				quantity: 1,
				price: 100.0
			};

			await expectAsync(
				drugUsageModel.createDrugUsage(
					usageData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Invalid shipment for this drug");
		});

		it("should reject non-existent drug", async () => {
			const usageData = {
				patient_id: insertedData.patients[0].patient_id,
				drug_id: 999,
				shipment_id: insertedData.drugShipments[0].shipment_id,
				quantity: 1,
				price: 100.0
			};

			await expectAsync(
				drugUsageModel.createDrugUsage(
					usageData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Drug not found");
		});

		it("should reject non-existent patient", async () => {
			const usageData = {
				patient_id: 999,
				drug_id: insertedData.drugCards[0].drug_id,
				shipment_id: insertedData.drugShipments[0].shipment_id,
				quantity: 1,
				price: 100.0
			};

			await expectAsync(
				drugUsageModel.createDrugUsage(
					usageData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Patient not found");
		});

		it("should reject insufficient stock", async () => {
			const usageData = {
				patient_id: insertedData.patients[0].patient_id,
				drug_id: insertedData.drugCards[0].drug_id,
				shipment_id: insertedData.drugShipments[0].shipment_id,
				quantity: 999999, // Very large quantity
				price: 100.0
			};

			await expectAsync(
				drugUsageModel.createDrugUsage(
					usageData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Insufficient quantity in selected shipment");
		});
	});

	describe("updateDrugUsage", () => {
		it("should update remaining quantity", async () => {
			const updateData = {
				usage_id: insertedData.drugUsages[0].usage_id,
				remaining_quantity: 5
			};

			const result = await drugUsageModel.updateDrugUsage(updateData);

			expect(result.remaining_quantity).toBe(
				updateData.remaining_quantity
			);
		});

		it("should update last administered time", async () => {
			const lastAdministered = new Date();
			const updateData = {
				usage_id: insertedData.drugUsages[0].usage_id,
				last_administered: lastAdministered
			};

			const result = await drugUsageModel.updateDrugUsage(updateData);

			expect(new Date(result.last_administered!).getTime()).toBe(
				lastAdministered.getTime()
			);
		});

		it("should reject negative remaining quantity", async () => {
			const updateData = {
				usage_id: insertedData.drugUsages[0].usage_id,
				remaining_quantity: -1
			};

			await expectAsync(
				drugUsageModel.updateDrugUsage(updateData)
			).toBeRejectedWithError("Remaining quantity cannot be negative");
		});

		it("should reject non-existent usage", async () => {
			const updateData = {
				usage_id: 999,
				remaining_quantity: 5
			};

			await expectAsync(
				drugUsageModel.updateDrugUsage(updateData)
			).toBeRejectedWithError("Drug usage not found");
		});
	});

	describe("getPendingAdministrations", () => {
		it("should return pending administrations", async () => {
			const result = await drugUsageModel.getPendingAdministrations();

			expect(Array.isArray(result)).toBeTrue();
			result.forEach((administration) => {
				expect(administration.remaining_quantity).toBeGreaterThan(0);
				expect(administration.is_obligatory_continuous).toBeTrue();
				expect(administration.next_administration).toBeDefined();
			});
		});

		it("should order by next administration time", async () => {
			const result = await drugUsageModel.getPendingAdministrations();

			for (let i = 1; i < result.length; i++) {
				expect(
					new Date(result[i - 1].next_administration).getTime()
				).toBeLessThanOrEqual(
					new Date(result[i].next_administration).getTime()
				);
			}
		});

		it("should only include active usages", async () => {
			const result = await drugUsageModel.getPendingAdministrations();

			expect(result.every((r) => r.remaining_quantity > 0)).toBeTrue();
		});
	});

	describe("getDrugUsageHistory", () => {
		it("should return all usage history when no filters provided", async () => {
			const result = await drugUsageModel.getDrugUsageHistory();

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toEqual(
				jasmine.objectContaining({
					initial_quantity: jasmine.any(Number),
					remaining_quantity: jasmine.any(Number),
					is_active: jasmine.any(Boolean)
				})
			);
		});

		it("should filter by patient", async () => {
			const result = await drugUsageModel.getDrugUsageHistory(
				insertedData.patients[0].patient_id
			);

			expect(
				result.every(
					(r) => r.patient_id === insertedData.patients[0].patient_id
				)
			).toBeTrue();
		});

		it("should filter by drug", async () => {
			const result = await drugUsageModel.getDrugUsageHistory(
				undefined,
				insertedData.drugCards[0].drug_id
			);

			expect(
				result.every((r) => r.drug_id === insertedData.drugCards[0].drug_id)
			).toBeTrue();
		});

		it("should order by start date descending", async () => {
			const result = await drugUsageModel.getDrugUsageHistory();

			for (let i = 1; i < result.length; i++) {
				expect(
					new Date(result[i - 1].start_date).getTime()
				).toBeGreaterThanOrEqual(
					new Date(result[i].start_date).getTime()
				);
			}
		});

		it("should correctly indicate active status", async () => {
			const result = await drugUsageModel.getDrugUsageHistory();

			result.forEach((usage) => {
				expect(usage.is_active).toBe(usage.remaining_quantity > 0);
			});
		});
	});

	describe("getAvailableShipments", () => {
		it("should return available shipments for drug", async () => {
			const result = await drugUsageModel.getAvailableShipments(
				insertedData.drugCards[0].drug_id
			);

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toEqual(
				jasmine.objectContaining({
					shipment_id: jasmine.any(Number),
					warehouse_name: jasmine.any(String),
					quantity: jasmine.any(Number),
					quantity_in_larger_unit: jasmine.any(Number),
					unit_conversion: jasmine.any(Object)
				})
			);
		});

		it("should only return shipments with positive quantity", async () => {
			const result = await drugUsageModel.getAvailableShipments(
				insertedData.drugCards[0].drug_id
			);

			expect(result.every((s) => s.quantity > 0)).toBeTrue();
		});

		it("should order by expiry date", async () => {
			const result = await drugUsageModel.getAvailableShipments(
				insertedData.drugCards[0].drug_id
			);

			for (let i = 1; i < result.length; i++) {
				expect(
					new Date(result[i - 1].expiry_date).getTime()
				).toBeLessThanOrEqual(
					new Date(result[i].expiry_date).getTime()
				);
			}
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
