import { CronJob } from "cron";
import EmployeeModel from "../models/Employee.model.js";
import DoctorModel from "../models/Doctor.model.js";
import EmployeePaymentModel from "../models/EmployeePayment.model.js";
import {
	CreateEmployeePaymentDTO,
	Employee,
	Doctor
} from "../utils/types/employees.js";
import { query } from "../models/database/connection.js";

// Initialize cron jobs for employee payments
export class EmployeePaymentCron {
	static startJobs() {
		// Daily wage payments at midnight
		const dailyWageJob = new CronJob(
			"0 * * * * *",
			async () => {
				console.log("Running daily wage payment job...");
				await this.processDailyWagePayments();
			},
			null,
			true,
			"system"
		);

		// Per-patient payments at 12 PM
		const perPatientJob = new CronJob(
			"0 0 12 * * *",
			async () => {
				console.log("Running per-patient payment job...");
				await this.processPerPatientPayments();
			},
			null,
			true,
			"system"
		);

		dailyWageJob.start();
		perPatientJob.start();
	}

	private static async processDailyWagePayments() {
		try {
			await query("BEGIN");

			const employees = await EmployeeModel.getAllEmployees();
			const doctors = await DoctorModel.getAllDoctors();

			// Process employee daily wages
			for (const employee of employees) {
				let extraAmount = 0;
				if (employee.base_pay && employee.base_pay > 0) {
					if (employee.extra_payment_type != "none") {
						switch (employee.extra_payment_type) {
							case "income": // TODO: Calculate facility income based on facility rules
								extraAmount = 0;
								break;
							case "per patient": // TODO: Calculate per patient payment based on patient interactions
								extraAmount = 0;
								break;
							default:
								extraAmount = 0;

						}
					}
					const payment: CreateEmployeePaymentDTO = {
						employee_id: employee.employee_id,
						payment_amount: employee.base_pay,
						payment_type: "cash",
						extra_payment_type: employee.extra_payment_type,
						extra_amount: extraAmount,
						paid_by_user_id: null // System-generated
					};
					await EmployeePaymentModel.createPayment(payment);
				}
			}

			// Process doctor daily wages
			for (const doctor of doctors) {
				if (
					doctor.daily_pay &&
					doctor.daily_pay > 0 &&
					doctor.is_active
				) {
					const payment: CreateEmployeePaymentDTO = {
						employee_id: doctor.employee_id,
						payment_amount: doctor.daily_pay,
						payment_type: "cash",
						extra_payment_type: "none",
						extra_amount: 0,
						paid_by_user_id: null // System-generated
					};
					await EmployeePaymentModel.createPayment(payment);
				}
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error("Error processing daily wage payments:", error);
		}
	}

	private static async processPerPatientPayments() {
		try {
			await query("BEGIN");

			const employees = await EmployeeModel.getAllEmployees();
			const doctors = await DoctorModel.getAllDoctors();

			// Placeholder for patient interaction data (to be implemented with patient code)
			// For now, assume we have a function to get patient interactions for the day
			const patientInteractions = await this.getPatientInteractions();

			for (const employee of employees) {
				if (
					employee.extra_payment_type === "per patient" &&
					employee.per_patient_payment_type
				) {
					const interactions = patientInteractions.filter(
						(interaction: any) =>
							interaction.employee_id === employee.employee_id
					);

					for (const interaction of interactions) {
						let payment_amount = 0;
						if (
							employee.per_patient_payment_type === "fixed" &&
							employee.base_pay
						) {
							payment_amount = employee.base_pay;
						} else if (
							employee.per_patient_payment_type === "percentage"
						) {
							// Assume interaction has a service_price
							const base_amount = interaction.service_price || 0;
							const deduction =
								employee.percentage_scope === "after_deductions"
									? await this.calculateDeductions(
											base_amount,
											employee
									  )
									: 0;
							payment_amount =
								((base_amount - deduction) *
									(employee.base_pay || 0)) /
								100;
						}

						if (payment_amount > 0) {
							const payment: CreateEmployeePaymentDTO = {
								employee_id: employee.employee_id,
								payment_amount,
								payment_type: "cash",
								extra_payment_type: "per patient",
								extra_amount: payment_amount,
								paid_by_user_id: null // System-generated
							};
							await EmployeePaymentModel.createPayment(payment);
						}
					}
				}
			}

			for (const doctor of doctors) {
				if (
					doctor.payment_calculation === "per patient" ||
					doctor.payment_calculation === "both"
				) {
					const interactions = patientInteractions.filter(
						(interaction: any) =>
							interaction.employee_id === doctor.employee_id
					);

					for (const interaction of interactions) {
						let payment_amount = 0;
						if (
							doctor.per_patient_payment_type === "fixed" &&
							doctor.per_patient_pay
						) {
							payment_amount = doctor.per_patient_pay;
						} else if (
							doctor.per_patient_payment_type === "percentage"
						) {
							// Assume interaction has a service_price
							const base_amount = interaction.service_price || 0;
							const deduction =
								doctor.percentage_scope === "after_deductions"
									? await this.calculateDeductions(
											base_amount,
											doctor
									  )
									: 0;
							payment_amount =
								((base_amount - deduction) *
									(doctor.per_patient_pay || 0)) /
								100;
						}

						if (payment_amount > 0) {
							const payment: CreateEmployeePaymentDTO = {
								employee_id: doctor.employee_id,
								payment_amount,
								payment_type: "cash",
								extra_payment_type: "per patient",
								extra_amount: payment_amount,
								paid_by_user_id: null // System-generated
							};
							await EmployeePaymentModel.createPayment(payment);
						}
					}
				}
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error("Error processing per-patient payments:", error);
		}
	}

	// Placeholder for fetching patient interactions (to be implemented later)
	private static async getPatientInteractions(): Promise<any[]> {
		// TODO: Implement with patient code
		return [];
	}

	// Placeholder for calculating deductions based on percentage_scope
	private static async calculateDeductions(
		_amount: number,
		_employee: Employee | Doctor
	): Promise<number> {
		// TODO: Implement deduction logic based on facility rules
		return 0;
	}
}
