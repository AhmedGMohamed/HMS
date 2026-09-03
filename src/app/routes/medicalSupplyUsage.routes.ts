import { Router } from "express";
import MedicalSupplyUsageController from "../controllers/MedicalSupplyUsage.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply authentication to all routes
router.use(verifyToken);

// Basic operations
router.get("/", auditLogger, (req, res) =>
    MedicalSupplyUsageController.getAllMedicalSupplyUsages(req, res)
);

// Monitoring — must be registered before the `/:id` wildcard so that
// literal segments ("history", "summary") are not swallowed by the
// single-param route below.
router.get("/pending/administrations", (req, res) =>
    MedicalSupplyUsageController.getPendingAdministrations(req, res)
);

router.get("/history", auditLogger, (req, res) =>
    MedicalSupplyUsageController.getMedicalSupplyUsageHistory(req, res)
);

router.get("/summary", auditLogger, (req, res) =>
    MedicalSupplyUsageController.getUsageSummary(req, res)
);

router.get("/:id", validateId, (req, res) =>
    MedicalSupplyUsageController.getMedicalSupplyUsageById(req, res)
);

// Patient operations
router.post(
    "/patient/:patientId",
    checkPermission("manage_patients"),
    auditLogger,
    (req, res) => MedicalSupplyUsageController.addMedicalSupplyToPatient(req, res)
);

router.delete(
    "/patient/:patientId/:usageId",
    checkPermission("manage_patients"),
    auditLogger,
    (req, res) =>
        MedicalSupplyUsageController.removeMedicalSupplyFromPatient(req, res)
);

router.get("/available-shipments/:supplyId", (req, res) =>
    MedicalSupplyUsageController.getAvailableShipments(req, res)
);

export default router;
