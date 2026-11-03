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
					}
				]
			},

			// Patient Management
			{
				id: "patients",
				label: "Patients",
				icon: "bi-hospital",
				url: "/patients",
				permission: "manage_patients"
			},

			// Employee Management

			{
				id: "employees",
				label: "Employees",
				icon: "bi-person-badge-fill",
				url: "/employees",
				permission: "manage_employees"
			},

			// Clocking
			{
				id: "clocking",
				label: "Clocking",
				icon: "bi-clock-fill",
				url: "/clocking",
				permission: "manage_clocking"
			},

			// Services
			{
				id: "services",
				label: "Services",
				icon: "bi-clipboard2-pulse",
				url: "/services",
				permission: "manage_services"
			},

			// Pharmacy
			{
				id: "pharmacy",
				label: "Pharmacy",
				icon: "bi-capsule",
				url: "/drugs",
				permission: "manage_pharmacy"
			},

			// Medical Supplies
			{
				id: "supplies",
				label: "Medical Supplies",
				icon: "bi-bandaid-fill",
				url: "/supplies",
				permission: "manage_pharmacy"
			},

			// Price Lists
			{
				id: "price_lists",
				label: "Price Lists",
				icon: "bi-tag",
				url: "/price-lists",
				permission: "manage_prices"
			},

			// Insurance Companies
			{
				id: "insurance",
				label: "Insurance Companies",
				icon: "bi bi-shield-check",
				url: "/insurance",
				permission: "manage_insurance"
			},

			// Vault
			{
				id: "vault",
				label: "Vault",
				icon: "bi-safe",
				url: "/vault",
				permission: "view_vault"
			},

			// Reports
			{
				id: "reports",
				label: "Reports",
				icon: "bi-file-earmark-text",
				url: "/reports",
				permission: "view_reports"
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
