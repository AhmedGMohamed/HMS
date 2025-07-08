// src/app/models/EmployeeClockIn.model.ts
import { query } from "./database/connection.js";
import {
	EmployeeClockIn,
	CreateEmployeeClockInDTO,
	ShiftType
} from "../utils/types/employees.js";
import EmployeeModel from "./Employee.model.js";

export default class EmployeeClockInModel {
	static async getAllClockIns(): Promise<EmployeeClockIn[]> {
		const sql = "SELECT * FROM EmployeeClockIn";
		const { rows } = await query(sql);
		return rows;
	}

	static async getClockInById(
		clock_id: number
	): Promise<EmployeeClockIn | null> {
		const sql = "SELECT * FROM EmployeeClockIn WHERE clock_id = $1";
		const { rows } = await query(sql, [clock_id]);
		return rows[0] || null;
	}

	static async getClockInsByEmployeeId(
		employee_id: number
	): Promise<EmployeeClockIn[]> {
		const sql = "SELECT * FROM EmployeeClockIn WHERE employee_id = $1";
		const { rows } = await query(sql, [employee_id]);
		return rows;
	}

	static async getLastClockInByEmployeeId(
		employee_id: number
	): Promise<EmployeeClockIn | null> {
		const sql = "SELECT * FROM EmployeeClockIn WHERE employee_id = $1 ORDER BY clock_id DESC LIMIT 1";
		const { rows } = await query(sql, [employee_id]);
		return rows[0] || null;
	}

	static async createClockIn(
		dto: CreateEmployeeClockInDTO
	): Promise<EmployeeClockIn> {
		const sql = `
      INSERT INTO EmployeeClockIn (
        employee_id, clock_in, clock_out, pay_deduction
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
		const values = [
			dto.employee_id,
			dto.clock_in,
			dto.clock_out,
			dto.pay_deduction || 0
		];
		const { rows } = await query(sql, values);
		return rows[0];
	}

	static async updateClockIn(
		clock_id: number,
		dto: Partial<CreateEmployeeClockInDTO>
	): Promise<EmployeeClockIn | null> {
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

		const sql = `UPDATE EmployeeClockIn SET ${fields.join(
			", "
		)} WHERE clock_id = $${index} RETURNING *`;
		values.push(clock_id);
		const { rows } = await query(sql, values);
		return rows[0] || null;
	}

	static async calculatePayDeduction(
		employee_id: number,
		clock_in: string,
		shift_type: ShiftType
	): Promise<number> {
		const shiftStart = shift_type === "morning" ? "08:00:00" : "20:00:00";
		const shiftStartTime = new Date(
			`${clock_in.split("T")[0]}T${shiftStart}`
		);
		const clockInTime = new Date(clock_in);
		const diffHours =
			(clockInTime.getTime() - shiftStartTime.getTime()) /
			(1000 * 60 * 60);

		const employee = await EmployeeModel.getEmployeeById(employee_id);
		if (!employee || !employee.base_pay) return 0;

		if (diffHours >= 6) {
			return employee.base_pay; // Full deduction
		} else if (diffHours >= 3) {
			return employee.base_pay / 2; // Half deduction
		}
		return 0;
	}
}
