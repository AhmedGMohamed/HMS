// src/app/models/Bill.model.ts
import { query } from "./database/connection.js";
import { Bill } from "../utils/types/billing.js";
import { calculateBillFinancials } from "../utils/billFinancials.js";

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
        const values: unknown[] = [];
        let paramCount = 1;

        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && key !== "bill_id") {
                updateFields.push(`${key} = $${paramCount}`);

                // Explicitly stringify JSONB columns to avoid Postgres Array confusion
                if ((key === 'discount_scope' || key === 'vat_scope_custom') && Array.isArray(value)) {
                    values.push(JSON.stringify(value));
                } else {
                    values.push(value);
                }

                paramCount++;
            }
        });

        if (updateFields.length > 0) {
            values.push(bill_id);
            const sql = `
                UPDATE Bill 
                SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
                WHERE bill_id = $${paramCount}
                RETURNING *;
            `;
            await query(sql, values);
        }

        // Recalculate total_amount after update
        await this.recalculateTotal(bill_id);

        return this.getBillById(bill_id);
    }

    /**
     * Recomputes `Bill.total_amount` from its components.
     *
     * The category subtotals and the bill configuration are fetched in one
     * round trip, then the arithmetic is delegated to the shared
     * `calculateBillFinancials` helper so the billing write path and the
     * Reports aggregation can never disagree. See
     * `src/app/utils/billFinancials.ts` for the documented semantics.
     */
    async recalculateTotal(billId: number): Promise<void> {
        const billResult = await query(
            `SELECT
                 b.medical_tests_amount,
                 b.discount,
                 b.discount_type,
                 b.vat_percentage,
                 b.discount_scope,
                 b.vat_scope_custom,
                 b.administrative_expenses,
                 COALESCE((
                     SELECT SUM(bd.quantity * bd.unit_price)
                     FROM BillDetail bd
                     WHERE bd.bill_id = b.bill_id AND bd.service_id IS NOT NULL
                 ), 0) AS services_subtotal,
                 COALESCE((
                     SELECT SUM(bd.quantity * bd.unit_price)
                     FROM BillDetail bd
                     WHERE bd.bill_id = b.bill_id AND bd.drug_shipment_id IS NOT NULL
                 ), 0) AS drugs_subtotal,
                 COALESCE((
                     SELECT SUM(bd.quantity * bd.unit_price)
                     FROM BillDetail bd
                     WHERE bd.bill_id = b.bill_id AND bd.medical_supply_shipment_id IS NOT NULL
                 ), 0) AS supplies_subtotal
             FROM Bill b
             WHERE b.bill_id = $1`,
            [billId]
        );

        if (billResult.rows.length === 0) return;

        const bill = billResult.rows[0];
        const financials = calculateBillFinancials({
            services: bill.services_subtotal,
            drugs: bill.drugs_subtotal,
            supplies: bill.supplies_subtotal,
            tests: bill.medical_tests_amount,
            discount: bill.discount,
            discountType: bill.discount_type,
            discountScope: bill.discount_scope,
            vatPercentage: bill.vat_percentage,
            vatScope: bill.vat_scope_custom,
            administrativeExpenses: bill.administrative_expenses,
        });

        // Pass the unrounded value: the `DECIMAL(15,2)` column rounds it on
        // write, exactly as the previous inline implementation did.
        await query(
            `UPDATE Bill SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE bill_id = $2`,
            [financials.finalTotal, billId]
        );
    }
}

export default new BillModel();