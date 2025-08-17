// Enhanced src/app/utils/types/patients.d.ts
export interface Patient {
	patient_id: number;
	name: string;
	gender: "male" | "female" | "other";
	phone: string | null;
	address: string | null;
	payment_type: "cash" | "credit" | "insurance";
	insurance_id: number | null;
	insurance_card_id: string | null;
	guardian_info: {
		name: string;
		phone: string;
		address: string;
		kinship: string;
	} | null;
	quick_check: boolean;
	is_active: boolean;
	registration_date: Date;
	referring_doctor_id: number | null;
	created_by_user_id: number;
	insurance_company_name?: string; // Joined from InsuranceCompany
}

export interface PatientHistory {
	patient_history_id: number;
	patient_id: number;
	bill_id: number | null;
	leave_reason: "death" | "improvement" | "transfer" | "as_desired" | null;
	quick_check: boolean;
	diagnosis: string | null;
	admission_time: Date;
	discharge_time: Date | null;
	attending_doctors?: string[]; // Array of doctor names
	attending_doctor_ids?: number[]; // Array of doctor IDs
	total_amount?: number; // From bill
	paid_amount?: number; // From bill
}

export interface PatientDoctor {
	patient_id: number;
	doctor_id: number;
}

export interface DoctorPatientHistory {
	patient_history_id: number;
	doctor_id: number;
}

export interface CreatePatientDTO {
	name: string;
	gender: "male" | "female" | "other";
	phone?: string;
	address?: string;
	payment_type: "cash" | "credit" | "insurance";
	insurance_id?: number;
	insurance_card_id?: string;
	guardian_info?: {
		name: string;
		phone: string;
		address: string;
		kinship: string;
	};
	quick_check: boolean;
	referring_doctor_id?: number;

	// Optional admission fields
	admit_patient?: boolean;
	attending_doctors?: number[];
	diagnosis?: string;

	is_active?: boolean;
	created_by_user_id?: number;
}

export interface UpdatePatientDTO {
	patient_id: number;
	name?: string;
	gender?: "male" | "female" | "other";
	phone?: string;
	address?: string;
	payment_type?: "cash" | "credit" | "insurance";
	insurance_id?: number;
	insurance_card_id?: string;
	guardian_info?: {
		name: string;
		phone: string;
		address: string;
		kinship: string;
	};
	diagnosis?: string;
	referring_doctor_id?: number | null; // Can be set to null to remove referring doctor
	attending_doctors?: {
		add?: number[]; // Doctors to add
		remove?: number[]; // Doctors to remove
	};
}

export interface AdmitPatientDTO {
	patient_id: number;
	diagnosis: string;
	attending_doctors: number[];
}

export interface DischargePatientDTO {
	patient_id: number;
	leave_reason: "death" | "improvement" | "transfer" | "as_desired";
	discharge_time?: string; // ISO date string, defaults to current time
}

export interface PatientSearchResult {
	patient_id: number;
	name: string;
	is_active: boolean;
	registration_date: Date;
}

// Additional interfaces for patient services and billing
export interface PatientService {
	active_service_id: number;
	patient_id: number;
	service_id: number;
	service_name: string;
	start_date: Date;
	end_date: Date | null;
	is_active: boolean;
}

export interface PatientBill {
	bill_id: number;
	patient_id: number;
	total_amount: number;
	paid_amount: number;
	discount_type: "fixed" | "percentage" | null;
	discount: number;
	administrative_expenses: number;
	vat_percentage: number;
	vat_scope: "services" | "drugs" | "both";
	generated_at: Date;
	updated_at: Date;
	issued_by_user_id: number;
	bill_details?: BillDetail[];
}

export interface BillDetail {
	bill_detail_id: number;
	bill_id: number;
	service_id: number | null;
	service_name?: string;
	drug_shipment_id: number | null;
	drug_name?: string;
	quantity: number;
	unit_price: number;
	charge_type: string;
	sale_type: "outside" | "medical_check" | "admitted";
	generated_at: Date;
}

// Insurance related types
export interface InsuranceCompany {
	insurance_id: number;
	name: string;
	contact_info: string | null;
}

export interface InsuranceCoverage {
	coverage_id: number;
	insurance_id: number;
	service_id?: number;
	drug_id?: number;
	coverage_type: "fixed" | "percentage";
	coverage_amount: number;
	is_active: boolean;
}

// Drug administration types
export interface PatientDrugUsage {
	usage_id: number;
	patient_id: number;
	drug_id: number;
	drug_name: string;
	remaining_quantity: number;
	last_administered: Date | null;
	frequency: string | null;
	is_obligatory_continuous: boolean;
	next_administration?: Date;
}

// Service renewal types
export interface ServiceRenewal {
	renewal_id: number;
	patient_id: number;
	service_id: number;
	service_name: string;
	last_charged: Date;
	next_charge: Date;
	service_type: "once" | "hourly" | "daily";
	auto_renew: boolean;
	is_active: boolean;
}