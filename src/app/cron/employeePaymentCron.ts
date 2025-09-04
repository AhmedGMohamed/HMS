import { CronJob } from "cron";
import EmployeeModel from "../models/Employee.model.js";
import EmployeePaymentModel from "../models/EmployeePayment.model.js";
import {
	CreateEmployeePaymentDTO,
	Employee
} from "../utils/types/employees.js";
import { query } from "../models/database/connection.js";

// Initialize cron jobs for employee payments
class EmployeePaymentCron {
	private dailyPaymentJob: CronJob;
	private perPatientDismissalJob: CronJob;

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
	}

	start() {
		console.log("Starting employee payment cron jobs...");
		this.dailyPaymentJob.start();
		this.perPatientDismissalJob.start();
	}

	stop() {
		console.log("Stopping employee payment cron jobs...");
		this.dailyPaymentJob.stop();
		this.perPatientDismissalJob.stop();
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
					extraAmount = await this.calculateFixedPerPatientPayment(
						employee
					);
				}
				// Percentage per patient is handled on dismissal
				break;
		}

		// Create payment record if there's any amount to pay
		const totalPayment = basePayment - totalDeductions + extraAmount;
		if (totalPayment > 0 || totalDeductions > 0) {
			const payment: CreateEmployeePaymentDTO = {
				employee_id: employee.employee_id,
				payment_amount: Math.max(0, totalPayment),
				payment_type: "cash",
				extra_payment_type: extraPaymentType,
				extra_amount: extraAmount,
				percentage_scope: employee.percentage_scope,
				paid_by_user_id: null // System-generated
			};

			await EmployeePaymentModel.createPayment(payment);

			// Log the deductions in clock-in records if applicable
			if (totalDeductions > 0 && employee.need_clock_in) {
				await this.updateAllClockInDeductions(
					employee.employee_id,
					totalDeductions
				);
			}
		}
	}

	private async calculateAllClockInDeductions(
		employee: Employee
	): Promise<number> {
		if (!employee.need_clock_in) {
			return 0;
		}

		// Get all clock-ins from the past 24 hours
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
				totalDeductions += clockIn.pay_deduction;
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

		// Calculate facility income for the past 24 hours
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
	): Promise<number> {
		if (!employee.extra_amount || employee.extra_amount <= 0) {
			return 0;
		}

		// Count patients assigned to this employee during the past 24 hours
		const past24HoursStart = new Date();
		past24HoursStart.setHours(past24HoursStart.getHours() - 24);

		let patientCount = 0;

		if (employee.employee_type === "doctor") {
			// Count patients who were actively assigned during the past 24 hours
			const doctorResult = await query(
				`SELECT COUNT(DISTINCT p.patient_id) as patient_count
				 FROM Patient p
				 JOIN PatientHistory ph ON p.patient_id = ph.patient_id
				 LEFT JOIN PatientDoctor pd ON p.patient_id = pd.patient_id AND pd.doctor_id = $1
				 LEFT JOIN DoctorPatientHistory dph ON ph.patient_history_id = dph.patient_history_id AND dph.doctor_id = $1
				 WHERE p.is_active = true
				 AND (
					-- Currently assigned and was assigned during the period
					(pd.patient_id IS NOT NULL AND ph.discharge_time IS NULL)
					OR
					-- Was assigned to dismissed patients in the past 24 hours
					(dph.patient_history_id IS NOT NULL AND ph.discharge_time >= $2)
					OR
					-- Was assigned to currently admitted patients
					(pd.patient_id IS NOT NULL AND ph.admission_time <= NOW() AND (ph.discharge_time IS NULL OR ph.discharge_time >= $2))
				 )`,
				[employee.employee_id, past24HoursStart.toISOString()]
			);
			patientCount = parseInt(doctorResult.rows[0].patient_count);
		} else if (employee.employee_type === "nurse") {
			const nurseResult = await query(
				`SELECT COUNT(DISTINCT p.patient_id) as patient_count
				 FROM Patient p
				 JOIN PatientHistory ph ON p.patient_id = ph.patient_id
				 LEFT JOIN PatientNurse pn ON p.patient_id = pn.nurse_id AND pn.nurse_id = $1
				 LEFT JOIN NursePatientHistory nph ON ph.patient_history_id = nph.patient_history_id AND nph.nurse_id = $1
				 WHERE p.is_active = true
				 AND (
					-- Currently assigned and was assigned during the period
					(pn.patient_id IS NOT NULL AND ph.discharge_time IS NULL)
					OR
					-- Was assigned to dismissed patients in the past 24 hours
					(nph.patient_history_id IS NOT NULL AND ph.discharge_time >= $2)
					OR
					-- Was assigned to currently admitted patients
					(pn.patient_id IS NOT NULL AND ph.admission_time <= NOW() AND (ph.discharge_time IS NULL OR ph.discharge_time >= $2))
				 )`,
				[employee.employee_id, past24HoursStart.toISOString()]
			);
			patientCount = parseInt(nurseResult.rows[0].patient_count);
		}

		return patientCount * employee.extra_amount;
	}

	private async processPerPatientDismissalPayments() {
		try {
			await query("BEGIN");

			// Find recently dismissed patients (within last hour)
			const past1Hour = new Date();
			past1Hour.setHours(past1Hour.getHours() - 1);

			const dismissedPatientsResult = await query(
				`SELECT DISTINCT ph.patient_history_id, ph.patient_id, ph.bill_id, b.paid_amount
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

	private async processPerPatientDismissalPayment(dismissedPatient: any) {
		const { patient_history_id, patient_id, bill_id, paid_amount } =
			dismissedPatient;

		// Get all employees/doctors assigned to this patient who get percentage per patient pay
		const employeesResult = await query(
			`SELECT DISTINCT e.employee_id, e.extra_amount, e.percentage_scope,
				e.per_patient_payment_type, e.extra_payment_type
			 FROM Employee e
			 LEFT JOIN PatientNurse pn ON e.employee_id = pn.nurse_id
			 LEFT JOIN NursePatientHistory nph ON e.employee_id = nph.nurse_id
			 WHERE e.is_active = true
			 AND e.extra_payment_type = 'per_patient'
			 AND e.per_patient_payment_type = 'percentage'
			 AND (pn.patient_id = $1 OR nph.patient_history_id = $2)
			 
			 UNION
			 
			 SELECT DISTINCT e.employee_id, d.per_patient_pay as extra_amount, 
				d.percentage_scope, 'percentage' as per_patient_payment_type,
				'per_patient' as extra_payment_type
			 FROM Employee e
			 JOIN Doctor d ON e.employee_id = d.doctor_id
			 LEFT JOIN PatientDoctor pd ON d.doctor_id = pd.doctor_id
			 LEFT JOIN DoctorPatientHistory dph ON d.doctor_id = dph.doctor_id
			 WHERE e.is_active = true
			 AND d.is_active = true
			 AND (d.payment_calculation = 'per_patient' OR d.payment_calculation = 'both')
			 AND (pd.patient_id = $1 OR dph.patient_history_id = $2)`,
			[patient_id, patient_history_id]
		);

		for (const employee of employeesResult.rows) {
			// Check if payment already exists for this dismissal
			const past1Hour = new Date();
			past1Hour.setHours(past1Hour.getHours() - 1);

			const existingPaymentResult = await query(
				`SELECT payment_id FROM EmployeePayment 
				 WHERE employee_id = $1 
				 AND extra_payment_type = 'per_patient'
				 AND issued_timestamp >= $2`,
				[employee.employee_id, past1Hour.toISOString()]
			);

			if (existingPaymentResult.rows.length === 0) {
				let paymentAmount = 0;
				const percentageRate = employee.extra_amount || 0;

				let baseAmount = parseFloat(paid_amount);

				// Calculate deductions if percentage_scope is 'after_deductions'
				if (employee.percentage_scope === "after_deductions") {
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

				paymentAmount = (baseAmount * percentageRate) / 100;

				if (paymentAmount > 0) {
					const payment: CreateEmployeePaymentDTO = {
						employee_id: employee.employee_id,
						payment_amount: paymentAmount,
						payment_type: "cash",
						extra_payment_type: "per_patient",
						extra_amount: paymentAmount,
						percentage_scope: employee.percentage_scope,
						paid_by_user_id: null // System-generated
					};

					await EmployeePaymentModel.createPayment(payment);
				}
			}
		}
	}
}

export default new EmployeePaymentCron();
