import { Router } from "express";
import PriceListController from "../controllers/PriceList.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { checkPermission, verifyToken } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.use(verifyToken, checkPermission("manage_pharmacy"));

// GET
router.get("/", auditLogger, (req, res) =>
	PriceListController.getAllPriceLists(req, res)
);
router.get("/default", (req, res) =>
	PriceListController.getDefaultPriceList(req, res)
);
router.get("/:id", validateId, (req, res) =>
	PriceListController.getPriceListById(req, res)
);
router.get("/:id/stats", auditLogger, (req, res) =>
	PriceListController.getPriceListStats(req, res)
);
router.get("/:id/services", auditLogger, (req, res) =>
	PriceListController.getPriceListServices(req, res)
);

// POST
router.post("/", auditLogger, (req, res) =>
	PriceListController.createPriceList(req, res)
);

// PUT
router.put("/:id", validateId, auditLogger, (req, res) =>
	PriceListController.updatePriceList(req, res)
);

// DELETE
router.delete("/:id", validateId, auditLogger, (req, res) =>
	PriceListController.deletePriceList(req, res)
);

export default router;
