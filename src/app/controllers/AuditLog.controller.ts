import { Request, Response } from "express";
import AuditLogModel from "../models/AuditLog.model.js";
import { CreateAuditLogDTO, UpdateAuditLogDTO } from "../utils/types/auditLog.js";

export class AuditLogController {
	async getAllAuditLogs(_req: Request, res: Response): Promise<void> {
		try {
			const result = await AuditLogModel.getAllAuditLogs();
			res.json(result);
		} catch (error) {
			console.error("Error fetching audit logs:", error);
			res.status(500).json({ error: "Failed to fetch audit logs" });
		}
	}

	async getAuditLogById(req: Request, res: Response): Promise<void> {
		try {
			const auditId = parseInt(req.params.id);
			const result = await AuditLogModel.getAuditLogById(auditId);
			res.json(result);
		} catch (error) {
			console.error("Error fetching audit log:", error);
			res.status(500).json({ error: "Failed to fetch audit log" });
		}
	}

	async createAuditLog(req: Request, res: Response): Promise<void> {
		try {
			const audit: CreateAuditLogDTO = req.body;
			const result = await AuditLogModel.createAuditLog(audit);
			res.json(result);
		} catch (error) {
			console.error("Error creating audit log:", error);
			res.status(500).json({ error: "Failed to create audit log" });
		}
	}

	async updateAuditLog(req: Request, res: Response): Promise<void> {
		try {
			const audit: UpdateAuditLogDTO = req.body;
			const result = await AuditLogModel.updateAuditLog(audit);
			res.json(result);
		} catch (error) {
			console.error("Error updating audit log:", error);
			res.status(500).json({ error: "Failed to update audit log" });
		}
	}

	async deleteAuditLog(req: Request, res: Response): Promise<void> {
		try {
			const auditId = parseInt(req.params.id);
			const result = await AuditLogModel.deleteAuditLog(auditId);
			res.json(result);
		} catch (error) {
			console.error("Error deleting audit log:", error);
			res.status(500).json({ error: "Failed to delete audit log" });
		}
	}

	async getAuditLogsByUserId(req: Request, res: Response): Promise<void> {
		try {
			const userId = parseInt(req.params.id);
			const result = await AuditLogModel.getAuditLogsByUserId(userId);
			res.json(result);
		} catch (error) {
			console.error("Error fetching audit logs by username:", error);
			res.status(500).json({ error: "Failed to fetch audit logs by username" });
		}
	}

	async getAuditLogsByActionType(req: Request, res: Response): Promise<void> {
		try {
			const actionType = req.params.actionType;
			const result = await AuditLogModel.getAuditLogsByActionType(actionType);
			res.json(result);
		} catch (error) {
			console.error("Error fetching audit logs by action type:", error);
			res.status(500).json({ error: "Failed to fetch audit logs by action type" });
		}
	}

	async getAuditLogsByPage(req: Request, res: Response): Promise<void> {
		try {
			const page = parseInt(req.params.id);
			const result = await AuditLogModel.getAuditLogsByPage(page);
			res.json(result);
		} catch (error) {
			console.error("Error fetching audit logs by page:", error);
			res.status(500).json({ error: "Failed to fetch audit logs by page" });
		}
	}
}

export default new AuditLogController();