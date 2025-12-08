import { Router } from "express";
import ReportController from "../controllers/Report.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// ==================== PATIENT REPORTS ====================

router.get(
	"/patients",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientReports(req, res)
);


router.get(
	"/patients/formatted",
	verifyToken,
	checkPermission("manage_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientReportsFormatted(req, res)
);

router.get(
	"/admissions/:admissionId/formatted",
	verifyToken,
	checkPermission("manage_reports"),
	auditLogger,
	(req, res) => ReportController.getSingleAdmissionFormatted(req, res)
);

// ==================== DOCTOR REPORTS ====================

router.get(
	"/doctors/referred",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getAllPatientsReferredByDoctors(req, res)
);

router.get(
	"/doctors/:doctorId/referred",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientsReferredByDoctor(req, res)
);

router.get(
	"/doctors/attended",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getAllPatientsAttendedByDoctors(req, res)
);

router.get(
	"/doctors/:doctorId/attended",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientsAttendedByDoctor(req, res)
);

router.get(
	"/doctors/:doctorId/supervised",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientsSupervisedByDoctor(req, res)
);

// ==================== NURSE REPORTS ====================

router.get(
	"/nurses/attended",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getAllPatientsAttendedByNurses(req, res)
);

router.get(
	"/nurses/:nurseId/attended",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientsAttendedByNurse(req, res)
);

// ==================== STATISTICAL REPORTS ====================

router.get(
	"/statistics/patients",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientStatistics(req, res)
);

router.get(
	"/statistics/patients/chart",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientStatisticsWithChart(req, res)
);

router.get(
	"/statistics/patients/payment-type",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientStatisticsByPaymentType(req, res)
);

// Average stay by time
router.get(
    "/statistics/average-stay",
    verifyToken,
    checkPermission("view_reports"),
    auditLogger,
    (req, res) => ReportController.getAverageStayByTime(req, res)
);

// Revenue trends
router.get(
    "/statistics/revenue-trends",
    verifyToken,
    checkPermission("view_reports"),
    auditLogger,
    (req, res) => ReportController.getRevenueTrends(req, res)
);

// Admission vs Discharge trends
router.get(
    "/statistics/admission-discharge",
    verifyToken,
    checkPermission("view_reports"),
    auditLogger,
    (req, res) => ReportController.getAdmissionDischargeTrends(req, res)
);

// Top services
router.get(
    "/statistics/top-services",
    verifyToken,
    checkPermission("view_reports"),
    auditLogger,
    (req, res) => ReportController.getTopServices(req, res)
);

// Top drugs
router.get(
    "/statistics/top-drugs",
    verifyToken,
    checkPermission("view_reports"),
    auditLogger,
    (req, res) => ReportController.getTopDrugs(req, res)
);

// Staff utilization
router.get(
    "/statistics/staff-utilization",
    verifyToken,
    checkPermission("view_reports"),
    auditLogger,
    (req, res) => ReportController.getStaffUtilization(req, res)
);

// Comprehensive statistics (all at once)
router.get(
    "/statistics/comprehensive",
    verifyToken,
    checkPermission("view_reports"),
    auditLogger,
    (req, res) => ReportController.getComprehensiveStatistics(req, res)
);

router.get(
	"/statistics/patients/gender",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getPatientStatisticsByGender(req, res)
);

router.get(
	"/statistics/doctors",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getDoctorStatistics(req, res)
);

// ==================== EMPLOYEE PAYMENT REPORTS ====================

router.get(
	"/employees/payments",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getEmployeePaymentReports(req, res)
);

router.get(
	"/employees/payments/chart",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getEmployeePaymentReportsWithChart(req, res)
);

router.get(
	"/employees/:employeeId/payments",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getEmployeePaymentReportById(req, res)
);

// ==================== SUMMARY REPORTS ====================

router.get(
	"/summary",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getReportSummary(req, res)
);

// ==================== EMPLOYEE CLOCK-IN REPORTS ====================

router.get(
	"/employees/clock-ins",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getEmployeeClockInReports(req, res)
);

router.get(
	"/employees/clock-ins/chart",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getEmployeeClockInReportsWithChart(req, res)
);

router.get(
	"/employees/:employeeId/clock-ins",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getEmployeeClockInReportById(req, res)
);

router.get(
	"/statistics/clock-ins",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getClockInStatistics(req, res)
);

router.get(
	"/statistics/clock-ins/chart",
	verifyToken,
	checkPermission("view_reports"),
	auditLogger,
	(req, res) => ReportController.getClockInStatisticsWithChart(req, res)
);

export default router;
