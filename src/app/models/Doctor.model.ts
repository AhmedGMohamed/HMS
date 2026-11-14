// src/app/models/Doctor.model.ts
import { query } from "./database/connection.js";
import { Doctor, CreateDoctorDTO, Employee } from "../utils/types/employees.js";

export interface DoctorListOptions {
	offset?: number;
	limit?: number;
	search?: string;
	isActive?: boolean;
	shiftType?: "morning" | "night";
	doctorType?: string;
	sort?:
		| "name"
		| "doctorType"
		| "hireDate"
		| "dailyPay"
		| "perPatientPay"
		| "shiftType";
	dir?: "asc" | "desc";
}

const DOCTOR_SORT_COLUMNS = {
	name: "e.name",
	doctorType: "d.doctor_type",
	hireDate: "e.hire_date",
	dailyPay: "d.daily_pay",
	perPatientPay: "d.per_patient_pay",
	shiftType: "e.shift_type"
} as const;

/**
 * Shared WHERE builder for the doctor list + count queries. `is_active`
 * comes from the Doctor row (it shadows the Employee column in the
 * selected payload), so filters, sort, and displayed value agree.
 */
function buildDoctorWhere(options: DoctorListOptions): {
	where: string;
	params: unknown[];
} {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (options.search) {
		params.push(`%${options.search}%`);
		clauses.push(`e.name ILIKE $${params.length}`);
	}
	if (options.isActive != null) {
		params.push(options.isActive);
		clauses.push(`d.is_active = $${params.length}`);
	}
	if (options.shiftType) {
		params.push(options.shiftType);
		clauses.push(`e.shift_type = $${params.length}`);
	}
	if (options.doctorType) {
		params.push(options.doctorType);
		clauses.push(`d.doctor_type = $${params.length}`);
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
		params
	};
}

export default class DoctorModel {
	static async getAllDoctors(
		options: DoctorListOptions = {}
	): Promise<{ rows: Doctor[]; total: number }> {
		const { where, params } = buildDoctorWhere(options);
		const sortColumn = DOCTOR_SORT_COLUMNS[options.sort ?? "name"];
		const dir = options.dir === "desc" ? "DESC" : "ASC";

		const dataParams = [...params];
		let paginationSql = "";
		if (options.limit != null && options.offset != null) {
			dataParams.push(options.limit, options.offset);
			paginationSql = ` LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
		}

		const sql = `
      SELECT e.*, d.doctor_type, d.is_active, d.daily_pay, d.per_patient_pay, 
             d.payment_calculation, d.referral_bonus
      FROM Employee e
      JOIN Doctor d ON e.employee_id = d.doctor_id
      ${where}
      ORDER BY ${sortColumn} ${dir} NULLS LAST, e.employee_id ${dir}${paginationSql}
    `;
		const countSql = `
      SELECT COUNT(*)::int AS total
      FROM Employee e
      JOIN Doctor d ON e.employee_id = d.doctor_id
      ${where};
    `;

		const [dataResult, countResult] = await Promise.all([
			query(sql, dataParams),
			query(countSql, params)
		]);

		return {
			rows: dataResult.rows,
			total: Number(countResult.rows[0]?.total ?? 0)
		};
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
          percentage_scope, need_clock_in, shift_type, shift_start_time, shift_end_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
				dto.shift_type,
				dto.shift_start_time,
				dto.shift_end_time
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
				"shift_type",
				"shift_start_time",
				"shift_end_time"
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

	static async getDoctorServicePrices(doctor_id: number): Promise<any[]> {
		const sql = `
			SELECT dsp.doctor_id, dsp.service_id, s.name as service_name, dsp.price
			FROM DoctorServicePrice dsp
			JOIN Service s ON dsp.service_id = s.service_id
			WHERE dsp.doctor_id = $1
		`;
		const { rows } = await query(sql, [doctor_id]);
		return rows;
	}

	static async setDoctorServicePrice(doctor_id: number, service_id: number, price: number): Promise<void> {
		const sql = `
			INSERT INTO DoctorServicePrice (doctor_id, service_id, price)
			VALUES ($1, $2, $3)
			ON CONFLICT (doctor_id, service_id)
			DO UPDATE SET
				price = EXCLUDED.price,
				updated_at = CURRENT_TIMESTAMP
		`;
		await query(sql, [doctor_id, service_id, price]);
	}

	/** Removes a doctor's override for one service (used when the UI
	 *  sends a `servicePrices` entry with `price: null`). */
	static async deleteDoctorServicePrice(doctor_id: number, service_id: number): Promise<void> {
		const sql = `
			DELETE FROM DoctorServicePrice
			WHERE doctor_id = $1 AND service_id = $2
		`;
		await query(sql, [doctor_id, service_id]);
	}
}
