import { Router } from "express";
import { __dirname } from "../index.js";
import {
	adminOnly,
	checkPermission,
	verifyToken
} from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";
import navigationController from "../controllers/navigation.controller.js";

const router = Router();

router.get("/navigation", verifyToken, (req, res) =>
	navigationController.getNavigation(req, res)
);

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

router.get("/supplies", verifyToken, checkPermission("manage_pharmacy"), auditLogger, (_req, res) => {
	res.sendFile("./views/pharmacy/supplies.html", { root: __dirname });
})

//Employee & Clock-in routes
router.get(
	"/employees",
	verifyToken,
	checkPermission("manage_employees"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/employees/employees.html", { root: __dirname });
	}
);

router.get(
	"/doctors",
	verifyToken,
	checkPermission("manage_employees"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/employees/doctors.html", { root: __dirname });
	}
);

router.get(
	"/nurses",
	verifyToken,
	checkPermission("manage_employees"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/employees/nurses.html", { root: __dirname });
	}
);

router.get(
	"/clocking",
	verifyToken,
	checkPermission("manage_clocking"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/employees/clocking.html", { root: __dirname });
	}
);

router.get(
	"/patients",
	verifyToken,
	checkPermission("manage_patients"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/patients/patients.html", { root: __dirname });
	}
);

router.get(
	"/vault",
	verifyToken,
	checkPermission("view_vault"),
	auditLogger,
	(_req, res) => {
		res.sendFile("./views/vault/vault.html", { root: __dirname });
	}
);

// Add this route to your existing page.routes.ts
router.get(
	"/insurance",
	verifyToken,
	checkPermission("manage_insurance"),
	(_req, res) => {
		res.sendFile("./views/insurance/insurance.html", { root: __dirname });
	}
);

router.get(
	"/reports",
	verifyToken,
	checkPermission("view_reports"),
	(_req, res) => {
		res.sendFile("./views/reports/reports.html", { root: __dirname });
	}
);

export default router;
