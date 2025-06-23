import { Router } from "express";
import PatientController from "../controllers/Patient.controller.js"
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.get("/active", auditLogger, (req, res) => PatientController.getActivePatients(req, res));

export default router;
