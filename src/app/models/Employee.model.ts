// src/app/models/Employee.model.ts
import { query } from "./database/connection.js";
import { Employee, CreateEmployeeDTO } from "../utils/types/employees.js";

export interface EmployeeListOptions {
	offset?: number;
	limit?: number;
	type?: "all" | "doctor" | "nurse" | "other";
	search?: string;
	isActive?: boolean;
	shiftType?: "morning" | "night";
	sort?: "name" | "hireDate" | "basePay" | "shiftType";
	dir?: "asc" | "desc";
}

const EMPLOYEE_SORT_COLUMNS = {
	name: "name",
	hireDate: "hire_date",
	basePay: "base_pay",
	shiftType: "shift_type"
} as const;

/**
 * Shared WHERE builder for the list + count queries so the total can
 * never drift away from the page's filters.
 */
function buildEmployeeWhere(options: EmployeeListOptions): {
	where: string;
	params: unknown[];
} {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (options.type && options.type !== "all") {
		params.push(options.type);
		clauses.push(`employee_type = $${params.length}`);
	}
	if (options.search) {
		params.push(`%${options.search}%`);
		clauses.push(`name ILIKE $${params.length}`);
	}
	if (options.isActive != null) {
		params.push(options.isActive);
		clauses.push(`is_active = $${params.length}`);
	}
	if (options.shiftType) {
		params.push(options.shiftType);
		clauses.push(`shift_type = $${params.length}`);
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
		params
	};
}

export default class EmployeeModel {
	static async getAllEmployees(
		options: EmployeeListOptions = {}
	): Promise<{ rows: Employee[]; total: number }> {
		const { where, params } = buildEmployeeWhere(options);
		const sortColumn = EMPLOYEE_SORT_COLUMNS[options.sort ?? "name"];
		const dir = options.dir === "desc" ? "DESC" : "ASC";

		const dataParams = [...params];
		let paginationSql = "";
		if (options.limit != null && options.offset != null) {
			dataParams.push(options.limit, options.offset);
			paginationSql = ` LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
		}

		const sql = `SELECT * FROM Employee ${where} ORDER BY ${sortColumn} ${dir} NULLS LAST, employee_id ${dir}${paginationSql};`;
		const countSql = `SELECT COUNT(*)::int AS total FROM Employee ${where};`;

		const [dataResult, countResult] = await Promise.all([
			query(sql, dataParams),
			query(countSql, params)
		]);

		return {
			rows: dataResult.rows,
			total: Number(countResult.rows[0]?.total ?? 0)
		};
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
			dto.extra_amount || 0.0,
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
		const values: unknown[] = [];
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

	// Add method to get available nurses
	static async getAvailableNurses(): Promise<any[]> {
		const sql = `
			SELECT e.employee_id, e.name, e.phone, e.hire_date
			FROM Employee e
			WHERE e.employee_type = 'nurse' AND e.is_active = true
			ORDER BY e.name;
		`;
		const result = await query(sql);
		return result.rows;
	}
}
