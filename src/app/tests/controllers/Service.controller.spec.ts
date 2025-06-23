// src/app/tests/controllers/Service.controller.spec.ts
import { ServiceController } from "../../controllers/Service.controller.js";
import { ActivePatientService, Service } from "../../utils/types/services.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("ServiceController", () => {
	let serviceController: ServiceController;
	let mockRequest: any;
	let mockResponse: any;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		serviceController = new ServiceController();
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

	describe("getAllServices", () => {
		it("should return all services", async () => {
			mockRequest = {};

			await serviceController.getAllServices(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe("getServiceById", () => {
		it("should return service with prices and drugs", async () => {
			const service = insertedData.services.find(s => s.service_id == insertedData.serviceDrugs[0].service_id)!;
			mockRequest = {
				params: {
					id: service.service_id
				}
			};

			await serviceController.getServiceById(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.service_id).toBe(
				service.service_id
			);
			expect(response.prices).toBeDefined();
			expect(response.drugs).toBeDefined();
			expect(response.drugs.some((d: any) => d.name)).toBeTrue();
		});

		it("should return 404 for non-existent service", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await serviceController.getServiceById(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("createService", () => {
		it("should create service with prices and drugs", async () => {
			mockRequest = {
				body: {
					name: "New Service",
					auto_renew: false,
					auto_add_on_admission: false,
					service_type: "once",
					prices: [
						{
							pricelist_id:
								insertedData.priceLists[0].pricelist_id,
							price: 100.0,
							requires_prepayment: false
						}
					],
					drugs: [insertedData.drugCards[0].drug_id]
				}
			};

			await serviceController.createService(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.name).toBe("New Service");
		});

		it("should handle database errors during creation", async () => {
			mockRequest = {
				body: {
					name: "New Service",
					service_type: "invalid_type" // This should cause an error
				}
			};

			await serviceController.createService(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(500);
		});
	});

	describe("updateService", () => {
		it("should update service details", async () => {
			mockRequest = {
				params: {
					id: insertedData.services[0].service_id.toString()
				},
				body: {
					name: "Updated Service"
				}
			};

			await serviceController.updateService(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.name).toBe("Updated Service");
		});

		it("should update service prices", async () => {
			mockRequest = {
				params: {
					id: insertedData.services[0].service_id.toString()
				},
				body: {
					prices: [
						{
							pricelist_id:
								insertedData.priceLists[0].pricelist_id,
							price: 200.0,
							requires_prepayment: true,
							prepayment_type: "fixed",
							prepayment_amount: 50.0
						}
					]
				}
			};

			await serviceController.updateService(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.prices[0].price).toBe("200.00");
		});

		it("should update service drugs", async () => {
			mockRequest = {
				params: {
					id: insertedData.services[0].service_id.toString()
				},
				body: {
					drugs: [insertedData.drugCards[0].drug_id]
				}
			};

			await serviceController.updateService(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
		});
	});

	describe("deleteService", () => {
		it("should delete service and related data", async () => {
			mockRequest = {
				body: {
					name: "New Service",
					auto_renew: false,
					auto_add_on_admission: false,
					service_type: "once",
					prices: [
						{
							pricelist_id:
								insertedData.priceLists[0].pricelist_id,
							price: 100.0,
							requires_prepayment: false
						}
					],
					drugs: [insertedData.drugCards[0].drug_id]
				}
			};
			await serviceController.createService(mockRequest, mockResponse);
			const newService: Service = mockResponse
				.status()
				.json.calls.mostRecent().args[0];
			
			mockResponse = {
				status: jasmine.createSpy("status").and.returnValue({
					json: jasmine.createSpy("json"),
					send: jasmine.createSpy("send")
				}),
				json: jasmine.createSpy("json")
			};

			mockRequest = {
				params: {
					id: newService.service_id.toString()
				}
			};

			await serviceController.deleteService(mockRequest, mockResponse);
			expect(mockResponse.status).toHaveBeenCalledWith(204);

			mockResponse = {
				status: jasmine.createSpy("status").and.returnValue({
					json: jasmine.createSpy("json"),
					send: jasmine.createSpy("send")
				}),
				json: jasmine.createSpy("json")
			};

			mockRequest = {
				params: {
					id: newService.service_id.toString()
				}
			};
			await serviceController.getServiceById(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Service not found"
			});
		});

		it("should handle non-existent service deletion gracefully", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await serviceController.deleteService(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("searchServices", () => {
		it("should return matching services", async () => {
			mockRequest = {
				query: {
					q: "Room"
				}
			};

			await serviceController.searchServices(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(
				response.some((s: Service) => s.name.includes("Room"))
			).toBeTrue();
		});

		it("should reject empty search term", async () => {
			mockRequest = {
				query: {
					q: ""
				}
			};

			await serviceController.searchServices(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getServiceSuggestions", () => {
		it("should return service suggestions", async () => {
			mockRequest = {
				query: {
					prefix: "Ro"
				}
			};

			await serviceController.getServiceSuggestions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(
				response.every((s: Service) =>
					s.name.toLowerCase().startsWith("ro")
				)
			).toBeTrue();
		});

		it("should reject empty prefix", async () => {
			mockRequest = {
				query: {
					prefix: ""
				}
			};

			await serviceController.getServiceSuggestions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getServiceDrugs", () => {
		it("should return drugs associated with service", async () => {
			mockRequest = {
				params: {
					id: insertedData.services[0].service_id.toString()
				}
			};

			await serviceController.getServiceDrugs(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
		});
	});

	describe("getActivePatientServices", () => {
		it("should return active services for patient", async () => {
			mockRequest = {
				params: {
					patientId: insertedData.patients[0].patient_id.toString()
				}
			};

			await serviceController.getActivePatientServices(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(
				response.every((s: ActivePatientService) => s.is_active)
			).toBeTrue();
		});
	});

	describe("addServiceToPatient", () => {
		it("should add service to patient", async () => {
			mockRequest = {
				params: {
					patientId: insertedData.patients[0].patient_id.toString()
				},
				body: {
					serviceId: insertedData.services[0].service_id,
					startDate: new Date().toISOString()
				}
			};

			await serviceController.addServiceToPatient(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.patient_id).toBe(
				insertedData.patients[0].patient_id
			);
			expect(response.service_id).toBe(
				insertedData.services[0].service_id
			);
		});

		it("should handle non-existent service", async () => {
			mockRequest = {
				params: {
					patientId: insertedData.patients[0].patient_id.toString()
				},
				body: {
					serviceId: 999
				}
			};

			await serviceController.addServiceToPatient(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("deactivatePatientService", () => {
		it("should deactivate active service", async () => {
			// First add a service
			await serviceController.addServiceToPatient(
				{
					params: {
						patientId:
							insertedData.patients[0].patient_id.toString()
					},
					body: {
						serviceId: insertedData.services[0].service_id
					}
				} as any,
				mockResponse
			);
			const activeService: ActivePatientService = mockResponse
				.status()
				.json.calls.mostRecent().args[0];

			// Reset mock
			mockResponse.status.calls.reset();
			mockResponse.json.calls.reset();

			mockRequest = {
				params: {
					activeServiceId: activeService.active_service_id.toString()
				},
				body: {
					endDate: new Date().toISOString()
				}
			};

			await serviceController.deactivatePatientService(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.is_active).toBeFalse();
		});

		it("should handle non-existent active service", async () => {
			mockRequest = {
				params: {
					activeServiceId: "999"
				},
				body: {
					endDate: new Date().toISOString()
				}
			};

			await serviceController.deactivatePatientService(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
