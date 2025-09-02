// src/app/routes/insurance.routes.ts
import { Router } from "express";
import InsuranceController from "../controllers/insurance.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", verifyToken, checkPermission("view_patients"), (req, res) =>
	InsuranceController.getAllInsuranceCompanies(req, res)
);

export default router;
