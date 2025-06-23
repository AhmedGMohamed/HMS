import { Router } from "express";
import { __dirname } from "../index.js";
import {
	adminOnly,
	checkPermission,
	verifyToken
} from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.get("/login", (_req, res) => {
	res.sendFile("./views/login.html", { root: __dirname });
});

router.get("/dashboard", verifyToken, auditLogger, (_req, res) => {
	res.sendFile("./views/dashboard.html", { root: __dirname });
});

// Admin page routes
router.get("/admin/users", verifyToken, adminOnly, auditLogger, (_req, res) => {
	res.sendFile("./views/admin/users.html", { root: __dirname });
});

router.get("/admin/roles", verifyToken, adminOnly, auditLogger, (_req, res) => {
	res.sendFile("./views/admin/roles.html", { root: __dirname });
});

// Service routes
router.get(
	"/services",
	verifyToken,
	checkPermission("manage_services"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/services/services.html", { root: __dirname });
	}
);

// Price list routes
router.get(
	"/price-lists",
	verifyToken,
	checkPermission("manage_prices"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/price-lists/price-lists.html", {
			root: __dirname
		});
	}
);

// Pharmacy routes
router.get(
	"/drugs",
	verifyToken,
	checkPermission("manage_pharmacy"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/pharmacy/drugs.html", { root: __dirname });
	}
);

export default router;
