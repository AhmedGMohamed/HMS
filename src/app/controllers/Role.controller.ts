// src/app/controllers/Role.controller.ts
import { Request, Response } from "express";
import RoleModel from "../models/Role.model.js";
import { CreateRoleDTO, UpdateRoleDTO, AssignPermissionsDTO } from "../utils/types/users.js";

export class RoleController {
	async createRole(req: Request, res: Response) {
		try {
			const roleData: CreateRoleDTO = req.body;

			if (!roleData.name) {
				res.status(400).json({
					error: "Role name is required"
				});
				return;
			}

			const newRole = await RoleModel.createRole(roleData);
			res.status(201).json(newRole);
		} catch (error: any) {
			switch (error.message) {
				case "Role name already exists":
					res.status(409).json({ error: error.message });
					break;
				case "One or more invalid permission IDs":
					res.status(400).json({ error: error.message });
					break;
				default:
					console.error("Error creating role:", error);
					res.status(500).json({ error: "Failed to create role" });
					break;
			}
		}
	}

	async updateRole(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const roleData: UpdateRoleDTO = { ...req.body, role_id: id };

			const updatedRole = await RoleModel.updateRole(roleData);
			res.json(updatedRole);
		} catch (error: any) {
			switch (error.message) {
				case "Role not found":
					res.status(404).json({ error: error.message });
					break;
				case "Role name already exists":
					res.status(409).json({ error: error.message });
					break;
				case "One or more invalid permission IDs":
					res.status(400).json({ error: error.message });
					break;
				default:
					console.error("Error updating role:", error);
					res.status(500).json({ error: "Failed to update role" });
					break;
			}
		}
	}

	async deleteRole(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			await RoleModel.deleteRole(id);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "Role not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message.includes("Cannot delete role")) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error deleting role:", error);
				res.status(500).json({ error: "Failed to delete role" });
			}
		}
	}

	async getRoleById(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const role = await RoleModel.getRoleById(id);

			if (!role) {
				res.status(404).json({ error: "Role not found" });
				return;
			}

			res.json(role);
		} catch (error) {
			console.error("Error fetching role:", error);
			res.status(500).json({ error: "Failed to fetch role" });
		}
	}

	async getAllRoles(_req: Request, res: Response) {
		try {
			const roles = await RoleModel.getAllRoles();
			res.json(roles);
		} catch (error) {
			console.error("Error fetching roles:", error);
			res.status(500).json({ error: "Failed to fetch roles" });
		}
	}

	async assignPermissions(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const permissionData: AssignPermissionsDTO = {
				role_id: id,
				permission_ids: req.body.permission_ids
			};

			if (
				!Array.isArray(permissionData.permission_ids) ||
				permissionData.permission_ids.length === 0
			) {
				res.status(400).json({
					error: "permission_ids array is required"
				});
				return
			}

			const updatedPermissions =
				await RoleModel.assignPermissionsToRole(
					permissionData
				);
			res.json(updatedPermissions);
		} catch (error: any) {
			if (error.message === "Role not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message === "One or more invalid permission IDs") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error assigning permissions:", error);
				res.status(500).json({ error: "Failed to assign permissions" });
			}
		}
	}

	async removePermissions(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const permissionData: AssignPermissionsDTO = {
				role_id: id,
				permission_ids: req.body.permission_ids
			};

			if (
				!Array.isArray(permissionData.permission_ids) ||
				permissionData.permission_ids.length === 0
			) {
				res.status(400).json({
					error: "permission_ids array is required"
				});
				return
			}

			await RoleModel.removePermissionsFromRole(permissionData);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "Role not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error removing permissions:", error);
				res.status(500).json({ error: "Failed to remove permissions" });
			}
		}
	}

	async syncPermissions(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const permissionData: AssignPermissionsDTO = {
				role_id: id,
				permission_ids: req.body.permission_ids
			};

			if (!Array.isArray(permissionData.permission_ids)) {
				res.status(400).json({
					error: "permission_ids array is required"
				});
				return
			}

			const updatedPermissions =
				await RoleModel.syncRolePermissions(permissionData);
			res.json(updatedPermissions);
		} catch (error: any) {
			if (error.message === "Role not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message === "One or more invalid permission IDs") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error syncing permissions:", error);
				res.status(500).json({ error: "Failed to sync permissions" });
			}
		}
	}

	async checkPermission(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const { permission } = req.query;

			if (typeof permission !== "string") {
				res.status(400).json({
					error: "permission query parameter is required"
				});
				return
			}

			const hasPermission = await RoleModel.checkPermission(
				id,
				permission
			);
			res.json({ hasPermission });
		} catch (error) {
			console.error("Error checking permission:", error);
			res.status(500).json({ error: "Failed to check permission" });
		}
	}

	async checkPermissions(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const { permissions } = req.query;

			if (!Array.isArray(permissions)) {
				res.status(400).json({
					error: "permissions array is required"
				});
				return
			}

			const hasPermissions = await RoleModel.checkPermissions(
				id,
				permissions as string[]
			);
			res.json({ hasPermissions });
		} catch (error) {
			console.error("Error checking permissions:", error);
			res.status(500).json({ error: "Failed to check permissions" });
		}
	}
}

export default new RoleController();
