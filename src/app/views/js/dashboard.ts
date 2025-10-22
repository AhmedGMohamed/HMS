//@ts-ignore
import "./chart.js/chart.js";
//@ts-ignore
import Swal from "./sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "./shared/sidebar.js";
import { i18n } from "./utils/i18n.js";

interface User {
	userId: number;
	username: string;
	role: string;
	permissions: string[];
}

interface ChartDataPoint {
	date: string;
	revenue: number;
	profit: number;
	patient_revenue: number;
	pharmacy_revenue: number;
	patient_profit: number;
	pharmacy_profit: number;
}

class DashboardManager {
	private user: User | null = null;
	private revenueChart: any | null = null;
	private distributionChart: any | null = null;
	private currentDistributionView: "revenue" | "profit" = "revenue";
	private isDashboardAdmin: boolean = false;

	constructor() {
		// Wait for i18n to initialize
		this.waitForI18n().then(() => {
			// Initialize sidebar manager
			new SidebarManager();

			// Initialize dashboard
			this.initializeDashboard();

			// Listen for locale changes
			window.addEventListener("localeChanged", () => {
				this.handleLocaleChange();
			});
		});
	}

	private async waitForI18n(): Promise<void> {
		// Wait for i18n to be initialized
		if (i18n) {
			await i18n.init();
		}
	}

	private async initializeDashboard(): Promise<void> {
		try {
			await this.verifyAuth();
			this.loadUserInfo();
			await this.checkPageAccess();

			// Check permissions
			this.isDashboardAdmin = this.hasPermission("view_dashboard");

			if (this.isDashboardAdmin) {
				await this.loadAdminDashboard();
			} else {
				await this.loadUserDashboard();
			}

			await this.loadRecentActivity();
		} catch (error) {
			console.error("Dashboard initialization error:", error);
			this.handleAuthError();
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

		// Update welcome message with i18n
		const welcomeName = document.getElementById("welcomeName");
		if (welcomeName && this.user) {
			welcomeName.textContent = this.user.username;
		}

		// Update document title
		document.title = i18n.t("dashboard.title");
	}

	private async loadAdminDashboard(): Promise<void> {
		try {
			// Show admin dashboard
			const adminDashboard = document.getElementById("adminDashboard");
			if (adminDashboard) {
				adminDashboard.style.display = "block";
			}

			await Promise.all([
				this.loadStatistics(true),
				this.initializeCharts()
			]);

			this.setupEventListeners();
		} catch (error) {
			console.error("Error loading admin dashboard:", error);
			this.showErrorToast(i18n.t("errors.loadDashboardError"));
		}
	}

	private async loadUserDashboard(): Promise<void> {
		try {
			// Show user dashboard
			const userDashboard = document.getElementById("userDashboard");
			if (userDashboard) {
				userDashboard.style.display = "block";
			}

			// Load and display available navigation links
			await Promise.all([
				this.loadStatistics(false),
				this.loadAvailableLinks()
			]);
		} catch (error) {
			console.error("Error loading user dashboard:", error);
			this.showErrorToast(i18n.t("errors.loadDashboardError"));
		}
	}

	private async loadAvailableLinks(): Promise<void> {
		try {
			const token = localStorage.getItem("token");
			const response = await fetch("/navigation", {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				throw new Error("Failed to fetch navigation");
			}

			const navigation: any[] = await response.json();
			this.displayAvailableLinks(navigation);
		} catch (error) {
			console.error("Error loading available links:", error);
			const container = document.getElementById(
				"availableLinksContainer"
			);
			if (container) {
				container.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-exclamation-triangle text-warning" style="font-size: 3rem;"></i>
                    <p class="mt-3 text-muted">${i18n.t(
						"errors.loadFeaturesError"
					)}</p>
                </div>
            `;
			}
		}
	}

	private displayAvailableLinks(navigation: any[]): void {
		const container = document.getElementById("availableLinksContainer");
		if (!container) return;

		// Filter out headers and flatten the navigation
		const availableLinks = this.flattenNavigation(navigation);

		if (availableLinks.length === 0) {
			container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-info-circle text-info" style="font-size: 3rem;"></i>
                <p class="mt-3 text-muted">${i18n.t(
					"dashboard.userDashboard.noFeatures"
				)}</p>
            </div>
        `;
			return;
		}

		// Group links by category for better organization
		const groupedLinks = this.groupLinksByCategory(availableLinks);

		let html = "";

		for (const [category, links] of Object.entries(groupedLinks)) {
			if (links.length === 0) continue;

			// Translate category name
			const categoryKey = this.getCategoryTranslationKey(category);
			const translatedCategory = i18n.t(categoryKey);

			html += `
            <div class="mb-4">
                <h6 class="text-uppercase text-muted mb-3">${translatedCategory}</h6>
                <div class="row">
        `;

			links.forEach((link: any) => {
				html += `
                <div class="col-md-4 col-lg-3 mb-3">
                    <a href="${link.url}" class="text-decoration-none">
                        <div class="card feature-card h-100 border-0 shadow-sm">
                            <div class="card-body text-center p-4">
                                <div class="feature-icon mb-3">
                                    <i class="${
										link.icon
									}" style="font-size: 2.5rem; color: #0d6efd;"></i>
                                </div>
                                <h6 class="card-title mb-2">${this.escapeHtml(
									this.translateNavLabel(link.id)
								)}</h6>
                                <p class="card-text text-muted small">
                                    ${i18n.t(
										`dashboard.featureDescriptions.${link.id}`
									)}
                                </p>
                            </div>
                        </div>
                    </a>
                </div>
            `;
			});

			html += `
                </div>
            </div>
        `;
		}

		container.innerHTML = html;
	}

	private getCategoryTranslationKey(category: string): string {
		const keyMap: { [key: string]: string } = {
			"Patient Care": "dashboard.userDashboard.categories.patientCare",
			"Employee Management":
				"dashboard.userDashboard.categories.employeeManagement",
			Pharmacy: "dashboard.userDashboard.categories.pharmacy",
			Administration: "dashboard.userDashboard.categories.administration",
			System: "dashboard.userDashboard.categories.system",
			Other: "dashboard.userDashboard.categories.other"
		};
		return keyMap[category] || "dashboard.userDashboard.categories.other";
	}

	private translateNavLabel(id: string): string {
		// Try to get translation from sidebar translations
		const sidebarKey = `sidebar.${id}`;
		const translation = i18n.t(sidebarKey);

		// If translation returns the key itself, it means it wasn't found
		return translation === sidebarKey ? id : translation;
	}

	private async loadStatistics(isAdmin: boolean): Promise<void> {
		try {
			const token = localStorage.getItem("token");
			const response = await fetch(
				`/api/dashboard/${isAdmin ? "admin" : "user"}-statistics`,
				{
					headers: {
						Authorization: `Bearer ${token}`
					}
				}
			);

			if (!response.ok) {
				throw new Error("Failed to load admin statistics");
			}

			const stats = await response.json();

			// Safely update statistics with formatted values
			if (!isAdmin) {
				this.updateStatElement(
					"lowStockItemsCountUser",
					i18n.formatNumber(stats.lowStockItemsCount || 0, 0)
				);
				this.updateStatElement(
					"nearExpiryItemsCountUser",
					i18n.formatNumber(stats.nearExpiryItemsCount || 0, 0)
				);
			}
			this.updateStatElement(
				"activePatients",
				i18n.formatNumber(stats.activePatientsCount || 0, 0)
			);
			this.updateStatElement(
				"todayRevenue",
				i18n.formatCurrency(parseFloat(stats.todayRevenue || 0))
			);
			this.updateStatElement(
				"lowStockItemsCount",
				i18n.formatNumber(stats.lowStockItemsCount || 0, 0)
			);
			this.updateStatElement(
				"nearExpiryItemsCount",
				i18n.formatNumber(stats.nearExpiryItemsCount || 0, 0)
			);
			this.updateStatElement(
				"todayProfit",
				i18n.formatCurrency(parseFloat(stats.todayProfit || 0))
			);
		} catch (error) {
			console.error("Error loading admin statistics:", error);
			this.showErrorToast(i18n.t("errors.loadStatisticsError"));
		}
	}

	private updateStatElement(id: string, value: string): void {
		const element = document.getElementById(id);
		if (element) {
			element.textContent = value;
		}
	}

	private async initializeCharts(): Promise<void> {
		try {
			const chartData = await this.fetchChartData();
			this.createRevenueChart(chartData);
			this.createDistributionChart(chartData);
		} catch (error) {
			console.error("Error initializing charts:", error);
			this.showErrorToast(i18n.t("errors.loadChartError"));
		}
	}

	private async fetchChartData(): Promise<ChartDataPoint[]> {
		const token = localStorage.getItem("token");
		const response = await fetch("/api/dashboard/chart-data", {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});

		if (!response.ok) {
			throw new Error("Failed to fetch chart data");
		}

		return await response.json();
	}

	private createRevenueChart(data: ChartDataPoint[]): void {
		const ctx = document.getElementById(
			"revenueChart"
		) as HTMLCanvasElement;
		if (!ctx) return;

		const labels = data.map((d) => i18n.formatDate(new Date(d.date)));
		const revenueData = data.map((d) => parseFloat(d.revenue.toString()));
		const profitData = data.map((d) => parseFloat(d.profit.toString()));

		//@ts-ignore
		this.revenueChart = new Chart(ctx, {
			type: "line",
			data: {
				labels: labels,
				datasets: [
					{
						label: i18n.t("dashboard.charts.revenue"),
						data: revenueData,
						borderColor: "rgb(75, 192, 192)",
						backgroundColor: "rgba(75, 192, 192, 0.1)",
						fill: false,
						tension: 0.4
					},
					{
						label: i18n.t("dashboard.charts.profit"),
						data: profitData,
						borderColor: "rgb(255, 99, 132)",
						backgroundColor: "rgba(255, 99, 132, 0.1)",
						fill: "-1",
						tension: 0.4
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							callback: function (value: any) {
								return i18n.formatCurrency(value);
							}
						}
					}
				},
				plugins: {
					legend: {
						position: "top" as const,
						rtl: i18n.isRTL()
					},
					tooltip: {
						rtl: i18n.isRTL(),
						callbacks: {
							label: function (context: any) {
								return (
									context.dataset.label +
									": " +
									i18n.formatCurrency(context.parsed.y)
								);
							}
						}
					}
				},
				interaction: {
					intersect: false,
					mode: "index" as const
				}
			}
		});
	}

	private createDistributionChart(data: ChartDataPoint[]): void {
		const ctx = document.getElementById(
			"distributionChart"
		) as HTMLCanvasElement;
		if (!ctx) return;

		// Calculate totals for the period
		const totals = data.reduce(
			(acc, d) => ({
				patientRevenue:
					acc.patientRevenue +
					parseFloat(d.patient_revenue.toString()),
				pharmacyRevenue:
					acc.pharmacyRevenue +
					parseFloat(d.pharmacy_revenue.toString()),
				patientProfit:
					acc.patientProfit + parseFloat(d.patient_profit.toString()),
				pharmacyProfit:
					acc.pharmacyProfit +
					parseFloat(d.pharmacy_profit.toString())
			}),
			{
				patientRevenue: 0,
				pharmacyRevenue: 0,
				patientProfit: 0,
				pharmacyProfit: 0
			}
		);

		//@ts-ignore
		this.distributionChart = new Chart(ctx, {
			type: "doughnut",
			data: {
				labels: [
					i18n.t("dashboard.charts.patientServices"),
					i18n.t("dashboard.charts.pharmacySales")
				],
				datasets: [
					{
						data: [totals.patientRevenue, totals.pharmacyRevenue],
						backgroundColor: [
							"rgb(54, 162, 235)",
							"rgb(255, 205, 86)"
						],
						borderWidth: 2
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: "bottom" as const,
						rtl: i18n.isRTL()
					},
					tooltip: {
						rtl: i18n.isRTL(),
						callbacks: {
							label: function (context: any) {
								const total = context.dataset.data.reduce(
									(a: number, b: number) => a + b,
									0
								);
								const percentage = (
									(context.raw / total) *
									100
								).toFixed(1);
								return (
									context.label +
									": " +
									i18n.formatCurrency(context.raw) +
									" (" +
									percentage +
									"%)"
								);
							}
						}
					}
				}
			}
		});
	}

	private setupEventListeners(): void {
		// Chart toggle buttons
		const revenueToggle = document.getElementById(
			"revenueToggle"
		) as HTMLInputElement;
		const profitToggle = document.getElementById(
			"profitToggle"
		) as HTMLInputElement;

		if (revenueToggle && profitToggle) {
			revenueToggle.addEventListener("change", () => {
				if (revenueToggle.checked) {
					this.switchDistributionView("revenue");
				}
			});

			profitToggle.addEventListener("change", () => {
				if (profitToggle.checked) {
					this.switchDistributionView("profit");
				}
			});
		}

		// Handle sidebar resize for charts
		const sidebarCollapse = document.getElementById("sidebarCollapse");
		if (sidebarCollapse) {
			sidebarCollapse.addEventListener("click", () => {
				setTimeout(() => {
					if (this.revenueChart) {
						this.revenueChart.resize();
					}
					if (this.distributionChart) {
						this.distributionChart.resize();
					}
				}, 300);
			});
		}
	}

	private async switchDistributionView(
		view: "revenue" | "profit"
	): Promise<void> {
		if (!this.distributionChart || this.currentDistributionView === view)
			return;

		try {
			this.currentDistributionView = view;
			const chartData = await this.fetchChartData();

			const totals = chartData.reduce(
				(acc, d) => ({
					patientRevenue:
						acc.patientRevenue +
						parseFloat(d.patient_revenue.toString()),
					pharmacyRevenue:
						acc.pharmacyRevenue +
						parseFloat(d.pharmacy_revenue.toString()),
					patientProfit:
						acc.patientProfit +
						parseFloat(d.patient_profit.toString()),
					pharmacyProfit:
						acc.pharmacyProfit +
						parseFloat(d.pharmacy_profit.toString())
				}),
				{
					patientRevenue: 0,
					pharmacyRevenue: 0,
					patientProfit: 0,
					pharmacyProfit: 0
				}
			);

			if (view === "revenue") {
				this.distributionChart.data.datasets[0].data = [
					totals.patientRevenue,
					totals.pharmacyRevenue
				];
			} else {
				this.distributionChart.data.datasets[0].data = [
					totals.patientProfit,
					totals.pharmacyProfit
				];
			}

			this.distributionChart.update();
		} catch (error) {
			console.error("Error switching distribution view:", error);
			this.showErrorToast(i18n.t("errors.loadChartError"));
		}
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
			const tableBody = document.getElementById("recentActivityTable");
			if (!tableBody) return;

			if (activities.length === 0) {
				tableBody.innerHTML = `
					<tr>
						<td colspan="4" class="text-center text-muted">
							${i18n.t("common.noData")}
						</td>
					</tr>
				`;
				return;
			}

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
							badgeType = "secondary";
					}

					return `
						<tr>
							<td>${i18n.formatDateTime(new Date(activity.timestamp))}</td>
							<td>${this.escapeHtml(activity.username || "Unknown")}</td>
							<td>
								<span class="badge bg-${badgeType}">
									${this.escapeHtml(activity.action_type)}
								</span>
							</td>
							<td>${this.escapeHtml(
								activity.details?.description ||
									i18n.t("common.noData")
							)}</td>
						</tr>
					`;
				})
				.join("");
		} catch (error) {
			console.error("Error loading recent activity:", error);
			const tableBody = document.getElementById("recentActivityTable");
			if (tableBody) {
				tableBody.innerHTML = `
					<tr>
						<td colspan="4" class="text-center text-danger">
							${i18n.t("errors.loadActivityError")}
						</td>
					</tr>
				`;
			}
		}
	}

	private handleLocaleChange(): void {
		// Reload statistics with new formatting
		this.loadStatistics(this.isDashboardAdmin ? true : false);

		// Recreate charts with new labels
		if (this.revenueChart && this.distributionChart) {
			this.fetchChartData().then((data) => {
				// Destroy old charts
				this.revenueChart.destroy();
				this.distributionChart.destroy();

				// Create new charts with translated labels
				this.createRevenueChart(data);
				this.createDistributionChart(data);
			});
		}

		// Reload recent activity with new date formatting
		this.loadRecentActivity();

		// Update user dashboard if applicable
		if (!this.isDashboardAdmin) {
			this.loadAvailableLinks();
		}
	}

	private escapeHtml(text: string): string {
		const map: { [key: string]: string } = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#039;"
		};
		return text.replace(/[&<>"']/g, (m) => map[m]);
	}

	private showErrorToast(message: string): void {
		Swal.fire({
			icon: "error",
			title: i18n.t("common.error"),
			text: message,
			toast: true,
			position: "top-end",
			showConfirmButton: false,
			timer: 3000,
			timerProgressBar: true
		});
	}

	private hasPermission(permission: string): boolean {
		if (!this.user) return false;

		// Admin role has all permissions
		if (this.user.role === "Admin") return true;

		return this.user.permissions.includes(permission);
	}

	private async checkPageAccess(): Promise<void> {
		if (!this.user) {
			this.handleAuthError();
			return;
		}

		// Dashboard access is allowed for all authenticated users
		// Different content is shown based on permissions
	}

	private flattenNavigation(navigation: any[]): any[] {
		const flattened: any[] = [];

		for (const item of navigation) {
			if (item.isHeader) {
				continue; // Skip headers
			}

			if (item.children && item.children.length > 0) {
				// Add children instead of parent
				flattened.push(...item.children);
			} else if (item.url && item.id !== "dashboard") {
				// Add regular items (exclude dashboard since we're on it)
				flattened.push(item);
			}
		}

		return flattened;
	}

	private groupLinksByCategory(links: any[]): { [key: string]: any[] } {
		const groups: { [key: string]: any[] } = {
			"Patient Care": [],
			"Employee Management": [],
			Pharmacy: [],
			Administration: [],
			System: [],
			Other: []
		};

		for (const link of links) {
			if (["patients", "admissions"].includes(link.id)) {
				groups["Patient Care"].push(link);
			} else if (
				["employees", "doctors", "nurses", "clocking"].includes(link.id)
			) {
				groups["Employee Management"].push(link);
			} else if (["drugs", "inventory"].includes(link.id)) {
				groups["Pharmacy"].push(link);
			} else if (
				["users", "roles", "permissions", "vault"].includes(link.id)
			) {
				groups["Administration"].push(link);
			} else if (
				["services", "price_lists", "reports", "insurance"].includes(
					link.id
				)
			) {
				groups["System"].push(link);
			} else {
				groups["Other"].push(link);
			}
		}

		return groups;
	}

	private handleAuthError(): void {
		localStorage.removeItem("token");
		localStorage.removeItem("user");

		Swal.fire({
			icon: "error",
			title: i18n.t("errors.authError"),
			text: i18n.t("auth.sessionExpired"),
			confirmButtonColor: "#0d6efd"
		}).then(() => {
			window.location.href = "/login";
		});
	}
}

// Make dashboard manager available globally for employee clocking buttons
declare global {
	interface Window {
		dashboardManager: DashboardManager;
	}
}

// Initialize dashboard when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	const dashboardManager = new DashboardManager();
	window.dashboardManager = dashboardManager;
});
