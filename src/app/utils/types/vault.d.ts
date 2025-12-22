export interface VaultSummary {
	// Patient Revenue
	patient_services_total: number;
	patient_drugs_total: number;
	patient_supplies_total: number;
	patient_payments_total: number;
	patient_outstanding_total: number;
	patient_discounts_total: number;

	// Manual Payments
	manual_additions_total: number;
	manual_deductions_total: number;
	manual_net_total: number;

	// Pharmacy
	drug_shipment_costs_total: number;
	drug_sales_revenue_total: number;
	drug_sales_profit_total: number;

	// Medical Supplies
	supply_shipment_costs_total: number;
	supply_sales_revenue_total: number;
	supply_sales_profit_total: number;

	// Employee Wages
	wages_owed_total: number;
	wages_paid_total: number;
	wages_outstanding_total: number;

	// Insurance Payments
	insurance_payments_total: number;
	insurance_payment_count: number;
	insurance_payment_average: number;

	// Net Summary
	total_revenue: number;
	total_expenses: number;
	net_profit: number;
}

export interface ManualPayment {
	payment_id: number;
	payment_amount: number;
	payment_type: "addition" | "deduction";
	payment_time: Date;
	description?: string;
}

export interface VaultReportData {
	type:
	| "patient_services"
	| "patient_drugs"
	| "patient_payments"
	| "patient_outstanding"
	| "patient_discounts"
	| "manual_payments"
	| "drug_shipments"
	| "drug_sales"
	| "drug_profits"
	| "wages_owed"
	| "wages_paid";
	startDate: string;
	endDate: string;
	data: any[];
}
