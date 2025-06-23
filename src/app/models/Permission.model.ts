// src/app/models/Permission.model.ts
import { query } from "./database/connection.js";
import { Permission, CreatePermissionDTO, UpdatePermissionDTO } from "../utils/types/users.js";

export class PermissionModel {
	async createPermission(
		permissionData: CreatePermissionDTO
	): Promise<Permission> {
		try {
			// Check if permission name already exists
			const existingPermission = await query(
				"SELECT feature_name FROM Permission WHERE LOWER(feature_name) = LOWER($1)",
				[permissionData.feature_name]
			);

			if (existingPermission.rows.length > 0) {
				throw new Error("Permission feature name already exists");
			}

			const result = await query(
				`INSERT INTO Permission (feature_name, description)
                VALUES ($1, $2)
                RETURNING *`,
				[
					permissionData.feature_name,
					permissionData.description || null
				]
			);

			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async updatePermission(
		permissionData: UpdatePermissionDTO
	): Promise<Permission> {
		try {
			const updates: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (permissionData.feature_name) {
				// Check if new feature name conflicts with existing ones
				const nameExists = await query(
					"SELECT permission_id FROM Permission WHERE LOWER(feature_name) = LOWER($1) AND permission_id != $2",
					[permissionData.feature_name, permissionData.permission_id]
				);

				if (nameExists.rows.length > 0) {
					throw new Error("Permission feature name already exists");
				}

				updates.push(`feature_name = $${paramCount}`);
				values.push(permissionData.feature_name);
				paramCount++;
			}

			if (permissionData.description !== undefined) {
				updates.push(`description = $${paramCount}`);
				values.push(permissionData.description);
				paramCount++;
			}

			if (updates.length === 0) {
				throw new Error("No updates provided");
			}

			values.push(permissionData.permission_id);
			const sql = `
                UPDATE Permission
                SET ${updates.join(", ")}
                WHERE permission_id = $${paramCount}
                RETURNING *;
            `;

			const result = await query(sql, values);

			if (result.rows.length === 0) {
				throw new Error("Permission not found");
			}

			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async deletePermission(permissionId: number): Promise<void> {
		try {
			await query("BEGIN");

			// Check if permission is assigned to any roles
			const rolePermissions = await query(
				"SELECT role_id FROM RolePermission WHERE permission_id = $1",
				[permissionId]
			);

			if (rolePermissions.rows.length > 0) {
				throw new Error(
					"Cannot delete permission: it is assigned to roles"
				);
			}

			const result = await query(
				"DELETE FROM Permission WHERE permission_id = $1 RETURNING *",
				[permissionId]
			);

			if (result.rows.length === 0) {
				throw new Error("Permission not found");
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getPermissionById(permissionId: number): Promise<Permission | null> {
		try {
			const result = await query(
				"SELECT * FROM Permission WHERE permission_id = $1",
				[permissionId]
			);

			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	async getAllPermissions(): Promise<Permission[]> {
		try {
			const result = await query(
				"SELECT * FROM Permission ORDER BY feature_name"
			);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getPermissionsByRole(roleId: number): Promise<Permission[]> {
		try {
			const sql = `
                SELECT p.*
                FROM Permission p
                JOIN RolePermission rp ON p.permission_id = rp.permission_id
                WHERE rp.role_id = $1
                ORDER BY p.feature_name;
            `;
			const result = await query(sql, [roleId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getUnassignedPermissions(roleId: number): Promise<Permission[]> {
		try {
			const sql = `
                SELECT p.*
                FROM Permission p
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM RolePermission rp
                    WHERE rp.permission_id = p.permission_id
                    AND rp.role_id = $1
                )
                ORDER BY p.feature_name;
            `;
			const result = await query(sql, [roleId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}
}

export default new PermissionModel();
