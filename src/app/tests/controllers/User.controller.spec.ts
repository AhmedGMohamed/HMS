// src/app/tests/controllers/User.controller.spec.ts
import { UserController } from "../../controllers/User.controller.js";
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
				json: jasmine.createSpy("json")
			}),
			json: jasmine.createSpy("json")
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
		it("should return all users", async () => {
			mockRequest = {};

			await userController.getAllUsers(mockRequest, mockResponse);

			expect(mockResponse.json).toHaveBeenCalled();
			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(Array.isArray(response)).toBeTrue();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
