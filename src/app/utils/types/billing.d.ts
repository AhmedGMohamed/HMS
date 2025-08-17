// src/app/utils/types/billing.d.ts
export interface Bill {
	bill_id: number;
	patient_id: number;
	total_amount: number;
	paid_amount: number;
	discount_type: "fixed" | "percentage" | null;
	discount: number;
	administrative_expenses: number;
	vat_percentage: number | null;
	vat_scope: "services" | "drugs" | "both" | null;
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

export interface CreateBillDTO {
	patient_id: number;
	discount_type?: "fixed" | "percentage";
	discount?: number;
	administrative_expenses?: number;
	vat_percentage?: number;
	vat_scope?: "services" | "drugs" | "both";
}

export interface UpdateBillDTO {
	bill_id: number;
	discount_type?: "fixed" | "percentage";
	discount?: number;
	administrative_expenses?: number;
	vat_percentage?: number;
	vat_scope?: "services" | "drugs" | "both";
	paid_amount?: number;
}

export interface CreateBillDetailDTO {
	bill_id: number;
	service_id?: number;
	drug_shipment_id?: number;
	quantity: number;
	unit_price: number;
	charge_type: string;
	sale_type: "outside" | "medical_check" | "admitted";
}

export interface PaymentRecord {
	payment_id: number;
	bill_id: number;
	amount: number;
	payment_method: "cash" | "credit" | "insurance";
	payment_date: Date;
	processed_by_user_id: number;
	notes?: string;
}
