// src/app/models/User.model.ts
import { query } from "./database/connection.js";
import bcrypt from "bcryptjs";
import {
	User,
	UserWithRole,
	CreateUserDTO,
	UpdateUserDTO
} from "../utils/types/users.js";

export class UserModel {
	/** Column shapes shared by the list and detail selects. */
	private static readonly USER_COLUMNS = `
		u.user_id, u.username, u.role_id, u.created_at,
		u.is_active, u.is_system, u.last_login,
		r.name AS role_name`;

	/**
	 * Whitelist for `ORDER BY`. Never interpolate a client-supplied column
	 * name into SQL — always resolve through this map.
	 */
	private static readonly SORTABLE_COLUMNS: Record<string, string> = {
		username: "u.username",
		roleName: "r.name",
		role: "r.name",
		status: "u.is_active",
		isActive: "u.is_active",
		lastLogin: "u.last_login",
		createdAt: "u.created_at"
	};

	async authenticateUser(
		username: string,
		password: string
	): Promise<UserWithRole | null> {
		try {
			const sql = `
                SELECT u.*, r.name as role_name 
                FROM "User" u
                JOIN Role r ON u.role_id = r.role_id
                WHERE u.username = $1;
            `;
			const result = await query(sql, [username]);

			if (result.rows.length === 0) {
				return null;
			}

			const user = result.rows[0];
			const isValidPassword = await bcrypt.compare(
				password,
				user.password_hash
			);

			if (!isValidPassword) {
				return null;
			}

			// Don't send password hash to client
			delete user.password_hash;
			return user;
		} catch (error) {
			throw new Error("Authentication failed");
		}
	}

	async getUserPermissions(userId: number): Promise<string[]> {
		try {
			const sql = `
                SELECT DISTINCT p.feature_name
                FROM "User" u
                JOIN Role r ON u.role_id = r.role_id
                JOIN RolePermission rp ON r.role_id = rp.role_id
                JOIN Permission p ON rp.permission_id = p.permission_id
                WHERE u.user_id = $1;
            `;
			const result = await query(sql, [userId]);
			return result.rows.map((row) => row.feature_name);
		} catch (error) {
			throw new Error("Failed to fetch user permissions");
		}
	}

	async hashPassword(password: string): Promise<string> {
		const saltRounds = 10;
		return bcrypt.hash(password, saltRounds);
	}

	/**
	 * Live account state for the auth middleware.
	 *
	 * One indexed primary-key read per authenticated request. Returns `null`
	 * when the account is gone, so `verifyToken` can reject a token whose user
	 * was deleted rather than trusting the claim.
	 */
	async getAuthState(
		userId: number
	): Promise<{ is_active: boolean; role_name: string } | null> {
		try {
			const result = await query(
				`SELECT u.is_active, r.name AS role_name
				   FROM "User" u
				   LEFT JOIN Role r ON u.role_id = r.role_id
				  WHERE u.user_id = $1`,
				[userId]
			);

			return result.rows[0] ?? null;
		} catch (error) {
			throw new Error("Failed to fetch auth state");
		}
	}

	async recordLogin(userId: number): Promise<void> {
		await query('UPDATE "User" SET last_login = NOW() WHERE user_id = $1', [
			userId
		]);
	}

	async createUser(userData: CreateUserDTO): Promise<User> {
		try {
			// Check if username already exists
			const existingUser = await query(
				'SELECT username FROM "User" WHERE username = $1',
				[userData.username]
			);

			if (existingUser.rows.length > 0) {
				throw new Error("Username already exists");
			}

			// Verify role exists
			const roleExists = await query(
				"SELECT role_id FROM Role WHERE role_id = $1",
				[userData.role_id]
			);

			if (roleExists.rows.length === 0) {
				throw new Error("Invalid role_id");
			}

			const passwordHash = await this.hashPassword(userData.password);

			const result = await query(
				`INSERT INTO "User" (username, password_hash, role_id, is_active)
                VALUES ($1, $2, $3, $4)
                RETURNING user_id, username, role_id, is_active, is_system,
                          last_login, created_at`,
				[
					userData.username,
					passwordHash,
					userData.role_id,
					userData.is_active ?? true
				]
			);

			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async updateUser(userData: UpdateUserDTO): Promise<User> {
		try {
			const updates: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (userData.username) {
				// Check if new username is already taken by another user
				const existingUser = await query(
					'SELECT username FROM "User" WHERE username = $1 AND user_id != $2',
					[userData.username, userData.user_id]
				);

				if (existingUser.rows.length > 0) {
					throw new Error("Username already exists");
				}

				updates.push(`username = $${paramCount}`);
				values.push(userData.username);
				paramCount++;
			}

			if (userData.password) {
				const passwordHash = await this.hashPassword(userData.password);
				updates.push(`password_hash = $${paramCount}`);
				values.push(passwordHash);
				paramCount++;
			}

			if (userData.role_id) {
				// Verify role exists
				const roleExists = await query(
					"SELECT role_id FROM Role WHERE role_id = $1",
					[userData.role_id]
				);

				if (roleExists.rows.length === 0) {
					throw new Error("Invalid role_id");
				}

				updates.push(`role_id = $${paramCount}`);
				values.push(userData.role_id);
				paramCount++;
			}

			// NOTE: `is_active` must be compared against `undefined`, not
			// truthiness — `false` is a meaningful value here.
			if (userData.is_active !== undefined) {
				updates.push(`is_active = $${paramCount}`);
				values.push(userData.is_active);
				paramCount++;
			}

			if (updates.length === 0) {
				throw new Error("No updates provided");
			}

			values.push(userData.user_id);
			const sql = `
                UPDATE "User"
                SET ${updates.join(", ")}
                WHERE user_id = $${paramCount}
                RETURNING user_id, username, role_id, is_active, is_system,
                          last_login, created_at
            `;

			const result = await query(sql, values);

			if (result.rows.length === 0) {
				throw new Error("User not found");
			}

			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async deleteUser(userId: number): Promise<void> {
		try {
			const result = await query(
				'DELETE FROM "User" WHERE user_id = $1 RETURNING user_id',
				[userId]
			);

			if (result.rows.length === 0) {
				throw new Error("User not found");
			}
		} catch (error) {
			throw error;
		}
	}

	async getUserById(userId: number): Promise<UserWithRole | null> {
		try {
			const sql = `
                SELECT ${UserModel.USER_COLUMNS}
                FROM "User" u
                JOIN Role r ON u.role_id = r.role_id
                WHERE u.user_id = $1
            `;
			const result = await query(sql, [userId]);

			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	/**
	 * Paginated user list for the admin console.
	 *
	 * System (automation) accounts are excluded from both the rows and the
	 * total so pagination stays honest — they are not editable from the UI.
	 * `q`, `roleId` and the system filter compose as AND-ed predicates.
	 */
	async getAllUsers(pagination?: {
		offset?: number;
		limit?: number;
		q?: string;
		roleId?: number;
		sort?: string;
		order?: string;
	}): Promise<{ rows: UserWithRole[]; total: number }> {
		try {
			const offset = Math.max(0, pagination?.offset ?? 0);
			const limit = Math.max(1, Math.min(pagination?.limit ?? 25, 100));
			const q = pagination?.q?.trim();
			const roleId = pagination?.roleId;

			const where: string[] = ["u.is_system = FALSE"];
			const params: unknown[] = [];

			if (q) {
				params.push(`%${q}%`);
				where.push(`u.username ILIKE $${params.length}`);
			}

			if (roleId !== undefined && roleId !== null) {
				params.push(roleId);
				where.push(`u.role_id = $${params.length}`);
			}

			const whereSql = `WHERE ${where.join(" AND ")}`;

			const orderColumn =
				UserModel.SORTABLE_COLUMNS[(pagination?.sort ?? "").trim()] ??
				UserModel.SORTABLE_COLUMNS.username;
			const orderDir =
				(pagination?.order ?? "").toLowerCase() === "desc"
					? "DESC"
					: "ASC";
			const orderBy = `${orderColumn} ${orderDir} NULLS LAST, u.user_id ASC`;

			const listSql = `
				SELECT ${UserModel.USER_COLUMNS}
				FROM "User" u
				JOIN Role r ON u.role_id = r.role_id
				${whereSql}
				ORDER BY ${orderBy}
				LIMIT $${params.length + 1} OFFSET $${params.length + 2}
			`;

			// The count reuses the same predicates, so it cannot drift from
			// the rows; it simply has no LIMIT/OFFSET placeholders.
			const countSql = `
				SELECT COUNT(*) AS c
				FROM "User" u
				${whereSql}
			`;

			const [result, countRes] = await Promise.all([
				query(listSql, [...params, limit, offset]),
				query(countSql, params)
			]);

			return {
				rows: result.rows,
				total: Number(countRes.rows[0]?.c ?? 0)
			};
		} catch (error) {
			throw error;
		}
	}

	async getUserNameById(user_id: number): Promise<string | null> {
		try {
			const sql = `
				SELECT username
				FROM "User"
				WHERE user_id = $1
			`;
			const result = await query(sql, [user_id]);

			return result.rows[0]?.username || null;
		} catch (error) {
			throw error;
		}
	}
}

export default new UserModel();
