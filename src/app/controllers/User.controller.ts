// src/app/controllers/User.controller.ts
import { Request, Response } from "express";
import UserModel from "../models/User.model.js";
import { CreateUserDTO, UpdateUserDTO } from "../utils/types/users.js";
import {
	parsePagination,
	buildPage
} from "../utils/pagination.js";
import { isPrivilegedRole } from "../utils/roles.js";

/** Body field lookup that tolerates both wire spellings. */
function bodyField(
	body: Record<string, unknown> | undefined,
	snake: string,
	camel: string
): { present: boolean; value: unknown } {
	if (!body) return { present: false, value: undefined };
	if (Object.prototype.hasOwnProperty.call(body, snake)) {
		return { present: true, value: body[snake] };
	}
	if (Object.prototype.hasOwnProperty.call(body, camel)) {
		return { present: true, value: body[camel] };
	}
	return { present: false, value: undefined };
}

function queryString(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return String(value[0] ?? "");
	return undefined;
}

export class UserController {
	async createUser(req: Request, res: Response) {
		try {
			const userData: CreateUserDTO = req.body;

			if (!userData.username || !userData.password || !userData.role_id) {
				return res.status(400).json({
					error: "Username, password, and role_id are required"
				});
			}

			// `is_system` is never client-settable — automation accounts are
			// provisioned by the schema, never created from the admin console.
			const created = await UserModel.createUser({
				username: userData.username,
				password: userData.password,
				role_id: userData.role_id,
				is_active:
					bodyField(req.body, "is_active", "isActive").value === false
						? false
						: undefined
			});

			// Return the row in the same shape the list/detail endpoints use.
			const user = await UserModel.getUserById(created.user_id);
			res.status(201).json(user ?? created);
		} catch (error: any) {
			if (error.message === "Username already exists") {
				res.status(409).json({
					error: error.message,
					code: "USERNAME_EXISTS"
				});
			} else if (error.message === "Invalid role_id") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error creating user:", error);
				res.status(500).json({ error: "Failed to create user" });
			}
		}
	}

	async updateUser(req: Request, res: Response) {
		try {
			const userId = parseInt(req.params.id);
			const body = req.body ?? {};

			const target = await UserModel.getUserById(userId);
			if (!target) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Automation accounts are not editable from the console. The list
			// hides them too, so this only fires for direct API calls.
			if (target.is_system) {
				res.status(400).json({
					error: "System accounts cannot be modified",
					code: "SYSTEM_ACCOUNT_PROTECTED"
				});
				return;
			}

			const isSelf = req.user?.userId === userId;
			const roleField = bodyField(body, "role_id", "roleId");
			const activeField = bodyField(body, "is_active", "isActive");

			// `checkSelfOrAdmin` lets a user PUT their own row, so without this
			// a non-privileged user could set their own role to Admin. Blocking
			// any self role change closes that escalation path.
			if (isSelf && roleField.present) {
				res.status(400).json({
					error: "You cannot change your own role",
					code: "CANNOT_CHANGE_OWN_ROLE"
				});
				return;
			}

			if (isSelf && activeField.present && activeField.value === false) {
				res.status(400).json({
					error: "You cannot deactivate your own account",
					code: "CANNOT_DEACTIVATE_SELF"
				});
				return;
			}

			if (activeField.present && !isPrivilegedRole(req.user?.role)) {
				res.status(403).json({
					error: "Only administrators can change account status",
					code: "ADMIN_ONLY_FIELD"
				});
				return;
			}

			const userData: UpdateUserDTO = { ...body, user_id: userId };

			const updatedUser = await UserModel.updateUser(userData);
			res.json(updatedUser);
		} catch (error: any) {
			switch (error.message)
			{
				case "Username already exists":
					res.status(409).json({
						error: error.message,
						code: "USERNAME_EXISTS"
					});
					break;
				case "Invalid role_id":
					res.status(400).json({ error: error.message });
					break;
				case "User not found":
					res.status(404).json({ error: error.message });
					break;
				case "No updates provided":
					res.status(400).json({ error: error.message });
					break;
				default:
					console.error("Error updating user:", error);
					res.status(500).json({ error: "Failed to update user" });
					break;
			}
		}
	}

	async deleteUser(req: Request, res: Response) {
		try {
			const userId = parseInt(req.params.id);

			const target = await UserModel.getUserById(userId);
			if (!target) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			if (target.is_system) {
				res.status(400).json({
					error: "System accounts cannot be modified",
					code: "SYSTEM_ACCOUNT_PROTECTED"
				});
				return;
			}

			if (req.user?.userId === userId) {
				res.status(400).json({
					error: "You cannot delete your own account",
					code: "CANNOT_DELETE_SELF"
				});
				return;
			}

			await UserModel.deleteUser(userId);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "User not found") {
				res.status(404).json({ error: error.message });
			} else if (error.code === "23503") {
				// Foreign-key violation: the account owns bills, audit rows, etc.
				// A hard delete is impossible; deactivation is the alternative.
				res.status(409).json({
					error: "This user is referenced by other records and cannot be deleted",
					code: "USER_IN_USE"
				});
			} else {
				console.error("Error deleting user:", error);
				res.status(500).json({ error: "Failed to delete user" });
			}
		}
	}

	async getUserById(req: Request, res: Response) {
		try {
			const userId = parseInt(req.params.id);
			const user = await UserModel.getUserById(userId);

			if (!user) {
				return res.status(404).json({ error: "User not found" });
			}

			res.json(user);
		} catch (error) {
			console.error("Error fetching user:", error);
			res.status(500).json({ error: "Failed to fetch user" });
		}
	}

	async getAllUsers(req: Request, res: Response) {
		try {
			const pagination = parsePagination(req);
			const q = queryString(req.query?.q);

			// The renderer sends camelCase (`roleId`), matching every other
			// list endpoint; the snake_case alias serves curl/legacy callers.
			const roleRaw = req.query?.roleId ?? req.query?.role_id;
			let roleId: number | undefined;
			if (roleRaw !== undefined && roleRaw !== null && roleRaw !== "") {
				const parsed = Number(queryString(roleRaw));
				if (!Number.isInteger(parsed) || parsed <= 0) {
					res.status(400).json({ error: "Invalid roleId" });
					return;
				}
				roleId = parsed;
			}

			const sort = queryString(req.query?.sort);
			const order = queryString(req.query?.order);

			const { rows, total } = await UserModel.getAllUsers({
				offset: pagination.offset,
				limit: pagination.limit,
				q,
				roleId,
				sort,
				order
			});
			res.json(buildPage(rows, total, pagination));
		} catch (error) {
			console.error("Error fetching users:", error);
			res.status(500).json({ error: "Failed to fetch users" });
		}
	}

	async getUserNameById(req: Request, res: Response) {
		try {
			const userId = parseInt(req.params.id);
			const user = await UserModel.getUserNameById(userId);

			if (!user) {
				return res.status(404).json({ error: "User not found" });
			}

			res.json(user);
		} catch (error) {
			console.error("Error fetching user:", error);
			res.status(500).json({ error: "Failed to fetch user" });
		}
	}
}

export default new UserController();
