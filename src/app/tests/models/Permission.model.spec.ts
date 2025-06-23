// src/app/tests/models/Permission.model.spec.ts
import { PermissionModel } from "../../models/Permission.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("PermissionModel", () => {
	let permissionModel: PermissionModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		permissionModel = new PermissionModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("createPermission", () => {
		it("should create a permission with all fields", async () => {
			const permissionData = {
				feature_name: "test_feature",
				description: "Test feature description"
			};

			const result = await permissionModel.createPermission(
				permissionData
			);

			expect(result.feature_name).toBe(permissionData.feature_name);
			expect(result.description).toBe(permissionData.description);
		});

		it("should create a permission without description", async () => {
			const permissionData = {
				feature_name: "test_feature"
			};

			const result = await permissionModel.createPermission(
				permissionData
			);

			expect(result.feature_name).toBe(permissionData.feature_name);
			expect(result.description).toBeNull();
		});

		it("should reject duplicate feature names", async () => {
			const permissionData = {
				feature_name: insertedData.permissions[0].feature_name // Using existing feature name
			};

			await expectAsync(
				permissionModel.createPermission(permissionData)
			).toBeRejectedWithError("Permission feature name already exists");
		});

		it("should reject duplicate feature names regardless of case", async () => {
			const permissionData = {
				feature_name:
					insertedData.permissions[0].feature_name.toUpperCase()
			};

			await expectAsync(
				permissionModel.createPermission(permissionData)
			).toBeRejectedWithError("Permission feature name already exists");
		});
	});

	describe("updatePermission", () => {
		it("should update permission feature name", async () => {
			const updateData = {
				permission_id: insertedData.permissions[0].permission_id,
				feature_name: "updated_feature"
			};

			const result = await permissionModel.updatePermission(updateData);

			expect(result.feature_name).toBe(updateData.feature_name);
		});

		it("should update permission description", async () => {
			const updateData = {
				permission_id: insertedData.permissions[0].permission_id,
				description: "Updated description"
			};

			const result = await permissionModel.updatePermission(updateData);

			expect(result.description).toBe(updateData.description);
		});

		it("should allow setting description to null", async () => {
			const updateData = {
				permission_id: insertedData.permissions[0].permission_id,
				description: null
			};

			const result = await permissionModel.updatePermission(updateData);

			expect(result.description).toBeNull();
		});

		it("should reject non-existent permission", async () => {
			const updateData = {
				permission_id: 999,
				feature_name: "updated_feature"
			};

			await expectAsync(
				permissionModel.updatePermission(updateData)
			).toBeRejectedWithError("Permission not found");
		});

		it("should reject duplicate feature names", async () => {
			const updateData = {
				permission_id: insertedData.permissions[1].permission_id,
				feature_name: insertedData.permissions[0].feature_name
			};

			await expectAsync(
				permissionModel.updatePermission(updateData)
			).toBeRejectedWithError("Permission feature name already exists");
		});

		it("should reject empty updates", async () => {
			const updateData = {
				permission_id: insertedData.permissions[0].permission_id
			};

			await expectAsync(
				permissionModel.updatePermission(updateData)
			).toBeRejectedWithError("No updates provided");
		});
	});

	describe("deletePermission", () => {
		it("should delete unused permission", async () => {
			// Create a new permission that won't be assigned to any roles
			const newPermission = await permissionModel.createPermission({
				feature_name: "to_delete"
			});

			await permissionModel.deletePermission(newPermission.permission_id);

			const deletedPermission = await permissionModel.getPermissionById(
				newPermission.permission_id
			);
			
			expect(deletedPermission).toBeNull();
			expect(
				await permissionModel.getPermissionById(
					newPermission.permission_id
				)
			).toBeNull();
		});

		it("should reject deleting permission assigned to roles", async () => {
			// Try to delete a permission that's assigned to the Admin role
			await expectAsync(
				permissionModel.deletePermission(
					insertedData.permissions[0].permission_id
				)
			).toBeRejectedWithError(
				"Cannot delete permission: it is assigned to roles"
			);
		});

		it("should reject deleting non-existent permission", async () => {
			await expectAsync(
				permissionModel.deletePermission(999)
			).toBeRejectedWithError("Permission not found");
		});
	});

	describe("getPermissionById", () => {
		it("should return existing permission", async () => {
			const permission = await permissionModel.getPermissionById(
				insertedData.permissions[0].permission_id
			);

			expect(permission).not.toBeNull();
			expect(permission?.feature_name).toBe(
				insertedData.permissions[0].feature_name
			);
		});

		it("should return null for non-existent permission", async () => {
			const permission = await permissionModel.getPermissionById(999);
			expect(permission).toBeNull();
		});
	});

	describe("getAllPermissions", () => {
		it("should return all permissions ordered by feature name", async () => {
			const permissions = await permissionModel.getAllPermissions();

			expect(permissions.length).toBeGreaterThan(0);
			// Verify ordering
			const sortedNames = [...permissions].sort((a, b) =>
				a.feature_name.localeCompare(b.feature_name)
			);
			expect(permissions).toEqual(sortedNames);
		});
	});

	describe("getPermissionsByRole", () => {
		it("should return all permissions for admin role", async () => {
			const permissions = await permissionModel.getPermissionsByRole(
				insertedData.roles[0].role_id // Admin role
			);

			expect(permissions.length).toBeGreaterThan(0);
			// Admin should have all permissions
			expect(permissions.length).toBe(insertedData.permissions.length);
		});

		it("should return limited permissions for regular role", async () => {
			const permissions = await permissionModel.getPermissionsByRole(
				insertedData.roles[1].role_id // Regular user role
			);

			expect(permissions.length).toBeLessThan(
				insertedData.permissions.length
			);
		});

		it("should return empty array for role with no permissions", async () => {
			const permissions = await permissionModel.getPermissionsByRole(
				insertedData.roles[2].role_id // Limited role
			);

			expect(permissions.length).toBe(0);
		});
	});

	describe("getUnassignedPermissions", () => {
		it("should return empty array for admin role", async () => {
			const permissions = await permissionModel.getUnassignedPermissions(
				insertedData.roles[0].role_id // Admin role
			);

			expect(permissions.length).toBe(0);
		});

		it("should return some permissions for regular role", async () => {
			const permissions = await permissionModel.getUnassignedPermissions(
				insertedData.roles[1].role_id // Regular user role
			);

			expect(permissions.length).toBeGreaterThan(0);
		});

		it("should return all permissions for role with no permissions", async () => {
			const permissions = await permissionModel.getUnassignedPermissions(
				insertedData.roles[2].role_id // Limited role
			);

			expect(permissions.length).toBe(insertedData.permissions.length);
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
