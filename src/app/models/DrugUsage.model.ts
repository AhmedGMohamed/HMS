// src/app/models/DrugUsage.model.ts
import { query } from "./database/connection.js";
import {
	DrugUsageWithDetails,
	CreateDrugUsageDTO,
	UpdateDrugUsageDTO,
	PendingAdministration,
	AvailableShipment,
	DrugUsageHistory,
	DrugCard
} from "../utils/types/drugs.js";
import { Patient } from "../utils/types/patients.js";

export class DrugUsageModel {
	async getAllDrugUsages(): Promise<DrugUsageWithDetails[]> {
		try {
			const sql = `
                SELECT 
                    du.*,
                    dc.name as drug_name,
                    p.name as patient_name,
                    dc.unit_conversion,
                    dc.frequency,
                    dc.is_obligatory_continuous
                FROM DrugUsage du
                JOIN DrugCard dc ON du.drug_id = dc.drug_id
                JOIN Patient p ON du.patient_id = p.patient_id
                ORDER BY p.name, dc.name;
            `;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getDrugUsageById(
		usageId: number
	): Promise<DrugUsageWithDetails | null> {
		try {
			const sql = `
                SELECT 
                    du.*,
                    dc.name as drug_name,
                    p.name as patient_name,
                    dc.unit_conversion,
                    dc.frequency,
                    dc.is_obligatory_continuous
                FROM DrugUsage du
                JOIN DrugCard dc ON du.drug_id = dc.drug_id
                JOIN Patient p ON du.patient_id = p.patient_id
                WHERE du.usage_id = $1;
            `;
			const result = await query(sql, [usageId]);
			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	async createDrugUsage(
		data: CreateDrugUsageDTO,
		userId: number
	): Promise<DrugUsageWithDetails> {
		try {
			await query("BEGIN");

			// Get drug details to validate and convert quantity
			const drugResult = await query(
				`
                SELECT unit_conversion, frequency, is_obligatory_continuous 
                FROM DrugCard 
                WHERE drug_id = $1
            `,
				[data.drug_id]
			);

			if (drugResult.rows.length === 0) {
				throw new Error("Drug not found");
			}

			// Verify patient exists
			const patientResult = await query(
				"SELECT patient_id FROM Patient WHERE patient_id = $1",
				[data.patient_id]
			);

			if (patientResult.rows.length === 0) {
				throw new Error("Patient not found");
			}

			// Verify shipment exists and belongs to the correct drug
			const shipmentResult = await query(
				`
            	SELECT quantity 
            	FROM DrugShipment 
            	WHERE shipment_id = $1 AND drug_id = $2
        	`,
				[data.shipment_id, data.drug_id]
			);

			if (shipmentResult.rows.length === 0) {
				throw new Error("Invalid shipment for this drug");
			}

			// Convert quantity to smaller units
			const unitConversion = drugResult.rows[0].unit_conversion;
			const quantityInSmallerUnits = data.quantity * unitConversion.ratio;

			// Check if sufficient quantity available in specified shipment
			if (quantityInSmallerUnits > shipmentResult.rows[0].quantity) {
				throw new Error("Insufficient quantity in selected shipment");
			}

			// Update shipment quantity
			await query(
				`
            	UPDATE DrugShipment
            	SET quantity = quantity - $1
            	WHERE shipment_id = $2;
        	`,
				[quantityInSmallerUnits, data.shipment_id]
			);

			// Create transaction for the drug usage
			const transactionResult = await query(
				`
                INSERT INTO DrugTransaction (
                    shipment_id, transaction_type, quantity,
                    price, created_by_user_id
                )	
                VALUES ($1, 'patient', $2, $3, $4)	
                RETURNING transaction_id;
            `,
				[
					shipmentResult.rows[0].shipment_id,
					quantityInSmallerUnits,
					data.price,
					userId
				]
			);
			
			// Create drug usage record
			const usageSql = `
                INSERT INTO DrugUsage (
                    patient_id, drug_id, transaction_id,
                    remaining_quantity, last_administered
                )
                VALUES ($1, $2, $3, $4, null)
                RETURNING *;
            `;

			const usageResult = await query(usageSql, [
				data.patient_id,
				data.drug_id,
				transactionResult.rows[0].transaction_id,
				quantityInSmallerUnits
			]);

			// Get full usage details
			const usage = await this.getDrugUsageById(
				usageResult.rows[0].usage_id
			);

			await query("COMMIT");
			return usage!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async updateDrugUsage(
		data: UpdateDrugUsageDTO
	): Promise<DrugUsageWithDetails> {
		try {
			await query("BEGIN");

			// Check if usage exists
			const existingUsage = await this.getDrugUsageById(data.usage_id);
			if (!existingUsage) {
				throw new Error("Drug usage not found");
			}

			const updates: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (data.remaining_quantity !== undefined) {
				if (data.remaining_quantity < 0) {
					throw new Error("Remaining quantity cannot be negative");
				}
				updates.push(`remaining_quantity = $${paramCount}`);
				values.push(data.remaining_quantity);
				paramCount++;
			}

			if (data.last_administered !== undefined) {
				updates.push(`last_administered = $${paramCount}`);
				values.push(data.last_administered);
				paramCount++;
			}

			if (updates.length === 0) {
				return existingUsage;
			}

			values.push(data.usage_id);
			const sql = `
                UPDATE DrugUsage
                SET ${updates.join(", ")}
                WHERE usage_id = $${paramCount}
                RETURNING *;
            `;

			await query(sql, values);

			// Get updated usage with full details
			const updatedUsage = await this.getDrugUsageById(data.usage_id);

			await query("COMMIT");
			return updatedUsage!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getPendingAdministrations(): Promise<
		Array<PendingAdministration & DrugCard & Patient>
	> {
		try {
			const sql = `
                SELECT 
                    du.usage_id,
                    du.patient_id,
                    p.name as patient_name,
                    du.drug_id,
                    dc.name as drug_name,
					du.remaining_quantity,
                    dc.frequency,
                    du.last_administered,
                    dc.unit_conversion,
                    COALESCE(
                        du.last_administered + (dc.frequency::interval),
                        CURRENT_TIMESTAMP
                    ) as next_administration
                FROM DrugUsage du
                JOIN DrugCard dc ON du.drug_id = dc.drug_id
                JOIN Patient p ON du.patient_id = p.patient_id
                WHERE 
                    du.remaining_quantity > 0
                    AND dc.is_obligatory_continuous = true
                    AND (
                        du.last_administered IS NULL
                        OR CURRENT_TIMESTAMP >= du.last_administered + (dc.frequency::interval)
                    )
                ORDER BY next_administration ASC;
            `;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getDrugUsageHistory(
		patientId?: number,
		drugId?: number
	): Promise<DrugUsageHistory[]> {
		try {
			const conditions: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (patientId !== undefined) {
				conditions.push(`du.patient_id = $${paramCount}`);
				values.push(patientId);
				paramCount++;
			}

			if (drugId !== undefined) {
				conditions.push(`du.drug_id = $${paramCount}`);
				values.push(drugId);
				paramCount++;
			}

			const whereClause =
				conditions.length > 0
					? `WHERE ${conditions.join(" AND ")}`
					: "";

			const sql = `
                SELECT 
                    du.usage_id,
                    du.patient_id,
                    p.name as patient_name,
                    du.drug_id,
                    dc.name as drug_name,
                    du.transaction_id,
                    dt.quantity as initial_quantity,
                    du.remaining_quantity,
                    dc.unit_conversion,
                    dt.timestamp as start_date,
                    du.last_administered,
                    du.remaining_quantity > 0 as is_active
                FROM DrugUsage du
                JOIN DrugCard dc ON du.drug_id = dc.drug_id
                JOIN Patient p ON du.patient_id = p.patient_id
                JOIN DrugTransaction dt ON du.transaction_id = dt.transaction_id
                ${whereClause}
                ORDER BY dt.timestamp DESC;
            `;

			const result = await query(sql, values);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getAvailableShipments(drugId: number): Promise<AvailableShipment[]> {
		try {
			const sql = `
            SELECT 
                ds.shipment_id,
                w.name as warehouse_name,
                ds.quantity,
                ds.quantity / (dc.unit_conversion->>'ratio')::integer as quantity_in_larger_unit,
                ds.buy_price, (
					SELECT json_agg(t)
					FROM (
						SELECT DISTINCT pl.name as pricelist_name, sp.pricelist_id, sp.price, sp.requires_prepayment, sp.prepayment_type, sp.prepayment_amount
						FROM ShipmentPrice sp
						LEFT JOIN Pricelist pl ON sp.pricelist_id = pl.pricelist_id
						WHERE sp.shipment_id = ds.shipment_id
					) t
				) as prices,
                ds.expiry_date,
                dc.unit_conversion
            FROM DrugShipment ds
            JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
            JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            WHERE 
                ds.drug_id = $1
                AND ds.quantity > 0
            ORDER BY ds.expiry_date ASC;
        `;
			const result = await query(sql, [drugId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}
}

export default new DrugUsageModel();
