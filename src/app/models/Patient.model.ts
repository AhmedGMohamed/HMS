import { query } from "./database/connection.js";
import {
	Patient,
	CreatePatientDTO,
	UpdatePatientDTO,
	PatientSearchResult
} from "../utils/types/patients.js";

export class PatientModel {
	async getAllPatients(): Promise<Patient[]> {
		const sql = `
            SELECT * FROM Patient 
            ORDER BY name;
        `;
		const result = await query(sql);
		return result.rows;
	}

	async getPatientById(patientId: number): Promise<Patient | null> {
		const sql = `
            SELECT * FROM Patient 
            WHERE patient_id = $1;
        `;
		const result = await query(sql, [patientId]);
		return result.rows[0] || null;
	}

	async createPatient(data: CreatePatientDTO): Promise<Patient> {
		const sql = `
            INSERT INTO Patient (
                name, gender, phone, address, payment_type,
                insurance_id, insurance_card_id, guardian_info,
                quick_check, referring_doctor_id, is_active, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `;

		const result = await query(sql, [
			data.name,
			data.gender,
			data.phone || null,
			data.address || null,
			data.payment_type,
			data.insurance_id || null,
			data.insurance_card_id || null,
			data.guardian_info ? JSON.stringify(data.guardian_info) : null,
			data.quick_check,
			data.referring_doctor_id || null,
			data.is_active || false,
			data.created_by_user_id
		]);

		return result.rows[0];
	}

	async updatePatient(data: UpdatePatientDTO): Promise<Patient | null> {
		const updateFields: string[] = [];
		const values: any[] = [];
		let paramCount = 1;

		if (data.name) {
			updateFields.push(`name = $${paramCount}`);
			values.push(data.name);
			paramCount++;
		}
		if (data.gender) {
			updateFields.push(`gender = $${paramCount}`);
			values.push(data.gender);
			paramCount++;
		}
		if (data.phone !== undefined) {
			updateFields.push(`phone = $${paramCount}`);
			values.push(data.phone);
			paramCount++;
		}
		if (data.address !== undefined) {
			updateFields.push(`address = $${paramCount}`);
			values.push(data.address);
			paramCount++;
		}
		if (data.payment_type) {
			updateFields.push(`payment_type = $${paramCount}`);
			values.push(data.payment_type);
			paramCount++;
		}
		if (data.insurance_id !== undefined) {
			updateFields.push(`insurance_id = $${paramCount}`);
			values.push(data.insurance_id);
			paramCount++;
		}
		if (data.insurance_card_id !== undefined) {
			updateFields.push(`insurance_card_id = $${paramCount}`);
			values.push(data.insurance_card_id);
			paramCount++;
		}
		if (data.guardian_info !== undefined) {
			updateFields.push(`guardian_info = $${paramCount}`);
			values.push(
				data.guardian_info ? JSON.stringify(data.guardian_info) : null
			);
			paramCount++;
		}

		if (updateFields.length === 0) {
			return this.getPatientById(data.patient_id);
		}

		values.push(data.patient_id);
		const sql = `
            UPDATE Patient 
            SET ${updateFields.join(", ")}
            WHERE patient_id = $${paramCount}
            RETURNING *;
        `;

		const result = await query(sql, values);
		return result.rows[0];
	}

	async searchPatients(searchTerm: string): Promise<PatientSearchResult[]> {
		const sql = `
            SELECT 
                patient_id,
                name,
                is_active,
                registration_date
            FROM Patient 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY 
                CASE 
                    WHEN LOWER(name) = LOWER($2) THEN 1
                    WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 2
                    ELSE 3
                END,
                name
            LIMIT 10;
        `;
		const result = await query(sql, [`%${searchTerm}%`, searchTerm]);
		return result.rows;
	}

	async getPatientSuggestions(
		prefix: string
	): Promise<PatientSearchResult[]> {
		const sql = `
            SELECT 
                patient_id,
                name,
                is_active,
                registration_date
            FROM Patient 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY 
                CASE 
                    WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 1
                    ELSE 2
                END,
                LENGTH(name),
                name
            LIMIT 5;
        `;
		const result = await query(sql, [`${prefix}%`, prefix]);
		return result.rows;
	}

	async getActivePatients(): Promise<Patient[]> {
		const sql = `
			SELECT * FROM Patient
			WHERE is_active = true
			`
		const result = await query(sql);
		return result.rows;
	}
}

export default new PatientModel();
