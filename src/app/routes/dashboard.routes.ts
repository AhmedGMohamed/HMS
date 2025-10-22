import { Router } from "express";
import DashboardController from "../controllers/Dashboard.controller.js";
import { checkPermission, verifyToken } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.get("/admin-statistics", verifyToken, checkPermission("view_dashboard"), auditLogger, (req, res) =>
	DashboardController.getAdminStatistics(req, res)
);

router.get("/user-statistics", verifyToken, auditLogger, (req, res) =>
	DashboardController.getUserStatistics(req, res))

router.get("/chart-data", verifyToken, auditLogger, (req, res) =>
	DashboardController.getChartData(req, res)
);

export default router;
