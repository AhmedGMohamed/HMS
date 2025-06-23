import { DrugShipmentModel } from "../../models/DrugShipment.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("DrugShipmentModel", () => {
	let drugShipmentModel: DrugShipmentModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		drugShipmentModel = new DrugShipmentModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllShipments", () => {
		it("should return all shipments with drug and warehouse info", async () => {
			const result = await drugShipmentModel.getAllShipments();

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toEqual(
				jasmine.objectContaining({
					shipment_id: jasmine.any(Number),
					drug_name: jasmine.any(String),
					warehouse_name: jasmine.any(String),
					unit_conversion: jasmine.any(Object)
				})
			);
		});

		it("should order shipments by received date descending", async () => {
			const result = await drugShipmentModel.getAllShipments();

			for (let i = 1; i < result.length; i++) {
				expect(
					new Date(result[i - 1].received_date).getTime()
				).toBeGreaterThanOrEqual(
					new Date(result[i].received_date).getTime()
				);
			}
		});
	});

	describe("getShipmentById", () => {
		it("should return shipment with full details", async () => {
			const result = await drugShipmentModel.getShipmentById(
				insertedData.drugShipments[0].shipment_id
			);

			expect(result).not.toBeNull();
			expect(result?.drug_name).toBeDefined();
			expect(result?.warehouse_name).toBeDefined();
			expect(result?.unit_conversion).toBeDefined();
		});

		it("should return null for non-existent shipment", async () => {
			const result = await drugShipmentModel.getShipmentById(999);
			expect(result).toBeNull();
		});
	});

	describe("createShipment", () => {
		it("should create shipment with quantity conversion", async () => {
			const shipmentData = {
				drug_id: insertedData.drugCards[0].drug_id,
				warehouse_id: insertedData.warehouses[0].warehouse_id,
				quantity: 5, // This is in larger units (e.g., boxes)
				buy_price: 100.0,
				prices: [
					{
						pricelist_id: insertedData.priceLists[0].pricelist_id,
						price: 100.0,
						requires_prepayment: true,
						prepayment_type: "fixed",
						prepayment_amount: 10
					}
				],
				expiry_date: "2024-12-31"
			};

			const result = await drugShipmentModel.createShipment(
				shipmentData,
				insertedData.users[0].user_id
			);

			expect(result.drug_id).toBe(shipmentData.drug_id);
			// Verify quantity conversion (5 boxes * 100 units per box = 500 units)
			expect(result.quantity).toBe(
				shipmentData.quantity *
					insertedData.drugCards[0].unit_conversion.ratio
			);
		});

		it("should reject non-existent drug", async () => {
			const shipmentData = {
				drug_id: 999,
				warehouse_id: insertedData.warehouses[0].warehouse_id,
				quantity: 5,
				buy_price: 100.0,
				prices: [
					{
						pricelist_id: insertedData.priceLists[0].pricelist_id,
						price: 100.0,
						requires_prepayment: true,
						prepayment_type: "fixed",
						prepayment_amount: 10
					}
				],
				expiry_date: "2024-12-31"
			};

			await expectAsync(
				drugShipmentModel.createShipment(
					shipmentData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Drug not found");
		});

		it("should reject non-existent warehouse", async () => {
			const shipmentData = {
				drug_id: insertedData.drugCards[0].drug_id,
				warehouse_id: 999,
				quantity: 5,
				buy_price: 100.0,
				prices: [
					{
						pricelist_id: insertedData.priceLists[0].pricelist_id,
						price: 100.0,
						requires_prepayment: true,
						prepayment_type: "fixed",
						prepayment_amount: 10
					}
				],
				expiry_date: "2024-12-31"
			};

			await expectAsync(
				drugShipmentModel.createShipment(
					shipmentData,
					insertedData.users[0].user_id
				)
			).toBeRejectedWithError("Warehouse not found");
		});

		it("should handle optional received date", async () => {
			const receivedDate = "2024-12-01";
			const shipmentData = {
				drug_id: insertedData.drugCards[0].drug_id,
				warehouse_id: insertedData.warehouses[0].warehouse_id,
				quantity: 5,
				buy_price: 100.0,
				prices: [
					{
						pricelist_id: insertedData.priceLists[0].pricelist_id,
						price: 100.0,
						requires_prepayment: true,
						prepayment_type: "fixed",
						prepayment_amount: 10
					}
				],
				expiry_date: "2024-12-31",
				received_date: receivedDate
			};

			const result = await drugShipmentModel.createShipment(
				shipmentData,
				insertedData.users[0].user_id
			);

			expect(
				new Date(result.received_date).toISOString().split("T")[0]
			).toBe(receivedDate);
		});
	});

	describe("updateShipment", () => {
		it("should update shipment details", async () => {
			const updateData = {
				shipment_id: insertedData.drugShipments[0].shipment_id,
				warehouse_id: insertedData.warehouses[1].warehouse_id,
				prices: [
					{
						pricelist_id: insertedData.priceLists[0].pricelist_id,
						price: 100.0,
						requires_prepayment: true,
						prepayment_type: "fixed",
						prepayment_amount: 10
					}
				]
			};

			const result = await drugShipmentModel.updateShipment(updateData);

			expect(result.warehouse_id).toBe(updateData.warehouse_id);
			expect(result.prices[0].price).toEqual(updateData.prices[0].price);
		});

		it("should handle quantity updates with conversion", async () => {
			const updateData = {
				shipment_id: insertedData.drugShipments[0].shipment_id,
				quantity: 10 // In larger units
			};

			const result = await drugShipmentModel.updateShipment(updateData);

			expect(result.quantity).toBe(
				updateData.quantity *
					insertedData.drugCards[0].unit_conversion.ratio
			);
		});

		it("should reject non-existent shipment", async () => {
			const updateData = {
				shipment_id: 999,
				sell_price: 200.0
			};

			await expectAsync(
				drugShipmentModel.updateShipment(updateData)
			).toBeRejectedWithError("Shipment not found");
		});

		it("should reject non-existent warehouse", async () => {
			const updateData = {
				shipment_id: insertedData.drugShipments[0].shipment_id,
				warehouse_id: 999
			};

			await expectAsync(
				drugShipmentModel.updateShipment(updateData)
			).toBeRejectedWithError("Warehouse not found");
		});

		it("should return unchanged shipment when no updates provided", async () => {
			let originalShipment = (await drugShipmentModel.getShipmentById(
				insertedData.drugShipments[0].shipment_id
			))!;

			const updateData = {
				shipment_id: insertedData.drugShipments[0].shipment_id
			};

			const result = await drugShipmentModel.updateShipment(updateData);

			expect(result).toEqual(originalShipment);
		});
	});

	describe("deleteShipment", () => {
		it("should delete shipment with no transactions", async () => {
			// Create a new shipment that won't have transactions
			const newShipment = await drugShipmentModel.createShipment(
				{
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
					expiry_date: "2024-12-31"
				},
				insertedData.users[0].user_id
			);

			await drugShipmentModel.deleteShipment(newShipment.shipment_id);

			const deletedShipment = await drugShipmentModel.getShipmentById(
				newShipment.shipment_id
			);
			expect(deletedShipment).toBeNull();
		});

		it("should reject deleting shipment with transactions", async () => {
			// Assuming the first shipment has transactions from seed data
			await expectAsync(
				drugShipmentModel.deleteShipment(
					insertedData.drugShipments[0].shipment_id
				)
			).toBeRejectedWithError(
				"Cannot delete shipment with existing transactions"
			);
		});

		it("should reject deleting non-existent shipment", async () => {
			await expectAsync(
				drugShipmentModel.deleteShipment(999)
			).toBeRejectedWithError("Shipment not found");
		});
	});

	describe("getShipmentsByDrug", () => {
		it("should return all shipments for a drug", async () => {
			const result = await drugShipmentModel.getShipmentsByDrug(
				insertedData.drugCards[0].drug_id
			);

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(
				result.every(
					(s) => s.drug_id === insertedData.drugCards[0].drug_id
				)
			).toBeTrue();
		});

		it("should include quantity in larger units", async () => {
			const result = await drugShipmentModel.getShipmentsByDrug(
				insertedData.drugCards[0].drug_id
			);

			result.forEach((shipment) => {
				expect(shipment.quantity_in_larger_unit).toBeDefined();
				expect(shipment.quantity_in_larger_unit).toBe(
					shipment.quantity / shipment.unit_conversion.ratio
				);
			});
		});

		it("should only return shipments with positive quantity", async () => {
			const result = await drugShipmentModel.getShipmentsByDrug(
				insertedData.drugCards[0].drug_id
			);

			expect(result.every((s) => s.quantity > 0)).toBeTrue();
		});

		it("should order by expiry date ascending", async () => {
			const result = await drugShipmentModel.getShipmentsByDrug(
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

	describe("getShipmentsByWarehouse", () => {
		it("should return all shipments in a warehouse", async () => {
			const result = await drugShipmentModel.getShipmentsByWarehouse(
				insertedData.warehouses[0].warehouse_id
			);

			expect(Array.isArray(result)).toBeTrue();
			expect(result.length).toBeGreaterThan(0);
			expect(
				result.every(
					(s) =>
						s.warehouse_id ===
						insertedData.warehouses[0].warehouse_id
				)
			).toBeTrue();
		});

		it("should only return shipments with positive quantity", async () => {
			const result = await drugShipmentModel.getShipmentsByWarehouse(
				insertedData.warehouses[0].warehouse_id
			);

			expect(result.every((s) => s.quantity > 0)).toBeTrue();
		});

		it("should order by drug name and expiry date", async () => {
			const result = await drugShipmentModel.getShipmentsByWarehouse(
				insertedData.warehouses[0].warehouse_id
			);

			// Check drug name ordering
			for (let i = 1; i < result.length; i++) {
				if (result[i - 1].drug_name === result[i].drug_name) {
					// For same drug, check expiry date ordering
					expect(
						new Date(result[i - 1].expiry_date).getTime()
					).toBeLessThanOrEqual(
						new Date(result[i].expiry_date).getTime()
					);
				} else {
					expect(
						result[i - 1].drug_name.localeCompare(
							result[i].drug_name
						)
					).toBeLessThanOrEqual(0);
				}
			}
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
