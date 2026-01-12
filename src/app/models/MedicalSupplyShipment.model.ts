import { query } from "./database/connection.js";

export class MedicalSupplyShipmentModel {
    async getAllShipments() {
        const result = await query(`
            SELECT mss.*, w.name as warehouse_name, ms.name as supply_name
            FROM MedicalSupplyShipment mss
            JOIN Warehouse w ON mss.warehouse_id = w.warehouse_id
            JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
            ORDER BY mss.received_date DESC
        `);

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

        return shipmentsWithPrices;
    }

    async getShipmentById(shipmentId: number) {
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
            throw new Error("Shipment not found");
        }

        // Get prices for this shipment
        const pricesResult = await query(
            `SELECT pricelist_id, price FROM MedicalSupplyShipmentPrice WHERE shipment_id = $1`,
            [shipmentId]
        );

        return {
            ...result.rows[0],
            prices: pricesResult.rows
        };
    }

    async createShipment(data: any, userId: number) {
        const { supply_id, warehouse_id, quantity, buy_price, expiry_date, prices } = data;

        await query("BEGIN");
        try {
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
            return shipmentResult.rows[0];
        } catch (error) {
            await query("ROLLBACK");
            throw error;
        }
    }

    async updateShipment(shipmentId: number, data: any) {
        const { prices, ...fields } = data;

        await query("BEGIN");
        try {
            let updatedShipment = null;

            // Update shipment fields if any are provided
            const updateFields: string[] = [];
            const values: any[] = [];
            let paramCount = 1;

            if (fields.warehouse_id !== undefined) {
                updateFields.push(`warehouse_id = $${paramCount}`);
                values.push(fields.warehouse_id);
                paramCount++;
            }
            if (fields.quantity !== undefined) {
                updateFields.push(`quantity = $${paramCount}`);
                values.push(fields.quantity);
                paramCount++;
            }
            if (fields.buy_price !== undefined) {
                updateFields.push(`buy_price = $${paramCount}`);
                values.push(fields.buy_price);
                paramCount++;
            }
            if (fields.expiry_date !== undefined) {
                updateFields.push(`expiry_date = $${paramCount}`);
                values.push(fields.expiry_date);
                paramCount++;
            }

            if (updateFields.length > 0) {
                values.push(shipmentId);
                const sql = `
                    UPDATE MedicalSupplyShipment
                    SET ${updateFields.join(", ")}
                    WHERE shipment_id = $${paramCount}
                    RETURNING *
                `;
                const result = await query(sql, values);
                if (result.rows.length === 0) {
                    throw new Error("Shipment not found");
                }
                updatedShipment = result.rows[0];
            } else {
                // If no fields to update, fetch current shipment to return
                const result = await query(`SELECT * FROM MedicalSupplyShipment WHERE shipment_id = $1`, [shipmentId]);
                if (result.rows.length === 0) {
                    throw new Error("Shipment not found");
                }
                updatedShipment = result.rows[0];
            }

            // Update prices if provided
            if (prices) {
                for (const price of prices) {
                    await query(
                        `INSERT INTO MedicalSupplyShipmentPrice (shipment_id, pricelist_id, price) 
                         VALUES ($1, $2, $3)
                         ON CONFLICT (shipment_id, pricelist_id)
                         DO UPDATE SET price = EXCLUDED.price`,
                        [shipmentId, price.pricelist_id, price.price]
                    );
                }
            }

            await query("COMMIT");
            return updatedShipment;
        } catch (error) {
            await query("ROLLBACK");
            throw error;
        }
    }

    async deleteShipment(shipmentId: number) {
        // Check if shipment has been used
        const usageCheck = await query(
            `SELECT COUNT(*) as count FROM MedicalSupplyTransaction WHERE shipment_id = $1`,
            [shipmentId]
        );

        if (parseInt(usageCheck.rows[0].count) > 0) {
            throw new Error("Cannot delete shipment that has been used in transactions");
        }

        await query("BEGIN");
        try {
            // Delete prices
            await query(`DELETE FROM MedicalSupplyShipmentPrice WHERE shipment_id = $1`, [shipmentId]);

            // Delete shipment
            const result = await query(
                `DELETE FROM MedicalSupplyShipment WHERE shipment_id = $1 RETURNING *`,
                [shipmentId]
            );

            if (result.rows.length === 0) {
                throw new Error("Shipment not found");
            }

            await query("COMMIT");
            return result.rows[0];
        } catch (error) {
            await query("ROLLBACK");
            throw error;
        }
    }

    async getShipmentsBySupply(supplyId: number) {
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

        return shipmentsWithPrices;
    }

    async getShipmentsByWarehouse(warehouseId: number) {
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

        return result.rows;
    }
}

export default new MedicalSupplyShipmentModel();
