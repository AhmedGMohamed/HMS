import { Request, Response } from "express";
import { query } from "../models/database/connection.js";

export class MedicalSupplyShipmentController {
    async getAllShipments(_req: Request, res: Response) {
        try {
            const result = await query(`
				SELECT mss.*, w.name as warehouse_name, ms.name as supply_name
				FROM MedicalSupplyShipment mss
				JOIN Warehouse w ON mss.warehouse_id = w.warehouse_id
				JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
				ORDER BY mss.received_date DESC
			`);
            res.json(result.rows);
        } catch (error) {
            console.error("Error fetching shipments:", error);
            res.status(500).json({ error: "Failed to fetch shipments" });
        }
    }

    async getShipmentById(req: Request, res: Response) {
        try {
            const shipmentId = parseInt(req.params.id);
            const result = await query(
                `
				SELECT mss.*, w.name as warehouse_name, ms.name as supply_name
				FROM MedicalSupplyShipment mss
				JOIN Warehouse w ON mss.warehouse_id = w.warehouse_id
				JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
				WHERE mss.shipment_id = $1
			`,
                [shipmentId]
            );

            if (result.rows.length === 0) {
                res.status(404).json({ error: "Shipment not found" });
                return;
            }

            // Get prices for this shipment
            const pricesResult = await query(
                `SELECT pricelist_id, price FROM MedicalSupplyShipmentPrice WHERE shipment_id = $1`,
                [shipmentId]
            );

            const shipment = {
                ...result.rows[0],
                prices: pricesResult.rows
            };

            res.json(shipment);
        } catch (error) {
            console.error("Error fetching shipment:", error);
            res.status(500).json({ error: "Failed to fetch shipment" });
        }
    }

    async createShipment(req: Request, res: Response) {
        try {
            const { supply_id, warehouse_id, quantity, buy_price, expiry_date, prices } = req.body;
            const userId = (req as any).user.userId;

            // Validate required fields
            if (!supply_id || !warehouse_id || !quantity || !buy_price || !prices) {
                res.status(400).json({ error: "Missing required fields" });
                return;
            }

            await query("BEGIN");

            // Create shipment
            const shipmentResult = await query(
                `
				INSERT INTO MedicalSupplyShipment (supply_id, warehouse_id, buy_quantity, quantity, buy_price, expiry_date, created_by_user_id)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING *
			`,
                [supply_id, warehouse_id, quantity, quantity, buy_price, expiry_date, userId]
            );

            const shipmentId = shipmentResult.rows[0].shipment_id;

            // Create prices for each price list
            for (const price of prices) {
                await query(
                    `INSERT INTO MedicalSupplyShipmentPrice (shipment_id, pricelist_id, price) VALUES ($1, $2, $3)`,
                    [shipmentId, price.pricelist_id, price.price]
                );
            }

            await query("COMMIT");

            res.status(201).json(shipmentResult.rows[0]);
        } catch (error: any) {
            await query("ROLLBACK");
            console.error("Error creating shipment:", error);
            res.status(500).json({ error: "Failed to create shipment" });
        }
    }

    async updateShipment(req: Request, res: Response) {
        try {
            const shipmentId = parseInt(req.params.id);
            const { warehouse_id, quantity, buy_price, expiry_date, prices } = req.body;

            await query("BEGIN");

            // Update shipment
            const result = await query(
                `
				UPDATE MedicalSupplyShipment
				SET warehouse_id = $1, quantity = $2, buy_price = $3, expiry_date = $4
				WHERE shipment_id = $5
				RETURNING *
			`,
                [warehouse_id, quantity, buy_price, expiry_date, shipmentId]
            );

            if (result.rows.length === 0) {
                await query("ROLLBACK");
                res.status(404).json({ error: "Shipment not found" });
                return;
            }

            // Update prices
            if (prices) {
                await query(`DELETE FROM MedicalSupplyShipmentPrice WHERE shipment_id = $1`, [shipmentId]);

                for (const price of prices) {
                    await query(
                        `INSERT INTO MedicalSupplyShipmentPrice (shipment_id, pricelist_id, price) VALUES ($1, $2, $3)`,
                        [shipmentId, price.pricelist_id, price.price]
                    );
                }
            }

            await query("COMMIT");

            res.json(result.rows[0]);
        } catch (error: any) {
            await query("ROLLBACK");
            console.error("Error updating shipment:", error);
            res.status(500).json({ error: "Failed to update shipment" });
        }
    }

    async deleteShipment(req: Request, res: Response) {
        try {
            const shipmentId = parseInt(req.params.id);

            // Check if shipment has been used
            const usageCheck = await query(
                `SELECT COUNT(*) as count FROM MedicalSupplyTransaction WHERE shipment_id = $1`,
                [shipmentId]
            );

            if (parseInt(usageCheck.rows[0].count) > 0) {
                res.status(400).json({
                    error: "Cannot delete shipment that has been used in transactions"
                });
                return;
            }

            await query("BEGIN");

            // Delete prices
            await query(`DELETE FROM MedicalSupplyShipmentPrice WHERE shipment_id = $1`, [shipmentId]);

            // Delete shipment
            const result = await query(
                `DELETE FROM MedicalSupplyShipment WHERE shipment_id = $1 RETURNING *`,
                [shipmentId]
            );

            if (result.rows.length === 0) {
                await query("ROLLBACK");
                res.status(404).json({ error: "Shipment not found" });
                return;
            }

            await query("COMMIT");

            res.status(204).send();
        } catch (error: any) {
            await query("ROLLBACK");
            console.error("Error deleting shipment:", error);
            res.status(500).json({ error: "Failed to delete shipment" });
        }
    }

    async getShipmentsBySupply(req: Request, res: Response) {
        try {
            const supplyId = parseInt(req.params.id);

            const result = await query(
                `
				SELECT mss.*, w.name as warehouse_name
				FROM MedicalSupplyShipment mss
				JOIN Warehouse w ON mss.warehouse_id = w.warehouse_id
				WHERE mss.supply_id = $1
				ORDER BY mss.expiry_date ASC NULLS LAST, mss.received_date DESC
			`,
                [supplyId]
            );

            // Get prices for each shipment
            const shipmentsWithPrices = await Promise.all(
                result.rows.map(async (shipment) => {
                    const pricesResult = await query(
                        `SELECT pricelist_id, price FROM MedicalSupplyShipmentPrice WHERE shipment_id = $1`,
                        [shipment.shipment_id]
                    );
                    return {
                        ...shipment,
                        prices: pricesResult.rows
                    };
                })
            );

            res.json(shipmentsWithPrices);
        } catch (error) {
            console.error("Error fetching shipments by supply:", error);
            res.status(500).json({ error: "Failed to fetch shipments" });
        }
    }

    async getShipmentsByWarehouse(req: Request, res: Response) {
        try {
            const warehouseId = parseInt(req.params.id);

            const result = await query(
                `
				SELECT mss.*, ms.name as supply_name
				FROM MedicalSupplyShipment mss
				JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
				WHERE mss.warehouse_id = $1
				ORDER BY mss.received_date DESC
			`,
                [warehouseId]
            );

            res.json(result.rows);
        } catch (error) {
            console.error("Error fetching shipments by warehouse:", error);
            res.status(500).json({ error: "Failed to fetch shipments" });
        }
    }
}

export default new MedicalSupplyShipmentController();
