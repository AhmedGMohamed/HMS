// Medical Supplies Type Definitions
// Similar to drugs.d.ts but without unit_conversion

export interface ShipmentPrice {
    pricelist_name: string;
    shipment_id: number;
    pricelist_id: number;
    price: number | string;
    requires_prepayment: boolean;
    prepayment_type: string;
    prepayment_amount: number | null;
}

export interface MedicalSupply {
    supply_id: number;
    name: string;
    manufacturer: string | null;
    provider: string | null;
    is_obligatory_continuous: boolean;
    sale_quantity: number;
    frequency: string | null; // Interval will be stored as string
    min_stock_alert: number | null;
    created_by_user_id: number;
}

export interface CreateMedicalSupplyDTO {
    name: string;
    manufacturer?: string;
    provider?: string;
    is_obligatory_continuous: boolean;
    sale_quantity: number;
    frequency?: string;
    min_stock_alert?: number;
}

export interface UpdateMedicalSupplyDTO {
    supply_id: number;
    name?: string;
    manufacturer?: string | null;
    provider?: string | null;
    is_obligatory_continuous?: boolean;
    sale_quantity?: number;
    frequency?: string | null;
    min_stock_alert?: number | null;
}

export interface MedicalSupplyStock {
    supply_id: number;
    name: string;
    total_quantity: number;
    min_stock_alert: number | null;
}

export interface MedicalSupplySearchResult {
    supply_id: number;
    name: string;
    manufacturer: string | null;
    provider: string | null;
}

export interface MedicalSupplyShipment {
    shipment_id: number;
    supply_id: number;
    warehouse_id: number;
    buy_quantity: number;
    quantity: number;
    buy_price: number | string;
    expiry_date: Date | null;
    received_date: Date;
    created_by_user_id: number;
}

export interface CreateMedicalSupplyShipmentDTO {
    supply_id: number;
    warehouse_id: number;
    buy_quantity: number;
    quantity: number;
    buy_price: number;
    prices: {
        pricelist_id: number;
        price: number | string;
        requires_prepayment: boolean;
        prepayment_type: string;
        prepayment_amount: number | null;
    }[];
    expiry_date?: string; // Optional ISO date string
    received_date?: string; // Optional ISO date string
}

export interface UpdateMedicalSupplyShipmentDTO {
    shipment_id: number;
    warehouse_id?: number;
    quantity?: number;
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

export interface ShipmentWithSupplyInfo extends MedicalSupplyShipment {
    supply_name: string;
    warehouse_name: string;
}

export interface ShipmentStock {
    shipment_id: number;
    supply_id: number;
    supply_name: string;
    warehouse_id: number;
    warehouse_name: string;
    quantity: number;
    buy_price: number;
    expiry_date: Date | null;
    received_date: Date;
}

export interface MedicalSupplyTransaction {
    transaction_id: number;
    shipment_id: number;
    transaction_type: "patient" | "check" | "outside";
    quantity: number;
    price: number | string;
    timestamp: string;
    created_by_user_id: number;
}

export interface CreateMedicalSupplyTransactionDTO {
    shipment_id: number;
    transaction_type: "patient" | "check" | "outside";
    quantity: number;
    price: number;
}

export interface TransactionWithDetails extends MedicalSupplyTransaction {
    supply_id: number;
    supply_name: string;
    warehouse_id: number;
    warehouse_name: string;
    shipment_buy_price: number;
    profit: string;
}

export interface TransactionSummary {
    total_quantity: number;
    total_sales: number;
    total_cost: number;
    total_profit: number;
    transaction_count: number;
}

export interface MedicalSupplyTransactionFilters {
    startDate?: string;
    endDate?: string;
    transactionType?: "patient" | "check" | "outside";
    supplyId?: number;
    warehouseId?: number;
}

export interface MedicalSupplyUsage {
    usage_id: number;
    patient_id: number;
    supply_id: number;
    transaction_id: number;
    patient_history_id: number;
    remaining_quantity: number;
    last_administered: Date | null;
}

export interface MedicalSupplyUsageWithDetails extends MedicalSupplyUsage {
    supply_name: string;
    patient_name: string;
    frequency: string | null;
    is_obligatory_continuous: boolean;
}

export interface CreateMedicalSupplyUsageDTO {
    patient_id: number;
    supply_id: number;
    patient_history_id: number;
    shipment_id: number;
    quantity: number;
    price: number | string;
}

export interface UpdateMedicalSupplyUsageDTO {
    usage_id: number;
    remaining_quantity?: number;
    last_administered?: Date;
}

export interface AvailableShipment {
    shipment_id: number;
    warehouse_name: string;
    quantity: number;
    buy_price: number | string;
    prices: ShipmentPrice[];
    expiry_date: Date | null;
}

export interface PendingAdministration {
    usage_id: number;
    patient_id: number;
    patient_name: string;
    supply_id: number;
    supply_name: string;
    remaining_quantity: number;
    frequency: string;
    last_administered: Date | null;
    next_administration: Date;
}

export interface MedicalSupplyUsageHistory {
    usage_id: number;
    patient_id: number;
    patient_name: string;
    supply_id: number;
    supply_name: string;
    transaction_id: number;
    initial_quantity: number;
    remaining_quantity: number;
    start_date: Date;
    last_administered: Date | null;
    is_active: boolean;
    warehouse_name: string | null;
    unit_price: number | string | null;
}

export interface MedicalSupplyUsageFilters {
    startDate?: string;
    endDate?: string;
    patientId?: number;
    supplyId?: number;
    isActive?: boolean;
    offset?: number;
    limit?: number;
}

export interface MedicalSupplyUsageSummary {
    totalUnitsDispensedAllTime: number;
    totalUnitsDispensedLast30Days: number;
    activeUsagesCount: number;
    totalPatientsServed: number;
}

export interface Warehouse {
    warehouse_id: number;
    name: string;
    location: string;
}
