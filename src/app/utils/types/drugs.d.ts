export interface UnitConversion {
	larger: string;
	smaller: string;
	ratio: number;
}

export interface ShipmentPrice {
	pricelist_name: string;
	shipment_id: number;
	pricelist_id: number;
	price: number | string;
	requires_prepayment: boolean;
	prepayment_type: string;
	prepayment_amount: number | null;
}

export interface DrugCard {
	drug_id: number;
	name: string;
	manufacturer: string | null;
	provider: string | null;
	is_obligatory_continuous: boolean;
	sale_quantity: number;
	frequency: string | null; // Interval will be stored as string
	min_stock_alert: number | null;
	max_days_expiry_alert: number | null;
	unit_conversion: UnitConversion;
	created_by_user_id: number;
}

export interface CreateDrugCardDTO {
	name: string;
	manufacturer?: string;
	provider?: string;
	is_obligatory_continuous: boolean;
	sale_quantity: number;
	frequency?: string;
	min_stock_alert?: number;
	max_days_expiry_alert?: number;
	unit_conversion: UnitConversion;
}

export interface UpdateDrugCardDTO {
	drug_id: number;
	name?: string;
	manufacturer?: string | null;
	provider?: string | null;
	is_obligatory_continuous?: boolean;
	sale_quantity?: number;
	frequency?: string | null;
	min_stock_alert?: number | null;
	max_days_expiry_alert?: number | null;
	unit_conversion?: UnitConversion;
}

export interface DrugStock {
	drug_id: number;
	name: string;
	total_quantity: number;
	min_stock_alert: number | null;
	unit_conversion: UnitConversion;
}

export interface DrugExpiry {
	drug_id: number;
	name: string;
	shipment_id: number;
	quantity: number;
	expiry_date: Date;
	days_until_expiry: number;
	max_days_expiry_alert: number;
	unit_conversion: UnitConversion;
}

export interface DrugSearchResult {
	drug_id: number;
	name: string;
	manufacturer: string | null;
	provider: string | null;
}

export interface DrugShipment {
	shipment_id: number;
	drug_id: number;
	warehouse_id: number;
	quantity: number;
	buy_price: number | string;
	expiry_date: Date;
	received_date: Date;
	created_by_user_id: number;
}

export interface CreateDrugShipmentDTO {
	drug_id: number;
	warehouse_id: number;
	quantity: number; // This will be in larger units (e.g., boxes)
	buy_price: number;
	prices: {
		pricelist_id: number;
		price: number | string;
		requires_prepayment: boolean;
		prepayment_type: string;
		prepayment_amount: number | null;
	}[];
	expiry_date: string; // ISO date string
	received_date?: string; // Optional ISO date string
}

export interface UpdateDrugShipmentDTO {
	shipment_id: number;
	warehouse_id?: number;
	quantity?: number; // This will be in larger units
	buy_price?: number;
	prices?: {
		pricelist_id: number;
		price: number;
		requires_prepayment: boolean;
		prepayment_type?: string;
		prepayment_amount?: number;
	}[];
	expiry_date?: string;
}

export interface ShipmentWithDrugInfo extends DrugShipment {
	drug_name: string;
	warehouse_name: string;
	unit_conversion: UnitConversion;
}

export interface ShipmentStock {
	shipment_id: number;
	drug_id: number;
	drug_name: string;
	warehouse_id: number;
	warehouse_name: string;
	quantity: number;
	quantity_in_larger_unit: number;
	unit_conversion: UnitConversion;
	buy_price: number;
	expiry_date: Date;
	received_date: Date;
}

export interface DrugTransaction {
	transaction_id: number;
	shipment_id: number;
	transaction_type: "patient" | "check" | "outside";
	quantity: number;
	price: number | string;
	timestamp: string;
	created_by_user_id: number;
	patient_id: number | null;
}

export interface CreateDrugTransactionDTO {
	shipment_id: number;
	transaction_type: "patient" | "check" | "outside";
	quantity: number; // This will be in larger units
	price: number;
	patient_id?: number;
}

export interface TransactionWithDetails extends DrugTransaction {
	drug_id: number;
	drug_name: string;
	warehouse_id: number;
	warehouse_name: string;
	unit_conversion: UnitConversion;
	shipment_buy_price: number;
	profit: string;
	patient_name: string | null;
}

export interface TransactionSummary {
	total_quantity: number;
	total_sales: number;
	total_cost: number;
	total_profit: number;
	transaction_count: number;
}

export interface DrugTransactionFilters {
	startDate?: string;
	endDate?: string;
	transactionType?: "patient" | "check" | "outside";
	drugId?: number;
	warehouseId?: number;
}

export interface DrugUsage {
	usage_id: number;
	patient_id: number;
	drug_id: number;
	transaction_id: number;
	remaining_quantity: number;
	last_administered: Date | null;
}

export interface DrugUsageWithDetails extends DrugUsage {
	drug_name: string;
	patient_name: string;
	unit_conversion: UnitConversion;
	frequency: string | null;
	is_obligatory_continuous: boolean;
}

export interface CreateDrugUsageDTO {
	patient_id: number;
	drug_id: number;
	patient_history_id: number;
	shipment_id: number;
	quantity: number; // This will be in larger units
	price: number | string;
}

export interface UpdateDrugUsageDTO {
	usage_id: number;
	remaining_quantity?: number; // This will be in smaller units
	last_administered?: Date;
}

export interface AvailableShipment {
	shipment_id: number;
	warehouse_name: string;
	quantity: number;
	quantity_in_larger_unit: number;
	buy_price: number | string;
	sell_price: number | string;
	expiry_date: Date;
	unit_conversion: UnitConversion;
}

export interface PendingAdministration {
	usage_id: number;
	patient_id: number;
	patient_name: string;
	drug_id: number;
	drug_name: string;
	remaining_quantity: number;
	frequency: string;
	last_administered: Date | null;
	next_administration: Date;
	unit_conversion: UnitConversion;
}

export interface DrugUsageHistory {
	usage_id: number;
	patient_id: number;
	patient_name: string;
	drug_id: number;
	drug_name: string;
	transaction_id: number;
	initial_quantity: number;
	remaining_quantity: number;
	unit_conversion: UnitConversion;
	start_date: Date;
	last_administered: Date | null;
	is_active: boolean;
}

export interface Warehouse {
	warehouse_id: number;
	name: string;
	location: string;
}