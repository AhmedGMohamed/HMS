// src/app/routes/employeePayment.routes.ts
import { Router } from "express";
import EmployeePaymentController from "../controllers/EmployeePayment.controller.js";
import {
	verifyToken,
	checkPermission
} from "../middleware/auth.middleware.js";
import { validateId } from "../middleware/validate.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.get(
	"/",
	verifyToken,
	checkPermission("manage_payments"),
	auditLogger,
	(req, res) => EmployeePaymentController.getAllPayments(req, res)
);

router.get(
	"/unpaid-system",
	verifyToken,
	checkPermission("manage_payments"),
	auditLogger,
	(req, res) => EmployeePaymentController.getUnpaidSystemPayments(req, res)
);

/* Pending queue — literal segments must precede "/:id". */

router.get(
	"/pending",
	verifyToken,
	checkPermission("manage_payments"),
	auditLogger,
	(req, res) => EmployeePaymentController.getPendingPaymentGroups(req, res)
);

router.get(
	"/pending/stats",
	verifyToken,
	checkPermission("manage_payments"),
	auditLogger,
	(req, res) => EmployeePaymentController.getPendingPaymentStats(req, res)
);

router.get(
	"/pending/employee/:id",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) =>
		EmployeePaymentController.getPendingPaymentsForEmployee(req, res)
);

router.put(
	"/pending/employee/:id/paid",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) =>
		EmployeePaymentController.markPendingPaymentsPaidForEmployee(req, res)
);

router.put(
	"/pending/employee/:id/void",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) =>
		EmployeePaymentController.voidPendingPaymentsForEmployee(req, res)
);

router.get(
	"/paid/employee/:id",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) => EmployeePaymentController.getPaidPaymentsByEmployeeId(req, res)
)

router.get(
	"/employee/:id",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) => EmployeePaymentController.getPaymentsByEmployeeId(req, res)
);

router.get(
	"/:id",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) => EmployeePaymentController.getPaymentById(req, res)
);

router.post(
	"/",
	verifyToken,
	checkPermission("manage_payments"),
	auditLogger,
	(req, res) => EmployeePaymentController.createPayment(req, res)
);

router.put(
	"/:id",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) => EmployeePaymentController.updatePayment(req, res)
);

router.put(
	"/:id/paid",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) => EmployeePaymentController.markPaymentAsPaid(req, res)
);

router.put(
	"/:id/void",
	verifyToken,
	checkPermission("manage_payments"),
	validateId,
	auditLogger,
	(req, res) => EmployeePaymentController.voidPayment(req, res)
);

export default router;
