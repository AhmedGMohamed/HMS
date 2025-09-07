import { Request, Response } from "express";

interface NavigationItem {
	id: string;
	label: string;
	icon: string;
	url?: string;
	permission?: string;
	role?: string;
	children?: NavigationItem[];
	isHeader?: boolean;
	isActive?: boolean;
}

export class NavigationController {
	async getNavigation(req: Request, res: Response) {
		try {
			if (!req.user) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			const user = req.user;
			const navigation = this.buildNavigationForUser(user);

			res.status(200).json(navigation);
		} catch (error) {
			console.error("Error fetching navigation:", error);
			res.status(500).json({ error: "Failed to fetch navigation" });
		}
	}

	private buildNavigationForUser(user: any): NavigationItem[] {
		const allNavigation: NavigationItem[] = [
			// Dashboard - Available to all
			{
				id: "dashboard",
				label: "Dashboard",
				icon: "bi-speedometer2",
				url: "/dashboard"
			},

			// Administration Header
			{
				id: "admin_header",
				label: "Administration",
				icon: "",
				isHeader: true,
				role: "Admin"
			},

			// User Management - Admin only
			{
				id: "user_management",
				label: "User Management",
				icon: "bi-people",
				role: "Admin",
				children: [
					{
						id: "users",
						label: "Users",
						icon: "bi-person",
						url: "/admin/users"
					},
					{
						id: "roles",
						label: "Roles",
						icon: "bi-shield",
						url: "/admin/roles"
					},
					{
						id: "permissions",
						label: "Permissions",
						icon: "bi-key",
						url: "/admin/permissions"
					}
				]
			},

			// Management Header
			{
				id: "management_header",
				label: "Management",
				icon: "",
				isHeader: true
			},

			// Patient Management
			{
				id: "patient_management",
				label: "Patient Management",
				icon: "bi-person-vcard",
				permission: "manage_patients",
				children: [
					{
						id: "patients",
						label: "Patients",
						icon: "bi-hospital",
						url: "/patients"
					}
				]
			},

			// Employee Management
			{
				id: "employee_management",
				label: "Employee Management",
				icon: "bi-person-badge-fill",
				permission: "manage_employees",
				children: [
					{
						id: "employees",
						label: "Employees",
						icon: "bi-person-fill-gear",
						url: "/employees"
					},
					{
						id: "doctors",
						label: "Doctors",
						icon: "bi-person-heart",
						url: "/doctors"
					},
					{
						id: "nurses",
						label: "Nurses",
						icon: "bi-person-heart",
						url: "/nurses"
					}
				]
			},

			// Clocking
			{
				id: "clocking",
				label: "Clocking",
				icon: "bi-clock-fill",
				url: "/clocking",
				permission: "manage_clocking"
			},

			// Pharmacy
			{
				id: "pharmacy",
				label: "Pharmacy",
				icon: "bi-capsule",
				permission: "manage_pharmacy",
				children: [
					{
						id: "drugs",
						label: "Drugs",
						icon: "bi-capsule-pill",
						url: "/drugs"
					}
				]
			},

			// Services
			{
				id: "services",
				label: "Services",
				icon: "bi-clipboard2-pulse",
				url: "/services",
				permission: "manage_services"
			},

			// Price Lists
			{
				id: "price_lists",
				label: "Price Lists",
				icon: "bi-tag",
				url: "/price-lists",
				permission: "manage_prices"
			},

			// Vault
			{
				id: "vault",
				label: "Vault",
				icon: "bi-safe",
				url: "/vault",
				permission: "view_vault"
			},

			// Reports Header
			{
				id: "reports_header",
				label: "Reports",
				icon: "",
				isHeader: true,
				permission: "view_reports"
			},

			// Reports
			{
				id: "reports",
				label: "Reports",
				icon: "bi-file-earmark-text",
				url: "/reports",
				permission: "view_reports"
			},

			// Insurance Companies
			{
				id: "insurance",
				label: "Insurance Companies",
				icon: "bi bi-shield-check",
				url: "/insurance",
				permission: "view_patients"
			}
		];

		return this.filterNavigationByPermissions(allNavigation, user);
	}

	private filterNavigationByPermissions(
		navigation: NavigationItem[],
		user: any
	): NavigationItem[] {
		const filteredNavigation: NavigationItem[] = [];

		for (const item of navigation) {
			// Check role requirement
			if (item.role && user.role !== item.role) {
				continue;
			}

			// Check permission requirement
			if (item.permission && !this.hasPermission(user, item.permission)) {
				continue;
			}

			// Filter children if they exist
			if (item.children) {
				const filteredChildren = this.filterNavigationByPermissions(
					item.children,
					user
				);
				if (filteredChildren.length > 0) {
					filteredNavigation.push({
						...item,
						children: filteredChildren
					});
				}
			} else {
				filteredNavigation.push(item);
			}
		}

		// Remove headers that have no following items
		return this.cleanupEmptyHeaders(filteredNavigation);
	}

	private cleanupEmptyHeaders(
		navigation: NavigationItem[]
	): NavigationItem[] {
		const cleaned: NavigationItem[] = [];

		for (let i = 0; i < navigation.length; i++) {
			const item = navigation[i];

			if (item.isHeader) {
				// Look ahead to see if there are non-header items after this header
				let hasFollowingItems = false;
				for (let j = i + 1; j < navigation.length; j++) {
					if (!navigation[j].isHeader) {
						hasFollowingItems = true;
						break;
					} else {
						break; // Found another header, stop looking
					}
				}

				if (hasFollowingItems) {
					cleaned.push(item);
				}
			} else {
				cleaned.push(item);
			}
		}

		return cleaned;
	}

	private hasPermission(user: any, permission: string): boolean {
		if (user.role === "Admin") return true;
		return user.permissions && user.permissions.includes(permission);
	}
}

export default new NavigationController();
