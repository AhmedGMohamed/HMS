//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { createCustomReport } from "../utils/pdfGenerator.js";
import { i18n } from "../utils/i18n.js";

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
		// Initialize modals
		//@ts-ignore
		this.manualPaymentModal = new bootstrap.Modal(
			document.getElementById("manualPaymentModal")!
		);
		//@ts-ignore
		this.reportDetailsModal = new bootstrap.Modal(
			document.getElementById("reportDetailsModal")!
		);

		this.waitForI18n().then(() => {
			// Initialize sidebar
			new SidebarManager();

			this.initializeEventListeners();
			this.setDefaultDateRange();
			this.showEmptyState();
		});
	}

	private async waitForI18n(): Promise<void> {
		// Wait for i18n to be initialized
		if (i18n) {
			await i18n.init();
		}
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
			this.showError(i18n.t("vault.validation.selectBothDates"));
			return;
		}

		if (new Date(startDate) > new Date(endDate)) {
			this.showError(i18n.t("vault.validation.startDateAfterEndDate"));
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
			this.showError(i18n.t("vault.messages.loadError"));
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
			i18n.formatCurrency(summary.total_revenue);
		document.getElementById("totalExpenses")!.textContent =
			i18n.formatCurrency(summary.total_expenses);

		const netProfitElement = document.getElementById("netProfit")!;
		netProfitElement.textContent = i18n.formatCurrency(summary.net_profit);
		netProfitElement.className = `summary-amount ${
			summary.net_profit >= 0 ? "text-success" : "text-danger"
		}`;

		// Update patient revenue metrics
		document.getElementById("patientServicesTotal")!.textContent =
			i18n.formatCurrency(summary.patient_services_total);
		document.getElementById("patientDrugsTotal")!.textContent =
			i18n.formatCurrency(summary.patient_drugs_total);
		document.getElementById("patientPaymentsTotal")!.textContent =
			i18n.formatCurrency(summary.patient_payments_total);
		document.getElementById("patientOutstandingTotal")!.textContent =
			i18n.formatCurrency(summary.patient_outstanding_total);
		document.getElementById("patientDiscountsTotal")!.textContent =
			i18n.formatCurrency(summary.patient_discounts_total);

		// Update manual payments metrics
		document.getElementById("manualAdditionsTotal")!.textContent =
			i18n.formatCurrency(summary.manual_additions_total);
		document.getElementById("manualDeductionsTotal")!.textContent =
			i18n.formatCurrency(summary.manual_deductions_total);

		const manualNetElement = document.getElementById("manualNetTotal")!;
		manualNetElement.textContent = i18n.formatCurrency(
			summary.manual_net_total
		);
		manualNetElement.className = `metric-value ${
			summary.manual_net_total >= 0 ? "text-success" : "text-danger"
		}`;

		document.getElementById("insurancePaymentsTotal")!.textContent =
			i18n.formatCurrency(summary.insurance_payments_total);
		document.getElementById("insurancePaymentCount")!.textContent =
			i18n.formatNumber(summary.insurance_payment_count, 0);
		document.getElementById("insurancePaymentAverage")!.textContent =
			i18n.formatCurrency(summary.insurance_payment_average);

		// Update pharmacy metrics
		document.getElementById("drugShipmentCostsTotal")!.textContent =
			i18n.formatCurrency(summary.drug_shipment_costs_total);
		document.getElementById("drugSalesRevenueTotal")!.textContent =
			i18n.formatCurrency(summary.drug_sales_revenue_total);
		document.getElementById("drugSalesProfitTotal")!.textContent =
			i18n.formatCurrency(summary.drug_sales_profit_total);

		// Update wages metrics
		document.getElementById("wagesOwedTotal")!.textContent =
			i18n.formatCurrency(summary.wages_owed_total);
		document.getElementById("wagesPaidTotal")!.textContent =
			i18n.formatCurrency(summary.wages_paid_total);
		document.getElementById("wagesOutstandingTotal")!.textContent =
			i18n.formatCurrency(summary.wages_outstanding_total);

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
			this.showSuccess(i18n.t("vault.messages.manualPaymentSuccess"));

			// Reload vault data if we have a current date range
			if (this.currentDateRange) {
				await this.loadVaultData();
			}
		} catch (error: any) {
			console.error("Error saving manual payment:", error);
			this.showError(
				error.message || i18n.t("vault.messages.manualPaymentError")
			);
		} finally {
			this.setButtonLoading(saveBtn, false);
		}
	}

	private async showReportDetails(reportType: string): Promise<void> {
		if (!this.currentDateRange) {
			this.showError(i18n.t("vault.messages.loadDataFirst"));
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
                        <span class="visually-hidden">${i18n.t(
							"common.loading"
						)}</span>
                    </div>
                    <p class="mt-3">${i18n.t(
						"vault.messages.loadingReportData"
					)}</p>
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
                    ${i18n.t("vault.messages.reportLoadError")}
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
                    <h5 class="mt-3">${i18n.t("vault.report.noDataFound")}</h5>
                    <p>${i18n.t("vault.report.noRecordsForDateRange")}</p>
                </div>
            `;
			return;
		}

		const tableHtml = this.generateReportTable(reportType, data);
		const summaryHtml = this.generateReportSummary(reportType, data);

		container.innerHTML = `
            <div class="report-header mb-4">
                <h6 class="text-muted">${i18n.t(
					"vault.report.dateRange"
				)}: ${i18n.formatDate(
			this.currentDateRange!.start
		)} - ${i18n.formatDate(this.currentDateRange!.end)}</h6>
                <h6 class="text-muted">${i18n.t(
					"vault.report.totalRecords"
				)}: ${i18n.formatNumber(data.length, 0)}</h6>
            </div>
            ${summaryHtml}
            ${tableHtml}
        `;
	}

	private generateReportTable(reportType: string, data: any[]): string {
		const columns = this.getReportColumns(reportType);

		const headerRow = columns
			.map((col) => `<th>${i18n.t(col.labelKey || col.label)}</th>`) // Use labelKey if available, fallback to label
			.join("");
		const dataRows = data
			.map((row) => {
				const cells = columns
					.map((col) => {
						const value = this.getNestedValue(row, col.key);
						const formattedValue = this.formatReportValue(
							value,
							col.type,
							col.formatter
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
                        <h6 class="text-muted mb-2">${i18n.t(
							`vault.reportSummary.${key}`
						)}</h6>
                        <h4 class="mb-0">${
							typeof value === "number" &&
							!key.includes("count") &&
							!key.includes("records") &&
							!key.includes("unique")
								? i18n.formatCurrency(value)
								: i18n.formatNumber(value as number, 0)
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

			case "patient-discounts":
				return {
					total_discounts: data.reduce(
						(sum, row) =>
							sum + parseFloat(row.discount_amount || 0),
						0
					),
					total_records: data.length
				};

			case "manual-payments":
				const additions = data.filter(
					(row) => row.payment_type === "addition"
				);
				const deductions = data.filter(
					(row) => row.payment_type === "deduction"
				);
				return {
					total_additions: additions.reduce(
						(sum, row) => sum + parseFloat(row.payment_amount || 0),
						0
					),
					total_deductions: deductions.reduce(
						(sum, row) => sum + parseFloat(row.payment_amount || 0),
						0
					),
					total_records: data.length
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

			case "drug-profits":
				return {
					total_revenue: data.reduce(
						(sum, row) => sum + parseFloat(row.total_revenue || 0),
						0
					),
					total_cost: data.reduce(
						(sum, row) => sum + parseFloat(row.total_cost || 0),
						0
					),
					total_profit: data.reduce(
						(sum, row) => sum + parseFloat(row.total_profit || 0),
						0
					)
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
			this.showError(i18n.t("vault.messages.noReportData"));
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
			this.showSuccess(i18n.t("vault.messages.reportGeneratedSuccess"));
		} catch (error) {
			console.error("Error generating report:", error);
			this.showError(i18n.t("vault.messages.reportGenerateError"));
		}
	}

	private createPrintReportConfig(reportType: string, _data: any[]): any {
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
				{
					key: "patient_name",
					label: "Patient Name", // For PDF (English)
					labelKey: "vault.reportColumns.patientName", // For UI (i18n)
					type: "text"
				},
				{
					key: "bill_id",
					label: "Bill ID",
					labelKey: "vault.reportColumns.billId",
					type: "text"
				},
				{
					key: "generated_at",
					label: "Date",
					labelKey: "vault.reportColumns.date",
					type: "date"
				},
				{
					key: "services_total",
					label: "Services Total",
					labelKey: "vault.reportColumns.servicesTotal",
					type: "currency"
				},
				{
					key: "discount_amount",
					label: "Discount",
					labelKey: "vault.reportColumns.discount",
					type: "currency"
				},
				{
					key: "paid_amount",
					label: "Paid",
					labelKey: "vault.reportColumns.paid",
					type: "currency"
				}
			],
			"patient-drugs": [
				{
					key: "patient_name",
					label: "Patient Name",
					labelKey: "vault.reportColumns.patientName",
					type: "text"
				},
				{
					key: "bill_id",
					label: "Bill ID",
					labelKey: "vault.reportColumns.billId",
					type: "text"
				},
				{
					key: "generated_at",
					label: "Date",
					labelKey: "vault.reportColumns.date",
					type: "date"
				},
				{
					key: "drugs_total",
					label: "Drugs Total",
					labelKey: "vault.reportColumns.drugsTotal",
					type: "currency"
				},
				{
					key: "discount_amount",
					label: "Discount",
					labelKey: "vault.reportColumns.discount",
					type: "currency"
				},
				{
					key: "paid_amount",
					label: "Paid",
					labelKey: "vault.reportColumns.paid",
					type: "currency"
				}
			],
			"patient-payments": [
				{
					key: "patient_name",
					label: "Patient Name",
					labelKey: "vault.reportColumns.patientName",
					type: "text"
				},
				{
					key: "bill_id",
					label: "Bill ID",
					labelKey: "vault.reportColumns.billId",
					type: "text"
				},
				{
					key: "updated_at",
					label: "Payment Date",
					labelKey: "vault.reportColumns.paymentDate",
					type: "date"
				},
				{
					key: "total_amount",
					label: "Total Amount",
					labelKey: "vault.reportColumns.totalAmount",
					type: "currency"
				},
				{
					key: "paid_amount",
					label: "Paid Amount",
					labelKey: "vault.reportColumns.paidAmount",
					type: "currency"
				},
				{
					key: "payment_type",
					label: "Payment Type",
					labelKey: "vault.reportColumns.paymentType",
					type: "text"
				}
			],
			"patient-outstanding": [
				{
					key: "patient_name",
					label: "Patient Name",
					labelKey: "vault.reportColumns.patientName",
					type: "text"
				},
				{
					key: "bill_id",
					label: "Bill ID",
					labelKey: "vault.reportColumns.billId",
					type: "text"
				},
				{
					key: "generated_at",
					label: "Bill Date",
					labelKey: "vault.reportColumns.billDate",
					type: "date"
				},
				{
					key: "total_amount",
					label: "Total Amount",
					labelKey: "vault.reportColumns.totalAmount",
					type: "currency"
				},
				{
					key: "paid_amount",
					label: "Paid Amount",
					labelKey: "vault.reportColumns.paidAmount",
					type: "currency"
				},
				{
					key: "outstanding_amount",
					label: "Outstanding",
					labelKey: "vault.reportColumns.outstanding",
					type: "currency"
				},
				{
					key: "payment_type",
					label: "Payment Type",
					labelKey: "vault.reportColumns.paymentType",
					type: "text"
				}
			],
			"patient-discounts": [
				{
					key: "patient_name",
					label: "Patient Name",
					labelKey: "vault.reportColumns.patientName",
					type: "text"
				},
				{
					key: "bill_id",
					label: "Bill ID",
					labelKey: "vault.reportColumns.billId",
					type: "text"
				},
				{
					key: "generated_at",
					label: "Date",
					labelKey: "vault.reportColumns.date",
					type: "date"
				},
				{
					key: "total_amount",
					label: "Total Amount",
					labelKey: "vault.reportColumns.totalAmount",
					type: "currency"
				},
				{
					key: "discount_type",
					label: "Discount Type",
					labelKey: "vault.reportColumns.discountType",
					type: "text"
				},
				{
					key: "discount",
					label: "Discount Value",
					labelKey: "vault.reportColumns.discountValue",
					type: "text"
				},
				{
					key: "discount_amount",
					label: "Discount Amount",
					labelKey: "vault.reportColumns.discountAmount",
					type: "currency"
				}
			],
			"manual-payments": [
				{
					key: "payment_id",
					label: "Payment ID",
					labelKey: "vault.reportColumns.paymentId",
					type: "text"
				},
				{
					key: "payment_time",
					label: "Date",
					labelKey: "vault.reportColumns.date",
					type: "date"
				},
				{
					key: "payment_type",
					label: "Type",
					labelKey: "vault.reportColumns.type",
					type: "text",
					formatter: (value: string) =>
						value.charAt(0).toUpperCase() + value.slice(1)
				},
				{
					key: "payment_amount",
					label: "Amount",
					labelKey: "vault.reportColumns.amount",
					type: "currency"
				},
				{
					key: "description",
					label: "Description",
					labelKey: "vault.reportColumns.description",
					type: "text"
				}
			],
			"insurance-payments": [
				{
					key: "insurance_name",
					label: "Insurance Company",
					labelKey: "vault.reportColumns.insuranceCompany",
					type: "text"
				},
				{
					key: "payment_amount",
					label: "Amount",
					labelKey: "vault.reportColumns.amount",
					type: "currency"
				},
				{
					key: "payment_from",
					label: "Period From",
					labelKey: "vault.reportColumns.periodFrom",
					type: "date"
				},
				{
					key: "payment_to",
					label: "Period To",
					labelKey: "vault.reportColumns.periodTo",
					type: "date"
				},
				{
					key: "issued_timestamp",
					label: "Recorded Date",
					labelKey: "vault.reportColumns.recordedDate",
					type: "date"
				},
				{
					key: "added_by",
					label: "Added By",
					labelKey: "vault.reportColumns.addedBy",
					type: "text"
				}
			],
			"drug-shipments": [
				{
					key: "drug_name",
					label: "Drug Name",
					labelKey: "vault.reportColumns.drugName",
					type: "text"
				},
				{
					key: "manufacturer",
					label: "Manufacturer",
					labelKey: "vault.reportColumns.manufacturer",
					type: "text"
				},
				{
					key: "quantity",
					label: "Quantity",
					labelKey: "vault.reportColumns.quantity",
					type: "number"
				},
				{
					key: "buy_price",
					label: "Unit Cost",
					labelKey: "vault.reportColumns.unitCost",
					type: "currency"
				},
				{
					key: "total_cost",
					label: "Total Cost",
					labelKey: "vault.reportColumns.totalCost",
					type: "currency"
				},
				{
					key: "received_date",
					label: "Received Date",
					labelKey: "vault.reportColumns.receivedDate",
					type: "date"
				},
				{
					key: "warehouse_name",
					label: "Warehouse",
					labelKey: "vault.reportColumns.warehouse",
					type: "text"
				}
			],
			"drug-sales": [
				{
					key: "drug_name",
					label: "Drug Name",
					labelKey: "vault.reportColumns.drugName",
					type: "text"
				},
				{
					key: "transaction_type",
					label: "Transaction Type",
					labelKey: "vault.reportColumns.transactionType",
					type: "text"
				},
				{
					key: "quantity",
					label: "Quantity",
					labelKey: "vault.reportColumns.quantity",
					type: "number"
				},
				{
					key: "price",
					label: "Unit Price",
					labelKey: "vault.reportColumns.unitPrice",
					type: "currency"
				},
				{
					key: "total_revenue",
					label: "Total Revenue",
					labelKey: "vault.reportColumns.totalRevenue",
					type: "currency"
				},
				{
					key: "timestamp",
					label: "Date",
					labelKey: "vault.reportColumns.date",
					type: "date"
				},
				{
					key: "sale_type",
					label: "Sale Type",
					labelKey: "vault.reportColumns.saleType",
					type: "text"
				}
			],
			"drug-profits": [
				{
					key: "drug_name",
					label: "Drug Name",
					labelKey: "vault.reportColumns.drugName",
					type: "text"
				},
				{
					key: "manufacturer",
					label: "Manufacturer",
					labelKey: "vault.reportColumns.manufacturer",
					type: "text"
				},
				{
					key: "total_quantity_sold",
					label: "Quantity Sold",
					labelKey: "vault.reportColumns.quantitySold",
					type: "number"
				},
				{
					key: "total_revenue",
					label: "Revenue",
					labelKey: "vault.reportColumns.revenue",
					type: "currency"
				},
				{
					key: "total_cost",
					label: "Cost",
					labelKey: "vault.reportColumns.cost",
					type: "currency"
				},
				{
					key: "total_profit",
					label: "Profit",
					labelKey: "vault.reportColumns.profit",
					type: "currency"
				},
				{
					key: "transaction_count",
					label: "Transactions",
					labelKey: "vault.reportColumns.transactions",
					type: "number"
				}
			],
			"wages-owed": [
				{
					key: "employee_name",
					label: "Employee",
					labelKey: "vault.reportColumns.employee",
					type: "text"
				},
				{
					key: "employee_type",
					label: "Type",
					labelKey: "vault.reportColumns.type",
					type: "text"
				},
				{
					key: "payment_amount",
					label: "Base Pay",
					labelKey: "vault.reportColumns.basePay",
					type: "currency"
				},
				{
					key: "extra_amount",
					label: "Extra Amount",
					labelKey: "vault.reportColumns.extraAmount",
					type: "currency"
				},
				{
					key: "extra_payment_type",
					label: "Extra Type",
					labelKey: "vault.reportColumns.extraType",
					type: "text"
				},
				{
					key: "issued_timestamp",
					label: "Issued Date",
					labelKey: "vault.reportColumns.issuedDate",
					type: "date"
				},
				{
					key: "is_paid",
					label: "Status",
					labelKey: "vault.reportColumns.status",
					type: "text",
					formatter: (value: boolean) => (value ? "Paid" : "Pending")
				}
			],
			"wages-paid": [
				{
					key: "employee_name",
					label: "Employee",
					labelKey: "vault.reportColumns.employee",
					type: "text"
				},
				{
					key: "employee_type",
					label: "Type",
					labelKey: "vault.reportColumns.type",
					type: "text"
				},
				{
					key: "payment_amount",
					label: "Base Pay",
					labelKey: "vault.reportColumns.basePay",
					type: "currency"
				},
				{
					key: "extra_amount",
					label: "Extra Amount",
					labelKey: "vault.reportColumns.extraAmount",
					type: "currency"
				},
				{
					key: "paid_timestamp",
					label: "Paid Date",
					labelKey: "vault.reportColumns.paidDate",
					type: "date"
				},
				{
					key: "paid_by",
					label: "Paid By",
					labelKey: "vault.reportColumns.paidBy",
					type: "text"
				}
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
				return i18n.formatCurrency(parseFloat(value) || 0);
			case "date":
				return i18n.formatDateTime(value);
			case "number":
				return i18n.formatNumber(parseInt(value));
			case "boolean":
				return i18n.t(value ? "common.yes" : "common.no");
			default:
				return String(value);
		}
	}

	private formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
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
