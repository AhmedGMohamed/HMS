// src/app/controllers/EmployeePayment.controller.ts
import { Request, Response } from "express";
import EmployeePaymentModel, {
	type PendingGroupListOptions,
	type PendingPaymentFilters
} from "../models/EmployeePayment.model.js";
import {
	CreateEmployeePaymentDTO
} from "../utils/types/employees.js";
import { buildPage, parsePagination } from "../utils/pagination.js";

const PENDING_SORTS = new Set(["employee", "oldest", "newest", "totalAmount"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readString(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (Array.isArray(value)) {
		return readString(value[0]);
	}
	return undefined;
}

function readBooleanFlag(value: unknown): boolean | undefined {
	const raw = readString(value);
	if (raw === "true" || raw === "1") return true;
	if (raw === "false" || raw === "0") return false;
	return undefined;
}

/** Only well-formed `YYYY-MM-DD` dates reach the model. */
function readDate(value: unknown): string | undefined {
	const raw = readString(value);
	if (!raw || !ISO_DATE.test(raw)) return undefined;
	const parsed = new Date(`${raw}T00:00:00Z`);
	return Number.isNaN(parsed.getTime()) ? undefined : raw;
}

function readPendingFilters(req: Request): PendingPaymentFilters {
	return {
		from: readDate(req.query?.from),
		to: readDate(req.query?.to),
		search: readString(req.query?.search)
	};
}

export default class EmployeePaymentController {
	static async getAllPayments(req: Request, res: Response): Promise<void> {
		try {
			const pagination = parsePagination(req);
			const all = readBooleanFlag(req.query?.all) === true;
			const { rows, total } = await EmployeePaymentModel.getAllPayments({
				offset: all ? undefined : pagination.offset,
				limit: all ? undefined : pagination.limit
			});
			const page = all
				? { ...pagination, page: 1, pageSize: rows.length }
				: pagination;
			res.status(200).json(buildPage(rows, total, page));
		} catch (error) {
			console.error("Error fetching payments:", error);
			res.status(500).json({ error: "Failed to fetch payments" });
		}
	}

	/** One row per employee with that employee's pending aggregate. */
	static async getPendingPaymentGroups(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const pagination = parsePagination(req);
			const rawSort = readString(req.query?.sort) ?? "";
			const options: PendingGroupListOptions = {
				...readPendingFilters(req),
				offset: pagination.offset,
				limit: pagination.limit,
				sort: PENDING_SORTS.has(rawSort)
					? (rawSort as PendingGroupListOptions["sort"])
					: "oldest",
				dir: readString(req.query?.dir) === "desc" ? "desc" : "asc"
			};
			const { rows, total } =
				await EmployeePaymentModel.getPendingPaymentGroups(options);
			res.status(200).json(buildPage(rows, total, pagination));
		} catch (error) {
			console.error("Error fetching pending payment groups:", error);
			res.status(500).json({
				error: "Failed to fetch pending payment groups"
			});
		}
	}

	static async getPendingPaymentStats(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const stats = await EmployeePaymentModel.getPendingPaymentStats(
				readPendingFilters(req)
			);
			res.status(200).json(stats);
		} catch (error) {
			console.error("Error fetching pending payment stats:", error);
			res.status(500).json({
				error: "Failed to fetch pending payment stats"
			});
		}
	}

	static async getPendingPaymentsForEmployee(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const payments =
				await EmployeePaymentModel.getPendingPaymentsForEmployee(
					employee_id,
					readPendingFilters(req)
				);
			res.status(200).json(payments);
		} catch (error) {
			console.error("Error fetching employee pending payments:", error);
			res.status(500).json({
				error: "Failed to fetch employee pending payments"
			});
		}
	}

	static async markPendingPaymentsPaidForEmployee(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const updated =
				await EmployeePaymentModel.markPendingPaymentsPaidForEmployee(
					employee_id,
					req.user?.userId || 0,
					readPendingFilters(req)
				);
			res.status(200).json({ updated });
		} catch (error) {
			console.error("Error marking pending payments as paid:", error);
			res.status(500).json({
				error: "Failed to mark pending payments as paid"
			});
		}
	}

	static async voidPendingPaymentsForEmployee(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const updated =
				await EmployeePaymentModel.voidPendingPaymentsForEmployee(
					employee_id,
					readPendingFilters(req)
				);
			res.status(200).json({ updated });
		} catch (error) {
			console.error("Error voiding pending payments:", error);
			res.status(500).json({
				error: "Failed to void pending payments"
			});
		}
	}

	static async getPaymentById(req: Request, res: Response): Promise<void> {
		try {
			const payment_id = parseInt(req.params.id);
			const payment = await EmployeePaymentModel.getPaymentById(
				payment_id
			);
			if (!payment) {
				res.status(404).json({ error: "Payment not found" });
				return;
			}
			res.status(200).json(payment);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch payment" });
		}
	}

	static async getUnpaidSystemPayments(
		_req: Request,
		res: Response
	): Promise<void> {
		try {
			const payments =
				await EmployeePaymentModel.getUnpaidSystemPayments();
			res.status(200).json(payments);
		} catch (error) {
			res.status(500).json({
				error: "Failed to fetch unpaid system payments"
			});
		}
	}

	static async getPaymentsByEmployeeId(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const payments = await EmployeePaymentModel.getPaymentsByEmployeeId(
				employee_id
			);
			res.status(200).json(payments);
		} catch (error) {
			res.status(500).json({
				error: "Failed to fetch employee payments"
			});
		}
	}

	static async getPaidPaymentsByEmployeeId(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const payments = await EmployeePaymentModel.getPaidPaymentsByEmployeeId(
				employee_id
			);
			res.status(200).json(payments);
		} catch (error) {
			res.status(500).json({
				error: "Failed to fetch employee payments"
			})
		}
	}

	static async createPayment(req: Request, res: Response): Promise<void> {
		try {
			const dto: CreateEmployeePaymentDTO = {
				...req.body,
				paid_by_user_id: req.user?.userId
			};
			const payment = await EmployeePaymentModel.createPayment(dto);
			res.status(201).json(payment);
		} catch (error) {
			res.status(500).json({ error: "Failed to create payment" });
		}
	}

	static async updatePayment(req: Request, res: Response): Promise<void> {
		try {
			const payment_id = parseInt(req.params.id);
			const dto: Partial<CreateEmployeePaymentDTO> = req.body;
			const payment = await EmployeePaymentModel.updatePayment(
				payment_id,
				dto
			);
			if (!payment) {
				res.status(404).json({ error: "Payment not found" });
				return;
			}
			res.status(200).json(payment);
		} catch (error) {
			res.status(500).json({ error: "Failed to update payment" });
		}
	}

	static async markPaymentAsPaid(req: Request, res: Response): Promise<void> {
		try {
			const payment_id = parseInt(req.params.id);
			const payment = await EmployeePaymentModel.markPaymentAsPaid(
				payment_id,
				req.user?.userId || 0
			);
			if (!payment) {
				res.status(404).json({ error: "Payment not found" });
				return;
			}
			res.status(200).json(payment);
		} catch (error) {
			res.status(500).json({ error: "Failed to mark payment as paid" });
		}
	}

	static async voidPayment(req: Request, res: Response): Promise<void> {
		try {
			const payment_id = parseInt(req.params.id);
			const payment = await EmployeePaymentModel.voidPayment(payment_id);
			if (!payment) {
				res.status(404).json({ error: "Payment not found" });
				return;
			}
			res.status(200).json(payment);
		} catch (error) {
			res.status(500).json({ error: "Failed to void payment" });
		}
	}
}
