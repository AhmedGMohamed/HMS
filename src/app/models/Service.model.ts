import { query } from "./database/connection.js";
import {
	Service,
	ServicePrice,
	ServiceDrug,
	ActivePatientService,
	CreateServiceDTO,
	UpdateServiceDTO,
	ServiceSearchResult
} from "../utils/types/services.js";

export class ServiceModel {
	// Get all services with their prices
	async getAllServices(): Promise<Service[]> {
		const sql = `
            SELECT * FROM Service 
            ORDER BY name;
        `;
		const result = await query(sql);
		return result.rows;
	}

	// Get service by ID with prices
	async getServiceById(serviceId: number): Promise<
		Service & { prices: ServicePrice[] } & {
			drugs: Array<ServiceDrug & { name: string }>;
		}
	> {
		const serviceSql = `
            SELECT s.*, (
				SELECT json_agg(t)
				FROM (
					SELECT DISTINCT sp.pricelist_id, sp.price, sp.requires_prepayment, sp.prepayment_type, sp.prepayment_amount
					FROM ServicePrice sp
					WHERE sp.service_id = s.service_id
				) t
			) as prices,
    		(
        		SELECT json_agg(d)
        		FROM (
            		SELECT sd.*, d.name
            		FROM ServiceDrug sd
					JOIN DrugCard d ON d.drug_id = sd.drug_id
            		WHERE sd.service_id = s.service_id
        		) d
    		) as drugs
			FROM Service s
			WHERE s.service_id = $1
			GROUP BY s.service_id; 
        `;
		const result = await query(serviceSql, [serviceId]);
		if (result.rows.length === 0) {
			throw new Error("Service not found");
		}
		return result.rows[0];
	}

	// Create new service with prices
	async createService(serviceData: CreateServiceDTO): Promise<Service> {
		await query("BEGIN");
		try {
			// Insert service
			const serviceSql = `
                INSERT INTO Service (
                    name, auto_renew, 
                    auto_add_on_admission, service_type
                ) VALUES ($1, $2, $3, $4)
                RETURNING *;
            `;
			const serviceResult = await query(serviceSql, [
				serviceData.name,
				serviceData.auto_renew,
				serviceData.auto_add_on_admission,
				serviceData.service_type
			]);

			const newService = serviceResult.rows[0];

			// Insert prices for each price list
			for (const price of serviceData.prices) {
				const priceSql = `
                    INSERT INTO ServicePrice (
                        service_id, pricelist_id, price,
                        requires_prepayment, prepayment_type, prepayment_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6);
                `;
				await query(priceSql, [
					newService.service_id,
					price.pricelist_id,
					price.price,
					price.requires_prepayment,
					price.prepayment_type || null,
					price.prepayment_amount || null
				]);
			}

			// Handle drug associations if provided
			if (serviceData.drugs && serviceData.drugs.length > 0) {
				await this.updateServiceDrugs(
					newService.service_id,
					serviceData.drugs
				);
			}

			await query("COMMIT");
			return newService;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	// Update service and its prices
	async updateService(
		serviceData: UpdateServiceDTO
	): Promise<Service & { prices: ServicePrice[] }> {
		await query("BEGIN");
		try {
			// Update service details
			let updateFields: string[] = [];
			let values: any[] = [];
			let paramCount = 1;

			if (serviceData.name) {
				updateFields.push(`name = $${paramCount}`);
				values.push(serviceData.name);
				paramCount++;
			}
			if (serviceData.auto_renew !== undefined) {
				updateFields.push(`auto_renew = $${paramCount}`);
				values.push(serviceData.auto_renew);
				paramCount++;
			}
			if (serviceData.auto_add_on_admission !== undefined) {
				updateFields.push(`auto_add_on_admission = $${paramCount}`);
				values.push(serviceData.auto_add_on_admission);
				paramCount++;
			}
			if (serviceData.service_type) {
				updateFields.push(`service_type = $${paramCount}`);
				values.push(serviceData.service_type);
				paramCount++;
			}

			if (updateFields.length > 0) {
				const serviceSql = `
                    UPDATE Service 
                    SET ${updateFields.join(", ")}
                    WHERE service_id = $${paramCount}
                    RETURNING *;
                `;
				values.push(serviceData.service_id);
				await query(serviceSql, values);
			}

			// Update prices if provided
			if (serviceData.prices) {
				await query("DELETE FROM ServicePrice WHERE service_id = $1", [
					serviceData.service_id
				]);

				for (const price of serviceData.prices) {
					// Delete existing price for the price list supplied
					await query(
						"DELETE FROM ServicePrice WHERE service_id = $1 AND pricelist_id = $2",
						[serviceData.service_id, price.pricelist_id]
					);
					// Insert new price
					const priceSql = `
                        INSERT INTO ServicePrice (
                            service_id, pricelist_id, price,
                            requires_prepayment, prepayment_type, prepayment_amount
                        ) VALUES ($1, $2, $3, $4, $5, $6);
                    `;
					await query(priceSql, [
						serviceData.service_id,
						price.pricelist_id,
						price.price,
						price.requires_prepayment,
						price.prepayment_type || null,
						price.prepayment_amount || null
					]);
				}
			}

			console.log(serviceData.drugs);
			// Handle drug associations if provided
			if (serviceData.drugs !== undefined) {
				await this.updateServiceDrugs(
					serviceData.service_id,
					serviceData.drugs
				);
			}

			await query("COMMIT");
			return this.getServiceById(serviceData.service_id);
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	// Delete service and its prices
	async deleteService(serviceId: number): Promise<void> {
		await query("BEGIN");
		try {
			// Delete prices first due to foreign key constraint
			await query("DELETE FROM ServicePrice WHERE service_id = $1", [
				serviceId
			]);

			// Delete service drugs due to foreign key constraint
			await query("DELETE FROM ServiceDrug WHERE service_id = $1", [
				serviceId
			]);

			// Delete service
			await query(
				"DELETE FROM Service WHERE service_id = $1 RETURNING *",
				[serviceId]
			);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async searchServices(searchTerm: string): Promise<ServiceSearchResult[]> {
		const sql = `
            SELECT 
                service_id,
                name,
                service_type
            FROM Service 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY 
                CASE 
                    WHEN LOWER(name) = LOWER($2) THEN 1
                    WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 2
                    ELSE 3
                END,
                name
            LIMIT 10;
        `;
		const result = await query(sql, [`%${searchTerm}%`, searchTerm]);
		return result.rows;
	}

	// Get service suggestions for autocomplete
	async getServiceSuggestions(
		prefix: string
	): Promise<ServiceSearchResult[]> {
		const sql = `
            SELECT 
                service_id,
                name,
                service_type
            FROM Service 
            WHERE LOWER(name) LIKE LOWER($1)
            ORDER BY 
                CASE 
                    WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 1
                    ELSE 2
                END,
                LENGTH(name),
                name
            LIMIT 5;
        `;
		const result = await query(sql, [`${prefix}%`, prefix]);
		return result.rows;
	}

	async getServiceDrugs(serviceId: number): Promise<ServiceDrug[]> {
		const sql = `
            SELECT sd.*, dc.name as drug_name
            FROM ServiceDrug sd
            JOIN DrugCard dc ON sd.drug_id = dc.drug_id
            WHERE sd.service_id = $1;
        `;
		const result = await query(sql, [serviceId]);
		return result.rows;
	}

	async updateServiceDrugs(
		serviceId: number,
		drugIds: number[]
	): Promise<void> {
		await query("BEGIN");
		try {
			const params = [serviceId, ...drugIds];
			const deleteSql = `
                DELETE FROM ServiceDrug 
                WHERE service_id = $1;
            `;

			await query(deleteSql, [serviceId]);

			if (drugIds.length > 0) {
				// Create the parameterized query for inserting new associations
				const placeholders: string[] = [];
				drugIds.forEach((_, index) => {
					placeholders.push(`($1, $${index + 2})`);
				});
				
				const insertSql = `
                INSERT INTO ServiceDrug (service_id, drug_id)
                VALUES ${placeholders.join(",")}
                ON CONFLICT (service_id, drug_id) DO NOTHING;
				`;
				
				console.log((await query(insertSql, params)).rows);
				
				await query("COMMIT");
			}
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getActivePatientServices(
		patientId: number
	): Promise<ActivePatientService[]> {
		const sql = `
            SELECT aps.*, s.name as service_name
            FROM ActivePatientService aps
            JOIN Service s ON aps.service_id = s.service_id
            WHERE aps.patient_id = $1 AND aps.is_active = true
            ORDER BY aps.start_date DESC;
        `;
		const result = await query(sql, [patientId]);
		return result.rows;
	}

	async addServiceToPatient(
		patientId: number,
		serviceId: number,
		startDate: Date = new Date()
	): Promise<ActivePatientService> {
		await query("BEGIN");
		try {
			// Check if service exists
			const serviceResult = await this.getServiceById(serviceId);

			if (!serviceResult) {
				throw new Error("Service not found");
			}

			// Insert new active service
			const sql = `
                INSERT INTO ActivePatientService (
                    patient_id, service_id, start_date, is_active
                ) VALUES ($1, $2, $3, true)
                RETURNING *;
            `;
			const result = await query(sql, [patientId, serviceId, startDate]);

			// If service has auto-add drugs, handle them here
			//const _serviceDrugs = await this.getServiceDrugs(serviceId);
			//! Note: Drug handling will be implemented when drug functionality is added

			await query("COMMIT");
			return result.rows[0];
		} catch (error: any) {
			await query("ROLLBACK");
			if (
				error.message === "Service not found" ||
				error.message === "Patient not found"
			) {
				throw error;
			}
			throw new Error("Failed to add service to patient");
		}
	}

	async deactivatePatientService(
		activeServiceId: number,
		endDate: Date = new Date()
	): Promise<ActivePatientService> {
		const sql = `
            UPDATE ActivePatientService
            SET is_active = false, end_date = $2
            WHERE active_service_id = $1
            RETURNING *;
        `;
		const result = await query(sql, [activeServiceId, endDate]);

		if (result.rows.length === 0) {
			throw new Error("Active service not found");
		}

		return result.rows[0];
	}
}

export default new ServiceModel();
