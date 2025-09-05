import { Router } from "express";
import DashboardController from "../controllers/Dashboard.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.get("/statistics", verifyToken, auditLogger, (req, res) =>
	DashboardController.getStatistics(req, res)
);

router.get("/chart-data", verifyToken, auditLogger, (req, res) =>
	DashboardController.getChartData(req, res)
);

export default router;
