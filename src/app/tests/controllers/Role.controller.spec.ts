// src/app/tests/controllers/Role.controller.spec.ts
import { RoleController } from "../../controllers/Role.controller.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("RoleController", () => {
	let roleController: RoleController;
	let insertedData: TestData;
	let mockRequest: any;
	let mockResponse: any;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		roleController = new RoleController();
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

	describe("createRole", () => {
		it("should create valid role", async () => {
			mockRequest = {
				body: {
					name: "New Role",
					permissions: [insertedData.permissions[0].permission_id]
				}
			};

			await roleController.createRole(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.name).toBe("New Role");
			expect(response.permissions.length).toBe(1);
		});

		it("should reject missing name", async () => {
			mockRequest = {
				body: {
					permissions: []
				}
			};

			await roleController.createRole(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Role name is required"
			});
		});

		it("should reject duplicate name", async () => {
			mockRequest = {
				body: {
					name: "Admin", // Existing name from seed data
					permissions: []
				}
			};

			await roleController.createRole(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(409);
		});
	});

	describe("updateRole", () => {
		it("should update valid role", async () => {
			mockRequest = {
				params: {
					id: insertedData.roles[1].role_id.toString()
				},
				body: {
					name: "Updated Role"
				}
			};

			await roleController.updateRole(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.name).toBe("Updated Role");
		});

		it("should reject non-existent role", async () => {
			mockRequest = {
				params: {
					id: "999"
				},
				body: {
					name: "Updated Role"
				}
			};

			await roleController.updateRole(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("deleteRole", () => {
		it("should delete role with no users", async () => {
			// First create a new role
			mockRequest = {
				body: {
					name: "To Delete",
					permissions: []
				}
			};
			await roleController.createRole(mockRequest, mockResponse);
			const newRole = mockResponse.status().json.calls.mostRecent().args[0];
			
			// Reset mock
			mockResponse.status.calls.reset();
			mockResponse.json.calls.reset();

			mockRequest = {
				params: {
					id: newRole.role_id.toString()
				}
			};

			await roleController.deleteRole(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(204);
		});

		it("should reject deleting role with users", async () => {
			mockRequest = {
				params: {
					id: insertedData.roles[0].role_id.toString() // Admin role
				}
			};

			await roleController.deleteRole(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("getRoleById", () => {
		it("should return existing role", async () => {
			mockRequest = {
				params: {
					id: insertedData.roles[0].role_id.toString()
				}
			};

			await roleController.getRoleById(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.name).toBe("Admin");
		});

		it("should return 404 for non-existent role", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await roleController.getRoleById(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("getAllRoles", () => {
		it("should return all roles", async () => {
			mockRequest = {};

			await roleController.getAllRoles(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	 describe("assignPermissions", () => {
			it("should assign valid permissions", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles.find((r) => r.name === "Limited User")!.role_id.toString()
					},
					body: {
						permission_ids: [insertedData.permissions[0].permission_id]
					}
				};

				await roleController.assignPermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.json).toHaveBeenCalled();
				const response = mockResponse.json.calls.mostRecent().args[0];
				expect(Array.isArray(response)).toBeTrue();
				expect(response.length).toBeGreaterThan(0);
			});

			it("should reject empty permission list", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles[1].role_id.toString()
					},
					body: {
						permission_ids: []
					}
				};

				await roleController.assignPermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.status).toHaveBeenCalledWith(400);
			});

			it("should reject invalid role", async () => {
				mockRequest = {
					params: {
						id: "999"
					},
					body: {
						permission_ids: [1]
					}
				};

				await roleController.assignPermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.status).toHaveBeenCalledWith(404);
			});
		});

		describe("removePermissions", () => {
			it("should remove permissions", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles.find((r) => r.name === "Admin")!.role_id.toString()
					},
					body: {
						permission_ids: [insertedData.permissions[0].permission_id]
					}
				};

				await roleController.removePermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.status).toHaveBeenCalledWith(204);
			});

			it("should reject empty permission list", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles[0].role_id.toString()
					},
					body: {
						permission_ids: []
					}
				};

				await roleController.removePermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.status).toHaveBeenCalledWith(400);
			});
		});

		describe("syncPermissions", () => {
			it("should sync permissions", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles.find((r) => r.name === "Admin")!.role_id.toString()
					},
					body: {
						permission_ids: [insertedData.permissions[0].permission_id]
					}
				};

				await roleController.syncPermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.json).toHaveBeenCalled();
				const response = mockResponse.json.calls.mostRecent().args[0];
				expect(Array.isArray(response)).toBeTrue();
				expect(response.length).toBe(1);
			});

			it("should handle empty permission list", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles.find((r) => r.name === "Admin")!.role_id.toString()
					},
					body: {
						permission_ids: []
					}
				};

				await roleController.syncPermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.json).toHaveBeenCalled();
				const response = mockResponse.json.calls.mostRecent().args[0];
				expect(Array.isArray(response)).toBeTrue();
				expect(response.length).toBe(0);
			});
		});

		describe("checkPermission", () => {
			it("should check single permission", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles.find((r) => r.name === "Admin")!.role_id.toString()
					},
					query: {
						permission: insertedData.permissions[0].feature_name
					}
				};

				await roleController.checkPermission(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.json).toHaveBeenCalled();
				const response = mockResponse.json.calls.mostRecent().args[0];
				expect(response.hasPermission).toBeDefined();
			});

			it("should reject missing permission parameter", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles[0].role_id.toString()
					},
					query: {}
				};

				await roleController.checkPermission(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.status).toHaveBeenCalledWith(400);
			});
		});

		describe("checkPermissions", () => {
			it("should check multiple permissions", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles.find((r) => r.name === "Admin")!.role_id.toString()
					},
					query: {
						permissions: [
							insertedData.permissions[0].feature_name,
							insertedData.permissions[1].feature_name
						]
					}
				};

				await roleController.checkPermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.json).toHaveBeenCalled();
				const response = mockResponse.json.calls.mostRecent().args[0];
				expect(response.hasPermissions).toBeDefined();
			});

			it("should reject invalid permissions parameter", async () => {
				mockRequest = {
					params: {
						id: insertedData.roles[0].role_id.toString()
					},
					query: {
						permissions: "not-an-array"
					}
				};

				await roleController.checkPermissions(
					mockRequest,
					mockResponse
				);

				expect(mockResponse.status).toHaveBeenCalledWith(400);
			});
		});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
