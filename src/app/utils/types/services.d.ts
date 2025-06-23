export interface Service {
	service_id: number;
	name: string;
	auto_renew: boolean;
	auto_add_on_admission: boolean;
	service_type: "once" | "hourly" | "daily";
}

export interface ServicePrice {
	service_id: number;
	pricelist_id: number;
	price: number | string;
	requires_prepayment: boolean;
	prepayment_type: "fixed" | "percentage" | null;
	prepayment_amount: number | null;
}

export interface ServiceDrug {
	service_id: number;
	drug_id: number;
}

export interface ActivePatientService {
	active_service_id: number;
	patient_id: number;
	service_id: number;
	start_date: Date;
	end_date: Date | null;
	is_active: boolean;
}

export interface CreateServiceDTO {
	name: string;
	auto_renew: boolean;
	auto_add_on_admission: boolean;
	service_type: "once" | "hourly" | "daily";
	prices: {
		pricelist_id: number;
		price: number;
		requires_prepayment: boolean;
		prepayment_type?: "fixed" | "percentage";
		prepayment_amount?: number;
	}[];
	drugs?: number[]; // Array of drug IDs to associate with the service
}

export interface UpdateServiceDTO extends Partial<CreateServiceDTO> {
	service_id: number;
}

export interface ServiceSearchResult {
	service_id: number;
	name: string;
	service_type: "once" | "hourly" | "daily";
}
