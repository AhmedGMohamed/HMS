// src/app/routes/doctor.routes.ts
import { Router } from "express";
import DoctorController from "../controllers/Doctor.controller.js";
import {
	verifyToken,
	checkPermission,
	adminOnly
} from "../middleware/auth.middleware.js";
import {
	validateId,
	validateSearchTerm
} from "../middleware/validate.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.get(
	"/",
	verifyToken,
	auditLogger,
	(req, res) => DoctorController.getAllDoctors(req, res)
);

router.get(
	"/:id",
	verifyToken,
	validateId,
	auditLogger,
	(req, res) => DoctorController.getDoctorById(req, res)
);

router.post("/", verifyToken, adminOnly, auditLogger, (req, res) =>
	DoctorController.createDoctor(req, res)
);

router.put(
	"/:id",
	verifyToken,
	adminOnly,
	validateId,
	auditLogger,
	(req, res) => DoctorController.updateDoctor(req, res)
);

router.delete(
	"/:id",
	verifyToken,
	adminOnly,
	validateId,
	auditLogger,
	(req, res) => DoctorController.deleteDoctor(req, res)
);

router.get(
	"/search",
	verifyToken,
	validateSearchTerm,
	auditLogger,
	(req, res) => DoctorController.searchDoctorsByName(req, res)
);

export default router;
