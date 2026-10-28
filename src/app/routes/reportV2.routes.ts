/**
 * Reports v2 routes — Phase 6.11.
 *
 * Mounted at `/api/reports/v2` **before** the legacy `/api/reports` router so
 * the v2 paths win. The legacy router and its controller/model stay in place
 * (the legacy HTML page still calls them) until Phase 7 cleanup.
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

import ReportV2Controller from "../controllers/ReportV2.controller.js";
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
	(req, res) => ReportV2Controller.getOptions(req, res)
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
	(req, res) => ReportV2Controller.exportPatients(req, res)
);

router.get(
	"/patients/:patientId",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportV2Controller.getPatient(req, res)
);

router.get(
	"/patients",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportV2Controller.listPatients(req, res)
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
	(req, res) => ReportV2Controller.exportDoctors(req, res)
);

router.get(
	"/doctors/:doctorId",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportV2Controller.getDoctor(req, res)
);

router.get(
	"/doctors",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportV2Controller.listDoctors(req, res)
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
	(req, res) => ReportV2Controller.exportNurses(req, res)
);

router.get(
	"/nurses/:nurseId",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportV2Controller.getNurse(req, res)
);

router.get(
	"/nurses",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportV2Controller.listNurses(req, res)
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
	(req, res) => ReportV2Controller.exportStatistics(req, res)
);

router.get(
	"/statistics",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportV2Controller.getStatistics(req, res)
);

export default router;
