import { Router } from "express";
import DrugShipmentController from "../controllers/DrugShipment.controller.js";

const router = Router();

router.get("/", (req, res) => DrugShipmentController.getWarehouses(req, res));

export default router;
