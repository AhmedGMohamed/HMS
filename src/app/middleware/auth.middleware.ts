// src/app/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JWTPayload {
	userId: number;
	username: string;
	role: string;
	permissions: string[];
}

export const verifyToken = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const authCookie = req.cookies["auth"];
		const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>
		let decoded: JWTPayload;

		if (authCookie) {
			decoded = jwt.verify(
				authCookie,
				process.env.JWT_SECRET || "your-secret-key"
			) as JWTPayload;
			req.user = decoded;
			next();
			return;
		}

		if (token) {
			const decoded = jwt.verify(
				token,
				process.env.JWT_SECRET || "your-secret-key"
			) as JWTPayload;
			req.user = decoded
			next();
			return;
		}

		res.status(401).json({ error: "No token provided" });
	} catch (error) {
		if (error instanceof jwt.JsonWebTokenError) {
			res.status(401).json({ error: "Invalid token" });
			return;
		}
		if (error instanceof jwt.TokenExpiredError) {
			res.status(401).json({ error: "Token expired" });
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

			// Admin role bypasses permission check
			if (req.user.role === "Admin") {
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

		// Allow if user is admin or if user is modifying their own data
		if (req.user.role === "Admin" || req.user.username == "system" || req.user.userId === requestedUserId) {
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

// Middleware to protect routes that only admins should access
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
	try {
		if (!req.user) {
			res.status(401).json({
				error: "Authentication required"
			});
			return;
		}

		if (req.user.role !== "Admin") {
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

			// Admin role bypasses permission check
			if (req.user.role === "Admin") {
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
