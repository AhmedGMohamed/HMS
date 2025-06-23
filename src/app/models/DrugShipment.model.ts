// src/app/models/DrugShipment.model.ts
import { query } from "./database/connection.js";
import {
	CreateDrugShipmentDTO,
	UpdateDrugShipmentDTO,
	ShipmentWithDrugInfo,
	ShipmentStock,
	ShipmentPrice,
	Warehouse
} from "../utils/types/drugs.js";

export class DrugShipmentModel {
	async getAllShipments(): Promise<
		Array<ShipmentWithDrugInfo & { prices: ShipmentPrice[] }>
	> {
		try {
			const sql = `
                SELECT 
                    ds.*,
                    dc.name as drug_name,
                    w.name as warehouse_name,
                    dc.unit_conversion, (
					SELECT json_agg(t)
					FROM (
						SELECT DISTINCT sp.pricelist_id, sp.price, sp.requires_prepayment, sp.prepayment_type, sp.prepayment_amount
						FROM ShipmentPrice sp
						WHERE sp.shipment_id = dc.drug_id
					) t
				) as prices 
                FROM DrugShipment ds
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
                ORDER BY ds.received_date DESC;
            `;
			const result = await query(sql);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getShipmentById(
		shipmentId: number
	): Promise<(ShipmentWithDrugInfo & { prices: ShipmentPrice[] }) | null> {
		try {
			const sql = `
                SELECT 
                    ds.*,
                    dc.name as drug_name,
                    w.name as warehouse_name,
                    dc.unit_conversion, (
					SELECT json_agg(t)
					FROM (
						SELECT DISTINCT sp.pricelist_id, sp.price, sp.requires_prepayment, sp.prepayment_type, sp.prepayment_amount
						FROM ShipmentPrice sp
						WHERE sp.shipment_id = ds.shipment_id
					) t
				) as prices
                FROM DrugShipment ds
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
                WHERE ds.shipment_id = $1;
            `;
			const result = await query(sql, [shipmentId]);
			return result.rows[0] || null;
		} catch (error) {
			throw error;
		}
	}

	async createShipment(
		data: CreateDrugShipmentDTO,
		userId: number
	): Promise<ShipmentWithDrugInfo & { prices: ShipmentPrice[] }> {
		try {
			await query("BEGIN");

			// Get drug details to validate and convert quantity
			const drugResult = await query(
				"SELECT unit_conversion FROM DrugCard WHERE drug_id = $1",
				[data.drug_id]
			);

			if (drugResult.rows.length === 0) {
				throw new Error("Drug not found");
			}

			// Verify warehouse exists
			const warehouseResult = await query(
				"SELECT warehouse_id FROM Warehouse WHERE warehouse_id = $1",
				[data.warehouse_id]
			);

			if (warehouseResult.rows.length === 0) {
				throw new Error("Warehouse not found");
			}

			// Convert quantity to smaller units using ratio
			const unitConversion = drugResult.rows[0].unit_conversion;
			const quantityInSmallerUnits = data.quantity * unitConversion.ratio;

			const sql = `
                INSERT INTO DrugShipment (
                    drug_id, warehouse_id, quantity,
                    buy_price, expiry_date,
                    received_date, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *;
            `;

			const values = [
				data.drug_id,
				data.warehouse_id,
				quantityInSmallerUnits,
				data.buy_price,
				new Date(data.expiry_date),
				data.received_date ? new Date(data.received_date) : new Date(),
				userId
			];

			const result = await query(sql, values);
			const shipment = result.rows[0];

			// Get full shipment info
			const fullShipment = await this.getShipmentById(
				shipment.shipment_id
			);

			if (data.prices) {
				for (const price of data.prices) {
					await query(
						"INSERT INTO ShipmentPrice (pricelist_id, shipment_id, price, requires_prepayment, prepayment_type, prepayment_amount) VALUES ($1, $2, $3, $4, $5, $6)",
						[
							price.pricelist_id,
							fullShipment!.shipment_id,
							price.price,
							price.requires_prepayment,
							price.prepayment_type,
							price.prepayment_amount
						]
					);
				}
			}

			await query("COMMIT");
			return fullShipment!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async updateShipment(
		data: UpdateDrugShipmentDTO
	): Promise<ShipmentWithDrugInfo & { prices: ShipmentPrice[] }> {
		try {
			await query("BEGIN");

			// Check if shipment exists and get current drug info
			const currentShipment = await this.getShipmentById(
				data.shipment_id
			);
			if (!currentShipment) {
				throw new Error("Shipment not found");
			}

			// Verify warehouse if changing
			if (data.warehouse_id) {
				const warehouseResult = await query(
					"SELECT warehouse_id FROM Warehouse WHERE warehouse_id = $1",
					[data.warehouse_id]
				);

				if (warehouseResult.rows.length === 0) {
					throw new Error("Warehouse not found");
				}
			}

			const updates: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (data.warehouse_id !== undefined) {
				updates.push(`warehouse_id = $${paramCount}`);
				values.push(data.warehouse_id);
				paramCount++;
			}

			if (data.quantity !== undefined) {
				// Convert quantity to smaller units
				const quantityInSmallerUnits =
					data.quantity * currentShipment.unit_conversion.ratio;
				updates.push(`quantity = $${paramCount}`);
				values.push(quantityInSmallerUnits);
				paramCount++;
			}

			if (data.buy_price !== undefined) {
				updates.push(`buy_price = $${paramCount}`);
				values.push(data.buy_price);
				paramCount++;
			}

			if (data.expiry_date !== undefined) {
				updates.push(`expiry_date = $${paramCount}`);
				values.push(new Date(data.expiry_date));
				paramCount++;
			}

			if (updates.length === 0) {
				return currentShipment;
			}

			values.push(data.shipment_id);
			const sql = `
                UPDATE DrugShipment
                SET ${updates.join(", ")}
                WHERE shipment_id = $${paramCount}
                RETURNING *;
            `;

			await query(sql, values);

			if (data.prices !== undefined) {
				for (const price of data.prices) {
					await query(
						"DELETE FROM ShipmentPrice WHERE shipment_id = $1",
						[data.shipment_id]
					);
					await query(
						"INSERT INTO ShipmentPrice (pricelist_id, shipment_id, price, requires_prepayment, prepayment_type, prepayment_amount) VALUES ($1, $2, $3, $4, $5, $6)",
						[
							price.pricelist_id,
							data.shipment_id,
							price.price,
							price.requires_prepayment,
							price.prepayment_type,
							price.prepayment_amount
						]
					);
				}
			}

			// Get updated shipment with full info
			const updatedShipment = await this.getShipmentById(
				data.shipment_id
			);

			await query("COMMIT");
			return updatedShipment!;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async deleteShipment(shipmentId: number): Promise<void> {
		try {
			await query("BEGIN");

			// Check if shipment exists
			const shipment = await this.getShipmentById(shipmentId);
			if (!shipment) {
				throw new Error("Shipment not found");
			}

			// Check if shipment has any transactions
			const transactions = await query(
				"SELECT transaction_id FROM DrugTransaction WHERE shipment_id = $1",
				[shipmentId]
			);

			if (transactions.rows.length > 0) {
				throw new Error(
					"Cannot delete shipment with existing transactions"
				);
			}

			// Delete shipment
			await query("DELETE FROM DrugShipment WHERE shipment_id = $1", [
				shipmentId
			]);

			await query("DELETE FROM ShipmentPrice WHERE shipment_id = $1", [
				shipmentId
			]);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getShipmentsByDrug(drugId: number): Promise<Array<ShipmentStock & { prices: ShipmentPrice[] }>> {
		try {
			const sql = `
                SELECT 
                    ds.*,
                    dc.name as drug_name,
                    w.name as warehouse_name,
                    dc.unit_conversion,
					ds.quantity,
                    ds.quantity / (dc.unit_conversion->>'ratio')::double precision as quantity_in_larger_unit, (
					SELECT json_agg(t)
					FROM (
						SELECT DISTINCT sp.pricelist_id, sp.price, sp.requires_prepayment, sp.prepayment_type, sp.prepayment_amount
						FROM ShipmentPrice sp
						WHERE sp.shipment_id = ds.shipment_id
					) t
				) as prices
                FROM DrugShipment ds
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
                WHERE ds.drug_id = $1 AND ds.quantity > 0
                ORDER BY ds.expiry_date ASC;
            `;
			const result = await query(sql, [drugId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getShipmentsByWarehouse(
		warehouseId: number
	): Promise<Array<ShipmentStock& { prices: ShipmentPrice[] }>> {
		try {
			const sql = `
                SELECT 
                    ds.*,
                    dc.name as drug_name,
                    w.name as warehouse_name,
                    dc.unit_conversion,
					ds.quantity,
                    ds.quantity / (dc.unit_conversion->>'ratio')::integer as quantity_in_larger_unit, (
					SELECT json_agg(t)
					FROM (
						SELECT DISTINCT sp.pricelist_id, sp.price, sp.requires_prepayment, sp.prepayment_type, sp.prepayment_amount
						FROM ShipmentPrice sp
						WHERE sp.shipment_id = ds.shipment_id
					) t
				) as prices
                FROM DrugShipment ds
                JOIN DrugCard dc ON ds.drug_id = dc.drug_id
                JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
                WHERE ds.warehouse_id = $1 AND ds.quantity > 0
                ORDER BY dc.name, ds.expiry_date ASC;
            `;
			const result = await query(sql, [warehouseId]);
			return result.rows;
		} catch (error) {
			throw error;
		}
	}

	async getWarehouses(): Promise<Warehouse[]> {
		try {
			const result = await query("SELECT * FROM Warehouse");
			return result.rows;
		} catch (error) {
			throw error;
		}
	}
}

export default new DrugShipmentModel();
