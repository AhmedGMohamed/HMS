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

			// Credentials were valid but the account is disabled. This must not
			// be folded into the `null` branch above, or the form would claim the
			// password was wrong.
			if (user.is_active === false) {
				res.status(403).json({
					error: "Account is deactivated",
					code: "ACCOUNT_DEACTIVATED"
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

			// Best-effort: a failed timestamp must never block a valid login.
			try {
				await UserModel.recordLogin(user.user_id);
			} catch (timestampError) {
				console.error("Failed to record last_login:", timestampError);
			}

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
			const raw = authCookie || token;

			if (!raw) {
				res.status(401).json({ error: "No token provided" });
				return;
			}

			const decoded = jwt.verify(
				raw,
				process.env.JWT_SECRET || "your-secret-key"
			) as { userId: number; [key: string]: unknown };

			// Re-check the account so a deactivated or deleted user cannot keep
			// browsing on a token issued before the change.
			const state = await UserModel.getAuthState(decoded.userId);
			if (!state) {
				res.status(401).json({ error: "User no longer exists" });
				return;
			}
			if (!state.is_active) {
				res.status(401).json({
					error: "Account is deactivated",
					code: "ACCOUNT_DEACTIVATED"
				});
				return;
			}

			res.json({
				valid: true,
				user: { ...decoded, role: state.role_name }
			});
			return;
		} catch (error) {
			res.status(401).json({ error: "Invalid token" });
		}
	}
}

export default new AuthController();
