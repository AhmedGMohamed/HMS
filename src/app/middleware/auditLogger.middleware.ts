import { Request, Response, NextFunction } from "express";
import AuditLogModel from "../models/AuditLog.model.js";
import { CreateAuditLogDTO } from "../utils/types/auditLog.js";

export async function auditLogger (
	req: Request,
	_res: Response,
	next: NextFunction
) {
	const routeDetails: Record<string, Record<string, string>> = {
		GET: {
			// API routes
			"/api/auth/verify": "User verification",
			"/api/dashboard/statistics": "View dashboard statistics",
			"/api/patients/active": "View active patients",
			"/api/services": "View all services",
			"/api/services/search": "Search services",
			"/api/services/suggestions": "Get service suggestions",
			"/api/services/:id": "View service details",
			"/api/services/:id/drugs": "View service related drugs",
			"/api/price-lists": "View all price lists",
			"/api/price-lists/default": "View default price list",
			"/api/price-lists/:id": "View price list details",
			"/api/price-lists/:id/stats": "View price list statistics",
			"/api/users": "View all users",
			"/api/users/:id": "View user details",
			"/api/roles": "View all roles",
			"/api/roles/:id": "View role details",
			"/api/roles/:id/permissions": "View role permissions",
			"/api/permissions": "View all permissions",
			"/api/permissions/:id": "View permission details",
			"/api/permissions/role/:id": "View role permissions",
			"/api/permissions/unassigned/:id": "View unassigned permissions",
			"/api/pharmacy/drugs/cards": "View all drug cards",
			"/api/pharmacy/drugs/cards/:id": "View drug card details",
			"/api/pharmacy/drugs/cards/search/drug": "Search drug cards",
			"/api/pharmacy/drugs/cards/search/suggestions":
				"Get drug card suggestions",
			"/api/pharmacy/drugs/cards/monitor/low-stock":
				"View low stock drugs",
			"/api/pharmacy/drugs/cards/monitor/near-expiry":
				"View near expiry drugs",
			"/api/pharmacy/drugs/shipments": "View all drug shipments",
			"/api/pharmacy/drugs/shipments/:id": "View drug shipment details",
			"/api/pharmacy/drugs/shipments/drug/:id": "View shipments by drug",
			"/api/pharmacy/drugs/shipments/warehouse/:id":
				"View shipments by warehouse",
			"/api/pharmacy/drugs/transactions": "View all drug transactions",
			"/api/pharmacy/drugs/transactions/:id":
				"View drug transaction details",
			"/api/pharmacy/drugs/transactions/search/filtered":
				"Search filtered transactions",
			"/api/pharmacy/drugs/transactions/reports/summary":
				"View transaction summary",
			"/api/pharmacy/usages": "View all drug usages",
			"/api/pharmacy/usages/:id": "View drug usage details",
			"/api/pharmacy/usages/monitor/pending": "View pending drug usages",
			"/api/pharmacy/usages/history": "View drug usage history",
			"/api/pharmacy/warehouses": "View all warehouses",

			// Page routes
			"/dashboard": "View dashboard page",
			"/admin/users": "View system users page",
			"/admin/roles": "View system roles page",
			"/admin/permissions": "View system permissions page",
			"/services": "View services page",
			"/price-lists": "View price lists page",
			"/drugs": "View pharmacy page",

		},
		POST: {
			"/api/auth/login": "User login",
			"/api/services": "Create service",
			"/api/price-lists": "Create price list",
			"/api/users": "Create user",
			"/api/roles": "Create role",
			"/api/permissions": "Create permission",
			"/api/pharmacy/drugs/cards": "Create drug card",
			"/api/pharmacy/drugs/shipments": "Create drug shipment",
			"/api/pharmacy/drugs/transactions": "Create drug transaction",
			"/api/pharmacy/usages": "Create drug usage"
		},
		PUT: {
			"/api/services/:id": "Update service",
			"/api/price-lists/:id": "Update price list",
			"/api/users/:id": "Update user",
			"/api/roles/:id": "Update role",
			"/api/roles/:id/permissions": "Update role permissions",
			"/api/permissions/:id": "Update permission",
			"/api/pharmacy/drugs/cards/:id": "Update drug card",
			"/api/pharmacy/drugs/shipments/:id": "Update drug shipment",
			"/api/pharmacy/usages/:id": "Update drug usage"
		},
		DELETE: {
			"/api/services/:id": "Delete service",
			"/api/price-lists/:id": "Delete price list",
			"/api/users/:id": "Delete user",
			"/api/roles/:id": "Delete role",
			"/api/permissions/:id": "Delete permission",
			"/api/pharmacy/drugs/cards/:id": "Delete drug card",
			"/api/pharmacy/drugs/shipments/:id": "Delete drug shipment",
			"/api/pharmacy/usages/:id": "Delete drug usage"
		},
		actionTypes: {
			GET: "View",
			POST: "Create",
			PUT: "Update",
			DELETE: "Delete"
		}
	};

	console.log(`${req.method} ${req.originalUrl}`);

	const editedUrl = getUrlWithoutParams(req.originalUrl, req.params);
	let log: CreateAuditLogDTO = {
		user_id: req.user?.userId || 0,
		action_type: routeDetails["actionTypes"][req.method],
		details: {
			url: req.originalUrl,
			params: req.params,
			query: req.query as Record<string, string | number>,
			body: req.body,
			description: routeDetails[req.method][editedUrl] || "Unknown"
		}
	};

	await AuditLogModel.createAuditLog(log)

	next();
};

function getUrlWithoutParams(
	originalUrl: string,
	params: { [key: string]: string }
): string {
	let editedUrl = originalUrl;
	const paramKeys = Object.keys(params);

	if (paramKeys) {
		let lastAccessedKey = 0;

		editedUrl = originalUrl
			.split("/")
			.map((subPath: string) => {
				if (
					subPath.includes(params[`${paramKeys[lastAccessedKey]}`]) &&
					lastAccessedKey < paramKeys.length
				) {
					lastAccessedKey++;
					return ":id";
				}
				return subPath;
			})
			.join("/");
	}
	return editedUrl;
}
