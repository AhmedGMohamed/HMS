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

    async recalculateTotal(billId: number): Promise<void> {
        // 1. Calculate subtotal from BillDetail
        const subtotalResult = await query(
            `SELECT COALESCE(SUM(quantity * unit_price), 0) as subtotal
             FROM BillDetail 
             WHERE bill_id = $1`,
            [billId]
        );
        const itemsSubtotal = parseFloat(subtotalResult.rows[0].subtotal);

        // 2. Fetch bill configuration
        const billResult = await query(
            `SELECT medical_tests_amount, discount, discount_type, 
                    vat_percentage, vat_scope, administrative_expenses
             FROM Bill WHERE bill_id = $1`,
            [billId]
        );

        if (billResult.rows.length === 0) return;

        const bill = billResult.rows[0];
        const medicalTests = parseFloat(bill.medical_tests_amount || 0);
        const discount = parseFloat(bill.discount || 0);
        const adminExpenses = parseFloat(bill.administrative_expenses || 0);
        const vatPercentage = parseFloat(bill.vat_percentage || 0);
        const vatScope = bill.vat_scope || "both";

        // Subtotal includes medical tests for discount calculation
        const totalSubtotal = itemsSubtotal + medicalTests;

        // 3. Calculate discount
        let discountAmount = 0;
        if (bill.discount_type === "percentage") {
            discountAmount = (totalSubtotal * discount) / 100;
        } else {
            discountAmount = discount;
        }

        const totalAfterDiscount = totalSubtotal - discountAmount;

        // 4. Calculate VAT
        let vatBase = 0;
        if (totalSubtotal > 0) {
            switch (vatScope) {
                case "services":
                    const servicesSubtotalResult = await query(
                        `SELECT COALESCE(SUM(quantity * unit_price), 0) as subtotal
                         FROM BillDetail 
                         WHERE bill_id = $1 AND service_id IS NOT NULL`,
                        [billId]
                    );
                    const servicesSubtotal = parseFloat(servicesSubtotalResult.rows[0].subtotal) + (medicalTests || 0);
                    vatBase = servicesSubtotal - (discountAmount * (servicesSubtotal / totalSubtotal));
                    break;
                case "drugs":
                    const drugsSuppliesSubtotalResult = await query(
                        `SELECT COALESCE(SUM(quantity * unit_price), 0) as subtotal
                         FROM BillDetail 
                         WHERE bill_id = $1 AND (drug_shipment_id IS NOT NULL OR medical_supply_shipment_id IS NOT NULL)`,
                        [billId]
                    );
                    const drugsSuppliesSubtotal = parseFloat(drugsSuppliesSubtotalResult.rows[0].subtotal);
                    vatBase = drugsSuppliesSubtotal - (discountAmount * (drugsSuppliesSubtotal / totalSubtotal));
                    break;
                case "both":
                default:
                    vatBase = totalAfterDiscount;
                    break;
            }
        }

        const vatAmount = ((vatBase + adminExpenses) * vatPercentage) / 100;

        // 5. Final Total
        const finalTotal = totalAfterDiscount + vatAmount + adminExpenses;

        // 6. Update Bill
        await query(
            `UPDATE Bill SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE bill_id = $2`,
            [finalTotal, billId]
        );
    }
}

export default new BillModel();