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
	services_count: number;
	drugs_count: number;
}
