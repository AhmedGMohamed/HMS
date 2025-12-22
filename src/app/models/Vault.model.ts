import { query } from "./database/connection.js";
import {
	VaultSummary,
	ManualPayment
} from "../utils/types/vault.js";
export class VaultModel {
	async getVaultSummary(
		startDate: string,
		endDate: string
	): Promise<VaultSummary> {
		const [
			patientServicesTotal,
			patientDrugsTotal,
			patientSuppliesTotal,
			patientPaymentsTotal,
			patientOutstandingTotal,
			patientDiscountsTotal,
			manualPaymentTotals,
			drugShipmentCostsTotal,
			drugSalesRevenueTotal,
			drugSalesProfitTotal,
			supplyShipmentCostsTotal,
			supplySalesRevenueTotal,
			supplySalesProfitTotal,
			wagesOwedTotal,
			wagesPaidTotal,
			insurancePaymentsTotal,
			insurancePaymentCount,
			insurancePaymentAverage
		] = await Promise.all([
			this.getPatientServicesTotalAmount(startDate, endDate),
			this.getPatientDrugsTotalAmount(startDate, endDate),
			this.getPatientSuppliesTotalAmount(startDate, endDate),
			this.getPatientPaymentsTotalAmount(startDate, endDate),
			this.getPatientOutstandingTotalAmount(startDate, endDate),
			this.getPatientDiscountsTotalAmount(startDate, endDate),
			this.getManualPaymentsTotalAmounts(startDate, endDate),
			this.getDrugShipmentCostsTotalAmount(startDate, endDate),
			this.getDrugSalesRevenueTotalAmount(startDate, endDate),
			this.getDrugSalesProfitTotalAmount(startDate, endDate),
			this.getSupplyShipmentCostsTotalAmount(startDate, endDate),
			this.getSupplySalesRevenueTotalAmount(startDate, endDate),
			this.getSupplySalesProfitTotalAmount(startDate, endDate),
			this.getEmployeeWagesOwedTotalAmount(startDate, endDate),
			this.getEmployeeWagesPaidTotalAmount(startDate, endDate),
			this.getInsurancePaymentsTotalAmount(startDate, endDate),
			this.getInsurancePaymentsCount(startDate, endDate),
			this.getInsurancePaymentsAverage(startDate, endDate)
		]);

		const wagesOutstandingTotal = wagesOwedTotal - wagesPaidTotal;

		// Calculate totals
		const totalRevenue =
			patientPaymentsTotal +
			drugSalesRevenueTotal +
			supplySalesRevenueTotal +
			manualPaymentTotals.additions +
			insurancePaymentsTotal;
		const totalExpenses =
			drugShipmentCostsTotal +
			supplyShipmentCostsTotal +
			wagesPaidTotal +
			manualPaymentTotals.deductions;
		const netProfit = totalRevenue - totalExpenses;

		return {
			patient_services_total: patientServicesTotal,
			patient_drugs_total: patientDrugsTotal,
			patient_supplies_total: patientSuppliesTotal,
			patient_payments_total: patientPaymentsTotal,
			patient_outstanding_total: patientOutstandingTotal,
			patient_discounts_total: patientDiscountsTotal,
			manual_additions_total: manualPaymentTotals.additions,
			manual_deductions_total: manualPaymentTotals.deductions,
			manual_net_total: manualPaymentTotals.net,
			drug_shipment_costs_total: drugShipmentCostsTotal,
			drug_sales_revenue_total: drugSalesRevenueTotal,
			drug_sales_profit_total: drugSalesProfitTotal,
			supply_shipment_costs_total: supplyShipmentCostsTotal,
			supply_sales_revenue_total: supplySalesRevenueTotal,
			supply_sales_profit_total: supplySalesProfitTotal,
			wages_owed_total: wagesOwedTotal,
			wages_paid_total: wagesPaidTotal,
			wages_outstanding_total: wagesOutstandingTotal,
			insurance_payments_total: insurancePaymentsTotal,
			insurance_payment_count: insurancePaymentCount,
			insurance_payment_average: insurancePaymentAverage,
			total_revenue: totalRevenue,
			total_expenses: totalExpenses,
			net_profit: netProfit
		};
	}

	// Patient Revenue Methods
	async getPatientServicesRevenue(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                p.patient_id,
                p.name as patient_name,
                b.bill_id,
                b.generated_at,
                SUM(CASE WHEN bd.service_id IS NOT NULL THEN bd.quantity * bd.unit_price ELSE 0 END) as services_total,
                b.discount as discount_amount,
                b.paid_amount
            FROM Bill b
            JOIN Patient p ON b.patient_id = p.patient_id
            JOIN BillDetail bd ON b.bill_id = bd.bill_id
            WHERE b.generated_at >= $1 AND b.generated_at <= $2::DATE + '1 day'::INTERVAL
            GROUP BY p.patient_id, p.name, b.bill_id, b.generated_at, b.discount, b.paid_amount
            HAVING SUM(CASE WHEN bd.service_id IS NOT NULL THEN bd.quantity * bd.unit_price ELSE 0 END) > 0
            ORDER BY b.generated_at DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async getPatientDrugsRevenue(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                p.patient_id,
                p.name as patient_name,
                b.bill_id,
                b.generated_at,
                SUM(CASE WHEN bd.drug_shipment_id IS NOT NULL THEN bd.quantity * bd.unit_price ELSE 0 END) as drugs_total,
                b.discount as discount_amount,
                b.paid_amount
            FROM Bill b
            JOIN Patient p ON b.patient_id = p.patient_id
            JOIN BillDetail bd ON b.bill_id = bd.bill_id
            WHERE b.generated_at >= $1 AND b.generated_at <= $2::DATE + '1 day'::INTERVAL
            GROUP BY p.patient_id, p.name, b.bill_id, b.generated_at, b.discount, b.paid_amount
            HAVING SUM(CASE WHEN bd.drug_shipment_id IS NOT NULL THEN bd.quantity * bd.unit_price ELSE 0 END) > 0
            ORDER BY b.generated_at DESC;`;
		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async getPatientPayments(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                p.patient_id,
                p.name as patient_name,
                p.payment_type,
                b.bill_id,
                b.generated_at,
                b.updated_at,
                b.total_amount,
                b.paid_amount
            FROM Bill b
            JOIN Patient p ON b.patient_id = p.patient_id
            WHERE b.updated_at >= $1 AND b.updated_at <= $2::DATE + '1 day'::INTERVAL
                AND b.paid_amount > 0
            ORDER BY b.updated_at DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async getPatientOutstandingBalances(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                p.patient_id,
                p.name as patient_name,
                p.payment_type,
                b.bill_id,
                b.generated_at,
                b.total_amount,
                b.paid_amount,
                (b.total_amount - b.paid_amount) as outstanding_amount
            FROM Bill b
            JOIN Patient p ON b.patient_id = p.patient_id
            WHERE b.generated_at >= $1 AND b.generated_at <= $2::DATE + '1 day'::INTERVAL
                AND (b.total_amount - b.paid_amount) > 0
            ORDER BY outstanding_amount DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async getPatientDiscounts(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                p.patient_id,
                p.name as patient_name,
                b.bill_id,
                b.generated_at,
                b.discount_type,
                b.discount,
                b.total_amount,
                CASE 
                    WHEN b.discount_type = 'percentage' THEN (b.total_amount * b.discount / 100)
                    ELSE b.discount
                END as discount_amount
            FROM Bill b
            JOIN Patient p ON b.patient_id = p.patient_id
            WHERE b.generated_at >= $1 AND b.generated_at <= $2::DATE + '1 day'::INTERVAL
                AND b.discount > 0
            ORDER BY b.generated_at DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	// Manual Payment Methods
	async getManualPayments(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                payment_id,
                payment_amount,
                payment_type,
                payment_time,
                description
            FROM VaultManualPayment
            WHERE payment_time >= $1 AND payment_time <= $2::DATE + '1 day'::INTERVAL
            ORDER BY payment_time DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async createManualPayment(data: Partial<ManualPayment>): Promise<any> {
		const sql = `
            INSERT INTO VaultManualPayment (
                payment_amount, 
                payment_type, 
                description,
                payment_time
            )
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            RETURNING *;
        `;

		const result = await query(sql, [
			data.payment_amount,
			data.payment_type,
			data.description || null
		]);
		return result.rows[0];
	}

	// Pharmacy Methods
	async getDrugShipmentCosts(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                ds.shipment_id,
                dc.drug_id,
                dc.name as drug_name,
                dc.manufacturer,
				ds.buy_quantity,
                ds.quantity,
                ds.buy_price,
                (ds.buy_quantity * ds.buy_price) as total_cost,
                ds.expiry_date,
                ds.received_date,
                w.name as warehouse_name
            FROM DrugShipment ds
            JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            LEFT JOIN Warehouse w ON ds.warehouse_id = w.warehouse_id
            WHERE ds.received_date >= $1 AND ds.received_date <= $2
            ORDER BY ds.received_date DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async getDrugSalesRevenue(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                dt.transaction_id,
                dt.transaction_type,
                dc.drug_id,
                dc.name as drug_name,
                dt.quantity,
                dt.price,
                (dt.quantity * dt.price) as total_revenue,
                dt.timestamp,
                CASE 
                    WHEN dt.transaction_type = 'check' THEN 'Medical Check'
                    WHEN dt.transaction_type = 'outside' THEN 'Outside Sale'
                END as sale_type
            FROM DrugTransaction dt
            JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
            JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            WHERE dt.timestamp >= $1 AND dt.timestamp <= $2::DATE + '1 day'::INTERVAL
			AND dt.transaction_type != 'patient'
            ORDER BY dt.timestamp DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async getDrugSalesProfit(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                dc.drug_id,
                dc.name as drug_name,
                dc.manufacturer,
                SUM(dt.quantity) as total_quantity_sold,
                SUM(dt.quantity * dt.price) as total_revenue,
                SUM(dt.quantity * ds.buy_price) as total_cost,
                SUM(dt.quantity * (dt.price - ds.buy_price)) as total_profit,
                COUNT(DISTINCT dt.transaction_id) as transaction_count
            FROM DrugTransaction dt
            JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
            JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            WHERE dt.timestamp >= $1 AND dt.timestamp <= $2::DATE + '1 day'::INTERVAL
                AND (dt.transaction_type = 'outside' OR dt.transaction_type = 'check')
            GROUP BY dc.drug_id, dc.name, dc.manufacturer
            ORDER BY total_profit DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	// Employee Wages Methods
	async getEmployeeWagesOwed(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                e.employee_id,
                e.name as employee_name,
                e.employee_type,
                ep.payment_id,
                ep.payment_amount,
                ep.extra_payment_type,
                ep.extra_amount,
                ep.is_paid,
                ep.issued_timestamp
            FROM EmployeePayment ep
            JOIN Employee e ON ep.employee_id = e.employee_id
            WHERE ep.issued_timestamp >= $1 AND ep.issued_timestamp <= $2::DATE + '1 day'::INTERVAL
                AND ep.is_void = false
            ORDER BY ep.issued_timestamp DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	async getEmployeeWagesPaid(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
            SELECT 
                e.employee_id,
                e.name as employee_name,
                e.employee_type,
                ep.payment_id,
                ep.payment_amount,
                ep.extra_payment_type,
                ep.extra_amount,
                ep.paid_timestamp,
                u.username as paid_by
            FROM EmployeePayment ep
            JOIN Employee e ON ep.employee_id = e.employee_id
            LEFT JOIN "User" u ON ep.paid_by_user_id = u.user_id
            WHERE ep.paid_timestamp >= $1 AND ep.paid_timestamp <= $2::DATE + '1 day'::INTERVAL
                AND ep.is_paid = true
                AND ep.is_void = false
            ORDER BY ep.paid_timestamp DESC;
        `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	// Helper methods for totals
	private async getPatientServicesTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT 
                COALESCE(SUM(
                    CASE WHEN bd.service_id IS NOT NULL 
                    THEN bd.quantity * bd.unit_price 
                    ELSE 0 END
                ), 0) as total
            FROM BillDetail bd
            JOIN Bill b ON bd.bill_id = b.bill_id
            WHERE b.generated_at >= $1 AND b.generated_at <= $2::DATE + '1 day'::INTERVAL;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getPatientDrugsTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT 
                COALESCE(SUM(
                    CASE WHEN bd.drug_shipment_id IS NOT NULL 
                    THEN bd.quantity * bd.unit_price 
                    ELSE 0 END
                ), 0) as total
            FROM BillDetail bd
            JOIN Bill b ON bd.bill_id = b.bill_id
            WHERE b.generated_at >= $1 AND b.generated_at <= $2::DATE + '1 day'::INTERVAL;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getPatientPaymentsTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(paid_amount), 0) as total
            FROM Bill
            WHERE updated_at >= $1 AND updated_at <= $2::DATE + '1 day'::INTERVAL;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getPatientOutstandingTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
            FROM Bill
            WHERE generated_at >= $1 AND generated_at <= $2::DATE + '1 day'::INTERVAL
            AND (total_amount - paid_amount) > 0;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getPatientDiscountsTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN discount_type = 'percentage' THEN (total_amount * discount / 100)
                        ELSE discount
                    END
                ), 0) as total
            FROM Bill
            WHERE generated_at >= $1 AND generated_at <= $2::DATE + '1 day'::INTERVAL
                AND discount > 0;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getManualPaymentsTotalAmounts(
		startDate: string,
		endDate: string
	): Promise<{ additions: number; deductions: number; net: number }> {
		const sql = `
            SELECT 
                COALESCE(SUM(CASE WHEN payment_type = 'addition' THEN payment_amount ELSE 0 END), 0) as additions,
                COALESCE(SUM(CASE WHEN payment_type = 'deduction' THEN payment_amount ELSE 0 END), 0) as deductions
            FROM VaultManualPayment
            WHERE payment_time >= $1 AND payment_time <= $2::DATE + '1 day'::INTERVAL;
        `;

		const result = await query(sql, [startDate, endDate]);
		const additions = parseFloat(result.rows[0].additions);
		const deductions = parseFloat(result.rows[0].deductions);

		return {
			additions,
			deductions,
			net: additions - deductions
		};
	}

	private async getDrugShipmentCostsTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(buy_quantity * buy_price), 0) as total
            FROM DrugShipment
            WHERE received_date >= $1 AND received_date <= $2;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getDrugSalesRevenueTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(quantity * price), 0) as total
            FROM DrugTransaction
            WHERE timestamp >= $1 AND timestamp <= $2::DATE + '1 day'::INTERVAL
                AND (transaction_type = 'outside' OR transaction_type = 'check');
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getDrugSalesProfitTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(dt.quantity * (dt.price - ds.buy_price)), 0) as total
            FROM DrugTransaction dt
            JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
            WHERE dt.timestamp >= $1 AND dt.timestamp <= $2::DATE + '1 day'::INTERVAL
                AND (dt.transaction_type = 'outside' OR dt.transaction_type = 'check');
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	// Medical Supplies Methods
	private async getPatientSuppliesTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT 
                COALESCE(SUM(
                    CASE WHEN bd.medical_supply_shipment_id IS NOT NULL 
                    THEN bd.quantity * bd.unit_price 
                    ELSE 0 END
                ), 0) as total
            FROM BillDetail bd
            JOIN Bill b ON bd.bill_id = b.bill_id
            WHERE b.generated_at >= $1 AND b.generated_at <= $2::DATE + '1 day'::INTERVAL;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getSupplyShipmentCostsTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(buy_quantity * buy_price), 0) as total
            FROM MedicalSupplyShipment
            WHERE received_date >= $1 AND received_date <= $2;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getSupplySalesRevenueTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(quantity * price), 0) as total
            FROM MedicalSupplyTransaction
            WHERE timestamp >= $1 AND timestamp <= $2::DATE + '1 day'::INTERVAL
                AND (transaction_type = 'outside' OR transaction_type = 'check');
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getSupplySalesProfitTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(mst.quantity * (mst.price - mss.buy_price)), 0) as total
            FROM MedicalSupplyTransaction mst
            JOIN MedicalSupplyShipment mss ON mst.shipment_id = mss.shipment_id
            WHERE mst.timestamp >= $1 AND mst.timestamp <= $2::DATE + '1 day'::INTERVAL
                AND (mst.transaction_type = 'outside' OR mst.transaction_type = 'check');
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getEmployeeWagesOwedTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(payment_amount + COALESCE(extra_amount, 0)), 0) as total
            FROM EmployeePayment
            WHERE issued_timestamp >= $1 AND issued_timestamp <= $2::DATE + '1 day'::INTERVAL
                AND is_void = false;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getEmployeeWagesPaidTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(payment_amount + COALESCE(extra_amount, 0)), 0) as total
            FROM EmployeePayment
            WHERE paid_timestamp >= $1 AND paid_timestamp <= $2::DATE + '1 day'::INTERVAL
                AND is_paid = true
                AND is_void = false;
        `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	async getInsurancePaymentsRevenue(
		startDate: string,
		endDate: string
	): Promise<any[]> {
		const sql = `
        SELECT 
            ic.insurance_id,
            ic.name as insurance_name,
            ip.payment_id,
            ip.payment_amount,
            ip.payment_from,
            ip.payment_to,
            ip.issued_timestamp,
            u.username as added_by
        FROM InsurancePayments ip
        JOIN InsuranceCompany ic ON ip.insurance_id = ic.insurance_id
        LEFT JOIN "User" u ON ip.added_by_user_id = u.user_id
        WHERE ip.issued_timestamp >= $1 AND ip.issued_timestamp <= $2::DATE + '1 day'::INTERVAL
        ORDER BY ip.issued_timestamp DESC;
    `;

		const result = await query(sql, [startDate, endDate]);
		return result.rows;
	}

	private async getInsurancePaymentsTotalAmount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
        SELECT COALESCE(SUM(payment_amount), 0) as total
        FROM InsurancePayments
        WHERE issued_timestamp >= $1 AND issued_timestamp <= $2::DATE + '1 day'::INTERVAL;
    `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].total);
	}

	private async getInsurancePaymentsCount(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
        SELECT COUNT(*) as count
        FROM InsurancePayments
        WHERE issued_timestamp >= $1 AND issued_timestamp <= $2::DATE + '1 day'::INTERVAL;
    `;

		const result = await query(sql, [startDate, endDate]);
		return parseInt(result.rows[0].count);
	}

	private async getInsurancePaymentsAverage(
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
        SELECT COALESCE(AVG(payment_amount), 0) as average
        FROM InsurancePayments
        WHERE issued_timestamp >= $1 AND issued_timestamp <= $2::DATE + '1 day'::INTERVAL;
    `;

		const result = await query(sql, [startDate, endDate]);
		return parseFloat(result.rows[0].average);
	}
}

export default new VaultModel();
