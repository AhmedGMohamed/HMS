// src/app/models/DrugTransaction.model.ts
import { query } from "./database/connection.js";
import {
	CreateDrugTransactionDTO,
	TransactionWithDetails,
	TransactionSummary,
	DrugTransactionFilters
} from "../utils/types/drugs.js";

export class DrugTransactionModel {
	async getAllTransactions(): Promise<TransactionWithDetails[]> {
		try {
			const sql = `
                SELECT 
                    dt.*,
                    ds.drug_id,
                    dc.name as drug_name,
                    ds.warehouse_id,
                    w.name as warehouse_name,
                    dc.unit_conversion,
                    ds.buy_price as shipment_buy_price,
                    (dt.price * dt.quantity - ds.buy_price * dt.quantity) as profit
                FROM DrugTransaction dt
                JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
                ORDER BY dt.timestamp DESC;
            `;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getTransactionById(
		transactionId: number
	): Promise<TransactionWithDetails | null> {
		try {
			const sql = `
                SELECT 
                    dt.*,
                    ds.drug_id,
                    dc.name as drug_name,
                    ds.warehouse_id,
                    w.name as warehouse_name,
                    dc.unit_conversion,
                    ds.buy_price as shipment_buy_price,
                    (dt.price * dt.quantity - ds.buy_price * dt.quantity) as profit
                FROM DrugTransaction dt
                JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
                WHERE dt.transaction_id = $1;
            `;
			const result = await query(sql, [transactionId]);
			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	async createTransaction(
		data: CreateDrugTransactionDTO,
		userId: number
	): Promise<TransactionWithDetails> {
		try {
			await query("BEGIN");

			// Get shipment details to validate and convert quantity
			const shipmentResult = await query(
				`
                SELECT 
                    ds.*,
                    dc.unit_conversion
                FROM DrugShipment ds
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                WHERE ds.shipment_id = $1;
            `,
				[data.shipment_id]
			);

			if (shipmentResult.rows.length === 0) {
				throw new Error("Shipment not found");
			}

			const shipment = shipmentResult.rows[0];

			// Check if enough quantity available
			if (data.quantity > shipment.quantity) {
				throw new Error("Insufficient quantity in shipment");
			}

			// Create transaction
			const transactionSql = `
                INSERT INTO DrugTransaction (
                    shipment_id, transaction_type, quantity,
                    price, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
            `;

			const transactionResult = await query(transactionSql, [
				data.shipment_id,
				data.transaction_type,
				data.quantity,
				data.price,
				userId
			]);

			// Update shipment quantity
			await query(
				`
                UPDATE DrugShipment
                SET quantity = quantity - $1
                WHERE shipment_id = $2;
            `,
				[data.quantity, data.shipment_id]
			);

			// Get full transaction details
			const transaction = await this.getTransactionById(
				transactionResult.rows[0].transaction_id
			);

			await query("COMMIT");
			return transaction!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getTransactionsByFilters(
		filters: DrugTransactionFilters
	): Promise<TransactionWithDetails[]> {
		try {
			const conditions: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (filters.startDate) {
				conditions.push(`dt.timestamp >= $${paramCount}`);
				values.push(new Date(filters.startDate));
				paramCount++;
			}

			if (filters.endDate) {
				conditions.push(`dt.timestamp <= $${paramCount}`);
				values.push(new Date(filters.endDate));
				paramCount++;
			}

			if (filters.transactionType) {
				conditions.push(`dt.transaction_type = $${paramCount}`);
				values.push(filters.transactionType);
				paramCount++;
			}

			if (filters.drugId) {
				conditions.push(`ds.drug_id = $${paramCount}`);
				values.push(filters.drugId);
				paramCount++;
			}

			if (filters.warehouseId) {
				conditions.push(`ds.warehouse_id = $${paramCount}`);
				values.push(filters.warehouseId);
				paramCount++;
			}

			const whereClause =
				conditions.length > 0
					? `WHERE ${conditions.join(" AND ")}`
					: "";

			const sql = `
                SELECT 
                    dt.*,
                    ds.drug_id,
                    dc.name as drug_name,
                    ds.warehouse_id,
                    w.name as warehouse_name,
                    dc.unit_conversion,
                    ds.buy_price as shipment_buy_price,
                    (dt.price * dt.quantity - ds.buy_price * dt.quantity) as profit
                FROM DrugTransaction dt
                JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
                ${whereClause}
                ORDER BY dt.timestamp DESC;
            `;

			const result = await query(sql, values);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getTransactionSummary(
		filters: DrugTransactionFilters
	): Promise<TransactionSummary> {
		try {
			const conditions: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (filters.startDate) {
				conditions.push(`dt.timestamp >= $${paramCount}`);
				values.push(new Date(filters.startDate));
				paramCount++;
			}

			if (filters.endDate) {
				conditions.push(`dt.timestamp <= $${paramCount}`);
				values.push(new Date(filters.endDate));
				paramCount++;
			}

			if (filters.transactionType) {
				conditions.push(`dt.transaction_type = $${paramCount}`);
				values.push(filters.transactionType);
				paramCount++;
			}

			if (filters.drugId) {
				conditions.push(`ds.drug_id = $${paramCount}`);
				values.push(filters.drugId);
				paramCount++;
			}

			if (filters.warehouseId) {
				conditions.push(`ds.warehouse_id = $${paramCount}`);
				values.push(filters.warehouseId);
				paramCount++;
			}

			const whereClause =
				conditions.length > 0
					? `WHERE ${conditions.join(" AND ")}`
					: "";

			const sql = `
                SELECT 
                    SUM(dt.quantity) as total_quantity,
                    SUM(dt.price * dt.quantity) as total_sales,
                    SUM(ds.buy_price * dt.quantity) as total_cost,
                    SUM(dt.price * dt.quantity - ds.buy_price * dt.quantity) as total_profit,
                    COUNT(*) as transaction_count
                FROM DrugTransaction dt
                JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
                ${whereClause};
            `;

			const result = await query(sql, values);
			return {
				total_quantity: parseInt(result.rows[0].total_quantity) || 0,
				total_sales: parseFloat(result.rows[0].total_sales) || 0,
				total_cost: parseFloat(result.rows[0].total_cost) || 0,
				total_profit: parseFloat(result.rows[0].total_profit) || 0,
				transaction_count:
					parseInt(result.rows[0].transaction_count) || 0
			};
		} catch (error) {
			throw error;
		}
	}
}

export default new DrugTransactionModel();
