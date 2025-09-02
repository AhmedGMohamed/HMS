// Enhanced src/app/routes/patient.routes.ts
import { Router } from "express";
import PatientController from "../controllers/Patient.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import {
	validateId,
	validateSearchTerm,
	validatePrefix
} from "../middleware/validate.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Get all patients
router.get(
	"/",
	verifyToken,
	checkPermission("manage_patients"),
	auditLogger,
	(req, res) => PatientController.getAllPatients(req, res)
);

// Get active patients
router.get(
	"/active",
	verifyToken,
	checkPermission("view_patients"),
	auditLogger,
	(req, res) => PatientController.getActivePatients(req, res)
);

// Search patients
router.get(
	"/search",
	verifyToken,
	checkPermission("view_patients"),
	validateSearchTerm,
	auditLogger,
	(req, res) => PatientController.searchPatients(req, res)
);

// Get patient suggestions for autocomplete
router.get(
	"/suggestions",
	verifyToken,
	checkPermission("view_patients"),
	validatePrefix,
	auditLogger,
	(req, res) => PatientController.getPatientSuggestions(req, res)
);

// Get specific patient by ID
router.get(
	"/:id",
	verifyToken,
	checkPermission("view_patients"),
	validateId,
	auditLogger,
	(req, res) => PatientController.getPatientById(req, res)
);

// Get patient history
router.get(
	"/:id/history",
	verifyToken,
	checkPermission("view_patients"),
	validateId,
	auditLogger,
	(req, res) => PatientController.getPatientHistory(req, res)
);

// Get current admission
router.get(
	"/:id/admission/current",
	verifyToken,
	checkPermission("view_patients"),
	validateId,
	auditLogger,
	(req, res) => PatientController.getCurrentAdmission(req, res)
);

// Create new patient
router.post(
	"/",
	verifyToken,
	checkPermission("manage_patients"),
	auditLogger,
	(req, res) => PatientController.createPatient(req, res)
);

// Update patient information
router.put(
	"/:id",
	verifyToken,
	checkPermission("manage_patients"),
	validateId,
	auditLogger,
	(req, res) => PatientController.updatePatient(req, res)
);

// Admit patient
router.post(
	"/:id/admit",
	verifyToken,
	checkPermission("manage_admissions"),
	validateId,
	auditLogger,
	(req, res) => PatientController.admitPatient(req, res)
);

// Discharge patient
router.post(
	"/:id/discharge",
	verifyToken,
	checkPermission("manage_admissions"),
	validateId,
	auditLogger,
	(req, res) => PatientController.dischargePatient(req, res)
);

// Update diagnosis
router.put(
	"/:id/diagnosis",
	verifyToken,
	checkPermission("manage_patients"),
	validateId,
	auditLogger,
	(req, res) => PatientController.updateDiagnosis(req, res)
);

// Add service to patient
router.post(
	"/:id/services",
	verifyToken,
	checkPermission("manage_patient_services"),
	validateId,
	auditLogger,
	(req, res) => PatientController.addServiceToPatient(req, res)
);

router.post(
	"/:id/drugs",
	verifyToken,
	checkPermission("manage_patients"),	
	validateId,
	auditLogger,
	(req, res) => PatientController.addDrugToPatient(req, res)
);

// Remove service from patient
router.delete(
	"/:id/services/:serviceId",
	verifyToken,
	checkPermission("manage_patient_services"),
	validateId,
	auditLogger,
	(req, res) => PatientController.removeServiceFromPatient(req, res)
);

router.get(
	"/:id/services",
	verifyToken,
	checkPermission("view_patients"),
	(req, res) => PatientController.getPatientServices(req, res)
);

router.get(
	"/:id/drugs",
	verifyToken,
	checkPermission("view_patients"),
	(req, res) => PatientController.getPatientDrugs(req, res)
);

export default router;
