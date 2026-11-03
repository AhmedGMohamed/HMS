import { Request, Response } from "express";
import MedicalSupplyShipmentModel from "../models/MedicalSupplyShipment.model.js";

export class MedicalSupplyShipmentController {
    async getAllShipments(_req: Request, res: Response) {
        try {
            const shipments = await MedicalSupplyShipmentModel.getAllShipments();
            res.json(shipments);
        } catch (error) {
            console.error("Error fetching shipments:", error);
            res.status(500).json({ error: "Failed to fetch shipments" });
        }
    }

    async getShipmentById(req: Request, res: Response) {
        try {
            const shipmentId = parseInt(req.params.id);
            const shipment = await MedicalSupplyShipmentModel.getShipmentById(shipmentId);
            res.json(shipment);
        } catch (error: any) {
            if (error.message === "Shipment not found") {
                res.status(404).json({ error: error.message });
            } else {
                console.error("Error fetching shipment:", error);
                res.status(500).json({ error: "Failed to fetch shipment" });
            }
        }
    }

    async createShipment(req: Request, res: Response) {
        try {
            const { supply_id, warehouse_id, quantity, buy_price, expiry_date, prices } = req.body;
            const userId = (req as any).user.userId;

            // Validate required fields
            if (!supply_id || !warehouse_id || !quantity || !buy_price || !expiry_date || !prices) {
                res.status(400).json({ error: "Missing required fields" });
                return;
            }

            const shipment = await MedicalSupplyShipmentModel.createShipment(req.body, userId);
            res.status(201).json(shipment);
        } catch (error: any) {
            console.error("Error creating shipment:", error);
            res.status(500).json({ error: "Failed to create shipment" });
        }
    }

    async updateShipment(req: Request, res: Response) {
        try {
            const shipmentId = parseInt(req.params.id);
            const shipment = await MedicalSupplyShipmentModel.updateShipment(shipmentId, req.body);
            res.json(shipment);
        } catch (error: any) {
            if (error.message === "Shipment not found") {
                res.status(404).json({ error: error.message });
            } else {
                console.error("Error updating shipment:", error);
                res.status(500).json({ error: "Failed to update shipment" });
            }
        }
    }

    async deleteShipment(req: Request, res: Response) {
        try {
            const shipmentId = parseInt(req.params.id);
            await MedicalSupplyShipmentModel.deleteShipment(shipmentId);
            res.status(204).send();
        } catch (error: any) {
            if (error.message === "Shipment not found") {
                res.status(404).json({ error: error.message });
            } else if (error.message === "Cannot delete shipment that has been used in transactions") {
                res.status(400).json({ error: error.message });
            } else {
                console.error("Error deleting shipment:", error);
                res.status(500).json({ error: "Failed to delete shipment" });
            }
        }
    }

    async getShipmentsBySupply(req: Request, res: Response) {
        try {
            const supplyId = parseInt(req.params.id);
            const shipments = await MedicalSupplyShipmentModel.getShipmentsBySupply(supplyId);
            res.json(shipments);
        } catch (error) {
            console.error("Error fetching shipments by supply:", error);
            res.status(500).json({ error: "Failed to fetch shipments" });
        }
    }

    async getShipmentsByWarehouse(req: Request, res: Response) {
        try {
            const warehouseId = parseInt(req.params.id);
            const shipments = await MedicalSupplyShipmentModel.getShipmentsByWarehouse(warehouseId);
            res.json(shipments);
        } catch (error) {
            console.error("Error fetching shipments by warehouse:", error);
            res.status(500).json({ error: "Failed to fetch shipments" });
        }
    }
}

export default new MedicalSupplyShipmentController();
