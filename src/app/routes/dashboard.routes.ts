
import { Router } from "express";
import DashboardController from "../controllers/Dashboard.controller.js";

const router = Router();

router.get("/statistics", (req, res) => DashboardController.getStatistics(req, res));

export default router;