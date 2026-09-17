// src/app/models/EmployeeClockIn.model.ts
import { query } from "./database/connection.js";
import {
	EmployeeClockIn,
	CreateEmployeeClockInDTO,
	Employee
} from "../utils/types/employees.js";
import EmployeeModel from "./Employee.model.js";

// Only these columns may be written by updateClockIn (prevents
// arbitrary-key SQL identifier interpolation from request bodies).
const UPDATABLE_FIELDS = [
	"employee_id",
	"clock_in",
	"clock_out",
	"pay_deduction"
] as const;

export default class EmployeeClockInModel {
	static async getAllClockIns(): Promise<EmployeeClockIn[]> {
		const sql = "SELECT * FROM EmployeeClockIn";
		const { rows } = await query(sql);
		return rows;
	}

	static async getEligibleEmployees(): Promise<Array<Partial<Employee>>> {
		// Returns ALL employees — the renderer filters need_clock_in/
		// is_active client-side for the picker and uses the full list
		// as the clock-in name map (phase_6.8_plan.md §1.3, A18).
		const sql = `
			SELECT employee_id, name, employee_type, need_clock_in, is_active,
			       shift_start_time, shift_end_time
			FROM Employee
			ORDER BY name;
		`;
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

	static async getClockedInEmployees(): Promise<
		Array<
			EmployeeClockIn & {
				shift_start_time: string;
				shift_end_time: string;
			}
		>
	> {
		const sql = `SELECT ec.*,
			e.shift_start_time,
			e.shift_end_time
			FROM EmployeeClockIn ec
			LEFT JOIN Employee e ON ec.employee_id = e.employee_id
			WHERE clock_in IS NOT NULL
			AND clock_out IS NULL;`;
		const { rows } = await query(sql);
		return rows;
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
		const sql =
			"SELECT * FROM EmployeeClockIn WHERE employee_id = $1 ORDER BY clock_id DESC LIMIT 1";
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
			if (
				value !== undefined &&
				(UPDATABLE_FIELDS as readonly string[]).includes(key)
			) {
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
		shift_start_time: string | number | Date
	): Promise<number> {
		const shiftStartTime = new Date(shift_start_time);
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

	static async deleteClockIn(clock_id: number): Promise<void> {
		const sql = "DELETE FROM EmployeeClockIn WHERE clock_id = $1";
		await query(sql, [clock_id]);
	}
}
