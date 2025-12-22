import { Request, Response } from "express";
import MedicalSupplyUsageModel from "../models/MedicalSupplyUsage.model.js";
import PatientModel from "../models/Patient.model.js";

export class MedicalSupplyUsageController {
    async getAllMedicalSupplyUsages(_req: Request, res: Response) {
        try {
            const usages = await MedicalSupplyUsageModel.getAllMedicalSupplyUsages();
            res.json(usages);
        } catch (error) {
            console.error("Error fetching medical supply usages:", error);
            res.status(500).json({ error: "Failed to fetch medical supply usages" });
        }
    }

    async getMedicalSupplyUsageById(req: Request, res: Response) {
        try {
            const usageId = parseInt(req.params.id);
            const usage = await MedicalSupplyUsageModel.getMedicalSupplyUsageById(
                usageId
            );

            if (!usage) {
                res.status(404).json({ error: "Medical supply usage not found" });
                return;
            }

            res.json(usage);
        } catch (error) {
            console.error("Error fetching medical supply usage:", error);
            res.status(500).json({ error: "Failed to fetch medical supply usage" });
        }
    }

    async addMedicalSupplyToPatient(req: Request, res: Response) {
        try {
            const patientId = parseInt(req.params.patientId);
            const { supplyId, shipmentId, quantity, price } = req.body;

            // Validate required fields
            if (!supplyId || !shipmentId || !quantity || !price) {
                res.status(400).json({
                    error: "Supply ID, shipment ID, quantity, and price are required"
                });
                return;
            }

            // Validate numeric fields
            if (quantity <= 0) {
                res.status(400).json({ error: "Quantity must be greater than 0" });
                return;
            }

            if (price < 0) {
                res.status(400).json({ error: "Price cannot be negative" });
                return;
            }

            const userId = (req as any).user.userId;
            const result = await PatientModel.addMedicalSupplyToPatient(
                patientId,
                supplyId,
                shipmentId,
                quantity,
                price,
                userId
            );

            res.status(201).json(result);
        } catch (error: any) {
            if (
                error.message === "Patient is not currently admitted" ||
                error.message === "No active bill found for patient"
            ) {
                res.status(400).json({ error: error.message });
            } else if (
                error.message === "Medical supply not found" ||
                error.message === "Invalid shipment for this medical supply"
            ) {
                res.status(404).json({ error: error.message });
            } else if (error.message === "Insufficient quantity in selected shipment") {
                res.status(400).json({ error: error.message });
            } else {
                console.error("Error adding medical supply to patient:", error);
                res.status(500).json({
                    error: "Failed to add medical supply to patient"
                });
            }
        }
    }

    async removeMedicalSupplyFromPatient(req: Request, res: Response) {
        try {
            const patientId = parseInt(req.params.patientId);
            const usageId = parseInt(req.params.usageId);
            const userId = (req as any).user.userId;

            await PatientModel.removeMedicalSupplyFromPatient(
                patientId,
                usageId,
                userId
            );

            res.status(204).send();
        } catch (error: any) {
            if (
                error.message === "Medical supply usage not found for this patient" ||
                error.message === "Patient is not currently admitted"
            ) {
                res.status(404).json({ error: error.message });
            } else {
                console.error("Error removing medical supply from patient:", error);
                res.status(500).json({
                    error: "Failed to remove medical supply from patient"
                });
            }
        }
    }

    async getPendingAdministrations(_req: Request, res: Response) {
        try {
            const pending = await MedicalSupplyUsageModel.getPendingAdministrations();
            res.json(pending);
        } catch (error) {
            console.error("Error fetching pending administrations:", error);
            res.status(500).json({
                error: "Failed to fetch pending administrations"
            });
        }
    }

    async getMedicalSupplyUsageHistory(req: Request, res: Response) {
        try {
            const patientId = req.params.patientId
                ? parseInt(req.params.patientId)
                : undefined;
            const supplyId = req.params.supplyId
                ? parseInt(req.params.supplyId)
                : undefined;

            const history = await MedicalSupplyUsageModel.getMedicalSupplyUsageHistory(
                patientId,
                supplyId
            );
            res.json(history);
        } catch (error) {
            console.error("Error fetching medical supply usage history:", error);
            res.status(500).json({
                error: "Failed to fetch medical supply usage history"
            });
        }
    }

    async getAvailableShipments(req: Request, res: Response) {
        try {
            const supplyId = parseInt(req.params.supplyId);
            const shipments = await MedicalSupplyUsageModel.getAvailableShipments(
                supplyId
            );
            res.json(shipments);
        } catch (error) {
            console.error("Error fetching available shipments:", error);
            res.status(500).json({ error: "Failed to fetch available shipments" });
        }
    }
}

export default new MedicalSupplyUsageController();
