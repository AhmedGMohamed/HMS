// src/app/models/EmployeePayment.model.ts
import { query } from "./database/connection.js";
import {
	EmployeePayment,
	CreateEmployeePaymentDTO
} from "../utils/types/employees.d.js";

export default class EmployeePaymentModel {
	static async getAllPayments(): Promise<EmployeePayment[]> {
		const sql = "SELECT * FROM EmployeePayment";
		const { rows } = await query(sql);
		return rows;
	}

	static async getPaymentById(
		payment_id: number
	): Promise<EmployeePayment | null> {
		const sql = "SELECT * FROM EmployeePayment WHERE payment_id = $1";
		const { rows } = await query(sql, [payment_id]);
		return rows[0] || null;
	}

	static async getUnpaidSystemPayments(): Promise<EmployeePayment[]> {
		const sql =
			"SELECT * FROM EmployeePayment WHERE is_paid = false AND paid_by_user_id IS NULL AND is_void = false";
		const { rows } = await query(sql);
		return rows;
	}

	static async getPaymentsByEmployeeId(
		employee_id: number
	): Promise<EmployeePayment[]> {
		const sql = "SELECT * FROM EmployeePayment WHERE employee_id = $1";
		const { rows } = await query(sql, [employee_id]);
		return rows;
	}

	static async getPaidPaymentsByEmployeeId(
		employee_id: number
	): Promise<EmployeePayment[]> {
		const sql = "SELECT * FROM EmployeePayment WHERE employee_id = $1 AND is_paid = true";
		const { rows } = await query(sql, [employee_id]);
		return rows;
	}
	

	static async createPayment(
		dto: CreateEmployeePaymentDTO
	): Promise<EmployeePayment> {
		const sql = `
      INSERT INTO EmployeePayment (
        employee_id, payment_amount, extra_payment_type, payment_type,
        percentage_scope, extra_amount, paid_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
		const values = [
			dto.employee_id,
			dto.payment_amount,
			dto.extra_payment_type,
			dto.payment_type,
			dto.percentage_scope,
			dto.extra_amount,
			dto.paid_by_user_id
		];
		const { rows } = await query(sql, values);
		return rows[0];
	}

	static async updatePayment(
		payment_id: number,
		dto: Partial<CreateEmployeePaymentDTO>
	): Promise<EmployeePayment | null> {
		const fields: string[] = [];
		const values: any[] = [];
		let index = 1;

		Object.entries(dto).forEach(([key, value]) => {
			if (value !== undefined) {
				fields.push(`${key} = $${index}`);
				values.push(value);
				index++;
			}
		});

		if (fields.length === 0) {
			throw new Error("No fields to update");
		}

		const sql = `UPDATE EmployeePayment SET ${fields.join(
			", "
		)} WHERE payment_id = $${index} RETURNING *`;
		values.push(payment_id);
		const { rows } = await query(sql, values);
		return rows[0] || null;
	}

	static async markPaymentAsPaid(
		payment_id: number,
		paid_by_user_id: number
	): Promise<EmployeePayment | null> {
		const sql = `
      UPDATE EmployeePayment 
      SET is_paid = true, paid_timestamp = CURRENT_TIMESTAMP, paid_by_user_id = $2
      WHERE payment_id = $1
      RETURNING *
    `;
		const { rows } = await query(sql, [payment_id, paid_by_user_id]);
		return rows[0] || null;
	}

	static async voidPayment(
		payment_id: number
	): Promise<EmployeePayment | null> {
		const sql = `
      UPDATE EmployeePayment 
      SET is_void = true
      WHERE payment_id = $1
      RETURNING *
    `;
		const { rows } = await query(sql, [payment_id]);
		return rows[0] || null;
	}
}
