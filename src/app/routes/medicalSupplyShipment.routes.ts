import { Router } from "express";
import MedicalSupplyShipmentController from "../controllers/MedicalSupplyShipment.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply authentication to all routes
router.use(verifyToken);

// Basic CRUD operations
router.get("/", auditLogger, (req, res) =>
    MedicalSupplyShipmentController.getAllShipments(req, res)
);

router.get("/:id", validateId, (req, res) =>
    MedicalSupplyShipmentController.getShipmentById(req, res)
);

router.post("/", checkPermission("manage_pharmacy"), auditLogger, (req, res) =>
    MedicalSupplyShipmentController.createShipment(req, res)
);

router.put(
    "/:id",
    checkPermission("manage_pharmacy"),
    validateId,
    auditLogger,
    (req, res) => MedicalSupplyShipmentController.updateShipment(req, res)
);

router.delete(
    "/:id",
    checkPermission("manage_pharmacy"),
    validateId,
    auditLogger,
    (req, res) => MedicalSupplyShipmentController.deleteShipment(req, res)
);

// Supply-specific shipments
router.get("/supply/:id", validateId, auditLogger, (req, res) =>
    MedicalSupplyShipmentController.getShipmentsBySupply(req, res)
);

// Warehouse-specific shipments
router.get("/warehouse/:id", validateId, auditLogger, (req, res) =>
    MedicalSupplyShipmentController.getShipmentsByWarehouse(req, res)
);

export default router;
