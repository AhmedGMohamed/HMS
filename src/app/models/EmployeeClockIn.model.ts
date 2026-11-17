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

/** An open clock-in row joined with the employee's shift window. */
export type ActiveClockInRow = EmployeeClockIn & {
	shift_start_time: string | null;
	shift_end_time: string | null;
};

export interface ClockInListOptions {
	offset?: number;
	limit?: number;
	status?: "all" | "active" | "closed";
	search?: string;
	/** `YYYY-MM-DD` — `clock_in >= from::date`. */
	from?: string;
	/** `YYYY-MM-DD` — `clock_in < to::date + interval '1 day'`. */
	to?: string;
	sort?: "employee" | "clockIn" | "clockOut" | "duration" | "payDeduction";
	dir?: "asc" | "desc";
}

export interface ClockedInListOptions {
	offset?: number;
	limit?: number;
	/** Only open rows whose `clock_in` predates `today`. */
	missingOnly?: boolean;
	/** `YYYY-MM-DD` client-local day; defaults to the DB's `CURRENT_DATE`. */
	today?: string;
	sort?: "clockIn" | "duration" | "employee";
	dir?: "asc" | "desc";
}

export interface ClockingStats {
	activeCount: number;
	missingCount: number;
	over12hCount: number;
	openEmployeeIds: number[];
	duplicateEmployeeIds: number[];
}

/**
 * Whitelisted ORDER BY expressions — request input never reaches the
 * SQL string, only these fixed fragments do.
 */
const CLOCK_IN_SORT_COLUMNS = {
	employee: "e.name",
	clockIn: "ec.clock_in",
	clockOut: "ec.clock_out",
	duration: "COALESCE(ec.clock_out, now()) - ec.clock_in",
	payDeduction: "ec.pay_deduction"
} as const;

const CLOCKED_IN_SORT_COLUMNS = {
	employee: "e.name",
	clockIn: "ec.clock_in",
	// Longer shift = older clock_in; the caller inverts the direction.
	duration: "ec.clock_in"
} as const;

/**
 * Shared WHERE builder for the history list and its count query, so the
 * total can never drift away from the rows.
 */
function buildClockInWhere(options: ClockInListOptions): {
	where: string;
	params: unknown[];
} {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (options.status === "active") clauses.push("ec.clock_out IS NULL");
	if (options.status === "closed") clauses.push("ec.clock_out IS NOT NULL");
	if (options.search) {
		params.push(`%${options.search}%`);
		clauses.push(`e.name ILIKE $${params.length}`);
	}
	if (options.from) {
		params.push(options.from);
		clauses.push(`ec.clock_in >= $${params.length}::date`);
	}
	if (options.to) {
		params.push(options.to);
		clauses.push(`ec.clock_in < ($${params.length}::date + interval '1 day')`);
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
		params
	};
}

export default class EmployeeClockInModel {
	/**
	 * Paginated clock-in history. `LEFT JOIN Employee` only exists so the
	 * `employee` sort key and the name search have something to read;
	 * the returned rows stay in the plain `EmployeeClockIn` shape (the
	 * page owns the employee name map).
	 */
	static async getAllClockIns(
		options: ClockInListOptions = {}
	): Promise<{ rows: EmployeeClockIn[]; total: number }> {
		const { where, params } = buildClockInWhere(options);
		const sortColumn =
			CLOCK_IN_SORT_COLUMNS[options.sort ?? "clockIn"];
		const dir = options.dir === "asc" ? "ASC" : "DESC";

		const dataParams = [...params];
		let paginationSql = "";
		if (options.limit != null && options.offset != null) {
			dataParams.push(options.limit, options.offset);
			paginationSql = ` LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
		}

		const sql = `
			SELECT ec.*
			FROM EmployeeClockIn ec
			LEFT JOIN Employee e ON e.employee_id = ec.employee_id
			${where}
			ORDER BY ${sortColumn} ${dir} NULLS LAST, ec.clock_id DESC${paginationSql};
		`;
		const countSql = `
			SELECT COUNT(*)::int AS total
			FROM EmployeeClockIn ec
			LEFT JOIN Employee e ON e.employee_id = ec.employee_id
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

	static async getClockedInEmployees(
		options: ClockedInListOptions = {}
	): Promise<{ rows: ActiveClockInRow[]; total: number }> {
		const clauses: string[] = [
			"ec.clock_in IS NOT NULL",
			"ec.clock_out IS NULL"
		];
		const params: unknown[] = [];

		if (options.missingOnly) {
			// `today` is the client's local day so the filter agrees with
			// the `missing_count` KPI regardless of server timezone.
			params.push(options.today ?? null);
			clauses.push(
				`ec.clock_in < COALESCE($${params.length}::date, CURRENT_DATE)`
			);
		}

		const where = `WHERE ${clauses.join(" AND ")}`;

		const sortKey = options.sort ?? "clockIn";
		const sortColumn = CLOCKED_IN_SORT_COLUMNS[sortKey];
		const requested = options.dir === "desc" ? "DESC" : "ASC";
		// Longer shift = older clock_in → invert the direction for
		// `duration` so "asc" still means "shortest first".
		const dir =
			sortKey === "duration"
				? requested === "ASC"
					? "DESC"
					: "ASC"
				: requested;

		const dataParams = [...params];
		let paginationSql = "";
		if (options.limit != null && options.offset != null) {
			dataParams.push(options.limit, options.offset);
			paginationSql = ` LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
		}

		const sql = `
			SELECT ec.*,
				e.shift_start_time,
				e.shift_end_time
			FROM EmployeeClockIn ec
			LEFT JOIN Employee e ON ec.employee_id = e.employee_id
			${where}
			ORDER BY ${sortColumn} ${dir} NULLS LAST, ec.clock_id DESC${paginationSql};
		`;
		const countSql = `
			SELECT COUNT(*)::int AS total
			FROM EmployeeClockIn ec
			LEFT JOIN Employee e ON ec.employee_id = e.employee_id
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

	/**
	 * KPI/badge figures for the Active tab. Separate from the paginated
	 * list so the strip, tab badge, duplicate badges, and the
	 * new-clock-in picker guard stay correct when only one page is
	 * loaded.
	 */
	static async getClockedInStats(today?: string): Promise<ClockingStats> {
		const aggregateSql = `
			SELECT
				COUNT(*)::int AS active_count,
				COUNT(*) FILTER (
					WHERE ec.clock_in < COALESCE($1::date, CURRENT_DATE)
				)::int AS missing_count,
				COUNT(*) FILTER (
					WHERE now() - ec.clock_in >= interval '12 hours'
				)::int AS over12h_count
			FROM EmployeeClockIn ec
			WHERE ec.clock_out IS NULL;
		`;
		const openSql = `
			SELECT employee_id, COUNT(*)::int AS open_count
			FROM EmployeeClockIn
			WHERE clock_out IS NULL
			GROUP BY employee_id;
		`;

		const [aggregateResult, openResult] = await Promise.all([
			query(aggregateSql, [today ?? null]),
			query(openSql)
		]);

		const aggregate = aggregateResult.rows[0] ?? {};
		const openRows: Array<{ employee_id: number; open_count: number }> =
			openResult.rows;

		return {
			activeCount: Number(aggregate.active_count ?? 0),
			missingCount: Number(aggregate.missing_count ?? 0),
			over12hCount: Number(aggregate.over12h_count ?? 0),
			openEmployeeIds: openRows.map((row) =>
				Number(row.employee_id)
			),
			duplicateEmployeeIds: openRows
				.filter((row) => Number(row.open_count) > 1)
				.map((row) => Number(row.employee_id))
		};
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
		const values: unknown[] = [];
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
