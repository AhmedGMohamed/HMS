// src/app/routes/bill.routes.ts
import { Router } from "express";
import BillController from "../controllers/Bill.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/:id", verifyToken, checkPermission("view_patients"), (req, res) =>
	BillController.getBillById(req, res)
);

router.put(
	"/:id",
	verifyToken,
	checkPermission("manage_patients"),
	(req, res) => BillController.updateBill(req, res)
);

export default router;
