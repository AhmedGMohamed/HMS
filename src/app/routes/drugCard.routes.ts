// src/app/routes/drugs.routes.ts
import { Router } from "express";
import DrugCardController from "../controllers/DrugCard.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply authentication to all routes
router.use(verifyToken, checkPermission("manage_pharmacy"));

// Basic CRUD operations
router.get("/", auditLogger, (req, res) =>
	DrugCardController.getAllDrugCards(req, res)
);

router.get("/:id", validateId, (req, res) =>
	DrugCardController.getDrugCardById(req, res)
);

router.post("/", auditLogger, (req, res) =>
	DrugCardController.createDrugCard(req, res)
);

router.put("/:id", validateId, auditLogger, (req, res) =>
	DrugCardController.updateDrugCard(req, res)
);

router.delete("/:id", validateId, auditLogger, (req, res) =>
	DrugCardController.deleteDrugCard(req, res)
);

// Search and suggestions
router.get("/search/drugs", (req, res) =>
	DrugCardController.searchDrugs(req, res)
);

router.get("/search/suggestions", (req, res) =>
	DrugCardController.getDrugSuggestions(req, res)
);

// Stock monitoring
router.get("/monitor/low-stock", (req, res) =>
	DrugCardController.getLowStockDrugs(req, res)
);

router.get("/monitor/near-expiry", (req, res) =>
	DrugCardController.getNearExpiryDrugs(req, res)
);

export default router;
