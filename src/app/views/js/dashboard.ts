//@ts-ignore
import "./chart.js/chart.js";
//@ts-ignore
import Swal from "./sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "./shared/sidebar.js";

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

	constructor() {
		// Initialize sidebar manager
		new SidebarManager();

		// Initialize dashboard
		this.initializeDashboard();
	}

	private async initializeDashboard(): Promise<void> {
		try {
			await this.verifyAuth();
			this.loadUserInfo();
			await this.checkPageAccess();

			await Promise.all([
				this.loadStatistics(),
				this.initializeCharts(),
				this.loadRecentActivity()
			]);

			this.setupEventListeners();
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

		// Update welcome message
		const welcomeName = document.getElementById("welcomeName");
		if (welcomeName && this.user) {
			welcomeName.textContent = this.user.username;
		}
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

			// Safely update statistics with proper error handling
			this.updateStatElement(
				"activePatients",
				stats.activePatientsCount?.toString() || "0"
			);
			this.updateStatElement(
				"todayRevenue",
				`$${parseFloat(stats.todayRevenue || 0).toFixed(2)}`
			);
			this.updateStatElement(
				"lowStockItemsCount",
				stats.lowStockItemsCount?.toString() || "0"
			);
			this.updateStatElement(
				"todayProfit",
				`$${parseFloat(stats.todayProfit || 0).toFixed(2)}`
			);
		} catch (error) {
			console.error("Error loading statistics:", error);
			this.showErrorToast("Failed to load dashboard statistics");
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
			this.showErrorToast("Failed to load chart data");
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

		const labels = data.map((d) => new Date(d.date).toLocaleDateString());
		const revenueData = data.map((d) => parseFloat(d.revenue.toString()));
		const profitData = data.map((d) => parseFloat(d.profit.toString()));

		//@ts-ignore
		this.revenueChart = new Chart(ctx, {
			type: "line",
			data: {
				labels: labels,
				datasets: [
					{
						label: "Revenue",
						data: revenueData,
						borderColor: "rgb(75, 192, 192)",
						backgroundColor: "rgba(75, 192, 192, 0.1)",
						fill: false,
						tension: 0.4
					},
					{
						label: "Profit",
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
								return "$" + value.toLocaleString();
							}
						}
					}
				},
				plugins: {
					legend: {
						position: "top" as const
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								return (
									context.dataset.label +
									": $" +
									context.parsed.y.toLocaleString()
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
				labels: ["Patient Services", "Pharmacy Sales"],
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
						position: "bottom" as const
					},
					tooltip: {
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
									": $" +
									context.raw.toLocaleString() +
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
			this.showErrorToast("Failed to update chart data");
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
							No recent activity found
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
							<td>${new Date(activity.timestamp).toLocaleString()}</td>
							<td>${this.escapeHtml(activity.username || "Unknown")}</td>
							<td>
								<span class="badge bg-${badgeType}">
									${this.escapeHtml(activity.action_type)}
								</span>
							</td>
							<td>${this.escapeHtml(activity.details?.description || "No description")}</td>
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
							Failed to load recent activity
						</td>
					</tr>
				`;
			}
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
			title: "Error",
			text: message,
			toast: true,
			position: "top-end",
			showConfirmButton: false,
			timer: 3000,
			timerProgressBar: true
		});
	}

	private async checkPageAccess(): Promise<void> {
		if (!this.user) {
			this.handleAuthError();
			return;
		}

		// Dashboard access is typically allowed for all authenticated users
		// Additional checks can be added here if needed
	}

	private handleAuthError(): void {
		localStorage.removeItem("token");
		localStorage.removeItem("user");

		Swal.fire({
			icon: "error",
			title: "Authentication Error",
			text: "Please log in again to continue.",
			confirmButtonColor: "#0d6efd"
		}).then(() => {
			window.location.href = "/login";
		});
	}
}

// Initialize dashboard when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	new DashboardManager();
});
