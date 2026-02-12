import { Request, Response } from "express";
import VaultModel from "../models/Vault.model.js";

export class VaultController {
	// Get complete vault summary for date range
	async getVaultSummary(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const summary = await VaultModel.getVaultSummary(
				start_date as string,
				end_date as string
			);

			res.status(200).json(summary);
		} catch (error) {
			console.error("Error fetching vault summary:", error);
			res.status(500).json({ error: "Failed to fetch vault summary" });
		}
	}

	// Patient Revenue Methods
	async getPatientServicesRevenue(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const revenue = await VaultModel.getPatientServicesRevenue(
				start_date as string,
				end_date as string
			);

			res.status(200).json(revenue);
		} catch (error) {
			console.error("Error fetching patient services revenue:", error);
			res.status(500).json({
				error: "Failed to fetch patient services revenue"
			});
		}
	}

	async getPatientDrugsRevenue(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const revenue = await VaultModel.getPatientDrugsRevenue(
				start_date as string,
				end_date as string
			);

			res.status(200).json(revenue);
		} catch (error) {
			console.error("Error fetching patient drugs revenue:", error);
			res.status(500).json({
				error: "Failed to fetch patient drugs revenue"
			});
		}
	}

	async getPatientPayments(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const payments = await VaultModel.getPatientPayments(
				start_date as string,
				end_date as string
			);

			res.status(200).json(payments);
		} catch (error) {
			console.error("Error fetching patient payments:", error);
			res.status(500).json({ error: "Failed to fetch patient payments" });
		}
	}

	async getPatientOutstandingBalances(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const balances = await VaultModel.getPatientOutstandingBalances(
				start_date as string,
				end_date as string
			);

			res.status(200).json(balances);
		} catch (error) {
			console.error("Error fetching outstanding balances:", error);
			res.status(500).json({
				error: "Failed to fetch outstanding balances"
			});
		}
	}

	async getPatientDiscounts(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const discounts = await VaultModel.getPatientDiscounts(
				start_date as string,
				end_date as string
			);

			res.status(200).json(discounts);
		} catch (error) {
			console.error("Error fetching patient discounts:", error);
			res.status(500).json({
				error: "Failed to fetch patient discounts"
			});
		}
	}

	async getPatientVatAndAdminExpenses(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const data = await VaultModel.getPatientVatAndAdminExpenses(
				start_date as string,
				end_date as string
			);

			res.status(200).json(data);
		} catch (error) {
			console.error("Error fetching VAT and admin expenses:", error);
			res.status(500).json({
				error: "Failed to fetch VAT and admin expenses"
			});
		}
	}

	// Manual Payment Methods
	async getManualPayments(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const payments = await VaultModel.getManualPayments(
				start_date as string,
				end_date as string
			);

			res.status(200).json(payments);
		} catch (error) {
			console.error("Error fetching manual payments:", error);
			res.status(500).json({ error: "Failed to fetch manual payments" });
		}
	}

	async createManualPayment(req: Request, res: Response) {
		try {
			const { payment_amount, payment_type, description } = req.body;

			if (!payment_amount || !payment_type) {
				res.status(400).json({
					error: "Payment amount and type are required"
				});
				return;
			}

			if (!["addition", "deduction"].includes(payment_type)) {
				res.status(400).json({
					error: "Payment type must be 'addition' or 'deduction'"
				});
				return;
			}

			const payment = await VaultModel.createManualPayment({
				payment_amount: parseFloat(payment_amount),
				payment_type: payment_type as "addition" | "deduction",
				description: description || null
			});

			res.status(201).json(payment);
		} catch (error) {
			console.error("Error creating manual payment:", error);
			res.status(500).json({ error: "Failed to create manual payment" });
		}
	}

	async getInsurancePaymentsRevenue(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json("Start date and end date are required");
				return;
			}

			const data = await VaultModel.getInsurancePaymentsRevenue(
				start_date as string,
				end_date as string
			);

			res.status(200).json(data);
		} catch (error) {
			res.status(500).json({
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	// Pharmacy Methods
	async getDrugShipmentCosts(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const costs = await VaultModel.getDrugShipmentCosts(
				start_date as string,
				end_date as string
			);

			res.status(200).json(costs);
		} catch (error) {
			console.error("Error fetching drug shipment costs:", error);
			res.status(500).json({
				error: "Failed to fetch drug shipment costs"
			});
		}
	}

	async getDrugSalesRevenue(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const revenue = await VaultModel.getDrugSalesRevenue(
				start_date as string,
				end_date as string
			);

			res.status(200).json(revenue);
		} catch (error) {
			console.error("Error fetching drug sales revenue:", error);
			res.status(500).json({
				error: "Failed to fetch drug sales revenue"
			});
		}
	}

	async getDrugSalesProfit(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const profit = await VaultModel.getDrugSalesProfit(
				start_date as string,
				end_date as string
			);

			res.status(200).json(profit);
		} catch (error) {
			console.error("Error fetching drug sales profit:", error);
			res.status(500).json({
				error: "Failed to fetch drug sales profit"
			});
		}
	}

	// Employee Wages Methods
	async getEmployeeWagesOwed(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const wages = await VaultModel.getEmployeeWagesOwed(
				start_date as string,
				end_date as string
			);

			res.status(200).json(wages);
		} catch (error) {
			console.error("Error fetching wages owed:", error);
			res.status(500).json({ error: "Failed to fetch wages owed" });
		}
	}

	async getEmployeeWagesPaid(req: Request, res: Response) {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const wages = await VaultModel.getEmployeeWagesPaid(
				start_date as string,
				end_date as string
			);

			res.status(200).json(wages);
		} catch (error) {
			console.error("Error fetching wages paid:", error);
			res.status(500).json({ error: "Failed to fetch wages paid" });
		}
	}
}

export default new VaultController();
