// src/app/models/Role.model.ts
import { query, withTransaction } from "./database/connection.js";
import type { PoolClient } from "pg";
import {
	Permission,
	RoleWithPermissions,
	CreateRoleDTO,
	UpdateRoleDTO,
	AssignPermissionsDTO
} from "../utils/types/users.js";
import { isPrivilegedRole } from "../utils/roles.js";

/** Error strings the controller switches on. Kept here so they cannot drift. */
const ERR = {
	NOT_FOUND: "Role not found",
	NAME_EXISTS: "Role name already exists",
	INVALID_PERMISSIONS: "One or more invalid permission IDs",
	IN_USE: "Cannot delete role: role is assigned to users",
	SYSTEM_ROLE: "System role cannot be modified",
	IMMUTABLE_NAME:
		"This role is referenced by the system and cannot be renamed or deleted"
} as const;

export class RoleModel {
	/**
	 * Fetch a role with its permissions and human-account count.
	 *
	 * LATERAL subqueries replace the old `LEFT JOIN ... GROUP BY json_agg`
	 * pair: the aggregate returns `'[]'` instead of `[null]` for a role with no
	 * permissions (dropping the `permissions[0].permission_id === null` hack),
	 * permissions come back in a deterministic order, and the user count needs
	 * a second aggregate on a different table that a single GROUP BY cannot
	 * express without fan-out.
	 */
	private async fetchRole(
		roleId: number,
		client?: PoolClient
	): Promise<RoleWithPermissions | null> {
		const sql = `
			SELECT r.role_id,
			       r.name,
			       r.is_system,
			       COALESCE(perm.permissions, '[]'::json) AS permissions,
			       COALESCE(uc.user_count, 0)::int        AS user_count
			  FROM Role r
			  LEFT JOIN LATERAL (
				SELECT json_agg(
						json_build_object(
							'permission_id', p.permission_id,
							'feature_name', p.feature_name,
							'description', p.description
						) ORDER BY p.feature_name
				       ) AS permissions
				  FROM RolePermission rp
				  JOIN Permission p ON rp.permission_id = p.permission_id
				 WHERE rp.role_id = r.role_id
			  ) perm ON TRUE
			  LEFT JOIN LATERAL (
				SELECT COUNT(*) AS user_count
				  FROM "User" u
				 WHERE u.role_id = r.role_id
				   AND u.is_system = FALSE
			  ) uc ON TRUE
			 WHERE r.role_id = $1
		`;

		const result = client
			? await client.query(sql, [roleId])
			: await query(sql, [roleId]);

		return result.rows[0] || null;
	}

	async createRole(roleData: CreateRoleDTO): Promise<RoleWithPermissions> {
		return await withTransaction(async (client) => {
			// Check if role name already exists
			const existingRole = await client.query(
				"SELECT name FROM Role WHERE LOWER(name) = LOWER($1)",
				[roleData.name]
			);

			if (existingRole.rows.length > 0) {
				throw new Error(ERR.NAME_EXISTS);
			}

			// Create the role. user-created roles are never `is_system`.
			const roleResult = await client.query(
				"INSERT INTO Role (name, is_system) VALUES ($1, FALSE) RETURNING *",
				[roleData.name]
			);

			const role = roleResult.rows[0];

			// Add permissions if provided
			if (roleData.permissions && roleData.permissions.length > 0) {
				// Verify all permissions exist
				const permissionsExist = await client.query(
					"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
					[roleData.permissions]
				);

				if (
					permissionsExist.rows.length !== roleData.permissions.length
				) {
					throw new Error(ERR.INVALID_PERMISSIONS);
				}

				const params: any[] = [];
				const placeholders = roleData.permissions
					.map((_, idx) => {
						params.push(role.role_id, roleData.permissions[idx]);
						return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
					})
					.join(", ");

				await client.query(
					`INSERT INTO RolePermission (role_id, permission_id)
					 VALUES ${placeholders}`,
					params
				);
			}

			// Read back inside the same transaction so the response reflects
			// rows this transaction has not committed yet.
			const result = await this.fetchRole(role.role_id, client);
			return result!;
		});
	}

	async updateRole(roleData: UpdateRoleDTO): Promise<RoleWithPermissions> {
		return await withTransaction(async (client) => {
			// Check if role exists (and whether it is the automation role)
			const roleExists = await client.query(
				"SELECT role_id, name, is_system FROM Role WHERE role_id = $1",
				[roleData.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error(ERR.NOT_FOUND);
			}

			const current = roleExists.rows[0];

			// The automation role holds no meaningful permissions — privilege
			// bypasses every check — so editing it is rejected outright.
			if (current.is_system) {
				throw new Error(ERR.SYSTEM_ROLE);
			}

			// Update role name if provided
			if (roleData.name && roleData.name !== current.name) {
				// `Admin` / `System` are code contracts: renaming either would
				// silently break every `isPrivilegedRole` gate.
				if (isPrivilegedRole(current.name)) {
					throw new Error(ERR.IMMUTABLE_NAME);
				}

				// Check if new name conflicts with existing roles
				const nameExists = await client.query(
					"SELECT role_id FROM Role WHERE LOWER(name) = LOWER($1) AND role_id != $2",
					[roleData.name, roleData.role_id]
				);

				if (nameExists.rows.length > 0) {
					throw new Error(ERR.NAME_EXISTS);
				}

				await client.query(
					"UPDATE Role SET name = $1 WHERE role_id = $2",
					[roleData.name, roleData.role_id]
				);
			}

			// Update permissions if provided
			if (roleData.permissions) {
				if (
					roleData.permissions.add &&
					roleData.permissions.add.length > 0
				) {
					// Verify new permissions exist
					const permissionsExist = await client.query(
						"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
						[roleData.permissions.add]
					);

					if (
						permissionsExist.rows.length !==
						roleData.permissions.add.length
					) {
						throw new Error(ERR.INVALID_PERMISSIONS);
					}

					// Add new permissions
					const params: any[] = [];
					const placeholders = roleData.permissions.add
						.map((_, idx) => {
							params.push(
								roleData.role_id,
								roleData.permissions!.add![idx]
							);
							return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
						})
						.join(", ");

					await client.query(
						`INSERT INTO RolePermission (role_id, permission_id)
						 VALUES ${placeholders}
						 ON CONFLICT DO NOTHING`,
						params
					);
				}

				if (
					roleData.permissions.remove &&
					roleData.permissions.remove.length > 0
				) {
					await client.query(
						"DELETE FROM RolePermission WHERE role_id = $1 AND permission_id = ANY($2)",
						[roleData.role_id, roleData.permissions.remove]
					);
				}
			}

			// Fetch updated role with permissions
			const result = await this.fetchRole(roleData.role_id, client);
			return result!;
		});
	}

	async deleteRole(roleId: number): Promise<void> {
		await withTransaction(async (client) => {
			const roleRow = await client.query(
				"SELECT role_id, name, is_system FROM Role WHERE role_id = $1",
				[roleId]
			);

			if (roleRow.rows.length === 0) {
				throw new Error(ERR.NOT_FOUND);
			}

			const role = roleRow.rows[0];

			if (role.is_system) {
				throw new Error(ERR.SYSTEM_ROLE);
			}

			if (isPrivilegedRole(role.name)) {
				throw new Error(ERR.IMMUTABLE_NAME);
			}

			// Check if role is assigned to any users
			const usersWithRole = await client.query(
				'SELECT user_id FROM "User" WHERE role_id = $1 LIMIT 1',
				[roleId]
			);

			if (usersWithRole.rows.length > 0) {
				throw new Error(ERR.IN_USE);
			}

			// Delete role permissions
			await client.query("DELETE FROM RolePermission WHERE role_id = $1", [
				roleId
			]);

			await client.query("DELETE FROM Role WHERE role_id = $1", [roleId]);
		});
	}

	async getRoleById(roleId: number): Promise<RoleWithPermissions | null> {
		return await this.fetchRole(roleId);
	}

	/**
	 * Every non-system role, for the admin roles table.
	 *
	 * The automation `System` role is excluded server-side so the list and its
	 * counts agree and the row cannot be edited from the UI.
	 */
	async getAllRoles(): Promise<RoleWithPermissions[]> {
		const sql = `
			SELECT r.role_id,
			       r.name,
			       r.is_system,
			       COALESCE(perm.permissions, '[]'::json) AS permissions,
			       COALESCE(uc.user_count, 0)::int        AS user_count
			  FROM Role r
			  LEFT JOIN LATERAL (
				SELECT json_agg(
						json_build_object(
							'permission_id', p.permission_id,
							'feature_name', p.feature_name,
							'description', p.description
						) ORDER BY p.feature_name
				       ) AS permissions
				  FROM RolePermission rp
				  JOIN Permission p ON rp.permission_id = p.permission_id
				 WHERE rp.role_id = r.role_id
			  ) perm ON TRUE
			  LEFT JOIN LATERAL (
				SELECT COUNT(*) AS user_count
				  FROM "User" u
				 WHERE u.role_id = r.role_id
				   AND u.is_system = FALSE
			  ) uc ON TRUE
			 WHERE r.is_system = FALSE
			 ORDER BY r.name
		`;

		const result = await query(sql);
		return result.rows;
	}

	async assignPermissionsToRole(
		data: AssignPermissionsDTO
	): Promise<Permission[]> {
		return await withTransaction(async (client) => {
			// Verify role exists
			const roleExists = await client.query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[data.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error(ERR.NOT_FOUND);
			}

			// Verify all permissions exist
			const permissionsExist = await client.query(
				"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
				[data.permission_ids]
			);

			if (permissionsExist.rows.length !== data.permission_ids.length) {
				throw new Error(ERR.INVALID_PERMISSIONS);
			}

			// Create role-permission associations
			const values = data.permission_ids
				.map((permissionId) => `(${data.role_id}, ${permissionId})`)
				.join(", ");

			await client.query(`
				INSERT INTO RolePermission (role_id, permission_id)
				VALUES ${values}
				ON CONFLICT (role_id, permission_id) DO NOTHING
			`);

			// Fetch updated permissions for role
			const result = await client.query(
				`SELECT p.*
				   FROM Permission p
				   JOIN RolePermission rp ON p.permission_id = rp.permission_id
				  WHERE rp.role_id = $1
				  ORDER BY p.feature_name`,
				[data.role_id]
			);

			return result.rows;
		});
	}

	async removePermissionsFromRole(data: AssignPermissionsDTO): Promise<void> {
		await withTransaction(async (client) => {
			// Verify role exists
			const roleExists = await client.query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[data.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error(ERR.NOT_FOUND);
			}

			await client.query(
				"DELETE FROM RolePermission WHERE role_id = $1 AND permission_id = ANY($2)",
				[data.role_id, data.permission_ids]
			);
		});
	}

	async syncRolePermissions(
		data: AssignPermissionsDTO
	): Promise<Permission[]> {
		return await withTransaction(async (client) => {
			// Verify role exists
			const roleExists = await client.query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[data.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error(ERR.NOT_FOUND);
			}

			// Verify all permissions exist
			const permissionsExist = await client.query(
				"SELECT permission_id FROM Permission WHERE permission_id = ANY($1)",
				[data.permission_ids]
			);

			if (permissionsExist.rows.length !== data.permission_ids.length) {
				throw new Error(ERR.INVALID_PERMISSIONS);
			}

			// Remove all existing permissions for the role
			await client.query("DELETE FROM RolePermission WHERE role_id = $1", [
				data.role_id
			]);

			// Add new permissions
			if (data.permission_ids.length > 0) {
				const values = data.permission_ids
					.map((permissionId) => `(${data.role_id}, ${permissionId})`)
					.join(", ");

				await client.query(`
					INSERT INTO RolePermission (role_id, permission_id)
					VALUES ${values}
				`);
			}

			// Fetch updated permissions
			const result = await client.query(
				`SELECT p.*
				   FROM Permission p
				   JOIN RolePermission rp ON p.permission_id = rp.permission_id
				  WHERE rp.role_id = $1
				  ORDER BY p.feature_name`,
				[data.role_id]
			);

			return result.rows;
		});
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
