import { query } from "./database/connection.js";
import {
	PriceList,
	PriceListWithStats,
	CreatePriceListDTO,
	UpdatePriceListDTO,
	PriceListStats,
	BulkPricesDTO,
	BulkPricesResult
} from "../utils/types/priceLists.js";

export class PriceListModel {
	async getAllPriceLists(): Promise<PriceListWithStats[]> {
		const sql = `
			SELECT
				pl.*,
				(SELECT COUNT(*) FROM ServicePrice WHERE pricelist_id = pl.pricelist_id) AS total_services,
				(SELECT COUNT(*) FROM ShipmentPrice
				 JOIN DrugShipment ds ON ds.shipment_id = shipmentprice.shipment_id
				 AND ds.quantity > 0
				 WHERE shipmentprice.pricelist_id = pl.pricelist_id) AS total_drugs,
				(SELECT COUNT(*) FROM MedicalSupplyShipmentPrice
				 JOIN MedicalSupplyShipment mss ON mss.shipment_id = medicalsupplyshipmentprice.shipment_id
				 AND mss.quantity > 0
				 WHERE medicalsupplyshipmentprice.pricelist_id = pl.pricelist_id) AS total_supplies
			FROM PriceList pl
			ORDER BY pl.name;
		`;
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

			// Block unsetting the default flag on the current default list
			if (data.is_default === false && existingPriceList.is_default) {
				throw new Error(
					"Cannot unset the default price list. Set another list as default first."
				);
			}

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
				await query("COMMIT");
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

			// Pre-check references so we can return a friendly 409 instead of a raw FK error
			const refCounts = await query(
				`SELECT
					(SELECT COUNT(*) FROM Patient WHERE pricelist_id = $1) AS patients,
					(SELECT COUNT(*) FROM PatientHistory WHERE pricelist_id = $1) AS admissions,
					(SELECT COUNT(*) FROM InsuranceCompany WHERE pricelist_id = $1) AS insurance_companies;`,
				[priceListId]
			);
			const { patients, admissions, insurance_companies } =
				refCounts.rows[0];
			if (
				Number(patients) +
					Number(admissions) +
					Number(insurance_companies) >
				0
			) {
				throw new Error(
					`Cannot delete this price list: ${patients} patient(s), ${admissions} admission(s), ${insurance_companies} insurance company(ies) reference it.`
				);
			}

			// Delete all service prices for this price list
			await query("DELETE FROM ServicePrice WHERE pricelist_id = $1;", [
				priceListId
			]);

			// Delete all shipment prices for this price list
			await query("DELETE FROM ShipmentPrice WHERE pricelist_id = $1;", [
				priceListId
			]);

			// Delete all medical supply shipment prices for this price list
			await query(
				"DELETE FROM MedicalSupplyShipmentPrice WHERE pricelist_id = $1;",
				[priceListId]
			);

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
				 WHERE pricelist_id = $1) AS total_drugs,
				(SELECT COUNT(*) FROM MedicalSupplyShipmentPrice
				 JOIN MedicalSupplyShipment mss ON mss.shipment_id = medicalsupplyshipmentprice.shipment_id
				 AND mss.quantity > 0
				 WHERE pricelist_id = $1) AS total_supplies
				`;

		const result = await query(sql, [priceListId]);
		return result.rows[0];
	}

	// Transactional bulk price-set for one price list.
	// An entry with price: null removes that (entity, pricelist) price row;
	// otherwise the price is upserted. Other lists' prices are never touched.
	async setPricesForList(
		priceListId: number,
		data: BulkPricesDTO
	): Promise<BulkPricesResult> {
		await this.getPriceListById(priceListId);

		await query("BEGIN");
		try {
			let removedPrices = 0;

			for (const entry of data.services ?? []) {
				if (!Number.isInteger(entry.service_id)) {
					throw new Error(
						"Invalid price data: service_id is required for each service entry"
					);
				}
				if (!("price" in entry)) {
					throw new Error(
						"Invalid price data: price is required for each service entry"
					);
				}
				if (entry.price === null) {
					const result = await query(
						"DELETE FROM ServicePrice WHERE service_id = $1 AND pricelist_id = $2;",
						[entry.service_id, priceListId]
					);
					removedPrices += result.rowCount ?? 0;
					continue;
				}
				this.validateUpsertPrice(entry.price, "service", entry.service_id);
				const requiresPrepayment = entry.requires_prepayment === true;
				let prepaymentType = entry.prepayment_type ?? null;
				let prepaymentAmount = entry.prepayment_amount ?? null;
				if (requiresPrepayment) {
					this.validatePrepayment(prepaymentType, prepaymentAmount);
				} else {
					prepaymentType = null;
					prepaymentAmount = null;
				}
				await query(
					`INSERT INTO ServicePrice (
						service_id, pricelist_id, price,
						requires_prepayment, prepayment_type, prepayment_amount
					) VALUES ($1, $2, $3, $4, $5, $6)
					ON CONFLICT (service_id, pricelist_id)
					DO UPDATE SET
						price = EXCLUDED.price,
						requires_prepayment = EXCLUDED.requires_prepayment,
						prepayment_type = EXCLUDED.prepayment_type,
						prepayment_amount = EXCLUDED.prepayment_amount;`,
					[
						entry.service_id,
						priceListId,
						entry.price,
						requiresPrepayment,
						prepaymentType,
						prepaymentAmount
					]
				);
			}

			for (const entry of data.drug_shipments ?? []) {
				removedPrices += await this.upsertOrRemoveShipmentPrice(
					"ShipmentPrice",
					entry.shipment_id,
					entry,
					priceListId
				);
			}

			for (const entry of data.supply_shipments ?? []) {
				removedPrices += await this.upsertOrRemoveShipmentPrice(
					"MedicalSupplyShipmentPrice",
					entry.shipment_id,
					entry,
					priceListId
				);
			}

			await query("COMMIT");
			const stats = await this.getPriceListStats(priceListId);
			return { ...stats, removed_prices: removedPrices };
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	// Shared upsert/remove logic for ShipmentPrice and MedicalSupplyShipmentPrice.
	private async upsertOrRemoveShipmentPrice(
		priceTable: "ShipmentPrice" | "MedicalSupplyShipmentPrice",
		shipmentId: unknown,
		entry: {
			price?: number | null;
			requires_prepayment?: boolean;
			prepayment_type?: "fixed" | "percentage" | null;
			prepayment_amount?: number | null;
		},
		priceListId: number
	): Promise<number> {
		if (!Number.isInteger(shipmentId)) {
			throw new Error(
				`Invalid price data: shipment_id is required for each ${priceTable} entry`
			);
		}
		if (!("price" in entry)) {
			throw new Error(
				"Invalid price data: price is required for each shipment entry"
			);
		}
		if (entry.price === null) {
			const result = await query(
				`DELETE FROM ${priceTable} WHERE shipment_id = $1 AND pricelist_id = $2;`,
				[shipmentId, priceListId]
			);
			return result.rowCount ?? 0;
		}
		this.validateUpsertPrice(entry.price, "shipment", shipmentId);
		const requiresPrepayment = entry.requires_prepayment === true;
		let prepaymentType = entry.prepayment_type ?? null;
		let prepaymentAmount = entry.prepayment_amount ?? null;
		if (requiresPrepayment) {
			this.validatePrepayment(prepaymentType, prepaymentAmount);
		} else {
			prepaymentType = null;
			prepaymentAmount = null;
		}
		await query(
			`INSERT INTO ${priceTable} (
				shipment_id, pricelist_id, price,
				requires_prepayment, prepayment_type, prepayment_amount
			) VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (shipment_id, pricelist_id)
			DO UPDATE SET
				price = EXCLUDED.price,
				requires_prepayment = EXCLUDED.requires_prepayment,
				prepayment_type = EXCLUDED.prepayment_type,
				prepayment_amount = EXCLUDED.prepayment_amount;`,
			[
				shipmentId,
				priceListId,
				entry.price,
				requiresPrepayment,
				prepaymentType,
				prepaymentAmount
			]
		);
		return 0;
	}

	// Mirrors each domain's existing rules: services allow 0, shipments require > 0.
	private validateUpsertPrice(
		price: unknown,
		entityLabel: "service" | "shipment",
		entityId: unknown
	): void {
		if (typeof price !== "number" || !Number.isFinite(price)) {
			throw new Error(
				`Invalid price data: price must be a number (for ${entityLabel} ${entityId})`
			);
		}
		if (entityLabel === "service" && price < 0) {
			throw new Error(
				"Invalid price data: service price must be greater than or equal to 0"
			);
		}
		if (entityLabel === "shipment" && price <= 0) {
			throw new Error(
				"Invalid price data: shipment price must be greater than 0"
			);
		}
	}

	// Same rules as DrugShipment.model.updateShipment prepayment validation.
	private validatePrepayment(
		prepaymentType: unknown,
		prepaymentAmount: unknown
	): void {
		if (prepaymentType !== "fixed" && prepaymentType !== "percentage") {
			throw new Error(
				"Invalid prepayment data: prepayment_type and prepayment_amount are required when prepayment is required"
			);
		}
		if (
			typeof prepaymentAmount !== "number" ||
			!Number.isFinite(prepaymentAmount)
		) {
			throw new Error(
				"Invalid prepayment data: prepayment_type and prepayment_amount are required when prepayment is required"
			);
		}
		if (
			prepaymentType === "percentage" &&
			(prepaymentAmount < 0 || prepaymentAmount > 100)
		) {
			throw new Error(
				"Prepayment percentage must be between 0 and 100"
			);
		}
		if (prepaymentType === "fixed" && prepaymentAmount < 0) {
			throw new Error(
				"Prepayment amount must be greater than or equal to 0"
			);
		}
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
