// src/app/models/Doctor.model.ts
import { query } from "./database/connection.js";
import { Doctor, CreateDoctorDTO, Employee } from "../utils/types/employees.js";

export default class DoctorModel {
	static async getAllDoctors(): Promise<Doctor[]> {
		const sql = `
      SELECT e.*, d.doctor_type, d.is_active, d.daily_pay, d.per_patient_pay, 
             d.payment_calculation, d.referral_bonus
      FROM Employee e
      JOIN Doctor d ON e.employee_id = d.doctor_id
    `;
		const { rows } = await query(sql);
		return rows;
	}

	static async getDoctorById(doctor_id: number): Promise<Doctor | null> {
		const sql = `
      SELECT e.*, d.doctor_type, d.is_active, d.daily_pay, d.per_patient_pay, 
             d.payment_calculation, d.referral_bonus
      FROM Employee e
      JOIN Doctor d ON e.employee_id = d.doctor_id
      WHERE e.employee_id = $1
    `;
		const { rows } = await query(sql, [doctor_id]);
		return rows[0] || null;
	}

	static async createDoctor(dto: CreateDoctorDTO): Promise<Doctor> {
		try {
			await query("BEGIN");

			const employeeQuery = `
        INSERT INTO Employee (
          name, phone, is_facility_employee, is_active, hire_date, employee_type, 
          base_pay, extra_amount, extra_payment_type, per_patient_payment_type, 
          percentage_scope, need_clock_in, shift_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
			const employeeValues = [
				dto.name,
				dto.phone,
				dto.is_facility_employee,
				dto.is_active || true,
				dto.hire_date,
				"doctor",
				dto.base_pay,
				dto.extra_amount || 0.00,
				dto.extra_payment_type,
				dto.per_patient_payment_type,
				dto.percentage_scope,
				dto.need_clock_in,
				dto.shift_type
			];
			const { rows: employeeRows } = await query(
				employeeQuery,
				employeeValues
			);
			const employee = employeeRows[0];

			const doctorQuery = `
        INSERT INTO Doctor (
          doctor_id, doctor_type, is_active, daily_pay, per_patient_pay, 
          payment_calculation, referral_bonus
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
			const doctorValues = [
				employee.employee_id,
				dto.doctor_type,
				dto.is_active,
				dto.daily_pay,
				dto.per_patient_pay,
				dto.payment_calculation,
				dto.referral_bonus
			];
			const { rows: doctorRows } = await query(
				doctorQuery,
				doctorValues
			);

			await query("COMMIT");
			return { ...employee, ...doctorRows[0] };
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	static async updateDoctor(
		doctor_id: number,
		dto: Partial<CreateDoctorDTO>
	): Promise<Doctor | null> {
		try {
			await query("BEGIN");

			const employeeFields: string[] = [];
			const employeeValues: any[] = [];
			let index = 1;

			const employeeKeys = [
				"name",
				"phone",
				"is_facility_employee",
				"hire_date",
				"is_active",
				"base_pay",
				"extra_amount",
				"extra_payment_type",
				"per_patient_payment_type",
				"percentage_scope",
				"need_clock_in",
				"shift_type"
			];

			Object.entries(dto).forEach(([key, value]) => {
				if (employeeKeys.includes(key) && value !== undefined) {
					employeeFields.push(`${key} = $${index}`);
					employeeValues.push(value);
					index++;
				}
			});

			let employee: Employee | null = null;
			if (employeeFields.length > 0) {
				const employeeQuery = `
          UPDATE Employee SET ${employeeFields.join(", ")}
          WHERE employee_id = $${index} RETURNING *
        `;
				employeeValues.push(doctor_id);
				const { rows } = await query(
					employeeQuery,
					employeeValues
				);
				employee = rows[0];
			}

			const doctorFields: string[] = [];
			const doctorValues: any[] = [];
			index = 1;

			const doctorKeys = [
				"doctor_type",
				"is_active",
				"daily_pay",
				"per_patient_pay",
				"payment_calculation",
				"referral_bonus"
			];

			Object.entries(dto).forEach(([key, value]) => {
				if (doctorKeys.includes(key) && value !== undefined) {
					doctorFields.push(`${key} = $${index}`);
					doctorValues.push(value);
					index++;
				}
			});

			let doctor: any = null;
			if (doctorFields.length > 0) {
				const doctorQuery = `
          UPDATE Doctor SET ${doctorFields.join(", ")}
          WHERE doctor_id = $${index} RETURNING *
        `;
				doctorValues.push(doctor_id);
				const { rows } = await query(doctorQuery, doctorValues);
				doctor = rows[0];
			}

			await query("COMMIT");
			if (!employee && !doctor) return null;
			return {
				...(employee || (await this.getDoctorById(doctor_id))),
				...doctor
			};
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	static async deleteDoctor(doctor_id: number): Promise<void> {
		try {
			await query("BEGIN");
			await query("DELETE FROM Doctor WHERE doctor_id = $1", [
				doctor_id
			]);
			await query("DELETE FROM Employee WHERE employee_id = $1", [
				doctor_id
			]);
			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	static async searchDoctorsByName(name: string): Promise<Doctor[]> {
		const sql = `
      SELECT e.*, d.doctor_type, d.is_active, d.daily_pay, d.per_patient_pay, 
             d.payment_calculation, d.referral_bonus
      FROM Employee e
      JOIN Doctor d ON e.employee_id = d.doctor_id
      WHERE e.name ILIKE $1
    `;
		const { rows } = await query(sql, [`%${name}%`]);
		return rows;
	}
}
