import DashboardService from "../services/Dashboard.service.js";
import { Request, Response } from "express";

export class DashboardController {
	async getStatistics(_req: Request, res: Response): Promise<void> {
		try {
			const statistics = await DashboardService.getStatistics();
			res.json(statistics);
		} catch (error) {
			console.error("Error fetching dashboard statistics:", error);
			res.status(500).json({ error: "Failed to fetch dashboard statistics" });
		}
	}
}

export default new DashboardController();