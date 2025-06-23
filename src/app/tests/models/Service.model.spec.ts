import { ServiceModel } from "../../models/Service.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("ServiceModel", () => {
	let serviceModel: ServiceModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		serviceModel = new ServiceModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllServices", () => {
		it("should return all services", async () => {
			const result = await serviceModel.getAllServices();

			expect(result.length).toBe(4);
			expect(result.some(s => s.name === "Room Service")).toBeTrue();
		});

		it("should return empty array when no services exist", async () => {
			await dbHelper.clearDatabase();
			const result = await serviceModel.getAllServices();
			expect(result.length).toBe(0);
		});
	});

	describe("getServiceById", () => {
		it("should return service with prices and drugs", async () => {
			const service = insertedData.services.find(s => s.service_id == insertedData.serviceDrugs[0].service_id)!;
			const priceLists = insertedData.priceLists;

			const result = await serviceModel.getServiceById(
				service.service_id
			);
			
			expect(result).not.toBeNull();
			expect(result.name).toBe(service.name);
			expect(result.prices.length).toBe(priceLists.length);
			expect(result.drugs.length).toBeGreaterThan(0);
			expect(result.drugs.some(d => d.name)).toBeTrue()
		});

		it("should throw error for non-existent service", async () => {
			await expectAsync(
				serviceModel.getServiceById(99999)
			).toBeRejectedWithError("Service not found");
		});
	});

	describe("createService", () => {
		it("should create service with prices", async () => {
			const priceLists = insertedData.priceLists;

			const result = await serviceModel.createService({
				name: "New Service",
				auto_renew: false,
				auto_add_on_admission: false,
				service_type: "once",
				prices: priceLists.map((pl, ind) => ({
					pricelist_id: pl.pricelist_id,
					price: 100.0 + ind * 10,
					requires_prepayment: false
				}))
			});

			expect(result.name).toBe("New Service");

			const service = await serviceModel.getServiceById(result.service_id);
			expect(service.prices.length).toBe(priceLists.length);
		});

		it("should create service with drugs", async () => {
			const drug = insertedData.drugCards[0];
			const priceLists = insertedData.priceLists;

			const result = await serviceModel.createService({
				name: "New Service",
				auto_renew: false,
				auto_add_on_admission: false,
				service_type: "once",
				drugs: [drug.drug_id],
				prices: priceLists.map((pl, ind) => ({
					pricelist_id: pl.pricelist_id,
					price: 100.0 + ind * 10,
					requires_prepayment: false
				}))
			});

			expect(result.name).toBe("New Service");

			const service = await serviceModel.getServiceById(result.service_id);
			const serviceDrugs = service.drugs;
			expect(serviceDrugs.length).toBe(1);
			expect(serviceDrugs[0].drug_id).toBe(drug.drug_id);
		});
	});

	describe("updateService", () => {
		it("should update service details", async () => {
			const service = insertedData.services[0];

			const result = await serviceModel.updateService({
				service_id: service.service_id,
				name: "Updated Service",
				auto_renew: true
			});

			expect(result.name).toBe("Updated Service");
			expect(result.auto_renew).toBeTrue();
		});

		it("should update service prices", async () => {
			const priceLists = insertedData.priceLists;
			const service = insertedData.services[0];

			await serviceModel.updateService({
				service_id: service.service_id,
				prices: [
					{
						pricelist_id: priceLists[0].pricelist_id,
						price: 200.0,
						requires_prepayment: true,
						prepayment_type: "fixed",
						prepayment_amount: 50.0
					}
				]
			});

			const prices = await serviceModel.getServiceById(
				service.service_id
			)
			const updatedPrice = prices.prices.find(
				(p) => p.pricelist_id === priceLists[0].pricelist_id
			);
			expect(updatedPrice!.price).toBe(parseFloat("200.00"));
			expect(updatedPrice!.requires_prepayment).toBeTrue();
		});

		it("should update service drugs", async () => {
			const service = insertedData.services.find(s => s.service_id != insertedData.serviceDrugs[0].service_id)!;
			const drug = (await dbHelper.seedDrugCards(insertedData.users[0].user_id))[0];

			await serviceModel.updateService({
				service_id: service.service_id,
				drugs: [drug.drug_id]
			});

			const serviceDrugs = await serviceModel.getServiceDrugs(
				service.service_id
			);
			expect(serviceDrugs.length).toBe(1);
			expect(serviceDrugs.some((d) => d.drug_id === drug.drug_id)).toBeTrue();
		});
	});

	describe("searchServices", () => {
		it("should find services by exact name match", async () => {
			const result = await serviceModel.searchServices("Room Service");
			expect(result.length).toBe(1);
			expect(result[0].name).toBe("Room Service");
		});

		it("should find services by partial name match", async () => {
			const result = await serviceModel.searchServices("Service");
			expect(result.length).toBe(1);
			expect(result[0].name).toBe("Room Service");
		});

		it("should return empty array for no matches", async () => {
			const result = await serviceModel.searchServices("NonExistent");
			expect(result.length).toBe(0);
		});
	});

	afterAll(async () => {
		await dbHelper.clearDatabase();
	});
});
