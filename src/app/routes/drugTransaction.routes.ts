import { Router } from "express";
import DrugTransactionController from "../controllers/DrugTransaction.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply authentication and pharmacy management permission to all routes
router.use(verifyToken);

// Basic CRUD operations
router.get("/", auditLogger, (req, res) =>
	DrugTransactionController.getAllTransactions(req, res)
);

router.get("/:id", auditLogger, validateId, (req, res) =>
	DrugTransactionController.getTransactionById(req, res)
);

router.post("/", auditLogger, (req, res) =>
	DrugTransactionController.createTransaction(req, res)
);

// Filtered transactions and summaries
router.get("/search/filtered", (req, res) =>
	DrugTransactionController.getFilteredTransactions(req, res)
);

router.get("/reports/summary", auditLogger, (req, res) =>
	DrugTransactionController.getTransactionSummary(req, res)
);

export default router;
