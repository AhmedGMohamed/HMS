// src/app/models/Employee.model.ts
import {query} from "./database/connection.js";
import { Employee, CreateEmployeeDTO } from "../utils/types/employees.js";

export default class EmployeeModel {
	static async getAllEmployees(): Promise<Employee[]> {
		const sql = "SELECT * FROM Employee";
		const { rows } = await query(sql);
		return rows;
	}

	static async getEmployeeById(
		employee_id: number
	): Promise<Employee | null> {
		const sql = "SELECT * FROM Employee WHERE employee_id = $1";
		const { rows } = await query(sql, [employee_id]);
		return rows[0] || null;
	}

	static async createEmployee(dto: CreateEmployeeDTO): Promise<Employee> {
		const sql = `
      INSERT INTO Employee (
        name, phone, is_facility_employee, hire_date, is_active, employee_type, 
        base_pay, extra_amount, extra_payment_type, per_patient_payment_type, 
        percentage_scope, need_clock_in, shift_type, shift_start_time, shift_end_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
		const values = [
			dto.name,
			dto.phone,
			dto.is_facility_employee,
			dto.hire_date,
			dto.is_active || true,
			dto.employee_type,
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
		const { rows } = await query(sql, values);
		return rows[0];
	}

	static async updateEmployee(
		employee_id: number,
		dto: Partial<CreateEmployeeDTO>
	): Promise<Employee | null> {
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

		const sql = `UPDATE Employee SET ${fields.join(
			", "
		)} WHERE employee_id = $${index} RETURNING *`;
		values.push(employee_id);
		const { rows } = await query(sql, values);
		return rows[0] || null;
	}

	static async deleteEmployee(employee_id: number): Promise<void> {
		const sql = "DELETE FROM Employee WHERE employee_id = $1";
		await query(sql, [employee_id]);
	}

	static async searchEmployeesByName(name: string): Promise<Employee[]> {
		const sql = "SELECT * FROM Employee WHERE name ILIKE $1";
		const { rows } = await query(sql, [`%${name}%`]);
		return rows;
	}
}
