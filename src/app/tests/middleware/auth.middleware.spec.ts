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

	describe("verifyToken", () => {
		it("should pass valid token", () => {
			const token = jwt.sign(
				{ userId: 1, username: "test", role: "Admin", permissions: [] },
				process.env.JWT_SECRET || "your-secret-key"
			);

			mockRequest = {
				headers: {
					authorization: `Bearer ${token}`
				},
				cookies: {
					"auth": token
				}
			};

			verifyToken(mockRequest, mockResponse, nextFunction);

			expect(nextFunction).toHaveBeenCalled();
			expect(mockRequest.user).toBeDefined();
			expect(mockRequest.user.username).toBe("test");
		});

		it("should reject missing token", () => {
			mockRequest = {
				headers: {},
				cookies: {}
			};

			verifyToken(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "No token provided"
			});
		});

		it("should reject invalid token", () => {
			mockRequest = {
				headers: {
					authorization: "Bearer invalid_token"
				},
				cookies: {
					auth: "invalid_token"
				}
			};

			verifyToken(mockRequest, mockResponse, nextFunction);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.status().json).toHaveBeenCalledWith({
				error: "Invalid token"
			});
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

		it("should reject non-admin access", () => {
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
