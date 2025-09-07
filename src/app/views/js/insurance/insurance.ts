// src/app/views/js/insurance/insurance.ts
//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

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

	private insuranceCompanies: InsuranceCompany[] = [];
	private selectedInsurance: InsuranceCompany | null = null;
	private currentPatients: InsurancePatient[] = [];
	private currentStatistics: InsuranceStatistics | null = null;
	private priceLists: any[] = [];
	private currentReport: InsuranceReportSummary | null = null;
	private isEditMode: boolean = false;

	constructor() {
		// Initialize sidebar
		new SidebarManager();

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

		this.initializeEventListeners();
		this.loadInitialData();
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
			this.showError("Failed to load insurance companies");
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
				throw new Error("Failed to fetch insurance companies");
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

			card.addEventListener("click", (e) => {
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
		const lastClearedDate = new Date(
			insurance.last_cleared_date
		).toLocaleDateString();

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
								insurance.pricelist_name || "No price list"
							}</span>
                        </div>
                        <div class="insurance-meta-item">
                            <i class="bi bi-calendar-check"></i>
                            <span>Cleared: ${lastClearedDate}</span>
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
                            <span class="insurance-stat-label">Patients</span>
                        </div>
                        <div class="insurance-stat">
                            <span class="insurance-stat-value">
                                <i class="bi bi-arrow-right text-primary"></i>
                            </span>
                            <span class="insurance-stat-label">View Details</span>
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
				this.showError("Insurance company not found");
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
			this.showError("Failed to load insurance company details");
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
				throw new Error("Failed to fetch statistics");
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
				throw new Error("Failed to fetch patients");
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
		const lastClearedDate = new Date(
			this.selectedInsurance.last_cleared_date
		).toLocaleDateString();

		container.innerHTML = `
            <div class="insurance-info-item">
                <div class="insurance-info-label">Company Name</div>
                <div class="insurance-info-value">${this.escapeHtml(
					this.selectedInsurance.name
				)}</div>
            </div>
            
            ${
				this.selectedInsurance.contact_info
					? `
                <div class="insurance-info-item">
                    <div class="insurance-info-label">Contact Info</div>
                    <div class="insurance-info-value">${this.escapeHtml(
						this.selectedInsurance.contact_info
					)}</div>
                </div>
            `
					: ""
			}
            
            <div class="insurance-info-item">
                <div class="insurance-info-label">Price List</div>
                <div class="insurance-info-value">${
					this.selectedInsurance.pricelist_name || "Not assigned"
				}</div>
            </div>
            
            <div class="insurance-info-item">
                <div class="insurance-info-label">Last Cleared Date</div>
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
                    Unable to load statistics at this time.
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
                <span class="stat-metric-label">Total Patients</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-success">${
					stats.active_patients
				}</span>
                <span class="stat-metric-label">Active Patients</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-info">${
					stats.current_admissions
				}</span>
                <span class="stat-metric-label">Current Admissions</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value">${this.formatCurrency(
					stats.total_billed
				)}</span>
                <span class="stat-metric-label">Total Billed*</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-primary">${this.formatCurrency(
					stats.total_insurance_payments
				)}</span>
                <span class="stat-metric-label">Insurance Payments</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-success">${this.formatCurrency(
					stats.total_paid
				)}</span>
                <span class="stat-metric-label">Patient Payments*</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value text-warning">${this.formatCurrency(
					stats.total_outstanding
				)}</span>
                <span class="stat-metric-label">Outstanding*</span>
            </div>
        </div>
        <div class="col-md-6 col-lg-3">
            <div class="stat-metric">
                <span class="stat-metric-value ${
					stats.net_outstanding > 0 ? "text-danger" : "text-success"
				}">${this.formatCurrency(stats.net_outstanding)}</span>
                <span class="stat-metric-label">Net Outstanding</span>
            </div>
        </div>
        <div class="col-md-12 mt-3">
            <div class="alert alert-info">
                <small>
                    <i class="bi bi-info-circle me-2"></i>
                    <strong>*</strong> Financial figures only include data after last cleared date 
                    (${new Date(
						this.selectedInsurance!.last_cleared_date
					).toLocaleDateString()}).
                    <br>
                    <strong>Net Outstanding:</strong> Outstanding amount minus insurance payments received.
                    <br>
                    <strong>Payment Coverage:</strong> ${stats.payment_coverage_percentage.toFixed(
						1
					)}% of billed amount covered by insurance payments.
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
                    <h5 class="mt-3">No Patients Found</h5>
                    <p>No patients are registered with this insurance company yet.</p>
                </div>
            `;
			return;
		}

		const html = this.currentPatients
			.map((patient) => this.createPatientCard(patient))
			.join("");
		container.innerHTML = html;
	}

	private createPatientCard(patient: InsurancePatient): string {
		const registrationDate = new Date(
			patient.registration_date
		).toLocaleDateString();
		const genderIcon =
			patient.gender === "male"
				? "bi-gender-male"
				: patient.gender === "female"
				? "bi-gender-female"
				: "bi-person";

		let admissionHtml = "";
		if (patient.current_admission) {
			const admission = patient.current_admission;
			const admissionDate = new Date(
				admission.admission_time
			).toLocaleDateString();
			const outstanding = admission.outstanding_amount;

			admissionHtml = `
                <div class="patient-admission">
                    <div class="patient-admission-header">
                        <i class="bi bi-hospital me-2"></i>Current Admission
                    </div>
                    <div class="patient-admission-details">
                        <div class="patient-admission-detail">
                            <strong>Admitted:</strong> ${admissionDate}
                        </div>
                        <div class="patient-admission-detail">
                            <strong>Diagnosis:</strong> ${
								admission.diagnosis || "Not specified"
							}
                        </div>
                        <div class="patient-admission-detail">
                            <strong>Total:</strong> ${this.formatCurrency(
								admission.total_amount
							)}
                        </div>
                        <div class="patient-admission-detail">
                            <strong>Outstanding:</strong> 
                            <span class="outstanding-amount ${
								outstanding === 0 ? "zero" : ""
							}">
                                ${this.formatCurrency(outstanding)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
		}

		return `
            <div class="patient-card ${
				patient.is_active ? "active-patient" : "inactive-patient"
			}">
                <div class="patient-header">
                    <h6 class="patient-name">${this.escapeHtml(
						patient.name
					)}</h6>
                    <span class="patient-status ${
						patient.is_active ? "active" : "inactive"
					}">
                        ${patient.is_active ? "Active" : "Inactive"}
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
                            <span>Card: ${patient.insurance_card_id}</span>
                        </div>
                    `
							: ""
					}
                    
                    ${
						patient.insurance_form_id
							? `
                        <div class="patient-detail">
                            <i class="bi bi-file-earmark-text"></i>
                            <span>Form: ${patient.insurance_form_id}</span>
                        </div>
                    `
							: ""
					}
                    
                    <div class="patient-detail">
                        <i class="bi bi-calendar-plus"></i>
                        <span>Registered: ${registrationDate}</span>
                    </div>
                </div>
                
                ${admissionHtml}
            </div>
        `;
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
			modalLabel.textContent = "Edit Insurance Company";

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
			modalLabel.textContent = "Add Insurance Company";
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
					errorData.message || "Failed to save insurance company"
				);
			}

			this.insuranceModal.hide();
			this.showSuccess(
				this.isEditMode
					? "Insurance company updated successfully"
					: "Insurance company created successfully"
			);

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
			this.showError(error.message || "Failed to save insurance company");
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
			this.showError("No insurance company selected");
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
				this.showError("From date must be before to date");
				return;
			}

			if (new Date(paymentToDate) > new Date()) {
				this.showError("To date cannot be in the future");
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
					errorData.message || "Failed to record payment"
				);
			}

			this.paymentModal.hide();
			this.showSuccess("Insurance payment recorded successfully");

			// Refresh statistics
			if (this.selectedInsurance) {
				await this.loadInsuranceStatistics(
					this.selectedInsurance.insurance_id
				);
				this.displayInsuranceStatistics();
			}
		} catch (error: any) {
			console.error("Error saving payment:", error);
			this.showError(error.message || "Failed to record payment");
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
			this.showError("No insurance company selected");
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
				this.showError("Start date must be before end date");
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
					errorData.message || "Failed to generate report"
				);
			}

			this.currentReport = await response
				.json()
				.then((result) => result.data);

			this.reportModal.hide();
			this.displayReportDetails();
		} catch (error: any) {
			console.error("Error generating report:", error);
			this.showError(error.message || "Failed to generate report");
		} finally {
			this.setButtonLoading(generateBtn, false);
		}
	}

	private displayReportDetails(): void {
		if (!this.currentReport) return;

		const modalLabel = document.getElementById("reportDetailsModalLabel")!;
		const container = document.getElementById("reportDetailsContent")!;

		modalLabel.textContent = `${this.currentReport.insurance_name} - Insurance Report`;

		const reportStartDate = new Date(
			this.currentReport.report_period.start_date
		).toLocaleDateString();
		const reportEndDate = new Date(
			this.currentReport.report_period.end_date
		).toLocaleDateString();
		const lastClearedDate = new Date(
			this.currentReport.last_cleared_date
		).toLocaleDateString();

		// Generate report summary (same as before)
		const summaryHtml = `
        <div class="report-summary">
            <div class="report-summary-title">
                Report Summary - ${reportStartDate} to ${reportEndDate}
            </div>
            <div class="report-summary-grid">
                <div class="report-summary-item">
                    <span class="report-summary-value">${this.formatCurrency(
						this.currentReport.total_services_cost
					)}</span>
                    <span class="report-summary-label">Services Cost</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${this.formatCurrency(
						this.currentReport.total_drugs_cost
					)}</span>
                    <span class="report-summary-label">Drugs Cost</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${this.formatCurrency(
						this.currentReport.total_cost
					)}</span>
                    <span class="report-summary-label">Total Cost</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${this.formatCurrency(
						this.currentReport.total_patient_payments
					)}</span>
                    <span class="report-summary-label">Patient Payments</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value text-warning">${this.formatCurrency(
						this.currentReport.outstanding_amount
					)}</span>
                    <span class="report-summary-label">Outstanding</span>
                </div>
                <div class="report-summary-item">
                    <span class="report-summary-value">${
						this.currentReport.patient_count
					}</span>
                    <span class="report-summary-label">Patients</span>
                </div>
            </div>
            <div class="mt-3 text-center">
                <small class="text-muted">Last Cleared Date: ${lastClearedDate}</small>
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
                <h6>Patient Details (${
					Object.keys(patientGroups).length
				} patients, ${this.currentReport.items.length} items)</h6>
                ${Object.entries(patientGroups)
					.map(
						(
							[patientName, patientData]: [string, any],
							index: number
						) => `
                    <div class="patient-group-card mb-4">
                        <div class="patient-group-header">
                            <h6 class="mb-2">${index + 1}. ${this.escapeHtml(
							patientName
						)}</h6>
                            <div class="patient-group-info">
                                ${
									patientData.items[0].insurance_card_id
										? `<span class="badge bg-primary me-2">Card: ${patientData.items[0].insurance_card_id}</span>`
										: ""
								}
                                ${
									patientData.items[0].insurance_form_id
										? `<span class="badge bg-info me-2">Form: ${patientData.items[0].insurance_form_id}</span>`
										: ""
								}
                                <span class="badge bg-secondary">Admission: ${new Date(
									patientData.items[0].admission_time
								).toLocaleDateString()}</span>
                                ${
									patientData.items[0].discharge_time
										? `<span class="badge bg-success">Discharge: ${new Date(
												patientData.items[0].discharge_time
										  ).toLocaleDateString()}</span>`
										: `<span class="badge bg-warning">Currently Admitted</span>`
								}
                            </div>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Item Name</th>
                                        <th>Type</th>
                                        <th>Service Date</th>
                                        <th>Qty</th>
                                        <th>Unit Price</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${patientData.items
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
											}">${this.capitalizeFirst(
												item.item_type
											)}</span></td>
                                            <td>${new Date(
												item.service_date
											).toLocaleDateString()}</td>
                                            <td>${item.quantity}</td>
                                            <td>${this.formatCurrency(
												item.unit_price
											)}</td>
                                            <td>${this.formatCurrency(
												item.total_cost
											)}</td>
                                        </tr>
                                    `
										)
										.join("")}
                                </tbody>
                                <tfoot class="table-light">
                                    <tr class="border-top-2">
                                        <td colspan="5" class="fw-bold">Total Charges:</td>
                                        <td class="fw-bold">${this.formatCurrency(
											patientData.totalCost
										)}</td>
                                    </tr>
                                    <tr>
                                        <td colspan="5" class="fw-bold">Patient Paid:</td>
                                        <td class="fw-bold text-success">${this.formatCurrency(
											patientData.patientPaid
										)}</td>
                                    </tr>
                                    <tr>
                                        <td colspan="5" class="fw-bold">Outstanding Amount:</td>
                                        <td class="fw-bold ${
											patientData.totalCost -
												patientData.patientPaid >
											0
												? "text-warning"
												: "text-success"
										}">
                                            ${this.formatCurrency(
												patientData.totalCost -
													patientData.patientPaid
											)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                `
					)
					.join("")}
            </div>
        `;
		} else {
			itemsDisplayHtml = `
            <div class="mt-4 text-center text-muted">
                <i class="bi bi-inbox" style="font-size: 3rem;"></i>
                <h6 class="mt-3">No Items Found</h6>
                <p>No billable items found for the selected period and criteria.</p>
            </div>
        `;
		}

		// Generate payments section (same as before)
		let paymentsHtml = "";
		if (
			this.currentReport.cleared_payments &&
			this.currentReport.cleared_payments.length > 0
		) {
			const paymentRows = this.currentReport.cleared_payments
				.map(
					(payment) => `
            <tr>
                <td>${this.formatCurrency(payment.payment_amount)}</td>
                <td>${new Date(payment.payment_from).toLocaleDateString()}</td>
                <td>${new Date(payment.payment_to).toLocaleDateString()}</td>
                <td>${new Date(
					payment.issued_timestamp
				).toLocaleDateString()}</td>
                <td>${payment.added_by_username || "-"}</td>
            </tr>
        `
				)
				.join("");

			paymentsHtml = `
            <div class="mt-4">
                <h6>Insurance Payments in Period (${this.currentReport.cleared_payments.length} payments)</h6>
                <div class="table-responsive">
                    <table class="insurance-report-table">
                        <thead>
                            <tr>
                                <th>Amount</th>
                                <th>Period From</th>
                                <th>Period To</th>
                                <th>Recorded Date</th>
                                <th>Added By</th>
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

	private async printReport(): Promise<void> {
		if (!this.currentReport) {
			this.showError("No report data to print");
			return;
		}

		try {
			// Create custom PDF with patient grouping
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
					{
						text: `Last Cleared Date: ${new Date(
							this.currentReport.last_cleared_date
						).toLocaleDateString()}`,
						style: "info",
						alignment: "center",
						margin: [0, 0, 0, 20]
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
													.total_services_cost
											)
										],
										[
											"Drugs Cost:",
											this.formatCurrency(
												this.currentReport
													.total_drugs_cost
											)
										],
										[
											{ text: "Total Cost:", bold: true },
											{
												text: this.formatCurrency(
													this.currentReport
														.total_cost
												),
												bold: true
											}
										],
										[
											"Patient Payments:",
											this.formatCurrency(
												this.currentReport
													.total_patient_payments
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
														.outstanding_amount
												),
												bold: true,
												color: "#dc3545"
											}
										],
										[
											"Total Patients:",
											this.currentReport.patient_count.toString()
										]
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
				}
			};

			//@ts-ignore
			const pdf = pdfMake.createPdf(docDefinition);
			pdf.open();
			this.showSuccess("Report generated successfully");
		} catch (error) {
			console.error("Error generating report:", error);
			this.showError("Failed to generate report");
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
							text: this.formatCurrency(item.unit_price),
							alignment: "right"
						},
						{
							text: this.formatCurrency(item.total_cost),
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
						text: this.formatCurrency(patientData.totalCost),
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
						text: this.formatCurrency(patientData.patientPaid),
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
						text: this.formatCurrency(outstandingAmount),
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
			this.showError("No insurance company selected");
			return;
		}

		try {
			this.setButtonLoading(clearBtn, true);

			const clearDate = (
				document.getElementById("clearDate") as HTMLInputElement
			).value;

			// Validate clear date
			if (new Date(clearDate) > new Date()) {
				this.showError("Clear date cannot be in the future");
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
				throw new Error(errorData.message || "Failed to clear balance");
			}

			this.clearBalanceModal.hide();
			this.showSuccess("Insurance balance cleared successfully");

			// Refresh insurance data
			await this.loadInsuranceCompanies();
			if (this.selectedInsurance) {
				await this.selectInsuranceCompany(
					this.selectedInsurance.insurance_id
				);
			}
		} catch (error: any) {
			console.error("Error clearing balance:", error);
			this.showError(error.message || "Failed to clear balance");
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
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-3">Loading payment history...</p>
                </div>
            `;

			document.getElementById(
				"paymentHistoryModalLabel"
			)!.textContent = `Payment History - ${this.selectedInsurance.name}`;

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
				throw new Error("Failed to fetch payment history");
			}

			const result = await response.json();
			const payments: InsurancePayment[] = result.data || [];

			this.displayPaymentHistory(payments);
		} catch (error) {
			console.error("Error loading payment history:", error);
			document.getElementById("paymentHistoryContent")!.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load payment history. Please try again.
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
                    <h5 class="mt-3">No Payment History</h5>
                    <p>No payments have been recorded for this insurance company yet.</p>
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
                        <strong>Total Payments:</strong> ${payments.length}
                    </div>
                    <div class="col-md-4">
                        <strong>Total Amount:</strong> ${this.formatCurrency(
							totalPayments
						)}
                    </div>
                    <div class="col-md-4">
                        <strong>Average Payment:</strong> ${this.formatCurrency(
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
		const recordedDate = new Date(
			payment.issued_timestamp
		).toLocaleDateString();
		const fromDate = new Date(payment.payment_from).toLocaleDateString();
		const toDate = new Date(payment.payment_to).toLocaleDateString();

		return `
            <div class="payment-history-item">
                <div class="payment-header">
                    <div class="payment-amount">${this.formatCurrency(
						payment.payment_amount
					)}</div>
                    <div class="payment-date">Recorded: ${recordedDate}</div>
                </div>
                <div class="payment-period">
                    <i class="bi bi-calendar-range me-2"></i>
                    Payment Period: ${fromDate} - ${toDate}
                </div>
                ${
					payment.added_by_username
						? `
                    <div class="mt-2">
                        <small class="text-muted">
                            <i class="bi bi-person me-1"></i>Added by: ${payment.added_by_username}
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
			card.addEventListener("click", (e) => {
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
				text.textContent = "Processing...";
			} else {
				const originalText = button.getAttribute("data-original-text");
				if (originalText) {
					text.textContent = originalText;
					button.removeAttribute("data-original-text");
				}
			}
		}
	}

	private formatCurrency(amount: number): string {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2
		}).format(amount);
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