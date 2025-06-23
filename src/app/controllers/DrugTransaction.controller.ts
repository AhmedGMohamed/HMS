// src/app/controllers/DrugTransaction.controller.ts
import { Request, Response } from "express";
import DrugTransactionModel from "../models/DrugTransaction.model.js";
import {
	CreateDrugTransactionDTO,
	DrugTransactionFilters
} from "../utils/types/drugs.js";

export class DrugTransactionController {
	async getAllTransactions(_req: Request, res: Response) {
		try {
			const transactions =
				await DrugTransactionModel.getAllTransactions();
			res.json(transactions);
		} catch (error) {
			console.error("Error fetching transactions:", error);
			res.status(500).json({ error: "Failed to fetch transactions" });
		}
	}

	async getTransactionById(req: Request, res: Response) {
		try {
			const transactionId = parseInt(req.params.id);
			const transaction = await DrugTransactionModel.getTransactionById(
				transactionId
			);

			if (!transaction) {
				res.status(404).json({ error: "Transaction not found" });
				return
			}

			res.json(transaction);
		} catch (error) {
			console.error("Error fetching transaction:", error);
			res.status(500).json({ error: "Failed to fetch transaction" });
		}
	}

	async createTransaction(req: Request, res: Response) {
		try {
			const transactionData: CreateDrugTransactionDTO = req.body;

			// Validate required fields
			if (!this.validateTransactionData(transactionData)) {
				res.status(400).json({
					error: "Missing or invalid required fields"
				});
				return
			}

			// Validate numeric values
			if (!this.validateNumericValues(transactionData)) {
				res.status(400).json({
					error: "Invalid numeric values"
				});
				return
			}

			const userId = (req as any).user.userId;
			const newTransaction = await DrugTransactionModel.createTransaction(
				transactionData,
				userId
			);

			res.status(201).json(newTransaction);
		} catch (error: any) {
			if (error.message === "Shipment not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message === "Insufficient quantity in shipment") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error creating transaction:", error);
				res.status(500).json({ error: "Failed to create transaction" });
			}
		}
	}

	async getFilteredTransactions(req: Request, res: Response) {
		try {
			const filters: DrugTransactionFilters = this.parseFilters(
				req.query
			);

			// Validate date filters if present
			if (!this.validateDateFilters(filters)) {
				res.status(400).json({
					error: "Invalid date format in filters"
				});
				return
			}

			const transactions =
				await DrugTransactionModel.getTransactionsByFilters(filters);
			res.json(transactions);
		} catch (error) {
			console.error("Error fetching filtered transactions:", error);
			res.status(500).json({
				error: "Failed to fetch filtered transactions"
			});
		}
	}

	async getTransactionSummary(req: Request, res: Response) {
		try {
			const filters: DrugTransactionFilters = this.parseFilters(
				req.query
			);

			// Validate date filters if present
			if (!this.validateDateFilters(filters)) {
				res.status(400).json({
					error: "Invalid date format in filters"
				});
				return
			}

			const summary = await DrugTransactionModel.getTransactionSummary(
				filters
			);
			res.json(summary);
		} catch (error) {
			console.error("Error fetching transaction summary:", error);
			res.status(500).json({
				error: "Failed to fetch transaction summary"
			});
		}
	}

	private validateTransactionData(data: CreateDrugTransactionDTO): boolean {
		return !!(
			data.shipment_id &&
			data.transaction_type &&
			data.quantity &&
			data.price &&
			["patient", "check", "outside"].includes(data.transaction_type)
		);
	}

	private validateNumericValues(data: CreateDrugTransactionDTO): boolean {
		return data.quantity > 0 && data.price > 0;
	}

	private validateDateFilters(filters: DrugTransactionFilters): boolean {
		if (filters.startDate && !this.isValidDate(filters.startDate)) {
			return false;
		}
		if (filters.endDate && !this.isValidDate(filters.endDate)) {
			return false;
		}
		if (filters.startDate && filters.endDate) {
			const start = new Date(filters.startDate);
			const end = new Date(filters.endDate);
			if (start > end) {
				return false;
			}
		}
		return true;
	}

	private isValidDate(dateString: string): boolean {
		const date = new Date(dateString);
		return date instanceof Date && !isNaN(date.getTime());
	}

	private parseFilters(query: any): DrugTransactionFilters {
		const filters: DrugTransactionFilters = {};

		if (query.startDate) filters.startDate = query.startDate;
		if (query.endDate) filters.endDate = query.endDate;
		if (query.transactionType)
			filters.transactionType = query.transactionType;
		if (query.drugId) filters.drugId = parseInt(query.drugId);
		if (query.warehouseId)
			filters.warehouseId = parseInt(query.warehouseId);

		return filters;
	}
}

export default new DrugTransactionController();
