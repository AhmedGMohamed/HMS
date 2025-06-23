// src/app/tests/models/Role.model.spec.ts
import { RoleModel } from "../../models/Role.model.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

describe("RoleModel", () => {
	let roleModel: RoleModel;
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		roleModel = new RoleModel();
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("createRole", () => {
		it("should create a role without permissions", async () => {
			const roleData = {
				name: "Test Role",
				permissions: []
			};

			const result = await roleModel.createRole(roleData);

			expect(result.name).toBe(roleData.name);
			expect(result.permissions).toEqual([]);
		});

		it("should create a role with permissions", async () => {
			const roleData = {
				name: "Test Role",
				permissions: [insertedData.permissions[0].permission_id]
			};

			const result = await roleModel.createRole(roleData);

			expect(result.name).toBe(roleData.name);
			expect(result.permissions.length).toBe(1);
			expect(result.permissions[0].permission_id).toBe(
				insertedData.permissions[0].permission_id
			);
		});

		it("should reject duplicate role name", async () => {
			const roleData = {
				name: "Admin", // Using existing role name from seed data
				permissions: []
			};

			await expectAsync(
				roleModel.createRole(roleData)
			).toBeRejectedWithError("Role name already exists");
		});

		it("should reject invalid permission IDs", async () => {
			const roleData = {
				name: "Test Role",
				permissions: [999] // Non-existent permission ID
			};

			await expectAsync(
				roleModel.createRole(roleData)
			).toBeRejectedWithError("One or more invalid permission IDs");
		});
	});

	describe("updateRole", () => {
		it("should update role name", async () => {
			const updateData = {
				role_id: insertedData.roles[1].role_id,
				name: "Updated Role"
			};

			const result = await roleModel.updateRole(updateData);

			expect(result.name).toBe(updateData.name);
		});

		it("should add permissions to role", async () => {
			const updateData = {
				role_id: insertedData.roles[1].role_id,
				permissions: {
					add: [insertedData.permissions[0].permission_id]
				}
			};

			const result = await roleModel.updateRole(updateData);

			expect(result.permissions).toContain(
				jasmine.objectContaining({
					permission_id: insertedData.permissions[0].permission_id
				})
			);
		});

		it("should remove permissions from role", async () => {
			// First add a permission
			await roleModel.updateRole({
				role_id: insertedData.roles[1].role_id,
				permissions: {
					add: [insertedData.permissions[0].permission_id]
				}
			});

			// Then remove it
			const updateData = {
				role_id: insertedData.roles[1].role_id,
				permissions: {
					remove: [insertedData.permissions[0].permission_id]
				}
			};

			const result = await roleModel.updateRole(updateData);

			expect(result.permissions).not.toContain(
				jasmine.objectContaining({
					permission_id: insertedData.permissions[0].permission_id
				})
			);
		});

		it("should reject non-existent role", async () => {
			const updateData = {
				role_id: 999,
				name: "Updated Role"
			};

			await expectAsync(
				roleModel.updateRole(updateData)
			).toBeRejectedWithError("Role not found");
		});

		it("should reject duplicate role name", async () => {
			const updateData = {
				role_id: insertedData.roles[1].role_id,
				name: "Admin" // Existing name from seed data
			};

			await expectAsync(
				roleModel.updateRole(updateData)
			).toBeRejectedWithError("Role name already exists");
		});
	});

	describe("deleteRole", () => {
		it("should delete role with no users", async () => {
			// Create a new role that won't have any users
			const newRole = await roleModel.createRole({
				name: "To Delete",
				permissions: []
			});

			await roleModel.deleteRole(newRole.role_id);

			const deletedRole = await roleModel.getRoleById(newRole.role_id);
			expect(deletedRole).toBeNull();
		});

		it("should reject deleting role assigned to users", async () => {
			// Try to delete Admin role which has users
			await expectAsync(
				roleModel.deleteRole(insertedData.roles[0].role_id)
			).toBeRejectedWithError(
				"Cannot delete role: role is assigned to users"
			);
		});

		it("should reject deleting non-existent role", async () => {
			await expectAsync(roleModel.deleteRole(999)).toBeRejectedWithError(
				"Role not found"
			);
		});
	});

	describe("getRoleById", () => {
		it("should return role with permissions", async () => {
			const role = await roleModel.getRoleById(
				insertedData.roles[0].role_id
			);

			expect(role).not.toBeNull();
			expect(role?.name).toBe("Admin");
			expect(Array.isArray(role?.permissions)).toBeTrue();
		});

		it("should return null for non-existent role", async () => {
			const role = await roleModel.getRoleById(999);
			expect(role).toBeNull();
		});
	});

	describe("getAllRoles", () => {
		it("should return all roles with permissions", async () => {
			const roles = await roleModel.getAllRoles();

			expect(roles.length).toBeGreaterThan(0);
			expect(Array.isArray(roles[0].permissions)).toBeTrue();
		});

		it("should handle roles with no permissions", async () => {
			// Create a new role with no permissions
			await roleModel.createRole({
				name: "No Permissions Role",
				permissions: []
			});

			const roles = await roleModel.getAllRoles();
			const noPermRole = roles.find(
				(r) => r.name === "No Permissions Role"
			);

			expect(noPermRole).toBeDefined();
			expect(noPermRole?.permissions).toEqual([]);
		});
	});

	describe("assignPermissionsToRole", () => {
		it("should assign new permissions to role", async () => {
			const limitedUserRoleId = insertedData.roles.find(
				(r) => r.name === "Limited User"
			)!.role_id; // Limited user role
			const limitedUserPermissionIds = [
				insertedData.permissions.find(
					(p) => p.feature_name === "view_only"
				)!.permission_id
			];
			const assignData = {
				role_id: limitedUserRoleId,
				permission_ids: limitedUserPermissionIds
			};

			const result = await roleModel.assignPermissionsToRole(assignData);

			expect(result.length).toBeGreaterThan(0);
			expect(
				result.some((p) => p.permission_id === limitedUserPermissionIds[0])
			).toBeTrue();
		});

		it("should handle duplicate permission assignments", async () => {
			// First assignment
			const limitedUserRoleId = insertedData.roles.find(
				(r) => r.name === "Limited User"
			)!.role_id; // Limited user role
			const limitedUserPermissionIds = [
				insertedData.permissions.find(
					(p) => p.feature_name === "view_only"
				)!.permission_id
			];
			const assignData = {
				role_id: limitedUserRoleId,
				permission_ids: limitedUserPermissionIds
			};
			await roleModel.assignPermissionsToRole(assignData);

			// Second assignment of same permission
			const result = await roleModel.assignPermissionsToRole(assignData);

			// Should not duplicate the permission
			expect(
				result.filter(
					(p) => p.permission_id === assignData.permission_ids[0]
				).length
			).toBe(1);
		});

		it("should reject non-existent role", async () => {
			const assignData = {
				role_id: 999,
				permission_ids: [1]
			};

			await expectAsync(
				roleModel.assignPermissionsToRole(assignData)
			).toBeRejectedWithError("Role not found");
		});

		it("should reject invalid permission IDs", async () => {
			const assignData = {
				role_id: insertedData.roles[1].role_id,
				permission_ids: [999]
			};

			await expectAsync(
				roleModel.assignPermissionsToRole(assignData)
			).toBeRejectedWithError("One or more invalid permission IDs");
		});
	});

	describe("removePermissionsFromRole", () => {
		it("should remove permissions from role", async () => {
			const removeData = {
				role_id: insertedData.roles.find((r) => r.name === "Admin")!
					.role_id, // Admin role
				permission_ids: [insertedData.permissions[0].permission_id]
			};

			await roleModel.removePermissionsFromRole(removeData);

			// Verify permission was removed
			const hasPermission = await roleModel.checkPermission(
				removeData.role_id,
				insertedData.permissions[0].feature_name
			);
			expect(hasPermission).toBeFalse();
		});

		it("should handle removing non-assigned permissions", async () => {
			const removeData = {
				role_id: insertedData.roles.find((r) => r.name === "User")!.role_id, // Regular user role
				permission_ids: [insertedData.permissions.find((p) => p.feature_name === "view_only")!.permission_id]
			};

			// Should not throw error
			await expectAsync(
				roleModel.removePermissionsFromRole(removeData)
			).toBeResolved();
		});

		it("should reject non-existent role", async () => {
			const removeData = {
				role_id: 999,
				permission_ids: [1]
			};

			await expectAsync(
				roleModel.removePermissionsFromRole(removeData)
			).toBeRejectedWithError("Role not found");
		});
	});

	describe("syncRolePermissions", () => {
		it("should sync new permissions to role", async () => {
			const syncData = {
				role_id: insertedData.roles[1].role_id,
				permission_ids: [
					insertedData.permissions[0].permission_id,
					insertedData.permissions[1].permission_id
				]
			};

			const result = await roleModel.syncRolePermissions(syncData);

			expect(result.length).toBe(2);
			expect(result.map((p) => p.permission_id)).toEqual(
				syncData.permission_ids
			);
		});

		it("should remove existing permissions not in sync list", async () => {
			// First sync with multiple permissions
			await roleModel.syncRolePermissions({
				role_id: insertedData.roles[1].role_id,
				permission_ids: [
					insertedData.permissions[0].permission_id,
					insertedData.permissions[1].permission_id
				]
			});

			// Then sync with fewer permissions
			const result = await roleModel.syncRolePermissions({
				role_id: insertedData.roles[1].role_id,
				permission_ids: [insertedData.permissions[0].permission_id]
			});

			expect(result.length).toBe(1);
			expect(result[0].permission_id).toBe(
				insertedData.permissions[0].permission_id
			);
		});

		it("should handle empty permission list", async () => {
			const result = await roleModel.syncRolePermissions({
				role_id: insertedData.roles[1].role_id,
				permission_ids: []
			});

			expect(result.length).toBe(0);
		});

		it("should reject non-existent role", async () => {
			const syncData = {
				role_id: 999,
				permission_ids: [1]
			};

			await expectAsync(
				roleModel.syncRolePermissions(syncData)
			).toBeRejectedWithError("Role not found");
		});

		it("should reject invalid permission IDs", async () => {
			const syncData = {
				role_id: insertedData.roles[1].role_id,
				permission_ids: [999]
			};

			await expectAsync(
				roleModel.syncRolePermissions(syncData)
			).toBeRejectedWithError("One or more invalid permission IDs");
		});
	});

	describe("checkPermission", () => {
		it("should return true for assigned permission", async () => {
			const result = await roleModel.checkPermission(
				insertedData.roles.find((r) => r.name === "Admin")!.role_id,
				insertedData.permissions[0].feature_name
			);

			expect(result).toBeTrue();
		});

		it("should return false for unassigned permission", async () => {
			const result = await roleModel.checkPermission(
				insertedData.roles.find((r) => r.name === "Limited User")!.role_id, // Limited role
				insertedData.permissions[0].feature_name
			);

			expect(result).toBeFalse();
		});
	});

	describe("checkPermissions", () => {
		it("should return true when role has all permissions", async () => {
			const result = await roleModel.checkPermissions(
				insertedData.roles.find((r) => r.name === "Admin")!.role_id,
				[
					insertedData.permissions[0].feature_name,
					insertedData.permissions[1].feature_name
				]
			);

			expect(result).toBeTrue();
		});

		it("should return false when role lacks some permissions", async () => {
			const result = await roleModel.checkPermissions(
				insertedData.roles.find((r) => r.name === "Limited User")!.role_id,
				[
					insertedData.permissions[0].feature_name,
					insertedData.permissions[1].feature_name
				]
			);

			expect(result).toBeFalse();
		});

		it("should return true for empty permission list", async () => {
			const result = await roleModel.checkPermissions(
				insertedData.roles.find((r) => r.name === "Limited User")!.role_id,
				[]
			);

			expect(result).toBeTrue();
		});
	});

	afterEach(async () => {
		await dbHelper.clearDatabase();
	});
});
