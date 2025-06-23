// src/app/tests/models/User.model.spec.ts
import { UserModel } from "../../models/User.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("UserModel", () => {
	let userModel: UserModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		userModel = new UserModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("authenticateUser", () => {
		it("should authenticate valid user credentials", async () => {
			// Arrange
			const username = "admin";
			const password = "admin_hash"; // This should match the seed data

			// Act
			const result = await userModel.authenticateUser(username, password);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.username).toBe(username);
			expect(result?.password_hash).toBeUndefined();
			expect(result?.role_name).toBe("Admin");
		});

		it("should return null for invalid username", async () => {
			const result = await userModel.authenticateUser(
				"nonexistent",
				"password"
			);
			expect(result).toBeNull();
		});

		it("should return null for invalid password", async () => {
			const result = await userModel.authenticateUser(
				"admin",
				"wrong_password"
			);
			expect(result).toBeNull();
		});
	});

	describe("getUserPermissions", () => {
		it("should return all permissions for admin user", async () => {
			// Arrange
			const adminRoleId = insertedData.roles.find((r) => r.name === "Admin")?.role_id;
			const adminUserId = insertedData.users.find(
				(u) => u.role_id === adminRoleId
			)!.user_id;
			
			// Act
			const permissions = await userModel.getUserPermissions(adminUserId);

			// Assert
			expect(permissions).toContain("manage_patients");
			expect(permissions).toContain("manage_services");
			expect(permissions).toContain("manage_billing");
			expect(permissions.length).toBeGreaterThan(0);
		});

		it("should return limited permissions for regular user", async () => {
			// Arrange
			const userRoleId = insertedData.roles.find(
				(r) => r.name === "User"
			)?.role_id;
			const regularUserId = insertedData.users.find(
				(u) => u.role_id === userRoleId
			)!.user_id;

			// Act
			const permissions = await userModel.getUserPermissions(
				regularUserId
			);

			// Assert
			expect(permissions).toContain("manage_patients");
			expect(permissions).not.toContain("manage_settings");
			expect(permissions.length).toBeLessThan(8); // Total number of permissions
		});

		it("should return empty array for user with no permissions", async () => {
			// Arrange
			const limitedUserId = insertedData.users[2].user_id;

			// Act
			const permissions = await userModel.getUserPermissions(
				limitedUserId
			);

			// Assert
			expect(permissions.length).toBe(0);
		});
	});

	describe("createUser", () => {
		it("should create a new user", async () => {
			const userData = {
				username: "newuser",
				password: "password123",
				role_id: insertedData.roles[0].role_id // Using regular user role from seed data
			};

			const result = await userModel.createUser(userData);

			expect(result.username).toBe(userData.username);
			expect(result.role_id).toBe(userData.role_id);
			expect(result.password_hash).toBeUndefined();
		});

		it("should reject duplicate username", async () => {
			const userData = {
				username: "admin", // Using existing username from seed data
				password: "password123",
				role_id: 2
			};

			await expectAsync(
				userModel.createUser(userData)
			).toBeRejectedWithError("Username already exists");
		});

		it("should reject invalid role_id", async () => {
			const userData = {
				username: "newuser",
				password: "password123",
				role_id: 999 // Non-existent role
			};

			await expectAsync(
				userModel.createUser(userData)
			).toBeRejectedWithError("Invalid role_id");
		});
	});

	describe("updateUser", () => {
		it("should update user details", async () => {
			const updateData = {
				user_id: insertedData.users[0].user_id,
				username: "updateduser"
			};

			const result = await userModel.updateUser(updateData);

			expect(result.username).toBe(updateData.username);
		});

		it("should update password", async () => {
			const updateData = {
				user_id: insertedData.users[0].user_id,
				password: "newpassword123"
			};

			const result = await userModel.updateUser(updateData);
			const user = await userModel.getUserById(result.user_id);
			const loggedInUser = await userModel.authenticateUser(user!.username, updateData.password);

			expect(user).not.toBeNull();
			expect(loggedInUser).not.toBeNull();
		});

		it("should reject non-existent user", async () => {
			const updateData = {
				user_id: 999,
				username: "updateduser"
			};

			await expectAsync(
				userModel.updateUser(updateData)
			).toBeRejectedWithError("User not found");
		});
	});

	describe("deleteUser", () => {
		it("should delete existing user", async () => {
			await userModel.deleteUser(insertedData.users[1].user_id);

			const deletedUser = await userModel.getUserById(
				insertedData.users[1].user_id
			);
			expect(deletedUser).toBeNull();
		});

		it("should reject deleting non-existent user", async () => {
			await expectAsync(userModel.deleteUser(999)).toBeRejectedWithError(
				"User not found"
			);
		});
	});

	describe("getUserById", () => {
		it("should return user with role info", async () => {
			const user = await userModel.getUserById(
				insertedData.users[0].user_id
			);

			expect(user).not.toBeNull();
			expect(user?.username).toBe("admin");
			expect(user?.role_name).toBe("Admin");
		});

		it("should return null for non-existent user", async () => {
			const user = await userModel.getUserById(999);
			expect(user).toBeNull();
		});
	});

	describe("getAllUsers", () => {
		it("should return all users with role info", async () => {
			const users = await userModel.getAllUsers();

			expect(users.length).toBeGreaterThan(0);
			expect(users[0].role_name).toBeDefined();
			expect(users[0].password_hash).toBeUndefined();
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
