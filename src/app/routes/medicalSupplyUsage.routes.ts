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

// Monitoring
router.get("/pending/administrations", (req, res) =>
    MedicalSupplyUsageController.getPendingAdministrations(req, res)
);

router.get("/history/:patientId/:supplyId", (req, res) =>
    MedicalSupplyUsageController.getMedicalSupplyUsageHistory(req, res)
);

router.get("/patient-history/:patientId", (req, res) =>
    MedicalSupplyUsageController.getMedicalSupplyUsageHistory(req, res)
);

router.get("/available-shipments/:supplyId", (req, res) =>
    MedicalSupplyUsageController.getAvailableShipments(req, res)
);

export default router;
