// src/app/routes/employee.routes.ts
import { Router } from "express";
import EmployeeController from "../controllers/Employee.controller.js";
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
import { verify } from "jsonwebtoken";

const router = Router();

router.get(
	"/",
	verifyToken,
	checkPermission("manage_employees"),
	auditLogger,
	(req, res) => EmployeeController.getAllEmployees(req, res)
);

router.get(
	"/:id",
	verifyToken,
	checkPermission("manage_employees"),
	validateId,
	auditLogger,
	(req, res) => EmployeeController.getEmployeeById(req, res)
);

router.post("/", verifyToken, adminOnly, auditLogger, (req, res) =>
	EmployeeController.createEmployee(req, res)
);

router.put(
	"/:id",
	verifyToken,
	adminOnly,
	validateId,
	auditLogger,
	(req, res) => EmployeeController.updateEmployee(req, res)
);

router.delete(
	"/:id",
	verifyToken,
	adminOnly,
	validateId,
	auditLogger,
	(req, res) => EmployeeController.deleteEmployee(req, res)
);

router.get(
	"/search",
	verifyToken,
	checkPermission("manage_employees"),
	validateSearchTerm,
	auditLogger,
	(req, res) => EmployeeController.searchEmployeesByName(req, res)
);


router.get("/nurses/available", verifyToken, auditLogger, (req, res) =>EmployeeController.getAvailableNurses(req, res));

export default router;
