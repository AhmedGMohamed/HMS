// src/app/tests/middleware/auth.middleware.spec.ts
import jwt from "jsonwebtoken";
import {
	verifyToken,
	checkPermission,
	checkRole,
	checkSelfOrAdmin,
	adminOnly,
	checkPermissions
} from "../../middleware/auth.middleware.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";
import { query } from "../../models/database/connection.js";
import dotenv from "dotenv";

dotenv.config();
describe("Auth Middleware", () => {
	let mockRequest: any;
	let mockResponse: any;
	let nextFunction: jasmine.Spy;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	})

	beforeEach(() => {
		mockResponse = {
			status: jasmine.createSpy("status").and.returnValue({
				json: jasmine.createSpy("json")
			})
		};
		nextFunction = jasmine.createSpy("next");
	});

	/**
	 * `verifyToken` re-reads the account on every request, so these cases need
	 * real rows. The old version signed `userId: 1` with no database and called
	 * the middleware synchronously — that only worked while it trusted the claim.
	 */
	describe("verifyToken", () => {
		let seeded: TestData;

		const sign = (payload: Record<string, unknown>) =>
			jwt.sign(payload, process.env.JWT_SECRET || "your-secret-key");

		const withBearer = (token: string) => ({
			headers: { authorization: `Bearer ${token}` },
			cookies: {}
		});

		beforeEach(async () => {
			await dbHelper.clearDatabase();
			seeded = await dbHelper.seedDatabase();
		});

		afterEach(async () => {
			await dbHelper.clearDatabase();
		});

		it("should pass a valid token and hydrate the live role", async () => {
			const admin = seeded.users.find((u) => u.username === "admin")!;
			const token = sign({
				userId: admin.user_id,
				username: "stale-name",
				role: "Wrong Role",
				permissions: []
			});

			mockRequest = withBearer(token);
			await verifyToken(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
			expect(mockRequest.user).toBeDefined();
			// The role comes from the database, not the (stale) token claim.
			expect(mockRequest.user.role).toBe("Admin");
		});

		it("should accept the cookie as well as the bearer header", async () => {
			const admin = seeded.users.find((u) => u.username === "admin")!;
			const token = sign({ userId: admin.user_id, role: "Admin", permissions: [] });

			mockRequest = { headers: {}, cookies: { auth: token } };
			await verifyToken(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should reject missing token", async () => {
			mockRequest = { headers: {}, cookies: {} };

			await verifyToken(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "No token provided"
			});
		});

		it("should reject invalid token", async () => {
			mockRequest = withBearer("invalid_token");

			await verifyToken(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Invalid token"
			});
		});

		it("should report an expired token as expired, not invalid", async () => {
			// TokenExpiredError extends JsonWebTokenError, so the branch order
			// matters — this is the regression guard for that.
			const admin = seeded.users.find((u) => u.username === "admin")!;
			const token = jwt.sign(
				{ userId: admin.user_id, role: "Admin", permissions: [] },
				process.env.JWT_SECRET || "your-secret-key",
				{ expiresIn: -10 }
			);

			mockRequest = withBearer(token);
			await verifyToken(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Token expired"
			});
		});

		it("should reject a token whose account no longer exists", async () => {
			const token = sign({ userId: 999999, role: "Admin", permissions: [] });

			mockRequest = withBearer(token);
			await verifyToken(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "User no longer exists"
			});
		});

		it("should reject a deactivated account", async () => {
			const plain = seeded.users.find((u) => u.username === "user")!;
			await query('UPDATE "User" SET is_active = FALSE WHERE user_id = $1', [
				plain.user_id
			]);

			const token = sign({
				userId: plain.user_id,
				role: "User",
				permissions: []
			});

			mockRequest = withBearer(token);
			await verifyToken(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Account is deactivated",
				code: "ACCOUNT_DEACTIVATED"
			});
			expect(nextFunction).not.toHaveBeenCalled();
		});
	});

	describe("checkPermission", () => {
		const middleware = checkPermission("test_permission");

		it("should allow admin regardless of permission", () => {
			mockRequest = {
				user: {
					role: "Admin",
					permissions: []
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should allow user with required permission", () => {
			mockRequest = {
				user: {
					role: "User",
					permissions: ["test_permission"]
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should reject user without required permission", () => {
			mockRequest = {
				user: {
					role: "User",
					permissions: ["other_permission"]
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
		});
	});

	describe("checkRole", () => {
		const middleware = checkRole(["Admin", "Manager"]);

		it("should allow user with permitted role", () => {
			mockRequest = {
				user: {
					role: "Admin"
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should reject user with unpermitted role", () => {
			mockRequest = {
				user: {
					role: "User"
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
		});
	});

	describe("checkSelfOrAdmin", () => {
		it("should allow admin to access any user", () => {
			mockRequest = {
				user: {
					userId: 1,
					role: "Admin"
				},
				params: {
					id: "2"
				}
			};

			checkSelfOrAdmin(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should allow user to access own data", () => {
			mockRequest = {
				user: {
					userId: 1,
					role: "User"
				},
				params: {
					id: "1"
				}
			};

			checkSelfOrAdmin(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should allow the System role to access any user", () => {
			// Replaces the old `username == "system"` escape hatch.
			mockRequest = {
				user: {
					userId: 4,
					username: "system",
					role: "System"
				},
				params: {
					id: "2"
				}
			};

			checkSelfOrAdmin(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should no longer special-case the username 'system'", () => {
			// Without the System role the username earns nothing.
			mockRequest = {
				user: {
					userId: 4,
					username: "system",
					role: "User"
				},
				params: {
					id: "2"
				}
			};

			checkSelfOrAdmin(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
		});

		it("should reject user accessing other user data", () => {
			mockRequest = {
				user: {
					userId: 1,
					role: "User"
				},
				params: {
					id: "2"
				}
			};

			checkSelfOrAdmin(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
		});
	});

	describe("adminOnly", () => {
		it("should allow admin access", () => {
			mockRequest = {
				user: {
					role: "Admin"
				}
			};

			adminOnly(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should allow the automation (System) role", () => {
			// Cron jobs authenticate as the `system` account, which now holds the
			// System role rather than borrowing Admin.
			mockRequest = {
				user: {
					role: "System"
				}
			};

			adminOnly(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should reject non-privileged access", () => {
			mockRequest = {
				user: {
					role: "User"
				}
			};

			adminOnly(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
		});
	});

	describe("checkPermissions", () => {
		const middleware = checkPermissions(["permission1", "permission2"]);

		it("should allow admin regardless of permissions", () => {
			mockRequest = {
				user: {
					role: "Admin",
					permissions: []
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should allow user with all required permissions", () => {
			mockRequest = {
				user: {
					role: "User",
					permissions: ["permission1", "permission2"]
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
		});

		it("should reject user missing some required permissions", () => {
			mockRequest = {
				user: {
					role: "User",
					permissions: ["permission1"]
				}
			};

			middleware(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
		});
	});
});
