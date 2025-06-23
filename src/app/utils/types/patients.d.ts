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
	discharge_time?: string;
}

export interface PatientSearchResult {
	patient_id: number;
	name: string;
	is_active: boolean;
	registration_date: Date;
}
