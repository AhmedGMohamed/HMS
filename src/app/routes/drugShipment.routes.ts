// src/app/routes/drugShipments.routes.ts
import { Router } from "express";
import DrugShipmentController from "../controllers/DrugShipment.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply authentication and pharmacy management permission to all routes
router.use(verifyToken, checkPermission("manage_pharmacy"));

// Basic CRUD operations
router.get("/", auditLogger, (req, res) =>
	DrugShipmentController.getAllShipments(req, res)
);

router.get("/:id", validateId, (req, res) =>
	DrugShipmentController.getShipmentById(req, res)
);

router.post("/", auditLogger, (req, res) =>
	DrugShipmentController.createShipment(req, res)
);

router.put("/:id", validateId, auditLogger, (req, res) =>
	DrugShipmentController.updateShipment(req, res)
);

router.delete("/:id", validateId, auditLogger, (req, res) =>
	DrugShipmentController.deleteShipment(req, res)
);

// Drug-specific shipments
router.get("/drug/:id", validateId, auditLogger, (req, res) =>
	DrugShipmentController.getShipmentsByDrug(req, res)
);

// Warehouse-specific shipments
router.get("/warehouse/:id", validateId, auditLogger, (req, res) =>
	DrugShipmentController.getShipmentsByWarehouse(req, res)
);
export default router;
