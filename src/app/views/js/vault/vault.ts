//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { createCustomReport } from "../../utils/pdfGenerator.js";

interface VaultSummary {
	// Patient Revenue
	patient_services_total: number;
	patient_drugs_total: number;
	patient_payments_total: number;
	patient_outstanding_total: number;
	patient_discounts_total: number;

	// Manual Payments
	manual_additions_total: number;
	manual_deductions_total: number;
	manual_net_total: number;

	// Insurance Payments
	insurance_payments_total: number;
	insurance_payment_count: number;
	insurance_payment_average: number;

	// Pharmacy
	drug_shipment_costs_total: number;
	drug_sales_revenue_total: number;
	drug_sales_profit_total: number;

	// Employee Wages
	wages_owed_total: number;
	wages_paid_total: number;
	wages_outstanding_total: number;

	// Net Summary
	total_revenue: number;
	total_expenses: number;
	net_profit: number;
}

class VaultManager {
	//@ts-ignore
	private manualPaymentModal: Modal;
	//@ts-ignore
	private reportDetailsModal: Modal;

	private currentSummary: VaultSummary | null = null;
	private currentDateRange: { start: string; end: string } | null = null;
	private currentReportData: any[] = [];
	private currentReportType: string = "";

	constructor() {
		// Initialize sidebar
		new SidebarManager();

		// Initialize modals
		//@ts-ignore
		this.manualPaymentModal = new bootstrap.Modal(
			document.getElementById("manualPaymentModal")!
		);
		//@ts-ignore
		this.reportDetailsModal = new bootstrap.Modal(
			document.getElementById("reportDetailsModal")!
		);

		this.initializeEventListeners();
		this.setDefaultDateRange();
		this.showEmptyState();
	}

	private initializeEventListeners(): void {
		// Date range buttons
		document.getElementById("todayBtn")?.addEventListener("click", () => {
			this.setTodayRange();
		});

		document
			.getElementById("thisMonthBtn")
			?.addEventListener("click", () => {
				this.setThisMonthRange();
			});

		// Load data button
		document
			.getElementById("loadVaultDataBtn")
			?.addEventListener("click", () => {
				this.loadVaultData();
			});

		// Manual payment button
		document
			.getElementById("addManualPaymentBtn")
			?.addEventListener("click", () => {
				this.showManualPaymentModal();
			});

		// Save manual payment button
		document
			.getElementById("saveManualPaymentBtn")
			?.addEventListener("click", () => {
				this.saveManualPayment();
			});

		// Report buttons (using event delegation)
		document.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			const reportBtn = target.closest(".report-btn");
			if (reportBtn) {
				const reportType = reportBtn.getAttribute("data-type");
				if (reportType) {
					this.showReportDetails(reportType);
				}
			}
		});

		// Print report button
		document
			.getElementById("printReportBtn")
			?.addEventListener("click", () => {
				this.printCurrentReport();
			});

		// Form validation
		const form = document.getElementById(
			"manualPaymentForm"
		) as HTMLFormElement;
		form?.addEventListener("submit", (e) => {
			e.preventDefault();
			this.saveManualPayment();
		});
	}

	private setDefaultDateRange(): void {
		const today = new Date();
		const firstDayOfMonth = new Date(
			today.getFullYear(),
			today.getMonth(),
			1
		);

		(document.getElementById("startDate") as HTMLInputElement).value =
			firstDayOfMonth.toISOString().split("T")[0];
		(document.getElementById("endDate") as HTMLInputElement).value = today
			.toISOString()
			.split("T")[0];
	}

	private setTodayRange(): void {
		const today = new Date().toISOString().split("T")[0];
		(document.getElementById("startDate") as HTMLInputElement).value =
			today;
		(document.getElementById("endDate") as HTMLInputElement).value = today;
	}

	private setThisMonthRange(): void {
		const today = new Date();
		const firstDayOfMonth = new Date(
			today.getFullYear(),
			today.getMonth(),
			1
		);
		const lastDayOfMonth = new Date(
			today.getFullYear(),
			today.getMonth() + 1,
			0
		);

		(document.getElementById("startDate") as HTMLInputElement).value =
			firstDayOfMonth.toISOString().split("T")[0];
		(document.getElementById("endDate") as HTMLInputElement).value =
			lastDayOfMonth.toISOString().split("T")[0];
	}

	private async loadVaultData(): Promise<void> {
		const startDate = (
			document.getElementById("startDate") as HTMLInputElement
		).value;
		const endDate = (document.getElementById("endDate") as HTMLInputElement)
			.value;

		if (!startDate || !endDate) {
			this.showError("Please select both start and end dates");
			return;
		}

		if (new Date(startDate) > new Date(endDate)) {
			this.showError("Start date cannot be after end date");
			return;
		}

		try {
			this.showLoadingState();

			this.currentDateRange = { start: startDate, end: endDate };

			const response = await fetch(
				`/api/vault/summary?start_date=${startDate}&end_date=${endDate}`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error("Failed to fetch vault data");
			}

			this.currentSummary = await response.json();
			this.displayVaultData();
		} catch (error) {
			console.error("Error loading vault data:", error);
			this.showError("Failed to load vault data");
			this.showEmptyState();
		}
	}

	private displayVaultData(): void {
		if (!this.currentSummary) return;

		// Hide loading and empty states
		document.getElementById("loadingState")!.style.display = "none";
		document.getElementById("emptyState")!.style.display = "none";
		document.getElementById("vaultContent")!.style.display = "block";

		const summary = this.currentSummary;

		// Update summary cards
		document.getElementById("totalRevenue")!.textContent =
			this.formatCurrency(summary.total_revenue);
		document.getElementById("totalExpenses")!.textContent =
			this.formatCurrency(summary.total_expenses);

		const netProfitElement = document.getElementById("netProfit")!;
		netProfitElement.textContent = this.formatCurrency(summary.net_profit);
		netProfitElement.className = `summary-amount ${
			summary.net_profit >= 0 ? "text-success" : "text-danger"
		}`;

		// Update patient revenue metrics
		document.getElementById("patientServicesTotal")!.textContent =
			this.formatCurrency(summary.patient_services_total);
		document.getElementById("patientDrugsTotal")!.textContent =
			this.formatCurrency(summary.patient_drugs_total);
		document.getElementById("patientPaymentsTotal")!.textContent =
			this.formatCurrency(summary.patient_payments_total);
		document.getElementById("patientOutstandingTotal")!.textContent =
			this.formatCurrency(summary.patient_outstanding_total);
		document.getElementById("patientDiscountsTotal")!.textContent =
			this.formatCurrency(summary.patient_discounts_total);

		// Update manual payments metrics
		document.getElementById("manualAdditionsTotal")!.textContent =
			this.formatCurrency(summary.manual_additions_total);
		document.getElementById("manualDeductionsTotal")!.textContent =
			this.formatCurrency(summary.manual_deductions_total);

		const manualNetElement = document.getElementById("manualNetTotal")!;
		manualNetElement.textContent = this.formatCurrency(
			summary.manual_net_total
		);
		manualNetElement.className = `metric-value ${
			summary.manual_net_total >= 0 ? "text-success" : "text-danger"
		}`;

		document.getElementById("insurancePaymentsTotal")!.textContent =
			this.formatCurrency(summary.insurance_payments_total);
		document.getElementById("insurancePaymentCount")!.textContent =
			summary.insurance_payment_count.toString();
		document.getElementById("insurancePaymentAverage")!.textContent =
			this.formatCurrency(summary.insurance_payment_average);

		// Update pharmacy metrics
		document.getElementById("drugShipmentCostsTotal")!.textContent =
			this.formatCurrency(summary.drug_shipment_costs_total);
		document.getElementById("drugSalesRevenueTotal")!.textContent =
			this.formatCurrency(summary.drug_sales_revenue_total);
		document.getElementById("drugSalesProfitTotal")!.textContent =
			this.formatCurrency(summary.drug_sales_profit_total);

		// Update wages metrics
		document.getElementById("wagesOwedTotal")!.textContent =
			this.formatCurrency(summary.wages_owed_total);
		document.getElementById("wagesPaidTotal")!.textContent =
			this.formatCurrency(summary.wages_paid_total);
		document.getElementById("wagesOutstandingTotal")!.textContent =
			this.formatCurrency(summary.wages_outstanding_total);

		// Add animation
		document.getElementById("vaultContent")!.classList.add("fade-in");
	}

	private showLoadingState(): void {
		document.getElementById("emptyState")!.style.display = "none";
		document.getElementById("vaultContent")!.style.display = "none";
		document.getElementById("loadingState")!.style.display = "block";
	}

	private showEmptyState(): void {
		document.getElementById("loadingState")!.style.display = "none";
		document.getElementById("vaultContent")!.style.display = "none";
		document.getElementById("emptyState")!.style.display = "block";
	}

	private showManualPaymentModal(): void {
		const form = document.getElementById(
			"manualPaymentForm"
		) as HTMLFormElement;
		form.reset();
		form.classList.remove("was-validated");
		this.manualPaymentModal.show();
	}

	private async saveManualPayment(): Promise<void> {
		const form = document.getElementById(
			"manualPaymentForm"
		) as HTMLFormElement;
		const saveBtn = document.getElementById(
			"saveManualPaymentBtn"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		try {
			this.setButtonLoading(saveBtn, true);

			const paymentAmount = parseFloat(
				(document.getElementById("paymentAmount") as HTMLInputElement)
					.value
			);
			const paymentType = (
				document.getElementById("paymentType") as HTMLSelectElement
			).value;
			const description = (
				document.getElementById(
					"paymentDescription"
				) as HTMLTextAreaElement
			).value.trim();

			const response = await fetch("/api/vault/manual-payments", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				},
				body: JSON.stringify({
					payment_amount: paymentAmount,
					payment_type: paymentType,
					description: description || null
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.error || "Failed to add manual payment"
				);
			}

			this.manualPaymentModal.hide();
			this.showSuccess("Manual payment added successfully");

			// Reload vault data if we have a current date range
			if (this.currentDateRange) {
				await this.loadVaultData();
			}
		} catch (error: any) {
			console.error("Error saving manual payment:", error);
			this.showError(error.message || "Failed to add manual payment");
		} finally {
			this.setButtonLoading(saveBtn, false);
		}
	}

	private async showReportDetails(reportType: string): Promise<void> {
		if (!this.currentDateRange) {
			this.showError("Please load vault data first");
			return;
		}

		try {
			this.currentReportType = reportType;

			// Show loading in modal
			const modalContent = document.getElementById(
				"reportDetailsContent"
			)!;
			modalContent.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-3">Loading report data...</p>
                </div>
            `;

			document.getElementById("reportDetailsModalLabel")!.textContent =
				this.getReportTitle(reportType);
			this.reportDetailsModal.show();

			// Fetch report data
			const endpoint = this.getReportEndpoint(reportType);
			const response = await fetch(
				`/api/vault/${endpoint}?start_date=${this.currentDateRange.start}&end_date=${this.currentDateRange.end}`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error("Failed to fetch report data");
			}

			this.currentReportData = await response.json();
			this.displayReportData(reportType, this.currentReportData);
		} catch (error) {
			console.error("Error loading report:", error);
			document.getElementById("reportDetailsContent")!.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load report data. Please try again.
                </div>
            `;
		}
	}

	private displayReportData(reportType: string, data: any[]): void {
		const container = document.getElementById("reportDetailsContent")!;

		if (data.length === 0) {
			container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-inbox" style="font-size: 3rem;"></i>
                    <h5 class="mt-3">No Data Found</h5>
                    <p>No records found for the selected date range.</p>
                </div>
            `;
			return;
		}

		const tableHtml = this.generateReportTable(reportType, data);
		const summaryHtml = this.generateReportSummary(reportType, data);

		container.innerHTML = `
            <div class="report-header mb-4">
                <h6 class="text-muted">Date Range: ${this.formatDate(
					this.currentDateRange!.start
				)} - ${this.formatDate(this.currentDateRange!.end)}</h6>
                <h6 class="text-muted">Total Records: ${data.length}</h6>
            </div>
            ${summaryHtml}
            ${tableHtml}
        `;
	}

	private generateReportTable(reportType: string, data: any[]): string {
		const columns = this.getReportColumns(reportType);

		const headerRow = columns
			.map((col) => `<th>${col.label}</th>`)
			.join("");
		const dataRows = data
			.map((row) => {
				const cells = columns
					.map((col) => {
						const value = this.getNestedValue(row, col.key);
						const formattedValue = this.formatReportValue(
							value,
							col.type
						);
						return `<td>${formattedValue}</td>`;
					})
					.join("");
				return `<tr>${cells}</tr>`;
			})
			.join("");

		return `
            <div class="table-responsive mt-4">
                <table class="report-table table table-striped">
                    <thead>
                        <tr>${headerRow}</tr>
                    </thead>
                    <tbody>
                        ${dataRows}
                    </tbody>
                </table>
            </div>
        `;
	}

	private generateReportSummary(reportType: string, data: any[]): string {
		const summaryData = this.calculateReportSummary(reportType, data);

		if (!summaryData || Object.keys(summaryData).length === 0) {
			return "";
		}

		const summaryItems = Object.entries(summaryData)
			.map(
				([key, value]) => `
            <div class="col-md-3">
                <div class="card bg-light">
                    <div class="card-body text-center">
                        <h6 class="text-muted mb-2">${this.formatSummaryLabel(
							key
						)}</h6>
                        <h4 class="mb-0">${
							typeof value === "number"
								? this.formatCurrency(value)
								: value
						}</h4>
                    </div>
                </div>
            </div>
        `
			)
			.join("");

		return `
            <div class="row g-3 mb-4">
                ${summaryItems}
            </div>
        `;
	}

	private calculateReportSummary(reportType: string, data: any[]): any {
		switch (reportType) {
			case "patient-services":
			case "patient-drugs":
				return {
					total_revenue: data.reduce(
						(sum, row) =>
							sum +
							parseFloat(
								row.services_total || row.drugs_total || 0
							),
						0
					),
					total_records: data.length,
					avg_per_patient:
						data.length > 0
							? data.reduce(
									(sum, row) =>
										sum +
										parseFloat(
											row.services_total ||
												row.drugs_total ||
												0
										),
									0
							  ) / data.length
							: 0
				};

			case "patient-payments":
				return {
					total_paid: data.reduce(
						(sum, row) => sum + parseFloat(row.paid_amount || 0),
						0
					),
					total_records: data.length,
					avg_payment:
						data.length > 0
							? data.reduce(
									(sum, row) =>
										sum + parseFloat(row.paid_amount || 0),
									0
							  ) / data.length
							: 0
				};

			case "patient-outstanding":
				return {
					total_outstanding: data.reduce(
						(sum, row) =>
							sum + parseFloat(row.outstanding_amount || 0),
						0
					),
					total_records: data.length,
					avg_outstanding:
						data.length > 0
							? data.reduce(
									(sum, row) =>
										sum +
										parseFloat(row.outstanding_amount || 0),
									0
							  ) / data.length
							: 0
				};

			case "insurance-payments":
				return {
					total_payments: data.reduce(
						(sum, row) => sum + parseFloat(row.payment_amount || 0),
						0
					),
					total_records: data.length,
					avg_payment:
						data.length > 0
							? data.reduce(
									(sum, row) =>
										sum +
										parseFloat(row.payment_amount || 0),
									0
							  ) / data.length
							: 0,
					unique_companies: new Set(
						data.map((row) => row.insurance_id)
					).size
				};

			case "drug-shipments":
				return {
					total_cost: data.reduce(
						(sum, row) => sum + parseFloat(row.total_cost || 0),
						0
					),
					total_quantity: data.reduce(
						(sum, row) => sum + parseInt(row.quantity || 0),
						0
					),
					total_shipments: data.length
				};

			case "drug-sales":
				return {
					total_revenue: data.reduce(
						(sum, row) => sum + parseFloat(row.total_revenue || 0),
						0
					),
					total_quantity: data.reduce(
						(sum, row) => sum + parseInt(row.quantity || 0),
						0
					),
					total_transactions: data.length
				};

			case "wages-owed":
			case "wages-paid":
				return {
					total_wages: data.reduce(
						(sum, row) =>
							sum +
							parseFloat(row.payment_amount || 0) +
							parseFloat(row.extra_amount || 0),
						0
					),
					total_records: data.length,
					unique_employees: new Set(
						data.map((row) => row.employee_id)
					).size
				};

			default:
				return {};
		}
	}

	private async printCurrentReport(): Promise<void> {
		if (!this.currentReportData || this.currentReportData.length === 0) {
			this.showError("No report data to print");
			return;
		}

		try {
			const reportConfig = this.createPrintReportConfig(
				this.currentReportType,
				this.currentReportData
			);
			const pdf = createCustomReport(
				reportConfig.title,
				reportConfig.sections,
				{
					data: this.currentReportData,
					summary: this.calculateReportSummary(
						this.currentReportType,
						this.currentReportData
					)
				}
			);

			pdf.open();
			this.showSuccess("Report generated successfully");
		} catch (error) {
			console.error("Error generating report:", error);
			this.showError("Failed to generate report");
		}
	}

	private createPrintReportConfig(reportType: string, data: any[]): any {
		const columns = this.getReportColumns(reportType);
		const title = this.getReportTitle(reportType);

		return {
			title: `${title} Report`,
			sections: [
				{
					type: "header" as const,
					title: `Date Range: ${this.formatDate(
						this.currentDateRange!.start
					)} - ${this.formatDate(this.currentDateRange!.end)}`
				},
				{
					type: "table" as const,
					fields: columns.map((col) => ({
						key: col.key,
						label: col.label,
						type: col.type as any,
						formatter: col.formatter
					}))
				}
			]
		};
	}

	// Helper methods
	private getReportTitle(reportType: string): string {
		const titles: { [key: string]: string } = {
			"patient-services": "Patient Services Revenue",
			"patient-drugs": "Patient Drugs Revenue",
			"patient-payments": "Patient Payments",
			"patient-outstanding": "Outstanding Balances",
			"patient-discounts": "Patient Discounts",
			"manual-payments": "Manual Payments",
			"insurance-payments": "Insurance Payments",
			"drug-shipments": "Drug Shipment Costs",
			"drug-sales": "Drug Sales Revenue",
			"drug-profits": "Drug Sales Profit",
			"wages-owed": "Wages Owed",
			"wages-paid": "Wages Paid"
		};
		return titles[reportType] || "Report";
	}

	private getReportEndpoint(reportType: string): string {
		const endpoints: { [key: string]: string } = {
			"patient-services": "patient-services",
			"patient-drugs": "patient-drugs",
			"patient-payments": "patient-payments",
			"patient-outstanding": "patient-outstanding",
			"patient-discounts": "patient-discounts",
			"manual-payments": "manual-payments",
			"insurance-payments": "insurance-payments",
			"drug-shipments": "drug-shipments",
			"drug-sales": "drug-sales",
			"drug-profits": "drug-profits",
			"wages-owed": "wages-owed",
			"wages-paid": "wages-paid"
		};
		return endpoints[reportType] || "";
	}

	private getReportColumns(reportType: string): any[] {
		const columns: { [key: string]: any[] } = {
			"patient-services": [
				{ key: "patient_name", label: "Patient Name", type: "text" },
				{ key: "bill_id", label: "Bill ID", type: "text" },
				{ key: "generated_at", label: "Date", type: "date" },
				{
					key: "services_total",
					label: "Services Total",
					type: "currency"
				},
				{ key: "discount_amount", label: "Discount", type: "currency" },
				{ key: "paid_amount", label: "Paid", type: "currency" }
			],
			"patient-drugs": [
				{ key: "patient_name", label: "Patient Name", type: "text" },
				{ key: "bill_id", label: "Bill ID", type: "text" },
				{ key: "generated_at", label: "Date", type: "date" },
				{ key: "drugs_total", label: "Drugs Total", type: "currency" },
				{ key: "discount_amount", label: "Discount", type: "currency" },
				{ key: "paid_amount", label: "Paid", type: "currency" }
			],
			"patient-payments": [
				{ key: "patient_name", label: "Patient Name", type: "text" },
				{ key: "bill_id", label: "Bill ID", type: "text" },
				{ key: "updated_at", label: "Payment Date", type: "date" },
				{
					key: "total_amount",
					label: "Total Amount",
					type: "currency"
				},
				{ key: "paid_amount", label: "Paid Amount", type: "currency" },
				{ key: "payment_type", label: "Payment Type", type: "text" }
			],
			"patient-outstanding": [
				{ key: "patient_name", label: "Patient Name", type: "text" },
				{ key: "bill_id", label: "Bill ID", type: "text" },
				{ key: "generated_at", label: "Bill Date", type: "date" },
				{
					key: "total_amount",
					label: "Total Amount",
					type: "currency"
				},
				{ key: "paid_amount", label: "Paid Amount", type: "currency" },
				{
					key: "outstanding_amount",
					label: "Outstanding",
					type: "currency"
				},
				{ key: "payment_type", label: "Payment Type", type: "text" }
			],
			"patient-discounts": [
				{ key: "patient_name", label: "Patient Name", type: "text" },
				{ key: "bill_id", label: "Bill ID", type: "text" },
				{ key: "generated_at", label: "Date", type: "date" },
				{
					key: "total_amount",
					label: "Total Amount",
					type: "currency"
				},
				{ key: "discount_type", label: "Discount Type", type: "text" },
				{ key: "discount", label: "Discount Value", type: "text" },
				{
					key: "discount_amount",
					label: "Discount Amount",
					type: "currency"
				}
			],
			"manual-payments": [
				{ key: "payment_id", label: "Payment ID", type: "text" },
				{ key: "payment_time", label: "Date", type: "date" },
				{
					key: "payment_type",
					label: "Type",
					type: "text",
					formatter: (value: string) =>
						value.charAt(0).toUpperCase() + value.slice(1)
				},
				{ key: "payment_amount", label: "Amount", type: "currency" },
				{ key: "description", label: "Description", type: "text" }
			],
			"insurance-payments": [
				{
					key: "insurance_name",
					label: "Insurance Company",
					type: "text"
				},
				{ key: "payment_amount", label: "Amount", type: "currency" },
				{ key: "payment_from", label: "Period From", type: "date" },
				{ key: "payment_to", label: "Period To", type: "date" },
				{
					key: "issued_timestamp",
					label: "Recorded Date",
					type: "date"
				},
				{ key: "added_by", label: "Added By", type: "text" }
			],
			"drug-shipments": [
				{ key: "drug_name", label: "Drug Name", type: "text" },
				{ key: "manufacturer", label: "Manufacturer", type: "text" },
				{ key: "quantity", label: "Quantity", type: "number" },
				{ key: "buy_price", label: "Unit Cost", type: "currency" },
				{ key: "total_cost", label: "Total Cost", type: "currency" },
				{ key: "received_date", label: "Received Date", type: "date" },
				{ key: "warehouse_name", label: "Warehouse", type: "text" }
			],
			"drug-sales": [
				{ key: "drug_name", label: "Drug Name", type: "text" },
				{
					key: "transaction_type",
					label: "Transaction Type",
					type: "text"
				},
				{ key: "quantity", label: "Quantity", type: "number" },
				{ key: "price", label: "Unit Price", type: "currency" },
				{
					key: "total_revenue",
					label: "Total Revenue",
					type: "currency"
				},
				{ key: "timestamp", label: "Date", type: "date" },
				{ key: "sale_type", label: "Sale Type", type: "text" }
			],
			"drug-profits": [
				{ key: "drug_name", label: "Drug Name", type: "text" },
				{ key: "manufacturer", label: "Manufacturer", type: "text" },
				{
					key: "total_quantity_sold",
					label: "Quantity Sold",
					type: "number"
				},
				{ key: "total_revenue", label: "Revenue", type: "currency" },
				{ key: "total_cost", label: "Cost", type: "currency" },
				{ key: "total_profit", label: "Profit", type: "currency" },
				{
					key: "transaction_count",
					label: "Transactions",
					type: "number"
				}
			],
			"wages-owed": [
				{ key: "employee_name", label: "Employee", type: "text" },
				{ key: "employee_type", label: "Type", type: "text" },
				{ key: "payment_amount", label: "Base Pay", type: "currency" },
				{
					key: "extra_amount",
					label: "Extra Amount",
					type: "currency"
				},
				{
					key: "extra_payment_type",
					label: "Extra Type",
					type: "text"
				},
				{ key: "issued_timestamp", label: "Issued Date", type: "date" },
				{
					key: "is_paid",
					label: "Status",
					type: "text",
					formatter: (value: boolean) => (value ? "Paid" : "Pending")
				}
			],
			"wages-paid": [
				{ key: "employee_name", label: "Employee", type: "text" },
				{ key: "employee_type", label: "Type", type: "text" },
				{ key: "payment_amount", label: "Base Pay", type: "currency" },
				{
					key: "extra_amount",
					label: "Extra Amount",
					type: "currency"
				},
				{ key: "paid_timestamp", label: "Paid Date", type: "date" },
				{ key: "paid_by", label: "Paid By", type: "text" }
			]
		};
		return columns[reportType] || [];
	}

	private getNestedValue(obj: any, path: string): any {
		return path.split(".").reduce((current, key) => current?.[key], obj);
	}

	private formatReportValue(
		value: any,
		type: string,
		formatter?: Function
	): string {
		if (value == null || value === undefined) return "-";

		if (formatter) {
			return formatter(value);
		}

		switch (type) {
			case "currency":
				return this.formatCurrency(parseFloat(value) || 0);
			case "date":
				return this.formatDateTime(value);
			case "number":
				return parseInt(value).toLocaleString();
			case "boolean":
				return value ? "Yes" : "No";
			default:
				return String(value);
		}
	}

	private formatSummaryLabel(key: string): string {
		const labels: { [key: string]: string } = {
			total_revenue: "Total Revenue",
			total_cost: "Total Cost",
			total_profit: "Total Profit",
			total_paid: "Total Paid",
			total_outstanding: "Total Outstanding",
			total_records: "Total Records",
			total_quantity: "Total Quantity",
			total_shipments: "Total Shipments",
			total_transactions: "Total Transactions",
			total_wages: "Total Wages",
			unique_employees: "Employees",
			avg_per_patient: "Avg per Patient",
			avg_payment: "Avg Payment",
			avg_outstanding: "Avg Outstanding"
		};
		return (
			labels[key] ||
			key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
		);
	}

	private formatCurrency(amount: number): string {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2
		}).format(amount);
	}

	private formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	private formatDateTime(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	private setButtonLoading(
		button: HTMLButtonElement,
		loading: boolean
	): void {
		const spinner = button.querySelector(".spinner-border");
		const text = button.querySelector(".btn-text");

		button.disabled = loading;
		if (spinner) {
			spinner.classList.toggle("d-none", !loading);
		}
		if (text) {
			text.textContent = loading ? "Processing..." : "Add Payment";
		}
	}

	private showSuccess(message: string): void {
		//@ts-ignore
		toastr.success(message);
	}

	private showError(message: string): void {
		//@ts-ignore
		toastr.error(message);
	}

	private showInfo(message: string): void {
		//@ts-ignore
		toastr.info(message);
	}

	private showWarning(message: string): void {
		//@ts-ignore
		toastr.warning(message);
	}
}

// Initialize and expose for HTML onclick handlers
declare global {
	interface Window {
		vaultManager: VaultManager;
	}
}

// Configure toastr
//@ts-ignore
toastr.options = {
	closeButton: true,
	debug: false,
	newestOnTop: true,
	progressBar: true,
	positionClass: "toast-top-right",
	preventDuplicates: false,
	showDuration: 300,
	hideDuration: 1000,
	timeOut: 5000,
	extendedTimeOut: 1000,
	showEasing: "swing",
	hideEasing: "linear",
	showMethod: "fadeIn",
	hideMethod: "fadeOut"
};

(window.vaultManager as VaultManager) = new VaultManager();
