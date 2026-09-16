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

router.use(verifyToken);

// Service routes
// GET
router.get("/", auditLogger, (req, res) =>
	ServiceController.getAllServices(req, res)
);
// Static paths must be registered before the parameterized /:id route
router.get("/search", validateSearchTerm, (req, res) =>
	ServiceController.searchServices(req, res)
);
router.get("/suggestions", validatePrefix, (req, res) =>
	ServiceController.getServiceSuggestions(req, res)
);
router.get("/:id", validateId, (req, res) =>
	ServiceController.getServiceById(req, res)
);
router.get("/:id/drugs", validateId, (req, res) =>
	ServiceController.getServiceDrugs(req, res)
);

// POST
router.post("/", checkPermission("manage_services"), auditLogger, (req, res) =>
	ServiceController.createService(req, res)
);

// PUT
router.put(
	"/:id",
	checkPermission("manage_services"),
	validateId,
	auditLogger,
	(req, res) => ServiceController.updateService(req, res)
);

// DELETE
router.delete(
	"/:id",
	checkPermission("manage_services"),
	validateId,
	auditLogger,
	(req, res) => ServiceController.deleteService(req, res)
);

export default router;
