import { Router } from "express";
import { WarehouseController } from "../controllers/Warehouse.controller.js";
import {
	checkPermission,
	verifyToken
} from "../middleware/auth.middleware.js";
import { auditLogger } from "../middleware/auditLogger.middleware.js";

const router = Router();
const warehouseController = new WarehouseController();

// Apply authentication middleware to all routes
router.use(verifyToken, checkPermission("manage_pharmacy"));

// Get all warehouses
router.get(
	"/",
	auditLogger,
	warehouseController.getAllWarehouses.bind(warehouseController)
);

// Get warehouse by ID
router.get(
	"/:id",
	auditLogger,
	warehouseController.getWarehouseById.bind(warehouseController)
);

// Create new warehouse
router.post(
	"/",
	auditLogger,
	warehouseController.createWarehouse.bind(warehouseController)
);

// Update warehouse
router.put(
	"/:id",
	auditLogger,
	warehouseController.updateWarehouse.bind(warehouseController)
);

// Delete warehouse
router.delete(
	"/:id",
	auditLogger,
	warehouseController.deleteWarehouse.bind(warehouseController)
);

export default router;
