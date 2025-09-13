import { Router } from "express";
import VaultController from "../controllers/Vault.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Main vault summary
router.get(
	"/summary",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getVaultSummary(req, res)
);

// Patient revenue endpoints
router.get(
	"/patient-services",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getPatientServicesRevenue(req, res)
);

router.get(
	"/patient-drugs",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getPatientDrugsRevenue(req, res)
);

router.get(
	"/patient-payments",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getPatientPayments(req, res)
);

router.get(
	"/patient-outstanding",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getPatientOutstandingBalances(req, res)
);

router.get(
	"/patient-discounts",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getPatientDiscounts(req, res)
);

// Manual payment endpoints
router.get(
	"/manual-payments",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getManualPayments(req, res)
);

router.post(
	"/manual-payments",
	verifyToken,
	checkPermission("manage_vault"),
	auditLogger,
	(req, res) => VaultController.createManualPayment(req, res)
);

// Pharmacy endpoints
router.get(
	"/drug-shipments",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getDrugShipmentCosts(req, res)
);

router.get(
	"/drug-sales",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getDrugSalesRevenue(req, res)
);

router.get(
	"/drug-profits",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getDrugSalesProfit(req, res)
);

// Employee wages endpoints
router.get(
	"/wages-owed",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getEmployeeWagesOwed(req, res)
);

router.get(
	"/wages-paid",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(req, res) => VaultController.getEmployeeWagesPaid(req, res)
);

// Add this route to your vault.routes.ts file
router.get(
	"/insurance-payments",
	verifyToken,
	checkPermission("view_vault"),
	(req, res) => VaultController.getInsurancePaymentsRevenue(req, res)
);

export default router;
