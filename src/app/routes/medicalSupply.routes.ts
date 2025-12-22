import { Router } from "express";
import MedicalSupplyController from "../controllers/MedicalSupply.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply authentication to all routes
router.use(verifyToken);

// Basic CRUD operations
router.get("/", auditLogger, (req, res) =>
    MedicalSupplyController.getAllMedicalSupplies(req, res)
);

router.get("/:id", validateId, (req, res) =>
    MedicalSupplyController.getMedicalSupplyById(req, res)
);

router.post(
    "/",
    checkPermission("manage_supplies"),
    auditLogger,
    (req, res) => MedicalSupplyController.createMedicalSupply(req, res)
);

router.put(
    "/:id",
    checkPermission("manage_supplies"),
    validateId,
    auditLogger,
    (req, res) => MedicalSupplyController.updateMedicalSupply(req, res)
);

router.delete(
    "/:id",
    checkPermission("manage_supplies"),
    validateId,
    auditLogger,
    (req, res) => MedicalSupplyController.deleteMedicalSupply(req, res)
);

// Search and suggestions
router.get("/search/supplies", (req, res) =>
    MedicalSupplyController.searchMedicalSupplies(req, res)
);

router.get("/search/suggestions", (req, res) =>
    MedicalSupplyController.getMedicalSupplySuggestions(req, res)
);

// Stock monitoring
router.get("/monitor/low-stock", (req, res) =>
    MedicalSupplyController.getLowStockSupplies(req, res)
);

export default router;
