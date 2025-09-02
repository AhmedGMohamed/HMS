// src/app/routes/drugUsage.routes.ts
import { Router } from "express";
import DrugUsageController from "../controllers/DrugUsage.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply authentication and pharmacy management permission to all routes
router.use(verifyToken, checkPermission("manage_pharmacy"));

// Basic CRUD operations
router.get("/", auditLogger, (req, res) => DrugUsageController.getAllDrugUsages(req, res));

router.get("/:id", validateId, (req, res) =>
	DrugUsageController.getDrugUsageById(req, res)
);

router.post("/", auditLogger, (req, res) => DrugUsageController.createDrugUsage(req, res));

router.put("/:id", validateId, auditLogger, (req, res) =>
	DrugUsageController.updateDrugUsage(req, res)
);

// Shipment selection endpoint
router.get("/shipments/:id", validateId, auditLogger, (req, res) =>
	DrugUsageController.getAvailableShipments(req, res)
);

// Monitoring endpoints
router.get("/monitor/pending", (req, res) => DrugUsageController.getPendingAdministrations(req, res));

// History and reporting
router.get("/history/usage", auditLogger, (req, res) =>DrugUsageController.getDrugUsageHistory(req, res));

export default router;
