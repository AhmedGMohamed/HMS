import { query } from "../models/database/connection.js";
import { DashboardStatistics } from "../utils/types/dashboard.js";

export class DashboardService {
	async getStatistics(): Promise<DashboardStatistics> {
		const activePatientsCount = await this.getActivePatientsCount();
		const todayRevenue = await this.getTodayRevenue();
		const lowStockItemsCount = await this.getLowStockItemsCount();
		//const todayAdmissionsCount = await this.getTodayAdmissionsCount();

		return {
			activePatientsCount,
			todayRevenue,
			lowStockItemsCount
			//todayAdmissionsCount
		};
	}

	private async getActivePatientsCount(): Promise<number> {
		const sql =
			"SELECT CAST(COUNT(*) as INTEGER) FROM Patient WHERE is_active = true;";
		const result = await query(sql);
		return result.rows[0].count;
	}

	private async getTodayRevenue(): Promise<number> {
		const baseTime = new Date("2022-01-01 12:00:00").getTime();
		const dayInMillis = 24 * 60 * 60 * 1000;
		const today = new Date().getTime();
		// How much time in milliseconds has passed since the last 12PM
		const timePassed = (today - baseTime) % dayInMillis;
		const last12PM = (today - timePassed) / 1000; // Convert to seconds 

		const drugProfitSql = `
			SELECT CAST(SUM(profit) as DECIMAL(15,2))
			FROM (
				SELECT
				(dt.price * dt.quantity - ds.buy_price * dt.quantity) as profit
        	    FROM DrugTransaction dt
        	    JOIN DrugShipment ds ON dt.shipment_id = ds.shipment_id
        	    JOIN DrugCard dc ON ds.drug_id = dc.drug_id
				WHERE dt.timestamp >= to_timestamp($1)
			) dsp`;
		const result = await query(drugProfitSql, [last12PM]);

		const employeeWagesSql = `
			SELECT CAST(SUM(wage) as DECIMAL(15,2))
			FROM (
				SELECT
				(ep.payment_amount + ep.extra_amount) as wage
			    FROM EmployeePayment ep
				WHERE ep.is_paid = true
				AND is_void = false
				AND ep.paid_timestamp >= to_timestamp($1)
			)`
		const wageResult = await query(employeeWagesSql, [last12PM]);
		return (result.rows[0].sum || 0) - (wageResult.rows[0].sum || 0);
	}

	private async getLowStockItemsCount(): Promise<number> {
		const sql = `
			SELECT CAST(COUNT(*) as INTEGER) AS total_drugs_under_min_stock
			FROM DrugCard dc
			LEFT JOIN (
			    SELECT 
			        drug_id,
			        SUM(quantity) AS total_stock
			    FROM DrugShipment
			    WHERE expiry_date > CURRENT_DATE  -- Only consider non-expired stock
			    GROUP BY drug_id
			) ds ON dc.drug_id = ds.drug_id
			WHERE 
			    dc.min_stock_alert IS NOT NULL
			    AND COALESCE(ds.total_stock, 0) < dc.min_stock_alert;
            `;

		const result = await query(sql);
		return result.rows[0].total_drugs_under_min_stock;
	}

	/**private async getTodayAdmissionsCount(): Promise<number> {
		const sql = ``;

		const result = await query(sql);
		return result.rows[0].count;
	}*/
}

export default new DashboardService();
