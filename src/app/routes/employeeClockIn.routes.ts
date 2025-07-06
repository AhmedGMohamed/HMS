// src/app/routes/employeeClockIn.routes.ts
import { Router } from "express";
import EmployeeClockInController from "../controllers/EmployeeClockIn.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { validateId } from "../middleware/validate.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.get(
	"/",
	verifyToken,
	checkPermission("manage_clocking"),
	auditLogger,
	(req, res) => EmployeeClockInController.getAllClockIns(req, res)
);

router.get(
	"/:id",
	verifyToken,
	checkPermission("manage_clocking"),
	validateId,
	auditLogger,
	(req, res) => EmployeeClockInController.getClockInById(req, res)
);

router.get(
	"/employee/:id",
	verifyToken,
	checkPermission("manage_clocking"),
	validateId,
	auditLogger,
	(req, res) => EmployeeClockInController.getClockInsByEmployeeId(req, res)
);

router.post(
	"/",
	verifyToken,
	checkPermission("manage_clocking"),
	auditLogger,
	(req, res) => EmployeeClockInController.createClockIn(req, res)
);

router.put(
	"/:id",
	verifyToken,
	checkPermission("manage_clocking"),
	validateId,
	auditLogger,
	(req, res) => EmployeeClockInController.updateClockIn(req, res)
);

export default router;
