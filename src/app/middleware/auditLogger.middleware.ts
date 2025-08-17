// Enhanced src/app/middleware/auditLogger.middleware.ts
import { Request, Response, NextFunction } from "express";
import AuditLogModel from "../models/AuditLog.model.js";
import { CreateAuditLogDTO } from "../utils/types/auditLog.js";

export async function auditLogger(
	req: Request,
	_res: Response,
	next: NextFunction
) {
	const routeDetails: Record<string, Record<string, string>> = {
		GET: {
			// API routes
			"/api/auth/verify": "User verification",
			"/api/dashboard/statistics": "View dashboard statistics",

			// Patient routes
			"/api/patients": "View all patients",
			"/api/patients/active": "View active patients",
			"/api/patients/search": "Search patients",
			"/api/patients/suggestions": "Get patient suggestions",
			"/api/patients/:id": "View patient details",
			"/api/patients/:id/history": "View patient history",
			"/api/patients/:id/admission/current": "View current admission",

			// Service routes
			"/api/services": "View all services",
			"/api/services/search": "Search services",
			"/api/services/suggestions": "Get service suggestions",
			"/api/services/:id": "View service details",
			"/api/services/:id/drugs": "View service related drugs",

			// Price list routes
			"/api/price-lists": "View all price lists",
			"/api/price-lists/default": "View default price list",
			"/api/price-lists/:id": "View price list details",
			"/api/price-lists/:id/stats": "View price list statistics",

			// User and role routes
			"/api/users": "View all users",
			"/api/users/:id": "View user details",
			"/api/roles": "View all roles",
			"/api/roles/:id": "View role details",
			"/api/roles/:id/permissions": "View role permissions",
			"/api/permissions": "View all permissions",
			"/api/permissions/:id": "View permission details",
			"/api/permissions/role/:id": "View role permissions",
			"/api/permissions/unassigned/:id": "View unassigned permissions",

			// Pharmacy routes
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

			// Employee routes
			"/api/employees": "View all employees",
			"/api/employees/:id": "View employee details",
			"/api/employees/search": "Search employees by name",
			"/api/doctors": "View all doctors",
			"/api/doctors/:id": "View doctor details",
			"/api/doctors/search": "Search doctors by name",
			"/api/employee-payments": "View all employee payments",
			"/api/employee-payments/:id": "View employee payment details",
			"/api/employee-payments/unpaid-system":
				"View unpaid system-generated payments",
			"/api/employee-payments/paid/employee/:id":
				"View paid payments by employee",
			"/api/employee-payments/employee/:id": "View payments by employee",
			"/api/clock-ins": "View all clock-ins",
			"/api/clock-ins/:id": "View clock-in details",
			"/api/clock-ins/employee/:id": "View clock-ins by employee",

			// Page routes
			"/dashboard": "View dashboard page",
			"/admin/users": "View system users page",
			"/admin/roles": "View system roles page",
			"/admin/permissions": "View system permissions page",
			"/services": "View services page",
			"/price-lists": "View price lists page",
			"/drugs": "View pharmacy page",
			"/employees": "View employees page",
			"/doctors": "View doctors page",
			"/clocking": "View clocking page"
		},
		POST: {
			"/api/auth/login": "User login",

			// Patient routes
			"/api/patients": "Create patient",
			"/api/patients/:id/admit": "Admit patient",
			"/api/patients/:id/discharge": "Discharge patient",
			"/api/patients/:id/services": "Add service to patient",

			// Service routes
			"/api/services": "Create service",

			// Price list routes
			"/api/price-lists": "Create price list",

			// User and role routes
			"/api/users": "Create user",
			"/api/roles": "Create role",
			"/api/permissions": "Create permission",

			// Pharmacy routes
			"/api/pharmacy/drugs/cards": "Create drug card",
			"/api/pharmacy/drugs/shipments": "Create drug shipment",
			"/api/pharmacy/drugs/transactions": "Create drug transaction",
			"/api/pharmacy/usages": "Create drug usage",

			// Employee routes
			"/api/employees": "Create employee",
			"/api/doctors": "Create doctor",
			"/api/employee-payments": "Create employee payment",
			"/api/clock-ins": "Create clock-in"
		},
		PUT: {
			// Patient routes
			"/api/patients/:id": "Update patient",
			"/api/patients/:id/diagnosis": "Update patient diagnosis",

			// Service routes
			"/api/services/:id": "Update service",

			// Price list routes
			"/api/price-lists/:id": "Update price list",

			// User and role routes
			"/api/users/:id": "Update user",
			"/api/roles/:id": "Update role",
			"/api/roles/:id/permissions": "Update role permissions",
			"/api/permissions/:id": "Update permission",

			// Pharmacy routes
			"/api/pharmacy/drugs/cards/:id": "Update drug card",
			"/api/pharmacy/drugs/shipments/:id": "Update drug shipment",
			"/api/pharmacy/usages/:id": "Update drug usage",

			// Employee routes
			"/api/employees/:id": "Update employee",
			"/api/doctors/:id": "Update doctor",
			"/api/employee-payments/:id": "Update employee payment",
			"/api/employee-payments/:id/paid": "Mark employee payment as paid",
			"/api/employee-payments/:id/void": "Void employee payment",
			"/api/clock-ins/:id": "Update clock-in"
		},
		DELETE: {
			// Patient routes
			"/api/patients/:id/services/:serviceId":
				"Remove service from patient",

			// Service routes
			"/api/services/:id": "Delete service",

			// Price list routes
			"/api/price-lists/:id": "Delete price list",

			// User and role routes
			"/api/users/:id": "Delete user",
			"/api/roles/:id": "Delete role",
			"/api/permissions/:id": "Delete permission",

			// Pharmacy routes
			"/api/pharmacy/drugs/cards/:id": "Delete drug card",
			"/api/pharmacy/drugs/shipments/:id": "Delete drug shipment",
			"/api/pharmacy/usages/:id": "Delete drug usage",

			// Employee routes
			"/api/employees/:id": "Delete employee",
			"/api/doctors/:id": "Delete doctor"
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

	await AuditLogModel.createAuditLog(log);

	next();
}

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
