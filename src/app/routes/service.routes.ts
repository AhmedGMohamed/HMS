import { Router } from "express";
import ServiceController from "../controllers/Service.controller.js";
import {
	validateId,
	validateSearchTerm,
	validatePrefix
} from "../middleware/validate.middleware.js";
import { checkPermission, verifyToken } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.use(verifyToken, checkPermission("manage_services"));

// Service routes
// GET
router.get("/", auditLogger, (req, res) =>
	ServiceController.getAllServices(req, res)
);
router.get("/:id", validateId, (req, res) =>
	ServiceController.getServiceById(req, res)
);
router.get("/:id/drugs", validateId, (req, res) =>
	ServiceController.getServiceDrugs(req, res)
);
router.get("/search", validateSearchTerm, (req, res) =>
	ServiceController.searchServices(req, res)
);
router.get("/suggestions", validatePrefix, (req, res) =>
	ServiceController.getServiceSuggestions(req, res)
);

// POST
router.post("/", auditLogger, (req, res) =>
	ServiceController.createService(req, res)
);

// PUT
router.put("/:id", validateId, auditLogger, (req, res) =>
	ServiceController.updateService(req, res)
);

// DELETE
router.delete("/:id", validateId, auditLogger, (req, res) =>
	ServiceController.deleteService(req, res)
);

export default router;
