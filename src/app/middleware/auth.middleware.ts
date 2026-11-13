// src/app/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import UserModel from "../models/User.model.js";
import { isPrivilegedRole } from "../utils/roles.js";

interface JWTPayload {
	userId: number;
	username: string;
	role: string;
	permissions: string[];
}

/**
 * Verifies the JWT and re-reads the account's live state.
 *
 * The DB read is deliberate: `is_active` must gate every request, not just
 * login, and the role name must reflect a rename/demotion that happened after
 * the token was issued (otherwise `adminOnly` would trust a stale claim for up
 * to 24h). Permissions stay in the token — see the phase 6.12 plan §9.
 *
 * Deactivated accounts get 401 rather than 403 because the renderer treats 401
 * as "session over" and redirects to /login; a 403 would strand a dead session.
 */
export const verifyToken = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const authCookie = req.cookies?.["auth"];
		const bearer = req.headers.authorization?.split(" ")[1]; // Bearer <token>
		const raw = authCookie || bearer;

		if (!raw) {
			res.status(401).json({ error: "No token provided" });
			return;
		}

		const decoded = jwt.verify(
			raw,
			process.env.JWT_SECRET || "your-secret-key"
		) as JWTPayload;

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

		req.user = { ...decoded, role: state.role_name };
		next();
	} catch (error) {
		// TokenExpiredError extends JsonWebTokenError, so it must be
		// checked first or expired tokens are reported as "Invalid token".
		if (error instanceof jwt.TokenExpiredError) {
			res.status(401).json({ error: "Token expired" });
			return;
		}
		if (error instanceof jwt.JsonWebTokenError) {
			res.status(401).json({ error: "Invalid token" });
			return;
		}
		console.error("Auth middleware error:", error);
		res.status(500).json({ error: "Authentication failed" });
	}
};

export const checkPermission = (requiredPermission: string) => {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				res.status(401).json({
					error: "Authentication required"
				});
				return;
			}

			// Privileged roles (Admin, System) bypass permission checks
			if (isPrivilegedRole(req.user.role)) {
				next();
				return;
			}

			// Check if user has the required permission
			if (!req.user.permissions.includes(requiredPermission)) {
				res.status(403).json({
					error: "Insufficient permissions"
				});
				return;
			}

			next();
		} catch (error) {
			console.error("Permission check error:", error);
			res.status(500).json({
				error: "Permission check failed"
			});
		}
	};
};

// Allow access if the user has any one of the listed permissions.
// Admin role bypasses the check.
export const checkAnyPermission = (requiredPermissions: string[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				res.status(401).json({
					error: "Authentication required"
				});
				return;
			}

			// Privileged roles (Admin, System) bypass permission checks
			if (isPrivilegedRole(req.user.role)) {
				next();
				return;
			}

			const hasAny = requiredPermissions.some((p) =>
				req.user!.permissions.includes(p)
			);

			if (!hasAny) {
				res.status(403).json({
					error: "Insufficient permissions"
				});
				return;
			}

			next();
		} catch (error) {
			console.error("Any-permission check error:", error);
			res.status(500).json({
				error: "Permission check failed"
			});
		}
	};
};

export const checkRole = (allowedRoles: string[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				return res.status(401).json({
					error: "Authentication required"
				});
			}

			if (!allowedRoles.includes(req.user.role)) {
				return res.status(403).json({
					error: "Insufficient role permissions"
				});
			}

			next();
		} catch (error) {
			console.error("Role check error:", error);
			res.status(500).json({
				error: "Role check failed"
			});
		}
	};
};

// Middleware to ensure user can only modify their own data
export const checkSelfOrAdmin = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		if (!req.user) {
			res.status(401).json({
				error: "Authentication required"
			});
			return;
		}

		const requestedUserId = parseInt(req.params.id);

		// Privileged roles may modify anyone; everyone else only themselves.
		// (The old `req.user.username == "system"` escape hatch is gone — the
		// automation account holds the System role, so the role check covers it.)
		if (isPrivilegedRole(req.user.role) || req.user.userId === requestedUserId) {
			next();
			return;
		}

		res.status(403).json({
			error: "You can only modify your own data"
		});
	} catch (error) {
		console.error("Self check error:", error);
		res.status(500).json({
			error: "Authorization check failed"
		});
	}
};

// Middleware to protect routes that only privileged roles should access
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
	try {
		if (!req.user) {
			res.status(401).json({
				error: "Authentication required"
			});
			return;
		}

		if (!isPrivilegedRole(req.user.role)) {
			res.status(403).json({
				error: "Admin access required"
			});
			return;
		}

		next();
	} catch (error) {
		console.error("Admin check error:", error);
		res.status(500).json({
			error: "Authorization check failed"
		});
	}
};

// Combine multiple permission checks
export const checkPermissions = (requiredPermissions: string[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				res.status(401).json({
					error: "Authentication required"
				});
				return;
			}

			// Privileged roles (Admin, System) bypass permission checks
			if (isPrivilegedRole(req.user.role)) {
				next();
				return;
			}

			// Check if user has all required permissions
			const hasAllPermissions = requiredPermissions.every((permission) =>
				req.user!.permissions.includes(permission)
			);

			if (!hasAllPermissions) {
				res.status(403).json({
					error: "Insufficient permissions"
				});
				return;
			}

			next();
		} catch (error) {
			console.error("Multiple permissions check error:", error);
			res.status(500).json({
				error: "Permission check failed"
			});
		}
	};
};
