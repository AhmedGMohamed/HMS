// src/app/routes/roles.routes.ts
import { Router } from "express";
import RoleController from "../controllers/Role.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { verifyToken, adminOnly } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// All role management routes require admin access
router.use(verifyToken, adminOnly);

router.get("/", auditLogger, (req, res) =>
	RoleController.getAllRoles(req, res)
);
router.get("/:id", validateId, (req, res) =>
	RoleController.getRoleById(req, res)
);
router.post("/", auditLogger, (req, res) =>
	RoleController.createRole(req, res)
);
router.put("/:id", auditLogger, validateId, (req, res) =>
	RoleController.updateRole(req, res)
);
router.delete("/:id", validateId, auditLogger, (req, res) =>
	RoleController.deleteRole(req, res)
);

// Permission assignment routes
router.post("/roles/:id/permissions", validateId, auditLogger, (req, res) =>
	RoleController.assignPermissions(req, res)
);

router.delete("/roles/:id/permissions", validateId, auditLogger, (req, res) =>
	RoleController.removePermissions(req, res)
);

router.put("/roles/:id/permissions", validateId, auditLogger, (req, res) =>
	RoleController.syncPermissions(req, res)
);

// Permission checking routes
router.get("/roles/:id/check-permission", validateId, (req, res) =>
	RoleController.checkPermission(req, res)
);

router.get("/roles/:id/check-permissions", validateId, (req, res) =>
	RoleController.checkPermissions(req, res)
);

export default router;
