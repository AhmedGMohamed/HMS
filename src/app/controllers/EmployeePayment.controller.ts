// src/app/controllers/EmployeePayment.controller.ts
import { Request, Response } from "express";
import EmployeePaymentModel from "../models/EmployeePayment.model.js";
import {
	CreateEmployeePaymentDTO
} from "../utils/types/employees.d.js";

export default class EmployeePaymentController {
	static async getAllPayments(_req: Request, res: Response): Promise<void> {
		try {
			const payments = await EmployeePaymentModel.getAllPayments();
			res.status(200).json(payments);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch payments" });
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
