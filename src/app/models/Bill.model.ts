// src/app/models/Bill.model.ts
import { query } from "./database/connection.js";
import { Bill } from "../utils/types/billing.js";

class BillModel {
    async getBillById(bill_id: number): Promise<Bill | null> {
        const sql = `
            SELECT b.*, 
                   json_agg(
                       json_build_object(
                           'bill_detail_id', bd.bill_detail_id,
                           'service_id', bd.service_id,
                           'service_name', s.name,
                           'drug_shipment_id', bd.drug_shipment_id,
                           'drug_name', dc.name,
                           'medical_supply_shipment_id', bd.medical_supply_shipment_id,
                           'medical_supply_name', ms.name,
                           'quantity', bd.quantity,
                           'unit_price', bd.unit_price,
                           'charge_type', bd.charge_type,
                           'sale_type', bd.sale_type,
                           'generated_at', bd.generated_at
                       )
                   ) as bill_details
            FROM Bill b
            LEFT JOIN BillDetail bd ON b.bill_id = bd.bill_id
            LEFT JOIN Service s ON bd.service_id = s.service_id
            LEFT JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
            LEFT JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            LEFT JOIN MedicalSupplyShipment mss ON bd.medical_supply_shipment_id = mss.shipment_id
            LEFT JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
            WHERE b.bill_id = $1
            GROUP BY b.bill_id
        `;
        const { rows } = await query(sql, [bill_id]);
        return rows[0] || null;
    }

    async updateBill(
        bill_id: number,
        updates: Partial<Bill>
    ): Promise<Bill | null> {
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && key !== "bill_id") {
                updateFields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        });

        if (updateFields.length === 0) {
            throw new Error("No valid fields to update");
        }

        values.push(bill_id);
        const sql = `
            UPDATE Bill 
            SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
            WHERE bill_id = $${paramCount}
            RETURNING *;
        `;

        const { rows } = await query(sql, values);
        return rows[0] || null;
    }
}

export default new BillModel();