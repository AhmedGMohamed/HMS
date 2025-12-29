// src/app/utils/types/reports.d.ts

export type TimeGrouping = "year" | "month" | "day";
export type PaymentTypeFilter = "cash" | "credit" | "insurance" | "all";
export type EmployeeTypeFilter = "doctor" | "nurse" | "other" | "all";

export interface ReportDateRange {
	start_date: string;
	end_date: string;
}

export interface TimeGroupedData {
	period: string;
	year?: number;
	month?: number;
	day?: number;
	count: number;
	total_amount?: number;
}

// Patient Report Types
export interface PatientReportData {
	patient_id: number;
	patient_name: string;
	national_id?: string;
	gender: string;
	phone?: string;
	address?: string;
	payment_type: string;
	insurance_company?: string;
	insurance_form_id?: string;
	referring_doctor_id?: number;
	referring_doctor_name?: string;
	admissions: PatientAdmissionDetail[];
	total_bill_amount: number;
	total_paid_amount: number;
	total_outstanding: number;
}

export interface PatientAdmissionDetail {
	patient_history_id: number;
	admission_time: string;
	discharge_time?: string;
	diagnosis?: string;
	bill_id: number;
	total_amount: number;
	paid_amount: number;
	discount: number;
	medical_tests_amount: number;
	daily_staff: DailyStaffAssignment[];
	services: ServiceUsageDetail[];
	drugs: DrugUsageDetail[];
	supplies: MedicalSupplyUsageDetail[];
}

export interface DailyStaffAssignment {
	work_date: string;
	doctors: StaffMember[];
	nurses: StaffMember[];
}

export interface StaffMember {
	employee_id: number;
	employee_name: string;
	employee_type: string;
	hours_worked: number;
}

export interface ServiceUsageDetail {
	service_id: number;
	service_name: string;
	service_type: string;
	quantity: number;
	unit_price: number;
	total_price: number;
	charge_dates: string[];
}

export interface DrugUsageDetail {
	drug_id: number;
	drug_name: string;
	manufacturer?: string;
	quantity: number;
	unit_price: number;
	total_price: number;
	administration_dates: string[];
}

export interface MedicalSupplyUsageDetail {
	supply_id: number;
	supply_name: string;
	manufacturer?: string;
	quantity: number;
	unit_price: number;
	total_price: number;
	administration_dates: string[];
}

// Doctor Report Types
export interface DoctorPatientReport {
	doctor_id: number;
	doctor_name: string;
	doctor_type: string;
	total_patients: number;
	patients: DoctorPatientDetail[];
}

export interface DoctorPatientDetail {
	patient_id: number;
	patient_name: string;
	national_id?: string;
	gender?: string;
	age: number;
	last_admission_time?: string;
	last_discharge_time?: string;
	payment_type: string;
	insurance_company?: string;
	insurance_card_id?: string;
	insurance_form_id?: string;
	last_diagnosis?: string;
	total_billed: number;
	total_paid: number;
	admission_count: number;
}

// Nurse Report Types
export interface NursePatientReport {
	nurse_id: number;
	nurse_name: string;
	total_patients: number;
	patients: NursePatientDetail[];
	daily_assignments?: NurseDailyAssignment[];
}
export interface NurseDailyAssignment {
	work_date: string;
	patients: NurseAssignmentPatient[];
	total_hours: number;
	patient_count: number;
}

export interface NurseAssignmentPatient {
	patient_id: number;
	patient_name: string;
	hours_worked: number;
	payment_type: string;
	diagnosis?: string;
}

export interface NursePatientDetail {
	patient_id: number;
	patient_name: string;
	last_admission_time?: string;
	last_discharge_time?: string;
	payment_type: string;
	diagnosis?: string;
	total_days_assigned: number;
}

// Statistical Reports
export interface PatientStatistics {
	total_patients: number;
	by_payment_type: {
		cash: number;
		credit: number;
		insurance: number;
	};
	by_gender: {
		male: number;
		female: number;
		other: number;
	};
	avg_stay_duration: number;
	time_grouped?: TimeGroupedData[];
}

export interface DoctorStatistics {
	doctor_id: number;
	doctor_name: string;
	doctor_type: string;
	total_patients_attended: number;
	total_patients_referred: number;
	total_patients_supervised: number;
	avg_patients_per_day: number;
	total_revenue_generated: number;
}

// Employee Payment Reports
export interface EmployeePaymentReport {
	employee_id: number;
	employee_name: string;
	employee_type: string;
	hire_date: string;
	payment_summary: PaymentSummary;
	payment_details: EmployeePaymentDetail[];
	payment_breakdown?: any;
}

export interface EmployeePaymentDetail {
	payment_id: number;
	payment_date: string;
	payment_amount: number;
	extra_amount: number;
	extra_payment_type: string;
	payment_type: string;
	percentage_scope?: string;
	is_paid: boolean;
	is_void?: boolean;
	paid_timestamp?: string;
	paid_by?: string;
	main_patient_id?: number;
	main_patient_name?: string;
	patient_associations?: PaymentPatientAssociation[];
	clock_in_deductions?: ClockInDeduction[];
}

export interface PaymentPatientAssociation {
	payment_patient_id: number;
	patient_id: number;
	patient_name: string;
	patient_history_id?: number;
	admission_time?: string;
	discharge_time?: string;
	diagnosis?: string;
	work_date: string;
	hours_worked: number;
	payment_amount: number;
	payment_type: string;
}

export interface ClockInDeduction {
	clock_id: number;
	clock_in: string;
	clock_out?: string;
	pay_deduction: number;
	hours_worked: number;
	status: string;
}

export interface PaymentSummary {
	total_payments: number;
	total_base_pay: number;
	total_extra_pay: number;
	total_paid: number;
	total_unpaid: number;
	total_voided: number;
	total_deductions: number;
	net_payment: number;
	avg_payment: number;
}

// Chart Data Types
export interface ChartData {
	labels: string[];
	datasets: ChartDataset[];
}

export interface ChartDataset {
	label: string;
	data: number[];
	backgroundColor?: string | string[];
	borderColor?: string | string[];
	borderWidth?: number;
}

export interface ReportWithChart {
	data: any;
	chartData: ChartData;
	chartType: "pie" | "bar" | "line" | "doughnut";
}

// ==================== EMPLOYEE CLOCK-IN REPORTS ====================

export interface EmployeeClockInReport {
	employee_id: number;
	employee_name: string;
	employee_type: string;
	shift_type?: string;
	shift_start_time?: string;
	shift_end_time?: string;
	total_clock_ins: number;
	total_hours_worked: number;
	total_deductions: number;
	avg_hours_per_day: number;
	clock_in_records: ClockInRecord[];
	attendance_summary: AttendanceSummary;
}

export interface ClockInRecord {
	clock_id: number | null;
	clock_in: string | null;
	clock_out?: string | null;
	hours_worked: number;
	pay_deduction: number;
	status:
	| "complete"
	| "incomplete"
	| "late"
	| "early"
	| "on_time"
	| "missing";
	is_missing?: boolean;
	date?: string;
	notes?: string;
	patients?: ClockInPatient[];
	patient_count?: number;
}

export interface ClockInPatient {
	patient_id: number;
	patient_name: string;
	payment_type: string;
	hours_worked: number;
	diagnosis?: string;
	admission_time?: string;
	discharge_time?: string;
}

export interface AttendanceSummary {
	total_days: number;
	complete_days: number;
	incomplete_days: number;
	late_days: number;
	early_days: number;
	on_time_days: number;
	missing_days: number;
	punctuality_rate: number; // Percentage
}

export interface ClockInStatistics {
	total_employees: number;
	total_clock_ins: number;
	total_hours_worked: number;
	total_deductions: number;
	avg_hours_per_employee: number;
	by_employee_type: {
		[key: string]: {
			employee_count: number;
			total_hours: number;
			total_deductions: number;
		};
	};
	time_grouped?: ClockInTimeGroupedData[];
}

export interface ClockInTimeGroupedData {
	period: string;
	year?: number;
	month?: number;
	day?: number;
	total_clock_ins: number;
	total_hours_worked: number;
	total_deductions: number;
	employee_count: number;
}