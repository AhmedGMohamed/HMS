export interface Warehouse {
	warehouse_id: number;
	name: string;
	location: string;
}

export interface WarehouseWithStats extends Warehouse {
	total_shipments: number;
	total_drugs: number;
	total_stock_value: number;
}

export interface CreateWarehouseDTO {
	name: string;
	location: string;
}

export interface UpdateWarehouseDTO {
	warehouse_id: number;
	name?: string;
	location?: string;
}
