import { Request, Response } from "express";
import PatientModel from "../models/Patient.model.js";
import {
	CreatePatientDTO,
	UpdatePatientDTO,
	AdmitPatientDTO,
	DischargePatientDTO,
	Patient,
	InsuranceCompany
} from "../utils/types/patients.js";
import DrugUsageModel from "../models/DrugUsage.model.js";
import {
	parsePagination,
	buildPage
} from "../utils/pagination.js";
import InsuranceModel from "../models/Insurance.model.js";

export class PatientController {
	async getAllPatients(req: Request, res: Response) {
		try {
			const pagination = parsePagination(req);
			const qRaw = req.query?.q;
			const q = typeof qRaw === "string" ? qRaw : Array.isArray(qRaw) ? String(qRaw[0] ?? "") : undefined;
			const { rows, total } = await PatientModel.getAllPatients(
				{ offset: pagination.offset, limit: pagination.limit, q }
			);
			res.status(200).json(buildPage(rows, total, pagination));
		} catch (error) {
			console.error("Error fetching patients:", error);
			res.status(500).json({ error: "Failed to fetch patients" });
		}
	}

	async getActivePatients(_req: Request, res: Response) {
		try {
			const patients = await PatientModel.getActivePatients();
			res.status(200).json(patients);
		} catch (error) {
			console.error("Error fetching active patients:", error);
			res.status(500).json({ error: "Failed to fetch active patients" });
		}
	}

	async getPatientById(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const patient: Patient &
				Partial<Record<"insurance", Partial<InsuranceCompany &
				{
					insurance_card_id: string | null,
					insurance_form_id: string | null
				}
				>>>
				= await PatientModel.getPatientById(patientId);

			if (!patient) {
				res.status(400).json({ error: "Patient not found" });
				return;
			}

			if (patient.insurance_id) {
				const insurance: Partial<InsuranceCompany> & Partial<{ insurance_card_id: string | null, insurance_form_id: string | null }> = await InsuranceModel.getInsuranceCompanyById(patient.insurance_id)
				// Remove unnecessary keys
				delete insurance.contact_info
				delete insurance.patient_count
				delete insurance.last_cleared_date
				insurance.insurance_card_id = patient.insurance_card_id
				insurance.insurance_form_id = patient.insurance_form_id
				patient.insurance = insurance
			}

			res.status(200).json(patient);
		} catch (error) {
			console.error("Error fetching patient:", error);
			res.status(500).json({ error: "Failed to fetch patient" });
		}
	}

	async createPatient(req: Request, res: Response) {
		try {
			const patientData: CreatePatientDTO = req.body;
			const userId = req.user?.userId;

			// Validate required fields
			if (
				!patientData.name ||
				!patientData.gender ||
				!patientData.payment_type
			) {
				res.status(400).json({
					error: "Name, gender, and payment type are required"
				});
				return;
			}

			// Validate payment type and insurance consistency
			if (
				patientData.payment_type === "insurance" &&
				!patientData.insurance_id
			) {
				res.status(400).json({
					error: "Insurance ID is required when payment type is insurance"
				});
				return;
			}

			if (
				patientData.payment_type !== "insurance" &&
				patientData.insurance_id
			) {
				res.status(400).json({
					error: "Insurance ID should not be provided when payment type is not insurance"
				});
				return;
			}

			// Set created_by_user_id
			patientData.created_by_user_id = userId;

			// Create patient (and optionally admit)
			const result = await PatientModel.createPatient(patientData);

			res.status(201).json(result);
		} catch (error: any) {
			if (
				error.message === "Doctor not found" ||
				error.message === "Insurance company not found" ||
				error.message ===
				"Insurance ID should not be provided when payment type is not insurance"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error creating patient:", error);
				res.status(500).json({ error: "Failed to create patient" });
			}
		}
	}

	async updatePatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const updateData: UpdatePatientDTO = {
				...req.body,
				patient_id: patientId
			};

			// Validate payment type and insurance consistency if being updated
			if (
				updateData.payment_type === "insurance" &&
				!updateData.insurance_id
			) {
				// Check if patient already has insurance_id
				const existingPatient = await PatientModel.getPatientById(
					patientId
				);
				if (!existingPatient?.insurance_id) {
					res.status(400).json({
						error: "Insurance ID is required when payment type is insurance"
					});
					return;
				}
			}

			const updatedPatient = await PatientModel.updatePatient(updateData);

			if (!updatedPatient) {
				res.status(400).json({ error: "Patient not found" });
				return;
			}

			res.status(200).json(updatedPatient);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Doctor not found" ||
				error.message === "Insurance company not found" ||
				error.message ===
				"Insurance ID is required when payment type is insurance" ||
				error.message ===
				"Insurance ID should not be provided when payment type is not insurance"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error updating patient:", error);
				res.status(500).json({ error: "Failed to update patient" });
			}
		}
	}

	async admitPatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const admissionData: AdmitPatientDTO = {
				...req.body,
				patient_id: patientId
			};
			if (!req.user) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}
			const userId = req.user.userId;

			// Validate required fields
			if (
				!admissionData.diagnosis ||
				!admissionData.attending_doctors ||
				!Array.isArray(admissionData.attending_doctors) ||
				!admissionData.attending_nurses ||
				!Array.isArray(admissionData.attending_nurses) ||
				admissionData.attending_doctors.length === 0
			) {
				res.status(400).json({
					error: "Diagnosis, at least one attending doctor and one attending nurse are required"
				});
				return;
			}

			const result = await PatientModel.admitPatient(
				admissionData,
				userId
			);
			res.status(201).json(result);
		} catch (error: any) {
			if (error.message === "Patient not found" ||
				error.message ===
				"Pricelist on admission does not match insurance pricelist" ||
				error.message === "Patient is already admitted" ||
				error.message === "Doctor not found" ||
				error.message === "No services to auto-add"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error admitting patient:", error);
				res.status(500).json({ error: "Failed to admit patient" });
			}
		}
	}

	async dischargePatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const dischargeData: DischargePatientDTO = {
				...req.body,
				patient_id: patientId
			};

			// Validate required fields
			if (!dischargeData.leave_reason) {
				res.status(400).json({
					error: "Leave reason is required"
				});
				return;
			}

			const result = await PatientModel.dischargePatient(dischargeData);
			res.status(200).json(result);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Patient is not currently admitted"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error discharging patient:", error);
				res.status(500).json({ error: "Failed to discharge patient" });
			}
		}
	}

	async getPatientHistory(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const history = await PatientModel.getPatientHistory(patientId);
			res.status(200).json(history);
		} catch (error) {
			console.error("Error fetching patient history:", error);
			res.status(500).json({ error: "Failed to fetch patient history" });
		}
	}

	async getPastAdmissions(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);

			// Validate patient exists
			const patient = await PatientModel.getPatientById(patientId);
			if (!patient) {
				res.status(400).json({ error: "Patient not found" });
				return;
			}

			const pastAdmissions = await PatientModel.getPastAdmissions(
				patientId
			);
			res.status(200).json(pastAdmissions);
		} catch (error) {
			console.error("Error fetching past admissions:", error);
			res.status(500).json({ error: "Failed to fetch past admissions" });
		}
	}

	async getAdmissionDetails(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const patientHistoryId = parseInt(req.params.historyId);

			// Validate patient exists
			const patient = await PatientModel.getPatientById(patientId);
			if (!patient) {
				res.status(400).json({ error: "Patient not found" });
				return;
			}

			const admissionDetails = await PatientModel.getAdmissionDetails(
				patientId,
				patientHistoryId
			);

			if (!admissionDetails) {
				res.status(400).json({ error: "Admission not found" });
				return;
			}

			res.status(200).json(admissionDetails);
		} catch (error) {
			console.error("Error fetching admission details:", error);
			res.status(500).json({
				error: "Failed to fetch admission details"
			});
		}
	}

	async getCurrentAdmission(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const admission = await PatientModel.getCurrentAdmission(patientId);

			if (!admission) {
				res.status(400).json({ error: "No current admission found" });
				return;
			}

			res.status(200).json(admission);
		} catch (error) {
			console.error("Error fetching current admission:", error);
			res.status(500).json({
				error: "Failed to fetch current admission"
			});
		}
	}

	async getCurrentAdmissionsWithStaff(
		_req: Request,
		res: Response
	): Promise<void> {
		try {
			let admissions = await PatientModel.getCurrentAdmissionsWithStaff();

			res.status(200).json(admissions);
		} catch (error) {
			console.error("Error fetching current admissions:", error);
			res.status(500).json({
				error: "Failed to fetch current admissions"
			});
		}
	}

	async updateDiagnosis(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const { diagnosis } = req.body;

			if (!diagnosis) {
				res.status(400).json({ error: "Diagnosis is required" });
				return;
			}

			const result = await PatientModel.updateCurrentDiagnosis(
				patientId,
				diagnosis
			);
			res.status(200).json(result);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Patient is not currently admitted"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error updating diagnosis:", error);
				res.status(500).json({ error: "Failed to update diagnosis" });
			}
		}
	}

	async addServiceToPatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const { service_id, start_date } = req.body;

			if (!req.user) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}
			const userId = req.user.userId;

			if (!service_id) {
				res.status(400).json({ error: "Service ID is required" });
				return;
			}

			const result = await PatientModel.addServiceToPatient(
				patientId,
				service_id,
				userId,
				start_date ? new Date(start_date) : undefined
			);

			res.status(201).json(result);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Service not found"
			) {
				res.status(400).json({ error: error.message });
			} else if (
				error.message === "Patient is not currently admitted") {
				res.status(403).json({ error: error.message })
			} else {
				console.error("Error adding service to patient:", error);
				res.status(500).json({
					error: "Failed to add service to patient"
				});
			}
		}
	}

	// Updated method: Stop service (rename from removeServiceFromPatient)
	async stopServiceForPatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const activeServiceId = parseInt(req.params.activeServiceId);

			const result = await PatientModel.stopServiceForPatient(
				patientId,
				activeServiceId
			);
			res.status(200).json(result);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Active service not found"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error stopping service for patient:", error);
				res.status(500).json({
					error: "Failed to stop service for patient"
				});
			}
		}
	}

	// New method: Completely remove service
	async removeServiceFromPatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const serviceId = parseInt(req.params.serviceId);

			const result = await PatientModel.removeServiceFromPatient(
				patientId,
				serviceId
			);
			res.status(200).json(result);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Active service not found"
			) {
				res.status(400).json({ error: error.message });
			} else if (error.message === "Patient is not currently admitted") {
				res.status(403).json({ error: error.message });
			} else {
				console.error("Error removing service from patient:", error);
				res.status(500).json({
					error: "Failed to remove service from patient"
				});
			}
		}
	}

	// New method: Completely remove drug
	async removeDrugFromPatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const drugUsageId = parseInt(req.params.drugUsageId);

			const result = await PatientModel.removeDrugFromPatient(
				patientId,
				drugUsageId
			);
			res.status(200).json(result);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Drug usage not found"
			) {
				res.status(400).json({ error: error.message });
			} else if (error.message === "Patient is not currently admitted") {
				res.status(403).json({ error: error.message });
			} else {
				console.error("Error removing drug from patient:", error);
				res.status(500).json({
					error: "Failed to remove drug from patient"
				});
			}
		}
	}

	async searchPatients(req: Request, res: Response) {
		try {
			const searchTerm = req.query.q as string;

			if (!searchTerm || searchTerm.trim().length === 0) {
				res.status(400).json({ error: "Search term is required" });
				return;
			}

			const patients = await PatientModel.searchPatients(
				searchTerm.trim()
			);
			res.status(200).json(patients);
		} catch (error) {
			console.error("Error searching patients:", error);
			res.status(500).json({ error: "Failed to search patients" });
		}
	}

	async getPatientSuggestions(req: Request, res: Response) {
		try {
			const prefix = req.query.prefix as string;

			if (!prefix || prefix.trim().length === 0) {
				res.status(400).json({ error: "Prefix is required" });
				return;
			}

			const suggestions = await PatientModel.getPatientSuggestions(
				prefix.trim()
			);
			res.status(200).json(suggestions);
		} catch (error) {
			console.error("Error getting patient suggestions:", error);
			res.status(500).json({
				error: "Failed to get patient suggestions"
			});
		}
	}

	async getPatientServices(req: Request, res: Response, onlyCurrent = false): Promise<void> {
		try {
			const patientId = parseInt(req.params.id);
			const services = await PatientModel.getPatientServices(patientId, onlyCurrent);
			res.json(services);
		} catch (error) {
			console.error("Error fetching patient services:", error);
			res.status(500).json({ error: "Failed to fetch patient services" });
		}
	}

	async getPatientDrugs(req: Request, res: Response, onlyCurrent = false): Promise<void> {
		try {
			const patientId = parseInt(req.params.id);
			const drugs = await PatientModel.getPatientDrugs(patientId, onlyCurrent);
			res.json(drugs);
		} catch (error) {
			console.error("Error fetching patient drugs:", error);
			res.status(500).json({ error: "Failed to fetch patient drugs" });
		}
	}

	async addDrugToPatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.id);
			const {
				drug_id,
				shipment_id,
				quantity,
				price,
				patient_history_id
			} = req.body;

			if (!req.user) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}
			const userId = req.user.userId;

			// Validate required fields
			if (
				!drug_id ||
				!shipment_id ||
				!quantity ||
				!price ||
				!patient_history_id
			) {
				res.status(400).json({
					error: "Drug ID, shipment ID, patient history ID, quantity, and price are required"
				});
				return;
			}

			const result = await DrugUsageModel.createDrugUsage(
				{
					patient_id: patientId,
					drug_id,
					patient_history_id,
					shipment_id,
					quantity,
					price
				},
				userId
			);

			await PatientModel.addDrugToPatientBill(
				patientId,
				shipment_id,
				quantity,
				price
			);
			res.status(201).json(result);
		} catch (error: any) {
			if (
				error.message === "Patient not found" ||
				error.message === "Drug not found" ||
				error.message === "Shipment not found" ||
				error.message === "Invalid shipment for this drug" ||
				error.message === "Patient is not currently admitted"
			) {
				res.status(400).json({ error: error.message });
			} else if (
				error.message === "Insufficient quantity in selected shipment"
			) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error adding drug to patient:", error);
				res.status(500).json({
					error: "Failed to add drug to patient"
				});
			}
		}
	}
}

export default new PatientController();
