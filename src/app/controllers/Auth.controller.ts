// src/app/controllers/Auth.controller.ts
import { Request, Response } from "express";
import UserModel from "../models/User.model.js";
import jwt from "jsonwebtoken";
import AuditLogModel from "../models/AuditLog.model.js";

export class AuthController {
	async login(req: Request, res: Response) {
		try {
			const { username, password } = req.body;

			if (!username || !password) {
				res.status(400).json({
					error: "Username and password are required"
				});
				return;
			}
			const user = await UserModel.authenticateUser(username, password);

			if (!user) {
				res.status(401).json({
					error: "Invalid username or password"
				});
				return;
			}

			const permissions = await UserModel.getUserPermissions(
				user.user_id
			);

			// Create JWT token
			const token = jwt.sign(
				{
					userId: user.user_id,
					username: user.username,
					role: user.role_name,
					permissions
				},
				process.env.JWT_SECRET || "your-secret-key",
				{ expiresIn: "1d" }
			);

			await AuditLogModel.createAuditLog({
				user_id: user.user_id,
				action_type: "Login",
				details: {
					url: req.originalUrl,
					params: req.params,
					query: req.query as Record<string, string | number>,
					body: req.body,
					description: `User ${user.username} logged in`
				}
			});

			res.cookie("auth", token).json({
				user: {
					user_id: user.user_id,
					username: user.username,
					role: user.role_name,
					permissions
				},
				token
			});
		} catch (error) {
			console.error("Login error:", error);
			res.status(500).json({ error: "Authentication failed" });
		}
	}

	async verifyToken(req: Request, res: Response) {
		try {
			const authCookie = req.cookies["auth"];
			const token = req.headers.authorization?.split(" ")[1];
			let decoded;

			if (authCookie) {
				decoded = jwt.verify(
					authCookie,
					process.env.JWT_SECRET || "your-secret-key"
				);

				res.json({ valid: true, user: decoded });
				return;
			}

			if (token) {
				const decoded = jwt.verify(
					token,
					process.env.JWT_SECRET || "your-secret-key"
				);

				res.json({ valid: true, user: decoded });
				return;
			}

			res.status(401).json({ error: "No token provided" });
			return;
		} catch (error) {
			res.status(401).json({ error: "Invalid token" });
		}
	}
}

export default new AuthController();
