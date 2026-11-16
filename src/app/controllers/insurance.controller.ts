// src/app/controllers/insurance.controller.ts
import { Request, Response } from "express";
import InsuranceModel from "../models/Insurance.model.js";
import {
	CreateInsuranceCompanyDTO,
	UpdateInsuranceCompanyDTO,
	CreateInsurancePaymentDTO,
	InsuranceReportFilters,
	PatientReportFilters
} from "../utils/types/insurance.js";
import {
	parsePagination,
	buildPage
} from "../utils/pagination.js";

class InsuranceController {
	// Insurance Company Management

	async getAllInsuranceCompanies(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const pagination = parsePagination(req);
			const qRaw = req.query?.q;
			const q = typeof qRaw === "string" ? qRaw : Array.isArray(qRaw) ? String(qRaw[0] ?? "") : undefined;
			const { rows, total } = await InsuranceModel.getAllInsuranceCompanies(
				{ offset: pagination.offset, limit: pagination.limit, q }
			);
			res.json(
				buildPage(rows, total, pagination)
			);
		} catch (error) {
			console.error("Error getting insurance companies:", error);
			res.status(500).json({
				success: false,
				message: "Failed to retrieve insurance companies"
			});
		}
	}

	async getInsuranceCompanyById(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const insuranceCompany =
				await InsuranceModel.getInsuranceCompanyById(insuranceId);
			if (!insuranceCompany) {
				res.status(404).json({
					success: false,
					message: "Insurance company not found"
				});
				return;
			}

			res.json({
				success: true,
				data: insuranceCompany,
				message: "Insurance company retrieved successfully"
			});
		} catch (error) {
			console.error("Error getting insurance company:", error);
			res.status(500).json({
				success: false,
				message: "Failed to retrieve insurance company",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	async createInsuranceCompany(req: Request, res: Response): Promise<void> {
		try {
			const data: CreateInsuranceCompanyDTO = req.body;

			// Validation
			if (!data.name || data.name.trim().length === 0) {
				res.status(400).json({
					success: false,
					message: "Insurance company name is required"
				});
				return;
			}

			// Trim and validate name
			data.name = data.name.trim();
			if (data.name.length > 255) {
				res.status(400).json({
					success: false,
					message:
						"Insurance company name must be less than 255 characters"
				});
				return;
			}

			// Validate contact info if provided
			if (data.contact_info && data.contact_info.trim().length > 1000) {
				res.status(400).json({
					success: false,
					message: "Contact info must be less than 1000 characters"
				});
				return;
			}

			const newInsuranceCompany =
				await InsuranceModel.createInsuranceCompany(data);

			res.status(201).json({
				success: true,
				data: newInsuranceCompany,
				message: "Insurance company created successfully"
			});
		} catch (error) {
			console.error("Error creating insurance company:", error);
			res.status(500).json({
				success: false,
				message: "Failed to create insurance company",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	async updateInsuranceCompany(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const data: UpdateInsuranceCompanyDTO = {
				...req.body,
				insurance_id: insuranceId
			};

			// Validation
			if (data.name !== undefined) {
				if (!data.name || data.name.trim().length === 0) {
					res.status(400).json({
						success: false,
						message: "Insurance company name cannot be empty"
					});
					return;
				}
				data.name = data.name.trim();
				if (data.name.length > 255) {
					res.status(400).json({
						success: false,
						message:
							"Insurance company name must be less than 255 characters"
					});
					return;
				}
			}

			// Validate contact info if provided
			if (
				data.contact_info !== undefined &&
				data.contact_info &&
				data.contact_info.trim().length > 1000
			) {
				res.status(400).json({
					success: false,
					message: "Contact info must be less than 1000 characters"
				});
				return;
			}

			// Validate clear date if provided
			if (data.last_cleared_date) {
				const clearDate = new Date(data.last_cleared_date);
				if (isNaN(clearDate.getTime())) {
					res.status(400).json({
						success: false,
						message: "Invalid clear date format"
					});
					return;
				}
				if (clearDate > new Date()) {
					res.status(400).json({
						success: false,
						message: "Clear date cannot be in the future"
					});
					return;
				}
			}

			const updatedInsuranceCompany =
				await InsuranceModel.updateInsuranceCompany(data);

			if (!updatedInsuranceCompany) {
				res.status(404).json({
					success: false,
					message: "Insurance company not found"
				});
				return;
			}

			res.json({
				success: true,
				data: updatedInsuranceCompany,
				message: "Insurance company updated successfully"
			});
		} catch (error) {
			console.error("Error updating insurance company:", error);
			res.status(500).json({
				success: false,
				message: "Failed to update insurance company",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	async deleteInsuranceCompany(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const deleted = await InsuranceModel.deleteInsuranceCompany(
				insuranceId
			);

			if (!deleted) {
				res.status(404).json({
					success: false,
					message: "Insurance company not found"
				});
				return;
			}

			res.json({
				success: true,
				message: "Insurance company deleted successfully"
			});
		} catch (error) {
			console.error("Error deleting insurance company:", error);
			res.status(500).json({
				success: false,
				message: "Failed to delete insurance company",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	// Patient Management
	async getPatientsByInsurance(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const patients = await InsuranceModel.getPatientsByInsurance(
				insuranceId
			);

			res.json({
				success: true,
				data: patients,
				message: "Patients retrieved successfully"
			});
		} catch (error) {
			console.error("Error getting patients by insurance:", error);
			res.status(500).json({
				success: false,
				message: "Failed to retrieve patients",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	// Insurance Payments Management
	async getAllInsurancePayments(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = req.query.insurance_id
				? parseInt(req.query.insurance_id as string)
				: undefined;

			if (req.query.insurance_id && isNaN(insuranceId!)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const payments = await InsuranceModel.getAllInsurancePayments(
				insuranceId
			);

			res.json({
				success: true,
				data: payments,
				message: "Insurance payments retrieved successfully"
			});
		} catch (error) {
			console.error("Error getting insurance payments:", error);
			res.status(500).json({
				success: false,
				message: "Failed to retrieve insurance payments",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	async createInsurancePayment(req: Request, res: Response): Promise<void> {
		try {
			const data: CreateInsurancePaymentDTO = {
				...req.body,
				insurance_id: parseInt(req.params.id),
				added_by_user_id: req.user?.userId
			};

			// Validation
			if (!data.insurance_id || isNaN(data.insurance_id)) {
				res.status(400).json({
					success: false,
					message: "Valid insurance company ID is required"
				});
				return;
			}

			if (!data.payment_amount || data.payment_amount <= 0) {
				res.status(400).json({
					success: false,
					message: "Payment amount must be greater than 0"
				});
				return;
			}

			if (!data.payment_from || !data.payment_to) {
				res.status(400).json({
					success: false,
					message: "Payment period (from and to dates) is required"
				});
				return;
			}

			// Validate dates
			const fromDate = new Date(data.payment_from);
			const toDate = new Date(data.payment_to);

			if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
				res.status(400).json({
					success: false,
					message: "Invalid date format"
				});
				return;
			}

			if (fromDate >= toDate) {
				res.status(400).json({
					success: false,
					message: "From date must be before to date"
				});
				return;
			}

			if (toDate > new Date()) {
				res.status(400).json({
					success: false,
					message: "To date cannot be in the future"
				});
				return;
			}

			const newPayment = await InsuranceModel.createInsurancePayment(
				data
			);

			res.status(201).json({
				success: true,
				data: newPayment,
				message: "Insurance payment recorded successfully"
			});
		} catch (error) {
			console.error("Error creating insurance payment:", error);
			res.status(500).json({
				success: false,
				message: "Failed to record insurance payment",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	async deleteInsurancePayment(req: Request, res: Response): Promise<void> {
		try {
			const paymentId = parseInt(req.params.paymentId);
			if (isNaN(paymentId)) {
				res.status(400).json({
					success: false,
					message: "Invalid payment ID"
				});
				return;
			}

			const deleted = await InsuranceModel.deleteInsurancePayment(
				paymentId
			);

			if (!deleted) {
				res.status(404).json({
					success: false,
					message: "Insurance payment not found"
				});
				return;
			}

			res.json({
				success: true,
				message: "Insurance payment deleted successfully"
			});
		} catch (error) {
			console.error("Error deleting insurance payment:", error);
			res.status(500).json({
				success: false,
				message: "Failed to delete insurance payment",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	// Clear Outstanding Balance
	async clearInsuranceBalance(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const { clear_date } = req.body;
			if (!clear_date) {
				res.status(400).json({
					success: false,
					message: "Clear date is required"
				});
				return;
			}

			// Validate clear date
			const clearDate = new Date(clear_date);
			if (isNaN(clearDate.getTime())) {
				res.status(400).json({
					success: false,
					message: "Invalid clear date format"
				});
				return;
			}

			const updatedInsuranceCompany =
				await InsuranceModel.clearInsuranceBalance(
					insuranceId,
					clear_date
				);

			res.json({
				success: true,
				data: updatedInsuranceCompany,
				message: "Insurance balance cleared successfully"
			});
		} catch (error) {
			console.error("Error clearing insurance balance:", error);
			res.status(500).json({
				success: false,
				message: "Failed to clear insurance balance",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	// Insurance Reports
	async generateInsuranceReport(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const {
				start_date,
				end_date,
				include_drugs = true,
				include_cleared_items = false
			} = req.body;

			if (!start_date || !end_date) {
				res.status(400).json({
					success: false,
					message: "Start date and end date are required"
				});
				return;
			}

			// Validate dates
			const startDate = new Date(start_date);
			const endDate = new Date(end_date);

			if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
				res.status(400).json({
					success: false,
					message: "Invalid date format"
				});
				return;
			}

			if (startDate >= endDate) {
				res.status(400).json({
					success: false,
					message: "Start date must be before end date"
				});
				return;
			}

			const filters: InsuranceReportFilters = {
				insurance_id: insuranceId,
				start_date,
				end_date,
				include_drugs: Boolean(include_drugs),
				include_cleared_items: Boolean(include_cleared_items)
			};

			const report = await InsuranceModel.generateInsuranceReport(
				filters
			);

			res.json({
				success: true,
				data: report,
				message: "Insurance report generated successfully"
			});
		} catch (error) {
			console.error("Error generating insurance report:", error);
			res.status(500).json({
				success: false,
				message: "Failed to generate insurance report",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	// Insurance Statistics
	async getInsuranceStatistics(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const statistics = await InsuranceModel.getInsuranceStatistics(
				insuranceId
			);

			res.json({
				success: true,
				data: statistics,
				message: "Insurance statistics retrieved successfully"
			});
		} catch (error) {
			console.error("Error getting insurance statistics:", error);
			res.status(500).json({
				success: false,
				message: "Failed to retrieve insurance statistics",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	async getInsuranceOutstanding(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			if (isNaN(insuranceId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID"
				});
				return;
			}

			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					success: false,
					message: "Start date and end date are required"
				});
				return;
			}

			const outstanding =
				await InsuranceModel.getInsuranceOutstandingByPeriod(
					insuranceId,
					start_date as string,
					end_date as string
				);

			res.json({
				success: true,
				data: { outstanding_amount: outstanding },
				message: "Outstanding amount retrieved successfully"
			});
		} catch (error) {
			console.error("Error getting insurance outstanding:", error);
			res.status(500).json({
				success: false,
				message: "Failed to retrieve outstanding amount",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	async generatePatientReport(req: Request, res: Response): Promise<void> {
		try {
			const insuranceId = parseInt(req.params.id);
			const patientId = parseInt(req.params.patientId);

			if (isNaN(insuranceId) || isNaN(patientId)) {
				res.status(400).json({
					success: false,
					message: "Invalid insurance company ID or patient ID"
				});
				return;
			}

			const {
				start_date,
				end_date,
				include_drugs = true,
				include_cleared_items = false
			} = req.body;

			if (!start_date || !end_date) {
				res.status(400).json({
					success: false,
					message: "Start date and end date are required"
				});
				return;
			}

			// Validate dates
			const startDate = new Date(start_date);
			const endDate = new Date(end_date);

			if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
				res.status(400).json({
					success: false,
					message: "Invalid date format"
				});
				return;
			}

			if (startDate >= endDate) {
				res.status(400).json({
					success: false,
					message: "Start date must be before end date"
				});
				return;
			}

			const filters: PatientReportFilters = {
				insurance_id: insuranceId,
				patient_id: patientId,
				start_date,
				end_date,
				include_drugs: Boolean(include_drugs),
				include_cleared_items: Boolean(include_cleared_items)
			};

			const report = await InsuranceModel.generatePatientReport(filters);

			res.json({
				success: true,
				data: report,
				message: "Patient report generated successfully"
			});
		} catch (error) {
			console.error("Error generating patient report:", error);
			res.status(500).json({
				success: false,
				message: "Failed to generate patient report",
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}
}

export default new InsuranceController();
