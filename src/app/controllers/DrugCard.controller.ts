import { Request, Response } from "express";
import DrugCardModel from "../models/DrugCard.model.js";
import { CreateDrugCardDTO, UpdateDrugCardDTO } from "../utils/types/drugs.js";
import {
	parsePagination,
	buildPage
} from "../utils/pagination.js";

export class DrugCardController {
	async getAllDrugCards(req: Request, res: Response) {
		try {
			const pagination = parsePagination(req);
			const qRaw = req.query?.q;
			const q = typeof qRaw === "string" ? qRaw : Array.isArray(qRaw) ? String(qRaw[0] ?? "") : undefined;
			const { rows, total } = await DrugCardModel.getAllDrugCards(
				{ offset: pagination.offset, limit: pagination.limit, q }
			);
			res.json(buildPage(rows, total, pagination));
		} catch (error) {
			console.error("Error fetching drug cards:", error);
			res.status(500).json({ error: "Failed to fetch drug cards" });
		}
	}

	async getDrugCardById(req: Request, res: Response) {
		try {
			const drugId = parseInt(req.params.id);
			const drug = await DrugCardModel.getDrugCardById(drugId);

			if (!drug) {
				res.status(404).json({ error: "Drug not found" });
				return;
			}

			res.json(drug);
		} catch (error) {
			console.error("Error fetching drug card:", error);
			res.status(500).json({ error: "Failed to fetch drug card" });
		}
	}

	async createDrugCard(req: Request, res: Response) {
		try {
			const drugData: CreateDrugCardDTO = req.body;

			// Validate required fields
			if (
				!drugData.name ||
				!drugData.unit_conversion ||
				!drugData.sale_quantity
			) {
				res.status(400).json({
					error: "Name, unit conversion, and sale quantity are required"
				});
				return;
			}

			// Validate unit conversion structure
			if (!this.validateUnitConversion(drugData.unit_conversion)) {
				res.status(400).json({
					error: "Invalid unit conversion format"
				});
				return;
			}

			// Validate numeric fields
			if (drugData.sale_quantity <= 0) {
				res.status(400).json({
					error: "Sale quantity must be greater than 0"
				});
				return;
			}

			if (
				drugData.min_stock_alert !== undefined &&
				drugData.min_stock_alert < 0
			) {
				res.status(400).json({
					error: "Min stock alert cannot be negative"
				});
				return;
			}

			if (
				drugData.max_days_expiry_alert !== undefined &&
				drugData.max_days_expiry_alert < 0
			) {
				res.status(400).json({
					error: "Max days expiry alert cannot be negative"
				});
				return;
			}

			// Get user ID from authenticated request
			const userId = (req as any).user.userId;
			const newDrug = await DrugCardModel.createDrugCard(
				drugData,
				userId
			);

			res.status(201).json(newDrug);
		} catch (error: any) {
			if (error.message === "Drug name already exists") {
				res.status(409).json({ error: error.message });
			} else if (error.message === "Invalid unit conversion data") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error creating drug card:", error);
				res.status(500).json({ error: "Failed to create drug card" });
			}
		}
	}

	async updateDrugCard(req: Request, res: Response) {
		try {
			const drugId = parseInt(req.params.id);
			const updateData: UpdateDrugCardDTO = {
				...req.body,
				drug_id: drugId
			};

			// Validate numeric fields if provided
			if (
				updateData.sale_quantity !== undefined &&
				updateData.sale_quantity <= 0
			) {
				res.status(400).json({
					error: "Sale quantity must be greater than 0"
				});
				return
			}

			if (
				updateData.min_stock_alert !== undefined &&
				updateData.min_stock_alert !== null &&
				updateData.min_stock_alert < 0
			) {
				res.status(400).json({
					error: "Min stock alert cannot be negative"
				});
				return;
			}

			if (
				updateData.max_days_expiry_alert !== undefined &&
				updateData.max_days_expiry_alert !== null &&
				updateData.max_days_expiry_alert < 0
			) {
				res.status(400).json({
					error: "Max days expiry alert cannot be negative"
				});
				return;
			}

			// Validate unit conversion if provided
			if (
				updateData.unit_conversion &&
				!this.validateUnitConversion(updateData.unit_conversion)
			) {
				res.status(400).json({
					error: "Invalid unit conversion format"
				});
				return;
			}

			const updatedDrug = await DrugCardModel.updateDrugCard(updateData);
			res.json(updatedDrug);
		} catch (error: any) {
			if (error.message === "Drug not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message === "Drug name already exists") {
				res.status(409).json({ error: error.message });
			} else if (error.message === "Invalid unit conversion data") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error updating drug card:", error);
				res.status(500).json({ error: "Failed to update drug card" });
			}
		}
	}

	async deleteDrugCard(req: Request, res: Response) {
		try {
			const drugId = parseInt(req.params.id);
			await DrugCardModel.deleteDrugCard(drugId);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "Drug not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message.includes("Cannot delete drug")) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error deleting drug card:", error);
				res.status(500).json({ error: "Failed to delete drug card" });
			}
		}
	}

	async searchDrugs(req: Request, res: Response) {
		try {
			const searchTerm = req.query.q as string;

			if (!searchTerm || searchTerm.trim().length === 0) {
				res.status(400).json({ error: "Search term is required" });
				return;
			}

			const drugs = await DrugCardModel.searchDrugs(searchTerm.trim());
			res.json(drugs);
		} catch (error) {
			console.error("Error searching drugs:", error);
			res.status(500).json({ error: "Failed to search drugs" });
		}
	}

	async getDrugSuggestions(req: Request, res: Response) {
		try {
			const prefix = req.query.prefix as string;

			if (!prefix || prefix.trim().length === 0) {
				res.status(400).json({ error: "Prefix is required" });
				return
			}

			const suggestions = await DrugCardModel.getDrugSuggestions(
				prefix.trim()
			);
			res.json(suggestions);
		} catch (error) {
			console.error("Error getting drug suggestions:", error);
			res.status(500).json({ error: "Failed to get drug suggestions" });
		}
	}

	async getLowStockDrugs(_req: Request, res: Response) {
		try {
			const lowStockDrugs = await DrugCardModel.getLowStockDrugs();
			res.json(lowStockDrugs);
		} catch (error) {
			console.error("Error fetching low stock drugs:", error);
			res.status(500).json({ error: "Failed to fetch low stock drugs" });
		}
	}

	async getNearExpiryDrugs(_req: Request, res: Response) {
		try {
			const nearExpiryDrugs = await DrugCardModel.getNearExpiryDrugs();
			res.json(nearExpiryDrugs);
		} catch (error) {
			console.error("Error fetching near expiry drugs:", error);
			res.status(500).json({
				error: "Failed to fetch near expiry drugs"
			});
		}
	}

	private validateUnitConversion(unitConversion: any): boolean {
		return (
			unitConversion &&
			typeof unitConversion === "object" &&
			typeof unitConversion.larger === "string" &&
			unitConversion.larger.trim().length > 0 &&
			typeof unitConversion.smaller === "string" &&
			unitConversion.smaller.trim().length > 0 &&
			typeof unitConversion.ratio === "number" &&
			unitConversion.ratio > 0
		);
	}
}

export default new DrugCardController();
