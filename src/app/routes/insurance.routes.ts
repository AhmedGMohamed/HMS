// src/app/routes/insurance.routes.ts
import { Router } from "express";
import InsuranceController from "../controllers/insurance.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Insurance Company Management
router.get(
	"/",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.getAllInsuranceCompanies
);

router.get(
	"/:id",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.getInsuranceCompanyById
);

router.post(
	"/",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.createInsuranceCompany
);

router.put(
	"/:id",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.updateInsuranceCompany
);

router.delete(
	"/:id",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.deleteInsuranceCompany
);

// Patient Management
router.get(
	"/:id/patients",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.getPatientsByInsurance
);

// Insurance Payments Management
router.get(
	"/:id/payments",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.getAllInsurancePayments
);

router.post(
	"/:id/payments",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.createInsurancePayment
);

router.delete(
	"/:id/payments/:paymentId",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.deleteInsurancePayment
);

// Clear Outstanding Balance
router.post(
	"/:id/clear-balance",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.clearInsuranceBalance
);

// Insurance Reports
router.post(
	"/:id/reports",
	verifyToken,
	checkPermission("manage_reports"),
	InsuranceController.generateInsuranceReport
);

router.get(
	"/:id/statistics",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.getInsuranceStatistics
);

router.get(
	"/:id/outstanding",
	verifyToken,
	checkPermission("manage_insurance"),
	auditLogger,
	InsuranceController.getInsuranceOutstanding
);

router.post(
	"/:id/patients/:patientId/reports",
	verifyToken,
	checkPermission("manage_insurance"),
	InsuranceController.generatePatientReport
);

export default router;
