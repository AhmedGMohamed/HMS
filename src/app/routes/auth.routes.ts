import { Router } from "express";
import AuthController from "../controllers/Auth.controller.js";

const router = Router();

router.post("/login", (req, res) => AuthController.login(req, res));
router.get("/verify", (req, res) => AuthController.verifyToken(req, res)); 

export default router;
