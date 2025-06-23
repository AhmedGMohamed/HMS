import { Router } from "express";
import authRoutes from "./auth.routes.js";
import dashboardRoutes from "./dashboard.routes.js"
import patientRoutes from "./patient.routes.js"
import serviceRoutes from "./service.routes.js";
import priceListRoutes from "./priceList.routes.js";
import userRoutes from "./user.routes.js";
import roleRoutes from "./role.routes.js";
import permissionRoutes from "./permission.routes.js";
import drugCardRoutes from "./drugCard.routes.js";
import drugShipmentRoutes from "./drugShipment.routes.js";
import drugTransactionRoutes from "./drugTransaction.routes.js";
import drugUsageRoutes from "./drugUsage.routes.js";
import wareHouseRoutes from "./warehouse.routes.js"
import auditLogRoutes from "./auditLog.routes.js"

const router = Router();

// API routes
router.use("/auth", authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/patients", patientRoutes)
router.use("/services", serviceRoutes);
router.use("/price-lists", priceListRoutes);
router.use("/users", userRoutes);
router.use("/roles", roleRoutes);
router.use("/permissions", permissionRoutes);
router.use("/pharmacy/drugs/cards", drugCardRoutes);
router.use("/pharmacy/drugs/shipments", drugShipmentRoutes);
router.use("/pharmacy/drugs/transactions", drugTransactionRoutes);
router.use("/pharmacy/drugs/usages", drugUsageRoutes);
router.use("/pharmacy/warehouses", wareHouseRoutes)
router.use("/logs", auditLogRoutes)

export default router;
