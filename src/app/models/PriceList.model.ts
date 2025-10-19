import { query } from "./database/connection.js";
import {
	PriceList,
	CreatePriceListDTO,
	UpdatePriceListDTO,
	PriceListStats
} from "../utils/types/priceLists.js";

export class PriceListModel {
	async getAllPriceLists(): Promise<PriceList[]> {
		const sql = "SELECT * FROM PriceList ORDER BY name;";
		const result = await query(sql);
		return result.rows;
	}

	async getPriceListById(priceListId: number): Promise<PriceList> {
		const sql = "SELECT * FROM PriceList WHERE pricelist_id = $1;";
		const result = await query(sql, [priceListId]);

		if (result.rows.length === 0) {
			throw new Error("Price list not found");
		}

		return result.rows[0];
	}

	async createPriceList(data: CreatePriceListDTO): Promise<PriceList> {
		await query("BEGIN");
		try {
			// If this is set as default, unset any existing default
			if (data.is_default) {
				await query(
					"UPDATE PriceList SET is_default = false WHERE is_default = true;"
				);
			}

			const result = await query(
				"INSERT INTO PriceList (name, is_default) VALUES ($1, $2) RETURNING *;",
				[data.name, data.is_default]
			);

			await query("COMMIT");
			return result.rows[0];
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async updatePriceList(
		priceListId: number,
		data: UpdatePriceListDTO
	): Promise<PriceList> {
		await query("BEGIN");
		try {
			// Check if price list exists
			const existingPriceList = await this.getPriceListById(priceListId);

			if (data.is_default) {
				await query(
					"UPDATE PriceList SET is_default = false WHERE is_default = true;"
				);
			}

			const updateFields: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			if (data.name !== undefined) {
				updateFields.push(`name = $${paramCount}`);
				values.push(data.name);
				paramCount++;
			}

			if (data.is_default !== undefined) {
				updateFields.push(`is_default = $${paramCount}`);
				values.push(data.is_default);
				paramCount++;
			}

			if (updateFields.length === 0) {
				return existingPriceList;
			}

			values.push(priceListId);
			const sql = `
                UPDATE PriceList 
                SET ${updateFields.join(", ")} 
                WHERE pricelist_id = $${paramCount}
                RETURNING *;
            `;

			const result = await query(sql, values);
			await query("COMMIT");
			return result.rows[0];
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async deletePriceList(priceListId: number): Promise<void> {
		await query("BEGIN");
		try {
			// Check if it's the default price list
			const priceList = await this.getPriceListById(priceListId);

			if (priceList.is_default) {
				throw new Error("Cannot delete the default price list");
			}

			// Delete all service prices for this price list
			await query("DELETE FROM ServicePrice WHERE pricelist_id = $1;", [
				priceListId
			]);

			// Delete all shipment prices for this price list
			await query("DELETE FROM ShipmentPrice WHERE pricelist_id = $1;", [
				priceListId
			]);

			// Delete the price list
			await query("DELETE FROM PriceList WHERE pricelist_id = $1;", [
				priceListId
			]);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async getDefaultPriceList(): Promise<PriceList> {
		const sql = "SELECT * FROM PriceList WHERE is_default = true;";
		const result = await query(sql);

		if (result.rows.length === 0) {
			throw new Error("No default price list found");
		}

		return result.rows[0];
	}

	async getPriceListStats(priceListId: number): Promise<PriceListStats> {
		const sql = `
			SELECT
				(SELECT COUNT(*) FROM ServicePrice WHERE pricelist_id = $1) AS total_services,
				(SELECT COUNT(*) FROM ShipmentPrice
				 JOIN DrugShipment ds ON ds.shipment_id = shipmentprice.shipment_id
				 AND ds.quantity > 0
				 WHERE pricelist_id = $1) AS total_drugs
				`;

		const result = await query(sql, [priceListId]);
		return result.rows[0];
	}

	async getPriceListServices(
		priceListId: number
	): Promise<{ service_id: number; name: string; price: number }[]> {
		const sql = `
			SELECT
				s.service_id,
				s.name,
				sp.price
			FROM Service s
			JOIN ServicePrice sp ON s.service_id = sp.service_id
			WHERE sp.pricelist_id = $1
		`;

		const result = await query(sql, [priceListId]);
		return result.rows;
	}
}

export default new PriceListModel();
