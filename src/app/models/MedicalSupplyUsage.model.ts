// src/app/models/MedicalSupplyUsage.model.ts
import { query } from "./database/connection.js";
import {
    MedicalSupplyUsageWithDetails,
    CreateMedicalSupplyUsageDTO,
    UpdateMedicalSupplyUsageDTO,
    PendingAdministration,
    AvailableShipment,
    MedicalSupplyUsageHistory,
    MedicalSupply
} from "../utils/types/medicalSupplies.js";
import { Patient } from "../utils/types/patients.js";
import PatientModel from "./Patient.model.js";

export class MedicalSupplyUsageModel {
    async getAllMedicalSupplyUsages(): Promise<MedicalSupplyUsageWithDetails[]> {
        try {
            const sql = `
                SELECT 
                    msu.*,
                    ms.name as supply_name,
                    p.name as patient_name,
                    ms.frequency,
                    ms.is_obligatory_continuous
                FROM MedicalSupplyUsage msu
                JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
                JOIN Patient p ON msu.patient_id = p.patient_id
                ORDER BY p.name, ms.name;
            `;
            const result = await query(sql);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    async getMedicalSupplyUsageById(
        usageId: number
    ): Promise<MedicalSupplyUsageWithDetails | null> {
        try {
            const sql = `
                SELECT 
                    msu.*,
                    ms.name as supply_name,
                    p.name as patient_name,
                    ms.frequency,
                    ms.is_obligatory_continuous
                FROM MedicalSupplyUsage msu
                JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
                JOIN Patient p ON msu.patient_id = p.patient_id
                WHERE msu.usage_id = $1;
            `;
            const result = await query(sql, [usageId]);
            return result.rows[0] || null;
        } catch (error) {
            throw error;
        }
    }

    async createMedicalSupplyUsage(
        data: CreateMedicalSupplyUsageDTO,
        userId: number
    ): Promise<MedicalSupplyUsageWithDetails> {
        try {
            await query("BEGIN");

            // Get supply details
            const supplyResult = await query(
                `
                SELECT frequency, is_obligatory_continuous 
                FROM MedicalSupply 
                WHERE supply_id = $1
            `,
                [data.supply_id]
            );

            if (supplyResult.rows.length === 0) {
                throw new Error("Medical supply not found");
            }

            // Verify patient exists
            const patientResult = await query(
                "SELECT patient_id FROM Patient WHERE patient_id = $1",
                [data.patient_id]
            );

            if (patientResult.rows.length === 0) {
                throw new Error("Patient not found");
            }

            // Verify shipment exists and belongs to the correct supply
            const shipmentResult = await query(
                `
            	SELECT shipment_id, quantity 
            	FROM MedicalSupplyShipment 
            	WHERE shipment_id = $1 AND supply_id = $2
        	`,
                [data.shipment_id, data.supply_id]
            );

            if (shipmentResult.rows.length === 0) {
                throw new Error("Invalid shipment for this medical supply");
            }

            // Check if sufficient quantity available in specified shipment
            if (data.quantity > shipmentResult.rows[0].quantity) {
                throw new Error("Insufficient quantity in selected shipment");
            }

            // Update shipment quantity
            await query(
                `
            	UPDATE MedicalSupplyShipment
            	SET quantity = quantity - $1
            	WHERE shipment_id = $2;
        	`,
                [data.quantity, data.shipment_id]
            );

            // Create transaction for the supply usage
            const transactionResult = await query(
                `
                INSERT INTO MedicalSupplyTransaction (
                    shipment_id, transaction_type, quantity,
                    price, created_by_user_id
                )	
                VALUES ($1, 'patient', $2, $3, $4)	
                RETURNING transaction_id;
            `,
                [
                    shipmentResult.rows[0].shipment_id,
                    data.quantity,
                    data.price,
                    userId
                ]
            );

            // Create supply usage record
            const usageSql = `
                INSERT INTO MedicalSupplyUsage (
                    patient_id, supply_id, transaction_id, patient_history_id,
                    remaining_quantity, last_administered
                )
                VALUES ($1, $2, $3, $4, $5, null)
                RETURNING *;
            `;

            const usageResult = await query(usageSql, [
                data.patient_id,
                data.supply_id,
                transactionResult.rows[0].transaction_id,
                data.patient_history_id,
                data.quantity
            ]);

            // Get full usage details
            const usage = await this.getMedicalSupplyUsageById(
                usageResult.rows[0].usage_id
            );

            await query("COMMIT");
            return usage!;
        } catch (error) {
            await query("ROLLBACK");
            throw error;
        }
    }

    async updateMedicalSupplyUsage(
        data: UpdateMedicalSupplyUsageDTO
    ): Promise<MedicalSupplyUsageWithDetails> {
        try {
            await query("BEGIN");

            // Check if usage exists
            const existingUsage = await this.getMedicalSupplyUsageById(data.usage_id);
            if (!existingUsage) {
                throw new Error("Medical supply usage not found");
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
                UPDATE MedicalSupplyUsage
                SET ${updates.join(", ")}
                WHERE usage_id = $${paramCount}
                RETURNING *;
            `;

            await query(sql, values);

            // Get updated usage with full details
            const updatedUsage = await this.getMedicalSupplyUsageById(data.usage_id);

            await query("COMMIT");
            return updatedUsage!;
        } catch (error) {
            await query("ROLLBACK");
            throw error;
        }
    }

    async getPendingAdministrations(): Promise<
        Array<PendingAdministration & MedicalSupply & Patient>
    > {
        try {
            const sql = `
                SELECT 
                    msu.usage_id,
                    msu.patient_id,
                    p.name as patient_name,
                    msu.supply_id,
                    ms.name as supply_name,
					msu.remaining_quantity,
                    ms.frequency,
                    msu.last_administered,
                    COALESCE(
                        msu.last_administered + (ms.frequency::interval),
                        CURRENT_TIMESTAMP
                    ) as next_administration
                FROM MedicalSupplyUsage msu
                JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
                JOIN Patient p ON msu.patient_id = p.patient_id
                WHERE 
                    msu.remaining_quantity > 0
                    AND ms.is_obligatory_continuous = true
                    AND (
                        msu.last_administered IS NULL
                        OR CURRENT_TIMESTAMP >= msu.last_administered + (ms.frequency::interval)
                    )
                ORDER BY next_administration ASC;
            `;
            const result = await query(sql);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    async getMedicalSupplyUsageHistory(
        patientId?: number,
        supplyId?: number
    ): Promise<MedicalSupplyUsageHistory[]> {
        try {
            const conditions: string[] = [];
            const values: any[] = [];
            let paramCount = 1;

            if (patientId !== undefined) {
                conditions.push(`msu.patient_id = $${paramCount}`);
                values.push(patientId);
                paramCount++;
            }

            if (supplyId !== undefined) {
                conditions.push(`msu.supply_id = $${paramCount}`);
                values.push(supplyId);
                paramCount++;
            }

            const whereClause =
                conditions.length > 0
                    ? `WHERE ${conditions.join(" AND ")}`
                    : "";

            const sql = `
                SELECT 
                    msu.usage_id,
                    msu.patient_id,
                    p.name as patient_name,
                    msu.supply_id,
                    ms.name as supply_name,
                    msu.transaction_id,
                    mst.quantity as initial_quantity,
                    msu.remaining_quantity,
                    mst.timestamp as start_date,
                    msu.last_administered,
                    msu.remaining_quantity > 0 as is_active
                FROM MedicalSupplyUsage msu
                JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
                JOIN Patient p ON msu.patient_id = p.patient_id
                JOIN MedicalSupplyTransaction mst ON msu.transaction_id = mst.transaction_id
                ${whereClause}
                ORDER BY mst.timestamp DESC;
            `;

            const result = await query(sql, values);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    async getAvailableShipments(supplyId: number): Promise<AvailableShipment[]> {
        try {
            const sql = `
            SELECT 
                mss.shipment_id,
                w.name as warehouse_name,
                mss.quantity,
                mss.buy_price, (
					SELECT json_agg(t)
					FROM (
						SELECT DISTINCT pl.name as pricelist_name, mssp.pricelist_id, mssp.price, mssp.requires_prepayment, mssp.prepayment_type, mssp.prepayment_amount
						FROM MedicalSupplyShipmentPrice mssp
						LEFT JOIN Pricelist pl ON mssp.pricelist_id = pl.pricelist_id
						WHERE mssp.shipment_id = mss.shipment_id
					) t
				) as prices,
                mss.expiry_date
            FROM MedicalSupplyShipment mss
            JOIN Warehouse w ON mss.warehouse_id = w.warehouse_id
            WHERE 
                mss.supply_id = $1
                AND mss.quantity > 0
            ORDER BY mss.expiry_date ASC NULLS LAST;
        `;
            const result = await query(sql, [supplyId]);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }
}

export default new MedicalSupplyUsageModel();
