// src/app/tests/controllers/Permission.controller.spec.ts
import { PermissionController } from "../../controllers/Permission.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("PermissionController", () => {
	let permissionController: PermissionController;
	let insertedData: TestData;
	let mockRequest: any;
	let mockResponse: any;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		permissionController = new PermissionController();
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

	describe("createPermission", () => {
		it("should create valid permission", async () => {
			mockRequest = {
				body: {
					feature_name: "new_feature",
					description: "New feature description"
				}
			};

			await permissionController.createPermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.feature_name).toBe("new_feature");
		});

		it("should reject missing feature name", async () => {
			mockRequest = {
				body: {
					description: "Description only"
				}
			};

			await permissionController.createPermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Feature name is required"
			});
		});

		it("should reject duplicate feature name", async () => {
			mockRequest = {
				body: {
					feature_name: insertedData.permissions[0].feature_name
				}
			};

			await permissionController.createPermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(409);
		});
	});

	describe("updatePermission", () => {
		it("should update valid permission", async () => {
			mockRequest = {
				params: {
					id: insertedData.permissions[0].permission_id.toString()
				},
				body: {
					feature_name: "updated_feature"
				}
			};

			await permissionController.updatePermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.feature_name).toBe("updated_feature");
		});

		it("should reject non-existent permission", async () => {
			mockRequest = {
				params: {
					id: "999"
				},
				body: {
					feature_name: "updated_feature"
				}
			};

			await permissionController.updatePermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});

		it("should reject duplicate feature name", async () => {
			mockRequest = {
				params: {
					id: insertedData.permissions[1].permission_id.toString()
				},
				body: {
					feature_name: insertedData.permissions[0].feature_name
				}
			};

			await permissionController.updatePermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(409);
		});
	});

	describe("deletePermission", () => {
		it("should delete unused permission", async () => {
			// First create a new permission
			mockRequest = {
				body: {
					feature_name: "to_delete"
				}
			};
			await permissionController.createPermission(
				mockRequest,
				mockResponse
			);
			const newPermission = mockResponse.status().json.calls.mostRecent()
				.args[0];

			// Reset mock
			mockResponse.status.calls.reset();
			mockResponse.json.calls.reset();

			// Then delete it
			mockRequest = {
				params: {
					id: newPermission.permission_id.toString()
				}
			};

			await permissionController.deletePermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(204);
		});

		it("should reject deleting assigned permission", async () => {
			mockRequest = {
				params: {
					id: insertedData.permissions[0].permission_id.toString()
				}
			};

			await permissionController.deletePermission(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getPermissionById", () => {
		it("should return existing permission", async () => {
			mockRequest = {
				params: {
					id: insertedData.permissions[0].permission_id.toString()
				}
			};

			await permissionController.getPermissionById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.feature_name).toBe(
				insertedData.permissions[0].feature_name
			);
		});

		it("should return 404 for non-existent permission", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await permissionController.getPermissionById(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("getAllPermissions", () => {
		it("should return all permissions", async () => {
			mockRequest = {};

			await permissionController.getAllPermissions(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe("getPermissionsByRole", () => {
		it("should return permissions for valid role", async () => {
			mockRequest = {
				params: {
					id: insertedData.roles[0].role_id.toString()
				}
			};

			await permissionController.getPermissionsByRole(
				mockRequest,
				mockResponse
			);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe("getUnassignedPermissions", () => {
		it("should return unassigned permissions for role", async () => {
			mockRequest = {
				params: {
					id: insertedData.roles[1].role_id.toString()
				}
			};

			await permissionController.getUnassignedPermissions(
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
