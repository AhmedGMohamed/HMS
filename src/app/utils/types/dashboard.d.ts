// utils/types/dashboard.d.ts

export interface DashboardStatistics {
	activePatientsCount: number;
	todayRevenue: number;
	todayProfit: number;
	lowStockItemsCount: number;
	nearExpiryItemsCount: number;
	todayInsurancePayments: number;
}

export interface ChartDataPoint {
	date: string;
	revenue: number;
	profit: number;
	patient_revenue: number;
	pharmacy_revenue: number;
	insurance_revenue: number;
	patient_profit: number;
	pharmacy_profit: number;
	insurance_profit: number;
}

export interface RevenueBreakdown {
	patient_services: number;
	pharmacy_sales: number;
	total: number;
}

export interface ProfitBreakdown {
	patient_profit: number;
	pharmacy_profit: number;
	total_expenses: number;
	net_profit: number;
}
