// Enhanced src/app/models/Patient.model.ts
import { query } from "./database/connection.js";
import {
	Patient,
	CreatePatientDTO,
	UpdatePatientDTO,
	AdmitPatientDTO,
	DischargePatientDTO,
	PatientSearchResult,
	PatientHistory
} from "../utils/types/patients.js";
import { Bill, BillDetail } from "../utils/types/billing.js";
import { Service } from "../utils/types/services.js";

export class PatientModel {
	async getAllPatients(): Promise<Patient[]> {
		const sql = `
            SELECT * FROM Patient 
            ORDER BY name;
        `;
		const result = await query(sql);
		return result.rows;
	}

	async getPatientById(patientId: number): Promise<Patient | null> {
		const sql = `
            SELECT p.*, ic.name as insurance_company_name
            FROM Patient p
            LEFT JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
            WHERE p.patient_id = $1;
        `;
		const result = await query(sql, [patientId]);
		return result.rows[0] || null;
	}

	async createPatient(
		data: CreatePatientDTO
	): Promise<Patient | { patient: Patient; admission: any; bill: Bill }> {
		await query("BEGIN");
		try {
			// Validate referring doctor if provided
			if (data.referring_doctor_id) {
				const doctorCheck = await query(
					"SELECT doctor_id FROM Doctor WHERE doctor_id = $1 AND is_active = true",
					[data.referring_doctor_id]
				);
				if (doctorCheck.rows.length === 0) {
					throw new Error("Doctor not found");
				}
			}

			// Validate insurance company if provided
			if (data.insurance_id) {
				const insuranceCheck = await query(
					"SELECT insurance_id FROM InsuranceCompany WHERE insurance_id = $1",
					[data.insurance_id]
				);
				if (insuranceCheck.rows.length === 0) {
					throw new Error("Insurance company not found");
				}
			}

			// Create patient
			const patientSql = `
                INSERT INTO Patient (
                    name, gender, phone, address, payment_type,
                    insurance_id, insurance_card_id, guardian_info,
                    quick_check, referring_doctor_id, is_active, created_by_user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *;
            `;

			const patientResult = await query(patientSql, [
				data.name,
				data.gender,
				data.phone || null,
				data.address || null,
				data.payment_type,
				data.insurance_id || null,
				data.insurance_card_id || null,
				data.guardian_info ? JSON.stringify(data.guardian_info) : null,
				data.quick_check,
				data.referring_doctor_id || null,
				data.is_active || false,
				data.created_by_user_id
			]);

			const newPatient = patientResult.rows[0];

			// If patient should be admitted immediately
			if (
				data.admit_patient &&
				data.attending_doctors &&
				data.diagnosis
			) {
				const admissionResult = await this.admitPatient(
					{
						patient_id: newPatient.patient_id,
						diagnosis: data.diagnosis,
						attending_doctors: data.attending_doctors
					},
					data.created_by_user_id!
				);

				await query("COMMIT");
				return {
					patient: newPatient,
					admission: admissionResult.admission,
					bill: admissionResult.bill
				};
			}

			await query("COMMIT");
			return newPatient;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async updatePatient(data: UpdatePatientDTO): Promise<Patient | null> {
		await query("BEGIN");
		try {
			// Check if patient exists
			const existingPatient = await this.getPatientById(data.patient_id);
			if (!existingPatient) {
				throw new Error("Patient not found");
			}

			// Validate referring doctor if provided
			if (data.referring_doctor_id) {
				const doctorCheck = await query(
					"SELECT doctor_id FROM Doctor WHERE doctor_id = $1 AND is_active = true",
					[data.referring_doctor_id]
				);
				if (doctorCheck.rows.length === 0) {
					throw new Error("Doctor not found");
				}
			}

			// Validate insurance company if provided
			if (data.insurance_id) {
				const insuranceCheck = await query(
					"SELECT insurance_id FROM InsuranceCompany WHERE insurance_id = $1",
					[data.insurance_id]
				);
				if (insuranceCheck.rows.length === 0) {
					throw new Error("Insurance company not found");
				}
			}

			const updateFields: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			// Build dynamic update query
			Object.entries(data).forEach(([key, value]) => {
				if (key !== "patient_id" && value !== undefined) {
					if (key === "guardian_info" && value) {
						updateFields.push(`${key} = $${paramCount}`);
						values.push(JSON.stringify(value));
						paramCount++;
					} else if (key !== "attending_doctors") {
						// Skip attending_doctors as it's handled separately
						updateFields.push(`${key} = $${paramCount}`);
						values.push(value);
						paramCount++;
					}
				}
			});

			if (updateFields.length === 0 && !data.attending_doctors) {
				return existingPatient;
			}

			// Update patient basic info if there are fields to update
			if (updateFields.length > 0) {
				values.push(data.patient_id);
				const sql = `
                    UPDATE Patient 
                    SET ${updateFields.join(", ")}
                    WHERE patient_id = $${paramCount}
                    RETURNING *;
                `;
				await query(sql, values);
			}

			// Handle attending doctors updates if patient is currently admitted
			if (data.attending_doctors) {
				const currentAdmission = await this.getCurrentAdmission(
					data.patient_id
				);
				if (currentAdmission) {
					// Remove doctors if specified
					if (
						data.attending_doctors.remove &&
						data.attending_doctors.remove.length > 0
					) {
						const placeholders = data.attending_doctors.remove
							.map((_, i) => `$${i + 2}`)
							.join(",");
						await query(
							`DELETE FROM DoctorPatientHistory 
                             WHERE patient_history_id = $1 AND doctor_id IN (${placeholders})`,
							[
								currentAdmission.patient_history_id,
								...data.attending_doctors.remove
							]
						);
					}

					// Add doctors if specified
					if (
						data.attending_doctors.add &&
						data.attending_doctors.add.length > 0
					) {
						for (const doctorId of data.attending_doctors.add) {
							// Verify doctor exists and is active
							const doctorCheck = await query(
								"SELECT doctor_id FROM Doctor WHERE doctor_id = $1 AND is_active = true",
								[doctorId]
							);
							if (doctorCheck.rows.length === 0) {
								throw new Error(
									`Doctor with ID ${doctorId} not found`
								);
							}

							// Add doctor to current admission
							await query(
								`INSERT INTO DoctorPatientHistory (patient_history_id, doctor_id) 
                                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
								[currentAdmission.patient_history_id, doctorId]
							);
						}
					}
				}
			}

			const updatedPatient = await this.getPatientById(data.patient_id);
			await query("COMMIT");
			return updatedPatient;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async admitPatient(
		data: AdmitPatientDTO,
		userId: number
	): Promise<{ admission: PatientHistory; bill: Bill }> {
		await query("BEGIN");
		try {
			// Check if patient exists
			const patient = await this.getPatientById(data.patient_id);
			if (!patient) {
				throw new Error("Patient not found");
			}

			// Check if patient is already admitted
			const currentAdmission = await this.getCurrentAdmission(
				data.patient_id
			);
			if (currentAdmission) {
				throw new Error("Patient is already admitted");
			}

			// Validate attending doctors
			for (const doctorId of data.attending_doctors) {
				const doctorCheck = await query(
					"SELECT doctor_id FROM Doctor WHERE doctor_id = $1 AND is_active = true",
					[doctorId]
				);
				if (doctorCheck.rows.length === 0) {
					throw new Error("Doctor not found");
				}
			}

			// Create bill first
			const billSql = `
                INSERT INTO Bill (
                    patient_id, total_amount, paid_amount, generated_at, issued_by_user_id
                ) VALUES ($1, 0, 0, CURRENT_TIMESTAMP, $2)
                RETURNING *;
            `;
			const billResult = await query(billSql, [data.patient_id, userId]);
			const bill = billResult.rows[0];

			// Create patient history entry
			const historySql = `
                INSERT INTO PatientHistory (
                    patient_id, bill_id, quick_check, diagnosis, admission_time
                ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                RETURNING *;
            `;
			const historyResult = await query(historySql, [
				data.patient_id,
				bill.bill_id,
				patient.quick_check,
				data.diagnosis
			]);
			const admission = historyResult.rows[0];

			// Add attending doctors to the admission
			for (const doctorId of data.attending_doctors) {
				await query(
					"INSERT INTO DoctorPatientHistory (patient_history_id, doctor_id) VALUES ($1, $2)",
					[admission.patient_history_id, doctorId]
				);
			}

			// Mark patient as active
			await query(
				"UPDATE Patient SET is_active = true WHERE patient_id = $1",
				[data.patient_id]
			);

			// Auto-add services if quick_check is false
			if (!patient.quick_check) {
				await this.addAutoAdmissionServices(
					data.patient_id,
					bill.bill_id,
					userId
				);
			}

			await query("COMMIT");
			return { admission, bill };
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async dischargePatient(
		data: DischargePatientDTO
	): Promise<{ patient: Patient; finalBill: Bill }> {
		await query("BEGIN");
		try {
			// Check if patient exists and is admitted
			const patient = await this.getPatientById(data.patient_id);
			if (!patient) {
				throw new Error("Patient not found");
			}

			const currentAdmission = await this.getCurrentAdmission(
				data.patient_id
			);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			const dischargeTime = data.discharge_time
				? new Date(data.discharge_time)
				: new Date();

			// Update patient history with discharge info
			await query(
				`UPDATE PatientHistory 
                 SET discharge_time = $1, leave_reason = $2
                 WHERE patient_history_id = $3`,
				[
					dischargeTime,
					data.leave_reason,
					currentAdmission.patient_history_id
				]
			);

			// Mark patient as inactive
			await query(
				"UPDATE Patient SET is_active = false WHERE patient_id = $1",
				[data.patient_id]
			);

			// Deactivate all active patient services
			await query(
				`UPDATE ActivePatientService 
                 SET is_active = false, end_date = $1 
                 WHERE patient_id = $2 AND is_active = true`,
				[dischargeTime, data.patient_id]
			);

			// Get final bill
			const finalBill = await this.getPatientBill(
				currentAdmission.bill_id!
			);

			await query("COMMIT");
			return {
				patient: (await this.getPatientById(data.patient_id))!,
				finalBill
			};
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getCurrentAdmission(
		patientId: number
	): Promise<PatientHistory | null> {
		const sql = `
            SELECT ph.*, 
                   array_agg(DISTINCT e.name) as attending_doctors,
                   array_agg(DISTINCT dph.doctor_id) as attending_doctor_ids
            FROM PatientHistory ph
            LEFT JOIN DoctorPatientHistory dph ON ph.patient_history_id = dph.patient_history_id
            LEFT JOIN Employee e ON dph.doctor_id = e.employee_id
            LEFT JOIN Doctor d ON e.employee_id = d.doctor_id
            WHERE ph.patient_id = $1 AND ph.discharge_time IS NULL
            GROUP BY ph.patient_history_id
            ORDER BY ph.admission_time DESC
            LIMIT 1;
        `;
		const result = await query(sql, [patientId]);
		return result.rows[0] || null;
	}

	async getPatientHistory(patientId: number): Promise<PatientHistory[]> {
		const sql = `
            SELECT ph.*, 
                   array_agg(DISTINCT e.name) as attending_doctors,
                   b.total_amount, b.paid_amount
            FROM PatientHistory ph
            LEFT JOIN DoctorPatientHistory dph ON ph.patient_history_id = dph.patient_history_id
            LEFT JOIN Employee e ON dph.doctor_id = e.employee_id
            LEFT JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE ph.patient_id = $1
            GROUP BY ph.patient_history_id, b.bill_id
            ORDER BY ph.admission_time DESC;
        `;
		const result = await query(sql, [patientId]);
		return result.rows;
	}

	async updateCurrentDiagnosis(
		patientId: number,
		diagnosis: string
	): Promise<PatientHistory> {
		await query("BEGIN");
		try {
			const currentAdmission = await this.getCurrentAdmission(patientId);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			await query(
				"UPDATE PatientHistory SET diagnosis = $1 WHERE patient_history_id = $2",
				[diagnosis, currentAdmission.patient_history_id]
			);

			const updatedAdmission = await this.getCurrentAdmission(patientId);
			await query("COMMIT");
			return updatedAdmission!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async addServiceToPatient(
		patientId: number,
		serviceId: number,
		userId: number,
		startDate: Date = new Date()
	): Promise<{ service: Service; billDetail: BillDetail }> {
		await query("BEGIN");
		try {
			// Validate patient exists and is admitted
			const currentAdmission = await this.getCurrentAdmission(patientId);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			// Validate service exists
			const serviceCheck = await query(
				"SELECT * FROM Service WHERE service_id = $1",
				[serviceId]
			);
			if (serviceCheck.rows.length === 0) {
				throw new Error("Service not found");
			}
			const service = serviceCheck.rows[0];

			// Add service to active patient services
			const activeServiceSql = `
                INSERT INTO ActivePatientService (
                    patient_id, service_id, start_date, is_active
                ) VALUES ($1, $2, $3, true)
                RETURNING *;
            `;
			const activeServiceResult = await query(activeServiceSql, [
				patientId,
				serviceId,
				startDate
			]);

			// Get default price for the service
			const priceSql = `
                SELECT sp.price 
                FROM ServicePrice sp
                JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
                WHERE sp.service_id = $1 AND pl.is_default = true;
            `;
			const priceResult = await query(priceSql, [serviceId]);
			const price = priceResult.rows[0]?.price || 0;

			// Add service to bill
			const billDetailSql = `
                INSERT INTO BillDetail (
                    bill_id, service_id, quantity, unit_price, 
                    charge_type, sale_type, generated_at
                ) VALUES ($1, $2, 1, $3, 'service', 'admitted', CURRENT_TIMESTAMP)
                RETURNING *;
            `;
			const billDetailResult = await query(billDetailSql, [
				currentAdmission.bill_id,
				serviceId,
				price
			]);

			// Update bill total
			await this.updateBillTotal(currentAdmission.bill_id!);

			// Handle service drugs if any
			await this.addServiceDrugsToPatient(
				patientId,
				serviceId,
				currentAdmission.bill_id!,
				userId
			);

			await query("COMMIT");
			return {
				service: activeServiceResult.rows[0],
				billDetail: billDetailResult.rows[0]
			};
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async removeServiceFromPatient(
		patientId: number,
		serviceId: number
	): Promise<any> {
		await query("BEGIN");
		try {
			// Find active service
			const activeServiceSql = `
                SELECT * FROM ActivePatientService 
                WHERE patient_id = $1 AND service_id = $2 AND is_active = true;
            `;
			const activeServiceResult = await query(activeServiceSql, [
				patientId,
				serviceId
			]);

			if (activeServiceResult.rows.length === 0) {
				throw new Error("Active service not found");
			}

			// Deactivate service
			await query(
				`UPDATE ActivePatientService 
                 SET is_active = false, end_date = CURRENT_TIMESTAMP 
                 WHERE active_service_id = $1`,
				[activeServiceResult.rows[0].active_service_id]
			);

			await query("COMMIT");
			return activeServiceResult.rows[0];
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	private async addAutoAdmissionServices(
		patientId: number,
		billId: number,
		userId: number
	): Promise<void> {
		// Get services that should be auto-added on admission
		const autoServicesSql = `
            SELECT s.*, sp.price
            FROM Service s
            JOIN ServicePrice sp ON s.service_id = sp.service_id
            JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
            WHERE s.auto_add_on_admission = true AND pl.is_default = true;
        `;
		const autoServicesResult = await query(autoServicesSql);

		if (autoServicesResult.rows.length === 0) {
			return; // No services to auto-add
		}

		for (const service of autoServicesResult.rows) {
			// Add to active patient services
			await query(
				`INSERT INTO ActivePatientService (patient_id, service_id, start_date, is_active) 
                 VALUES ($1, $2, CURRENT_TIMESTAMP, true)`,
				[patientId, service.service_id]
			);

			// Add to bill details
			await query(
				`INSERT INTO BillDetail (
                    bill_id, service_id, quantity, unit_price, 
                    charge_type, sale_type, generated_at
                ) VALUES ($1, $2, 1, $3, 'auto_service', 'admitted', CURRENT_TIMESTAMP)`,
				[billId, service.service_id, service.price]
			);

			// Handle service drugs
			await this.addServiceDrugsToPatient(
				patientId,
				service.service_id,
				billId,
				userId
			);
		}

		// Update bill total
		await this.updateBillTotal(billId);
	}

	private async addServiceDrugsToPatient(
		patientId: number,
		serviceId: number,
		billId: number,
		userId: number
	): Promise<void> {
		// Get drugs associated with this service
		const serviceDrugsSql = `
            SELECT sd.drug_id, dc.*, sp.price as drug_price
            FROM ServiceDrug sd
            JOIN DrugCard dc ON sd.drug_id = dc.drug_id
            LEFT JOIN (
                SELECT ds.drug_id, sp.price
                FROM DrugShipment ds
                JOIN ShipmentPrice sp ON ds.shipment_id = sp.shipment_id
                JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
                WHERE pl.is_default = true
                ORDER BY ds.expiry_date ASC
                LIMIT 1
            ) sp ON dc.drug_id = sp.drug_id
            WHERE sd.service_id = $1;
        `;
		const serviceDrugsResult = await query(serviceDrugsSql, [serviceId]);

		for (const drugInfo of serviceDrugsResult.rows) {
			await this.dispenseDrugToPatient(
				patientId,
				drugInfo.drug_id,
				drugInfo.sale_quantity,
				billId,
				userId,
				"service"
			);
		}
	}

	private async dispenseDrugToPatient(
		patientId: number,
		drugId: number,
		quantity: number,
		billId: number,
		userId: number,
		chargeType: string = "manual"
	): Promise<void> {
		// Get available shipments (FIFO - First to expire, first out)
		const availableShipmentsSql = `
            SELECT ds.*, sp.price
            FROM DrugShipment ds
            JOIN ShipmentPrice sp ON ds.shipment_id = sp.shipment_id
            JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
            WHERE ds.drug_id = $1 AND ds.quantity > 0 AND pl.is_default = true
            ORDER BY ds.expiry_date ASC;
        `;
		const shipmentsResult = await query(availableShipmentsSql, [drugId]);

		if (shipmentsResult.rows.length === 0) {
			console.warn(`No available shipments for drug ID: ${drugId}`);
			return;
		}

		let remainingQuantity = quantity;
		let totalCost = 0;

		for (const shipment of shipmentsResult.rows) {
			if (remainingQuantity <= 0) break;

			const quantityToTake = Math.min(
				remainingQuantity,
				shipment.quantity
			);
			const cost = quantityToTake * parseFloat(shipment.price);

			// Create drug transaction
			const transactionSql = `
                INSERT INTO DrugTransaction (
                    shipment_id, transaction_type, quantity, price, created_by_user_id
                ) VALUES ($1, 'patient', $2, $3, $4)
                RETURNING transaction_id;
            `;
			const transactionResult = await query(transactionSql, [
				shipment.shipment_id,
				quantityToTake,
				shipment.price,
				userId
			]);

			// Update shipment quantity
			await query(
				"UPDATE DrugShipment SET quantity = quantity - $1 WHERE shipment_id = $2",
				[quantityToTake, shipment.shipment_id]
			);

			// Create drug usage record
			await query(
				`INSERT INTO DrugUsage (
                    patient_id, drug_id, transaction_id, remaining_quantity
                ) VALUES ($1, $2, $3, $4)`,
				[
					patientId,
					drugId,
					transactionResult.rows[0].transaction_id,
					quantityToTake
				]
			);

			// Add to bill details
			await query(
				`INSERT INTO BillDetail (
                    bill_id, drug_shipment_id, quantity, unit_price, 
                    charge_type, sale_type, generated_at
                ) VALUES ($1, $2, $3, $4, $5, 'admitted', CURRENT_TIMESTAMP)`,
				[
					billId,
					shipment.shipment_id,
					quantityToTake,
					shipment.price,
					chargeType
				]
			);

			totalCost += cost;
			remainingQuantity -= quantityToTake;
		}

		// Update bill total
		await this.updateBillTotal(billId);
	}

	private async updateBillTotal(billId: number): Promise<void> {
		const totalSql = `
            UPDATE Bill 
            SET total_amount = (
                SELECT COALESCE(SUM(quantity * unit_price), 0)
                FROM BillDetail 
                WHERE bill_id = $1
            )
            WHERE bill_id = $1;
        `;
		await query(totalSql, [billId]);
	}

	private async getPatientBill(billId: number): Promise<Bill> {
		const sql = `
            SELECT b.*, 
                   json_agg(
                       json_build_object(
                           'bill_detail_id', bd.bill_detail_id,
                           'service_id', bd.service_id,
                           'service_name', s.name,
                           'drug_shipment_id', bd.drug_shipment_id,
                           'drug_name', dc.name,
                           'quantity', bd.quantity,
                           'unit_price', bd.unit_price,
                           'charge_type', bd.charge_type,
                           'sale_type', bd.sale_type,
                           'generated_at', bd.generated_at
                       )
                   ) as bill_details
            FROM Bill b
            LEFT JOIN BillDetail bd ON b.bill_id = bd.bill_id
            LEFT JOIN Service s ON bd.service_id = s.service_id
            LEFT JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
            LEFT JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            WHERE b.bill_id = $1
            GROUP BY b.bill_id;
        `;
		const result = await query(sql, [billId]);
		return result.rows[0];
	}

	async searchPatients(searchTerm: string): Promise<PatientSearchResult[]> {
		const sql = `
            SELECT 
                patient_id,
                name,
                is_active,
                registration_date
            FROM Patient 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY 
                CASE 
                    WHEN LOWER(name) = LOWER($2) THEN 1
                    WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 2
                    ELSE 3
                END,
                name
            LIMIT 10;
        `;
		const result = await query(sql, [`%${searchTerm}%`, searchTerm]);
		return result.rows;
	}

	async getPatientSuggestions(
		prefix: string
	): Promise<PatientSearchResult[]> {
		const sql = `
            SELECT 
                patient_id,
                name,
                is_active,
                registration_date
            FROM Patient 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY 
                CASE 
                    WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 1
                    ELSE 2
                END,
                LENGTH(name),
                name
            LIMIT 5;
        `;
		const result = await query(sql, [`${prefix}%`, prefix]);
		return result.rows;
	}

	async getActivePatients(): Promise<Patient[]> {
		const sql = `
            SELECT * FROM Patient
            WHERE is_active = true
            ORDER BY name;
        `;
		const result = await query(sql);
		return result.rows;
	}
}

export default new PatientModel();
