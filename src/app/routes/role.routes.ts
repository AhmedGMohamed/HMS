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

// Permission assignment routes.
// NOTE: this router is mounted at `/roles`, so the paths must not repeat the
// `/roles` segment — the old `/roles/:id/...` form resolved to
// `/api/roles/roles/:id/...` and was unreachable.
router.post("/:id/permissions", validateId, auditLogger, (req, res) =>
	RoleController.assignPermissions(req, res)
);

router.delete("/:id/permissions", validateId, auditLogger, (req, res) =>
	RoleController.removePermissions(req, res)
);

router.put("/:id/permissions", validateId, auditLogger, (req, res) =>
	RoleController.syncPermissions(req, res)
);

// Permission checking routes
router.get("/:id/check-permission", validateId, (req, res) =>
	RoleController.checkPermission(req, res)
);

router.get("/:id/check-permissions", validateId, (req, res) =>
	RoleController.checkPermissions(req, res)
);

export default router;
