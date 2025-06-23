// src/app/routes/users.routes.ts
import { Router } from "express";
import UserController from "../controllers/User.controller.js";
import { validateId } from "../middleware/validate.middleware.js";
import {
	verifyToken,
	adminOnly,
	checkSelfOrAdmin
} from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

// Apply verifyToken middleware to all routes
router.use(verifyToken);

// Routes that require admin access
router.get("/", adminOnly, auditLogger, (req, res) => UserController.getAllUsers(req, res));
router.post("/", adminOnly, auditLogger, (req, res) => {
	UserController.createUser(req, res);
});

// Routes that allow self-modification or admin access
router.get("/:id", validateId, checkSelfOrAdmin, auditLogger, (req, res) => {
	UserController.getUserById(req, res);
});

router.put("/:id", validateId, checkSelfOrAdmin, auditLogger, (req, res) =>
	UserController.updateUser(req, res)
);

router.delete(
	"/:id",
	validateId,
	adminOnly, // Only admin can delete users
	auditLogger,
	(req, res) => UserController.deleteUser(req, res)
);

export default router;
