// src/app/tests/controllers/Auth.controller.spec.ts
import { AuthController } from "../../controllers/Auth.controller.js";
import { dbHelper } from "../helpers/db.helper.js";

describe("AuthController", () => {
	let authController: AuthController;
	let mockRequest: any;
	let mockResponse: any;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		authController = new AuthController();
		await dbHelper.clearDatabase();
		await dbHelper.seedDatabase();

		mockResponse = {
			status: jasmine.createSpy("status").and.returnValue({
				json: jasmine.createSpy("json")
			}),
			cookie: jasmine.createSpy("cookie").and.returnValue({
				json: jasmine.createSpy("json")
			}),
			json: jasmine.createSpy("json")
		};
	});

	describe("login", () => {
		it("should return token for valid credentials", async () => {
			// Arrange
			mockRequest = {
				body: {
					username: "admin",
					password: "admin_hash"
				}
			};

			// Act
			await authController.login(mockRequest, mockResponse);

			// Assert
			expect(mockResponse.cookie().json).toHaveBeenCalled();
			const response = mockResponse.cookie().json.calls.mostRecent().args[0];
			expect(response.token).toBeDefined();
			expect(response.user).toBeDefined();
			expect(response.user.username).toBe("admin");
		});

		it("should return 400 for missing credentials", async () => {
			// Arrange
			mockRequest = {
				body: {}
			};

			// Act
			await authController.login(mockRequest, mockResponse);

			// Assert
			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Username and password are required"
			});
		});

		it("should return 401 for invalid credentials", async () => {
			// Arrange
			mockRequest = {
				body: {
					username: "admin",
					password: "wrong_password"
				}
			};

			// Act
			await authController.login(mockRequest, mockResponse);

			// Assert
			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Invalid username or password"
			});
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
