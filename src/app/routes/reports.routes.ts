/**
 * Reports routes — Phase 6.11.
 *
 * Mounted at `/api/reports`, **before** the legacy `/api/reports` router so
 * the new paths win. The legacy router and its controller/model stay in place
 * (the legacy HTML page still calls them) until Phase 7 cleanup; the five
 * paths the two routers share resolve to this one.
 *
 * Permission matrix (plan §3.3 / §4.4):
 *   - every route: `verifyToken` + `auditLogger`
 *   - read routes: `view_reports`
 *   - payroll routes: `view_reports` + `manage_employees`
 *   - exports: read permissions + `manage_reports`
 *
 * Ordering note: static segments (`/patients/export`) are registered before
 * parametric ones (`/patients/:patientId`) so Express does not treat
 * "export" as an id.
 */

import { Router } from "express";

import ReportsController from "../controllers/Reports.controller.js";
import {
	checkPermission,
	checkPermissions,
	verifyToken,
} from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

router.get(
	"/options",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.getOptions(req, res)
);

/* ------------------------------------------------------------------ */
/* Patient report                                                      */
/* ------------------------------------------------------------------ */

// Static segments first: `/patients/export` must not be read as an id.
router.get(
	"/patients/export",
	verifyToken,
	checkPermissions(["view_reports", "manage_reports"]),
	auditLogger,
	(req, res) => ReportsController.exportPatients(req, res)
);

router.get(
	"/patients/:patientId",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.getPatient(req, res)
);

router.get(
	"/patients",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.listPatients(req, res)
);

/* ------------------------------------------------------------------ */
/* Doctor report                                                       */
/* ------------------------------------------------------------------ */

// Static segments first: `/doctors/export` must not be read as an id.
router.get(
	"/doctors/export",
	verifyToken,
	checkPermissions(["view_reports", "manage_reports"]),
	auditLogger,
	(req, res) => ReportsController.exportDoctors(req, res)
);

router.get(
	"/doctors/:doctorId",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.getDoctor(req, res)
);

router.get(
	"/doctors",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.listDoctors(req, res)
);

/* ------------------------------------------------------------------ */
/* Nurse report                                                        */
/* ------------------------------------------------------------------ */

// Static segments first: `/nurses/export` must not be read as an id.
router.get(
	"/nurses/export",
	verifyToken,
	checkPermissions(["view_reports", "manage_reports"]),
	auditLogger,
	(req, res) => ReportsController.exportNurses(req, res)
);

router.get(
	"/nurses/:nurseId",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.getNurse(req, res)
);

router.get(
	"/nurses",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.listNurses(req, res)
);

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

// Static segment first, for the same reason as the tabs above.
router.get(
	"/statistics/export",
	verifyToken,
	checkPermissions(["view_reports", "manage_reports"]),
	auditLogger,
	(req, res) => ReportsController.exportStatistics(req, res)
);

router.get(
	"/statistics",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.getStatistics(req, res)
);

/* ------------------------------------------------------------------ */
/* Employee payments (payroll)                                         */
/* ------------------------------------------------------------------ */

// Payroll exposes employee names and pay, so every route needs the payroll
// permission pair, not just `view_reports`.
const PAYROLL_READ = ["view_reports", "manage_employees"] as const;

// Static segments first: `/employee-payments/export` must not be read as an id.
router.get(
	"/employee-payments/export",
	verifyToken,
	checkPermissions([...PAYROLL_READ, "manage_reports"]),
	auditLogger,
	(req, res) => ReportsController.exportEmployeePayments(req, res)
);

// Deeper parametric path before the shallower one, so `/…/:employeeId` cannot
// swallow `/…/:employeeId/payments/:paymentId`.
router.get(
	"/employee-payments/:employeeId/payments/:paymentId",
	verifyToken,
	checkPermissions([...PAYROLL_READ]),
	auditLogger,
	(req, res) => ReportsController.getPaymentAssociations(req, res)
);

router.get(
	"/employee-payments/:employeeId",
	verifyToken,
	checkPermissions([...PAYROLL_READ]),
	auditLogger,
	(req, res) => ReportsController.getEmployeePayment(req, res)
);

router.get(
	"/employee-payments",
	verifyToken,
	checkPermissions([...PAYROLL_READ]),
	auditLogger,
	(req, res) => ReportsController.listEmployeePayments(req, res)
);

/* ------------------------------------------------------------------ */
/* Clock-in                                                            */
/* ------------------------------------------------------------------ */

// Static segment first: `/clock-ins/export` must not be read as an id.
router.get(
	"/clock-ins/export",
	verifyToken,
	checkPermissions(["view_reports", "manage_reports"]),
	auditLogger,
	(req, res) => ReportsController.exportClockIns(req, res)
);

router.get(
	"/clock-ins/:employeeId",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.getClockInEmployee(req, res)
);

router.get(
	"/clock-ins",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportsController.listClockIns(req, res)
);

export default router;
