// src/app/routes/permissions.routes.ts
import { Router } from "express";
import PermissionController from "../controllers/Permission.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import { adminOnly, verifyToken } from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// All permission management routes require admin access
router.use(verifyToken, adminOnly);

// Basic CRUD routes
router.get("/", auditLogger, (req, res) =>
	PermissionController.getAllPermissions(req, res)
);
router.get("/:id", validateId, (req, res) =>
	PermissionController.getPermissionById(req, res)
);
router.post("/", auditLogger, (req, res) =>
	PermissionController.createPermission(req, res)
);
router.put("/:id", validateId, auditLogger, (req, res) =>
	PermissionController.updatePermission(req, res)
);
router.delete("/:id", validateId, auditLogger, (req, res) =>
	PermissionController.deletePermission(req, res)
);

// Role-specific permission routes
router.get("/role/:id", validateId, auditLogger, (req, res) =>
	PermissionController.getPermissionsByRole(req, res)
);
router.get("/unassigned/:id", validateId, auditLogger, (req, res) =>
	PermissionController.getUnassignedPermissions(req, res)
);

export default router;
