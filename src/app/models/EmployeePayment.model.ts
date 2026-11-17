// src/app/models/EmployeePayment.model.ts
import { query } from "./database/connection.js";
import {
	EmployeePayment,
	CreateEmployeePaymentDTO,
	PaymentPatientAssociation
} from "../utils/types/employees.js";

export interface PaymentListOptions {
	offset?: number;
	limit?: number;
}

export interface PendingPaymentFilters {
	/** Inclusive `YYYY-MM-DD` lower bound on `issued_timestamp`. */
	from?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on `issued_timestamp`. */
	to?: string;
	/** ILIKE match on the employee name. */
	search?: string;
}

export interface PendingGroupListOptions extends PendingPaymentFilters {
	offset?: number;
	limit?: number;
	sort?: "employee" | "oldest" | "newest" | "totalAmount";
	dir?: "asc" | "desc";
}

export interface PendingPaymentGroupRow {
	employee_id: number;
	employee_name: string;
	payment_count: number;
	oldest_issued_at: string;
	newest_issued_at: string;
	total_amount: number;
}

export interface PendingPaymentStatsRow {
	pending_count: number;
	employee_count: number;
}

/**
 * The pending queue is the "system-issued, still unpaid" set: not paid,
 * not voided, and never stamped by a user (manual payments carry a
 * `paid_by_user_id` from creation).
 */
const PENDING_CLAUSES = [
	"ep.is_paid = false",
	"ep.is_void = false",
	"ep.paid_by_user_id IS NULL"
];

const PENDING_GROUP_SORT_COLUMNS = {
	employee: "employee_name",
	oldest: "oldest_issued_at",
	newest: "newest_issued_at",
	totalAmount: "total_amount"
} as const;

function buildPendingWhere(filters: PendingPaymentFilters): {
	where: string;
	params: unknown[];
} {
	const clauses = [...PENDING_CLAUSES];
	const params: unknown[] = [];

	if (filters.from) {
		params.push(filters.from);
		clauses.push(`ep.issued_timestamp >= $${params.length}::date`);
	}
	if (filters.to) {
		params.push(filters.to);
		clauses.push(
			`ep.issued_timestamp < ($${params.length}::date + interval '1 day')`
		);
	}
	if (filters.search) {
		params.push(`%${filters.search}%`);
		clauses.push(`e.name ILIKE $${params.length}`);
	}

	return {
		where: `WHERE ${clauses.join(" AND ")}`,
		params
	};
}

export default class EmployeePaymentModel {
	static async getAllPayments(
		options: PaymentListOptions = {}
	): Promise<{ rows: EmployeePayment[]; total: number }> {
		const dataParams: unknown[] = [];
		let paginationSql = "";
		if (options.limit != null && options.offset != null) {
			dataParams.push(options.limit, options.offset);
			paginationSql = ` LIMIT $1 OFFSET $2`;
		}

		const sql = `SELECT * FROM EmployeePayment ORDER BY payment_id DESC${paginationSql};`;
		const countSql = "SELECT COUNT(*)::int AS total FROM EmployeePayment;";

		const [dataResult, countResult] = await Promise.all([
			query(sql, dataParams),
			query(countSql)
		]);

		return {
			rows: dataResult.rows,
			total: Number(countResult.rows[0]?.total ?? 0)
		};
	}

	/**
	 * Grouped pending queue: one row per employee with the aggregate of
	 * that employee's pending payments. The individual payments are
	 * fetched on demand (`getPendingPaymentsForEmployee`) so expanding a
	 * row never inflates the list payload.
	 */
	static async getPendingPaymentGroups(
		options: PendingGroupListOptions = {}
	): Promise<{ rows: PendingPaymentGroupRow[]; total: number }> {
		const { where, params } = buildPendingWhere(options);
		const sortColumn =
			PENDING_GROUP_SORT_COLUMNS[options.sort ?? "oldest"];
		const dir = options.dir === "desc" ? "DESC" : "ASC";

		const dataParams = [...params];
		let paginationSql = "";
		if (options.limit != null && options.offset != null) {
			dataParams.push(options.limit, options.offset);
			paginationSql = ` LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
		}

		const sql = `
			SELECT
				ep.employee_id,
				e.name AS employee_name,
				COUNT(*)::int AS payment_count,
				MIN(ep.issued_timestamp) AS oldest_issued_at,
				MAX(ep.issued_timestamp) AS newest_issued_at,
				COALESCE(SUM(ep.payment_amount + COALESCE(ep.extra_amount, 0)), 0) AS total_amount
			FROM EmployeePayment ep
			LEFT JOIN Employee e ON e.employee_id = ep.employee_id
			${where}
			GROUP BY ep.employee_id, e.name
			ORDER BY ${sortColumn} ${dir} NULLS LAST, ep.employee_id ${dir}${paginationSql};
		`;
		const countSql = `
			SELECT COUNT(*)::int AS total
			FROM (
				SELECT ep.employee_id
				FROM EmployeePayment ep
				LEFT JOIN Employee e ON e.employee_id = ep.employee_id
				${where}
				GROUP BY ep.employee_id, e.name
			) grouped;
		`;

		const [dataResult, countResult] = await Promise.all([
			query(sql, dataParams),
			query(countSql, params)
		]);

		return {
			rows: dataResult.rows.map((row: PendingPaymentGroupRow) => ({
				...row,
				payment_count: Number(row.payment_count),
				total_amount: Number(row.total_amount)
			})),
			total: Number(countResult.rows[0]?.total ?? 0)
		};
	}

	/** Card figures for the pending queue (same filters as the list). */
	static async getPendingPaymentStats(
		filters: PendingPaymentFilters = {}
	): Promise<PendingPaymentStatsRow> {
		const { where, params } = buildPendingWhere(filters);
		const sql = `
			SELECT
				COUNT(*)::int AS pending_count,
				COUNT(DISTINCT ep.employee_id)::int AS employee_count
			FROM EmployeePayment ep
			LEFT JOIN Employee e ON e.employee_id = ep.employee_id
			${where};
		`;
		const { rows } = await query(sql, params);
		const row = rows[0] as PendingPaymentStatsRow | undefined;
		return {
			pending_count: Number(row?.pending_count ?? 0),
			employee_count: Number(row?.employee_count ?? 0)
		};
	}

	/** Expanded-row payload: one employee's pending payments, oldest first. */
	static async getPendingPaymentsForEmployee(
		employee_id: number,
		filters: PendingPaymentFilters = {}
	): Promise<EmployeePayment[]> {
		const { where, params } = buildPendingWhere(filters);
		const scopedParams = [...params, employee_id];
		const sql = `
			SELECT ep.*
			FROM EmployeePayment ep
			LEFT JOIN Employee e ON e.employee_id = ep.employee_id
			${where} AND ep.employee_id = $${scopedParams.length}
			ORDER BY ep.issued_timestamp ASC, ep.payment_id ASC;
		`;
		const { rows } = await query(sql, scopedParams);
		return rows;
	}

	/**
	 * Bulk variant of `markPaymentAsPaid` for the grouped queue. Returns
	 * the number of rows actually updated.
	 */
	static async markPendingPaymentsPaidForEmployee(
		employee_id: number,
		paid_by_user_id: number,
		filters: PendingPaymentFilters = {}
	): Promise<number> {
		const { where, params } = buildPendingWhere(filters);
		const scopedParams = [...params, paid_by_user_id, employee_id];
		const sql = `
			UPDATE EmployeePayment ep
			SET is_paid = true,
				paid_timestamp = CURRENT_TIMESTAMP,
				paid_by_user_id = $${scopedParams.length - 1}
			${where} AND ep.employee_id = $${scopedParams.length}
			RETURNING ep.payment_id;
		`;
		const { rows } = await query(sql, scopedParams);
		return rows.length;
	}

	/** Bulk variant of `voidPayment` for the grouped queue. */
	static async voidPendingPaymentsForEmployee(
		employee_id: number,
		filters: PendingPaymentFilters = {}
	): Promise<number> {
		const { where, params } = buildPendingWhere(filters);
		const scopedParams = [...params, employee_id];
		const sql = `
			UPDATE EmployeePayment ep
			SET is_void = true
			${where} AND ep.employee_id = $${scopedParams.length}
			RETURNING ep.payment_id;
		`;
		const { rows } = await query(sql, scopedParams);
		return rows.length;
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
