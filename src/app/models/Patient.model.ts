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
import EmployeePaymentModel from "./EmployeePayment.model.js";
import {
	CreateEmployeePaymentDTO,
	PaymentPatientAssociation
} from "../utils/types/employees.js";
import BillModel from "./Bill.model.js";

export class PatientModel {
	async getAllPatients(
		pagination?: { offset?: number; limit?: number; q?: string }
	): Promise<{ rows: Patient[]; total: number }> {
		const offset = Math.max(0, pagination?.offset ?? 0)
		const limit = Math.max(1, Math.min(pagination?.limit ?? 25, 100))
		const q = pagination?.q?.trim()

		let baseSql = `SELECT * FROM Patient`
		const params: unknown[] = []
		if (q) {
			baseSql += ` WHERE name ILIKE $1 OR national_id ILIKE $1`
			params.push(`%${q}%`)
			params.push(limit, offset)
		} else {
			params.push(limit, offset)
		}
		baseSql += ` ORDER BY`
		if (q) {
			baseSql += ` CASE
                    		WHEN LOWER(name) = LOWER($1) THEN 1
							WHEN national_id = $1 THEN 2
                    		WHEN LOWER(name) LIKE LOWER($1) || '%' THEN 3
                    		WHEN national_id LIKE $1 || '%' THEN 4
                    		ELSE 5
                		END,`
		}
		baseSql += ` name LIMIT $${params.length - 1} OFFSET $${params.length}`

		let total: number
		let countSql = ""
		let countParams = []
		if (q) {
			countSql = `SELECT COUNT(*) AS c 
			FROM Patient 
			WHERE name ILIKE $1 OR national_id ILIKE $1
			GROUP BY name, national_id`
			countParams.push(`%${q}%`)
		} else {
			countSql = `SELECT COUNT(*) AS c FROM Patient`
		}

		const [result, count] = await Promise.all([
			query(baseSql, params),
			query(countSql, countParams)
		])
		total = Number(count.rows[0]?.c ?? 0)
		return { rows: result.rows, total }
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

			// Create patient (removed quick_check from patient creation)
			const patientSql = `
                INSERT INTO Patient (
                    name, national_id, gender, phone, address, payment_type,
                    insurance_id, insurance_card_id, insurance_form_id, guardian_info,
                    referring_doctor_id, is_active, created_by_user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *;
            `;

			const patientResult = await query(patientSql, [
				data.name,
				data.national_id,
				data.gender,
				data.phone || null,
				data.address || null,
				data.payment_type,
				data.insurance_id || null,
				data.insurance_card_id || null,
				data.insurance_form_id || null,
				data.guardian_info ? JSON.stringify(data.guardian_info) : null,
				data.referring_doctor_id || null,
				data.is_active || false,
				data.created_by_user_id
			]);

			const newPatient = patientResult.rows[0];

			// If patient should be admitted immediately
			if (
				data.admit_patient &&
				data.attending_doctors &&
				data.attending_nurses &&
				data.diagnosis
			) {
				const admissionResult = await this.admitPatient(
					{
						patient_id: newPatient.patient_id,
						diagnosis: data.diagnosis,
						attending_doctors: data.attending_doctors,
						attending_nurses: data.attending_nurses,
						pricelist_id: data.pricelist_id,
						quick_check: data.quick_check || false // Pass quick_check to admission
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

			if (data.diagnosis) {
				this.updateCurrentDiagnosis(data.patient_id, data.diagnosis);
			}

			// Build dynamic update query (removed quick_check handling)
			Object.entries(data).forEach(([key, value]) => {
				if (key !== "patient_id" && value !== undefined) {
					if (key === "guardian_info" && value) {
						updateFields.push(`${key} = $${paramCount}`);
						values.push(JSON.stringify(value));
						paramCount++;
					} else if (
						key !== "attending_doctors" &&
						key !== "attending_nurses" &&
						key !== "diagnosis" &&
						key !== "quick_check" // Skip quick_check as it's now admission-level
					) {
						updateFields.push(`${key} = $${paramCount}`);
						values.push(value);
						paramCount++;
					}
				}
			});

			if (
				updateFields.length === 0 &&
				!data.attending_doctors &&
				!data.attending_nurses
			) {
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
					const now = new Date();
					const today = now.toISOString().split("T")[0];

					// Remove specific doctors if specified
					if (
						data.attending_doctors.remove &&
						data.attending_doctors.remove.length > 0
					) {
						for (const doctorId of data.attending_doctors.remove) {
							const result = await query(
								`UPDATE PatientDoctor 
                				 SET unassigned_at = $1
                				 WHERE patient_id = $2 AND doctor_id = $3 AND unassigned_at IS NULL
                				 RETURNING assigned_at`,
								[now, data.patient_id, doctorId]
							);

							if (result.rows.length > 0) {
								const assigned_at = result.rows[0].assigned_at;
								await query(
									`INSERT INTO DoctorPatientHistory (patient_history_id, doctor_id)
                   					VALUES ($1, $2) ON CONFLICT DO NOTHING`,
									[
										currentAdmission.patient_history_id,
										doctorId
									]
								);

								let hours = 24.0;
								const assignedDate = new Date(assigned_at)
									.toISOString()
									.split("T")[0];
								if (assignedDate === today) {
									hours =
										(now.getTime() -
											new Date(assigned_at).getTime()) /
										3600000;
								}

								await query(
									`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
                   					VALUES ($1, $2, $3, $4)
                   					ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
                   					   hours_worked = EXCLUDED.hours_worked`,
									[doctorId, data.patient_id, today, hours]
								);
							}
						}
					}

					// Add doctors if specified
					if (
						data.attending_doctors.add &&
						data.attending_doctors.add.length > 0
					) {
						for (const doctorId of data.attending_doctors.add) {
							const doctorCheck = await query(
								"SELECT doctor_id FROM Doctor WHERE doctor_id = $1 AND is_active = true",
								[doctorId]
							);
							if (doctorCheck.rows.length === 0) {
								throw new Error(
									`Doctor with ID ${doctorId} not found`
								);
							}

							await query(
								`INSERT INTO PatientDoctor (patient_id, doctor_id, assigned_at) 
                    			VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (patient_id, doctor_id) DO UPDATE SET
								   unassigned_at = NULL`,
								[data.patient_id, doctorId]
							);

							await query(
								`INSERT INTO DoctorPatientHistory (patient_history_id, doctor_id)
				 				VALUES ($1, $2) ON CONFLICT DO NOTHING`,
								[currentAdmission.patient_history_id, doctorId]
							);

							await query(
								`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
                 				VALUES ($1, $2, $3, 1.0)
                 				ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
                 				   hours_worked = GREATEST(DailyStaffAssignment.hours_worked, 1.0)`,
								[doctorId, data.patient_id, today]
							);
						}
					}
				}
			}

			// Handle attending nurses updates if patient is currently admitted
			if (data.attending_nurses) {
				const currentAdmission = await this.getCurrentAdmission(
					data.patient_id
				);
				if (currentAdmission) {
					const now = new Date();
					const today = now.toISOString().split("T")[0];

					// Remove specific nurses if specified
					if (
						data.attending_nurses.remove &&
						data.attending_nurses.remove.length > 0
					) {
						for (const nurseId of data.attending_nurses.remove) {
							const result = await query(
								`UPDATE PatientNurse 
				                SET unassigned_at = $1
				                WHERE patient_id = $2 AND nurse_id = $3 AND unassigned_at IS NULL
				                RETURNING assigned_at`,
								[now, data.patient_id, nurseId]
							);

							if (result.rows.length > 0) {
								const assigned_at = result.rows[0].assigned_at;
								await query(
									`INSERT INTO NursePatientHistory (patient_history_id, nurse_id)
                   					VALUES ($1, $2) ON CONFLICT DO NOTHING`,
									[
										currentAdmission.patient_history_id,
										nurseId
									]
								);

								let hours = 24.0;
								const assignedDate = new Date(assigned_at)
									.toISOString()
									.split("T")[0];
								if (assignedDate === today) {
									hours =
										(now.getTime() -
											new Date(assigned_at).getTime()) /
										3600000;
								}

								await query(
									`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
                   					VALUES ($1, $2, $3, $4)
                   					ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
                   					   hours_worked = EXCLUDED.hours_worked`,
									[nurseId, data.patient_id, today, hours]
								);
							}
						}
					}

					// Add nurses if specified
					if (
						data.attending_nurses.add &&
						data.attending_nurses.add.length > 0
					) {
						for (const nurseId of data.attending_nurses.add) {
							// Verify nurse exists and is active
							const nurseCheck = await query(
								"SELECT employee_id FROM Employee WHERE employee_id = $1 AND is_active = true AND employee_type = 'nurse'",
								[nurseId]
							);
							if (nurseCheck.rows.length === 0) {
								throw new Error(
									`Nurse with ID ${nurseId} not found`
								);
							}

							// Add nurse to current admission
							await query(
								`INSERT INTO PatientNurse (patient_id, nurse_id, assigned_at) 
                            	VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (patient_id, nurse_id) DO UPDATE SET
									unassigned_at = NULL`,
								[data.patient_id, nurseId]
							);

							await query(
								`INSERT INTO NursePatientHistory (patient_history_id, nurse_id)
					 			VALUES ($1, $2) ON CONFLICT DO NOTHING`,
								[currentAdmission.patient_history_id, nurseId]
							);

							await query(
								`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
                     			VALUES ($1, $2, $3, 1.0)
                     			ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
                    				hours_worked = GREATEST(DailyStaffAssignment.hours_worked, 1.0)`,
								[nurseId, data.patient_id, today]
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

			// Validate attending nurses if provided
			if (data.attending_nurses && data.attending_nurses.length > 0) {
				for (const nurseId of data.attending_nurses) {
					const nurseCheck = await query(
						"SELECT employee_id FROM Employee WHERE employee_id = $1 AND is_active = true AND employee_type = 'nurse'",
						[nurseId]
					);
					if (nurseCheck.rows.length === 0) {
						throw new Error(`Nurse with ID ${nurseId} not found`);
					}
				}
			}

			// Validate price list if provided
			let pricelistId = data.pricelist_id;
			if (pricelistId) {
				const plCheck = await query(
					"SELECT pricelist_id FROM PriceList WHERE pricelist_id = $1",
					[pricelistId]
				);
				if (plCheck.rows.length === 0) {
					throw new Error("Price list not found");
				}
			} else {
				// Get default price list if not provided
				const defPl = await query(
					"SELECT pricelist_id FROM PriceList WHERE is_default = true LIMIT 1"
				);
				if (defPl.rows.length > 0) {
					pricelistId = defPl.rows[0].pricelist_id;
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

			// Create patient history entry with quick_check from admission data
			const historySql = `
                INSERT INTO PatientHistory (
                    patient_id, bill_id, quick_check, diagnosis, admission_time, pricelist_id
                ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
                RETURNING *;
            `;
			const historyResult = await query(historySql, [
				data.patient_id,
				bill.bill_id,
				data.quick_check || false, // Use quick_check from admission data
				data.diagnosis,
				pricelistId
			]);
			const admission = historyResult.rows[0];

			const today = new Date().toISOString().split("T")[0];
			const now = new Date();

			// Add attending doctors to PatientDoctor
			for (const doctorId of data.attending_doctors) {
				await query(
					"INSERT INTO PatientDoctor (patient_id, doctor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
					[data.patient_id, doctorId]
				);

				await query(
					`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
                 	VALUES ($1, $2, $3, 1.0)
                 	ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
                 	   hours_worked = GREATEST(DailyStaffAssignment.hours_worked, EXCLUDED.hours_worked)`,
					[doctorId, data.patient_id, today]
				);
			}

			// Add attending nurses to PatientNurse if provided
			if (data.attending_nurses && data.attending_nurses.length > 0) {
				for (const nurseId of data.attending_nurses) {
					await query(
						"INSERT INTO PatientNurse (patient_id, nurse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
						[data.patient_id, nurseId]
					);

					const admissionTime = new Date(admission.admission_time);
					// let hoursWorked = 1.0;

					if (admissionTime.toISOString().split("T")[0] < today) {
						// hoursWorked = 24.0;
					} else {
						// hoursWorked = Math.max(
						// 	1.0,
						// 	(now.getTime() - admissionTime.getTime()) / 3600000
						// );
					}

					await query(
						`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
                     	VALUES ($1, $2, $3, 1.0)
                     	ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
                     	   hours_worked = GREATEST(DailyStaffAssignment.hours_worked, EXCLUDED.hours_worked)`,
						[nurseId, data.patient_id, today]
					);
				}
			}

			// Mark patient as active
			await query(
				"UPDATE Patient SET is_active = true WHERE patient_id = $1",
				[data.patient_id]
			);

			// Auto-add services only if NOT a quick check
			if (!data.quick_check) {
				await this.addAutoAdmissionServices(
					data.patient_id,
					bill.bill_id,
					userId
				);
			}

			if (patient.referring_doctor_id) {
				const referringDoctorId = patient.referring_doctor_id;
				const doctorResult = await query(
					`SELECT d.doctor_id, d.referral_bonus, d.payment_calculation, e.extra_payment_type, 
					        e.percentage_scope, e.employee_type
					 FROM Doctor d 
					 JOIN Employee e ON d.doctor_id = e.employee_id
					 WHERE d.doctor_id = $1 AND d.referral_bonus > 0`,
					[referringDoctorId]
				);

				if (doctorResult.rows.length > 0) {
					const doctor = doctorResult.rows[0];
					const paymentAmount = doctor.referral_bonus;

					if (paymentAmount > 0) {
						const payment: CreateEmployeePaymentDTO = {
							employee_id: doctor.doctor_id,
							payment_amount: 0.0,
							payment_type: "referral",
							extra_payment_type:
								doctor.extra_payment_type || "per_patient",
							extra_amount: paymentAmount,
							percentage_scope: doctor.percentage_scope,
							paid_by_user_id: null
						};

						const workDate = new Date(admission.admission_time)
							.toISOString()
							.split("T")[0];

						const associations: PaymentPatientAssociation[] = [
							{
								patient_id: data.patient_id,
								patient_history_id:
									admission.patient_history_id,
								work_date: workDate,
								hours_worked: 0.0,
								payment_amount: paymentAmount,
								payment_type: "referral"
							}
						];

						await EmployeePaymentModel.createPaymentWithPatients(
							payment,
							associations
						);
					}
				}
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

			// Archive doctors
			await query(
				`INSERT INTO DoctorPatientHistory (patient_history_id, doctor_id)
             SELECT $1, doctor_id FROM PatientDoctor WHERE patient_id = $2 ON CONFLICT DO NOTHING`,
				[currentAdmission.patient_history_id, data.patient_id]
			);

			// Archive nurses
			await query(
				`INSERT INTO NursePatientHistory (patient_history_id, nurse_id)
             SELECT $1, nurse_id FROM PatientNurse WHERE patient_id = $2 ON CONFLICT DO NOTHING`,
				[currentAdmission.patient_history_id, data.patient_id]
			);

			// Clear current doctors
			await query(
				`UPDATE PatientDoctor SET unassigned_at = CURRENT_TIMESTAMP WHERE patient_id = $1`,
				[data.patient_id]
			);

			// Clear current nurses
			await query(
				`UPDATE PatientNurse SET unassigned_at = CURRENT_TIMESTAMP WHERE patient_id = $1`,
				[data.patient_id]
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

			// Set remaining drug usage to 0
			await query(
				"UPDATE DrugUsage SET remaining_quantity = 0 WHERE patient_id = $1",
				[data.patient_id]
			);

			// Set remaining medical supply usage to 0
			await query(
				"UPDATE MedicalSupplyUsage SET remaining_quantity = 0 WHERE patient_id = $1",
				[data.patient_id]
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

	async handlePatientDischarge(patientId: number): Promise<void> {
		const now = new Date();

		// End all current assignments
		await query(
			`UPDATE PatientDoctor SET unassigned_at = $1 
        	 WHERE patient_id = $2 AND unassigned_at IS NULL`,
			[now, patientId]
		);

		await query(
			`UPDATE PatientNurse SET unassigned_at = $1 
        	 WHERE patient_id = $2 AND unassigned_at IS NULL`,
			[now, patientId]
		);

		/*
		// Create final daily assignment records
		await query(
			`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
			 SELECT pd.doctor_id, $1, $2, 
					CASE 
						WHEN pd.assigned_at::date = $2 THEN 
							EXTRACT(EPOCH FROM ($3 - pd.assigned_at)) / 3600.0
						ELSE 24.0 
					END
			 FROM PatientDoctor pd
			 WHERE pd.patient_id = $1 AND pd.unassigned_at = $3
			 ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
				hours_worked = EXCLUDED.hours_worked`,
			[patientId, today, now]
		);

		await query(
			`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
			 SELECT pn.nurse_id, $1, $2, 
					CASE 
						WHEN pn.assigned_at::date = $2 THEN 
							EXTRACT(EPOCH FROM ($3 - pn.assigned_at)) / 3600.0
						ELSE 24.0 
					END
			 FROM PatientNurse pn
			 WHERE pn.patient_id = $1 AND pn.unassigned_at = $3
			 ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
				hours_worked = EXCLUDED.hours_worked`,
			[patientId, today, now]
		);*/
	}

	async getCurrentAdmission(
		patientId: number
	): Promise<PatientHistory | null> {
		const sql = `
			SELECT ph.*, 
    	           array_agg(DISTINCT e_doc.name) FILTER (WHERE e_doc.name IS NOT NULL) as attending_doctors,
    	           array_agg(DISTINCT pd.doctor_id) FILTER (WHERE pd.doctor_id IS NOT NULL) as attending_doctor_ids,
				   array_agg(DISTINCT e_nurse.name) FILTER (WHERE e_nurse.name IS NOT NULL) as attending_nurses,
    	           array_agg(DISTINCT pn.nurse_id) FILTER (WHERE pn.nurse_id IS NOT NULL) as attending_nurse_ids
    	    FROM PatientHistory ph
    	    LEFT JOIN PatientDoctor pd ON ph.patient_id = pd.patient_id
    	    LEFT JOIN Employee e_doc ON pd.doctor_id = e_doc.employee_id AND pd.unassigned_at IS NULL
    	    LEFT JOIN Doctor d ON e_doc.employee_id = d.doctor_id
			LEFT JOIN PatientNurse pn ON ph.patient_id = pn.patient_id AND pn.unassigned_at IS NULL
    	    LEFT JOIN Employee e_nurse ON pn.nurse_id = e_nurse.employee_id
    	    WHERE ph.patient_id = $1 AND ph.discharge_time IS NULL
    	    GROUP BY ph.patient_history_id
    	    ORDER BY ph.admission_time DESC
    	    LIMIT 1;
    	`;
		const result = await query(sql, [patientId]);
		return result.rows[0] || null;
	}

	async getCurrentAdmissionsWithStaff(): Promise<
		{
			patient_id: number;
			patient_name: string;
			patient_history_id: number;
			diagnosis: string | null;
			admission_time: Date;
			quick_check: boolean;
			attending_doctor_ids: number[];
			attending_doctors: string[];
			doctor_types: string[];
			attending_nurse_ids: number[];
			attending_nurses: string[];
		}[]
	> {
		const sql = `
	      SELECT 
	        p.patient_id,
	        p.name as patient_name,
	        ph.patient_history_id,
	        ph.diagnosis,
	        ph.admission_time,
	        ph.quick_check,
	        COALESCE(
	          array_agg(DISTINCT pd.doctor_id) FILTER (WHERE pd.doctor_id IS NOT NULL AND pd.unassigned_at IS NULL), 
	          '{}'
	        ) as attending_doctor_ids,
	        COALESCE(
	          array_agg(DISTINCT e_doc.name) FILTER (WHERE e_doc.name IS NOT NULL AND pd.unassigned_at IS NULL), 
	          '{}'
	        ) as attending_doctors,
	        COALESCE(
	          array_agg(DISTINCT d.doctor_type) FILTER (WHERE d.doctor_type IS NOT NULL AND pd.unassigned_at IS NULL), 
	          '{}'
	        ) as doctor_types,
	        COALESCE(
	          array_agg(DISTINCT pn.nurse_id) FILTER (WHERE pn.nurse_id IS NOT NULL AND pn.unassigned_at IS NULL), 
	          '{}'
	        ) as attending_nurse_ids,
	        COALESCE(
	          array_agg(DISTINCT e_nurse.name) FILTER (WHERE e_nurse.name IS NOT NULL AND pn.unassigned_at IS NULL), 
	          '{}'
	        ) as attending_nurses
	      FROM Patient p
	      JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	      LEFT JOIN PatientDoctor pd ON p.patient_id = pd.patient_id
	      LEFT JOIN Employee e_doc ON pd.doctor_id = e_doc.employee_id
	      LEFT JOIN Doctor d ON pd.doctor_id = d.doctor_id
	      LEFT JOIN PatientNurse pn ON p.patient_id = pn.patient_id
	      LEFT JOIN Employee e_nurse ON pn.nurse_id = e_nurse.employee_id
	      WHERE p.is_active = true
	        AND ph.discharge_time IS NULL
	      GROUP BY p.patient_id, p.name, ph.patient_history_id, ph.diagnosis, ph.admission_time, ph.quick_check
	      ORDER BY ph.admission_time DESC
	    `;

		const { rows } = await query(sql);
		return rows;
	}

	async getPatientHistory(patientId: number): Promise<PatientHistory[]> {
		const sql = `
    	    SELECT ph.*,
    	           CASE WHEN ph.discharge_time IS NULL 
    	                THEN (SELECT array_agg(DISTINCT e.name) 
    	                      FROM PatientDoctor pd 
    	                      LEFT JOIN Employee e ON pd.doctor_id = e.employee_id 
    	                      WHERE pd.patient_id = ph.patient_id)
    	                ELSE array_agg(DISTINCT e_doc.name) FILTER (WHERE e_doc.name IS NOT NULL)
    	           END as attending_doctors,
    	           CASE WHEN ph.discharge_time IS NULL 
    	                THEN (SELECT array_agg(DISTINCT pd.doctor_id) 
    	                      FROM PatientDoctor pd 
    	                      WHERE pd.patient_id = ph.patient_id)
    	                ELSE array_agg(DISTINCT dph.doctor_id) FILTER (WHERE dph.doctor_id IS NOT NULL)
    	           END as attending_doctor_ids,
				   CASE WHEN ph.discharge_time IS NULL 
    	                THEN (SELECT array_agg(DISTINCT e.name) 
    	                      FROM PatientNurse pn 
    	                      LEFT JOIN Employee e ON pn.nurse_id = e.employee_id 
    	                      WHERE pn.patient_id = ph.patient_id)
    	                ELSE array_agg(DISTINCT e_nurse.name) FILTER (WHERE e_nurse.name IS NOT NULL)
    	           END as attending_nurses,
    	           CASE WHEN ph.discharge_time IS NULL 
    	                THEN (SELECT array_agg(DISTINCT pn.nurse_id) 
    	                      FROM PatientNurse pn 
    	                      WHERE pn.patient_id = ph.patient_id)
    	                ELSE array_agg(DISTINCT nph.nurse_id) FILTER (WHERE nph.nurse_id IS NOT NULL)
    	           END as attending_nurse_ids,
    	           b.total_amount, b.paid_amount
    	    FROM PatientHistory ph
    	    LEFT JOIN DoctorPatientHistory dph ON ph.patient_history_id = dph.patient_history_id
    	    LEFT JOIN Employee e_doc ON dph.doctor_id = e_doc.employee_id
			LEFT JOIN NursePatientHistory nph ON ph.patient_history_id = nph.patient_history_id
    	    LEFT JOIN Employee e_nurse ON nph.nurse_id = e_nurse.employee_id
    	    LEFT JOIN Bill b ON ph.bill_id = b.bill_id
    	    WHERE ph.patient_id = $1
    	    GROUP BY ph.patient_history_id, b.bill_id
    	    ORDER BY ph.admission_time DESC;
    	`;
		const result = await query(sql, [patientId]);
		return result.rows;
	}

	async getPastAdmissions(patientId: number): Promise<any[]> {
		const sql = `
    	    SELECT 
    	        ph.patient_history_id,
				ph.quick_check,
    	        ph.diagnosis,
    	        ph.admission_time,
    	        ph.discharge_time,
    	        ph.leave_reason,
    	        b.total_amount,
    	        b.paid_amount,
				b.medical_tests_amount,
    	        array_agg(DISTINCT e_doc.name) FILTER (WHERE e_doc.name IS NOT NULL) as assigned_doctors,
    	        array_agg(DISTINCT e_nurse.name) FILTER (WHERE e_nurse.name IS NOT NULL) as assigned_nurses,
    	        (
    	            SELECT COUNT(*) 
    	            FROM BillDetail bd 
    	            WHERE bd.bill_id = b.bill_id AND bd.service_id IS NOT NULL
    	        ) as total_services_count,
    	        (
    	            SELECT COUNT(*) 
    	            FROM BillDetail bd 
    	            WHERE bd.bill_id = b.bill_id AND bd.drug_shipment_id IS NOT NULL
    	        ) as total_drugs_count
    	    FROM PatientHistory ph
    	    LEFT JOIN Bill b ON ph.bill_id = b.bill_id
    	    LEFT JOIN DoctorPatientHistory dph ON ph.patient_history_id = dph.patient_history_id
    	    LEFT JOIN Employee e_doc ON dph.doctor_id = e_doc.employee_id
    	    LEFT JOIN NursePatientHistory nph ON ph.patient_history_id = nph.patient_history_id
    	    LEFT JOIN Employee e_nurse ON nph.nurse_id = e_nurse.employee_id
    	    WHERE ph.patient_id = $1 AND ph.discharge_time IS NOT NULL
    	    GROUP BY ph.patient_history_id, ph.diagnosis, ph.admission_time, 
    	             ph.discharge_time, ph.leave_reason, b.total_amount, b.paid_amount, b.medical_tests_amount, b.bill_id, ph.quick_check
    	    ORDER BY ph.discharge_time DESC;
    	`;
		const result = await query(sql, [patientId]);
		return result.rows;
	}

	async getAdmissionDetails(
		patientId: number,
		patientHistoryId: number
	): Promise<any> {
		const sql = `
    	    WITH doctors_agg AS (
    	        SELECT 
    	            dph.patient_history_id,
    	            json_agg(
    	                json_build_object(
    	                    'doctor_id', dph.doctor_id,
    	                    'doctor_name', e_doc.name,
    	                    'doctor_type', d.doctor_type
    	                ) ORDER BY e_doc.name
    	            ) as assigned_doctors
    	        FROM DoctorPatientHistory dph
    	        LEFT JOIN Employee e_doc ON dph.doctor_id = e_doc.employee_id
    	        LEFT JOIN Doctor d ON dph.doctor_id = d.doctor_id
    	        WHERE dph.patient_history_id = $2
    	        GROUP BY dph.patient_history_id
    	    ),
    	    nurses_agg AS (
    	        SELECT 
    	            nph.patient_history_id,
    	            json_agg(
    	                json_build_object(
    	                    'nurse_id', nph.nurse_id,
    	                    'nurse_name', e_nurse.name,
    	                    'employee_type', e_nurse.employee_type
    	                ) ORDER BY e_nurse.name
    	            ) as assigned_nurses
    	        FROM NursePatientHistory nph
    	        LEFT JOIN Employee e_nurse ON nph.nurse_id = e_nurse.employee_id
    	        WHERE nph.patient_history_id = $2
    	        GROUP BY nph.patient_history_id
    	    )
    	    SELECT 
    	        ph.*,
    	        b.total_amount,
    	        b.paid_amount,
    	        b.discount_type,
    	        b.discount,
    	        b.administrative_expenses,
            b.medical_tests_amount,
            b.vat_percentage,
    	        b.vat_scope,
				b.vat_scope_custom,
				b.discount_scope,
    	        COALESCE(da.assigned_doctors, '[]'::json) as assigned_doctors,
    	        COALESCE(na.assigned_nurses, '[]'::json) as assigned_nurses
    	    FROM PatientHistory ph
    	    LEFT JOIN Bill b ON ph.bill_id = b.bill_id
    	    LEFT JOIN doctors_agg da ON ph.patient_history_id = da.patient_history_id
    	    LEFT JOIN nurses_agg na ON ph.patient_history_id = na.patient_history_id
    	    WHERE ph.patient_id = $1 AND ph.patient_history_id = $2;
    	`;

		const result = await query(sql, [patientId, patientHistoryId]);
		if (result.rows.length === 0) {
			return null;
		}

		const admission = result.rows[0];

		// Get detailed services for this admission
		const servicesSql = `
        SELECT 
            bd.bill_detail_id,
            bd.quantity,
            bd.unit_price,
            bd.charge_type,
            bd.generated_at,
            s.service_id,
            s.name as service_name,
            s.service_type,
            (bd.quantity * bd.unit_price) as total_cost
        FROM BillDetail bd
        JOIN Service s ON bd.service_id = s.service_id
        WHERE bd.bill_id = $1 AND bd.service_id IS NOT NULL
        ORDER BY bd.generated_at DESC;
    `;

		const servicesResult = await query(servicesSql, [admission.bill_id]);
		admission.services = servicesResult.rows;

		// Get detailed drugs for this admission
		const drugsSql = `
        SELECT 
            bd.bill_detail_id,
            bd.quantity,
            bd.unit_price,
            bd.charge_type,
            bd.generated_at,
            dc.drug_id,
            dc.name as drug_name,
            dc.manufacturer,
            dc.unit_conversion,
            ds.expiry_date,
            ds.shipment_id as drug_shipment_id,
            (bd.quantity * bd.unit_price) as total_cost
        FROM BillDetail bd
        JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
        JOIN DrugCard dc ON ds.drug_id = dc.drug_id
        WHERE bd.bill_id = $1 AND bd.drug_shipment_id IS NOT NULL
        ORDER BY bd.generated_at DESC;
    `;

		const drugsResult = await query(drugsSql, [admission.bill_id]);
		admission.drugs = drugsResult.rows;

		// Get detailed medical supplies for this admission
		const suppliesSql = `
        SELECT 
            bd.bill_detail_id,
            bd.quantity,
            bd.unit_price,
            bd.charge_type,
            bd.generated_at,
            ms.supply_id,
            ms.name as medical_supply_name,
            ms.manufacturer,
            mss.shipment_id as medical_supply_shipment_id,
            (bd.quantity * bd.unit_price) as total_cost
        FROM BillDetail bd
        JOIN MedicalSupplyShipment mss ON bd.medical_supply_shipment_id = mss.shipment_id
        JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
        WHERE bd.bill_id = $1 AND bd.medical_supply_shipment_id IS NOT NULL
        ORDER BY bd.generated_at DESC;
    `;

		const suppliesResult = await query(suppliesSql, [admission.bill_id]);
		admission.supplies = suppliesResult.rows;

		// Calculate summary totals
		admission.services_total = admission.services.reduce(
			(sum: number, service: any) =>
				sum + parseFloat(service.total_cost || 0),
			0
		);
		admission.drugs_total = admission.drugs.reduce(
			(sum: number, drug: any) => sum + parseFloat(drug.total_cost || 0),
			0
		);
		admission.supplies_total = admission.supplies.reduce(
			(sum: number, supply: any) => sum + parseFloat(supply.total_cost || 0),
			0
		);

		return admission;
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

			let is_active = true;
			if ((serviceCheck.rows[0] as Service).service_type === "once") {
				is_active = false;
			}

			if (!currentAdmission.pricelist_id) {
				throw new Error(
					"No pricelist selected for the current admission"
				);
			}

			// Add service to active patient services
			const activeServiceSql = `
                INSERT INTO ActivePatientService (
                    patient_id, service_id, start_date, is_active, last_renewed
                ) VALUES ($1, $2, $3, $4, NULL)
                RETURNING *;
            `;
			const activeServiceResult = await query(activeServiceSql, [
				patientId,
				serviceId,
				startDate,
				is_active
			]);

			let priceSql = `
					SELECT price FROM ServicePrice
					WHERE service_id = $1 AND pricelist_id = $2
				`;

			const priceResult = await query(priceSql, [
				serviceId,
				currentAdmission.pricelist_id
			]);
			const price = priceResult.rows[0]?.price || 0;

			// Add service to bill
			const billDetailSql = `
				INSERT INTO BillDetail (
					bill_id, active_service_id, service_id, quantity, unit_price, 
					charge_type, sale_type, generated_at
				) VALUES ($1, $2, $3, 1, $4, 'service', 'admitted', CURRENT_TIMESTAMP)
				RETURNING *;
			`;
			const billDetailResult = await query(billDetailSql, [
				currentAdmission.bill_id,
				activeServiceResult.rows[0].active_service_id,
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

			// Create Doctor Service Payment
			const doctors = await query(`
                SELECT d.doctor_id, d.doctor_type, e.extra_payment_type, e.percentage_scope, dsp.price
                FROM PatientDoctor pd
                JOIN Doctor d ON pd.doctor_id = d.doctor_id
                JOIN Employee e ON d.doctor_id = e.employee_id
                JOIN DoctorServicePrice dsp ON d.doctor_id = dsp.doctor_id AND dsp.service_id = $1
                WHERE pd.patient_id = $2 AND pd.unassigned_at IS NULL
            `, [serviceId, patientId]);

			for (const doctor of doctors.rows) {
				if (Number(doctor.price) > 0) {

					const payment: CreateEmployeePaymentDTO = {
						employee_id: doctor.doctor_id,
						payment_amount: 0.0,
						payment_type: "service",
						extra_payment_type: doctor.extra_payment_type || "per_patient",
						extra_amount: doctor.price,
						percentage_scope: doctor.percentage_scope,
						paid_by_user_id: null
					};

					const workDate = new Date().toISOString().split("T")[0];

					const associations: PaymentPatientAssociation[] = [
						{
							patient_id: patientId,
							patient_history_id: currentAdmission.patient_history_id,
							work_date: workDate,
							hours_worked: 0.0,
							payment_amount: doctor.price,
							payment_type: "service",
							active_service_id: activeServiceResult.rows[0].active_service_id
						}
					];

					await EmployeePaymentModel.createPaymentWithPatients(
						payment,
						associations
					);
				}
			}

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

	// Updated method: Stop service (deactivate but keep billing)
	async stopServiceForPatient(
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

	// New method: Completely remove service and its billing
	async removeServiceFromPatient(
		patientId: number,
		activeServiceId: number
	): Promise<any> {
		await query("BEGIN");
		try {
			// Validate patient exists and is admitted
			const currentAdmission = await this.getCurrentAdmission(patientId);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			// Find active service
			const activeServiceSql = `
                SELECT * FROM ActivePatientService 
                WHERE patient_id = $1 AND active_service_id = $2;
            `;
			const serviceResult = await query(activeServiceSql, [
				patientId,
				activeServiceId
			]);

			if (serviceResult.rows.length === 0) {
				throw new Error("Patient service not found");
			}

			// Remove service charges from bill
			await query(
				`DELETE FROM BillDetail 
				 WHERE bill_id = $1 AND active_service_id = $2`,
				[currentAdmission.bill_id, activeServiceId]
			);

			// Remove service payments
			await EmployeePaymentModel.removeServicePayments(activeServiceId);

			// Remove service from ActivePatientService
			await query(
				`DELETE FROM ActivePatientService 
                 WHERE active_service_id = $1`,
				[serviceResult.rows[0].active_service_id]
			);

			// Update bill total
			await this.updateBillTotal(currentAdmission.bill_id!);

			await query("COMMIT");
			return serviceResult.rows[0];
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	// TODO: Implement proper service drug linking for accurate removal
	/**	private async removeServiceDrugsFromPatient(
		patientId: number,
		serviceId: number,
		billId: number
	): Promise<void> {
		// Get drugs associated with this service
		const serviceDrugsSql = `
			SELECT sd.drug_id
			FROM ServiceDrug sd
			WHERE sd.service_id = $1;
		`;
		const serviceDrugsResult = await query(serviceDrugsSql, [serviceId]);

		for (const drugInfo of serviceDrugsResult.rows) {
			// Remove drug usages for this service
			const drugUsagesSql = `
				SELECT du.*, dt.shipment_id, dt.transaction_id, dt.quantity
				FROM DrugUsage du
				JOIN DrugTransaction dt ON du.transaction_id = dt.transaction_id
				JOIN BillDetail bd ON dt.shipment_id = bd.drug_shipment_id
				WHERE du.patient_id = $1 AND du.drug_id = $2 AND bd.bill_id = $3
				AND bd.charge_type = 'service'
				ORDER BY dt.timestamp DESC
				LIMIT 1;
			`;
			const drugUsagesResult = await query(drugUsagesSql, [
				patientId,
				drugInfo.drug_id,
				billId
			]);
			const usage = drugUsagesResult.rows[0];

			if (!usage) {
				continue;
			}

			// Return quantity to shipment
			await query(
				`UPDATE DrugShipment 
					 SET quantity = quantity + $1 
					 WHERE shipment_id = $2`,
				[usage.quantity, usage.shipment_id]
			);

			// Remove drug usage
			await query(
				`DELETE FROM DrugUsage 
					 WHERE usage_id = $1`,
				[usage.usage_id]
			);

			// Remove drug transaction
			await query(
				`DELETE FROM DrugTransaction 
					 WHERE transaction_id = $1`,
				[usage.transaction_id]
			);

			// Remove from bill details
			await query(
				`DELETE FROM BillDetail
				 WHERE bill_detail_id = (
					  SELECT bill_detail_id
					FROM BillDetail
					WHERE bill_id = $1 AND drug_shipment_id = $2
					AND charge_type = 'service'
					AND quantity = $3
					LIMIT 1
				)`,
				[billId, usage.shipment_id, usage.quantity]
			);
		}
	}
	*/

	async removeDrugFromPatient(
		patientId: number,
		drugUsageId: number
	): Promise<any> {
		await query("BEGIN");
		try {
			// Validate patient exists and is admitted
			const currentAdmission = await this.getCurrentAdmission(patientId);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			// Get drug usage details
			const drugUsageSql = `
				SELECT du.*, dt.shipment_id, dt.transaction_id, dt.quantity as transaction_quantity
				FROM DrugUsage du
				JOIN DrugTransaction dt ON du.transaction_id = dt.transaction_id
				WHERE du.usage_id = $1 AND du.patient_id = $2;
			`;
			const drugUsageResult = await query(drugUsageSql, [
				drugUsageId,
				patientId
			]);

			if (drugUsageResult.rows.length === 0) {
				throw new Error("Drug usage not found");
			}

			const usage = drugUsageResult.rows[0];
			console.log(usage);

			// Return the original transaction quantity to shipment
			await query(
				`UPDATE DrugShipment 
				 SET quantity = quantity + $1 
				 WHERE shipment_id = $2`,
				[usage.transaction_quantity, usage.shipment_id]
			);

			// Remove drug usage
			await query(
				`DELETE FROM DrugUsage 
				 WHERE usage_id = $1`,
				[drugUsageId]
			);

			// Remove drug transaction
			await query(
				`DELETE FROM DrugTransaction 
				 WHERE transaction_id = $1`,
				[usage.transaction_id]
			);

			// Remove from bill details
			await query(
				`DELETE FROM BillDetail
				 WHERE bill_detail_id = (
				 	SELECT bill_detail_id
					FROM BillDetail
					WHERE bill_id = $1 AND drug_shipment_id = $2
					AND quantity = $3
					LIMIT 1
				 )`,
				[
					currentAdmission.bill_id,
					usage.shipment_id,
					usage.transaction_quantity
				]
			);

			// Update bill total
			await this.updateBillTotal(currentAdmission.bill_id!);

			await query("COMMIT");
			return usage;
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
		const currentAdmission = await this.getCurrentAdmission(patientId);
		if (!currentAdmission) {
			throw new Error("Patient is not currently admitted");
		}

		const pricelistId = currentAdmission.pricelist_id;
		if (!pricelistId) {
			return;
		}
		// Get services that should be auto-added on admission
		const autoServicesSql = `
            SELECT s.*, sp.price
            FROM Service s
            JOIN ServicePrice sp ON s.service_id = sp.service_id
            JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
            WHERE s.auto_add_on_admission = true AND pl.pricelist_id = $1;
        `;
		const autoServicesResult = await query(autoServicesSql, [pricelistId]);

		if (autoServicesResult.rows.length === 0) {
			return; // No services to auto-add
		}

		for (const service of autoServicesResult.rows) {
			// Add to active patient services
			const isOnce = service.service_type === "once";
			const insertedServiceResult = await query(
				`INSERT INTO ActivePatientService (patient_id, service_id, start_date,${isOnce ? " end_date," : ""
				} is_active, last_renewed) 
                 	 VALUES ($1, $2, CURRENT_TIMESTAMP,${isOnce ? " CURRENT_TIMESTAMP," : ""
				} ${isOnce ? "false," : "true,"} NULL) RETURNING *`,
				[patientId, service.service_id]
			);

			const insertedService = insertedServiceResult.rows[0];

			// Add to bill details
			await query(
				`INSERT INTO BillDetail (
                    bill_id, active_service_id, service_id, quantity, unit_price, 
                    charge_type, sale_type, generated_at
                ) VALUES ($1, $2, $3, 1, $4, 'auto_service', 'admitted', CURRENT_TIMESTAMP)`,
				[
					billId,
					insertedService.active_service_id,
					service.service_id,
					service.price
				]
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
		const currentAdmission = await this.getCurrentAdmission(patientId);
		if (!currentAdmission) {
			throw new Error("Patient is not currently admitted");
		}

		let pricelistId = currentAdmission.pricelist_id;
		if (!pricelistId) {
			return;
		}

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
                WHERE pl.pricelist_id = $1
                ORDER BY ds.expiry_date ASC
                LIMIT 1
            ) sp ON dc.drug_id = sp.drug_id
            WHERE sd.service_id = $2;
        `;
		const serviceDrugsResult = await query(serviceDrugsSql, [
			pricelistId,
			serviceId
		]);

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
		const currentAdmission = await this.getCurrentAdmission(patientId);
		if (!currentAdmission) {
			throw new Error("Patient is not currently admitted");
		}

		let pricelistId = currentAdmission.pricelist_id;
		if (!pricelistId) {
			return;
		}

		// Get available shipments (FIFO - First to expire, first out)
		const availableShipmentsSql = `
            SELECT ds.*, sp.price
            FROM DrugShipment ds
            JOIN ShipmentPrice sp ON ds.shipment_id = sp.shipment_id
            JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
            WHERE ds.drug_id = $1 AND ds.quantity > 0 AND pl.pricelist_id = $2
            ORDER BY ds.expiry_date ASC;
        `;
		const shipmentsResult = await query(availableShipmentsSql, [
			drugId,
			pricelistId
		]);

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

			const currentAdmission = await this.getCurrentAdmission(patientId);

			if (!currentAdmission) {
				throw new Error(
					`No current admission found for patient ID: ${patientId}`
				);
			}

			// Create drug usage record
			await query(
				`INSERT INTO DrugUsage (
                    patient_id, drug_id, transaction_id, patient_history_id, remaining_quantity
                ) VALUES ($1, $2, $3, $4, $5)`,
				[
					patientId,
					drugId,
					transactionResult.rows[0].transaction_id,
					currentAdmission.patient_history_id,
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
		await BillModel.recalculateTotal(billId);
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

	async getPatientServices(patient_id: number): Promise<any[]> {
		const sql = `
            SELECT aps.*, s.name, s.service_type
            FROM ActivePatientService aps
            JOIN Service s ON aps.service_id = s.service_id
            WHERE aps.patient_id = $1
            ORDER BY aps.start_date DESC;
        `;
		const { rows } = await query(sql, [patient_id]);
		return rows;
	}

	async getPatientDrugs(patient_id: number): Promise<any[]> {
		try {
			let currentAdmission = await this.getCurrentAdmission(patient_id);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}
			const sql = `
				SELECT du.*, dc.name as drug_name, dc.unit_conversion, dt.quantity as initial_quantity, dt.timestamp as start_date
				FROM DrugUsage du
				JOIN DrugCard dc ON du.drug_id = dc.drug_id
				JOIN DrugTransaction dt ON du.transaction_id = dt.transaction_id
				WHERE du.patient_id = $1
				AND du.patient_history_id = $2
				ORDER BY du.last_administered DESC NULLS LAST;
			`;
			const { rows } = await query(sql, [
				patient_id,
				currentAdmission.patient_history_id
			]);
			return rows;
		} catch (error) {
			throw error;
		}
	}

	async addDrugToPatientBill(
		patientId: number,
		shipmentId: number,
		quantity: number,
		price: number
	): Promise<any> {
		await query("BEGIN");
		try {
			// Validate patient and admission
			const currentAdmission = await this.getCurrentAdmission(patientId);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			// Add to bill detail
			const billDetailSql = `
        	    INSERT INTO BillDetail (bill_id, drug_shipment_id, quantity, unit_price, charge_type, sale_type, generated_at)
        	    VALUES ($1, $2, $3, $4, 'drug', 'admitted', CURRENT_TIMESTAMP)
        	`;
			await query(billDetailSql, [
				currentAdmission.bill_id,
				shipmentId,
				quantity,
				price
			]);

			// Update bill total
			await this.updateBillTotal(currentAdmission.bill_id!);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	/**
	 * Add medical supply to an active patient's bill
	 */
	async addMedicalSupplyToPatient(
		patientId: number,
		supplyId: number,
		shipmentId: number,
		quantity: number,
		price: number,
		userId: number
	): Promise<any> {
		await query("BEGIN");
		try {
			// Verify patient is active and admitted
			const currentAdmission = await this.getCurrentAdmission(patientId);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			if (!currentAdmission.bill_id) {
				throw new Error("No active bill found for patient");
			}

			// Verify supply exists
			const supplyResult = await query(
				"SELECT supply_id FROM MedicalSupply WHERE supply_id = $1",
				[supplyId]
			);

			if (supplyResult.rows.length === 0) {
				throw new Error("Medical supply not found");
			}

			// Verify shipment exists and belongs to the correct supply
			const shipmentResult = await query(
				`
				SELECT shipment_id, quantity, supply_id 
				FROM MedicalSupplyShipment 
				WHERE shipment_id = $1 AND supply_id = $2
			`,
				[shipmentId, supplyId]
			);

			if (shipmentResult.rows.length === 0) {
				throw new Error("Invalid shipment for this medical supply");
			}

			// Check if sufficient quantity available
			if (quantity > shipmentResult.rows[0].quantity) {
				throw new Error("Insufficient quantity in selected shipment");
			}

			// Update shipment quantity
			await query(
				`
				UPDATE MedicalSupplyShipment
				SET quantity = quantity - $1
				WHERE shipment_id = $2
			`,
				[quantity, shipmentId]
			);

			// Create transaction
			const transactionResult = await query(
				`
				INSERT INTO MedicalSupplyTransaction (
					shipment_id, transaction_type, quantity,
					price, created_by_user_id
				)
				VALUES ($1, 'patient', $2, $3, $4)
				RETURNING transaction_id
			`,
				[shipmentId, quantity, price, userId]
			);

			const transactionId = transactionResult.rows[0].transaction_id;

			// Create usage record
			const usageResult = await query(
				`
				INSERT INTO MedicalSupplyUsage (
					patient_id, supply_id, transaction_id, patient_history_id,
					remaining_quantity, last_administered
				)
				VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
				RETURNING usage_id
			`,
				[
					patientId,
					supplyId,
					transactionId,
					currentAdmission.patient_history_id,
					quantity
				]
			);

			// Add to bill
			const billDetailResult = await query(
				`
				INSERT INTO BillDetail (
					bill_id, medical_supply_shipment_id, quantity,
					unit_price, sale_type
				)
				VALUES ($1, $2, $3, $4, 'admitted')
				RETURNING bill_detail_id
			`,
				[currentAdmission.bill_id, shipmentId, quantity, price]
			);

			// Update bill total
			await query(
				`
				UPDATE Bill
				SET total_amount = total_amount + $1
				WHERE bill_id = $2
			`,
				[quantity * price, currentAdmission.bill_id]
			);

			await query("COMMIT");

			return {
				usage_id: usageResult.rows[0].usage_id,
				bill_detail_id: billDetailResult.rows[0].bill_detail_id,
				transaction_id: transactionId
			};
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	/**
	 * Remove medical supply from patient (reverses the transaction)
	 */
	async removeMedicalSupplyFromPatient(
		patientId: number,
		usageId: number,
		userId: number
	): Promise<void> {
		await query("BEGIN");
		try {
			// Get usage details
			const usageResult = await query(
				`
				SELECT 
					msu.usage_id,
					msu.patient_id,
					msu.supply_id,
					msu.transaction_id,
					msu.patient_history_id,
					msu.remaining_quantity,
					mst.shipment_id,
					mst.quantity as original_quantity,
					mst.price,
					ph.bill_id
				FROM MedicalSupplyUsage msu
				JOIN MedicalSupplyTransaction mst ON msu.transaction_id = mst.transaction_id
				JOIN PatientHistory ph ON msu.patient_history_id = ph.patient_history_id
				WHERE msu.usage_id = $1 AND msu.patient_id = $2
			`,
				[usageId, patientId]
			);

			if (usageResult.rows.length === 0) {
				throw new Error("Medical supply usage not found for this patient");
			}

			const usage = usageResult.rows[0];

			// Verify patient is still admitted
			const currentAdmission = await this.getCurrentAdmission(patientId);
			if (!currentAdmission) {
				throw new Error("Patient is not currently admitted");
			}

			// Return quantity to shipment
			await query(
				`
				UPDATE MedicalSupplyShipment
				SET quantity = quantity + $1
				WHERE shipment_id = $2
			`,
				[usage.original_quantity, usage.shipment_id]
			);

			// Remove from bill
			const billDetailResult = await query(
				`
				DELETE FROM BillDetail
				WHERE bill_id = $1 
				AND medical_supply_shipment_id = (
					SELECT shipment_id FROM MedicalSupplyTransaction WHERE transaction_id = $2
				)
				RETURNING quantity, unit_price
			`,
				[usage.bill_id, usage.transaction_id]
			);

			if (billDetailResult.rows.length > 0) {
				const removedCost =
					billDetailResult.rows[0].quantity * billDetailResult.rows[0].unit_price;

				// Update bill total
				await query(
					`
					UPDATE Bill
					SET total_amount = total_amount - $1
					WHERE bill_id = $2
				`,
					[removedCost, usage.bill_id]
				);
			}

			// Delete usage record
			await query("DELETE FROM MedicalSupplyUsage WHERE usage_id = $1", [
				usageId
			]);

			// Delete transaction
			await query("DELETE FROM MedicalSupplyTransaction WHERE transaction_id = $1", [
				usage.transaction_id
			]);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}
}

export default new PatientModel();
