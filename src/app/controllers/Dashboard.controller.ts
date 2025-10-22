import DashboardService from "../services/Dashboard.service.js";
import { Request, Response } from "express";

class DashboardController {
	async getAdminStatistics(_req: Request, res: Response): Promise<void> {
		try {
			const statistics = await DashboardService.getAdminStatistics();
			res.status(200).json(statistics);
		} catch (error) {
			res.status(500).json({
				error: "Failed to retrieve admin statistics"
			});
		}
	}

	async getUserStatistics(_req: Request, res: Response): Promise<void> {
		try {
			const statistics = await DashboardService.getUserStatistics();
			res.status(200).json(statistics);
		} catch (error) {
			res.status(500).json({
				error: "Failed to retrieve admin statistics"
			});
		}
	}

	async getChartData(_req: Request, res: Response): Promise<void> {
		try {
			const chartData = await DashboardService.getChartData();
			res.status(200).json(chartData);
		} catch (error) {
			res.status(500).json({ error: "Failed to retrieve chart data" });
		}
	}
}

export default new DashboardController();
