import { Request, Response } from "express";
import DrugUsageModel from "../models/DrugUsage.model.js";
import {
	CreateDrugUsageDTO,
	UpdateDrugUsageDTO
} from "../utils/types/drugs.js";

export class DrugUsageController {
	async getAllDrugUsages(_req: Request, res: Response) {
		try {
			const usages = await DrugUsageModel.getAllDrugUsages();
			res.json(usages);
		} catch (error) {
			console.error("Error fetching drug usages:", error);
			res.status(500).json({ error: "Failed to fetch drug usages" });
		}
	}

	async getDrugUsageById(req: Request, res: Response) {
		try {
			const usageId = parseInt(req.params.id);
			const usage = await DrugUsageModel.getDrugUsageById(usageId);

			if (!usage) {
				res.status(404).json({ error: "Drug usage not found" });
				return;
			}

			res.json(usage);
		} catch (error) {
			console.error("Error fetching drug usage:", error);
			res.status(500).json({ error: "Failed to fetch drug usage" });
		}
	}

	async createDrugUsage(req: Request, res: Response) {
		try {
			const usageData: CreateDrugUsageDTO = req.body;

			// Validate required fields
			if (!this.validateUsageData(usageData)) {
				res.status(400).json({
					error: "Missing or invalid required fields"
				});
				return;
			}

			// Validate numeric values
			if (!this.validateNumericValues(usageData)) {
				res.status(400).json({
					error: "Invalid numeric values"
				});
				return;
			}

			const userId = (req as any).user.userId;
			const newUsage = await DrugUsageModel.createDrugUsage(
				usageData,
				userId
			);

			res.status(201).json(newUsage);
		} catch (error: any) {
			if (
				error.message === "Drug not found" ||
				error.message === "Patient not found"
			) {
				res.status(404).json({ error: error.message });
			} else if (
				error.message === "Insufficient quantity in selected shipment"
			) {
				res.status(400).json({ error: error.message });
			} else if (error.message === "Invalid shipment for this drug") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error creating drug usage:", error);
				res.status(500).json({ error: "Failed to create drug usage" });
			}
		}
	}

	async updateDrugUsage(req: Request, res: Response) {
		try {
			const usageId = parseInt(req.params.id);
			const updateData: UpdateDrugUsageDTO = {
				...req.body,
				usage_id: usageId
			};

			// Validate numeric values if provided
			if (
				updateData.remaining_quantity !== undefined &&
				updateData.remaining_quantity < 0
			) {
				res.status(400).json({
					error: "Remaining quantity cannot be negative"
				});
				return;
			}

			// Validate date if provided
			if (
				updateData.last_administered &&
				!this.isValidDate(updateData.last_administered)
			) {
				res.status(400).json({
					error: "Invalid administration date"
				});
				return;
			}

			const updatedUsage = await DrugUsageModel.updateDrugUsage(
				updateData
			);
			res.json(updatedUsage);
		} catch (error: any) {
			if (error.message === "Drug usage not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error updating drug usage:", error);
				res.status(500).json({ error: "Failed to update drug usage" });
			}
		}
	}

	async getPendingAdministrations(_req: Request, res: Response) {
		try {
			const pendingAdministrations =
				await DrugUsageModel.getPendingAdministrations();
			res.json(pendingAdministrations);
		} catch (error) {
			console.error("Error fetching pending administrations:", error);
			res.status(500).json({
				error: "Failed to fetch pending administrations"
			});
		}
	}

	async getDrugUsageHistory(req: Request, res: Response) {
		try {
			const patientId = req.query.patientId
				? parseInt(req.query.patientId as string)
				: undefined;
			const drugId = req.query.drugId
				? parseInt(req.query.drugId as string)
				: undefined;

			// Validate IDs if provided
			if (
				(patientId !== undefined && isNaN(patientId)) ||
				(drugId !== undefined && isNaN(drugId))
			) {
				res.status(400).json({
					error: "Invalid patient ID or drug ID"
				});
				return;
			}

			const history = await DrugUsageModel.getDrugUsageHistory(
				patientId,
				drugId
			);
			res.json(history);
		} catch (error) {
			console.error("Error fetching drug usage history:", error);
			res.status(500).json({
				error: "Failed to fetch drug usage history"
			});
		}
	}

	async getAvailableShipments(req: Request, res: Response) {
		try {
			const drugId = parseInt(req.params.id);

			if (isNaN(drugId)) {
				res.status(400).json({
					error: "Invalid drug ID"
				});
				return;
			}

			const shipments = await DrugUsageModel.getAvailableShipments(
				drugId
			);
			res.json(shipments);
		} catch (error) {
			console.error("Error fetching available shipments:", error);
			res.status(500).json({
				error: "Failed to fetch available shipments"
			});
		}
	}

	private validateUsageData(data: CreateDrugUsageDTO): boolean {
		return !!(
			data.patient_id &&
			data.drug_id &&
			data.shipment_id &&
			data.quantity &&
			data.price
		);
	}

	private validateNumericValues(data: CreateDrugUsageDTO): boolean {
		return data.quantity > 0 && (data.price as number) > 0;
	}

	private isValidDate(date: Date): boolean {
		const dateObj = new Date(date);
		return dateObj instanceof Date && !isNaN(dateObj.getTime());
	}
}

export default new DrugUsageController();
