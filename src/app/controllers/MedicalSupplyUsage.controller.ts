import { Request, Response } from "express";
import MedicalSupplyUsageModel from "../models/MedicalSupplyUsage.model.js";
import PatientModel from "../models/Patient.model.js";
import { buildPage, parsePagination } from "../utils/pagination.js";
import { MedicalSupplyUsageFilters } from "../utils/types/medicalSupplies.js";

function asString(value: unknown): string | undefined {
    if (value == null) return undefined;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        const head = value[0];
        return typeof head === "string" ? head : undefined;
    }
    return undefined;
}

function asInt(value: unknown): number | undefined {
    const raw = asString(value);
    if (raw == null) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function asBool(value: unknown): boolean | undefined {
    const raw = asString(value);
    if (raw == null) return undefined;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return undefined;
}

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
            const { supply_id, shipment_id, quantity, price } = req.body;

            // Validate required fields
            if (!supply_id || !shipment_id || !quantity || !price) {
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
                supply_id,
                shipment_id,
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
            const pagination = parsePagination(req);

            const filters: MedicalSupplyUsageFilters = {
                offset: pagination.offset,
                limit: pagination.limit,
            };

            const startDate = asString(req.query?.startDate);
            if (startDate) filters.startDate = startDate;

            const endDate = asString(req.query?.endDate);
            if (endDate) filters.endDate = endDate;

            const patientId = asInt(req.query?.patientId);
            if (patientId !== undefined) filters.patientId = patientId;

            const patientHistoryId = asInt(req.query?.patientHistoryId);
            if (patientHistoryId !== undefined)
                filters.patientHistoryId = patientHistoryId;

            const supplyId = asInt(req.query?.supplyId);
            if (supplyId !== undefined) filters.supplyId = supplyId;

            const isActive = asBool(req.query?.isActive);
            if (isActive !== undefined) filters.isActive = isActive;

            const search = asString(req.query?.search);
            if (search) filters.search = search;

            const { rows, total } =
                await MedicalSupplyUsageModel.getMedicalSupplyUsageHistory(filters);

            res.json(buildPage(rows, total, pagination));
        } catch (error) {
            console.error("Error fetching medical supply usage history:", error);
            res.status(500).json({
                error: "Failed to fetch medical supply usage history"
            });
        }
    }

    async getUsageSummary(_req: Request, res: Response) {
        try {
            const summary = await MedicalSupplyUsageModel.getUsageSummary();
            res.json(summary);
        } catch (error) {
            console.error("Error fetching medical supply usage summary:", error);
            res.status(500).json({
                error: "Failed to fetch medical supply usage summary"
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
