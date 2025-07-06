// src/app/utils/types/employees.d.ts
export type GenderType = "male" | "female" | "other";
export type PaymentType = "cash" | "credit" | "insurance";
export type LeaveReasonType =
	| "death"
	| "improvement"
	| "transfer"
	| "as_desired";
export type DiscountType = "fixed" | "percentage";
export type SaleType = "outside" | "medical_check" | "admitted";
export type ServiceType = "once" | "hourly" | "daily";
export type TransactionType = "patient" | "check" | "outside";
export type EmployeeType = "doctor" | "nurse" | "other";
export type PaymentCalculation = "fixed" | "per patient" | "both";
export type DoctorType = "attending" | "supervising" | "outside" | "referring";
export type PrepaymentType = "fixed" | "percentage";
export type extraPaymentType = "per patient" | "income" | "both" | "none";
export type perPatientPaymentType = "fixed" | "percentage";
export type PercentageScope = "before_deductions" | "after_deductions";
export type ShiftType = "morning" | "night";
export type VatScopeType = "services" | "drugs" | "both";

export interface Employee {
	employee_id: number;
	name: string;
	phone?: string;
	is_facility_employee: boolean;
	hire_date: string;
	employee_type: EmployeeType;
	base_pay?: number;
	extra_payment_type?: extraPaymentType;
	per_patient_payment_type?: perPatientPaymentType;
	percentage_scope?: PercentageScope;
	need_clock_in: boolean;
	shift_type?: ShiftType;
}

export interface Doctor extends Employee {
	doctor_type: DoctorType;
	is_active: boolean;
	daily_pay?: number;
	per_patient_pay?: number;
	payment_calculation?: PaymentCalculation;
	referral_bonus?: number;
}

export interface EmployeePayment {
	payment_id: number;
	employee_id: number;
	payment_amount: number;
	extra_payment_type?: string;
	payment_type: string;
	percentage_scope?: PercentageScope;
	extra_amount?: number;
	is_paid: boolean;
	is_void: boolean;
	issued_timestamp: string;
	paid_timestamp?: string;
	paid_by_user_id?: number;
}

export interface EmployeeClockIn {
	clock_id: number;
	employee_id: number;
	clock_in: string;
	clock_out?: string;
	pay_deduction: number;
}

export interface CreateEmployeeDTO {
	name: string;
	phone?: string;
	is_facility_employee: boolean;
	hire_date: string;
	employee_type: EmployeeType;
	base_pay?: number;
	extra_payment_type?: extraPaymentType;
	per_patient_payment_type?: perPatientPaymentType;
	percentage_scope?: PercentageScope;
	need_clock_in: boolean;
	shift_type?: ShiftType;
}

export interface CreateDoctorDTO extends CreateEmployeeDTO {
	doctor_type: DoctorType;
	is_active: boolean;
	daily_pay?: number;
	per_patient_pay?: number;
	payment_calculation?: PaymentCalculation;
	referral_bonus?: number;
}

export interface CreateEmployeePaymentDTO {
	employee_id: number;
	payment_amount: number;
	extra_payment_type?: string;
	payment_type: string;
	percentage_scope?: PercentageScope;
	extra_amount?: number;
	paid_by_user_id?: number | null;
}

export interface CreateEmployeeClockInDTO {
	employee_id: number;
	clock_in: string;
	clock_out?: string;
	pay_deduction?: number;
}
