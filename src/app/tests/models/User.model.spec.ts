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
		it("should return the human users with role info", async () => {
			const { rows, total } = await userModel.getAllUsers();

			expect(total).toBeGreaterThan(0);
			expect(rows.length).toBeGreaterThan(0);
			expect(rows[0].role_name).toBeDefined();
			expect(rows[0].password_hash).toBeUndefined();
		});

		it("should exclude system accounts from rows and total", async () => {
			const { rows, total } = await userModel.getAllUsers();

			expect(rows.some((u) => u.username === "system")).toBeFalse();
			expect(total).toBe(rows.length);
			expect(rows.every((u) => u.is_system === false)).toBeTrue();
		});

		it("should expose is_active and last_login", async () => {
			const { rows } = await userModel.getAllUsers();

			expect(rows[0].is_active).toBeTrue();
			expect(rows[0].last_login).toBeNull();
		});

		it("should filter by roleId", async () => {
			const roles = insertedData.roles;
			const adminRoleId = roles.find((r) => r.name === "Admin")!.role_id;

			const { rows, total } = await userModel.getAllUsers({
				roleId: adminRoleId
			});

			expect(total).toBe(rows.length);
			expect(rows.every((u) => u.role_id === adminRoleId)).toBeTrue();
			expect(rows.some((u) => u.username === "admin")).toBeTrue();
		});

		it("should compose q with roleId", async () => {
			const roles = insertedData.roles;
			const adminRoleId = roles.find((r) => r.name === "Admin")!.role_id;

			const { rows } = await userModel.getAllUsers({
				roleId: adminRoleId,
				q: "adm"
			});

			expect(rows.length).toBe(1);
			expect(rows[0].username).toBe("admin");
		});

		it("should sort by username ascending by default", async () => {
			const { rows } = await userModel.getAllUsers();
			const names = rows.map((u) => u.username);

			expect(names).toEqual([...names].sort());
		});

		it("should sort by createdAt descending", async () => {
			const { rows } = await userModel.getAllUsers({
				sort: "createdAt",
				order: "desc"
			});

			expect(rows.length).toBeGreaterThan(0);
		});

		it("should fall back to username for an unknown sort column", async () => {
			const injected = await userModel.getAllUsers({
				sort: "username; DROP TABLE \"User\"",
				order: "asc"
			});
			const plain = await userModel.getAllUsers();

			// Identifier injection must not reach the query.
			expect(injected.rows.map((u) => u.username)).toEqual(
				plain.rows.map((u) => u.username)
			);
		});

		it("should honour limit and offset", async () => {
			const page1 = await userModel.getAllUsers({ limit: 1, offset: 0 });
			const page2 = await userModel.getAllUsers({ limit: 1, offset: 1 });

			expect(page1.rows.length).toBe(1);
			expect(page2.rows.length).toBe(1);
			expect(page1.rows[0].user_id).not.toBe(page2.rows[0].user_id);
		});
	});

	describe("getAuthState", () => {
		it("should return is_active and role_name for an existing user", async () => {
			const users = insertedData.users;
			const admin = users.find((u) => u.username === "admin")!;

			const state = await userModel.getAuthState(admin.user_id);

			expect(state).not.toBeNull();
			expect(state!.is_active).toBeTrue();
			expect(state!.role_name).toBe("Admin");
		});

		it("should return null for a non-existent user", async () => {
			expect(await userModel.getAuthState(999999)).toBeNull();
		});

		it("should report a deactivated account", async () => {
			const users = insertedData.users;
			const plain = users.find((u) => u.username === "user")!;

			await userModel.updateUser({ user_id: plain.user_id, is_active: false });
			const state = await userModel.getAuthState(plain.user_id);

			expect(state!.is_active).toBeFalse();
		});
	});

	describe("recordLogin", () => {
		it("should stamp last_login", async () => {
			const users = insertedData.users;
			const admin = users.find((u) => u.username === "admin")!;

			await userModel.recordLogin(admin.user_id);
			const refreshed = await userModel.getUserById(admin.user_id);

			expect(refreshed!.last_login).not.toBeNull();
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
