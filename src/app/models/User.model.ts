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
				`INSERT INTO "User" (username, password_hash, role_id)
                VALUES ($1, $2, $3)
                RETURNING user_id, username, role_id, created_at`,
				[userData.username, passwordHash, userData.role_id]
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

			if (updates.length === 0) {
				throw new Error("No updates provided");
			}

			values.push(userData.user_id);
			const sql = `
                UPDATE "User"
                SET ${updates.join(", ")}
                WHERE user_id = $${paramCount}
                RETURNING user_id, username, role_id, created_at
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
                SELECT u.user_id, u.username, u.role_id, u.created_at,
                       r.name as role_name
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

	async getAllUsers(): Promise<UserWithRole[]> {
		try {
			const sql = `
                SELECT u.user_id, u.username, u.role_id, u.created_at,
                       r.name as role_name
                FROM "User" u
                JOIN Role r ON u.role_id = r.role_id
                ORDER BY u.username
            `;
			const result = await query(sql);

			return result.rows;
		} catch (error) {
			throw error;
		}
	}
}

export default new UserModel();
