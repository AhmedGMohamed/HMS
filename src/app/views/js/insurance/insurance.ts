// src/app/views/js/insurance/insurance.ts
//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

interface InsuranceCompany {
	insurance_id: number;
	name: string;
	contact_info: string | null;
	pricelist_id: number | null;
	last_cleared_date: string;
	pricelist_name?: string;
	patient_count?: number;
}

interface InsurancePayment {
	payment_id: number;
	insurance_id: number;
	payment_amount: number;
	payment_from: string;
	payment_to: string;
	added_by_user_id: number;
	issued_timestamp: string;
	added_by_username?: string;
}

interface InsurancePatient {
	patient_id: number;
	name: string;
	national_id: string;
	gender: "male" | "female" | "other";
	phone: string | null;
	insurance_card_id: string | null;
	insurance_form_id: string | null;
	payment_type: "cash" | "credit" | "insurance";
	is_active: boolean;
	registration_date: string;
	current_admission?: {
		patient_history_id: number;
		admission_time: string;
		diagnosis: string | null;
		bill_id: number;
		total_amount: number;
		paid_amount: number;
		outstanding_amount: number;
	};
}

interface InsuranceStatistics {
	total_patients: number;
	active_patients: number;
	total_admissions: number;
	current_admissions: number;
	total_billed: number;
	total_paid: number;
	total_outstanding: number;
	total_insurance_payments: number;
	net_outstanding: number;
	payment_coverage_percentage: number;
}

interface InsuranceReportSummary {
	insurance_id: number;
	insurance_name: string;
	report_period: {
		start_date: string;
		end_date: string;
	};
	last_cleared_date: string;
	total_services_cost: number;
	total_drugs_cost: number;
	total_cost: number;
	total_patient_payments: number;
	outstanding_amount: number;
	patient_count: number;
	items: any[];
	cleared_payments: InsurancePayment[];
}

export interface PatientReportFilters {
	insurance_id: number;
	patient_id: number;
	start_date: string;
	end_date: string;
	include_drugs: boolean;
	include_cleared_items: boolean;
}

interface PatientReportSummary {
	insurance_id: number;
	insurance_name: string;
	patient_id: number;
	patient_name: string;
	patient_info: {
		national_id: string | null;
		gender: string;
		phone: string | null;
		insurance_card_id: string | null;
		insurance_form_id: string | null;
		registration_date: string;
	};
	report_period: {
		start_date: string;
		end_date: string;
	};
	last_cleared_date: string;
	admissions: Array<{
		patient_history_id: number;
		admission_time: string;
		discharge_time: string | null;
		diagnosis: string | null;
		bill_id: number;
		total_amount: number;
		paid_amount: number;
		outstanding_amount: number;
		items: any[];
	}>;
	total_services_cost: number;
	total_drugs_cost: number;
	total_cost: number;
	total_patient_payments: number;
	outstanding_amount: number;
	items: any[];
}

class InsuranceManager {
	//@ts-ignore
	private insuranceModal: Modal;
	//@ts-ignore
	private paymentModal: Modal;
	//@ts-ignore
	private reportModal: Modal;
	//@ts-ignore
	private reportDetailsModal: Modal;
	//@ts-ignore
	private clearBalanceModal: Modal;
	//@ts-ignore
	private paymentHistoryModal: Modal;
	//@ts-ignore
	private patientReportModal: Modal;
	//@ts-ignore
	private patientReportDetailsModal: Modal;

	private insuranceCompanies: InsuranceCompany[] = [];
	private selectedInsurance: InsuranceCompany | null = null;
	private currentPatients: InsurancePatient[] = [];
	private currentStatistics: InsuranceStatistics | null = null;
	private priceLists: any[] = [];
	private currentReport: InsuranceReportSummary | null = null;
	private currentPatientReport: PatientReportSummary | null = null;
	private isEditMode: boolean = false;

	constructor() {
		// Initialize modals
		//@ts-ignore
		this.insuranceModal = new bootstrap.Modal(
			document.getElementById("insuranceModal")!
		);
		//@ts-ignore
		this.paymentModal = new bootstrap.Modal(
			document.getElementById("paymentModal")!
		);
		//@ts-ignore
		this.reportModal = new bootstrap.Modal(
			document.getElementById("reportModal")!
		);
		//@ts-ignore
		this.reportDetailsModal = new bootstrap.Modal(
			document.getElementById("reportDetailsModal")!
		);
		//@ts-ignore
		this.clearBalanceModal = new bootstrap.Modal(
			document.getElementById("clearBalanceModal")!
		);
		//@ts-ignore
		this.paymentHistoryModal = new bootstrap.Modal(
			document.getElementById("paymentHistoryModal")!
		);
		//@ts-ignore
		this.patientReportModal = new bootstrap.Modal(
			document.getElementById("patientReportModal")!
		);
		//@ts-ignore
		this.patientReportDetailsModal = new bootstrap.Modal(
			document.getElementById("patientReportDetailsModal")!
		);

		// Initialize sidebar
		this.waitForI18n().then(() => {
			new SidebarManager();

			this.initializeEventListeners();
			this.loadInitialData();

			// Listen for locale changes
			window.addEventListener("localeChanged", () => {
				this.handleLocaleChange();
			});
		});
	}

	private async waitForI18n(): Promise<void> {
		if (i18n) {
			await i18n.init();
		}
	}

	private handleLocaleChange(): void {
		// Reload insurance companies to update displayed text
		this.displayInsuranceCompanies();

		// If a company is selected, reload its details
		if (this.selectedInsurance) {
			this.displayInsuranceInfo();
			this.displayInsuranceStatistics();
			this.displayPatientsList();
		}
	}

	private initializeEventListeners(): void {
		// Add insurance company buttons
		document
			.getElementById("addInsuranceBtn")
			?.addEventListener("click", () => {
				this.showInsuranceModal();
			});

		document
			.getElementById("emptyStateAddBtn")
			?.addEventListener("click", () => {
				this.showInsuranceModal();
			});

		// Save insurance company
		document
			.getElementById("saveInsuranceBtn")
			?.addEventListener("click", () => {
				this.saveInsuranceCompany();
			});

		// Insurance details actions
		document
			.getElementById("editInsuranceBtn")
			?.addEventListener("click", () => {
				this.editInsuranceCompany();
			});

		document
			.getElementById("addPaymentBtn")
			?.addEventListener("click", () => {
				this.showPaymentModal();
			});

		document
			.getElementById("generateReportBtn")
			?.addEventListener("click", () => {
				this.showReportModal();
			});

		document
			.getElementById("clearBalanceBtn")
			?.addEventListener("click", () => {
				this.showClearBalanceModal();
			});

		document
			.getElementById("viewPaymentsBtn")
			?.addEventListener("click", () => {
				this.showPaymentHistory();
			});

		document
			.getElementById("backToListBtn")
			?.addEventListener("click", () => {
				this.backToList();
			});

		// Payment modal
		document
			.getElementById("savePaymentBtn")
			?.addEventListener("click", () => {
				this.savePayment();
			});

		// Report modal
		document
			.getElementById("generateReportBtnModal")
			?.addEventListener("click", () => {
				this.generateReport();
			});

		// Clear balance modal
		document
			.getElementById("confirmClearBtn")
			?.addEventListener("click", () => {
				this.clearBalance();
			});

		// Print report
		document
			.getElementById("printReportBtn")
			?.addEventListener("click", () => {
				this.printReport();
			});

		// Patient report modal
		document
			.getElementById("generatePatientReportBtnModal")
			?.addEventListener("click", () => {
				this.generatePatientReport();
			});

		// Print patient report
		document
			.getElementById("printPatientReportBtn")
			?.addEventListener("click", () => {
				this.printPatientReport();
			});

		// Form validations
		const insuranceForm = document.getElementById(
			"insuranceForm"
		) as HTMLFormElement;
		insuranceForm?.addEventListener("submit", (e) => {
			e.preventDefault();
			this.saveInsuranceCompany();
		});

		const paymentForm = document.getElementById(
			"paymentForm"
		) as HTMLFormElement;
		paymentForm?.addEventListener("submit", (e) => {
			e.preventDefault();
			this.savePayment();
		});

		const reportForm = document.getElementById(
			"reportForm"
		) as HTMLFormElement;
		reportForm?.addEventListener("submit", (e) => {
			e.preventDefault();
			this.generateReport();
		});

		// Patient report form validation
		const patientReportForm = document.getElementById(
			"patientReportForm"
		) as HTMLFormElement;
		patientReportForm?.addEventListener("submit", (e) => {
			e.preventDefault();
			this.generatePatientReport();
		});

		const clearBalanceForm = document.getElementById(
			"clearBalanceForm"
		) as HTMLFormElement;
		clearBalanceForm?.addEventListener("submit", (e) => {
			e.preventDefault();
			this.clearBalance();
		});
	}

	private async loadInitialData(): Promise<void> {
		try {
			this.showLoadingState();
			await Promise.all([
				this.loadInsuranceCompanies(),
				this.loadPriceLists()
			]);
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError(i18n.t("insurance.messages.loadError"));
			this.showEmptyState();
		}
	}

	private async loadInsuranceCompanies(): Promise<void> {
		try {
			const response = await fetch("/api/insurance-companies", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) {
				throw new Error(i18n.t("insurance.messages.loadError"));
			}

			const result = await response.json();
			this.insuranceCompanies = result.data || [];
			this.displayInsuranceCompanies();
		} catch (error) {
			throw error;
		}
	}

	private async loadPriceLists(): Promise<void> {
		try {
			const response = await fetch("/api/price-lists", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (response.ok) {
				const result = await response.json();
				this.priceLists = result.data || [];
				this.populatePriceListOptions();
			}
		} catch (error) {
			console.error("Error loading price lists:", error);
			// Don't throw error as this is optional
		}
	}

	private displayInsuranceCompanies(): void {
		const container = document.getElementById("insuranceCompaniesList")!;

		if (this.insuranceCompanies.length === 0) {
			this.showEmptyState();
			return;
		}

		// Hide loading and empty states
		document.getElementById("loadingState")!.style.display = "none";
		document.getElementById("emptyState")!.style.display = "none";
		document.getElementById("insuranceContent")!.style.display = "block";

		const html = `
        <div class="row">
            ${this.insuranceCompanies
				.map((insurance) => this.createInsuranceCard(insurance))
				.join("")}
        </div>
    `;
		container.innerHTML = html;

		// Force layout recalculation
		container.offsetHeight;

		// Add event listeners to cards
		container.querySelectorAll(".insurance-card").forEach((card) => {
			// Add layout fix class
			card.classList.add("layout-fix");

			card.addEventListener("click", () => {
				const insuranceId = parseInt(
					card.getAttribute("data-insurance-id")!
				);
				this.selectInsuranceCompany(insuranceId);
			});
		});

		// Add animation
		setTimeout(() => {
			container.classList.add("fade-in");
		}, 50);
	}

	private createInsuranceCard(insurance: InsuranceCompany): string {
		let lastClearedDate = "N/A";
		if (insurance.last_cleared_date) {
			lastClearedDate = i18n.formatDate(insurance.last_cleared_date);
		}

		return `
        <div class="col-md-6 col-lg-4 mb-3">
            <div class="card insurance-card h-100" data-insurance-id="${
				insurance.insurance_id
			}">
                <div class="card-body insurance-card-body d-flex flex-column">
                    <div class="insurance-icon">
                        <i class="bi bi-shield-check"></i>
                    </div>
                    <div class="insurance-name">${this.escapeHtml(
						insurance.name
					)}</div>
                    
                    <div class="insurance-meta">
                        <div class="insurance-meta-item">
                            <i class="bi bi-list-check"></i>
                            <span>${
								insurance.pricelist_name ||
								i18n.t(
									"insurance.messages.noPriceListsAvailable"
								)
							}</span>
                        </div>
                        <div class="insurance-meta-item">
                            <i class="bi bi-calendar-check"></i>
                            <span>${i18n.t(
								"insurance.fields.lastCleared"
							)}: ${lastClearedDate}</span>
                        </div>
                    </div>

                    ${
						insurance.contact_info
							? `
                        <div class="insurance-meta">
                            <div class="insurance-meta-item">
                                <i class="bi bi-telephone"></i>
                                <span>${this.escapeHtml(
									insurance.contact_info.substring(0, 50)
								)}${
									insurance.contact_info.length > 50
										? "..."
										: ""
							  }</span>
                            </div>
                        </div>
                    `
							: ""
					}

                    <div class="insurance-stats mt-auto">
                        <div class="insurance-stat">
                            <span class="insurance-stat-value">${
								insurance.patient_count || 0
							}</span>
                            <span class="insurance-stat-label">${i18n.t(
								"insurance.statistics.totalPatients"
							)}</span>
                        </div>
                        <div class="insurance-stat">
                            <span class="insurance-stat-value">
                                <i class="bi bi-arrow-right text-primary"></i>
                            </span>
                            <span class="insurance-stat-label">${i18n.t(
								"insurance.buttons.viewDetails"
							)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
	}

	private async selectInsuranceCompany(insuranceId: number): Promise<void> {
		try {
			this.showLoadingState();

			// Find selected insurance
			this.selectedInsurance =
				this.insuranceCompanies.find(
					(ins) => ins.insurance_id === insuranceId
				) || null;

			if (!this.selectedInsurance) {
				this.showError(i18n.t("insurance.messages.loadDetailsError"));
				return;
			}

			// Load detailed data
			await Promise.all([
				this.loadInsuranceStatistics(insuranceId),
				this.loadInsurancePatients(insuranceId)
			]);

			this.showInsuranceDetails();
		} catch (error) {
			console.error("Error selecting insurance company:", error);
			this.showError(i18n.t("insurance.messages.loadDetailsError"));
		}
	}

	private async loadInsuranceStatistics(insuranceId: number): Promise<void> {
		try {
			const response = await fetch(
				`/api/insurance-companies/${insuranceId}/statistics`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error(i18n.t("insurance.messages.loadDetailsError"));
			}

			const result = await response.json();
			this.currentStatistics = result.data;
		} catch (error) {
			console.error("Error loading statistics:", error);
			this.currentStatistics = null;
		}
	}

	private async loadInsurancePatients(insuranceId: number): Promise<void> {
		try {
			const response = await fetch(
				`/api/insurance-companies/${insuranceId}/patients`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error(i18n.t("insurance.messages.loadPatientsError"));
			}

			const result = await response.json();
			this.currentPatients = result.data || [];
		} catch (error) {
			console.error("Error loading patients:", error);
			this.currentPatients = [];
		}
	}

	private showInsuranceDetails(): void {
		if (!this.selectedInsurance) return;

		// Hide loading state and company list
		document.getElementById("loadingState")!.style.display = "none";
		document.getElementById("insuranceCompaniesList")!.style.display =
			"none";
		document.getElementById("selectedInsuranceDetails")!.style.display =
			"block";
		document.getElementById("insuranceContent")!.style.display = "block";

		// Update insurance info
		this.displayInsuranceInfo();
		this.displayInsuranceStatistics();
		this.displayPatientsList();

		// Add animation
		document
			.getElementById("selectedInsuranceDetails")!
			.classList.add("slide-up");
	}

	private displayInsuranceInfo(): void {
		if (!this.selectedInsurance) return;

		const container = document.getElementById("selectedInsuranceInfo")!;

		let lastClearedDate = "N/A";
		if (this.selectedInsurance.last_cleared_date)
			i18n.formatDate(this.selectedInsurance.last_cleared_date);

		container.innerHTML = `
	        <div class="insurance-info-item">
	            <div class="insurance-info-label">${i18n.t(
					"insurance.fields.companyName"
				)}</div>
	            <div class="insurance-info-value">${this.escapeHtml(
					this.selectedInsurance.name
				)}</div>
	        </div>
			
	        ${
				this.selectedInsurance.contact_info
					? `
	            <div class="insurance-info-item">
	                <div class="insurance-info-label">${i18n.t(
						"insurance.fields.contactInfo"
					)}</div>
	                <div class="insurance-info-value">${this.escapeHtml(
						this.selectedInsurance.contact_info
					)}</div>
	            </div>
	        `
					: ""
			}
				
	        <div class="insurance-info-item">
	            <div class="insurance-info-label">${i18n.t(
					"insurance.fields.priceList"
				)}</div>
	            <div class="insurance-info-value">${
					this.selectedInsurance.pricelist_name ||
					i18n.t("insurance.messages.noPriceListsAvailable")
				}</div>
	        </div>
			
	        <div class="insurance-info-item">
	            <div class="insurance-info-label">${i18n.t(
					"insurance.fields.lastCleared"
				)}</div>
	            <div class="insurance-info-value">${lastClearedDate}</div>
	        </div>
	    `;
	}

	private displayInsuranceStatistics(): void {
		if (!this.currentStatistics) {
			document.getElementById("insuranceStatistics")!.innerHTML = `
            <div class="col-md-12">
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    ${i18n.t("insurance.messages.loadDetailsError")}
                </div>
            </div>
        `;
			return;
		}

		const stats = this.currentStatistics;
		const container = document.getElementById("insuranceStatistics")!;

		container.innerHTML = `
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value">${stats.total_patients}</span>
                <span class="stat-metric-label">${i18n.t(
					"insurance.statistics.totalPatients"
				)}</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-success">${
					stats.active_patients
				}</span>
                <span class="stat-metric-label">${i18n.t(
					"insurance.statistics.activePatients"
				)}</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-info">${
					stats.current_admissions
				}</span>
                <span class="stat-metric-label">${i18n.t(
					"dashboard.metrics.admittedPatients"
				)}</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value">${i18n.formatCurrency(
					stats.total_billed
				)}</span>
                <span class="stat-metric-label">${i18n.t(
					"insurance.statistics.totalRevenue"
				)}*</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-primary">${i18n.formatCurrency(
					stats.total_insurance_payments
				)}</span>
                <span class="stat-metric-label">${i18n.t(
					"insurance.statistics.totalPayments"
				)}</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-success">${i18n.formatCurrency(
					stats.total_paid
				)}</span>
                <span class="stat-metric-label">${i18n.t(
					"insurance.paymentHistory.paymentAmount"
				)}*</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-warning">${i18n.formatCurrency(
					stats.total_outstanding
				)}</span>
                <span class="stat-metric-label">${i18n.t(
					"insurance.statistics.outstandingBalance"
				)}*</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value ${
					stats.net_outstanding > 0 ? "text-danger" : "text-success"
				}">${i18n.formatCurrency(stats.net_outstanding)}</span>
                <span class="stat-metric-label">${i18n.t(
					"insurance.statistics.outstandingBalance"
				)}</span>
            </div>
        </div>
        <div class="col-md-12 mt-3">
            <div class="alert alert-info">
                <small>
                    <i class="bi bi-info-circle me-2"></i>
                    <strong>*</strong> ${i18n.t(
						"insurance.messages.reportNote"
					)}
                    (${i18n.formatDate(
						this.selectedInsurance!.last_cleared_date
					)}).
                    <br>
                    <strong>${i18n.t(
						"insurance.statistics.outstandingBalance"
					)}:</strong> ${i18n.formatCurrency(stats.net_outstanding)}
                    <br>
                    <strong>${i18n.t(
						"insurance.statistics.totalPayments"
					)}:</strong> ${stats.payment_coverage_percentage.toFixed(
			1
		)}%
                </small>
            </div>
        </div>
    `;
	}

	private displayPatientsList(): void {
		const container = document.getElementById("patientsList")!;
		const countElement = document.getElementById("patientCount")!;

		countElement.textContent = this.currentPatients.length.toString();

		if (this.currentPatients.length === 0) {
			container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-people" style="font-size: 3rem;"></i>
                <h5 class="mt-3">${i18n.t("insurance.emptyState.title")}</h5>
                <p>${i18n.t("insurance.messages.loadPatientsError")}</p>
            </div>
        `;
			return;
		}

		const html = this.currentPatients
			.map((patient) => this.createPatientCard(patient))
			.join("");
		container.innerHTML = html;

		container
			.querySelectorAll(".generate-patient-report-btn")
			.forEach((button) => {
				button.addEventListener("click", (e) => {
					e.stopPropagation();
					const patientId = parseInt(
						button.getAttribute("data-patient-id")!
					);
					const patientName =
						button.getAttribute("data-patient-name")!;
					this.showPatientReportModal(patientId, patientName);
				});
			});
	}

	private createPatientCard(patient: InsurancePatient): string {
		const registrationDate = i18n.formatDate(patient.registration_date);
		const genderIcon =
			patient.gender === "male"
				? "bi-gender-male"
				: patient.gender === "female"
				? "bi-gender-female"
				: "bi-person";

		let admissionHtml = "";
		if (patient.current_admission) {
			const admission = patient.current_admission;
			const admissionDate = i18n.formatDateTime(admission.admission_time);
			const outstanding = admission.outstanding_amount;

			admissionHtml = `
	            <div class="patient-admission">
	                <div class="patient-admission-header">
	                    <i class="bi bi-hospital me-2"></i>${i18n.t(
							"insurance.patient.admission"
						)}
	                </div>
	                <div class="patient-admission-details">
	                    <div class="patient-admission-detail">
	                        <strong>${i18n.t(
								"insurance.patient.admissionDate"
							)}:</strong> ${admissionDate}
	                    </div>
	                    <div class="patient-admission-detail">
	                        <strong>${i18n.t(
								"insurance.patient.diagnosis"
							)}:</strong> ${
				admission.diagnosis ||
				i18n.t("insurance.patient.noActiveAdmission")
			}
	                    </div>
	                    <div class="patient-admission-detail">
	                        <strong>${i18n.t(
								"common.total"
							)}:</strong> ${i18n.formatCurrency(
				admission.total_amount
			)}
	                    </div>
	                    <div class="patient-admission-detail">
	                        <strong>${i18n.t(
								"insurance.patient.outstandingAmount"
							)}:</strong> 
	                        <span class="outstanding-amount ${
								outstanding === 0 ? "zero" : ""
							}">
	                            ${i18n.formatCurrency(outstanding)}
	                        </span>
	                    </div>
	                </div>
	            </div>
	        `;
		}

		const statusText = patient.is_active
			? i18n.t("insurance.patient.status.active")
			: i18n.t("insurance.patient.status.inactive");

		return `
        <div class="patient-card ${
			patient.is_active ? "active-patient" : "inactive-patient"
		}">
            <div class="patient-header">
                <h6 class="patient-name">${this.escapeHtml(patient.name)}</h6>
                <span class="patient-status ${
					patient.is_active ? "active" : "inactive"
				}">
                    ${statusText}
                </span>
            </div>
            
            <div class="patient-details">
                <div class="patient-detail">
                    <i class="${genderIcon}"></i>
                    <span>${this.capitalizeFirst(patient.gender)}</span>
                </div>
                
                ${
					patient.phone
						? `
                    <div class="patient-detail">
                        <i class="bi bi-telephone"></i>
                        <span>${patient.phone}</span>
                    </div>
                `
						: ""
				}
                
                ${
					patient.insurance_card_id
						? `
                    <div class="patient-detail">
                        <i class="bi bi-credit-card"></i>
                        <span>${i18n.t("insurance.patient.insuranceCardId")}: ${
								patient.insurance_card_id
						  }</span>
                    </div>
                `
						: ""
				}
                
                ${
					patient.insurance_form_id
						? `
                    <div class="patient-detail">
                        <i class="bi bi-file-earmark-text"></i>
                        <span>${i18n.t("insurance.patient.insuranceFormId")}: ${
								patient.insurance_form_id
						  }</span>
                    </div>
                `
						: ""
				}
                
                <div class="patient-detail">
                    <i class="bi bi-calendar-plus"></i>
                    <span>${i18n.t("common.date")}: ${registrationDate}</span>
                </div>
            </div>
            
            ${admissionHtml}
            <div class="patient-actions mt-3">
                <button type="button" 
                    class="btn btn-outline-info btn-sm w-100 generate-patient-report-btn" 
                    data-patient-id="${patient.patient_id}"
                    data-patient-name="${this.escapeHtml(patient.name)}"
                    data-requires-permission="manage_reports">
                    <i class="bi bi-file-earmark-text me-2"></i>${i18n.t(
						"insurance.buttons.generatePatientReport"
					)}
                </button>
            </div>
        </div>
    `;
	}

	private showPatientReportModal(
		patientId: number,
		patientName: string
	): void {
		if (!this.selectedInsurance) return;

		const form = document.getElementById(
			"patientReportForm"
		) as HTMLFormElement;
		form.reset();
		form.classList.remove("was-validated");

		// Set patient information
		(
			document.getElementById("selectedPatientId") as HTMLInputElement
		).value = patientId.toString();
		document.getElementById("selectedPatientName")!.textContent =
			patientName;

		// Set default dates (current month)
		const today = new Date();
		const firstDayOfMonth = new Date(
			today.getFullYear(),
			today.getMonth(),
			1
		);

		(
			document.getElementById(
				"patientReportStartDate"
			) as HTMLInputElement
		).value = firstDayOfMonth.toISOString().split("T")[0];
		(
			document.getElementById("patientReportEndDate") as HTMLInputElement
		).value = today.toISOString().split("T")[0];

		// Set default options
		(
			document.getElementById("patientIncludeDrugs") as HTMLInputElement
		).checked = true;
		(
			document.getElementById(
				"patientIncludeClearedItems"
			) as HTMLInputElement
		).checked = false;

		this.patientReportModal.show();
	}

	private async generatePatientReport(): Promise<void> {
		const form = document.getElementById(
			"patientReportForm"
		) as HTMLFormElement;
		const generateBtn = document.getElementById(
			"generatePatientReportBtnModal"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		if (!this.selectedInsurance) {
			this.showError(i18n.t("insurance.messages.loadDetailsError"));
			return;
		}

		try {
			this.setButtonLoading(generateBtn, true);

			const patientId = parseInt(
				(
					document.getElementById(
						"selectedPatientId"
					) as HTMLInputElement
				).value
			);
			const startDate = (
				document.getElementById(
					"patientReportStartDate"
				) as HTMLInputElement
			).value;
			const endDate = (
				document.getElementById(
					"patientReportEndDate"
				) as HTMLInputElement
			).value;
			const includeDrugs = (
				document.getElementById(
					"patientIncludeDrugs"
				) as HTMLInputElement
			).checked;
			const includeClearedItems = (
				document.getElementById(
					"patientIncludeClearedItems"
				) as HTMLInputElement
			).checked;

			// Validate dates
			if (new Date(startDate) >= new Date(endDate)) {
				this.showError(
					i18n.t("insurance.validation.startDateRequired")
				);
				return;
			}

			const response = await fetch(
				`/api/insurance-companies/${this.selectedInsurance.insurance_id}/patients/${patientId}/reports`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						start_date: startDate,
						end_date: endDate,
						include_drugs: includeDrugs,
						include_cleared_items: includeClearedItems
					})
				}
			);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.message ||
						i18n.t("insurance.messages.reportError")
				);
			}

			this.currentPatientReport = await response
				.json()
				.then((result) => result.data);

			this.patientReportModal.hide();
			this.displayPatientReportDetails();
			this.showSuccess(i18n.t("insurance.messages.createSuccess"));
		} catch (error: any) {
			console.error("Error generating patient report:", error);
			this.showError(
				error.message || i18n.t("insurance.messages.reportError")
			);
		} finally {
			this.setButtonLoading(generateBtn, false);
		}
	}

	private displayPatientReportDetails(): void {
		if (!this.currentPatientReport) return;

		const modalLabel = document.getElementById(
			"patientReportDetailsModalLabel"
		)!;
		const container = document.getElementById(
			"patientReportDetailsContent"
		)!;

		modalLabel.textContent = `${
			this.currentPatientReport.patient_name
		} - ${i18n.t("insurance.modals.patientReport")}`;

		const reportStartDate = i18n.formatDate(
			this.currentPatientReport.report_period.start_date
		);
		const reportEndDate = i18n.formatDate(
			this.currentPatientReport.report_period.end_date
		);
		const registrationDate = i18n.formatDate(
			this.currentPatientReport.patient_info.registration_date
		);

		// Generate patient information section
		const patientInfoHtml = `
        <div class="patient-info-section mb-4">
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0">
                        <i class="bi bi-person-check me-2"></i>${i18n.t(
							"insurance.fields.patient"
						)} ${i18n.t("common.info")}
                    </h6>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="patient-info-item">
                                <div class="patient-info-label">${i18n.t(
									"insurance.report.patientName"
								)}</div>
                                <div class="patient-info-value">${this.escapeHtml(
									this.currentPatientReport.patient_name
								)}</div>
                            </div>
                            ${
								this.currentPatientReport.patient_info
									.national_id
									? `
                                <div class="patient-info-item">
                                    <div class="patient-info-label">${i18n.t(
										"insurance.patient.nationalId"
									)}</div>
                                    <div class="patient-info-value">${
										this.currentPatientReport.patient_info
											.national_id
									}</div>
                                </div>
                            `
									: ""
							}
                            <div class="patient-info-item">
                                <div class="patient-info-label">${i18n.t(
									"insurance.patient.gender"
								)}</div>
                                <div class="patient-info-value">${this.capitalizeFirst(
									this.currentPatientReport.patient_info
										.gender
								)}</div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            ${
								this.currentPatientReport.patient_info.phone
									? `
                                <div class="patient-info-item">
                                    <div class="patient-info-label">${i18n.t(
										"insurance.patient.phone"
									)}</div>
                                    <div class="patient-info-value">${
										this.currentPatientReport.patient_info
											.phone
									}</div>
                                </div>
                            `
									: ""
							}
                            ${
								this.currentPatientReport.patient_info
									.insurance_card_id
									? `
                                <div class="patient-info-item">
                                    <div class="patient-info-label">${i18n.t(
										"insurance.patient.insuranceCardId"
									)}</div>
                                    <div class="patient-info-value">${
										this.currentPatientReport.patient_info
											.insurance_card_id
									}</div>
                                </div>
                            `
									: ""
							}
                            ${
								this.currentPatientReport.patient_info
									.insurance_form_id
									? `
                                <div class="patient-info-item">
                                    <div class="patient-info-label">${i18n.t(
										"insurance.patient.insuranceFormId"
									)}</div>
                                    <div class="patient-info-value">${
										this.currentPatientReport.patient_info
											.insurance_form_id
									}</div>
                                </div>
                            `
									: ""
							}
                            <div class="patient-info-item">
                                <div class="patient-info-label">${i18n.t(
									"common.date"
								)}</div>
                                <div class="patient-info-value">${registrationDate}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

		// Generate report summary
		const summaryHtml = `
        <div class="report-summary">
            <div class="report-summary-title">
                ${i18n.t(
					"insurance.modals.patientReport"
				)} - ${reportStartDate} ${i18n.t("common.to")} ${reportEndDate}
            </div>
            <div class="report-summary-grid">
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentPatientReport.total_services_cost
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.report.services"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentPatientReport.total_drugs_cost
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.report.drugs"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentPatientReport.total_cost
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.report.totalAmount"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentPatientReport.total_patient_payments
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.paymentHistory.paymentAmount"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value text-warning">${i18n.formatCurrency(
						this.currentPatientReport.outstanding_amount
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.statistics.outstandingBalance"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${
						this.currentPatientReport.admissions.length
					}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.patient.admission"
					)}</span>
                </div>
            </div>
        </div>
    `;

		// Generate admissions details
		let admissionsHtml = "";
		if (this.currentPatientReport.admissions.length > 0) {
			admissionsHtml = `
            <div class="mt-4">
                <h6>${i18n.t("insurance.patient.admission")} (${
				this.currentPatientReport.admissions.length
			})</h6>
                ${this.currentPatientReport.admissions
					.map((admission, index) =>
						this.createAdmissionCard(admission, index)
					)
					.join("")}
            </div>
        `;
		} else {
			admissionsHtml = `
            <div class="mt-4 text-center text-muted">
                <i class="bi bi-hospital" style="font-size: 3rem;"></i>
                <h6 class="mt-3">${i18n.t("insurance.report.noData")}</h6>
                <p>${i18n.t("insurance.report.noData")}</p>
            </div>
        `;
		}

		container.innerHTML = patientInfoHtml + summaryHtml + admissionsHtml;
		this.patientReportDetailsModal.show();
	}

	private createAdmissionCard(admission: any, index: number): string {
		const admissionDate = i18n.formatDate(admission.admission_time);
		const dischargeDate = admission.discharge_time
			? i18n.formatDate(admission.discharge_time)
			: null;

		let itemsHtml = "";
		if (admission.items && admission.items.length > 0) {
			const itemRows = admission.items
				.map(
					(item: any) => `
	            <tr>
	                <td>${
						item.item_type === "service"
							? item.service_name || "-"
							: item.drug_name || "-"
					}</td>
	                <td><span class="badge ${
						item.item_type === "service"
							? "bg-success"
							: "bg-primary"
					}">${this.capitalizeFirst(item.item_type)}</span></td>
	                <td>${i18n.formatDate(item.service_date)}</td>
	                <td class="text-center">${item.quantity}</td>
	                <td class="text-end">${i18n.formatCurrency(
						item.unit_price
					)}</td>
	                <td class="text-end">${i18n.formatCurrency(
						item.total_cost
					)}</td>
	            </tr>
	        `
				)
				.join("");

			const totalItemsCost = admission.items.reduce(
				(sum: number, item: any) => sum + item.total_cost,
				0
			);

			itemsHtml = `
	            <div class="table-responsive">
	                <table class="table table-sm">
	                    <thead>
	                        <tr>
	                            <th>${i18n.t("insurance.report.serviceType")}</th>
	                            <th>${i18n.t("common.status")}</th>
	                            <th>${i18n.t("insurance.report.date")}</th>
	                            <th class="text-center">${i18n.t(
									"insurance.report.quantity"
								)}</th>
	                            <th class="text-end">${i18n.t(
									"insurance.report.unitPrice"
								)}</th>
	                            <th class="text-end">${i18n.t("common.total")}</th>
	                        </tr>
	                    </thead>
	                    <tbody>
	                        ${itemRows}
	                    </tbody>
	                    <tfoot class="table-light">
	                        <tr class="border-top-2">
	                            <td colspan="5" class="fw-bold">${i18n.t(
									"insurance.patient.admission"
								)} ${i18n.t("common.total")}:</td>
	                            <td class="fw-bold text-end">${i18n.formatCurrency(
									totalItemsCost
								)}</td>
	                        </tr>
	                    </tfoot>
	                </table>
	            </div>
	        `;
		} else {
			itemsHtml = `
	            <div class="text-center text-muted py-3">
	                <i class="bi bi-inbox"></i>
	                <p class="mb-0">${i18n.t("insurance.report.noData")}</p>
	            </div>
	        `;
		}

		return `
	        <div class="patient-group-card mb-4">
	            <div class="patient-group-header">
	                <h6 class="mb-2">${index + 1}. ${i18n.t(
			"insurance.patient.admission"
		)} ${admissionDate}</h6>
	                <div class="patient-group-info">
	                    <span class="badge bg-info me-2">Bill ID: ${
							admission.bill_id
						}</span>
	                    ${
							dischargeDate
								? `<span class="badge bg-success">${i18n.t(
										"insurance.patient.status.inactive"
								  )}: ${dischargeDate}</span>`
								: `<span class="badge bg-warning">${i18n.t(
										"insurance.patient.admission"
								  )}</span>`
						}
	                    ${
							admission.diagnosis
								? `<span class="badge bg-secondary ms-2">${i18n.t(
										"insurance.patient.diagnosis"
								  )}: ${admission.diagnosis}</span>`
								: ""
						}
	                </div>
	            </div>
	            ${itemsHtml}
	            <div class="admission-summary p-3 bg-light">
	                <div class="row">
	                    <div class="col-md-3">
	                        <strong>${i18n.t(
								"common.total"
							)}:</strong> ${i18n.formatCurrency(
			admission.total_amount
		)}
	                    </div>
	                    <div class="col-md-3">
	                        <strong>${i18n.t(
								"insurance.paymentHistory.paymentAmount"
							)}:</strong> 
	                        <span class="text-success">${i18n.formatCurrency(
								admission.paid_amount
							)}</span>
	                    </div>
	                    <div class="col-md-3">
	                        <strong>${i18n.t(
								"insurance.statistics.outstandingBalance"
							)}:</strong> 
	                        <span class="${
								admission.outstanding_amount > 0
									? "text-warning"
									: "text-success"
							}">
	                            ${i18n.formatCurrency(admission.outstanding_amount)}
	                        </span>
	                    </div>
	                    <div class="col-md-3">
	                        <strong>${i18n.t(
								"insurance.report.serviceType"
							)}:</strong> ${
			admission.items ? admission.items.length : 0
		}
	                    </div>
	                </div>
	            </div>
	        </div>
	    `;
	}

	private async printPatientReport(): Promise<void> {
		if (!this.currentPatientReport) {
			this.showError("No patient report data to print");
			return;
		}

		try {
			// Create custom PDF for patient report
			const docDefinition = {
				content: [
					{
						text: `Patient Medical Report`,
						style: "header",
						alignment: "center"
					},
					{
						text: `${this.currentPatientReport.insurance_name}`,
						style: "subheader",
						alignment: "center"
					},
					{
						text: `Report Period: ${new Date(
							this.currentPatientReport.report_period.start_date
						).toLocaleDateString()} - ${new Date(
							this.currentPatientReport.report_period.end_date
						).toLocaleDateString()}`,
						style: "info",
						alignment: "center",
						margin: [0, 0, 0, 20]
					},

					// Patient Information Section
					{
						text: "Patient Information",
						style: "sectionHeader",
						margin: [0, 20, 0, 10]
					},
					{
						columns: [
							{
								width: "50%",
								table: {
									widths: ["*", "*"],
									body: [
										[
											"Patient Name:",
											this.currentPatientReport
												.patient_name
										],
										...(this.currentPatientReport
											.patient_info.national_id
											? [
													[
														"National ID:",
														this
															.currentPatientReport
															.patient_info
															.national_id
													]
											  ]
											: []),
										[
											"Gender:",
											this.capitalizeFirst(
												this.currentPatientReport
													.patient_info.gender
											)
										],
										...(this.currentPatientReport
											.patient_info.phone
											? [
													[
														"Phone:",
														this
															.currentPatientReport
															.patient_info.phone
													]
											  ]
											: [])
									]
								},
								layout: "noBorders"
							},
							{
								width: "50%",
								table: {
									widths: ["*", "*"],
									body: [
										...(this.currentPatientReport
											.patient_info.insurance_card_id
											? [
													[
														"Card ID:",
														this
															.currentPatientReport
															.patient_info
															.insurance_card_id
													]
											  ]
											: []),
										...(this.currentPatientReport
											.patient_info.insurance_form_id
											? [
													[
														"Form ID:",
														this
															.currentPatientReport
															.patient_info
															.insurance_form_id
													]
											  ]
											: []),
										[
											"Registration:",
											new Date(
												this.currentPatientReport.patient_info.registration_date
											).toLocaleDateString()
										],
										[
											"Insurance:",
											this.currentPatientReport
												.insurance_name
										]
									]
								},
								layout: "noBorders"
							}
						],
						margin: [0, 0, 0, 20]
					},

					// Report Summary Section
					{
						text: "Financial Summary",
						style: "sectionHeader",
						margin: [0, 20, 0, 10]
					},
					{
						table: {
							widths: ["*", "auto"],
							body: [
								[
									{
										text: "Financial Summary",
										colSpan: 2,
										bold: true,
										fillColor: "#f0f0f0",
										alignment: "center"
									},
									{}
								],
								[
									"Services Cost:",
									this.formatCurrency(
										this.currentPatientReport
											.total_services_cost
									)
								],
								[
									"Drugs Cost:",
									this.formatCurrency(
										this.currentPatientReport
											.total_drugs_cost
									)
								],
								[
									{ text: "Total Cost:", bold: true },
									{
										text: this.formatCurrency(
											this.currentPatientReport.total_cost
										),
										bold: true
									}
								],
								[
									"Patient Payments:",
									this.formatCurrency(
										this.currentPatientReport
											.total_patient_payments
									)
								],
								[
									{
										text: "Outstanding Amount:",
										bold: true,
										color: "#dc3545"
									},
									{
										text: this.formatCurrency(
											this.currentPatientReport
												.outstanding_amount
										),
										bold: true,
										color: "#dc3545"
									}
								],
								[
									"Total Admissions:",
									this.currentPatientReport.admissions.length.toString()
								]
							]
						},
						layout: {
							fillColor: function (rowIndex: number) {
								return rowIndex === 0 ? "#f0f0f0" : null;
							}
						},
						margin: [0, 0, 0, 20]
					},

					// Admissions Details
					...this.generatePatientAdmissionsReport()
				],
				styles: {
					header: {
						fontSize: 18,
						bold: true,
						margin: [0, 0, 0, 10]
					},
					subheader: {
						fontSize: 14,
						bold: true,
						margin: [0, 10, 0, 5]
					},
					sectionHeader: {
						fontSize: 14,
						bold: true,
						color: "#0d6efd",
						margin: [0, 15, 0, 8]
					},
					info: {
						fontSize: 10,
						color: "#6c757d"
					},
					admissionHeader: {
						fontSize: 12,
						bold: true,
						color: "#198754"
					}
				},
				pageMargins: [40, 60, 40, 60],
				footer: function (currentPage: number, pageCount: number) {
					return {
						text: `Page ${currentPage} of ${pageCount} - Generated on ${new Date().toLocaleDateString()}`,
						alignment: "center",
						fontSize: 8,
						margin: [0, 10, 0, 0]
					};
				},
				defaultStyle: {
					font: "Segoe UI"
				}
			};

			//@ts-ignore
			const pdf = pdfMake.createPdf(docDefinition);
			pdf.open();
			this.showSuccess("Patient report generated successfully");
		} catch (error) {
			console.error("Error generating patient report:", error);
			this.showError("Failed to generate patient report");
		}
	}

	private generatePatientAdmissionsReport(): any[] {
		if (
			!this.currentPatientReport ||
			!this.currentPatientReport.admissions ||
			this.currentPatientReport.admissions.length === 0
		) {
			return [
				{
					text: "No admissions found for the selected period.",
					style: "info",
					alignment: "center",
					margin: [0, 20, 0, 20]
				}
			];
		}

		const content: any[] = [];

		// Add section header
		content.push({
			text: "Admissions Details",
			style: "sectionHeader",
			margin: [0, 20, 0, 15]
		});

		this.currentPatientReport.admissions.forEach((admission, index) => {
			// Add admission header
			const admissionDate = new Date(
				admission.admission_time
			).toLocaleDateString();
			const dischargeDate = admission.discharge_time
				? new Date(admission.discharge_time).toLocaleDateString()
				: "Currently Admitted";

			content.push({
				text: `Admission ${
					index + 1
				}: ${admissionDate} - ${dischargeDate}`,
				style: "admissionHeader",
				margin: [0, index === 0 ? 0 : 20, 0, 5]
			});

			// Add admission info
			content.push({
				table: {
					widths: ["*", "*", "*", "*"],
					body: [
						[
							`Bill ID: ${admission.bill_id}`,
							`Total: ${this.formatCurrency(
								admission.total_amount, true
							)}`,
							`Paid: ${this.formatCurrency(
								admission.paid_amount, true
							)}`,
							`Outstanding: ${this.formatCurrency(
								admission.outstanding_amount, true
							)}`
						]
					]
				},
				layout: "noBorders",
				margin: [0, 0, 0, 10]
			});

			if (admission.diagnosis) {
				content.push({
					text: `Diagnosis: ${admission.diagnosis}`,
					fontSize: 10,
					color: "#6c757d",
					margin: [0, 0, 0, 10]
				});
			}

			// Add items table if there are items
			if (admission.items && admission.items.length > 0) {
				const tableBody = [];

				// Add header row
				tableBody.push([
					{ text: "Item Name", bold: true, fillColor: "#f0f0f0" },
					{ text: "Type", bold: true, fillColor: "#f0f0f0" },
					{ text: "Service Date", bold: true, fillColor: "#f0f0f0" },
					{
						text: "Qty",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "center"
					},
					{
						text: "Unit Price",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "right"
					},
					{
						text: "Total",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "right"
					}
				]);

				// Add data rows
				let admissionTotal = 0;
				admission.items.forEach((item: any) => {
					const itemName =
						item.item_type === "service"
							? item.service_name || "Unknown Service"
							: item.drug_name || "Unknown Drug";

					tableBody.push([
						itemName,
						this.capitalizeFirst(item.item_type),
						new Date(item.service_date).toLocaleDateString(),
						{ text: item.quantity.toString(), alignment: "center" },
						{
							text: this.formatCurrency(item.unit_price, true),
							alignment: "right"
						},
						{
							text: this.formatCurrency(item.total_cost, true),
							alignment: "right"
						}
					]);

					admissionTotal += item.total_cost;
				});

				// Add total row
				tableBody.push([
					{
						text: "Admission Items Total:",
						colSpan: 5,
						bold: true,
						fillColor: "#f8f9fa"
					},
					{},
					{},
					{},
					{},
					{
						text: this.formatCurrency(admissionTotal, true),
						bold: true,
						alignment: "right",
						fillColor: "#f8f9fa"
					}
				]);

				content.push({
					table: {
						headerRows: 1,
						widths: ["*", "auto", "auto", "auto", "auto", "auto"],
						body: tableBody
					},
					layout: {
						fillColor: function (rowIndex: number) {
							if (rowIndex === 0) return "#f0f0f0";
							if (rowIndex === tableBody.length - 1)
								return "#f8f9fa";
							return rowIndex % 2 === 0 ? "#f9f9f9" : null;
						}
					},
					margin: [0, 0, 0, 15]
				});
			} else {
				content.push({
					text: "No billable items found for this admission in the selected period.",
					fontSize: 10,
					color: "#6c757d",
					italics: true,
					margin: [0, 0, 0, 15]
				});
			}

			// Add page break after each admission except the last one
			if (index < this.currentPatientReport!.admissions.length - 1) {
				content.push({ text: "", pageBreak: "before" });
			}
		});

		return content;
	}

	private populatePriceListOptions(): void {
		const select = document.getElementById(
			"priceListId"
		) as HTMLSelectElement;

		// Clear existing options except the first one
		while (select.children.length > 1) {
			select.removeChild(select.lastElementChild!);
		}

		this.priceLists.forEach((priceList) => {
			const option = document.createElement("option");
			option.value = priceList.pricelist_id.toString();
			option.textContent = priceList.name;
			select.appendChild(option);
		});
	}

	// Modal Methods
	private showInsuranceModal(insurance?: InsuranceCompany): void {
		const form = document.getElementById(
			"insuranceForm"
		) as HTMLFormElement;
		const modalLabel = document.getElementById("insuranceModalLabel")!;

		form.reset();
		form.classList.remove("was-validated");

		if (insurance) {
			// Edit mode
			this.isEditMode = true;
			modalLabel.textContent = i18n.t("insurance.modals.editCompany");

			(document.getElementById("insuranceId") as HTMLInputElement).value =
				insurance.insurance_id.toString();
			(document.getElementById("companyName") as HTMLInputElement).value =
				insurance.name;
			(
				document.getElementById("contactInfo") as HTMLTextAreaElement
			).value = insurance.contact_info || "";
			(
				document.getElementById("priceListId") as HTMLSelectElement
			).value = insurance.pricelist_id?.toString() || "";
		} else {
			// Add mode
			this.isEditMode = false;
			modalLabel.textContent = i18n.t("insurance.modals.addCompany");
			(document.getElementById("insuranceId") as HTMLInputElement).value =
				"";
		}

		this.insuranceModal.show();
	}

	private async saveInsuranceCompany(): Promise<void> {
		const form = document.getElementById(
			"insuranceForm"
		) as HTMLFormElement;
		const saveBtn = document.getElementById(
			"saveInsuranceBtn"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		try {
			this.setButtonLoading(saveBtn, true);

			const formData = {
				name: (
					document.getElementById("companyName") as HTMLInputElement
				).value.trim(),
				contact_info:
					(
						document.getElementById(
							"contactInfo"
						) as HTMLTextAreaElement
					).value.trim() || null,
				pricelist_id:
					(
						document.getElementById(
							"priceListId"
						) as HTMLSelectElement
					).value || null
			};

			let url = "/api/insurance-companies";
			let method = "POST";

			if (this.isEditMode) {
				const insuranceId = (
					document.getElementById("insuranceId") as HTMLInputElement
				).value;
				url = `/api/insurance-companies/${insuranceId}`;
				method = "PUT";
			}

			const response = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				},
				body: JSON.stringify(formData)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.message || i18n.t("insurance.messages.saveError")
				);
			}

			this.insuranceModal.hide();
			const message = this.isEditMode
				? i18n.t("insurance.messages.updateSuccess")
				: i18n.t("insurance.messages.createSuccess");
			this.showSuccess(message);

			// Reload data
			await this.loadInsuranceCompanies();

			// If we were viewing details, refresh them
			if (this.selectedInsurance && this.isEditMode) {
				await this.selectInsuranceCompany(
					this.selectedInsurance.insurance_id
				);
			}
		} catch (error: any) {
			console.error("Error saving insurance company:", error);
			this.showError(
				error.message || i18n.t("insurance.messages.saveError")
			);
		} finally {
			this.setButtonLoading(saveBtn, false);
		}
	}

	private editInsuranceCompany(): void {
		if (this.selectedInsurance) {
			this.showInsuranceModal(this.selectedInsurance);
		}
	}

	private showPaymentModal(): void {
		if (!this.selectedInsurance) return;

		const form = document.getElementById("paymentForm") as HTMLFormElement;
		form.reset();
		form.classList.remove("was-validated");

		// Set default dates (last month)
		const today = new Date();
		const lastMonth = new Date(
			today.getFullYear(),
			today.getMonth() - 1,
			1
		);
		const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

		(document.getElementById("paymentFromDate") as HTMLInputElement).value =
			lastMonth.toISOString().split("T")[0];
		(document.getElementById("paymentToDate") as HTMLInputElement).value =
			lastMonthEnd.toISOString().split("T")[0];

		this.paymentModal.show();
	}

	private async savePayment(): Promise<void> {
		const form = document.getElementById("paymentForm") as HTMLFormElement;
		const saveBtn = document.getElementById(
			"savePaymentBtn"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		if (!this.selectedInsurance) {
			this.showError(i18n.t("insurance.messages.loadDetailsError"));
			return;
		}

		try {
			this.setButtonLoading(saveBtn, true);

			const paymentAmount = parseFloat(
				(document.getElementById("paymentAmount") as HTMLInputElement)
					.value
			);
			const paymentFromDate = (
				document.getElementById("paymentFromDate") as HTMLInputElement
			).value;
			const paymentToDate = (
				document.getElementById("paymentToDate") as HTMLInputElement
			).value;

			// Validate dates
			if (new Date(paymentFromDate) >= new Date(paymentToDate)) {
				this.showError(i18n.t("insurance.validation.fromDateRequired"));
				return;
			}

			if (new Date(paymentToDate) > new Date()) {
				this.showError(i18n.t("insurance.validation.toDateRequired"));
				return;
			}

			const response = await fetch(
				`/api/insurance-companies/${this.selectedInsurance.insurance_id}/payments`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						payment_amount: paymentAmount,
						payment_from: paymentFromDate,
						payment_to: paymentToDate
					})
				}
			);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.message ||
						i18n.t("insurance.messages.paymentError")
				);
			}

			this.paymentModal.hide();
			this.showSuccess(i18n.t("insurance.messages.paymentSuccess"));

			// Refresh statistics
			if (this.selectedInsurance) {
				await this.loadInsuranceStatistics(
					this.selectedInsurance.insurance_id
				);
				this.displayInsuranceStatistics();
			}
		} catch (error: any) {
			console.error("Error saving payment:", error);
			this.showError(
				error.message || i18n.t("insurance.messages.paymentError")
			);
		} finally {
			this.setButtonLoading(saveBtn, false);
		}
	}

	private showReportModal(): void {
		if (!this.selectedInsurance) return;

		const form = document.getElementById("reportForm") as HTMLFormElement;
		form.reset();
		form.classList.remove("was-validated");

		// Set default dates (current month)
		const today = new Date();
		const firstDayOfMonth = new Date(
			today.getFullYear(),
			today.getMonth(),
			1
		);

		(document.getElementById("reportStartDate") as HTMLInputElement).value =
			firstDayOfMonth.toISOString().split("T")[0];
		(document.getElementById("reportEndDate") as HTMLInputElement).value =
			today.toISOString().split("T")[0];

		// Set default options
		(document.getElementById("includeDrugs") as HTMLInputElement).checked =
			true;
		(
			document.getElementById("includeClearedItems") as HTMLInputElement
		).checked = false;

		this.reportModal.show();
	}

	private async generateReport(): Promise<void> {
		const form = document.getElementById("reportForm") as HTMLFormElement;
		const generateBtn = document.getElementById(
			"generateReportBtnModal"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		if (!this.selectedInsurance) {
			this.showError(i18n.t("insurance.messages.loadDetailsError"));
			return;
		}

		try {
			this.setButtonLoading(generateBtn, true);

			const startDate = (
				document.getElementById("reportStartDate") as HTMLInputElement
			).value;
			const endDate = (
				document.getElementById("reportEndDate") as HTMLInputElement
			).value;
			const includeDrugs = (
				document.getElementById("includeDrugs") as HTMLInputElement
			).checked;
			const includeClearedItems = (
				document.getElementById(
					"includeClearedItems"
				) as HTMLInputElement
			).checked;

			// Validate dates
			if (new Date(startDate) >= new Date(endDate)) {
				this.showError(
					i18n.t("insurance.validation.startDateRequired")
				);
				return;
			}

			const response = await fetch(
				`/api/insurance-companies/${this.selectedInsurance.insurance_id}/reports`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						start_date: startDate,
						end_date: endDate,
						include_drugs: includeDrugs,
						include_cleared_items: includeClearedItems
					})
				}
			);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.message ||
						i18n.t("insurance.messages.reportError")
				);
			}

			this.currentReport = await response
				.json()
				.then((result) => result.data);

			this.reportModal.hide();
			this.displayReportDetails();
		} catch (error: any) {
			console.error("Error generating report:", error);
			this.showError(
				error.message || i18n.t("insurance.messages.reportError")
			);
		} finally {
			this.setButtonLoading(generateBtn, false);
		}
	}

	private displayReportDetails(): void {
		if (!this.currentReport) return;

		const modalLabel = document.getElementById("reportDetailsModalLabel")!;
		const container = document.getElementById("reportDetailsContent")!;

		modalLabel.textContent = `${
			this.currentReport.insurance_name
		} - ${i18n.t("insurance.modals.insuranceReport")}`;

		const reportStartDate = i18n.formatDate(
			this.currentReport.report_period.start_date
		);
		const reportEndDate = i18n.formatDate(
			this.currentReport.report_period.end_date
		);

		// Generate report summary
		const summaryHtml = `
        <div class="report-summary">
            <div class="report-summary-title">
                ${i18n.t(
					"insurance.report.summary"
				)} - ${reportStartDate} ${i18n.t("common.to")} ${reportEndDate}
            </div>
            <div class="report-summary-grid">
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentReport.total_services_cost
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.report.services"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentReport.total_drugs_cost
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.report.drugs"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentReport.total_cost
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.report.totalAmount"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${i18n.formatCurrency(
						this.currentReport.total_patient_payments
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.paymentHistory.paymentAmount"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value text-warning">${i18n.formatCurrency(
						this.currentReport.outstanding_amount
					)}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.statistics.outstandingBalance"
					)}</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${
						this.currentReport.patient_count
					}</span>
                    <span class="report-summary-label">${i18n.t(
						"insurance.patients"
					)}</span>
                </div>
            </div>
        </div>
    `;

		// Generate updated patient-grouped items display
		let itemsDisplayHtml = "";
		if (this.currentReport.items && this.currentReport.items.length > 0) {
			const patientGroups = this.groupItemsByPatient(
				this.currentReport.items
			);

			itemsDisplayHtml = `
            <div class="mt-4">
                <h6>${i18n.t("insurance.report.patientName")} (${
				Object.keys(patientGroups).length
			} ${i18n.t("insurance.patients").toLowerCase()}, ${
				this.currentReport.items.length
			} items)</h6>
                ${Object.entries(patientGroups)
					.map(
						(
							[patientName, patientData]: [string, any],
							index: number
						) =>
							this.createPatientGroupCard(
								patientName,
								patientData,
								index
							)
					)
					.join("")}
            </div>
        `;
		} else {
			itemsDisplayHtml = `
            <div class="mt-4 text-center text-muted">
                <i class="bi bi-inbox" style="font-size: 3rem;"></i>
                <h6 class="mt-3">${i18n.t("insurance.report.noData")}</h6>
                <p>${i18n.t("insurance.report.noData")}</p>
            </div>
        `;
		}

		// Generate payments section with i18n
		let paymentsHtml = "";
		if (
			this.currentReport.cleared_payments &&
			this.currentReport.cleared_payments.length > 0
		) {
			const paymentRows = this.currentReport.cleared_payments
				.map(
					(payment) => `
            <tr>
                <td>${i18n.formatCurrency(payment.payment_amount)}</td>
                <td>${i18n.formatDate(payment.payment_from)}</td>
                <td>${i18n.formatDate(payment.payment_to)}</td>
                <td>${i18n.formatDateTime(payment.issued_timestamp)}</td>
                <td>${payment.added_by_username || "-"}</td>
            </tr>
        `
				)
				.join("");

			paymentsHtml = `
            <div class="mt-4">
                <h6>${i18n.t("insurance.modals.paymentHistory")} (${
				this.currentReport.cleared_payments.length
			} ${i18n
				.t("insurance.statistics.totalPayments")
				.toLowerCase()})</h6>
                <div class="table-responsive">
                    <table class="insurance-report-table">
                        <thead>
                            <tr>
                                <th>${i18n.t(
									"insurance.paymentHistory.paymentAmount"
								)}</th>
                                <th>${i18n.t(
									"insurance.fields.paymentPeriodFrom"
								)}</th>
                                <th>${i18n.t(
									"insurance.fields.paymentPeriodTo"
								)}</th>
                                <th>${i18n.t(
									"insurance.paymentHistory.paymentDate"
								)}</th>
                                <th>${i18n.t(
									"insurance.paymentHistory.recordedBy"
								)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${paymentRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
		}

		container.innerHTML = summaryHtml + itemsDisplayHtml + paymentsHtml;
		this.reportDetailsModal.show();
	}

	private createPatientGroupCard(
		patientName: string,
		patientData: any,
		index: number
	): string {
		const sampleItem = patientData.items[0];
		const admissionDate = i18n.formatDate(sampleItem.admission_time);
		const dischargeDate = sampleItem.discharge_time
			? i18n.formatDate(sampleItem.discharge_time)
			: null;

		const itemRows = patientData.items
			.map(
				(item: any) => `
	        <tr>
	            <td>${
					item.item_type === "service"
						? item.service_name || "-"
						: item.drug_name || "-"
				}</td>
	            <td><span class="badge ${
					item.item_type === "service" ? "bg-success" : "bg-primary"
				}">${this.capitalizeFirst(item.item_type)}</span></td>
	            <td>${i18n.formatDate(item.service_date)}</td>
	            <td>${item.quantity}</td>
	            <td>${i18n.formatCurrency(item.unit_price)}</td>
	            <td>${i18n.formatCurrency(item.total_cost)}</td>
	        </tr>
	    `
			)
			.join("");

		return `
	        <div class="patient-group-card mb-4">
	            <div class="patient-group-header">
	                <h6 class="mb-2">${index + 1}. ${this.escapeHtml(
			patientName
		)}</h6>
	                <div class="patient-group-info">
	                    ${
							sampleItem.insurance_card_id
								? `<span class="badge bg-primary me-2">${i18n.t(
										"insurance.patient.insuranceCardId"
								  )}: ${sampleItem.insurance_card_id}</span>`
								: ""
						}
	                    ${
							sampleItem.insurance_form_id
								? `<span class="badge bg-info me-2">${i18n.t(
										"insurance.patient.insuranceFormId"
								  )}: ${sampleItem.insurance_form_id}</span>`
								: ""
						}
	                    <span class="badge bg-secondary">${i18n.t(
							"insurance.patient.admission"
						)}: ${admissionDate}</span>
	                    ${
							dischargeDate
								? `<span class="badge bg-success">${i18n.t(
										"insurance.patient.status.inactive"
								  )}: ${dischargeDate}</span>`
								: `<span class="badge bg-warning">${i18n.t(
										"insurance.patient.admission"
								  )}</span>`
						}
	                </div>
	            </div>
	            <div class="table-responsive">
	                <table class="table table-sm">
	                    <thead>
	                        <tr>
	                            <th>${i18n.t("insurance.report.serviceType")}</th>
	                            <th>${i18n.t("common.status")}</th>
	                            <th>${i18n.t("insurance.report.date")}</th>
	                            <th>${i18n.t("insurance.report.quantity")}</th>
	                            <th>${i18n.t("insurance.report.unitPrice")}</th>
	                            <th>${i18n.t("insurance.report.totalPrice")}</th>
	                        </tr>
	                    </thead>
	                    <tbody>
	                        ${itemRows}
	                    </tbody>
	                    <tfoot class="table-light">
	                        <tr class="border-top-2">
	                            <td colspan="5" class="fw-bold">${i18n.t(
									"common.total"
								)}:</td>
	                            <td class="fw-bold">${i18n.formatCurrency(
									patientData.totalCost
								)}</td>
	                        </tr>
	                        <tr>
	                            <td colspan="5" class="fw-bold">${i18n.t(
									"insurance.paymentHistory.paymentAmount"
								)}:</td>
	                            <td class="fw-bold text-success">${i18n.formatCurrency(
									patientData.patientPaid
								)}</td>
	                        </tr>
	                        <tr>
	                            <td colspan="5" class="fw-bold">${i18n.t(
									"insurance.patient.outstandingAmount"
								)}:</td>
	                            <td class="fw-bold ${
									patientData.totalCost -
										patientData.patientPaid >
									0
										? "text-warning"
										: "text-success"
								}">
	                                ${i18n.formatCurrency(
										patientData.totalCost -
											patientData.patientPaid
									)}
	                            </td>
	                        </tr>
	                    </tfoot>
	                </table>
	            </div>
	        </div>
	    `;
	}

	private async printReport(): Promise<void> {
		if (!this.currentReport) {
			this.showError(i18n.t("insurance.messages.reportError"));
			return;
		}

		try {
			const patientsSummaryColumns: any[] = [];
			const groupedPatients = this.groupItemsByPatient(
				this.currentReport.items
			);
			patientsSummaryColumns.push([
				{
					text: "Total Owed By patient",
					colSpan: 2,
					bold: true,
					alignment: "center",
					fillColor: "#f0f0f0"
				}
			]);
			Object.entries(groupedPatients).forEach(([key, value]) => {
				patientsSummaryColumns.push([
					key,
					{
						text: `${this.formatCurrency(value.totalCost - value.patientPaid || 0)}`,
						color: "red"
					}
				]);
			});
			const docDefinition = {
				content: [
					{
						text: `${this.currentReport.insurance_name} - Insurance Report`,
						style: "header",
						alignment: "center"
					},
					{
						text: `Report Period: ${new Date(
							this.currentReport.report_period.start_date
						).toLocaleDateString()} - ${new Date(
							this.currentReport.report_period.end_date
						).toLocaleDateString()}`,
						style: "subheader",
						alignment: "center"
					},
					// Summary section
					{
						columns: [
							{
								width: "*",
								table: {
									widths: ["*", "auto"],
									body: [
										[
											{
												text: "Report Summary",
												colSpan: 2,
												bold: true,
												fillColor: "#f0f0f0",
												alignment: "center"
											},
											{}
										],
										[
											"Services Cost:",
											this.formatCurrency(
												this.currentReport
													.total_services_cost,
												true
											)
										],
										[
											"Drugs Cost:",
											this.formatCurrency(
												this.currentReport
													.total_drugs_cost,
												true
											)
										],
										[
											{ text: "Total Cost:", bold: true },
											{
												text: this.formatCurrency(
													this.currentReport
														.total_cost,
													true
												),
												bold: true
											}
										],
										[
											"Patient Payments:",
											this.formatCurrency(
												this.currentReport
													.total_patient_payments,
												true
											)
										],
										[
											{
												text: "Outstanding:",
												bold: true,
												color: "#dc3545"
											},
											{
												text: this.formatCurrency(
													this.currentReport
														.outstanding_amount,
													true
												),
												bold: true,
												color: "#dc3545"
											}
										],
										[
											"Total Patients:",
											this.currentReport.patient_count.toString()
										],
										...(patientsSummaryColumns as any[])
									]
								},
								layout: {
									fillColor: function (rowIndex: number) {
										return rowIndex === 0
											? "#f0f0f0"
											: null;
									}
								}
							}
						],
						margin: [0, 0, 0, 0]
					},
					// Patient details
					...this.generatePatientGroupedReport()
				],
				styles: {
					header: {
						fontSize: 18,
						bold: true,
						margin: [0, 0, 0, 10]
					},
					subheader: {
						fontSize: 14,
						bold: true,
						margin: [0, 10, 0, 5]
					},
					info: {
						fontSize: 10,
						color: "#6c757d"
					},
					patientHeader: {
						fontSize: 12,
						bold: true,
						color: "#0d6efd"
					},
					patientInfo: {
						fontSize: 10,
						color: "#6c757d"
					}
				},
				pageMargins: [40, 60, 40, 60],
				footer: function (currentPage: number, pageCount: number) {
					return {
						text: `Page ${currentPage} of ${pageCount} - Generated on ${new Date().toLocaleDateString()}`,
						alignment: "center",
						fontSize: 8,
						margin: [0, 10, 0, 0]
					};
				},
				defaultStyle: {
					font: "Segoe UI"
				}
			};

			//@ts-ignore
			const pdf = pdfMake.createPdf(docDefinition);
			pdf.open();
			this.showSuccess(i18n.t("common.success"));
		} catch (error) {
			console.error("Error generating report:", error);
			this.showError(i18n.t("insurance.messages.reportError"));
		}
	}

	private generatePatientGroupedReport(): any[] {
		if (
			!this.currentReport ||
			!this.currentReport.items ||
			this.currentReport.items.length === 0
		) {
			return [
				{
					text: "No patient data available for the selected period and criteria.",
					style: "subheader",
					alignment: "center",
					margin: [0, 20, 0, 20]
				}
			];
		}

		// Group items by patient
		const patientGroups = this.groupItemsByPatient(
			this.currentReport.items
		);
		const content: any[] = [];

		// Add section header
		content.push({
			text: "Patient Details",
			style: "subheader",
			margin: [0, 20, 0, 15]
		});

		Object.entries(patientGroups).forEach(
			([patientName, patientData]: [string, any], index: number) => {
				// Add patient header
				content.push({
					text: `${index + 1}. Patient: ${patientName}`,
					style: "patientHeader",
					margin: [0, index === 0 ? 0 : 20, 0, 5]
				});

				// Add patient info
				const sampleItem = patientData.items[0];
				const patientInfo: string[] = [];

				if (sampleItem.insurance_card_id) {
					patientInfo.push(
						`Card ID: ${sampleItem.insurance_card_id}`
					);
				}
				if (sampleItem.insurance_form_id) {
					patientInfo.push(
						`Form ID: ${sampleItem.insurance_form_id}`
					);
				}
				patientInfo.push(
					`Admission: ${new Date(
						sampleItem.admission_time
					).toLocaleDateString()}`
				);
				if (sampleItem.discharge_time) {
					patientInfo.push(
						`Discharge: ${new Date(
							sampleItem.discharge_time
						).toLocaleDateString()}`
					);
				} else {
					patientInfo.push(`Status: Currently Admitted`);
				}

				content.push({
					text: patientInfo.join(" • "),
					style: "patientInfo",
					margin: [0, 0, 0, 10]
				});

				// Create patient items table with summary rows included
				const tableBody = [];

				// Add header row
				tableBody.push([
					{ text: "Item Name", bold: true, fillColor: "#f0f0f0" },
					{ text: "Type", bold: true, fillColor: "#f0f0f0" },
					{ text: "Service Date", bold: true, fillColor: "#f0f0f0" },
					{
						text: "Qty",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "center"
					},
					{
						text: "Unit Price",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "right"
					},
					{
						text: "Total",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "right"
					}
				]);

				// Add data rows for items
				patientData.items.forEach((item: any) => {
					const itemName =
						item.item_type === "service"
							? item.service_name || "Unknown Service"
							: item.drug_name || "Unknown Drug";

					tableBody.push([
						itemName,
						this.capitalizeFirst(item.item_type),
						new Date(item.service_date).toLocaleDateString(),
						{ text: item.quantity.toString(), alignment: "center" },
						{
							text: this.formatCurrency(item.unit_price, true),
							alignment: "right"
						},
						{
							text: this.formatCurrency(item.total_cost, true),
							alignment: "right"
						}
					]);
				});

				// Add summary rows at the end of the same table
				const outstandingAmount =
					patientData.totalCost - patientData.patientPaid;

				tableBody.push([
					{
						text: "Total Charges:",
						colSpan: 5,
						bold: true,
						fillColor: "#f8f9fa",
						border: [true, true, true, true]
					},
					{},
					{},
					{},
					{},
					{
						text: this.formatCurrency(patientData.totalCost, true),
						bold: true,
						alignment: "right",
						fillColor: "#f8f9fa"
					}
				]);

				tableBody.push([
					{
						text: "Patient Paid:",
						colSpan: 5,
						bold: true,
						fillColor: "#f8f9fa",
						border: [true, true, true, true]
					},
					{},
					{},
					{},
					{},
					{
						text: this.formatCurrency(
							patientData.patientPaid,
							true
						),
						bold: true,
						alignment: "right",
						fillColor: "#f8f9fa"
					}
				]);

				tableBody.push([
					{
						text: "Outstanding Amount:",
						colSpan: 5,
						bold: true,
						fillColor:
							outstandingAmount > 0 ? "#fff3cd" : "#d1edff",
						border: [true, true, true, true]
					},
					{},
					{},
					{},
					{},
					{
						text: this.formatCurrency(outstandingAmount, true),
						bold: true,
						alignment: "right",
						color: outstandingAmount > 0 ? "#856404" : "#0c5460",
						fillColor: outstandingAmount > 0 ? "#fff3cd" : "#d1edff"
					}
				]);

				// Add the complete patient table
				content.push({
					table: {
						headerRows: 1,
						widths: ["*", "auto", "auto", "auto", "auto", "auto"],
						body: tableBody
					},
					layout: {
						fillColor: function (rowIndex: number, node: any) {
							// Header row
							if (rowIndex === 0) return "#f0f0f0";

							// Find where summary rows start (after separator)
							const summaryIndex = node.table.body.findIndex(
								(row: any) => row[0].colSpan === 5
							);

							// Summary rows - use their individual fill colors
							if (rowIndex == summaryIndex) return null;

							// Regular data rows - alternate colors
							return rowIndex % 2 === 0 ? "#f9f9f9" : null;
						},
						hLineWidth: function (i: number, node: any) {
							// Find separator row index
							const summaryIndex = node.table.body.findIndex(
								(row: any) => row[0].colSpan === 5
							);

							// Thicker line before summary rows
							if (i === summaryIndex) return 2;

							// Normal lines elsewhere
							return 1;
						}
					},
					margin: [0, 0, 0, 15]
				});

				// Add page break after each patient except the last one
				if (index < Object.keys(patientGroups).length - 1) {
					content.push({ text: "", pageBreak: "before" });
				}
			}
		);

		return content;
	}

	private groupItemsByPatient(items: any[]): { [patientName: string]: any } {
		const groups: { [patientName: string]: any } = {};

		items.forEach((item) => {
			const patientName = item.patient_name;

			if (!groups[patientName]) {
				groups[patientName] = {
					items: [],
					totalCost: 0,
					patientPaid: item.patient_paid_amount || 0,
					patientTotal: item.patient_total_amount || 0
				};
			}

			groups[patientName].items.push(item);
			groups[patientName].totalCost += parseFloat(item.total_cost) || 0;

			// Update patient payment info if it's higher (in case of multiple bills)
			if (
				(item.patient_paid_amount || 0) >
				groups[patientName].patientPaid
			) {
				groups[patientName].patientPaid = item.patient_paid_amount || 0;
			}
			if (
				(item.patient_total_amount || 0) >
				groups[patientName].patientTotal
			) {
				groups[patientName].patientTotal =
					item.patient_total_amount || 0;
			}
		});

		// Sort items within each patient group by service date
		Object.keys(groups).forEach((patientName) => {
			groups[patientName].items.sort((a: any, b: any) => {
				return (
					new Date(a.service_date).getTime() -
					new Date(b.service_date).getTime()
				);
			});
		});

		return groups;
	}

	private showClearBalanceModal(): void {
		if (!this.selectedInsurance) return;

		const form = document.getElementById(
			"clearBalanceForm"
		) as HTMLFormElement;
		form.reset();
		form.classList.remove("was-validated");

		// Set default date to today
		(document.getElementById("clearDate") as HTMLInputElement).value =
			new Date().toISOString().split("T")[0];

		this.clearBalanceModal.show();
	}

	private async clearBalance(): Promise<void> {
		const form = document.getElementById(
			"clearBalanceForm"
		) as HTMLFormElement;
		const clearBtn = document.getElementById(
			"confirmClearBtn"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		if (!this.selectedInsurance) {
			this.showError(i18n.t("insurance.messages.loadDetailsError"));
			return;
		}

		try {
			this.setButtonLoading(clearBtn, true);

			const clearDate = (
				document.getElementById("clearDate") as HTMLInputElement
			).value;

			// Validate clear date
			if (new Date(clearDate) > new Date()) {
				this.showError(
					i18n.t("insurance.validation.clearDateRequired")
				);
				return;
			}

			const response = await fetch(
				`/api/insurance-companies/${this.selectedInsurance.insurance_id}/clear-balance`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						clear_date: clearDate
					})
				}
			);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.message ||
						i18n.t("insurance.messages.clearBalanceError")
				);
			}

			this.clearBalanceModal.hide();
			this.showSuccess(i18n.t("insurance.messages.clearBalanceSuccess"));

			// Refresh insurance data
			await this.loadInsuranceCompanies();
			if (this.selectedInsurance) {
				await this.selectInsuranceCompany(
					this.selectedInsurance.insurance_id
				);
			}
		} catch (error: any) {
			console.error("Error clearing balance:", error);
			this.showError(
				error.message || i18n.t("insurance.messages.clearBalanceError")
			);
		} finally {
			this.setButtonLoading(clearBtn, false);
		}
	}

	private async showPaymentHistory(): Promise<void> {
		if (!this.selectedInsurance) return;

		try {
			// Show loading in modal
			const modalContent = document.getElementById(
				"paymentHistoryContent"
			)!;
			modalContent.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">${i18n.t(
						"common.loading"
					)}</span>
                </div>
                <p class="mt-3">${i18n.t(
					"insurance.messages.loadPaymentHistoryError"
				)}</p>
            </div>
        `;

			document.getElementById(
				"paymentHistoryModalLabel"
			)!.textContent = `${i18n.t("insurance.modals.paymentHistory")} - ${
				this.selectedInsurance.name
			}`;

			this.paymentHistoryModal.show();

			// Fetch payment history
			const response = await fetch(
				`/api/insurance-companies/${this.selectedInsurance.insurance_id}/payments`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error(
					i18n.t("insurance.messages.loadPaymentHistoryError")
				);
			}

			const result = await response.json();
			const payments: InsurancePayment[] = result.data || [];

			this.displayPaymentHistory(payments);
		} catch (error) {
			console.error("Error loading payment history:", error);
			document.getElementById("paymentHistoryContent")!.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>
                ${i18n.t("insurance.messages.loadPaymentHistoryError")}
            </div>
        `;
		}
	}

	private displayPaymentHistory(payments: InsurancePayment[]): void {
		const container = document.getElementById("paymentHistoryContent")!;

		if (payments.length === 0) {
			container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-credit-card" style="font-size: 3rem;"></i>
                <h5 class="mt-3">${i18n.t(
					"insurance.paymentHistory.noPayments"
				)}</h5>
                <p>${i18n.t("insurance.paymentHistory.noPayments")}</p>
            </div>
        `;
			return;
		}

		const totalPayments = payments.reduce(
			(sum, payment) =>
				sum + parseInt(payment.payment_amount as unknown as string),
			0
		);

		const summaryHtml = `
        <div class="alert alert-info">
            <div class="row">
                <div class="col-md-4">
                    <strong>${i18n.t(
						"insurance.statistics.totalPayments"
					)}:</strong> ${payments.length}
                </div>
                <div class="col-md-4">
                    <strong>${i18n.t(
						"insurance.report.totalAmount"
					)}:</strong> ${i18n.formatCurrency(totalPayments)}
                </div>
                <div class="col-md-4">
                    <strong>${i18n.t(
						"insurance.paymentHistory.paymentAmount"
					)}:</strong> ${i18n.formatCurrency(
			totalPayments / payments.length
		)}
                </div>
            </div>
        </div>
    `;

		const paymentsHtml = payments
			.map((payment) => this.createPaymentHistoryItem(payment))
			.join("");

		container.innerHTML = summaryHtml + paymentsHtml;
	}

	private createPaymentHistoryItem(payment: InsurancePayment): string {
		const recordedDate = i18n.formatDate(payment.issued_timestamp);
		const fromDate = i18n.formatDate(payment.payment_from);
		const toDate = i18n.formatDate(payment.payment_to);

		return `
        <div class="payment-history-item">
            <div class="payment-header">
                <div class="payment-amount">${i18n.formatCurrency(
					payment.payment_amount
				)}</div>
                <div class="payment-date">${i18n.t(
					"insurance.paymentHistory.paymentDate"
				)}: ${recordedDate}</div>
            </div>
            <div class="payment-period">
                <i class="bi bi-calendar-range me-2"></i>
                ${i18n.t(
					"insurance.fields.paymentPeriodFrom"
				)}: ${fromDate} - ${toDate}
            </div>
            ${
				payment.added_by_username
					? `
                <div class="mt-2">
                    <small class="text-muted">
                        <i class="bi bi-person me-1"></i>${i18n.t(
							"insurance.paymentHistory.recordedBy"
						)}: ${payment.added_by_username}
                    </small>
                </div>
            `
					: ""
			}
        </div>
    `;
	}

	private backToList(): void {
		// Hide insurance details and show list
		document.getElementById("selectedInsuranceDetails")!.style.display =
			"none";

		// Clear selected insurance
		this.selectedInsurance = null;
		this.currentPatients = [];
		this.currentStatistics = null;

		// Remove selection from cards
		document.querySelectorAll(".insurance-card").forEach((card) => {
			card.classList.remove("selected");
		});

		// Show the list with proper layout
		document.getElementById("insuranceCompaniesList")!.style.display =
			"block";

		// Reset layout and re-render if needed
		setTimeout(() => {
			this.resetInsuranceListLayout();
			document
				.getElementById("insuranceCompaniesList")!
				.classList.add("fade-in");
		}, 50);
	}

	private resetInsuranceListLayout(): void {
		const container = document.getElementById("insuranceCompaniesList")!;
		const row = container.querySelector(".row");

		if (row) {
			// Force re-render by clearing and re-adding content
			const currentHTML = container.innerHTML;
			container.innerHTML = "";
			// Force a reflow
			container.offsetHeight;
			container.innerHTML = currentHTML;
		}

		// Re-attach event listeners
		container.querySelectorAll(".insurance-card").forEach((card) => {
			card.addEventListener("click", () => {
				const insuranceId = parseInt(
					card.getAttribute("data-insurance-id")!
				);
				this.selectInsuranceCompany(insuranceId);
			});
		});
	}

	// State Management Methods
	private showLoadingState(): void {
		document.getElementById("emptyState")!.style.display = "none";
		document.getElementById("insuranceContent")!.style.display = "none";
		document.getElementById("loadingState")!.style.display = "block";
	}

	private showEmptyState(): void {
		document.getElementById("loadingState")!.style.display = "none";
		document.getElementById("insuranceContent")!.style.display = "none";
		document.getElementById("emptyState")!.style.display = "block";
	}

	// Utility Methods
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
			const originalText = text.textContent;
			if (loading) {
				button.setAttribute("data-original-text", originalText || "");
				text.textContent = i18n.t("common.loading");
			} else {
				const originalText = button.getAttribute("data-original-text");
				if (originalText) {
					text.textContent = originalText;
					button.removeAttribute("data-original-text");
				}
			}
		}
	}

	private formatCurrency(amount: number, en: boolean = false): string {
		return i18n.formatCurrency(amount, en);
	}

	private capitalizeFirst(str: string): string {
		if (!str) return str;
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	}

	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
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
		insuranceManager: InsuranceManager;
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

// Initialize the manager
(window.insuranceManager as InsuranceManager) = new InsuranceManager();
