import { Request, Response } from "express";
import PriceListModel from "../models/PriceList.model.js";
import {
	CreatePriceListDTO,
	UpdatePriceListDTO
} from "../utils/types/priceLists.js";

export class PriceListController {
	async getAllPriceLists(_req: Request, res: Response) {
		try {
			const priceLists = await PriceListModel.getAllPriceLists();
			res.json(priceLists);
		} catch (error) {
			console.error("Error fetching price lists:", error);
			res.status(500).json({ error: "Failed to fetch price lists" });
		}
	}

	async getPriceListById(req: Request, res: Response) {
		try {
			const priceListId = parseInt(req.params.id);
			const priceList = await PriceListModel.getPriceListById(
				priceListId
			);
			res.json(priceList);
		} catch (error: any) {
			if (error.message === "Price list not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error fetching price list:", error);
				res.status(500).json({ error: "Failed to fetch price list" });
			}
		}
	}

	async createPriceList(req: Request, res: Response) {
		try {
			const priceListData: CreatePriceListDTO = req.body;
			const priceList = await PriceListModel.createPriceList(
				priceListData
			);
			res.status(201).json(priceList);
		} catch (error) {
			console.error("Error creating price list:", error);
			res.status(500).json({ error: "Failed to create price list" });
		}
	}

	async updatePriceList(req: Request, res: Response) {
		try {
			const priceListId = parseInt(req.params.id);
			const updateData: UpdatePriceListDTO = req.body;
			const priceList = await PriceListModel.updatePriceList(
				priceListId,
				updateData
			);
			res.json(priceList);
		} catch (error: any) {
			if (error.message === "Price list not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error updating price list:", error);
				res.status(500).json({ error: "Failed to update price list" });
			}
		}
	}

	async deletePriceList(req: Request, res: Response) {
		try {
			const priceListId = parseInt(req.params.id);
			await PriceListModel.deletePriceList(priceListId);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "Price list not found") {
				res.status(404).json({ error: error.message });
			} else if (
				error.message === "Cannot delete the default price list"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error deleting price list:", error);
				res.status(500).json({ error: "Failed to delete price list" });
			}
		}
	}

	async getDefaultPriceList(_req: Request, res: Response) {
		try {
			const defaultPriceList = await PriceListModel.getDefaultPriceList();
			res.json(defaultPriceList);
		} catch (error: any) {
			if (error.message === "No default price list found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error fetching default price list:", error);
				res.status(500).json({
					error: "Failed to fetch default price list"
				});
			}
		}
	}

	async getPriceListStats(req: Request, res: Response) {
		try {
			const priceListId = parseInt(req.params.id);
			const priceListStats = await PriceListModel.getPriceListStats(priceListId);
			res.json(priceListStats);
		} catch (error: any) {
			console.error("Error fetching price list stats:", error);
			res.status(500).json({ error: "Failed to fetch price list stats" });
		}
	}

	async getPriceListServices(req: Request, res: Response) {
		try {
			const priceListId = parseInt(req.params.id);
			const priceListServices = await PriceListModel.getPriceListServices(
				priceListId
			);
			res.json(priceListServices);
		} catch (error: any) {
			console.error("Error fetching price list services:", error);
			res.status(500).json({ error: "Failed to fetch price list services" });
		}
	}
}

export default new PriceListController();
