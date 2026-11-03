import { Request, Response } from "express";
import MedicalSupplyModel from "../models/MedicalSupply.model.js";
import {
    CreateMedicalSupplyDTO,
    UpdateMedicalSupplyDTO
} from "../utils/types/medicalSupplies.js";

export class MedicalSupplyController {
    async getAllMedicalSupplies(_req: Request, res: Response) {
        try {
            const supplies = await MedicalSupplyModel.getAllMedicalSupplies();
            res.json(supplies);
        } catch (error) {
            console.error("Error fetching medical supplies:", error);
            res.status(500).json({ error: "Failed to fetch medical supplies" });
        }
    }

    async getMedicalSupplyById(req: Request, res: Response) {
        try {
            const supplyId = parseInt(req.params.id);
            const supply = await MedicalSupplyModel.getMedicalSupplyById(supplyId);

            if (!supply) {
                res.status(404).json({ error: "Medical supply not found" });
                return;
            }

            res.json(supply);
        } catch (error) {
            console.error("Error fetching medical supply:", error);
            res.status(500).json({ error: "Failed to fetch medical supply" });
        }
    }

    async createMedicalSupply(req: Request, res: Response) {
        try {
            const supplyData: CreateMedicalSupplyDTO = req.body;

            // Validate required fields
            if (!supplyData.name || !supplyData.sale_quantity) {
                res.status(400).json({
                    error: "Name and sale quantity are required"
                });
                return;
            }

            // Validate numeric fields
            if (supplyData.sale_quantity <= 0) {
                res.status(400).json({
                    error: "Sale quantity must be greater than 0"
                });
                return;
            }

            if (
                supplyData.min_stock_alert !== undefined &&
                supplyData.min_stock_alert < 0
            ) {
                res.status(400).json({
                    error: "Min stock alert cannot be negative"
                });
                return;
            }

            // Get user ID from authenticated request
            const userId = (req as any).user.userId;
            const newSupply = await MedicalSupplyModel.createMedicalSupply(
                supplyData,
                userId
            );

            res.status(201).json(newSupply);
        } catch (error: any) {
            if (error.message === "Medical supply name already exists") {
                res.status(409).json({ error: error.message });
            } else {
                console.error("Error creating medical supply:", error);
                res.status(500).json({ error: "Failed to create medical supply" });
            }
        }
    }

    async updateMedicalSupply(req: Request, res: Response) {
        try {
            const supplyId = parseInt(req.params.id);
            const updateData: UpdateMedicalSupplyDTO = {
                ...req.body,
                supply_id: supplyId
            };

            // Validate numeric fields if provided
            if (
                updateData.sale_quantity !== undefined &&
                updateData.sale_quantity <= 0
            ) {
                res.status(400).json({
                    error: "Sale quantity must be greater than 0"
                });
                return;
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

            const updatedSupply = await MedicalSupplyModel.updateMedicalSupply(
                updateData
            );
            res.json(updatedSupply);
        } catch (error: any) {
            if (error.message === "Medical supply not found") {
                res.status(404).json({ error: error.message });
            } else if (error.message === "Medical supply name already exists") {
                res.status(409).json({ error: error.message });
            } else {
                console.error("Error updating medical supply:", error);
                res.status(500).json({ error: "Failed to update medical supply" });
            }
        }
    }

    async deleteMedicalSupply(req: Request, res: Response) {
        try {
            const supplyId = parseInt(req.params.id);
            await MedicalSupplyModel.deleteMedicalSupply(supplyId);
            res.status(204).send();
        } catch (error: any) {
            if (error.message === "Medical supply not found") {
                res.status(404).json({ error: error.message });
            } else if (error.message.includes("Cannot delete medical supply")) {
                res.status(400).json({ error: error.message });
            } else {
                console.error("Error deleting medical supply:", error);
                res.status(500).json({ error: "Failed to delete medical supply" });
            }
        }
    }

    async searchMedicalSupplies(req: Request, res: Response) {
        try {
            const searchTerm = req.query.q as string;

            if (!searchTerm || searchTerm.trim().length === 0) {
                res.status(400).json({ error: "Search term is required" });
                return;
            }

            const supplies = await MedicalSupplyModel.searchMedicalSupplies(
                searchTerm.trim()
            );
            res.json(supplies);
        } catch (error) {
            console.error("Error searching medical supplies:", error);
            res.status(500).json({ error: "Failed to search medical supplies" });
        }
    }

    async getMedicalSupplySuggestions(req: Request, res: Response) {
        try {
            const prefix = req.query.prefix as string;

            if (!prefix || prefix.trim().length === 0) {
                res.status(400).json({ error: "Prefix is required" });
                return;
            }

            const suggestions = await MedicalSupplyModel.getMedicalSupplySuggestions(
                prefix.trim()
            );
            res.json(suggestions);
        } catch (error) {
            console.error("Error getting medical supply suggestions:", error);
            res.status(500).json({
                error: "Failed to get medical supply suggestions"
            });
        }
    }

    async getLowStockSupplies(_req: Request, res: Response) {
        try {
            const lowStockSupplies = await MedicalSupplyModel.getLowStockSupplies();
            res.json(lowStockSupplies);
        } catch (error) {
            console.error("Error fetching low stock medical supplies:", error);
            res.status(500).json({
                error: "Failed to fetch low stock medical supplies"
            });
        }
    }
}

export default new MedicalSupplyController();
