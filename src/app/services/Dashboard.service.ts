import { query } from "../models/database/connection.js";
import {
	DashboardStatistics,
	ChartDataPoint
} from "../utils/types/dashboard.js";

export class DashboardService {
	async getAdminStatistics(): Promise<DashboardStatistics> {
		try {
			const [
				activePatientsCount,
				todayRevenue,
				todayProfit,
				lowStockItemsCount,
				nearExpiryItemsCount,
				todayInsurancePayments
			] = await Promise.all([
				this.getActivePatientsCount(),
				this.getTodayRevenue(),
				this.getTodayProfit(),
				this.getLowStockItemsCount(),
				this.getNearExpiryItemsCount(),
				this.getTodayInsurancePayments()
			]);

			return {
				activePatientsCount,
				todayRevenue,
				todayProfit,
				lowStockItemsCount,
				nearExpiryItemsCount,
				todayInsurancePayments
			};
		} catch (error) {
			console.error("Error getting admin statistics:", error);
			throw new Error("Failed to retrieve admin statistics");
		}
	}

	async getUserStatistics(): Promise<Partial<DashboardStatistics>> {
		try {
			const [
				lowStockItemsCount,
				nearExpiryItemsCount
			] = await Promise.all([
				this.getLowStockItemsCount(),
				this.getNearExpiryItemsCount()
			]);

			return {
				lowStockItemsCount,
				nearExpiryItemsCount
			};
		} catch (error) {
			console.error("Error getting admin statistics:", error);
			throw new Error("Failed to retrieve admin statistics");
		}
	}

	async getChartData(): Promise<ChartDataPoint[]> {
		try {
			const last30Days = await this.getLast30DaysData();
			return last30Days;
		} catch (error) {
			console.error("Error getting chart data:", error);
			throw new Error("Failed to retrieve chart data");
		}
	}

	private async getActivePatientsCount(): Promise<number> {
		const sql = `
			SELECT COUNT(DISTINCT p.patient_id) as count
			FROM Patient p
			JOIN PatientHistory ph ON p.patient_id = ph.patient_id
			WHERE p.is_active = true 
			AND ph.discharge_time IS NULL;
		`;
		const result = await query(sql);
		return parseInt(result.rows[0].count) || 0;
	}

	private async getTodayRevenue(): Promise<number> {
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date();
		todayEnd.setHours(23, 59, 59, 999);

		const sql = `
			SELECT 
				COALESCE(
					(SELECT SUM(paid_amount) FROM Bill WHERE updated_at >= $1 AND updated_at <= $2), 0
				) + 
				COALESCE(
					(SELECT SUM(dt.quantity * dt.price) 
					 FROM DrugTransaction dt 
					 WHERE dt.timestamp >= $1 AND dt.timestamp <= $2 
					 AND dt.transaction_type IN ('outside', 'check')), 0
				) + 
				COALESCE(
					(SELECT SUM(payment_amount) 
					 FROM InsurancePayments 
					 WHERE issued_timestamp >= $1 AND issued_timestamp <= $2), 0
				) as total_revenue
		`;

		const result = await query(sql, [
			todayStart.toISOString(),
			todayEnd.toISOString()
		]);
		return parseFloat(result.rows[0].total_revenue) || 0;
	}

	private async getTodayProfit(): Promise<number> {
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date();
		todayEnd.setHours(23, 59, 59, 999);

		const sql = `
			SELECT 
				-- Patient revenue (bills paid)
				COALESCE(
					(SELECT SUM(paid_amount) FROM Bill WHERE updated_at >= $1 AND updated_at <= $2), 0
				) + 
				-- Pharmacy profit (revenue minus cost)
				COALESCE(
					(SELECT SUM(dt.quantity * (dt.price - ds.buy_price)) 
					 FROM DrugTransaction dt 
					 JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
					 WHERE dt.timestamp >= $1 AND dt.timestamp <= $2 
					 AND dt.transaction_type IN ('outside', 'check')), 0
				) + 
				-- Insurance payments received
				COALESCE(
					(SELECT SUM(payment_amount) 
					 FROM InsurancePayments 
					 WHERE issued_timestamp >= $1 AND issued_timestamp <= $2), 0
				) - 
				-- Drug purchase costs
				COALESCE(
					(SELECT SUM(ds.buy_quantity * ds.buy_price) 
					 FROM DrugShipment ds 
					 WHERE ds.received_date >= $1 AND ds.received_date <= $2), 0
				) - 
				-- Employee payments
				COALESCE(
					(SELECT SUM(ep.payment_amount + COALESCE(ep.extra_amount, 0)) 
					 FROM EmployeePayment ep 
					 WHERE ep.paid_timestamp >= $1 AND ep.paid_timestamp <= $2 
					 AND ep.is_paid = true AND ep.is_void = false), 0
				) - 
				-- Vault manual deductions
				COALESCE(
					(SELECT SUM(payment_amount)
					 FROM VaultManualPayment
					 WHERE payment_time >= $1 AND payment_time <= $2
					 AND payment_type = 'deduction'), 0
				) +
				-- Vault manual additions
				COALESCE(
					(SELECT SUM(payment_amount)
					 FROM VaultManualPayment
					 WHERE payment_time >= $1 AND payment_time <= $2
					 AND payment_type = 'addition'), 0
				) as total_profit
		`;

		const result = await query(sql, [
			todayStart.toISOString(),
			todayEnd.toISOString()
		]);
		return parseFloat(result.rows[0].total_profit) || 0;
	}

	private async getTodayInsurancePayments(): Promise<number> {
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date();
		todayEnd.setHours(23, 59, 59, 999);

		const sql = `
			SELECT COALESCE(SUM(payment_amount), 0) as total_insurance_payments
			FROM InsurancePayments 
			WHERE issued_timestamp >= $1 AND issued_timestamp <= $2;
		`;

		const result = await query(sql, [
			todayStart.toISOString(),
			todayEnd.toISOString()
		]);
		return parseFloat(result.rows[0].total_insurance_payments) || 0;
	}

	private async getLowStockItemsCount(): Promise<number> {
		const sql = `
			SELECT COUNT(*) as total_drugs_under_min_stock
			FROM DrugCard dc
			LEFT JOIN (
				SELECT 
					drug_id,
					SUM(quantity) AS total_stock
				FROM DrugShipment
				WHERE expiry_date > CURRENT_DATE
				GROUP BY drug_id
			) ds ON dc.drug_id = ds.drug_id
			WHERE 
				dc.min_stock_alert IS NOT NULL
				AND COALESCE(ds.total_stock, 0) < dc.min_stock_alert;
		`;

		const result = await query(sql);
		return parseInt(result.rows[0].total_drugs_under_min_stock) || 0;
	}

	private async getNearExpiryItemsCount(): Promise<number> {
		const sql = `
			SELECT COUNT(DISTINCT ds.shipment_id) as near_expiry_count
			FROM DrugShipment ds
			JOIN DrugCard dc ON ds.drug_id = dc.drug_id
			WHERE 
				ds.quantity > 0
				AND dc.max_days_expiry_alert IS NOT NULL
				AND ds.expiry_date > CURRENT_DATE
				AND ds.expiry_date <= CURRENT_DATE + (dc.max_days_expiry_alert || ' days')::INTERVAL;
		`;

		const result = await query(sql);
		return parseInt(result.rows[0].near_expiry_count) || 0;
	}

	private async getLast30DaysData(): Promise<ChartDataPoint[]> {
		const sql = `
			WITH date_series AS (
				SELECT generate_series(
					CURRENT_DATE - INTERVAL '29 days',
					CURRENT_DATE,
					INTERVAL '1 day'
				)::date as date
			),
			daily_patient_revenue AS (
				SELECT 
					DATE(b.updated_at) as date,
					SUM(b.paid_amount) as revenue
				FROM Bill b
				WHERE b.updated_at >= CURRENT_DATE - INTERVAL '29 days'
				GROUP BY DATE(b.updated_at)
			),
			daily_pharmacy_revenue AS (
				SELECT 
					DATE(dt.timestamp) as date,
					SUM(dt.quantity * dt.price) as revenue
				FROM DrugTransaction dt
				WHERE dt.timestamp >= CURRENT_DATE - INTERVAL '29 days'
				AND dt.transaction_type IN ('outside', 'check')
				GROUP BY DATE(dt.timestamp)
			),
			daily_insurance_revenue AS (
				SELECT 
					DATE(ip.issued_timestamp) as date,
					SUM(ip.payment_amount) as revenue
				FROM InsurancePayments ip
				WHERE ip.issued_timestamp >= CURRENT_DATE - INTERVAL '29 days'
				GROUP BY DATE(ip.issued_timestamp)
			),
			daily_vault_additions AS (
			    SELECT 
			        DATE(vmp.payment_time) as date,
			        SUM(CASE 
			            WHEN vmp.payment_type = 'addition' THEN vmp.payment_amount
			            ELSE 0
			        END) as revenue
			    FROM VaultManualPayment vmp
			    WHERE vmp.payment_time >= CURRENT_DATE - INTERVAL '29 days'
			    GROUP BY DATE(vmp.payment_time)
			),
			daily_pharmacy_profit AS (
				SELECT 
					DATE(dt.timestamp) as date,
					SUM(dt.quantity * (dt.price - ds.buy_price)) as profit
				FROM DrugTransaction dt
				JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
				WHERE dt.timestamp >= CURRENT_DATE - INTERVAL '29 days'
				AND dt.transaction_type IN ('outside', 'check')
				GROUP BY DATE(dt.timestamp)
			),
			daily_expenses AS (
				SELECT 
					DATE(ds.received_date) as date,
					SUM(ds.buy_quantity * ds.buy_price) as drug_costs,
					'drug_costs' as expense_type
				FROM DrugShipment ds
				WHERE ds.received_date >= CURRENT_DATE - INTERVAL '29 days'
				GROUP BY DATE(ds.received_date)
				UNION ALL
				SELECT 
					DATE(ep.paid_timestamp) as date,
					SUM(ep.payment_amount + COALESCE(ep.extra_amount, 0)) as expense_amount,
					'employee_payment' as expense_type
				FROM EmployeePayment ep
				WHERE ep.paid_timestamp >= CURRENT_DATE - INTERVAL '29 days'
				AND ep.is_paid = true AND ep.is_void = false
				GROUP BY DATE(ep.paid_timestamp)
				UNION ALL
				SELECT 
					DATE(vmp.payment_time) as date,
					SUM(CASE 
						WHEN vmp.payment_type = 'deduction' THEN vmp.payment_amount
						ELSE -vmp.payment_amount
					END) as expense_amount,
					'vault_manual' as expense_type
				FROM VaultManualPayment vmp
				WHERE vmp.payment_time >= CURRENT_DATE - INTERVAL '29 days'
				GROUP BY DATE(vmp.payment_time)
			),
			aggregated_expenses AS (
				SELECT 
					date,
					SUM(drug_costs) as total_expenses
				FROM daily_expenses
				GROUP BY date
			)
			SELECT 
				ds.date,
				COALESCE(dpr.revenue, 0) as patient_revenue,
				COALESCE(dphr.revenue, 0) as pharmacy_revenue,
				COALESCE(dir.revenue, 0) as insurance_revenue,
				COALESCE(dva.revenue, 0) as vault_additions,
				COALESCE(dpr.revenue, 0) + COALESCE(dphr.revenue, 0) + COALESCE(dir.revenue, 0) + COALESCE(dva.revenue, 0) as revenue,
				COALESCE(dpr.revenue, 0) as patient_profit,
				COALESCE(dphp.profit, 0) as pharmacy_profit,
				COALESCE(dir.revenue, 0) as insurance_profit,
				COALESCE(dpr.revenue, 0) + COALESCE(dphp.profit, 0) + COALESCE(dir.revenue, 0) - COALESCE(ae.total_expenses, 0) as profit
			FROM date_series ds
			LEFT JOIN daily_patient_revenue dpr ON ds.date = dpr.date
			LEFT JOIN daily_pharmacy_revenue dphr ON ds.date = dphr.date
			LEFT JOIN daily_insurance_revenue dir ON ds.date = dir.date
			LEFT JOIN daily_vault_additions dva ON ds.date = dva.date
			LEFT JOIN daily_pharmacy_profit dphp ON ds.date = dphp.date
			LEFT JOIN aggregated_expenses ae ON ds.date = ae.date
			ORDER BY ds.date;
		`;

		const result = await query(sql);
		return result.rows.map((row) => ({
			date: row.date,
			revenue: parseFloat(row.revenue) || 0,
			profit: parseFloat(row.profit) || 0,
			patient_revenue: parseFloat(row.patient_revenue) || 0,
			pharmacy_revenue: parseFloat(row.pharmacy_revenue) || 0,
			insurance_revenue: parseFloat(row.insurance_revenue) || 0,
			patient_profit: parseFloat(row.patient_profit) || 0,
			pharmacy_profit: parseFloat(row.pharmacy_profit) || 0,
			insurance_profit: parseFloat(row.insurance_profit) || 0
		}));
	}
}

export default new DashboardService();
