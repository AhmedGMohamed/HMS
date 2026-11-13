// src/app/tests/controllers/User.controller.spec.ts
import { UserController } from "../../controllers/User.controller.js";
import userModel from "../../models/User.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("UserController", () => {
	let userController: UserController;
	let mockRequest: any;
	let mockResponse: any;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		userController = new UserController();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();

		mockResponse = {
			status: jasmine.createSpy("status").and.returnValue({
				json: jasmine.createSpy("json"),
				send: jasmine.createSpy("send")
			}),
			json: jasmine.createSpy("json"),
			send: jasmine.createSpy("send")
		};
	});

	describe("createUser", () => {
		it("should create valid user", async () => {
			mockRequest = {
				body: {
					username: "newuser",
					password: "password123",
					role_id: insertedData.roles[0].role_id
				}
			};

			await userController.createUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(201);
			const response = mockResponse.status().json.calls.mostRecent()
				.args[0];
			expect(response.username).toBe("newuser");
		});

		it("should reject incomplete data", async () => {
			mockRequest = {
				body: {
					username: "newuser"
				}
			};

			await userController.createUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
		});
	});

	describe("updateUser", () => {
		it("should update valid user", async () => {
			mockRequest = {
				params: {
					id: insertedData.users[1].user_id.toString()
				},
				body: {
					username: "updateduser"
				}
			};

			await userController.updateUser(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.username).toBe("updateduser");
		});

		it("should reject non-existent user", async () => {
			mockRequest = {
				params: {
					id: "999"
				},
				body: {
					username: "updateduser"
				}
			};

			await userController.updateUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("deleteUser", () => {
		it("should delete existing user", async () => {
			mockRequest = {
				params: {
					id: insertedData.users[1].user_id.toString()
				}
			};

			await userController.deleteUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(204);
		});

		it("should reject non-existent user", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await userController.deleteUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("getUserById", () => {
		it("should return existing user", async () => {
			mockRequest = {
				params: {
					id: insertedData.users[0].user_id.toString()
				}
			};

			await userController.getUserById(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.username).toBe("admin");
		});

		it("should return 404 for non-existent user", async () => {
			mockRequest = {
				params: {
					id: "999"
				}
			};

			await userController.getUserById(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(404);
		});
	});

	describe("getAllUsers", () => {
		it("should return a paginated envelope of human users", async () => {
			mockRequest = {};

			await userController.getAllUsers(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];

			// The endpoint has returned `{ data, total, page, pageSize }` since
			// Phase 6 — the old `Array.isArray` assertion was stale.
			expect(Array.isArray(response.data)).toBeTrue();
			expect(response.total).toBeGreaterThan(0);
			expect(response.total).toBe(response.data.length);
			expect(response.data.some((u: any) => u.username === "system")).toBeFalse();
		});

		it("should filter by roleId", async () => {
			mockRequest = {
				query: { roleId: String(insertedData.roles[0].role_id) }
			};

			await userController.getAllUsers(mockRequest, mockResponse);

			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(
				response.data.every(
					(u: any) => u.role_id === insertedData.roles[0].role_id
				)
			).toBeTrue();
		});

		it("should accept the snake_case role_id alias", async () => {
			mockRequest = {
				query: { role_id: String(insertedData.roles[0].role_id) }
			};

			await userController.getAllUsers(mockRequest, mockResponse);

			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.data.length).toBeGreaterThan(0);
		});

		it("should reject a non-numeric roleId", async () => {
			mockRequest = { query: { roleId: "abc" } };

			await userController.getAllUsers(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Invalid roleId"
			});
		});

		it("should pass sort and order through", async () => {
			mockRequest = { query: { sort: "createdAt", order: "desc" } };

			await userController.getAllUsers(mockRequest, mockResponse);

			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.data.length).toBeGreaterThan(0);
		});
	});

	describe("updateUser guards", () => {
		it("should reject changing your own role", async () => {
			const admin = insertedData.users.find((u) => u.username === "admin")!;

			mockRequest = {
				params: { id: String(admin.user_id) },
				user: { userId: admin.user_id, role: "Admin" },
				body: { role_id: insertedData.roles[1].role_id }
			};

			await userController.updateUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "You cannot change your own role",
				code: "CANNOT_CHANGE_OWN_ROLE"
			});
		});

		it("should reject deactivating your own account", async () => {
			const admin = insertedData.users.find((u) => u.username === "admin")!;

			mockRequest = {
				params: { id: String(admin.user_id) },
				user: { userId: admin.user_id, role: "Admin" },
				body: { is_active: false }
			};

			await userController.updateUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "You cannot deactivate your own account",
				code: "CANNOT_DEACTIVATE_SELF"
			});
		});

		it("should reject a non-privileged caller changing is_active", async () => {
			const plain = insertedData.users.find((u) => u.username === "user")!;
			const other = insertedData.users.find((u) => u.username === "limited")!;

			mockRequest = {
				params: { id: String(other.user_id) },
				user: { userId: plain.user_id, role: "User" },
				body: { is_active: false }
			};

			await userController.updateUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Only administrators can change account status",
				code: "ADMIN_ONLY_FIELD"
			});
		});

		it("should reject modifying a system account", async () => {
			const admin = insertedData.users.find((u) => u.username === "admin")!;
			const system = insertedData.users.find((u) => u.username === "system")!;

			mockRequest = {
				params: { id: String(system.user_id) },
				user: { userId: admin.user_id, role: "Admin" },
				body: { username: "renamed" }
			};

			await userController.updateUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "System accounts cannot be modified",
				code: "SYSTEM_ACCOUNT_PROTECTED"
			});
		});

		it("should allow an admin to deactivate another user", async () => {
			const admin = insertedData.users.find((u) => u.username === "admin")!;
			const plain = insertedData.users.find((u) => u.username === "user")!;

			mockRequest = {
				params: { id: String(plain.user_id) },
				user: { userId: admin.user_id, role: "Admin" },
				body: { is_active: false }
			};

			await userController.updateUser(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const updated = mockResponse.json.calls.mostRecent().args[0];
			expect(updated.is_active).toBeFalse();
		});
	});

	describe("deleteUser guards", () => {
		it("should reject deleting your own account", async () => {
			const admin = insertedData.users.find((u) => u.username === "admin")!;

			mockRequest = {
				params: { id: String(admin.user_id) },
				user: { userId: admin.user_id, role: "Admin" }
			};

			await userController.deleteUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "You cannot delete your own account",
				code: "CANNOT_DELETE_SELF"
			});
		});

		it("should reject deleting a system account", async () => {
			const admin = insertedData.users.find((u) => u.username === "admin")!;
			const system = insertedData.users.find((u) => u.username === "system")!;

			mockRequest = {
				params: { id: String(system.user_id) },
				user: { userId: admin.user_id, role: "Admin" }
			};

			await userController.deleteUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "System accounts cannot be modified",
				code: "SYSTEM_ACCOUNT_PROTECTED"
			});
		});

		it("should map a foreign-key violation to 409 USER_IN_USE", async () => {
			const admin = insertedData.users.find((u) => u.username === "admin")!;
			const plain = insertedData.users.find((u) => u.username === "user")!;

			// Simulate Postgres 23503 without needing a referencing table.
			spyOn(userModel, "deleteUser").and.rejectWith(
				Object.assign(new Error("violates foreign key constraint"), {
					code: "23503"
				})
			);

			mockRequest = {
				params: { id: String(plain.user_id) },
				user: { userId: admin.user_id, role: "Admin" }
			};

			await userController.deleteUser(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(409);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "This user is referenced by other records and cannot be deleted",
				code: "USER_IN_USE"
			});
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
