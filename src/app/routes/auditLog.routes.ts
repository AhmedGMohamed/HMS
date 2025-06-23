import { Router } from "express";
import AuditLogController from "../controllers/AuditLog.controller.js";

const router = Router();

// GET
router.get("/", (req, res) => AuditLogController.getAllAuditLogs(req, res));
router.get("/:id", (req, res) => AuditLogController.getAuditLogById(req, res));
router.get("/user/:id", (req, res) =>
	AuditLogController.getAuditLogsByUserId(req, res)
);
router.get("/action-type/:type", (req, res) =>
	AuditLogController.getAuditLogsByActionType(req, res)
);
router.get("/page/:id", (req, res) =>
	AuditLogController.getAuditLogsByPage(req, res)
);

// POST
router.post("/", (req, res) => AuditLogController.createAuditLog(req, res));

// PUT
router.put("/:id", (req, res) => AuditLogController.updateAuditLog(req, res));

// DELETE
router.delete("/:id", (req, res) =>
	AuditLogController.deleteAuditLog(req, res)
);

export default router;