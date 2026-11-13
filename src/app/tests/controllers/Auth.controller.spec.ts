// src/app/tests/controllers/Auth.controller.spec.ts
import { AuthController } from "../../controllers/Auth.controller.js";
import { dbHelper } from "../helpers/db.helper.js";
import { query } from "../../models/database/connection.js";
import jwt from "jsonwebtoken";

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

		it("should return 403 for a deactivated account", async () => {
			// Correct credentials on a disabled account must not be reported as
			// bad credentials — the user needs to know why they cannot get in.
			await query(
				'UPDATE "User" SET is_active = FALSE WHERE username = $1',
				["admin"]
			);

			mockRequest = {
				body: { username: "admin", password: "admin_hash" }
			};

			await authController.login(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Account is deactivated",
				code: "ACCOUNT_DEACTIVATED"
			});
		});

		it("should stamp last_login on a successful login", async () => {
			mockRequest = {
				body: { username: "admin", password: "admin_hash" }
			};

			await authController.login(mockRequest, mockResponse);

			const rows = await query(
				'SELECT last_login FROM "User" WHERE username = $1',
				["admin"]
			);
			expect(rows.rows[0].last_login).not.toBeNull();
		});
	});

	describe("verifyToken", () => {
		const sign = (payload: Record<string, unknown>) =>
			jwt.sign(payload, process.env.JWT_SECRET || "your-secret-key");

		const withBearer = (token: string) => ({
			headers: { authorization: `Bearer ${token}` },
			cookies: {}
		});

		it("should report a live, active session", async () => {
			const users = await query(
				'SELECT user_id FROM "User" WHERE username = $1',
				["admin"]
			);
			const token = sign({
				userId: users.rows[0].user_id,
				username: "admin",
				role: "Stale",
				permissions: []
			});

			mockRequest = withBearer(token);
			await authController.verifyToken(mockRequest, mockResponse);

			const response = mockResponse.json.calls.mostRecent().args[0];
			expect(response.valid).toBeTrue();
			expect(response.user.role).toBe("Admin");
		});

		it("should reject a deactivated session", async () => {
			const users = await query(
				'SELECT user_id FROM "User" WHERE username = $1',
				["admin"]
			);
			await query(
				'UPDATE "User" SET is_active = FALSE WHERE user_id = $1',
				[users.rows[0].user_id]
			);

			mockRequest = withBearer(
				sign({ userId: users.rows[0].user_id, role: "Admin", permissions: [] })
			);
			await authController.verifyToken(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Account is deactivated",
				code: "ACCOUNT_DEACTIVATED"
			});
		});

		it("should reject a deleted account", async () => {
			mockRequest = withBearer(
				sign({ userId: 999999, role: "Admin", permissions: [] })
			);

			await authController.verifyToken(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "User no longer exists"
			});
		});

		it("should reject a missing token", async () => {
			mockRequest = { headers: {}, cookies: {} };

			await authController.verifyToken(mockRequest, mockResponse);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
