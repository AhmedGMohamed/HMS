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

    async recalculateTotal(billId: number): Promise<void> {
        // 1. Calculate subtotals by category
        const servicesSubtotalResult = await query(
            `SELECT COALESCE(SUM(quantity * unit_price), 0) as subtotal
             FROM BillDetail 
             WHERE bill_id = $1 AND service_id IS NOT NULL`,
            [billId]
        );
        const servicesSubtotal = parseFloat(servicesSubtotalResult.rows[0].subtotal);

        const drugsSubtotalResult = await query(
            `SELECT COALESCE(SUM(quantity * unit_price), 0) as subtotal
             FROM BillDetail 
             WHERE bill_id = $1 AND drug_shipment_id IS NOT NULL`,
            [billId]
        );
        const drugsSubtotal = parseFloat(drugsSubtotalResult.rows[0].subtotal);

        const suppliesSubtotalResult = await query(
            `SELECT COALESCE(SUM(quantity * unit_price), 0) as subtotal
             FROM BillDetail 
             WHERE bill_id = $1 AND medical_supply_shipment_id IS NOT NULL`,
            [billId]
        );
        const suppliesSubtotal = parseFloat(suppliesSubtotalResult.rows[0].subtotal);

        // 2. Fetch bill configuration
        const billResult = await query(
            `SELECT medical_tests_amount, discount, discount_type, 
                    vat_percentage, discount_scope, vat_scope_custom, administrative_expenses
             FROM Bill WHERE bill_id = $1`,
            [billId]
        );

        if (billResult.rows.length === 0) return;

        const bill = billResult.rows[0];
        const medicalTestsAmount = parseFloat(bill.medical_tests_amount || 0);
        const discount = parseFloat(bill.discount || 0);
        const adminExpenses = parseFloat(bill.administrative_expenses || 0);
        const vatPercentage = parseFloat(bill.vat_percentage || 0);

        // Parse scope arrays, default to all categories for backward compatibility
        const discountScope = bill.discount_scope || ['services', 'drugs', 'supplies', 'tests'];
        const vatScopeCustom = bill.vat_scope_custom || ['services', 'drugs', 'supplies', 'tests'];

        // Category totals map
        const categoryTotals: Record<string, number> = {
            services: servicesSubtotal,
            drugs: drugsSubtotal,
            supplies: suppliesSubtotal,
            tests: medicalTestsAmount
        };

        // Total of all items
        const totalSubtotal = servicesSubtotal + drugsSubtotal + suppliesSubtotal + medicalTestsAmount;

        // 3. Calculate discount only on selected categories
        let discountableAmount = 0;
        for (const category of discountScope) {
            if (categoryTotals[category] !== undefined) {
                discountableAmount += categoryTotals[category];
            }
        }

        let discountAmount = 0;
        if (discountableAmount > 0) {
            if (bill.discount_type === "percentage") {
                discountAmount = (discountableAmount * discount) / 100;
            } else {
                discountAmount = discount;
            }
        }

        const totalAfterDiscount = totalSubtotal - discountAmount;

        // 4. Calculate VAT only on selected categories after discount
        let vattableCategoriesTotal = 0;
        for (const category of vatScopeCustom) {
            if (categoryTotals[category] !== undefined) {
                vattableCategoriesTotal += categoryTotals[category];
            }
        }

        let vattableAfterDiscount = 0;
        if (vattableCategoriesTotal > 0) {
            // Calculate proportional discount for vattable categories
            if (discountableAmount > 0 && discountAmount > 0) {
                // Find overlap between discount scope and VAT scope
                let vattableAndDiscountableTotal = 0;
                for (const category of vatScopeCustom) {
                    if (discountScope.includes(category) && categoryTotals[category] !== undefined) {
                        vattableAndDiscountableTotal += categoryTotals[category];
                    }
                }

                // Calculate discount that applies to vattable items
                const vattableDiscount = (vattableAndDiscountableTotal / discountableAmount) * discountAmount;
                vattableAfterDiscount = vattableCategoriesTotal - vattableDiscount;
            } else {
                vattableAfterDiscount = vattableCategoriesTotal;
            }
        }

        const vatAmount = ((vattableAfterDiscount + adminExpenses) * vatPercentage) / 100;

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