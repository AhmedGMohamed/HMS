// src/app/controllers/Bill.controller.ts
import { Request, Response } from "express";
import BillModel from "../models/Bill.model.js";

class BillController {
	async getBillById(req: Request, res: Response): Promise<void> {
		try {
			const billId = parseInt(req.params.id);
			const bill = await BillModel.getBillById(billId);
			if (!bill) {
				res.status(404).json({ error: "Bill not found" });
				return;
			}
			res.json(bill);
		} catch (error) {
			console.error("Error fetching bill:", error);
			res.status(500).json({ error: "Failed to fetch bill" });
		}
	}

	async updateBill(req: Request, res: Response): Promise<void> {
		try {
			const billId = parseInt(req.params.id);
			const updates = req.body;
			const bill = await BillModel.updateBill(billId, updates);
			if (!bill) {
				res.status(404).json({ error: "Bill not found" });
				return;
			}
			res.json(bill);
		} catch (error) {
			console.error("Error updating bill:", error);
			res.status(500).json({ error: "Failed to update bill" });
		}
	}
}

export default new BillController();