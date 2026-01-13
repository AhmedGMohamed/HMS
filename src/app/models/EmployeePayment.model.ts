// src/app/models/EmployeePayment.model.ts
import { query } from "./database/connection.js";
import {
	EmployeePayment,
	CreateEmployeePaymentDTO,
	PaymentPatientAssociation
} from "../utils/types/employees.js";

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
			"SELECT * FROM EmployeePayment WHERE is_paid = false AND paid_by_user_id IS NULL AND is_void = false ORDER BY issued_timestamp DESC";
		const { rows } = await query(sql);
		return rows;
	}

	static async getPaymentsByEmployeeId(
		employee_id: number
	): Promise<EmployeePayment[]> {
		const sql =
			"SELECT * FROM EmployeePayment WHERE employee_id = $1 ORDER BY issued_timestamp DESC";
		const { rows } = await query(sql, [employee_id]);
		return rows;
	}

	static async getPaidPaymentsByEmployeeId(
		employee_id: number
	): Promise<EmployeePayment[]> {
		const sql =
			"SELECT * FROM EmployeePayment WHERE employee_id = $1 AND is_paid = true ORDER BY issued_timestamp DESC";
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

	static async createPaymentWithPatients(
		paymentData: CreateEmployeePaymentDTO,
		patientAssociations: PaymentPatientAssociation[]
	): Promise<any> {
		await query("BEGIN");
		try {
			// Create the payment record
			const paymentResult = await this.createPayment(paymentData);
			const paymentId = paymentResult.payment_id;

			// Create patient associations
			for (const association of patientAssociations) {
				await query(
					`INSERT INTO EmployeePaymentPatient (
                		    payment_id, patient_id, patient_history_id, work_date,
                		    hours_worked, payment_amount, payment_type, active_service_id
                		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
					[
						paymentId,
						association.patient_id,
						association.patient_history_id,
						association.work_date,
						association.hours_worked,
						association.payment_amount,
						association.payment_type,
						association.active_service_id || null
					]
				);
			}

			await query("COMMIT");
			return paymentResult;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	static async removeServicePayments(activeServiceId: number): Promise<void> {
		await query("BEGIN");
		try {
			// Find payments associated with this service
			const findPaymentsSql = `
				SELECT payment_id 
				FROM EmployeePaymentPatient 
				WHERE active_service_id = $1
			`;
			const result = await query(findPaymentsSql, [activeServiceId]);

			if (result.rows.length > 0) {
				const paymentIds = result.rows.map(row => row.payment_id);

				// Void or delete payments
				// Check if any are already paid
				const checkPaidSql = `
					SELECT payment_id FROM EmployeePayment 
					WHERE payment_id = ANY($1) AND is_paid = true
				`;
				const paidResult = await query(checkPaidSql, [paymentIds]);

				if (paidResult.rows.length > 0) {
					// Some are paid, only void unpaid ones
					const paidIds = paidResult.rows.map(r => r.payment_id);
					const unpaidIds = paymentIds.filter(id => !paidIds.includes(id));

					if (unpaidIds.length > 0) {
						await query(`UPDATE EmployeePayment SET is_void = true WHERE payment_id = ANY($1)`, [unpaidIds]);
					}
				} else {
					// All unpaid, void them
					await query(`UPDATE EmployeePayment SET is_void = true WHERE payment_id = ANY($1)`, [paymentIds]);
				}
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getPaymentWithPatients(paymentId: number): Promise<any> {
		const paymentResult = await query(
			`SELECT ep.*, u.username as paid_by_username
         	FROM EmployeePayment ep
         	LEFT JOIN "User" u ON ep.paid_by_user_id = u.user_id
         	WHERE ep.payment_id = $1`,
			[paymentId]
		);

		if (paymentResult.rows.length === 0) {
			return null;
		}

		const payment = paymentResult.rows[0];

		// Get associated patients
		const patientsResult = await query(
			`SELECT epp.*, p.name as patient_name, ph.diagnosis,
        	        ph.admission_time, ph.discharge_time
        	 FROM EmployeePaymentPatient epp
        	 JOIN Patient p ON epp.patient_id = p.patient_id
        	 LEFT JOIN PatientHistory ph ON epp.patient_history_id = ph.patient_history_id
        	 WHERE epp.payment_id = $1
        	 ORDER BY epp.work_date DESC`,
			[paymentId]
		);

		payment.patient_associations = patientsResult.rows;
		return payment;
	}
}
