import { query } from "./database/connection.js";
import {
	Warehouse,
	WarehouseWithStats,
	CreateWarehouseDTO
} from "../utils/types/warehouse.d.js";



export class WarehouseModel {
	async getAllWarehouses(): Promise<WarehouseWithStats[]> {
		try {
			const sql = `
                SELECT 
                    w.*,
                    COALESCE(COUNT(DISTINCT ds.shipment_id), 0) as total_shipments,
                    COALESCE(COUNT(DISTINCT ds.drug_id), 0) as total_drugs,
                    COALESCE(SUM(ds.quantity * ds.buy_price), 0) as total_stock_value
                FROM Warehouse w
                LEFT JOIN DrugShipment ds ON w.warehouse_id = ds.warehouse_id
                GROUP BY w.warehouse_id, w.name, w.location
                ORDER BY w.name;
            `;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getWarehouseById(
		warehouseId: number
	): Promise<WarehouseWithStats | null> {
		try {
			const sql = `
                SELECT 
                    w.*,
                    COALESCE(COUNT(DISTINCT ds.shipment_id), 0) as total_shipments,
                    COALESCE(COUNT(DISTINCT ds.drug_id), 0) as total_drugs,
                    COALESCE(SUM(ds.quantity * ds.buy_price), 0) as total_stock_value
                FROM Warehouse w
                LEFT JOIN DrugShipment ds ON w.warehouse_id = ds.warehouse_id
                WHERE w.warehouse_id = $1
                GROUP BY w.warehouse_id, w.name, w.location;
            `;
			const result = await query(sql, [warehouseId]);
			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	async createWarehouse(data: CreateWarehouseDTO): Promise<Warehouse> {
		try {
			const sql = `
                INSERT INTO Warehouse (name, location)
                VALUES ($1, $2)
                RETURNING *;
            `;
			const result = await query(sql, [data.name, data.location]);
			return result.rows[0];
		} catch (error) {
			throw error;
		}
	}

	async updateWarehouse(
		warehouseId: number,
		data: Partial<CreateWarehouseDTO>
	): Promise<Warehouse | null> {
		try {
			const updates: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (data.name !== undefined) {
				updates.push(`name = $${paramCount}`);
				values.push(data.name);
				paramCount++;
			}

			if (data.location !== undefined) {
				updates.push(`location = $${paramCount}`);
				values.push(data.location);
				paramCount++;
			}

			if (updates.length === 0) {
				// No updates provided, return current warehouse
				const current = await this.getWarehouseById(warehouseId);
				return current;
			}

			values.push(warehouseId);
			const sql = `
                UPDATE Warehouse
                SET ${updates.join(", ")}
                WHERE warehouse_id = $${paramCount}
                RETURNING *;
            `;

			const result = await query(sql, values);
			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	async deleteWarehouse(warehouseId: number): Promise<boolean> {
		try {
			// Check if warehouse has any shipments
			const shipmentCheck = await query(
				"SELECT COUNT(*) as count FROM DrugShipment WHERE warehouse_id = $1",
				[warehouseId]
			);

			if (parseInt(shipmentCheck.rows[0].count) > 0) {
				throw new Error(
					"Cannot delete warehouse that contains shipments"
				);
			}

			const sql =
				"DELETE FROM Warehouse WHERE warehouse_id = $1 RETURNING *;";
			const result = await query(sql, [warehouseId]);
			return result.rows.length > 0;
		} catch (error) {
			throw error;
		}
	}

	async getWarehouseInventory(warehouseId: number): Promise<any[]> {
		try {
			const sql = `
                SELECT 
                    ds.shipment_id,
                    dc.drug_id,
                    dc.name as drug_name,
                    dc.manufacturer,
                    ds.quantity,
                    ds.buy_price,
                    ds.expiry_date,
                    ds.received_date,
                    dc.unit_conversion,
                    CASE 
                        WHEN ds.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'warning'
                        WHEN ds.expiry_date <= CURRENT_DATE THEN 'expired'
                        ELSE 'ok'
                    END as expiry_status
                FROM DrugShipment ds
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                WHERE ds.warehouse_id = $1 AND ds.quantity > 0
                ORDER BY ds.expiry_date ASC, dc.name;
            `;
			const result = await query(sql, [warehouseId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getWarehouseShipments(warehouseId: number): Promise<any[]> {
		try {
			const sql = `
                SELECT 
                    ds.*,
                    dc.name as drug_name,
                    dc.manufacturer,
                    dc.unit_conversion,
                    u.username as created_by_username
                FROM DrugShipment ds
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                LEFT JOIN "User" u ON ds.created_by_user_id = u.user_id
                WHERE ds.warehouse_id = $1
                ORDER BY ds.received_date DESC;
            `;
			const result = await query(sql, [warehouseId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}
}

export default new WarehouseModel();
