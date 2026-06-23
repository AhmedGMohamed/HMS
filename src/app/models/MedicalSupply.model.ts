import { query } from "./database/connection.js";
import {
    MedicalSupply,
    CreateMedicalSupplyDTO,
    UpdateMedicalSupplyDTO,
    MedicalSupplyStock,
    MedicalSupplySearchResult
} from "../utils/types/medicalSupplies.js";

export class MedicalSupplyModel {
    async getAllMedicalSupplies(
        pagination?: { offset?: number; limit?: number; q?: string }
    ): Promise<{ rows: MedicalSupply[]; total: number }> {
        try {
            const offset = Math.max(0, pagination?.offset ?? 0)
            const limit = Math.max(1, Math.min(pagination?.limit ?? 25, 100))
            const q = pagination?.q?.trim()

            let sql: string
            const params: unknown[] = []
            if (q) {
                sql = `SELECT * FROM MedicalSupply WHERE name ILIKE %$1% ORDER BY name LIMIT $2 OFFSET $3`
                params.push(q, limit, offset)
            } else {
                sql = `SELECT * FROM MedicalSupply ORDER BY name LIMIT $1 OFFSET $2`
                params.push(limit, offset)
            }
            const countSql = q
                ? `SELECT COUNT(*) AS c FROM MedicalSupply WHERE name ILIKE %$1%`
                : `SELECT COUNT(*) AS c FROM MedicalSupply`
            
            const [result, countRes] = await Promise.all([
                query(sql, params),
                query(
                    countSql,
                    q ? [q] : []
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

    async getMedicalSupplyById(supplyId: number): Promise<MedicalSupply | null> {
        try {
            const sql = `
                SELECT * 
                FROM MedicalSupply 
                WHERE supply_id = $1;
            `;
            const result = await query(sql, [supplyId]);
            return result.rows[0] || null;
        } catch (error) {
            throw error;
        }
    }

    async createMedicalSupply(
        data: CreateMedicalSupplyDTO,
        userId: number
    ): Promise<MedicalSupply> {
        try {
            // Check for duplicate name
            const existingSupply = await query(
                "SELECT supply_id FROM MedicalSupply WHERE LOWER(name) = LOWER($1)",
                [data.name]
            );

            if (existingSupply.rows.length > 0) {
                throw new Error("Medical supply name already exists");
            }

            const sql = `
                INSERT INTO MedicalSupply (
                    name, manufacturer, provider,
                    is_obligatory_continuous, sale_quantity,
                    frequency, min_stock_alert,
                    created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
                userId
            ];

            const result = await query(sql, values);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    async updateMedicalSupply(data: UpdateMedicalSupplyDTO): Promise<MedicalSupply> {
        try {
            // Check if supply exists
            const existingSupply = await this.getMedicalSupplyById(data.supply_id);
            if (!existingSupply) {
                throw new Error("Medical supply not found");
            }

            // Check for duplicate name if name is being updated
            if (data.name) {
                const duplicateName = await query(
                    "SELECT supply_id FROM MedicalSupply WHERE LOWER(name) = LOWER($1) AND supply_id != $2",
                    [data.name, data.supply_id]
                );

                if (duplicateName.rows.length > 0) {
                    throw new Error("Medical supply name already exists");
                }
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

            if (updates.length === 0) {
                return existingSupply;
            }

            values.push(data.supply_id);
            const sql = `
                UPDATE MedicalSupply
                SET ${updates.join(", ")}
                WHERE supply_id = $${paramCount}
                RETURNING *;
            `;

            const result = await query(sql, values);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    async deleteMedicalSupply(supplyId: number): Promise<void> {
        try {
            await query("BEGIN");

            // Check if supply exists
            const existingSupply = await this.getMedicalSupplyById(supplyId);
            if (!existingSupply) {
                throw new Error("Medical supply not found");
            }

            // Check if supply has any shipments
            const shipments = await query(
                "SELECT shipment_id FROM MedicalSupplyShipment WHERE supply_id = $1",
                [supplyId]
            );

            if (shipments.rows.length > 0) {
                throw new Error("Cannot delete medical supply with existing shipments");
            }

            // Delete supply
            await query("DELETE FROM MedicalSupply WHERE supply_id = $1", [supplyId]);

            await query("COMMIT");
        } catch (error) {
            await query("ROLLBACK");
            throw error;
        }
    }

    async searchMedicalSupplies(searchTerm: string): Promise<MedicalSupplySearchResult[]> {
        try {
            const sql = `
                SELECT 
                    supply_id, name, manufacturer, provider
                FROM MedicalSupply 
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

    async getMedicalSupplySuggestions(prefix: string): Promise<MedicalSupplySearchResult[]> {
        try {
            const sql = `
                SELECT 
                    supply_id, name, manufacturer, provider
                FROM MedicalSupply 
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

    async getLowStockSupplies(): Promise<MedicalSupplyStock[]> {
        try {
            const sql = `
                WITH SupplyTotals AS (
                    SELECT 
                        ms.supply_id,
                        ms.name,
                        ms.min_stock_alert,
                        COALESCE(SUM(mss.quantity), 0) as total_quantity
                    FROM MedicalSupply ms
                    LEFT JOIN MedicalSupplyShipment mss ON ms.supply_id = mss.supply_id
                    WHERE ms.min_stock_alert IS NOT NULL
                    GROUP BY ms.supply_id, ms.name, ms.min_stock_alert
                )
                SELECT *
                FROM SupplyTotals
                WHERE total_quantity <= min_stock_alert
                ORDER BY name;
            `;
            const result = await query(sql);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }
}

export default new MedicalSupplyModel();
