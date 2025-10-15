import { CronJob } from "cron";
import EmployeeModel from "../models/Employee.model.js";
import EmployeePaymentModel from "../models/EmployeePayment.model.js";
import {
	CreateEmployeePaymentDTO,
	Employee,
	PaymentPatientAssociation
} from "../utils/types/employees.js";
import { query } from "../models/database/connection.js";

// Initialize cron jobs for employee payments
class EmployeePaymentCron {
	private dailyPaymentJob: CronJob;
	private perPatientDismissalJob: CronJob;
	private dailyAssignmentJob: CronJob;

	constructor() {
		// Run daily at 8 AM for daily payments and clock-in deductions
		this.dailyPaymentJob = new CronJob(
			"0 0 8 * * *",
			this.processDailyPayments.bind(this),
			null,
			true,
			"system"
		);

		// Run every hour to catch dismissed patients for per-patient payments
		this.perPatientDismissalJob = new CronJob(
			"0 0 * * * *",
			this.processPerPatientDismissalPayments.bind(this),
			null,
			true,
			"system"
		);

		// Run at 8 AM daily to create daily assignments (start of work day)
		this.dailyAssignmentJob = new CronJob(
			"0 0 8 * * *",
			this.createDailyAssignments.bind(this),
			null,
			true,
			"system"
		);
	}

	start() {
		console.log("Starting employee payment cron jobs...");
		this.dailyPaymentJob.start();
		this.perPatientDismissalJob.start();
		this.dailyAssignmentJob.start();
	}

	stop() {
		console.log("Stopping employee payment cron jobs...");
		this.dailyPaymentJob.stop();
		this.perPatientDismissalJob.stop();
		this.dailyAssignmentJob.stop();
	}

	private async processDailyPayments() {
		try {
			await query("BEGIN");
			console.log(
				"Processing daily employee payments for the past 24 hours..."
			);

			const employees = await EmployeeModel.getAllEmployees();
			const activeEmployees = employees.filter((emp) => emp.is_active);

			for (const employee of activeEmployees) {
				await this.processDailyEmployeePayment(employee);
			}

			// Process supervising doctors' one-time payments for new assignments
			await this.processSupervisingDoctorPayments();

			await query("COMMIT");
			console.log("Daily payments processed successfully");
		} catch (error) {
			await query("ROLLBACK");
			console.error("Error processing daily payments:", error);
			throw error;
		}
	}

	private async processDailyEmployeePayment(employee: Employee) {
		let basePayment = employee.base_pay || 0;
		let extraAmount = 0;
		let totalDeductions = 0;
		let extraPaymentType = employee.extra_payment_type || "none";
		let patientAssociations: PaymentPatientAssociation[] = [];

		// Calculate clock-in/out deductions if required
		if (employee.need_clock_in) {
			totalDeductions = await this.calculateAllClockInDeductions(
				employee
			);
		}

		// Calculate extra payments
		switch (employee.extra_payment_type) {
			case "income":
				extraAmount = await this.calculateFacilityIncomePayment(
					employee
				);
				break;
			case "per_patient":
				if (employee.per_patient_payment_type === "fixed") {
					const result = await this.calculateFixedPerPatientPayment(
						employee
					);
					extraAmount = result.amount;
					patientAssociations = result.associations;
				}
				// Percentage per patient is handled on dismissal
				break;
			case "both":
				// Handle both income and per_patient
				extraAmount += await this.calculateFacilityIncomePayment(
					employee
				);
				if (employee.per_patient_payment_type === "fixed") {
					const result = await this.calculateFixedPerPatientPayment(
						employee
					);
					extraAmount += result.amount;
					patientAssociations = result.associations;
				}
				break;
		}

		// Create payment record if there's any amount to pay
		const totalPayment = basePayment - totalDeductions + extraAmount;
		if (totalPayment > 0 || totalDeductions > 0) {
			const payment: CreateEmployeePaymentDTO = {
				employee_id: employee.employee_id,
				payment_amount: Math.max(0, totalPayment),
				payment_type: "salary",
				extra_payment_type: extraPaymentType,
				extra_amount: extraAmount,
				percentage_scope: employee.percentage_scope,
				paid_by_user_id: null // System-generated
			};

			// Create payment with patient associations
			if (patientAssociations.length > 0) {
				await EmployeePaymentModel.createPaymentWithPatients(
					payment,
					patientAssociations
				);
			} else {
				await EmployeePaymentModel.createPayment(payment);
			}

			// Log the deductions in clock-in records if applicable
			if (totalDeductions > 0 && employee.need_clock_in) {
				await this.updateAllClockInDeductions(
					employee.employee_id,
					totalDeductions
				);
			}
		}
	}

	/**
	 * Process one-time payments for supervising doctors when assigned to patients
	 * This payment is only made once per patient admission, not daily
	 */
	private async processSupervisingDoctorPayments() {
		// Get all supervising doctors with their per_patient_pay configured
		const supervisingDoctorsResult = await query(
			`SELECT d.doctor_id, d.per_patient_pay, e.name
			 FROM Doctor d
			 JOIN Employee e ON d.doctor_id = e.employee_id
			 WHERE d.doctor_type = 'supervising' 
			 AND d.is_active = true
			 AND d.per_patient_pay > 0
			 AND d.payment_calculation IN ('per_patient', 'both')`
		);

		for (const doctor of supervisingDoctorsResult.rows) {
			await this.processSupervisingDoctorPayment(doctor);
		}
	}

	/**
	 * Process payment for a single supervising doctor
	 * Checks for new patient assignments that haven't been paid yet
	 */
	private async processSupervisingDoctorPayment(doctor: any) {
		// Find patient assignments that haven't been paid yet for this supervising doctor
		// We check against the current admission (patient_history_id)
		const unpaidAssignmentsResult = await query(
			`SELECT DISTINCT
				pd.patient_id,
				p.name as patient_name,
				ph.patient_history_id,
				ph.diagnosis,
				ph.admission_time,
				pd.assigned_at
			 FROM PatientDoctor pd
			 JOIN Patient p ON pd.patient_id = p.patient_id
			 JOIN PatientHistory ph ON p.patient_id = ph.patient_id 
			 WHERE pd.doctor_id = $1
			 AND p.is_active = true
			 AND pd.unassigned_at IS NULL
			 AND ph.discharge_time IS NULL
			 AND NOT EXISTS (
				 SELECT 1 FROM EmployeePaymentPatient epp
				 JOIN EmployeePayment ep ON epp.payment_id = ep.payment_id
				 WHERE ep.employee_id = $1
				 AND epp.patient_history_id = ph.patient_history_id
				 AND ep.payment_type = 'supervising_doctor_assignment'
				 AND ep.is_void = false
			 )
			 ORDER BY pd.assigned_at`,
			[doctor.doctor_id]
		);

		const unpaidAssignments = unpaidAssignmentsResult.rows;

		if (unpaidAssignments.length === 0) {
			return; // No new assignments to pay
		}

		// Calculate total payment and create associations
		const paymentPerPatient = parseFloat(doctor.per_patient_pay);
		const totalPayment = unpaidAssignments.length * paymentPerPatient;

		const patientAssociations: PaymentPatientAssociation[] =
			unpaidAssignments.map((assignment) => ({
				patient_id: assignment.patient_id,
				patient_history_id: assignment.patient_history_id,
				work_date: new Date(assignment.assigned_at)
					.toISOString()
					.split("T")[0],
				hours_worked: 0, // Not applicable for supervising doctors' one-time payment
				payment_amount: paymentPerPatient,
				payment_type: "supervising_doctor_fixed"
			}));

		// Create payment record
		const payment: CreateEmployeePaymentDTO = {
			employee_id: doctor.doctor_id,
			payment_amount: totalPayment,
			payment_type: "supervising_doctor_assignment",
			extra_payment_type: "per_patient",
			extra_amount: totalPayment,
			paid_by_user_id: null // System-generated
		};

		await EmployeePaymentModel.createPaymentWithPatients(
			payment,
			patientAssociations
		);

		console.log(
			`Created one-time payment for supervising doctor ${doctor.name}: ${totalPayment} for ${unpaidAssignments.length} patient(s)`
		);
	}

	private async calculateAllClockInDeductions(
		employee: Employee
	): Promise<number> {
		if (!employee.need_clock_in) {
			return 0;
		}

		// Get all clock-ins from the past 24 hours (since last payment run)
		const past24HoursStart = new Date();
		past24HoursStart.setHours(past24HoursStart.getHours() - 24);

		const clockInsResult = await query(
			`SELECT clock_in, clock_out, pay_deduction 
			 FROM EmployeeClockIn 
			 WHERE employee_id = $1 
			 AND clock_in >= $2 
			 ORDER BY clock_in ASC`,
			[employee.employee_id, past24HoursStart.toISOString()]
		);

		if (clockInsResult.rows.length === 0) {
			// No clock-in in the past 24 hours - full base pay deduction
			return employee.base_pay || 0;
		}

		let totalDeductions = 0;

		// Process each clock-in/out cycle
		for (const clockIn of clockInsResult.rows) {
			// Skip if already processed
			if (clockIn.pay_deduction !== null) {
				totalDeductions += parseFloat(clockIn.pay_deduction);
				continue;
			}

			const deduction = await this.calculateSingleClockInDeduction(
				employee,
				clockIn
			);
			totalDeductions += deduction;
		}

		// Cap at base pay
		return Math.min(totalDeductions, employee.base_pay || 0);
	}

	private async calculateSingleClockInDeduction(
		employee: Employee,
		clockInRecord: any
	): Promise<number> {
		if (!employee.shift_start_time || !employee.shift_end_time) {
			return 0;
		}

		const clockInTime = new Date(clockInRecord.clock_in);
		const expectedShiftStart = this.calculateExpectedShiftStart(
			employee,
			clockInTime
		);
		const expectedShiftEnd = this.calculateExpectedShiftEnd(
			employee,
			expectedShiftStart
		);

		let totalDeduction = 0;

		// Calculate late clock-in deductions
		const hoursLate = Math.max(
			0,
			(clockInTime.getTime() - expectedShiftStart.getTime()) /
				(1000 * 60 * 60)
		);

		if (hoursLate >= 6) {
			totalDeduction += employee.base_pay || 0;
		} else if (hoursLate >= 3) {
			totalDeduction += (employee.base_pay || 0) / 2;
		}

		// Calculate early clock-out deductions if clocked out
		if (clockInRecord.clock_out) {
			const clockOutTime = new Date(clockInRecord.clock_out);
			const hoursEarly = Math.max(
				0,
				(expectedShiftEnd.getTime() - clockOutTime.getTime()) /
					(1000 * 60 * 60)
			);

			if (hoursEarly >= 6) {
				totalDeduction += employee.base_pay || 0;
			} else if (hoursEarly >= 3) {
				totalDeduction += (employee.base_pay || 0) / 2;
			}
		} else {
			// If shift should have ended and no clock-out recorded
			const now = new Date();
			if (now > expectedShiftEnd) {
				const expectedShiftDuration =
					(expectedShiftEnd.getTime() -
						expectedShiftStart.getTime()) /
					(1000 * 60 * 60);
				const actualWorkedHours =
					(now.getTime() -
						Math.max(
							clockInTime.getTime(),
							expectedShiftStart.getTime()
						)) /
					(1000 * 60 * 60);
				const shortfallHours = Math.max(
					0,
					expectedShiftDuration - actualWorkedHours
				);

				if (shortfallHours >= 6) {
					totalDeduction += employee.base_pay || 0;
				} else if (shortfallHours >= 3) {
					totalDeduction += (employee.base_pay || 0) / 2;
				}
			}
		}

		return totalDeduction;
	}

	private async updateAllClockInDeductions(
		employeeId: number,
		totalDeductions: number
	) {
		const past24HoursStart = new Date();
		past24HoursStart.setHours(past24HoursStart.getHours() - 24);

		// Get unprocessed clock-ins
		const clockInsResult = await query(
			`SELECT clock_in, clock_out 
			 FROM EmployeeClockIn 
			 WHERE employee_id = $1 
			 AND clock_in >= $2
			 AND pay_deduction IS NULL
			 ORDER BY clock_in ASC`,
			[employeeId, past24HoursStart.toISOString()]
		);

		// Distribute deductions proportionally across clock-in records
		const numRecords = clockInsResult.rows.length;
		if (numRecords > 0) {
			const deductionPerRecord = totalDeductions / numRecords;

			for (const clockIn of clockInsResult.rows) {
				await query(
					`UPDATE EmployeeClockIn 
					 SET pay_deduction = $1 
					 WHERE employee_id = $2 
					 AND clock_in = $3`,
					[deductionPerRecord, employeeId, clockIn.clock_in]
				);
			}
		}
	}

	private calculateExpectedShiftEnd(
		employee: Employee,
		shiftStartTime: Date
	): Date {
		if (!employee.shift_end_time) {
			// Default to 8-hour shift if no end time specified
			const shiftEnd = new Date(shiftStartTime);
			shiftEnd.setHours(shiftEnd.getHours() + 8);
			return shiftEnd;
		}

		const [hours, minutes] = (employee.shift_end_time as string).split(":");
		const expectedEnd = new Date(shiftStartTime);
		expectedEnd.setHours(parseInt(hours), parseInt(minutes), 0, 0);

		// If end time is before start time, it means the shift goes to the next day
		if (expectedEnd.getTime() <= shiftStartTime.getTime()) {
			expectedEnd.setDate(expectedEnd.getDate() + 1);
		}

		return expectedEnd;
	}

	private calculateExpectedShiftStart(
		employee: Employee,
		clockInTime: Date
	): Date {
		if (!employee.shift_start_time) {
			return clockInTime; // Fallback
		}

		const [hours, minutes] = (employee.shift_start_time as string).split(
			":"
		);
		const expectedStart = new Date(clockInTime);

		if (employee.shift_type === "night") {
			// For night shifts, we need to determine if the shift started today or yesterday
			const shiftStartHour = parseInt(hours);
			const clockInHour = clockInTime.getHours();

			// If clocking in before noon and shift starts in evening (>= 18:00)
			// then the shift should have started yesterday
			if (clockInHour < 12 && shiftStartHour >= 18) {
				expectedStart.setDate(expectedStart.getDate() - 1);
			}
			// If clocking in in the afternoon/evening and shift starts in evening
			// then the shift should start today
			else if (clockInHour >= 12 && shiftStartHour >= 18) {
				// Keep the same date
			}
			// If clocking in early morning and shift starts early morning
			// then the shift should start today
			else if (clockInHour < 12 && shiftStartHour < 12) {
				// Keep the same date
			}
			// Edge case: if clocking in late evening and shift starts early morning next day
			else if (clockInHour >= 18 && shiftStartHour < 12) {
				expectedStart.setDate(expectedStart.getDate() + 1);
			}
		} else {
			// For morning/day shifts
			const shiftStartHour = parseInt(hours);
			const clockInHour = clockInTime.getHours();

			// If clocking in after midnight but before 6 AM, and shift starts in morning (6 AM - 12 PM)
			// then the shift should have started yesterday
			if (clockInHour < 6 && shiftStartHour >= 6 && shiftStartHour < 18) {
				expectedStart.setDate(expectedStart.getDate() - 1);
			}
		}

		expectedStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);
		return expectedStart;
	}

	private async calculateFacilityIncomePayment(
		employee: Employee
	): Promise<number> {
		if (!employee.extra_amount || employee.extra_amount <= 0) {
			return 0;
		}

		// Calculate facility income for the past 24 hours (since last payment run at 8 AM)
		const past24HoursStart = new Date();
		past24HoursStart.setHours(past24HoursStart.getHours() - 24);

		const incomeResult = await query(
			`SELECT 
				COALESCE(SUM(b.paid_amount), 0) as patient_payments,
				COALESCE(
					(SELECT SUM(dt.quantity * dt.price) 
					 FROM DrugTransaction dt 
					 WHERE dt.timestamp >= $1 
					 AND dt.transaction_type IN ('patient', 'outside')), 0
				) as pharmacy_sales
			 FROM Bill b 
			 WHERE b.generated_at >= $1`,
			[past24HoursStart.toISOString()]
		);

		const { patient_payments, pharmacy_sales } = incomeResult.rows[0];
		const grossIncome =
			parseFloat(patient_payments) + parseFloat(pharmacy_sales);

		let baseAmount = grossIncome;

		// Calculate deductions if percentage_scope is 'after_deductions'
		if (employee.percentage_scope === "after_deductions") {
			const deductionsResult = await query(
				`SELECT 
					COALESCE(SUM(ep.payment_amount), 0) as employee_costs,
					COALESCE(
						(SELECT SUM(ds.quantity * ds.buy_price) 
						 FROM DrugShipment ds 
						 WHERE ds.received_date >= $1::date), 0
					) as drug_costs,
					COALESCE(SUM(b.administrative_expenses), 0) as admin_expenses
				 FROM Bill b
				 LEFT JOIN EmployeePayment ep ON ep.issued_timestamp >= $1
				 WHERE b.generated_at >= $1`,
				[past24HoursStart.toISOString()]
			);

			const { employee_costs, drug_costs, admin_expenses } =
				deductionsResult.rows[0];
			const totalDeductions =
				parseFloat(employee_costs) +
				parseFloat(drug_costs) +
				parseFloat(admin_expenses);
			baseAmount = Math.max(0, grossIncome - totalDeductions);
		}

		return (baseAmount * employee.extra_amount) / 100;
	}

	private async calculateFixedPerPatientPayment(
		employee: Employee
	): Promise<{ amount: number; associations: PaymentPatientAssociation[] }> {
		if (!employee.extra_amount || employee.extra_amount <= 0) {
			return { amount: 0, associations: [] };
		}

		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = yesterday.toISOString().split("T")[0];

		// Build the shift end time for yesterday to check against patient discharge
		let shiftEndTimeForComparison: string | null = null;
		if (employee.shift_end_time) {
			const [hours, minutes] = (employee.shift_end_time as string).split(
				":"
			);
			let shiftEndDate = new Date(yesterday);
			shiftEndDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

			// If it's a night shift and end time is before start time, add a day
			if (employee.shift_start_time) {
				const [startHours] = (
					employee.shift_start_time as string
				).split(":");
				if (parseInt(hours) < parseInt(startHours)) {
					shiftEndDate.setDate(shiftEndDate.getDate() + 1);
				}
			}

			shiftEndTimeForComparison = shiftEndDate.toISOString();
		}

		// Get specific patient assignments that haven't been paid yet
		const assignmentResult = await query(
			`SELECT dsa.*, p.name as patient_name, ph.patient_history_id, ph.diagnosis, ph.discharge_time
    	 FROM DailyStaffAssignment dsa
    	 JOIN Patient p ON dsa.patient_id = p.patient_id
    	 LEFT JOIN PatientHistory ph ON p.patient_id = ph.patient_id 
    	     AND ph.discharge_time IS NULL 
			 OR (
    	         ph.admission_time <= $1::date + INTERVAL '1 day' 
    	         AND (ph.discharge_time IS NULL OR ph.discharge_time >= $1::date)
    	     )
    	 WHERE dsa.employee_id = $2 
    	 AND dsa.work_date = $1
    	 AND dsa.payment_processed = FALSE
    	 AND dsa.hours_worked > 0
		 -- Only include if nurse has shift_end_time defined and patient discharged after shift end, OR still admitted
    	 AND ($3::timestamp IS NULL OR ph.discharge_time IS NULL OR ph.discharge_time >= $3::timestamp)
    	 ORDER BY dsa.patient_id`,
			[yesterdayStr, employee.employee_id, shiftEndTimeForComparison]
		);

		const assignments = assignmentResult.rows;
		const patientCount = assignments.length;

		if (patientCount === 0) {
			return { amount: 0, associations: [] };
		}

		const totalPayment = patientCount * employee.extra_amount;
		const paymentPerPatient = employee.extra_amount;

		// Create patient associations
		const associations: PaymentPatientAssociation[] = assignments.map(
			(assignment) => ({
				patient_id: assignment.patient_id,
				patient_history_id: assignment.patient_history_id || null,
				work_date: assignment.work_date,
				hours_worked: assignment.hours_worked,
				payment_amount: paymentPerPatient,
				payment_type: "fixed_per_patient"
			})
		);

		// Mark assignments as payment processed
		if (totalPayment > 0) {
			await query(
				`UPDATE DailyStaffAssignment 
    	     SET payment_processed = TRUE 
    	     WHERE employee_id = $1 AND work_date = $2 AND payment_processed = FALSE`,
				[employee.employee_id, yesterdayStr]
			);
		}

		return { amount: totalPayment, associations };
	}

	private async processPerPatientDismissalPayments() {
		try {
			await query("BEGIN");

			// Find recently dismissed patients (within last hour)
			const past1Hour = new Date();
			past1Hour.setHours(past1Hour.getHours() - 1);

			const dismissedPatientsResult = await query(
				`SELECT DISTINCT ph.patient_history_id, ph.patient_id, ph.bill_id, 
				        b.paid_amount, ph.discharge_time
				 FROM PatientHistory ph
				 JOIN Bill b ON ph.bill_id = b.bill_id
				 WHERE ph.discharge_time IS NOT NULL
				 AND ph.discharge_time >= $1
				 AND b.paid_amount > 0`,
				[past1Hour.toISOString()]
			);

			for (const dismissedPatient of dismissedPatientsResult.rows) {
				await this.processPerPatientDismissalPayment(dismissedPatient);
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				"Error processing per-patient dismissal payments:",
				error
			);
		}
	}

	private async processPerPatientDismissalPayment(
		dismissedPatient: any
	): Promise<void> {
		const {
			patient_history_id,
			patient_id,
			bill_id,
			paid_amount,
			discharge_time
		} = dismissedPatient;

		// Get patient info for associations
		const patientInfoResult = await query(
			`SELECT p.patient_id, p.name, ph.patient_history_id, ph.diagnosis,
        	        ph.admission_time, ph.discharge_time
        	 FROM Patient p
        	 JOIN PatientHistory ph ON p.patient_id = ph.patient_id
        	 WHERE ph.patient_history_id = $1`,
			[patient_history_id]
		);

		if (patientInfoResult.rows.length === 0) return;

		// Get all staff assignments for this patient that haven't been paid percentage
		// EXCLUDE nurses whose shift ended before the patient was discharged
		const staffResult = await query(
			`SELECT DISTINCT dsa.employee_id, e.extra_amount, e.percentage_scope,
        	        e.per_patient_payment_type, e.extra_payment_type, e.employee_type,
        	        e.shift_end_time, e.shift_start_time, e.shift_type,
        	        d.per_patient_pay, d.payment_calculation, d.doctor_type, 
        	        dsa.work_date, SUM(dsa.hours_worked) as total_hours_worked
        	 FROM DailyStaffAssignment dsa
        	 JOIN Employee e ON dsa.employee_id = e.employee_id
        	 LEFT JOIN Doctor d ON e.employee_id = d.doctor_id
        	 WHERE dsa.patient_id = $1
        	 AND dsa.payment_processed = FALSE
        	 AND dsa.hours_worked > 0
        	 AND (
        	    (e.extra_payment_type = 'per_patient' AND e.per_patient_payment_type = 'percentage')
        	    OR
        	    (e.extra_payment_type = 'both' AND e.per_patient_payment_type = 'percentage')
        	    OR
        	    (d.doctor_id IS NOT NULL 
        	     AND d.payment_calculation IN ('per_patient', 'both') 
        	     AND d.per_patient_pay > 0
        	     AND d.doctor_type != 'supervising')
        	 )
        	 GROUP BY dsa.employee_id, e.extra_amount, e.percentage_scope,
        	          e.per_patient_payment_type, e.extra_payment_type, e.employee_type,
        	          e.shift_end_time, e.shift_start_time, e.shift_type,
        	          d.per_patient_pay, d.payment_calculation, d.doctor_type, dsa.work_date`,
			[patient_id]
		);

		for (const staff of staffResult.rows) {
			// Check if nurse's shift ended before patient discharge
			if (staff.employee_type === "nurse" && staff.shift_end_time) {
				const dischargeDate = new Date(discharge_time);
				const [hours, minutes] = staff.shift_end_time.split(":");

				// Calculate shift end time for the work date
				const shiftEndTime = new Date(staff.work_date);
				shiftEndTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

				// If it's a night shift and end time is before start time, add a day
				if (staff.shift_start_time) {
					const [startHours] = staff.shift_start_time.split(":");
					if (parseInt(hours) < parseInt(startHours)) {
						shiftEndTime.setDate(shiftEndTime.getDate() + 1);
					}
				}

				// If patient was discharged before nurse's shift end, skip payment
				if (dischargeDate < shiftEndTime) {
					console.log(
						`Skipping payment for nurse ${
							staff.employee_id
						}: Patient discharged at ${dischargeDate.toISOString()} before shift end ${shiftEndTime.toISOString()}`
					);

					// Mark assignment as processed but don't pay
					await query(
						`UPDATE DailyStaffAssignment 
						 SET payment_processed = TRUE 
						 WHERE employee_id = $1 AND patient_id = $2`,
						[staff.employee_id, patient_id]
					);
					continue;
				}
			}

			// Check if already paid for this dismissal
			const existingPayment = await query(
				`SELECT payment_id FROM EmployeePayment 
            	 WHERE employee_id = $1 
            	 AND extra_payment_type IN ('per_patient', 'both')
            	 AND issued_timestamp >= $2::timestamp - INTERVAL '2 hours'`,
				[staff.employee_id, discharge_time]
			);

			if (existingPayment.rows.length === 0) {
				const percentageRate =
					staff.extra_amount || staff.per_patient_pay || 0;

				let baseAmount = parseFloat(paid_amount);

				// Apply work time proportionally if worked less than full admission
				const admissionResult = await query(
					`SELECT 
						EXTRACT(EPOCH FROM (ph.discharge_time - ph.admission_time)) / 3600.0 as total_admission_hours
					 FROM PatientHistory ph
					 WHERE ph.patient_history_id = $1`,
					[patient_history_id]
				);

				const totalAdmissionHours = parseFloat(
					admissionResult.rows[0].total_admission_hours
				);
				const workRatio = Math.min(
					staff.total_hours_worked / totalAdmissionHours,
					1.0
				);
				baseAmount = baseAmount * workRatio;

				// Calculate deductions if percentage_scope is 'after_deductions'
				if (staff.percentage_scope === "after_deductions") {
					const deductionsResult = await query(
						`SELECT 
                    	    COALESCE(b.administrative_expenses, 0) as admin_expenses,
                    	    COALESCE(b.discount, 0) as discount
                    	 FROM Bill b 
                    	 WHERE b.bill_id = $1`,
						[bill_id]
					);

					const { admin_expenses, discount } =
						deductionsResult.rows[0];
					baseAmount = Math.max(
						0,
						baseAmount -
							parseFloat(admin_expenses) -
							parseFloat(discount)
					);
				}

				const paymentAmount = (baseAmount * percentageRate) / 100;

				if (paymentAmount > 0) {
					const payment: CreateEmployeePaymentDTO = {
						employee_id: staff.employee_id,
						payment_amount: paymentAmount,
						payment_type: "commission",
						extra_payment_type:
							staff.extra_payment_type === "both"
								? "both"
								: "per_patient",
						extra_amount: paymentAmount,
						percentage_scope: staff.percentage_scope,
						paid_by_user_id: null
					};

					// Create patient association
					const associations: PaymentPatientAssociation[] = [
						{
							patient_id: patient_id,
							patient_history_id: patient_history_id,
							work_date: staff.work_date,
							hours_worked: staff.total_hours_worked,
							payment_amount: paymentAmount,
							payment_type: "percentage_per_patient"
						}
					];

					await EmployeePaymentModel.createPaymentWithPatients(
						payment,
						associations
					);

					// Mark this staff assignment as payment processed
					await query(
						`UPDATE DailyStaffAssignment 
                    	 SET payment_processed = TRUE 
                    	 WHERE employee_id = $1 AND patient_id = $2`,
						[staff.employee_id, patient_id]
					);
				}
			}
		}
	}

	/**
	 * Creates daily staff assignments at 8 AM (start of work day)
	 * This tracks which staff are assigned to which patients for the day
	 */
	private async createDailyAssignments(): Promise<void> {
		try {
			const today = new Date().toISOString().split("T")[0];
			console.log(
				`Creating daily staff assignments for ${today} at work day start (8 AM)...`
			);

			// Create assignments for all currently active doctor-patient relationships
			await query(
				`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked) 
        	 SELECT pd.doctor_id, pd.patient_id, $1::date, 
        	        CASE 
        	            -- If assigned today before 8 AM, calculate hours from assignment time to now
        	            WHEN pd.assigned_at::date = $1::date AND pd.assigned_at < ($1::date + INTERVAL '8 hours') THEN 
        	                GREATEST(EXTRACT(EPOCH FROM (NOW() - pd.assigned_at)) / 3600.0, 0)
        	            -- If assigned today at or after 8 AM, calculate from assignment time
        	            WHEN pd.assigned_at::date = $1::date AND pd.assigned_at >= ($1::date + INTERVAL '8 hours') THEN
        	                GREATEST(EXTRACT(EPOCH FROM (NOW() - pd.assigned_at)) / 3600.0, 0)
        	            -- If assigned before today, assume full day from 8 AM to now
        	            WHEN pd.assigned_at::date < $1::date THEN
        	                EXTRACT(EPOCH FROM (NOW() - ($1::date + INTERVAL '8 hours'))) / 3600.0
        	            ELSE 0
        	        END
        	 FROM PatientDoctor pd
        	 JOIN Patient p ON pd.patient_id = p.patient_id
        	 WHERE p.is_active = true 
        	 AND pd.unassigned_at IS NULL
        	 AND pd.assigned_at <= NOW()
        	 ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
        	    hours_worked = EXCLUDED.hours_worked`,
				[today]
			);

			// Create assignments for all currently active nurse-patient relationships
			await query(
				`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
        	 SELECT pn.nurse_id, pn.patient_id, $1::date,
        	        CASE 
        	            -- If assigned today before 8 AM, calculate hours from assignment time to now
        	            WHEN pn.assigned_at::date = $1::date AND pn.assigned_at < ($1::date + INTERVAL '8 hours') THEN 
        	                GREATEST(EXTRACT(EPOCH FROM (NOW() - pn.assigned_at)) / 3600.0, 0)
        	            -- If assigned today at or after 8 AM, calculate from assignment time
        	            WHEN pn.assigned_at::date = $1::date AND pn.assigned_at >= ($1::date + INTERVAL '8 hours') THEN
        	                GREATEST(EXTRACT(EPOCH FROM (NOW() - pn.assigned_at)) / 3600.0, 0)
        	            -- If assigned before today, assume full day from 8 AM to now
        	            WHEN pn.assigned_at::date < $1::date THEN
        	                EXTRACT(EPOCH FROM (NOW() - ($1::date + INTERVAL '8 hours'))) / 3600.0
        	            ELSE 0
        	        END
        	 FROM PatientNurse pn
        	 JOIN Patient p ON pn.patient_id = p.patient_id
        	 WHERE p.is_active = true 
        	 AND pn.unassigned_at IS NULL
        	 AND pn.assigned_at <= NOW()
        	 ON CONFLICT (employee_id, patient_id, work_date) DO UPDATE SET
        	    hours_worked = EXCLUDED.hours_worked`,
				[today]
			);

			console.log(
				`Daily staff assignments created successfully for ${today}`
			);
		} catch (error) {
			console.error("Error creating daily assignments:", error);
			throw error;
		}
	}
}

const employeePaymentCronInstance = new EmployeePaymentCron();

export default employeePaymentCronInstance;