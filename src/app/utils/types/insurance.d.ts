// src/app/utils/types/insurance.d.ts
export interface InsuranceCompany {
	insurance_id: number;
	name: string;
	contact_info: string | null;
	pricelist_id: number | null;
	last_cleared_date: Date;
	pricelist_name?: string; // Joined from PriceList
	patient_count?: number; // Count of patients with this insurance
}

export interface InsurancePayment {
	payment_id: number;
	insurance_id: number;
	payment_amount: number;
	payment_from: Date;
	payment_to: Date;
	added_by_user_id: number;
	issued_timestamp: Date;
	added_by_username?: string; // Joined from User
}

export interface CreateInsuranceCompanyDTO {
	name: string;
	contact_info?: string;
	pricelist_id?: number;
}

export interface UpdateInsuranceCompanyDTO {
	insurance_id: number;
	name?: string;
	contact_info?: string;
	pricelist_id?: number;
	last_cleared_date?: string; // ISO date string
}

export interface CreateInsurancePaymentDTO {
	insurance_id: number;
	payment_amount: number;
	payment_from: string; // ISO date string
	payment_to: string; // ISO date string
	added_by_user_id: number;
}

export interface InsurancePatient {
	patient_id: number;
	name: string;
	national_id: string;
	gender: "male" | "female" | "other";
	phone: string | null;
	insurance_card_id: string | null;
	insurance_form_id: string | null;
	payment_type: "cash" | "credit" | "insurance";
	is_active: boolean;
	registration_date: Date;
	current_admission?: {
		patient_history_id: number;
		admission_time: Date;
		diagnosis: string | null;
		bill_id: number;
		total_amount: number;
		paid_amount: number;
		outstanding_amount: number;
	};
}

export interface InsuranceReportItem {
	patient_id: number;
	patient_name: string;
	insurance_card_id: string | null;
	insurance_form_id: string | null;
	admission_time: Date;
	discharge_time: Date | null;
	bill_id: number;
	service_id?: number;
	service_name?: string;
	drug_shipment_id?: number;
	drug_name?: string;
	item_type: "service" | "drug";
	quantity: number;
	unit_price: number;
	total_cost: number;
	service_date: Date;
	sale_type: "outside" | "medical_check" | "admitted";
}

export interface InsuranceReportSummary {
	insurance_id: number;
	insurance_name: string;
	report_period: {
		start_date: Date;
		end_date: Date;
	};
	last_cleared_date: Date;
	total_services_cost: number;
	total_drugs_cost: number;
	total_cost: number;
	total_patient_payments: number;
	outstanding_amount: number;
	patient_count: number;
	items: InsuranceReportItem[];
	cleared_payments: InsurancePayment[];
}

export interface InsuranceReportFilters {
	insurance_id: number;
	start_date: string;
	end_date: string;
	include_drugs?: boolean;
	include_cleared_items?: boolean;
}
