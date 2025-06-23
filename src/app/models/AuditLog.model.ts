import {
	AuditLog,
	CreateAuditLogDTO,
	UpdateAuditLogDTO,
	AuditLogWithUsername
} from "../utils/types/auditLog.js";
import { query } from "./database/connection.js";

export class AuditLogModel {
	async getAllAuditLogs(): Promise<AuditLogWithUsername[]> {
		try {
			const sql = `
				SELECT a.*, u.username
				FROM AuditLog a
				JOIN "User" u ON a.user_id = u.user_id`;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getAuditLogById(auditId: number): Promise<AuditLogWithUsername> {
		try {
			const sql = `
				SELECT a.*, u.username
				FROM AuditLog a
				JOIN "User" u ON a.user_id = u.user_id
				WHERE log_id = $1`;
			
			const result = await query(sql, [auditId]);
			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async createAuditLog(audit: CreateAuditLogDTO): Promise<AuditLog> {
		try {
			const sql = `
				INSERT INTO AuditLog
				(user_id, action_type, details)
				VALUES
				($1, $2, $3)
				RETURNING *`;
			const result = await query(sql, [
				audit.user_id,
				audit.action_type,
				audit.details
			]);
			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async updateAuditLog(audit: UpdateAuditLogDTO): Promise<AuditLog> {
		try {
			let placeholders = [];
			const values = [];

			if (audit.user_id) {
				values.push(audit.user_id);
				placeholders.push(`user_id = $${values.length + 1}`);
			}
			if (audit.action_type) {
				values.push(audit.action_type);
				placeholders.push(`action_type = $${values.length + 1}`);
			}
			if (audit.details) {
				values.push(audit.details);
				placeholders.push(`details = $${values.length + 1}`);
			}

			const sql = `
				UPDATE AuditLog
				SET ${placeholders.join(", ")}
				WHERE log_id = $1
				RETURNING *`;
			
			const result = await query(sql, [audit.log_id, ...values]);
			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async deleteAuditLog(auditId: number): Promise<void> {
		try {
			const sql = `
				DELETE FROM AuditLog
				WHERE log_id = $1`;
			
			await query(sql, [auditId]);
		} catch (error) {
			throw error;
		}
	}

	async deleteAllAuditLogs(): Promise<void> {
		try {
			const sql = `
				DELETE FROM AuditLog`;
			
			await query(sql);
		} catch (error) {
			throw error;
		}
	}

	async getAuditLogsByUserId(userId: number): Promise<AuditLogWithUsername[]> {
		try {
			const sql = `
				SELECT a.*, u.username
				FROM AuditLog a
				JOIN "User" u ON a.user_id = u.user_id
				WHERE user_id = $1`;
			const result = await query(sql, [userId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getAuditLogsByActionType(actionType: string): Promise<AuditLogWithUsername[]> {
		try {
			const sql = `
				SELECT a.*, u.username
				FROM AuditLog a
				JOIN "User" u ON a.user_id = u.user_id
				WHERE action_type = $1`;
			const result = await query(sql, [actionType]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getAuditLogsByPage(page: number): Promise<AuditLogWithUsername[]> {
		try {
			const sql = `
				SELECT a.*, u.username
				FROM AuditLog a
				JOIN "User" u ON a.user_id = u.user_id
				ORDER BY a.timestamp DESC
				LIMIT 10
				OFFSET $1`;
			const result = await query(sql, [(page - 1) * 10]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}
}

export default new AuditLogModel();
