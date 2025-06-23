// src/app/controllers/Permission.controller.ts
import { Request, Response } from "express";
import PermissionModel from "../models/Permission.model.js";
import {
	CreatePermissionDTO,
	UpdatePermissionDTO
} from "../utils/types/users.js";

export class PermissionController {
	async createPermission(req: Request, res: Response) {
		try {
			const permissionData: CreatePermissionDTO = req.body;

			if (!permissionData.feature_name) {
				res.status(400).json({
					error: "Feature name is required"
				});
				return;
			}

			const newPermission = await PermissionModel.createPermission(
				permissionData
			);
			res.status(201).json(newPermission);
		} catch (error: any) {
			if (error.message === "Permission feature name already exists") {
				res.status(409).json({ error: error.message });
			} else {
				console.error("Error creating permission:", error);
				res.status(500).json({ error: "Failed to create permission" });
			}
		}
	}

	async updatePermission(req: Request, res: Response) {
		try {
			const permissionId = parseInt(req.params.id);
			const permissionData: UpdatePermissionDTO = {
				...req.body,
				permission_id: permissionId
			};

			const updatedPermission = await PermissionModel.updatePermission(
				permissionData
			);
			res.json(updatedPermission);
		} catch (error: any) {
			if (error.message === "Permission not found") {
				res.status(404).json({ error: error.message });
			} else if (
				error.message === "Permission feature name already exists"
			) {
				res.status(409).json({ error: error.message });
			} else if (error.message === "No updates provided") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error updating permission:", error);
				res.status(500).json({ error: "Failed to update permission" });
			}
		}
	}

	async deletePermission(req: Request, res: Response) {
		try {
			const permissionId = parseInt(req.params.id);
			await PermissionModel.deletePermission(permissionId);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "Permission not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message.includes("Cannot delete permission")) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error deleting permission:", error);
				res.status(500).json({ error: "Failed to delete permission" });
			}
		}
	}

	async getPermissionById(req: Request, res: Response) {
		try {
			const permissionId = parseInt(req.params.id);
			const permission = await PermissionModel.getPermissionById(
				permissionId
			);

			if (!permission) {
				res.status(404).json({ error: "Permission not found" });
				return;
			}

			res.json(permission);
		} catch (error) {
			console.error("Error fetching permission:", error);
			res.status(500).json({ error: "Failed to fetch permission" });
		}
	}

	async getAllPermissions(_req: Request, res: Response) {
		try {
			const permissions = await PermissionModel.getAllPermissions();
			res.json(permissions);
		} catch (error) {
			console.error("Error fetching permissions:", error);
			res.status(500).json({ error: "Failed to fetch permissions" });
		}
	}

	async getPermissionsByRole(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const permissions = await PermissionModel.getPermissionsByRole(
				id
			);
			res.json(permissions);
		} catch (error) {
			console.error("Error fetching role permissions:", error);
			res.status(500).json({ error: "Failed to fetch role permissions" });
		}
	}

	async getUnassignedPermissions(req: Request, res: Response) {
		try {
			const id = parseInt(req.params.id);
			const permissions = await PermissionModel.getUnassignedPermissions(
				id
			);
			res.json(permissions);
		} catch (error) {
			console.error("Error fetching unassigned permissions:", error);
			res.status(500).json({
				error: "Failed to fetch unassigned permissions"
			});
		}
	}
}

export default new PermissionController();
