export interface PriceList {
	pricelist_id: number;
	name: string;
	is_default: boolean;
}

export interface CreatePriceListDTO {
	name: string;
	is_default: boolean;
}

export interface UpdatePriceListDTO {
	name?: string;
	is_default?: boolean;
}

export interface PriceListStats {
	total_services: number;
	total_drugs: number;
	total_supplies: number;
}

export interface PriceListWithStats extends PriceList, PriceListStats {}

export interface BulkServicePriceEntry {
	service_id: number;
	price: number | null;
	requires_prepayment?: boolean;
	prepayment_type?: "fixed" | "percentage" | null;
	prepayment_amount?: number | null;
}

export interface BulkShipmentPriceEntry {
	shipment_id: number;
	price: number | null;
	requires_prepayment?: boolean;
	prepayment_type?: "fixed" | "percentage" | null;
	prepayment_amount?: number | null;
}

export interface BulkPricesDTO {
	services?: BulkServicePriceEntry[];
	drug_shipments?: BulkShipmentPriceEntry[];
	supply_shipments?: BulkShipmentPriceEntry[];
}

export interface BulkPricesResult extends PriceListStats {
	removed_prices: number;
}
