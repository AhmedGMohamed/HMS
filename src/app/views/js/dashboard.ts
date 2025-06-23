//@ts-ignore
import "./chart.js/chart.js";
//@ts-ignore
import Swal from "./sweetalert2/src/sweetalert2.js";

interface User {
	userId: number;
	username: string;
	role: string;
	permissions: string[];
}

class DashboardManager {
	private user: User | null = null;
	private sidebarCollapse: HTMLElement;
	private sidebar: HTMLElement;
	private logoutBtn: HTMLElement;
	private revenueChart: any | null = null;
	private patientDistributionChart: any | null = null;

	constructor() {
		// Initialize elements
		this.sidebarCollapse = document.getElementById("sidebarCollapse")!;
		this.sidebar = document.getElementById("sidebar")!;
		this.logoutBtn = document.getElementById("logoutBtn")!;

		// Bind event listeners
		this.sidebarCollapse.addEventListener(
			"click",
			this.toggleSidebar.bind(this)
		);
		this.logoutBtn.addEventListener("click", this.handleLogout.bind(this));

		// Initialize dashboard
		this.initializeDashboard();
	}

	private async initializeDashboard(): Promise<void> {
		try {
			await this.verifyAuth();
			this.loadUserInfo();
			await this.checkPageAccess(); // Add page access check

			await Promise.all([
				this.loadStatistics(),
				this.initializeCharts(),
				this.loadRecentActivity()
			]);
		} catch (error) {
			console.error("Dashboard initialization error:", error);
			//this.handleAuthError();
		}
	}

	private async verifyAuth(): Promise<void> {
		const token = localStorage.getItem("token");
		if (!token) {
			throw new Error("No authentication token found");
		}

		try {
			const response = await fetch("/api/auth/verify", {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				throw new Error("Token verification failed");
			}
		} catch (error) {
			throw new Error("Authentication verification failed");
		}
	}

	private loadUserInfo(): void {
		const userString = localStorage.getItem("user");
		if (!userString) {
			this.handleAuthError();
			return;
		}

		this.user = JSON.parse(userString);

		// Update welcome message and profile info
		this.updateUserDisplay();

		// Handle permission-based visibility
		this.handlePermissionBasedVisibility();
	}

	private async loadStatistics(): Promise<void> {
		try {
			const token = localStorage.getItem("token");
			const response = await fetch("/api/dashboard/statistics", {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				throw new Error("Failed to load statistics");
			}

			const stats = await response.json();

			typeof stats.todayRevenue == "string"
				? (stats.todayRevenue = parseFloat(stats.todayRevenue).toFixed(
						2
				  ))
				: (stats.todayRevenue = stats.todayRevenue.toFixed(2));
			
			// Update statistics cards
			document.getElementById("activePatients")!.textContent =
				stats.activePatientsCount.toString();
			document.getElementById(
				"todayRevenue"
			)!.textContent = `$${stats.todayRevenue}`;
			document.getElementById("lowStockItemsCount")!.textContent =
				stats.lowStockItemsCount.toString();
			//document.getElementById("appointmentsCount")!.textContent =
			//	stats.admissions.toString();
		} catch (error) {
			console.error("Error loading statistics:", error);
			// Show error toast
			Swal.fire({
				icon: "error",
				title: "Error",
				text: "Failed to load dashboard statistics",
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		}
	}

	private async initializeCharts(): Promise<void> {
		// Revenue Chart
		const revenueCtx = document.getElementById(
			"revenueChart"
		) as HTMLCanvasElement;
		//@ts-ignore
		this.revenueChart = new Chart(revenueCtx, {
			type: "line",
			data: {
				labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
				datasets: [
					{
						label: "Revenue",
						data: [12000, 19000, 15000, 25000, 22000, 30000],
						fill: true,
						borderColor: "rgb(75, 192, 192)",
						tension: 0.4
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: "top"
					}
				}
			}
		});

		// Patient Distribution Chart
		const distributionCtx = document.getElementById(
			"patientDistributionChart"
		) as HTMLCanvasElement;
		//@ts-ignore
		this.patientDistributionChart = new Chart(distributionCtx, {
			type: "doughnut",
			data: {
				labels: ["Inpatient", "Outpatient", "Emergency"],
				datasets: [
					{
						data: [300, 500, 200],
						backgroundColor: [
							"rgb(255, 99, 132)",
							"rgb(54, 162, 235)",
							"rgb(255, 205, 86)"
						]
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: "bottom"
					}
				}
			}
		});
	}

	private async loadRecentActivity(): Promise<void> {
		try {
			const token = localStorage.getItem("token");
			const response = await fetch("/api/logs/page/1", {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				throw new Error("Failed to load recent activity");
			}

			const activities = await response.json();
			const tableBody = document.getElementById("recentActivityTable")!;

			tableBody.innerHTML = activities
				.map((activity: any) => {
					let badgeType: string;
					switch (activity.action_type) {
						case "View":
							badgeType = "info";
							break;
						case "Create":
							badgeType = "success";
							break;
						case "Update":
							badgeType = "primary";
							break;
						case "Delete":
							badgeType = "danger";
							break;

						default:
							badgeType = "info";
					}

					return `
                <tr>
                    <td>${new Date(activity.timestamp).toLocaleString()}</td>
					<td>${activity.username}</td>
                    <td>
					<span class="badge bg-${badgeType} ">
						${activity.action_type}
                        </span>
					</td>
					<td>${activity.details.description}</td>
                </tr>
            `;
				})
				.join("");
		} catch (error) {
			console.error("Error loading recent activity:", error);
			document.getElementById("recentActivityTable")!.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger">
                        Failed to load recent activity
                    </td>
                </tr>
            `;
		}
	}

	private toggleSidebar(): void {
		this.sidebar.classList.toggle("active");
		// Redraw charts to fit new container size
		if (this.revenueChart) {
			setTimeout(() => this.revenueChart!.resize(), 300);
		}
		if (this.patientDistributionChart) {
			setTimeout(() => this.patientDistributionChart!.resize(), 300);
		}
	}

	private async handleLogout(): Promise<void> {
		try {
			const result = await Swal.fire({
				title: "Logout Confirmation",
				text: "Are you sure you want to logout?",
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Yes, logout"
			});

			if (result.isConfirmed) {
				// Clear local storage
				localStorage.removeItem("token");
				localStorage.removeItem("user");

				// Show success message
				await Swal.fire({
					icon: "success",
					title: "Logged Out Successfully",
					text: "You have been logged out of the system.",
					timer: 1500,
					showConfirmButton: false
				});

				// Redirect to login page
				window.location.href = "/login";
			}
		} catch (error) {
			console.error("Logout error:", error);
			Swal.fire({
				icon: "error",
				title: "Logout Failed",
				text: "An error occurred during logout. Please try again."
			});
		}
	}

	private handleAuthError(): void {
		// Clear local storage
		localStorage.removeItem("token");
		localStorage.removeItem("user");

		// Show error message
		Swal.fire({
			icon: "error",
			title: "Authentication Error",
			text: "Please log in again to continue.",
			confirmButtonColor: "#0d6efd"
		}).then(() => {
			// Redirect to login page
			window.location.href = "/login";
		});
	}

	private updateUserDisplay(): void {
		if (!this.user) return;

		// Update welcome message
		const welcomeName = document.getElementById("welcomeName");
		if (welcomeName) {
			welcomeName.textContent = this.user.username;
		}

		// Update sidebar profile
		const userFullName = document.getElementById("userFullName");
		const userRole = document.getElementById("userRole");

		if (userFullName) {
			userFullName.textContent = this.user.username;
		}
		if (userRole) {
			userRole.textContent = this.user.role;
		}
	}

	private handlePermissionBasedVisibility(): void {
		if (!this.user) return;

		// Handle role-based visibility
		const roleElements = document.querySelectorAll("[data-requires-role]");
		roleElements.forEach((element) => {
			const requiredRole = element.getAttribute("data-requires-role");
			if (requiredRole && this.user!.role !== requiredRole) {
				element.remove();
			}
		});

		// Handle permission-based visibility
		const permissionElements = document.querySelectorAll(
			"[data-requires-permission]"
		);
		permissionElements.forEach((element) => {
			const requiredPermission = element.getAttribute(
				"data-requires-permission"
			);
			if (requiredPermission && !this.hasPermission(requiredPermission)) {
				element.remove();
			}
		});

		// Clean up empty sections
		this.cleanupEmptySections();
	}

	private hasPermission(permission: string): boolean {
		if (!this.user) return false;

		// Admin role has all permissions
		if (this.user.role === "Admin") return true;

		return this.user.permissions.includes(permission);
	}

	private cleanupEmptySections(): void {
		// Remove headers that have no visible items following them
		const headers = document.querySelectorAll(".nav-item-header");
		headers.forEach((header) => {
			let nextElement = header.nextElementSibling;
			while (
				nextElement &&
				nextElement.tagName !== "LI" &&
				!nextElement.classList.contains("nav-item-header")
			) {
				nextElement = nextElement.nextElementSibling;
			}

			if (
				!nextElement ||
				nextElement.classList.contains("nav-item-header")
			) {
				header.remove();
			}
		});
	}

	// Add permission check for page access
	private async checkPageAccess(): Promise<void> {
		if (!this.user) {
			this.handleAuthError();
			return;
		}

		// Get current page path
		const path = window.location.pathname;

		// Define page permission requirements
		const pagePermissions: Record<string, string> = {
			"/users": "Admin",
			"/roles": "Admin",
			"/permissions": "Admin",
			"/patients": "manage_patients",
			"/admissions": "manage_patients",
			"/drugs": "manage_pharmacy",
			"/inventory": "manage_pharmacy",
			"/services": "manage_services",
			"/price-lists": "manage_prices",
			"/reports": "view_reports"
		};

		const requiredPermission = pagePermissions[path];
		if (requiredPermission) {
			if (requiredPermission === "Admin" && this.user.role !== "Admin") {
				this.handleUnauthorizedAccess();
			} else if (
				requiredPermission !== "Admin" &&
				!this.hasPermission(requiredPermission)
			) {
				this.handleUnauthorizedAccess();
			}
		}
	}

	private handleUnauthorizedAccess(): void {
		Swal.fire({
			icon: "error",
			title: "Access Denied",
			text: "You do not have permission to access this page.",
			confirmButtonColor: "#0d6efd"
		}).then(() => {
			window.location.href = "/dashboard";
		});
	}
}

// Initialize dashboard when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	new DashboardManager();
});
