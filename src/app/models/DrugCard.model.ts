import { query } from "./database/connection.js";
import {
	DrugCard,
	CreateDrugCardDTO,
	UpdateDrugCardDTO,
	DrugStock,
	DrugExpiry,
	DrugSearchResult
} from "../utils/types/drugs.js";

export class DrugCardModel {
	async getAllDrugCards(
		pagination?: { offset?: number; limit?: number; q?: string }
	): Promise<{ rows: DrugCard[]; total: number }> {
		try {
			const offset = Math.max(0, pagination?.offset ?? 0)
			const limit = Math.max(1, Math.min(pagination?.limit ?? 25, 100))
			const q = pagination?.q?.trim()

			let sql: string
			const params: unknown[] = []
			if (q) {
				sql = `SELECT * FROM DrugCard WHERE name ILIKE $1 ORDER BY name LIMIT $2 OFFSET $3`
				params.push(`%${q}%`, limit, offset)
			} else {
				sql = `SELECT * FROM DrugCard ORDER BY name LIMIT $1 OFFSET $2`
				params.push(limit, offset)
			}
			const countSql = q
				? `SELECT COUNT(*) AS c FROM DrugCard WHERE name ILIKE $1`
				: `SELECT COUNT(*) AS c FROM DrugCard`

			const [result, countRes] = await Promise.all([
				query(sql, params),
				query(
					countSql,
					q ? [`%${q}%`] : []
				)
			])
			return {
				rows: result.rows,
				total: Number(countRes.rows[0]?.c ?? 0),
			}
		} catch (error) {
			throw error
		}
	}

	async getDrugCardById(drugId: number): Promise<DrugCard | null> {
		try {
			const sql = `
                SELECT * 
                FROM DrugCard 
                WHERE drug_id = $1;
            `;
			const result = await query(sql, [drugId]);
			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	async createDrugCard(
		data: CreateDrugCardDTO,
		userId: number
	): Promise<DrugCard> {
		try {
			// Validate unit conversion
			if (!this.validateUnitConversion(data.unit_conversion)) {
				throw new Error("Invalid unit conversion data");
			}

			// Check for duplicate name
			const existingDrug = await query(
				"SELECT drug_id FROM DrugCard WHERE LOWER(name) = LOWER($1)",
				[data.name]
			);

			if (existingDrug.rows.length > 0) {
				throw new Error("Drug name already exists");
			}

			const sql = `
                INSERT INTO DrugCard (
                    name, manufacturer, provider,
                    is_obligatory_continuous, sale_quantity,
                    frequency, min_stock_alert,
                    max_days_expiry_alert, unit_conversion,
                    created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;

			const values = [
				data.name,
				data.manufacturer || null,
				data.provider || null,
				data.is_obligatory_continuous,
				data.sale_quantity,
				data.frequency || null,
				data.min_stock_alert || null,
				data.max_days_expiry_alert || null,
				data.unit_conversion,
				userId
			];

			const result = await query(sql, values);
			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async updateDrugCard(data: UpdateDrugCardDTO): Promise<DrugCard> {
		try {
			// Check if drug exists
			const existingDrug = await this.getDrugCardById(data.drug_id);
			if (!existingDrug) {
				throw new Error("Drug not found");
			}

			// Check for duplicate name if name is being updated
			if (data.name) {
				const duplicateName = await query(
					"SELECT drug_id FROM DrugCard WHERE LOWER(name) = LOWER($1) AND drug_id != $2",
					[data.name, data.drug_id]
				);

				if (duplicateName.rows.length > 0) {
					throw new Error("Drug name already exists");
				}
			}

			// Validate unit conversion if provided
			if (
				data.unit_conversion &&
				!this.validateUnitConversion(data.unit_conversion)
			) {
				throw new Error("Invalid unit conversion data");
			}

			const updates: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			// Build dynamic update query
			if (data.name !== undefined) {
				updates.push(`name = $${paramCount}`);
				values.push(data.name);
				paramCount++;
			}
			if (data.manufacturer !== undefined) {
				updates.push(`manufacturer = $${paramCount}`);
				values.push(data.manufacturer);
				paramCount++;
			}
			if (data.provider !== undefined) {
				updates.push(`provider = $${paramCount}`);
				values.push(data.provider);
				paramCount++;
			}
			if (data.is_obligatory_continuous !== undefined) {
				updates.push(`is_obligatory_continuous = $${paramCount}`);
				values.push(data.is_obligatory_continuous);
				paramCount++;
			}
			if (data.sale_quantity !== undefined) {
				updates.push(`sale_quantity = $${paramCount}`);
				values.push(data.sale_quantity);
				paramCount++;
			}
			if (data.frequency !== undefined) {
				updates.push(`frequency = $${paramCount}`);
				values.push(data.frequency);
				paramCount++;
			}
			if (data.min_stock_alert !== undefined) {
				updates.push(`min_stock_alert = $${paramCount}`);
				values.push(data.min_stock_alert);
				paramCount++;
			}
			if (data.max_days_expiry_alert !== undefined) {
				updates.push(`max_days_expiry_alert = $${paramCount}`);
				values.push(data.max_days_expiry_alert);
				paramCount++;
			}
			if (data.unit_conversion !== undefined) {
				updates.push(`unit_conversion = $${paramCount}`);
				values.push(data.unit_conversion);
				paramCount++;
			}

			if (updates.length === 0) {
				return existingDrug;
			}

			values.push(data.drug_id);
			const sql = `
                UPDATE DrugCard
                SET ${updates.join(", ")}
                WHERE drug_id = $${paramCount}
                RETURNING *;
            `;

			const result = await query(sql, values);
			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async deleteDrugCard(drugId: number): Promise<void> {
		try {
			await query("BEGIN");

			// Check if drug exists
			const existingDrug = await this.getDrugCardById(drugId);
			if (!existingDrug) {
				throw new Error("Drug not found");
			}

			// Check if drug has any shipments
			const shipments = await query(
				"SELECT shipment_id FROM DrugShipment WHERE drug_id = $1",
				[drugId]
			);

			if (shipments.rows.length > 0) {
				throw new Error("Cannot delete drug with existing shipments");
			}

			// Check if drug is used in any services
			const services = await query(
				"SELECT service_id FROM ServiceDrug WHERE drug_id = $1",
				[drugId]
			);

			if (services.rows.length > 0) {
				throw new Error("Cannot delete drug associated with services");
			}

			// Delete drug card
			await query("DELETE FROM DrugCard WHERE drug_id = $1", [drugId]);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async searchDrugs(searchTerm: string): Promise<DrugSearchResult[]> {
		try {
			const sql = `
                SELECT 
                    drug_id, name, manufacturer, provider
                FROM DrugCard 
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
		} catch (error) {
			throw error;
		}
	}

	async getDrugSuggestions(prefix: string): Promise<DrugSearchResult[]> {
		try {
			const sql = `
                SELECT 
                    drug_id, name, manufacturer, provider
                FROM DrugCard 
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
		} catch (error) {
			throw error;
		}
	}

	async getLowStockDrugs(): Promise<DrugStock[]> {
		try {
			const sql = `
                WITH DrugTotals AS (
                    SELECT 
                        d.drug_id,
                        d.name,
                        d.min_stock_alert,
                        d.unit_conversion,
                        COALESCE(SUM(ds.quantity), 0) as total_quantity
                    FROM DrugCard d
                    LEFT JOIN DrugShipment ds ON d.drug_id = ds.drug_id
                    WHERE d.min_stock_alert IS NOT NULL
                    GROUP BY d.drug_id, d.name, d.min_stock_alert, d.unit_conversion
                )
                SELECT *
                FROM DrugTotals
                WHERE total_quantity <= min_stock_alert
                ORDER BY name;
            `;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getNearExpiryDrugs(): Promise<DrugExpiry[]> {
		try {
			const sql = `
                SELECT 
                    d.drug_id,
                    d.name,
                    ds.shipment_id,
                    ds.quantity,
                    ds.expiry_date,
                    d.max_days_expiry_alert,
                    d.unit_conversion,
                    (ds.expiry_date - CURRENT_DATE) as days_until_expiry
                FROM DrugCard d
                JOIN DrugShipment ds ON d.drug_id = ds.drug_id
                WHERE 
                    d.max_days_expiry_alert IS NOT NULL
                    AND (ds.expiry_date - CURRENT_DATE) <= d.max_days_expiry_alert
                    AND ds.quantity > 0
                ORDER BY days_until_expiry;
            `;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	private validateUnitConversion(unitConversion: any): boolean {
		return (
			unitConversion &&
			typeof unitConversion === "object" &&
			typeof unitConversion.larger === "string" &&
			typeof unitConversion.smaller === "string" &&
			typeof unitConversion.ratio === "number" &&
			unitConversion.ratio > 0
		);
	}
}

export default new DrugCardModel();
