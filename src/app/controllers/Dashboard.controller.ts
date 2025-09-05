import DashboardService from "../services/Dashboard.service.js";
import { Request, Response } from "express";

class DashboardController {
	async getStatistics(_req: Request, res: Response): Promise<void> {
		try {
			const statistics = await DashboardService.getStatistics();
			res.status(200).json(statistics);
		} catch (error) {
			res.status(500).json({ error: "Failed to retrieve statistics" });
		}
	}

	async getChartData(_req: Request, res: Response): Promise<void> {
		try {
			const chartData = await DashboardService.getChartData();
			res.status(200).json(chartData);
		} catch (error) {
			res.status(500).json({ error: "Failed to retrieve statistics" });
		}
	}
}

export default new DashboardController();
