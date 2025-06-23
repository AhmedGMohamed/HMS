// src/app/models/Role.model.ts
import { query } from "./database/connection.js";
import {
	Permission,
	RoleWithPermissions,
	CreateRoleDTO,
	UpdateRoleDTO,
	AssignPermissionsDTO
} from "../utils/types/users.js";

export class RoleModel {
	async createRole(roleData: CreateRoleDTO): Promise<RoleWithPermissions> {
		try {
			await query("BEGIN");

			// Check if role name already exists
			const existingRole = await query(
				"SELECT name FROM Role WHERE LOWER(name) = LOWER($1)",
				[roleData.name]
			);

			if (existingRole.rows.length > 0) {
				throw new Error("Role name already exists");
			}

			// Create the role
			const roleResult = await query(
				"INSERT INTO Role (name) VALUES ($1) RETURNING *",
				[roleData.name]
			);

			const role = roleResult.rows[0];

			// Add permissions if provided
			if (roleData.permissions && roleData.permissions.length > 0) {
				const params: any[] = [];

				// Verify all permissions exist
				const permissionsExist = await query(
					"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
					[roleData.permissions]
				);

				if (
					permissionsExist.rows.length !== roleData.permissions.length
				) {
					throw new Error("One or more invalid permission IDs");
				}

				const placeholders = roleData.permissions
					.map((_, idx) => {
						params.push(role.role_id, roleData.permissions[idx]);
						return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
					})
					.join(", ");

				const sql = `
						INSERT INTO RolePermission (role_id, permission_id)
						VALUES ${placeholders}`;

				await query(sql, params);
			}

			// Fetch role with permissions
			const result = await this.getRoleById(role.role_id);

			await query("COMMIT");
			return result!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async updateRole(roleData: UpdateRoleDTO): Promise<RoleWithPermissions> {
		try {
			await query("BEGIN");

			// Check if role exists
			const roleExists = await query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[roleData.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error("Role not found");
			}

			// Update role name if provided
			if (roleData.name) {
				// Check if new name conflicts with existing roles
				const nameExists = await query(
					"SELECT role_id FROM Role WHERE LOWER(name) = LOWER($1) AND role_id != $2",
					[roleData.name, roleData.role_id]
				);

				if (nameExists.rows.length > 0) {
					throw new Error("Role name already exists");
				}

				await query("UPDATE Role SET name = $1 WHERE role_id = $2", [
					roleData.name,
					roleData.role_id
				]);
			}

			// Update permissions if provided
			if (roleData.permissions) {
				if (
					roleData.permissions.add &&
					roleData.permissions.add.length > 0
				) {
					const params: any[] = [];

					// Verify new permissions exist
					const permissionsExist = await query(
						"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
						[roleData.permissions.add]
					);

					if (
						permissionsExist.rows.length !==
						roleData.permissions.add.length
					) {
						throw new Error("One or more invalid permission IDs");
					}

					// Add new permissions
					const placeholders = roleData.permissions.add
						.map((_, idx) => {
							params.push(
								roleData.role_id,
								roleData.permissions!.add![idx]
							);
							return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
						})
						.join(", ");

					await query(
						`
						INSERT INTO RolePermission (role_id, permission_id)
						VALUES ${placeholders}
						ON CONFLICT DO NOTHING
						`,
						params
					);
				}

				if (
					roleData.permissions.remove &&
					roleData.permissions.remove.length > 0
				) {
					// Remove permissions
					await query(
						"DELETE FROM RolePermission WHERE role_id = $1 AND permission_id = ANY($2)",
						[roleData.role_id, roleData.permissions.remove]
					);
				}
			}

			// Fetch updated role with permissions
			const result = await this.getRoleById(roleData.role_id);

			await query("COMMIT");
			return result!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async deleteRole(roleId: number): Promise<void> {
		try {
			await query("BEGIN");

			// Check if role is assigned to any users
			const usersWithRole = await query(
				'SELECT user_id FROM "User" WHERE role_id = $1',
				[roleId]
			);

			if (usersWithRole.rows.length > 0) {
				throw new Error(
					"Cannot delete role: role is assigned to users"
				);
			}

			// Delete role permissions
			await query("DELETE FROM RolePermission WHERE role_id = $1", [
				roleId
			]);

			// Delete role
			const result = await query(
				"DELETE FROM Role WHERE role_id = $1 RETURNING *",
				[roleId]
			);

			if (result.rows.length === 0) {
				throw new Error("Role not found");
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getRoleById(roleId: number): Promise<RoleWithPermissions | null> {
		try {
			const sql = `
                SELECT r.*,
                    json_agg(
                        json_build_object(
                            'permission_id', p.permission_id,
                            'feature_name', p.feature_name,
                            'description', p.description
                        )
                    ) as permissions
                FROM Role r
                LEFT JOIN RolePermission rp ON r.role_id = rp.role_id
                LEFT JOIN Permission p ON rp.permission_id = p.permission_id
                WHERE r.role_id = $1
                GROUP BY r.role_id;
            `;

			const result = await query(sql, [roleId]);

			if (result.rows.length === 0) {
				return null;
			}

			const role = result.rows[0];
			// Handle case where role has no permissions
			if (role.permissions[0].permission_id === null) {
				role.permissions = [];
			}

			return role;
		} catch (error) {
			throw error;
		}
	}

	async getAllRoles(): Promise<RoleWithPermissions[]> {
		try {
			const sql = `
                SELECT r.*,
                    json_agg(
                        json_build_object(
                            'permission_id', p.permission_id,
                            'feature_name', p.feature_name,
                            'description', p.description
                        )
                    ) as permissions
                FROM Role r
                LEFT JOIN RolePermission rp ON r.role_id = rp.role_id
                LEFT JOIN Permission p ON rp.permission_id = p.permission_id
                GROUP BY r.role_id
                ORDER BY r.name;
            `;

			const result = await query(sql);

			// Handle cases where roles have no permissions
			return result.rows.map((role) => {
				if (role.permissions[0].permission_id === null) {
					role.permissions = [];
				}
				return role;
			});
		} catch (error) {
			throw error;
		}
	}

	async assignPermissionsToRole(
		data: AssignPermissionsDTO
	): Promise<Permission[]> {
		try {
			await query("BEGIN");

			// Verify role exists
			const roleExists = await query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[data.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error("Role not found");
			}

			// Verify all permissions exist
			const permissionsExist = await query(
				"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
				[data.permission_ids]
			);

			if (permissionsExist.rows.length !== data.permission_ids.length) {
				throw new Error("One or more invalid permission IDs");
			}

			// Create role-permission associations
			const values = data.permission_ids
				.map((permissionId) => `(${data.role_id}, ${permissionId})`)
				.join(", ");

			await query(`
                INSERT INTO RolePermission (role_id, permission_id)
                VALUES ${values}
                ON CONFLICT (role_id, permission_id) DO NOTHING
            `);

			// Fetch updated permissions for role
			const result = await query(
				`
                SELECT p.*
                FROM Permission p
                JOIN RolePermission rp ON p.permission_id = rp.permission_id
                WHERE rp.role_id = $1
                ORDER BY p.feature_name
            `,
				[data.role_id]
			);

			await query("COMMIT");
			return result.rows;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async removePermissionsFromRole(data: AssignPermissionsDTO): Promise<void> {
		try {
			await query("BEGIN");

			// Verify role exists
			const roleExists = await query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[data.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error("Role not found");
			}

			// Remove specified permissions
			await query(
				"DELETE FROM RolePermission WHERE role_id = $1 AND permission_id = ANY($2)",
				[data.role_id, data.permission_ids]
			);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async syncRolePermissions(
		data: AssignPermissionsDTO
	): Promise<Permission[]> {
		try {
			await query("BEGIN");

			// Verify role exists
			const roleExists = await query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[data.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error("Role not found");
			}

			// Verify all permissions exist
			const permissionsExist = await query(
				"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
				[data.permission_ids]
			);

			if (permissionsExist.rows.length !== data.permission_ids.length) {
				throw new Error("One or more invalid permission IDs");
			}

			// Remove all existing permissions for the role
			await query("DELETE FROM RolePermission WHERE role_id = $1", [
				data.role_id
			]);

			// Add new permissions
			if (data.permission_ids.length > 0) {
				const values = data.permission_ids
					.map((permissionId) => `(${data.role_id}, ${permissionId})`)
					.join(", ");

				await query(`
                    INSERT INTO RolePermission (role_id, permission_id)
                    VALUES ${values}
                `);
			}

			// Fetch updated permissions
			const result = await query(
				`
                SELECT p.*
                FROM Permission p
                JOIN RolePermission rp ON p.permission_id = rp.permission_id
                WHERE rp.role_id = $1
                ORDER BY p.feature_name
            `,
				[data.role_id]
			);

			await query("COMMIT");
			return result.rows;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async checkPermission(
		roleId: number,
		permissionName: string
	): Promise<boolean> {
		try {
			const result = await query(
				`
                SELECT 1
                FROM RolePermission rp
                JOIN Permission p ON rp.permission_id = p.permission_id
                WHERE rp.role_id = $1 AND p.feature_name = $2
            `,
				[roleId, permissionName]
			);

			return result.rows.length > 0;
		} catch (error) {
			throw error;
		}
	}

	async checkPermissions(
		roleId: number,
		permissionNames: string[]
	): Promise<boolean> {
		try {
			const result = await query(
				`
                SELECT COUNT(DISTINCT p.feature_name) as count
                FROM RolePermission rp
                JOIN Permission p ON rp.permission_id = p.permission_id
                WHERE rp.role_id = $1 AND p.feature_name = ANY($2)
            `,
				[roleId, permissionNames]
			);

			// Check if all permissions exist
			return parseInt(result.rows[0].count) === permissionNames.length;
		} catch (error) {
			throw error;
		}
	}
}

export default new RoleModel();
