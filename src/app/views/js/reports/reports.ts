//@ts-ignore
import Swal from "../../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { createCustomReport } from "../../utils/pdfGenerator.js";

interface ReportFilters {
	start_date: string;
	end_date: string;
	grouping: "year" | "month" | "day";
}

interface InsuranceCompany {
	insurance_id: number;
	name: string;
}

interface Doctor {
	employee_id: number;
	name: string;
	doctor_type: string;
}

interface Employee {
	employee_id: number;
	name: string;
	employee_type: string;
}

class ReportsManager {
	//@ts-ignore
	private loadingModal: Modal;
	private currentReportData: any = null;
	private currentReportType: string = "";

	// Chart instances
	private patientTrendsChart: any = null;
	private distributionChart: any = null;
	private doctorPerformanceChart: any = null;
	private paymentTimelineChart: any = null;
	private paymentTypeChart: any = null;
	private avgStayChart: any = null;
	private revenueChart: any = null;
	private admissionDischargeChart: any = null;
	private topServicesChart: any = null;
	private topDrugsChart: any = null;
	private staffUtilizationChart: any = null;

	// Data caches
	private insuranceCompanies: InsuranceCompany[] = [];
	private doctors: Doctor[] = [];
	private nurses: Employee[] = [];
	private employees: Employee[] = [];

	// Current statistics data
	private currentStatistics: any = null;

	constructor() {
		// Initialize sidebar
		new SidebarManager();

		// Initialize modals
		//@ts-ignore
		this.loadingModal = new bootstrap.Modal(
			document.getElementById("loadingModal")!
		);

		this.initializeEventListeners();
		this.setDefaultDateRange();
		this.loadInitialData();
	}

	private initializeEventListeners(): void {
		// Date range quick buttons
		document.getElementById("todayBtn")?.addEventListener("click", () => {
			this.setTodayRange();
		});

		document
			.getElementById("thisWeekBtn")
			?.addEventListener("click", () => {
				this.setThisWeekRange();
			});

		document
			.getElementById("thisMonthBtn")
			?.addEventListener("click", () => {
				this.setThisMonthRange();
			});

		// Patient reports
		document
			.getElementById("patientPaymentType")
			?.addEventListener("change", (e) => {
				this.toggleInsuranceFilter(
					(e.target as HTMLSelectElement).value
				);
			});

		document
			.getElementById("loadPatientReportBtn")
			?.addEventListener("click", () => {
				this.loadPatientReport();
			});

		document
			.getElementById("printPatientReportBtn")
			?.addEventListener("click", () => {
				this.printPatientReport();
			});

		// Doctor reports
		document
			.getElementById("doctorReportType")
			?.addEventListener("change", (e) => {
				this.toggleDoctorSelect((e.target as HTMLSelectElement).value);
			});

		document
			.getElementById("loadDoctorReportBtn")
			?.addEventListener("click", () => {
				this.loadDoctorReport();
			});

		document
			.getElementById("printDoctorReportBtn")
			?.addEventListener("click", () => {
				this.printDoctorReport();
			});

		// Nurse reports
		document
			.getElementById("nurseReportType")
			?.addEventListener("change", (e) => {
				this.toggleNurseSelect((e.target as HTMLSelectElement).value);
			});

		document
			.getElementById("loadNurseReportBtn")
			?.addEventListener("click", () => {
				this.loadNurseReport();
			});

		document
			.getElementById("printNurseReportBtn")
			?.addEventListener("click", () => {
				this.printNurseReport();
			});

		// Statistics
		document
			.getElementById("loadStatisticsBtn")
			?.addEventListener("click", () => {
				this.loadStatistics();
			});

		document
			.getElementById("paymentDistribution")
			?.addEventListener("change", () => {
				this.switchDistributionChart("payment");
			});

		document
			.getElementById("genderDistribution")
			?.addEventListener("change", () => {
				this.switchDistributionChart("gender");
			});

		// Employee payments
		document
			.getElementById("employeeType")
			?.addEventListener("change", () => {
				this.loadEmployeesByType();
			});

		document
			.getElementById("loadEmployeePaymentReportBtn")
			?.addEventListener("click", () => {
				this.loadEmployeePaymentReport();
			});

		document
			.getElementById("printEmployeePaymentReportBtn")
			?.addEventListener("click", () => {
				this.printEmployeePaymentReport();
			});
	}

	// ==================== DATE RANGE HELPERS ====================

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

	private setThisWeekRange(): void {
		const today = new Date();
		const firstDayOfWeek = new Date(
			today.setDate(today.getDate() - today.getDay())
		);
		const lastDayOfWeek = new Date(
			today.setDate(today.getDate() - today.getDay() + 6)
		);

		(document.getElementById("startDate") as HTMLInputElement).value =
			firstDayOfWeek.toISOString().split("T")[0];
		(document.getElementById("endDate") as HTMLInputElement).value =
			lastDayOfWeek.toISOString().split("T")[0];
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

	private getReportFilters(): ReportFilters {
		return {
			start_date: (
				document.getElementById("startDate") as HTMLInputElement
			).value,
			end_date: (document.getElementById("endDate") as HTMLInputElement)
				.value,
			grouping: (
				document.getElementById("timeGrouping") as HTMLSelectElement
			).value as any
		};
	}

	// ==================== INITIAL DATA LOADING ====================

	private async loadInitialData(): Promise<void> {
		try {
			// Load insurance companies
			await this.loadInsuranceCompanies();
			// Load doctors
			await this.loadDoctors();
			// Load nurses
			await this.loadNurses();
			// Load all employees
			await this.loadAllEmployees();
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError("Failed to load initial data");
		}
	}

	private async loadInsuranceCompanies(): Promise<void> {
		try {
			const response = await fetch("/api/insurance-companies", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok)
				throw new Error("Failed to fetch insurance companies");

			this.insuranceCompanies = (await response.json()).data;
			this.populateInsuranceSelect();
		} catch (error) {
			console.error("Error loading insurance companies:", error);
		}
	}

	private populateInsuranceSelect(): void {
		const select = document.getElementById(
			"insuranceCompany"
		) as HTMLSelectElement;
		if (!select) return;

		select.innerHTML = '<option value="">All Companies</option>';
		this.insuranceCompanies.forEach((ic) => {
			const option = document.createElement("option");
			option.value = ic.insurance_id.toString();
			option.textContent = ic.name;
			select.appendChild(option);
		});
	}

	private async loadDoctors(): Promise<void> {
		try {
			const response = await fetch("/api/doctors", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch doctors");

			const allDoctors = await response.json();
			this.doctors = allDoctors.filter((d: any) => d.is_active);
			this.populateDoctorSelect();
		} catch (error) {
			console.error("Error loading doctors:", error);
		}
	}

	private populateDoctorSelect(): void {
		const select = document.getElementById(
			"doctorSelect"
		) as HTMLSelectElement;
		if (!select) return;

		select.innerHTML = '<option value="">Select a doctor</option>';
		this.doctors.forEach((doctor) => {
			const option = document.createElement("option");
			option.value = doctor.employee_id.toString();
			option.textContent = `${doctor.name} (${doctor.doctor_type})`;
			select.appendChild(option);
		});
	}

	private async loadNurses(): Promise<void> {
		try {
			const response = await fetch("/api/employees?type=nurse", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch nurses");

			this.nurses = await response.json();
			this.populateNurseSelect();
		} catch (error) {
			console.error("Error loading nurses:", error);
		}
	}

	private populateNurseSelect(): void {
		const select = document.getElementById(
			"nurseSelect"
		) as HTMLSelectElement;
		if (!select) return;

		select.innerHTML = '<option value="">Select a nurse</option>';
		this.nurses.forEach((nurse) => {
			const option = document.createElement("option");
			option.value = nurse.employee_id.toString();
			option.textContent = nurse.name;
			select.appendChild(option);
		});
	}

	private async loadAllEmployees(): Promise<void> {
		try {
			const response = await fetch("/api/employees", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch employees");

			this.employees = await response.json();
		} catch (error) {
			console.error("Error loading employees:", error);
		}
	}

	private async loadEmployeesByType(): Promise<void> {
		const employeeType = (
			document.getElementById("employeeType") as HTMLSelectElement
		).value;
		const select = document.getElementById(
			"employeeSelect"
		) as HTMLSelectElement;

		if (!select) return;

		select.innerHTML = '<option value="">All Employees</option>';

		const filtered =
			employeeType === "all"
				? this.employees
				: this.employees.filter(
						(e) => e.employee_type === employeeType
				  );

		filtered.forEach((employee) => {
			const option = document.createElement("option");
			option.value = employee.employee_id.toString();
			option.textContent = `${employee.name} (${employee.employee_type})`;
			select.appendChild(option);
		});
	}

	// ==================== UI TOGGLES ====================

	private toggleInsuranceFilter(paymentType: string): void {
		const container = document.getElementById("insuranceFilterContainer");
		if (container) {
			container.style.display =
				paymentType === "insurance" ? "block" : "none";
		}
	}

	private toggleDoctorSelect(reportType: string): void {
		const container = document.getElementById("doctorSelectContainer");
		if (container) {
			const needsSelect = reportType.includes("specific");
			container.style.display = needsSelect ? "block" : "none";
		}
	}

	private toggleNurseSelect(reportType: string): void {
		const container = document.getElementById("nurseSelectContainer");
		if (container) {
			container.style.display =
				reportType === "specific" ? "block" : "none";
		}
	}

	private enablePrintButton(buttonId: string): void {
		const button = document.getElementById(buttonId);
		if (button) {
			button.removeAttribute("disabled");
		}
	}

	// ==================== PATIENT REPORTS ====================

	private async loadPatientReport(): Promise<void> {
		const filters = this.getReportFilters();

		if (!filters.start_date || !filters.end_date) {
			this.showError("Please select both start and end dates");
			return;
		}

		const paymentType = (
			document.getElementById("patientPaymentType") as HTMLSelectElement
		).value;
		const insuranceId = (
			document.getElementById("insuranceCompany") as HTMLSelectElement
		).value;

		try {
			await this.showLoading();

			let url = `/api/reports/patients?start_date=${filters.start_date}&end_date=${filters.end_date}`;

			if (paymentType !== "all") {
				url += `&payment_type=${paymentType}`;
			}

			if (paymentType === "insurance" && insuranceId) {
				url += `&insurance_id=${insuranceId}`;
			}

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch patient report");

			const data = await response.json();
			this.currentReportData = data;
			this.currentReportType = "patients";

			this.displayPatientReport(data);
			this.enablePrintButton("printPatientReportBtn");

			this.showSuccess("Patient report generated successfully");
			this.hideLoading();
		} catch (error: any) {
			console.error("Error loading patient report:", error);
			this.showError(error.message || "Failed to load patient report");
		} finally {
			this.hideLoading();
		}
	}

	private displayPatientReport(patients: any[]): void {
		const container = document.getElementById("patientReportContent");
		if (!container) return;

		if (patients.length === 0) {
			container.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-inbox" style="font-size: 3rem; color: #6c757d;"></i>
                    <h5 class="mt-3 text-muted">No Patients Found</h5>
                    <p class="text-muted">No patients match the selected criteria</p>
                </div>
            `;
			return;
		}

		// Calculate ages for display
		patients.forEach((patient) => {
			if (!patient.age && patient.national_id) {
				patient.age = this.calculateAgeFromNationalId(
					patient.national_id
				);
			}
		});

		const totalBill = patients.reduce(
			(sum, p) => sum + p.total_bill_amount,
			0
		);
		const totalPaid = patients.reduce(
			(sum, p) => sum + p.total_paid_amount,
			0
		);
		const totalOutstanding = patients.reduce(
			(sum, p) => sum + p.total_outstanding,
			0
		);

		container.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-md-3">
                    <div class="summary-card border-start-primary">
                        <h6>Total Patients</h6>
                        <div class="value">${patients.length}</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="summary-card border-start-info">
                        <h6>Total Bill Amount</h6>
                        <div class="value">${this.formatCurrency(
							totalBill
						)}</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="summary-card border-start-success">
                        <h6>Total Paid</h6>
                        <div class="value text-success">${this.formatCurrency(
							totalPaid
						)}</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="summary-card border-start-warning">
                        <h6>Total Outstanding</h6>
                        <div class="value text-warning">${this.formatCurrency(
							totalOutstanding
						)}</div>
                    </div>
                </div>
            </div>
            <div class="accordion" id="patientReportAccordion">
                ${patients
					.map((patient, index) =>
						this.renderPatientCard(patient, index)
					)
					.join("")}
            </div>
        `;
	}

	private renderPatientCard(patient: any, _index: number): string {
		const hasAdmissions =
			patient.admissions && patient.admissions.length > 0;
		const age =
			patient.age || this.calculateAgeFromNationalId(patient.national_id);
		const birthDate = this.getBirthDateFromNationalId(patient.national_id);

		return `
            <div class="patient-detail-card">
                <div class="patient-header">
                    <div>
                        <div class="patient-name">${this.escapeHtml(
							patient.patient_name
						)}</div>
                        <small class="text-muted">
                            ID: ${patient.patient_id} 
                            ${
								patient.national_id
									? `| National ID: ${patient.national_id}`
									: ""
							} 
                            ${
								age > 0
									? `| Age: ${age} years (Born: ${birthDate})`
									: ""
							}
                        </small>
                    </div>
                    <div class="text-end">
                        <button type="button" class="btn btn-sm btn-outline-primary me-2" onclick="window.reportsManager.printSinglePatient(${
							patient.patient_id
						})">
                            <i class="bi bi-printer"></i> Print Patient Report
                        </button>
                        <span class="payment-type-badge badge-${
							patient.payment_type
						}">${patient.payment_type.toUpperCase()}</span>
                        ${
							patient.gender
								? `<span class="gender-badge badge-${
										patient.gender
								  } ms-2">${patient.gender.toUpperCase()}</span>`
								: ""
						}
                    </div>
                </div>
                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <div class="patient-info-row">
                            <span class="info-label">Phone:</span>
                            <span class="info-value">${
								patient.phone || "N/A"
							}</span>
                        </div>
                        <div class="patient-info-row">
                            <span class="info-label">Address:</span>
                            <span class="info-value">${
								patient.address || "N/A"
							}</span>
                        </div>
                        ${
							patient.insurance_company
								? `
                        <div class="patient-info-row">
                            <span class="info-label">Insurance:</span>
                            <span class="info-value">${this.escapeHtml(
								patient.insurance_company
							)}</span>
                        </div>
                        `
								: ""
						}
                        ${
							patient.referring_doctor_name
								? `
                        <div class="patient-info-row">
                            <span class="info-label">Referring Doctor:</span>
                            <span class="info-value">${this.escapeHtml(
								patient.referring_doctor_name
							)}</span>
                        </div>
                        `
								: ""
						}
                    </div>
                    <div class="col-md-6">
                        <div class="patient-info-row">
                            <span class="info-label">Total Bill:</span>
                            <span class="info-value fw-bold">${this.formatCurrency(
								patient.total_bill_amount
							)}</span>
                        </div>
                        <div class="patient-info-row">
                            <span class="info-label">Total Paid:</span>
                            <span class="info-value text-success fw-bold">${this.formatCurrency(
								patient.total_paid_amount
							)}</span>
                        </div>
                        <div class="patient-info-row">
                            <span class="info-label">Outstanding:</span>
                            <span class="info-value text-warning fw-bold">${this.formatCurrency(
								patient.total_outstanding
							)}</span>
                        </div>
                    </div>
                </div>
                ${
					hasAdmissions
						? `
                <div class="admission-section">
                    <h6><i class="bi bi-hospital me-2"></i>Admission History (${
						patient.admissions.length
					})</h6>
                    ${patient.admissions
						.map((admission: any) =>
							this.renderAdmissionDetail(admission)
						)
						.join("")}
                </div>
                `
						: '<p class="text-muted">No admissions in this period</p>'
				}
            </div>
        `;
	}

	private renderAdmissionDetail(admission: any): string {
		return `
            <div class="admission-item mb-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <strong>Admission ID: ${
							admission.patient_history_id
						}</strong>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-info" onclick="window.reportsManager.printSingleAdmission(${
						admission.patient_history_id
					})">
                        <i class="bi bi-printer"></i> Print Admission
                    </button>
                </div>
                <div class="row g-3 mb-2">
                    <div class="col-md-6">
                        <small class="text-muted">Admission:</small>
                        <div>${this.formatDateTime(
							admission.admission_time
						)}</div>
                    </div>
                    <div class="col-md-6">
                        <small class="text-muted">Discharge:</small>
                        <div>${
							admission.discharge_time
								? this.formatDateTime(admission.discharge_time)
								: '<span class="badge bg-success">Active</span>'
						}</div>
                    </div>
                </div>
                ${
					admission.diagnosis
						? `
                <div class="mb-2">
                    <small class="text-muted">Diagnosis:</small>
                    <div>${this.escapeHtml(admission.diagnosis)}</div>
                </div>
                `
						: ""
				}
                <div class="row g-3 mb-2">
                    <div class="col-md-4">
                        <small class="text-muted">Total:</small>
                        <div class="fw-bold">${this.formatCurrency(
							admission.total_amount
						)}</div>
                    </div>
                    <div class="col-md-4">
                        <small class="text-muted">Paid:</small>
                        <div class="fw-bold text-success">${this.formatCurrency(
							admission.paid_amount
						)}</div>
                    </div>
                    <div class="col-md-4">
                        <small class="text-muted">Discount:</small>
                        <div class="fw-bold text-info">${this.formatCurrency(
							admission.discount
						)}</div>
                    </div>
                </div>
                ${
					admission.daily_staff && admission.daily_staff.length > 0
						? `
                <div class="mb-2">
                    <small class="text-muted">Daily Staff Assignments:</small>
                    ${admission.daily_staff
						.map(
							(day: any) => `
                        <div class="staff-day-item mt-2 p-2 bg-light rounded">
                            <strong>${this.formatDate(day.work_date)}</strong>
                            ${
								day.doctors.length > 0
									? `
                            <div class="mt-1">
                                <small class="text-muted">Doctors:</small>
                                <div class="staff-grid mt-1">
                                    ${day.doctors
										.map(
											(doc: any) => `
                                        <div class="staff-item">
                                            <div class="staff-name">${this.escapeHtml(
												doc.employee_name
											)}</div>
                                            <div class="staff-hours">${
												doc.hours_worked
											}h</div>
                                        </div>
                                    `
										)
										.join("")}
                                </div>
                            </div>
                            `
									: ""
							}
                            ${
								day.nurses.length > 0
									? `
                            <div class="mt-1">
                                <small class="text-muted">Nurses:</small>
                                <div class="staff-grid mt-1">
                                    ${day.nurses
										.map(
											(nurse: any) => `
                                        <div class="staff-item">
                                            <div class="staff-name">${this.escapeHtml(
												nurse.employee_name
											)}</div>
                                            <div class="staff-hours">${
												nurse.hours_worked
											}h</div>
                                        </div>
                                    `
										)
										.join("")}
                                </div>
                            </div>
                            `
									: ""
							}
                        </div>
                    `
						)
						.join("")}
                </div>
                `
						: ""
				}
                ${
					admission.services && admission.services.length > 0
						? `
                <div class="mb-2">
                    <small class="text-muted">Services (${
						admission.services.length
					}):</small>
                    <ul class="item-list mt-1">
                        ${admission.services
							.map(
								(svc: any) => `
                            <li class="item-list-item">
                                <span class="item-name">${this.escapeHtml(
									svc.service_name
								)}</span>
                                <span class="item-quantity">x${
									svc.quantity
								}</span>
                                <span class="item-price">${this.formatCurrency(
									svc.total_price
								)}</span>
                            </li>
                        `
							)
							.join("")}
                    </ul>
                </div>
                `
						: ""
				}
                ${
					admission.drugs && admission.drugs.length > 0
						? `
                <div class="mb-2">
                    <small class="text-muted">Drugs (${
						admission.drugs.length
					}):</small>
                    <ul class="item-list mt-1">
                        ${admission.drugs
							.map(
								(drug: any) => `
                            <li class="item-list-item">
                                <span class="item-name">${this.escapeHtml(
									drug.drug_name
								)} ${
									drug.manufacturer
										? `(${this.escapeHtml(
												drug.manufacturer
										  )})`
										: ""
								}</span>
                                <span class="item-quantity">x${
									drug.quantity
								}</span>
                                <span class="item-price">${this.formatCurrency(
									drug.total_price
								)}</span>
                            </li>
                        `
							)
							.join("")}
                    </ul>
                </div>
                `
						: ""
				}
            </div>
        `;
	}

	/**
	 * Calculate age from Egyptian National ID
	 */
	private calculateAgeFromNationalId(nationalId: string | null): number {
		if (!nationalId || nationalId.length < 7) {
			return 0;
		}

		try {
			const centuryDigit = parseInt(nationalId.charAt(0));
			const yearDigits = parseInt(nationalId.substring(1, 3));
			const monthDigits = parseInt(nationalId.substring(3, 5));
			const dayDigits = parseInt(nationalId.substring(5, 7));

			// Determine century
			let century: number;
			if (centuryDigit === 2) {
				century = 1900;
			} else if (centuryDigit === 3) {
				century = 2000;
			} else {
				return 0; // Invalid century digit
			}

			const birthYear = century + yearDigits;
			const birthDate = new Date(birthYear, monthDigits - 1, dayDigits);

			// Calculate age
			const today = new Date();
			let age = today.getFullYear() - birthDate.getFullYear();
			const monthDiff = today.getMonth() - birthDate.getMonth();

			if (
				monthDiff < 0 ||
				(monthDiff === 0 && today.getDate() < birthDate.getDate())
			) {
				age--;
			}

			return age;
		} catch (error) {
			console.error("Error calculating age from national ID:", error);
			return 0;
		}
	}

	/**
	 * Get formatted birthdate from Egyptian National ID for display
	 */
	private getBirthDateFromNationalId(nationalId: string | null): string {
		if (!nationalId || nationalId.length < 7) {
			return "N/A";
		}

		try {
			const centuryDigit = parseInt(nationalId.charAt(0));
			const yearDigits = nationalId.substring(1, 3);
			const monthDigits = nationalId.substring(3, 5);
			const dayDigits = nationalId.substring(5, 7);

			let century: string;
			if (centuryDigit === 2) {
				century = "19";
			} else if (centuryDigit === 3) {
				century = "20";
			} else {
				return "N/A";
			}

			return `${dayDigits}/${monthDigits}/${century}${yearDigits}`;
		} catch (error) {
			return "N/A";
		}
	}

	/**
	 * Generate grouped patient report PDF
	 */
	private async generateGroupedPatientReportPDF(): Promise<void> {
		if (!this.currentReportData || this.currentReportData.length === 0) {
			this.showError("No report data to print");
			return;
		}

		try {
			const filters = this.getReportFilters();

			// Create summary table body
			const summaryTableBody = [];

			// Header row
			summaryTableBody.push([
				{ text: "Patient Name", bold: true, fillColor: "#f0f0f0" },
				{ text: "Gender", bold: true, fillColor: "#f0f0f0" },
				{ text: "Age", bold: true, fillColor: "#f0f0f0" },
				{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" },
				{
					text: "Total Billed",
					bold: true,
					fillColor: "#f0f0f0",
					alignment: "right"
				},
				{
					text: "Total Paid",
					bold: true,
					fillColor: "#f0f0f0",
					alignment: "right"
				},
				{ text: "Referring Doctor", bold: true, fillColor: "#f0f0f0" }
			]);

			// Data rows
			this.currentReportData.forEach((patient: any) => {
				summaryTableBody.push([
					patient.patient_name,
					this.capitalizeFirst(patient.gender || "N/A"),
					patient.age.toString(),
					this.capitalizeFirst(patient.payment_type),
					{
						text: this.formatCurrency(patient.total_billed),
						alignment: "right"
					},
					{
						text: this.formatCurrency(patient.total_paid),
						alignment: "right"
					},
					patient.referring_doctor_name || "N/A"
				]);
			});

			const docDefinition = {
				content: [
					{
						text: "Patient Report",
						style: "header",
						alignment: "center"
					},
					{
						text: `Report Period: ${this.formatDate(
							filters.start_date
						)} - ${this.formatDate(filters.end_date)}`,
						style: "subheader",
						alignment: "center"
					},
					{
						text: `Total Patients: ${this.currentReportData.length}`,
						style: "subheader",
						alignment: "center",
						margin: [0, 0, 0, 15]
					},
					// Summary table
					{
						table: {
							headerRows: 1,
							widths: [
								"*",
								"auto",
								"auto",
								"auto",
								"auto",
								"auto",
								"*"
							],
							body: summaryTableBody
						},
						layout: {
							fillColor: function (rowIndex: number) {
								return rowIndex === 0
									? "#f0f0f0"
									: rowIndex % 2 === 0
									? "#f9f9f9"
									: null;
							}
						},
						margin: [0, 0, 0, 20]
					},
					// Patient details
					...this.generatePatientDetailsPages()
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
						margin: [0, 5, 0, 5]
					},
					patientHeader: {
						fontSize: 14,
						bold: true,
						color: "#0d6efd",
						margin: [0, 0, 0, 10]
					},
					sectionHeader: {
						fontSize: 12,
						bold: true,
						margin: [0, 10, 0, 5]
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
				},
				pageSize: "A4"
			};

			//@ts-ignore
			const pdf = pdfMake.createPdf(docDefinition);
			pdf.open();
			this.showSuccess("Report generated successfully");
		} catch (error) {
			console.error("Error generating grouped patient report:", error);
			this.showError("Failed to generate report");
		}
	}

	/**
	 * Generate individual patient pages
	 */
	private generatePatientDetailsPages(): any[] {
		const content: any[] = [];

		this.currentReportData.forEach((patient: any, index: number) => {
			// Page break before each patient except the first
			if (index > 0) {
				content.push({ text: "", pageBreak: "before" });
			}

			// Patient header information
			content.push({
				text: patient.patient_name,
				style: "patientHeader"
			});

			const patientInfoHeaders: any[] = [
				{ text: "National ID", bold: true, fillColor: "#f0f0f0" },
				{ text: "Gender", bold: true, fillColor: "#f0f0f0" },
				{ text: "Age", bold: true, fillColor: "#f0f0f0" },
				{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" }
			];

			const patientInfoRow: any[] = [
				{ text: patient.national_id || "N/A", alignment: "left" },
				{
					text: this.capitalizeFirst(patient.gender),
					alignment: "left"
				},
				{ text: `${patient.age} years`, alignment: "left" },
				{
					text: this.capitalizeFirst(patient.payment_type),
					alignment: "left"
				}
			];

			if (
				patient.payment_type === "insurance" &&
				patient.insurance_company
			) {
				patientInfoHeaders.push({
					text: "Insurance Company",
					bold: true,
					fillColor: "#f0f0f0"
				});
				patientInfoRow.push({
					text: patient.insurance_company,
					alignment: "left"
				});
				if (patient.insurance_card_id) {
					patientInfoHeaders.push({
						text: "Insurance Card ID",
						bold: true,
						fillColor: "#f0f0f0"
					});
					patientInfoRow.push({
						text: patient.insurance_card_id,
						alignment: "left"
					});
				}
				if (patient.insurance_form_id) {
					patientInfoHeaders.push({
						text: "Form ID",
						bold: true,
						fillColor: "#f0f0f0"
					});
					patientInfoRow.push({
						text: patient.insurance_form_id,
						alignment: "left"
					});
				}
			}

			patientInfoHeaders.push(
				{ text: "Total Billed", bold: true, fillColor: "#f0f0f0" },
				{ text: "Total Paid", bold: true, fillColor: "#f0f0f0" }
			);
			patientInfoRow.push(
				{
					text: this.formatCurrency(patient.total_billed),
					alignment: "left",
					bold: true
				},
				{
					text: this.formatCurrency(patient.total_paid),
					alignment: "left",
					bold: true,
					color: "#28a745"
				}
			);

			content.push({
				table: {
					headerRows: 1,
					widths: patientInfoHeaders.map((_, ind) =>
						ind === 0 ? "auto" : "*"
					),
					body: [patientInfoHeaders, patientInfoRow],
					dontBreakRows: false
				},
				layout: {
					hLineWidth: () => 1,
					vLineWidth: () => 1,
					paddingLeft: () => 5,
					paddingRight: () => 5,
					paddingTop: () => 2,
					paddingBottom: () => 2
				},
				margin: [0, 5, 0, 15],
				fontSize: patientInfoHeaders.length > 6 ? 8 : 10
			});

			// Process each admission
			if (patient.admissions && patient.admissions.length > 0) {
				patient.admissions.forEach(
					(admission: any, admIndex: number) => {
						if (admIndex > 0) {
							content.push({ text: "", margin: [0, 15, 0, 0] });
						}

						// Admission header
						content.push({
							text: `Admission ${admIndex + 1}`,
							style: "sectionHeader"
						});

						content.push({
							columns: [
								{
									text: `Admission: ${this.formatDateTime(
										admission.admission_time
									)}`,
									width: "*"
								},
								{
									text: `Discharge: ${
										admission.discharge_time
											? this.formatDateTime(
													admission.discharge_time
											  )
											: "Active"
									}`,
									width: "*"
								}
							],
							margin: [0, 5, 0, 5]
						});

						if (admission.diagnosis) {
							content.push({
								text: `Diagnosis: ${admission.diagnosis}`,
								margin: [0, 0, 0, 10]
							});
						}

						// Table 1: Services and Drugs by Date
						const itemsTableBody = [];

						// Header
						itemsTableBody.push([
							{
								text: "Item Name",
								bold: true,
								fillColor: "#f0f0f0"
							},
							{ text: "Type", bold: true, fillColor: "#f0f0f0" },
							{
								text: "Service Date",
								bold: true,
								fillColor: "#f0f0f0"
							},
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

						// Add items grouped by date
						if (
							admission.items_by_date &&
							admission.items_by_date.length > 0
						) {
							admission.items_by_date.forEach(
								(dateGroup: any) => {
									dateGroup.items.forEach((item: any) => {
										itemsTableBody.push([
											item.item_name,
											this.capitalizeFirst(
												item.item_type
											),
											this.formatDate(
												dateGroup.service_date
											),
											{
												text: item.quantity.toString(),
												alignment: "center"
											},
											{
												text: this.formatCurrency(
													item.unit_price
												),
												alignment: "right"
											},
											{
												text: this.formatCurrency(
													item.total_price
												),
												alignment: "right"
											}
										]);
									});
								}
							);
						}

						const outstandingAmount =
							admission.total_amount - admission.paid_amount;

						// Add summary rows
						itemsTableBody.push([
							{
								text: "Total Charges:",
								colSpan: 5,
								bold: true,
								fillColor: "#f8f9fa"
							},
							{},
							{},
							{},
							{},
							{
								text: this.formatCurrency(
									admission.total_amount
								),
								bold: true,
								alignment: "right",
								fillColor: "#f8f9fa"
							}
						]);

						itemsTableBody.push([
							{
								text: "Patient Paid:",
								colSpan: 5,
								bold: true,
								fillColor: "#f8f9fa"
							},
							{},
							{},
							{},
							{},
							{
								text: this.formatCurrency(
									admission.paid_amount
								),
								bold: true,
								alignment: "right",
								fillColor: "#f8f9fa",
								color: "#28a745"
							}
						]);

						itemsTableBody.push([
							{
								text: "Outstanding Amount:",
								colSpan: 5,
								bold: true,
								fillColor:
									outstandingAmount > 0
										? "#fff3cd"
										: "#d1edff"
							},
							{},
							{},
							{},
							{},
							{
								text: this.formatCurrency(outstandingAmount),
								bold: true,
								alignment: "right",
								fillColor:
									outstandingAmount > 0
										? "#fff3cd"
										: "#d1edff",
								color:
									outstandingAmount > 0
										? "#856404"
										: "#0c5460"
							}
						]);

						content.push({
							table: {
								headerRows: 1,
								widths: [
									"*",
									"auto",
									"auto",
									"auto",
									"auto",
									"auto"
								],
								body: itemsTableBody
							},
							layout: {
								fillColor: function (
									rowIndex: number,
									node: any
								) {
									if (rowIndex === 0) return "#f0f0f0";

									// Find where summary rows start
									const summaryIndex =
										node.table.body.findIndex(
											(row: any) => row[0].colSpan === 5
										);

									if (rowIndex >= summaryIndex) return null;

									return rowIndex % 2 === 0
										? "#f9f9f9"
										: null;
								},
								hLineWidth: function (i: number, node: any) {
									const summaryIndex =
										node.table.body.findIndex(
											(row: any) => row[0].colSpan === 5
										);

									if (i === summaryIndex) return 2;
									return 1;
								}
							},
							margin: [0, 0, 0, 15]
						});

						// Table 2: Daily Staff Assignments
						if (
							admission.daily_staff &&
							admission.daily_staff.length > 0
						) {
							const staffTableBody = [];

							// Header
							staffTableBody.push([
								{
									text: "Date",
									bold: true,
									fillColor: "#f0f0f0"
								},
								{
									text: "Assigned Doctors",
									bold: true,
									fillColor: "#f0f0f0"
								},
								{
									text: "Assigned Nurses",
									bold: true,
									fillColor: "#f0f0f0"
								}
							]);

							// Data rows
							admission.daily_staff.forEach((day: any) => {
								staffTableBody.push([
									this.formatDate(day.work_date),
									day.doctors.length > 0
										? day.doctors.join("\n")
										: "N/A",
									day.nurses.length > 0
										? day.nurses.join("\n")
										: "N/A"
								]);
							});

							content.push({
								text: "Daily Staff Assignments",
								style: "sectionHeader",
								margin: [0, 10, 0, 5]
							});

							content.push({
								table: {
									headerRows: 1,
									widths: ["auto", "*", "*"],
									body: staffTableBody
								},
								layout: {
									fillColor: function (rowIndex: number) {
										return rowIndex === 0
											? "#f0f0f0"
											: rowIndex % 2 === 0
											? "#f9f9f9"
											: null;
									}
								},
								margin: [0, 0, 0, 15]
							});
						}
					}
				);
			} else {
				content.push({
					text: "No admissions found during this period.",
					bold: true,
					color: "#6c757d",
					margin: [0, 10, 0, 10]
				});
			}
		});

		return content;
	}

	/**
	 * Generate single patient report PDF
	 */
	private async generateSinglePatientReportPDF(
		patientId: number
	): Promise<void> {
		try {
			await this.showLoading();

			const filters = this.getReportFilters();
			const paymentType = (
				document.getElementById(
					"patientPaymentType"
				) as HTMLSelectElement
			).value;
			const insuranceId = (
				document.getElementById("insuranceCompany") as HTMLSelectElement
			).value;

			let url = `/api/reports/patients/formatted?start_date=${filters.start_date}&end_date=${filters.end_date}&patient_id=${patientId}`;

			if (paymentType !== "all") {
				url += `&payment_type=${paymentType}`;
			}

			if (paymentType === "insurance" && insuranceId) {
				url += `&insurance_id=${insuranceId}`;
			}

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch patient data");

			const patientData = await response.json();

			if (!patientData || patientData.length === 0) {
				this.showError("No data found for this patient");
				return;
			}

			// Use the same PDF generation but with single patient
			const tempReportData = this.currentReportData;
			this.currentReportData = patientData;

			await this.generateGroupedPatientReportPDF();

			this.currentReportData = tempReportData;
		} catch (error: any) {
			console.error("Error generating single patient report:", error);
			this.showError(
				error.message || "Failed to generate patient report"
			);
		} finally {
			this.hideLoading();
		}
	}

	/**
	 * Generate single admission report PDF
	 */
	private async generateSingleAdmissionReportPDF(
		patientHistoryId: number
	): Promise<void> {
		try {
			await this.showLoading();

			const response = await fetch(
				`/api/reports/admissions/${patientHistoryId}/formatted`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) throw new Error("Failed to fetch admission data");

			const data = await response.json();

			const patientInfoHeaders: any[] = [
				{ text: "National ID", bold: true, fillColor: "#f0f0f0" },
				{ text: "Age", bold: true, fillColor: "#f0f0f0" },
				{ text: "Gender", bold: true, fillColor: "#f0f0f0" },
				{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" }
			];

			const patientInfoRow: any[] = [
				{ text: data.national_id || "N/A", alignment: "left" },
				{ text: data.gender || "N/A", alignment: "left" },
				{
					text: `${
						data.age
					} years (Born: ${this.getBirthDateFromNationalId(
						data.national_id
					)})`,
					alignment: "left"
				},
				{
					text: this.capitalizeFirst(data.gender || "N/A"),
					alignment: "left"
				},
				{
					text: this.capitalizeFirst(data.payment_type),
					alignment: "left"
				}
			];

			if (data.payment_type === "insurance" && data.insurance_company) {
				patientInfoHeaders.push({
					text: "Insurance Company",
					bold: true,
					fillColor: "#f0f0f0"
				});
				patientInfoRow.push({
					text: data.insurance_company,
					alignment: "left"
				});
				if (data.insurance_card_id) {
					patientInfoHeaders.push({
						text: "Insurance Card ID",
						bold: true,
						fillColor: "#f0f0f0"
					});
					patientInfoRow.push({
						text: data.insurance_card_id,
						alignment: "left"
					});
				}
				if (data.insurance_form_id) {
					patientInfoHeaders.push({
						text: "Form ID",
						bold: true,
						fillColor: "#f0f0f0"
					});
					patientInfoRow.push({
						text: data.insurance_form_id,
						alignment: "left"
					});
				}
			}

			patientInfoHeaders.push(
				{ text: "Total Billed", bold: true, fillColor: "#f0f0f0" },
				{ text: "Total Paid", bold: true, fillColor: "#f0f0f0" }
			);
			patientInfoRow.push(
				{
					text: this.formatCurrency(data.admission.total_amount),
					alignment: "left",
					bold: true
				},
				{
					text: this.formatCurrency(data.admission.paid_amount),
					alignment: "left",
					bold: true,
					color: "#28a745"
				}
			);

			// Generate PDF with single admission
			const docDefinition = {
				content: [
					{
						text: "Patient Admission Report",
						style: "header",
						alignment: "center"
					},
					{
						text: data.patient_name,
						style: "patientHeader",
						margin: [0, 15, 0, 5]
					},
					// Patient information
					{
						table: {
							headerRows: 1,
							widths: patientInfoHeaders.map((_, ind) =>
								ind === 0 ? "auto" : "*"
							),
							body: [patientInfoHeaders, patientInfoRow],
							dontBreakRows: false
						},
						layout: {
							hLineWidth: () => 0,
							vLineWidth: () => 0,
							paddingLeft: () => 5,
							paddingRight: () => 5,
							paddingTop: () => 2,
							paddingBottom: () => 2
						},
						margin: [0, 5, 0, 15],
						fontSize: patientInfoHeaders.length > 6 ? 8 : 10
					},
					// Admission details
					{
						text: "Admission Details",
						style: "sectionHeader"
					},
					{
						columns: [
							{
								text: `Admission: ${this.formatDateTime(
									data.admission.admission_time
								)}`,
								width: "*"
							},
							{
								text: `Discharge: ${
									data.admission.discharge_time
										? this.formatDateTime(
												data.admission.discharge_time
										  )
										: "Currently Admitted"
								}`,
								width: "*"
							}
						],
						margin: [0, 5, 0, 5]
					},
					...(data.admission.diagnosis
						? [
								{
									text: `Diagnosis: ${data.admission.diagnosis}`,
									margin: [0, 0, 0, 15]
								}
						  ]
						: []),
					// Services and Drugs Table
					...this.generateAdmissionItemsTable(data.admission),
					// Daily Staff Table
					...this.generateDailyStaffTable(data.admission.daily_staff)
				],
				styles: {
					header: {
						fontSize: 18,
						bold: true,
						margin: [0, 0, 0, 10]
					},
					patientHeader: {
						fontSize: 14,
						bold: true,
						color: "#0d6efd"
					},
					sectionHeader: {
						fontSize: 12,
						bold: true,
						margin: [0, 10, 0, 5]
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
				},
				pageSize: "A4"
			};

			//@ts-ignore
			const pdf = pdfMake.createPdf(docDefinition);
			pdf.open();
			this.showSuccess("Admission report generated successfully");
		} catch (error: any) {
			console.error("Error generating admission report:", error);
			this.showError(
				error.message || "Failed to generate admission report"
			);
		} finally {
			this.hideLoading();
		}
	}

	/**
	 * Generate admission items table for PDF
	 */
	private generateAdmissionItemsTable(admission: any): any[] {
		const itemsTableBody = [];

		// Header
		itemsTableBody.push([
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

		// Add items grouped by date
		if (admission.items_by_date && admission.items_by_date.length > 0) {
			admission.items_by_date.forEach((dateGroup: any) => {
				dateGroup.items.forEach((item: any) => {
					itemsTableBody.push([
						item.item_name,
						this.capitalizeFirst(item.item_type),
						this.formatDate(dateGroup.service_date),
						{ text: item.quantity.toString(), alignment: "center" },
						{
							text: this.formatCurrency(item.unit_price),
							alignment: "right"
						},
						{
							text: this.formatCurrency(item.total_price),
							alignment: "right"
						}
					]);
				});
			});
		} else {
			itemsTableBody.push([
				{
					text: "No items recorded",
					colSpan: 6,
					alignment: "center",
					bold: true,
					color: "#6c757d"
				},
				{},
				{},
				{},
				{},
				{}
			]);
		}

		const outstandingAmount =
			admission.total_amount - admission.paid_amount;

		// Add summary rows
		itemsTableBody.push([
			{
				text: "Total Charges:",
				colSpan: 5,
				bold: true,
				fillColor: "#f8f9fa"
			},
			{},
			{},
			{},
			{},
			{
				text: this.formatCurrency(admission.total_amount),
				bold: true,
				alignment: "right",
				fillColor: "#f8f9fa"
			}
		]);

		itemsTableBody.push([
			{
				text: "Patient Paid:",
				colSpan: 5,
				bold: true,
				fillColor: "#f8f9fa"
			},
			{},
			{},
			{},
			{},
			{
				text: this.formatCurrency(admission.paid_amount),
				bold: true,
				alignment: "right",
				fillColor: "#f8f9fa",
				color: "#28a745"
			}
		]);

		itemsTableBody.push([
			{
				text: "Outstanding Amount:",
				colSpan: 5,
				bold: true,
				fillColor: outstandingAmount > 0 ? "#fff3cd" : "#d1edff"
			},
			{},
			{},
			{},
			{},
			{
				text: this.formatCurrency(outstandingAmount),
				bold: true,
				alignment: "right",
				fillColor: outstandingAmount > 0 ? "#fff3cd" : "#d1edff",
				color: outstandingAmount > 0 ? "#856404" : "#0c5460"
			}
		]);

		return [
			{
				table: {
					headerRows: 1,
					widths: ["*", "auto", "auto", "auto", "auto", "auto"],
					body: itemsTableBody
				},
				layout: {
					fillColor: function (rowIndex: number, node: any) {
						if (rowIndex === 0) return "#f0f0f0";

						const summaryIndex = node.table.body.findIndex(
							(row: any) => row[0].colSpan === 5
						);

						if (rowIndex >= summaryIndex) return null;

						return rowIndex % 2 === 0 ? "#f9f9f9" : null;
					},
					hLineWidth: function (i: number, node: any) {
						const summaryIndex = node.table.body.findIndex(
							(row: any) => row[0].colSpan === 5
						);

						if (i === summaryIndex) return 2;
						return 1;
					}
				},
				margin: [0, 0, 0, 15]
			}
		];
	}

	/**
	 * Generate daily staff table for PDF
	 */
	private generateDailyStaffTable(dailyStaff: any[]): any[] {
		if (!dailyStaff || dailyStaff.length === 0) {
			return [
				{
					text: "No staff assignment data available",
					bold: true,
					color: "#6c757d",
					margin: [0, 10, 0, 10]
				}
			];
		}

		const staffTableBody = [];

		// Header
		staffTableBody.push([
			{ text: "Date", bold: true, fillColor: "#f0f0f0" },
			{ text: "Assigned Doctors", bold: true, fillColor: "#f0f0f0" },
			{ text: "Assigned Nurses", bold: true, fillColor: "#f0f0f0" }
		]);

		// Data rows
		dailyStaff.forEach((day: any) => {
			staffTableBody.push([
				this.formatDate(day.work_date),
				day.doctors.length > 0 ? day.doctors.join("\n") : "N/A",
				day.nurses.length > 0 ? day.nurses.join("\n") : "N/A"
			]);
		});

		return [
			{
				text: "Daily Staff Assignments",
				style: "sectionHeader",
				margin: [0, 10, 0, 5]
			},
			{
				table: {
					headerRows: 1,
					widths: ["auto", "*", "*"],
					body: staffTableBody
				},
				layout: {
					fillColor: function (rowIndex: number) {
						return rowIndex === 0
							? "#f0f0f0"
							: rowIndex % 2 === 0
							? "#f9f9f9"
							: null;
					}
				},
				margin: [0, 0, 0, 15]
			}
		];
	}

	/**
	 * Update the print patient report method to use formatted endpoint
	 */
	private async printPatientReport(): Promise<void> {
		if (!this.currentReportData || this.currentReportData.length === 0) {
			this.showError("No report data to print");
			return;
		}

		try {
			await this.showLoading();

			const filters = this.getReportFilters();
			const paymentType = (
				document.getElementById(
					"patientPaymentType"
				) as HTMLSelectElement
			).value;
			const insuranceId = (
				document.getElementById("insuranceCompany") as HTMLSelectElement
			).value;

			let url = `/api/reports/patients/formatted?start_date=${filters.start_date}&end_date=${filters.end_date}`;

			if (paymentType !== "all") {
				url += `&payment_type=${paymentType}`;
			}

			if (paymentType === "insurance" && insuranceId) {
				url += `&insurance_id=${insuranceId}`;
			}

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok)
				throw new Error("Failed to fetch formatted patient data");

			const formattedData = await response.json();

			// Store temporarily for PDF generation
			const tempReportData = this.currentReportData;
			this.currentReportData = formattedData;

			await this.generateGroupedPatientReportPDF();

			// Restore original data
			this.currentReportData = tempReportData;
		} catch (error: any) {
			console.error("Error printing patient report:", error);
			this.showError(error.message || "Failed to print patient report");
		} finally {
			this.hideLoading();
		}
	}

	public async printSinglePatient(patientId: number): Promise<void> {
		await this.generateSinglePatientReportPDF(patientId);
	}

	/**
	 * Public method to print single admission (exposed for onclick)
	 */
	public async printSingleAdmission(patientHistoryId: number): Promise<void> {
		await this.generateSingleAdmissionReportPDF(patientHistoryId);
	}

	// ==================== DOCTOR REPORTS ====================

	private async loadDoctorReport(): Promise<void> {
		const filters = this.getReportFilters();

		if (!filters.start_date || !filters.end_date) {
			this.showError("Please select both start and end dates");
			return;
		}

		const reportType = (
			document.getElementById("doctorReportType") as HTMLSelectElement
		).value;
		const doctorId = (
			document.getElementById("doctorSelect") as HTMLSelectElement
		).value;

		if (reportType.includes("specific") && !doctorId) {
			this.showError("Please select a doctor");
			return;
		}

		try {
			await this.showLoading();

			let url = "";

			switch (reportType) {
				case "all-referred":
					url = `/api/reports/doctors/referred?start_date=${filters.start_date}&end_date=${filters.end_date}`;
					break;
				case "specific-referred":
					url = `/api/reports/doctors/${doctorId}/referred?start_date=${filters.start_date}&end_date=${filters.end_date}`;
					break;
				case "all-attending":
					url = `/api/reports/doctors/attended?start_date=${filters.start_date}&end_date=${filters.end_date}`;
					break;
				case "specific-attending":
					url = `/api/reports/doctors/${doctorId}/attended?start_date=${filters.start_date}&end_date=${filters.end_date}`;
					break;
				case "specific-supervising":
					url = `/api/reports/doctors/${doctorId}/supervised?start_date=${filters.start_date}&end_date=${filters.end_date}`;
					break;
			}

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch doctor report");

			const data = await response.json();
			this.currentReportData = data;
			this.currentReportType = "doctors";

			this.displayDoctorReport(data, reportType);
			this.enablePrintButton("printDoctorReportBtn");

			this.showSuccess("Doctor report generated successfully");
		} catch (error: any) {
			console.error("Error loading doctor report:", error);
			this.showError(error.message || "Failed to load doctor report");
		} finally {
			this.hideLoading();
		}
	}

	private displayDoctorReport(data: any, _reportType: string): void {
		const container = document.getElementById("doctorReportContent");
		if (!container) return;

		const isMultipleDoctors = Array.isArray(data);
		const doctors = isMultipleDoctors ? data : [data];

		if (doctors.length === 0) {
			container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-inbox" style="font-size: 3rem; color: #6c757d;"></i>
                <h5 class="mt-3 text-muted">No Data Found</h5>
                <p class="text-muted">No doctors match the selected criteria</p>
            </div>
        `;
			return;
		}

		const totalPatients = doctors.reduce(
			(sum: number, d: any) => sum + d.total_patients,
			0
		);

		container.innerHTML = `
        <div class="row g-3 mb-4">
            <div class="col-md-6">
                <div class="summary-card border-start-primary">
                    <h6>Total Doctors</h6>
                    <div class="value">${doctors.length}</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="summary-card border-start-info">
                    <h6>Total Patients</h6>
                    <div class="value">${totalPatients}</div>
                </div>
            </div>
        </div>
        ${doctors.map((doctor: any) => this.renderDoctorCard(doctor)).join("")}
    `;

		// Add pie chart for multiple doctors
		if (isMultipleDoctors && doctors.length > 1) {
			setTimeout(() => this.renderDoctorReportPieChart(doctors), 100);
		}
	}

	private renderDoctorCard(doctor: any): string {
		return `
        <div class="card mb-3">
            <div class="card-header">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h5 class="mb-0">${this.escapeHtml(
							doctor.doctor_name
						)}</h5>
                        <small class="text-muted">${doctor.doctor_type.toUpperCase()}</small>
                    </div>
                    <div class="text-end">
                        <h4 class="mb-0">${doctor.total_patients} Patients</h4>
                    </div>
                </div>
            </div>
            <div class="card-body">
                ${
					doctor.patients && doctor.patients.length > 0
						? `
                    <div class="table-responsive">
                        <table class="table table-hover report-table">
                            <thead>
                                <tr>
                                    <th>Patient Name</th>
                                    <th>National ID</th>
                                    <th>Gender</th>
                                    <th>Age</th>
                                    <th>Payment Type</th>
                                    <th># Admissions</th>
                                    <th>Total Billed</th>
                                    <th>Total Paid</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${doctor.patients
									.map(
										(patient: any) => `
                                    <tr>
                                        <td>${this.escapeHtml(
											patient.patient_name
										)}</td>
                                        <td>${
											patient.national_id || "N/A"
										}</td>                                       <td><span class="gender-badge badge-${
											patient.gender || "other"
										}">${this.capitalizeFirst(
											patient.gender || "N/A"
										)}</span></td>
                                        <td>${patient.age || "N/A"}</td>
                                        <td><span class="payment-type-badge badge-${
											patient.payment_type
										}">${patient.payment_type.toUpperCase()}</span></td>
                                        <td class="text-center">${
											patient.admission_count
										}</td>
                                        <td>${this.formatCurrency(
											patient.total_billed
										)}</td>
                                        <td class="text-success fw-bold">${this.formatCurrency(
											patient.total_paid
										)}</td>
                                    </tr>
                                `
									)
									.join("")}
                            </tbody>
                            <tfoot>
                                <tr class="totals-row">
                                    <td colspan="5" class="text-end"><strong>TOTALS:</strong></td>
                                    <td class="text-center"><strong>${doctor.patients.reduce(
										(sum: number, p: any) =>
											sum + p.admission_count,
										0
									)}</strong></td>
                                    <td><strong>${this.formatCurrency(
										doctor.patients.reduce(
											(sum: number, p: any) =>
												sum + p.total_billed,
											0
										)
									)}</strong></td>
                                    <td><strong class="text-success">${this.formatCurrency(
										doctor.patients.reduce(
											(sum: number, p: any) =>
												sum + p.total_paid,
											0
										)
									)}</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                `
						: '<p class="text-muted">No patients found for this doctor</p>'
				}
            </div>
        </div>
    `;
	}

	/**
	 * Generate doctor report PDF based on report type
	 */
	private async printDoctorReport(): Promise<void> {
		if (!this.currentReportData) {
			this.showError("No report data to print");
			return;
		}

		const reportType = (
			document.getElementById("doctorReportType") as HTMLSelectElement
		).value;
		const isMultipleDoctors = Array.isArray(this.currentReportData);

		try {
			if (isMultipleDoctors) {
				// Reports #1, #2, #3: Multiple doctors with pie chart
				await this.generateMultipleDoctorsReportPDF(
					this.currentReportData,
					reportType
				);
			} else {
				// Reports #4, #5: Single doctor with admission details
				await this.generateSingleDoctorReportPDF(
					this.currentReportData,
					reportType
				);
			}
		} catch (error) {
			console.error("Error printing doctor report:", error);
			this.showError("Failed to generate report");
		}
	}

	private async generateMultipleDoctorsReportPDF(
		doctors: any[],
		reportType: string
	): Promise<void> {
		const filters = this.getReportFilters();

		// Determine report title based on type
		let reportTitle = "";
		let relationshipType = "";

		if (reportType === "all-referred") {
			reportTitle = "Referring Doctors Report";
			relationshipType = "referred";
		} else if (reportType === "all-attending") {
			reportTitle = "Attending Doctors Report";
			relationshipType = "attended";
		} else {
			reportTitle = "Supervising Doctors Report";
			relationshipType = "supervised";
		}

		// Calculate totals
		const totalPatients = doctors.reduce(
			(sum, d) => sum + d.total_patients,
			0
		);

		// Generate pie chart as base64 image
		const pieChartImage = await this.generateDoctorPieChart(doctors);

		// Create summary table
		const summaryTableBody = [];
		summaryTableBody.push([
			{ text: "Doctor Name", bold: true, fillColor: "#f0f0f0" },
			{ text: "Doctor Type", bold: true, fillColor: "#f0f0f0" },
			{
				text: `Patients ${this.capitalizeFirst(relationshipType)}`,
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "center"
			},
			{
				text: "Percentage",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "center"
			}
		]);

		doctors.forEach((doctor) => {
			const percentage = (
				(doctor.total_patients / totalPatients) *
				100
			).toFixed(1);
			summaryTableBody.push([
				doctor.doctor_name,
				this.capitalizeFirst(doctor.doctor_type),
				{ text: doctor.total_patients.toString(), alignment: "center" },
				{ text: `${percentage}%`, alignment: "center" }
			]);
		});

		// Add total row
		summaryTableBody.push([
			{ text: "TOTAL", colSpan: 2, bold: true, fillColor: "#f0f0f0" },
			{ text: "", fillColor: "#f0f0f0" },
			{
				text: totalPatients.toString(),
				bold: true,
				alignment: "center",
				fillColor: "#f0f0f0"
			},
			{
				text: "100%",
				bold: true,
				alignment: "center",
				fillColor: "#f0f0f0"
			}
		]);

		const docDefinition = {
			content: [
				// Title
				{
					text: reportTitle,
					style: "header",
					alignment: "center"
				},
				{
					text: `Report Period: ${this.formatDate(
						filters.start_date
					)} - ${this.formatDate(filters.end_date)}`,
					style: "subheader",
					alignment: "center",
					margin: [0, 0, 0, 20]
				},

				// Pie Chart
				{
					image: pieChartImage,
					width: 400,
					alignment: "center",
					margin: [0, 0, 0, 20]
				},

				// Summary Table
				{
					text: "Doctor Summary",
					style: "sectionHeader",
					margin: [0, 10, 0, 10]
				},
				{
					table: {
						headerRows: 1,
						widths: ["*", "auto", "auto", "auto"],
						body: summaryTableBody
					},
					layout: {
						fillColor: function (rowIndex: number) {
							if (
								rowIndex === 0 ||
								rowIndex === summaryTableBody.length - 1
							) {
								return "#f0f0f0";
							}
							return rowIndex % 2 === 0 ? "#f9f9f9" : null;
						}
					},
					margin: [0, 0, 0, 20]
				},

				// Detailed patient data for each doctor
				...this.generateDoctorDetailedPages(doctors, relationshipType)
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
					margin: [0, 5, 0, 5]
				},
				sectionHeader: {
					fontSize: 14,
					bold: true,
					color: "#0d6efd",
					margin: [0, 15, 0, 10]
				},
				doctorHeader: {
					fontSize: 12,
					bold: true,
					color: "#0d6efd",
					margin: [0, 10, 0, 5]
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
			},
			pageSize: "A4",
			pageOrientation: "portrait"
		};

		//@ts-ignore
		const pdf = pdfMake.createPdf(docDefinition);
		pdf.open();
		this.showSuccess("Report generated successfully");
	}

	/**
	 * Generate pie chart for doctor distribution
	 */
	private async generateDoctorPieChart(doctors: any[]): Promise<string> {
		return new Promise((resolve) => {
			// Create a temporary canvas
			const canvas = document.createElement("canvas");
			canvas.width = 600;
			canvas.height = 400;

			const labels = doctors.map((d) => d.doctor_name);
			const data = doctors.map((d) => d.total_patients);

			// Generate colors
			const colors = this.generateChartColors(doctors.length);

			//@ts-ignore
			const chart = new Chart(canvas, {
				type: "pie",
				data: {
					labels: labels,
					datasets: [
						{
							data: data,
							backgroundColor: colors,
							borderColor: "#ffffff",
							borderWidth: 2
						}
					]
				},
				options: {
					responsive: false,
					plugins: {
						legend: {
							display: true,
							position: "bottom"
						},
						title: {
							display: true,
							text: "Patient Distribution by Doctor",
							font: {
								size: 16,
								weight: "bold"
							}
						}
					}
				}
			});

			// Wait for chart to render, then convert to base64
			setTimeout(() => {
				const base64Image = canvas.toDataURL("image/png");
				chart.destroy();
				resolve(base64Image);
			}, 1000);
		});
	}

	/**
	 * Generate detailed pages for each doctor
	 */
	private generateDoctorDetailedPages(
		doctors: any[],
		relationshipType: string
	): any[] {
		const content: any[] = [];

		doctors.forEach((doctor, _index) => {
			content.push({ text: "", pageBreak: "before" });

			// Doctor header
			content.push({
				text: `Dr. ${doctor.doctor_name} (${this.capitalizeFirst(
					doctor.doctor_type
				)})`,
				style: "sectionHeader"
			});

			content.push({
				text: `Total Patients ${this.capitalizeFirst(
					relationshipType
				)}: ${doctor.total_patients}`,
				bold: true,
				margin: [0, 5, 0, 10]
			});

			if (doctor.patients && doctor.patients.length > 0) {
				// Patient details table
				const patientTableBody = [];

				// Header
				const headers = [
					{ text: "Patient Name", bold: true, fillColor: "#f0f0f0" },
					{ text: "National ID", bold: true, fillColor: "#f0f0f0" },
					{ text: "Gender", bold: true, fillColor: "#f0f0f0" },
					{
						text: "Age",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "center"
					},
					{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" }
				];

				// Check if any patient has insurance
				const hasInsurance = doctor.patients.some(
					(p: any) => p.payment_type === "insurance"
				);
				if (hasInsurance) {
					headers.push(
						{ text: "Insurance", bold: true, fillColor: "#f0f0f0" },
						{ text: "Card ID", bold: true, fillColor: "#f0f0f0" },
						{ text: "Form ID", bold: true, fillColor: "#f0f0f0" }
					);
				}

				headers.push(
					{
						text: "# Admissions",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "center"
					},
					{
						text: "Total Billed",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "right"
					},
					{
						text: "Total Paid",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "right"
					}
				);

				patientTableBody.push(headers);

				// Data rows
				doctor.patients.forEach((patient: any) => {
					const row = [
						patient.patient_name,
						patient.national_id || "N/A",
						this.capitalizeFirst(patient.gender || "N/A"),
						{
							text: patient.age ? patient.age.toString() : "N/A",
							alignment: "center"
						},
						this.capitalizeFirst(patient.payment_type)
					];

					if (hasInsurance) {
						if (patient.payment_type === "insurance") {
							row.push(
								patient.insurance_company || "N/A",
								patient.insurance_card_id || "N/A",
								patient.insurance_form_id || "N/A"
							);
						} else {
							row.push("N/A", "N/A", "N/A");
						}
					}

					row.push(
						{
							text: patient.admission_count.toString(),
							alignment: "center"
						},
						{
							text: this.formatCurrency(patient.total_billed),
							alignment: "right"
						},
						{
							text: this.formatCurrency(patient.total_paid),
							alignment: "right",
							color: "#28a745"
						}
					);

					patientTableBody.push(row);
				});

				// Calculate totals
				const totalBilled = doctor.patients.reduce(
					(sum: number, p: any) => sum + p.total_billed,
					0
				);
				const totalPaid = doctor.patients.reduce(
					(sum: number, p: any) => sum + p.total_paid,
					0
				);
				const totalAdmissions = doctor.patients.reduce(
					(sum: number, p: any) => sum + p.admission_count,
					0
				);

				const totalRow: Array<{}> = [
					{
						text: "TOTAL",
						colSpan: 8,
						bold: true,
						fillColor: "#f0f0f0"
					},
					{ text: "", fillColor: "#f0f0f0" },
					{ text: "", fillColor: "#f0f0f0" },
					{ text: "", fillColor: "#f0f0f0" },
					{ text: "", fillColor: "#f0f0f0" }
				];

				if (hasInsurance) {
					totalRow.push(
						{ text: "", fillColor: "#f0f0f0" },
						{ text: "", fillColor: "#f0f0f0" },
						{ text: "", fillColor: "#f0f0f0" }
					);
				}

				totalRow.push(
					{
						text: totalAdmissions.toString(),
						bold: true,
						alignment: "center",
						fillColor: "#f0f0f0"
					},
					{
						text: this.formatCurrency(totalBilled),
						bold: true,
						alignment: "right",
						fillColor: "#f0f0f0"
					},
					{
						text: this.formatCurrency(totalPaid),
						bold: true,
						alignment: "right",
						fillColor: "#f0f0f0",
						color: "#28a745"
					}
				);

				patientTableBody.push(totalRow);

				// Determine column widths
				const widths = hasInsurance
					? [
							"*",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto"
					  ]
					: [
							"*",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto",
							"auto"
					  ];

				content.push({
					table: {
						headerRows: 1,
						widths: widths,
						body: patientTableBody
					},
					layout: {
						fillColor: function (rowIndex: number, node: any) {
							if (
								rowIndex === 0 ||
								rowIndex === node.table.body.length - 1
							) {
								return "#f0f0f0";
							}
							return rowIndex % 2 === 0 ? "#f9f9f9" : null;
						},
						hLineWidth: function (i: number, node: any) {
							if (i === node.table.body.length - 1) return 2;
							return 1;
						}
					},
					margin: [0, 0, 0, 20],
					fontSize: hasInsurance ? 7 : 9
				});
			} else {
				content.push({
					text: "No patients found",
					color: "#6c757d",
					margin: [0, 10, 0, 10]
				});
			}
		});

		return content;
	}

	private async generateSingleDoctorReportPDF(
		doctor: any,
		reportType: string
	): Promise<void> {
		const filters = this.getReportFilters();

		// Determine report title and relationship type
		let reportTitle = "";
		let relationshipType = "";

		if (reportType === "specific-referred") {
			reportTitle = "Referring Doctor Report";
			relationshipType = "Referred";
		} else if (reportType === "specific-attending") {
			reportTitle = "Attending Doctor Report";
			relationshipType = "Attended";
		} else {
			reportTitle = "Supervising Doctor Report";
			relationshipType = "Supervised";
		}

		const docDefinition = {
			content: [
				// Title
				{
					text: reportTitle,
					style: "header",
					alignment: "center"
				},
				{
					text: `Dr. ${doctor.doctor_name} (${this.capitalizeFirst(
						doctor.doctor_type
					)})`,
					style: "subheader",
					alignment: "center"
				},
				{
					text: `Report Period: ${this.formatDate(
						filters.start_date
					)} - ${this.formatDate(filters.end_date)}`,
					alignment: "center",
					margin: [0, 5, 0, 15]
				},
				{
					text: `Total Patients ${relationshipType}: ${doctor.total_patients}`,
					bold: true,
					fontSize: 14,
					margin: [0, 0, 0, 20]
				},

				// Patient details with admission information
				[
					...(await this.generateSingleDoctorPatientPages(
						doctor.patients
					))
				]
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
					color: "#0d6efd",
					margin: [0, 5, 0, 5]
				},
				patientHeader: {
					fontSize: 12,
					bold: true,
					color: "#0d6efd",
					margin: [0, 10, 0, 5]
				},
				sectionHeader: {
					fontSize: 11,
					bold: true,
					margin: [0, 10, 0, 5]
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
			},
			pageSize: "A4"
		};

		//@ts-ignore
		const pdf = pdfMake.createPdf(docDefinition);
		pdf.open();
		this.showSuccess("Report generated successfully");
	}

	private async generateSingleDoctorPatientPages(
		patients: any[]
	): Promise<any[]> {
		const content: any[] = [];

		// Summary table first
		const summaryTableBody = [];

		summaryTableBody.push([
			{ text: "Patient Name", bold: true, fillColor: "#f0f0f0" },
			{ text: "National ID", bold: true, fillColor: "#f0f0f0" },
			{ text: "Gender", bold: true, fillColor: "#f0f0f0" },
			{
				text: "Age",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "center"
			},
			{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" },
			{
				text: "# Admissions",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "center"
			},
			{
				text: "Total Billed",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "right"
			},
			{
				text: "Total Paid",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "right"
			}
		]);

		patients.forEach((patient: any) => {
			summaryTableBody.push([
				patient.patient_name,
				patient.national_id || "N/A",
				this.capitalizeFirst(patient.gender || "N/A"),
				{
					text: patient.age ? patient.age.toString() : "N/A",
					alignment: "center"
				},
				this.capitalizeFirst(patient.payment_type),
				{
					text: patient.admission_count.toString(),
					alignment: "center"
				},
				{
					text: this.formatCurrency(patient.total_billed),
					alignment: "right"
				},
				{
					text: this.formatCurrency(patient.total_paid),
					alignment: "right",
					color: "#28a745"
				}
			]);
		});

		// Add totals
		const totalAdmissions = patients.reduce(
			(sum, p) => sum + p.admission_count,
			0
		);
		const totalBilled = patients.reduce(
			(sum, p) => sum + p.total_billed,
			0
		);
		const totalPaid = patients.reduce((sum, p) => sum + p.total_paid, 0);

		summaryTableBody.push([
			{ text: "TOTAL", colSpan: 6, bold: true, fillColor: "#f0f0f0" },
			{ text: "", fillColor: "#f0f0f0" },
			{ text: "", fillColor: "#f0f0f0" },
			{ text: "", fillColor: "#f0f0f0" },
			{ text: "", fillColor: "#f0f0f0" },
			{
				text: totalAdmissions.toString(),
				bold: true,
				alignment: "center",
				fillColor: "#f0f0f0"
			},
			{
				text: this.formatCurrency(totalBilled),
				bold: true,
				alignment: "right",
				fillColor: "#f0f0f0"
			},
			{
				text: this.formatCurrency(totalPaid),
				bold: true,
				alignment: "right",
				fillColor: "#f0f0f0",
				color: "#28a745"
			}
		]);

		content.push({
			text: "Patient Summary",
			style: "sectionHeader"
		});

		content.push({
			table: {
				headerRows: 1,
				widths: [
					"*",
					"auto",
					"auto",
					"auto",
					"auto",
					"auto",
					"auto",
					"auto"
				],
				body: summaryTableBody
			},
			layout: {
				fillColor: function (rowIndex: number, node: any) {
					if (
						rowIndex === 0 ||
						rowIndex === node.table.body.length - 1
					) {
						return "#f0f0f0";
					}
					return rowIndex % 2 === 0 ? "#f9f9f9" : null;
				},
				hLineWidth: function (i: number, node: any) {
					if (i === node.table.body.length - 1) return 2;
					return 1;
				}
			},
			margin: [0, 0, 0, 20]
		});

		// Now fetch and display detailed admission data for each patient
		for (let i = 0; i < patients.length; i++) {
			const patient = patients[i];

			try {
				// Fetch detailed admission data from the API
				const admissionData = await this.fetchPatientAdmissions(
					patient.patient_id,
					this.getReportFilters()
				);

				// Page break before each patient
				if (i > 0) {
					content.push({ text: "", pageBreak: "before" });
				}

				content.push({
					text: `Patient: ${patient.patient_name}`,
					style: "patientHeader"
				});

				// Patient info table
				const patientInfoHeaders: any[] = [
					{ text: "National ID", bold: true, fillColor: "#f0f0f0" },
					{ text: "Gender", bold: true, fillColor: "#f0f0f0" },
					{ text: "Age", bold: true, fillColor: "#f0f0f0" },
					{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" }
				];

				const patientInfoRow: any[] = [
					patient.national_id || "N/A",
					this.capitalizeFirst(patient.gender || "N/A"),
					patient.age ? `${patient.age} years` : "N/A",
					this.capitalizeFirst(patient.payment_type)
				];

				if (patient.payment_type === "insurance") {
					if (patient.insurance_company) {
						patientInfoHeaders.push({
							text: "Insurance",
							bold: true,
							fillColor: "#f0f0f0"
						});
						patientInfoRow.push(patient.insurance_company);
					}
					if (patient.insurance_card_id) {
						patientInfoHeaders.push({
							text: "Card ID",
							bold: true,
							fillColor: "#f0f0f0"
						});
						patientInfoRow.push(patient.insurance_card_id);
					}
					if (patient.insurance_form_id) {
						patientInfoHeaders.push({
							text: "Form ID",
							bold: true,
							fillColor: "#f0f0f0"
						});
						patientInfoRow.push(patient.insurance_form_id);
					}
				}

				content.push({
					table: {
						headerRows: 1,
						widths: patientInfoHeaders.map(() => "*"),
						body: [patientInfoHeaders, patientInfoRow]
					},
					layout: "lightHorizontalLines",
					margin: [0, 5, 0, 15]
				});

				// Display admissions if available
				if (admissionData && admissionData.length > 0) {
					content.push({
						text: `Admissions (${admissionData.length})`,
						style: "sectionHeader"
					});

					admissionData.forEach(
						(admission: any, admIndex: number) => {
							if (admIndex > 0) {
								content.push({
									text: "",
									margin: [0, 10, 0, 0]
								});
							}

							content.push({
								text: `Admission ${admIndex + 1}`,
								bold: true,
								margin: [0, 5, 0, 5]
							});

							content.push({
								columns: [
									{
										text: `Admission: ${this.formatDateTime(
											admission.admission_time
										)}`,
										width: "*"
									},
									{
										text: `Discharge: ${
											admission.discharge_time
												? this.formatDateTime(
														admission.discharge_time
												  )
												: "Active"
										}`,
										width: "*"
									}
								],
								margin: [0, 0, 0, 5]
							});

							if (admission.diagnosis) {
								content.push({
									text: `Diagnosis: ${admission.diagnosis}`,
									margin: [0, 0, 0, 10]
								});
							}

							// Services and Drugs table
							content.push(
								...this.generateAdmissionItemsTable(admission)
							);

							// Daily Staff table
							if (
								admission.daily_staff &&
								admission.daily_staff.length > 0
							) {
								content.push(
									...this.generateDailyStaffTable(
										admission.daily_staff
									)
								);
							}
						}
					);
				} else {
					content.push({
						text: "No admission details available",
						color: "#6c757d",
						margin: [0, 10, 0, 10]
					});
				}
			} catch (error) {
				console.error(
					`Error fetching admission data for patient ${patient.patient_id}:`,
					error
				);
				content.push({
					text: "Error loading admission details",
					color: "#dc3545",
					margin: [0, 10, 0, 10]
				});
			}
		}

		return content;
	}

	/**
	 * Fetch patient admissions for detailed report
	 */
	private async fetchPatientAdmissions(
		patientId: number,
		filters: ReportFilters
	): Promise<any[]> {
		try {
			const response = await fetch(
				`/api/reports/patients/formatted?start_date=${filters.start_date}&end_date=${filters.end_date}&patient_id=${patientId}`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error("Failed to fetch patient admissions");
			}

			const data = await response.json();

			if (data && data.length > 0 && data[0].admissions) {
				return data[0].admissions;
			}

			return [];
		} catch (error) {
			console.error("Error fetching patient admissions:", error);
			return [];
		}
	}

	/**
	 * Generate color palette for charts
	 */
	private generateChartColors(count: number): string[] {
		const baseColors = [
			"rgba(13, 110, 253, 0.7)", // Primary blue
			"rgba(40, 167, 69, 0.7)", // Success green
			"rgba(220, 53, 69, 0.7)", // Danger red
			"rgba(255, 193, 7, 0.7)", // Warning yellow
			"rgba(13, 202, 240, 0.7)", // Info cyan
			"rgba(111, 66, 193, 0.7)", // Purple
			"rgba(253, 126, 20, 0.7)", // Orange
			"rgba(214, 51, 132, 0.7)", // Pink
			"rgba(32, 201, 151, 0.7)", // Teal
			"rgba(102, 16, 242, 0.7)" // Indigo
		];

		// If we need more colors than in the base palette, generate them
		if (count <= baseColors.length) {
			return baseColors.slice(0, count);
		}

		const colors = [...baseColors];
		const hueStep = 360 / (count - baseColors.length);

		for (let i = baseColors.length; i < count; i++) {
			const hue = (i - baseColors.length) * hueStep;
			colors.push(`hsla(${hue}, 70%, 60%, 0.7)`);
		}

		return colors;
	}

	/**
	 * Render pie chart in the reports page for doctor reports
	 */
	private renderDoctorReportPieChart(doctors: any[]): void {
		const canvas = document.createElement("canvas");
		canvas.id = "doctorReportPieChart";
		canvas.style.maxHeight = "400px";

		// Find or create container
		const container = document.getElementById("doctorReportContent");
		if (!container) return;

		// Check if we should add a chart
		const existingChart = container.querySelector("#doctorReportPieChart");
		if (!existingChart) {
			const chartContainer = document.createElement("div");
			chartContainer.className = "card mb-3";
			chartContainer.innerHTML = `
            <div class="card-header">
                <h5 class="mb-0">Patient Distribution</h5>
            </div>
            <div class="card-body">
                <canvas id="doctorReportPieChart" height="300"></canvas>
            </div>
        `;
			container.insertBefore(chartContainer, container.firstChild);
		}

		const chartCanvas = document.getElementById(
			"doctorReportPieChart"
		) as HTMLCanvasElement;
		if (!chartCanvas) return;

		const labels = doctors.map((d) => d.doctor_name);
		const data = doctors.map((d) => d.total_patients);
		const colors = this.generateChartColors(doctors.length);

		//@ts-ignore
		new Chart(chartCanvas, {
			type: "pie",
			data: {
				labels: labels,
				datasets: [
					{
						data: data,
						backgroundColor: colors,
						borderColor: "#ffffff",
						borderWidth: 2
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "bottom"
					},
					title: {
						display: false
					}
				}
			}
		});
	}

	// ==================== NURSE REPORTS ====================

	private async loadNurseReport(): Promise<void> {
		const filters = this.getReportFilters();

		if (!filters.start_date || !filters.end_date) {
			this.showError("Please select both start and end dates");
			return;
		}

		const reportType = (
			document.getElementById("nurseReportType") as HTMLSelectElement
		).value;
		const nurseId = (
			document.getElementById("nurseSelect") as HTMLSelectElement
		).value;

		if (reportType === "specific" && !nurseId) {
			this.showError("Please select a nurse");
			return;
		}

		try {
			await this.showLoading();

			let url =
				reportType === "all"
					? `/api/reports/nurses/attended?start_date=${filters.start_date}&end_date=${filters.end_date}`
					: `/api/reports/nurses/${nurseId}/attended?start_date=${filters.start_date}&end_date=${filters.end_date}`;

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch nurse report");

			const data = await response.json();
			this.currentReportData = data;
			this.currentReportType = "nurses";

			this.displayNurseReport(data);
			this.enablePrintButton("printNurseReportBtn");

			this.showSuccess("Nurse report generated successfully");
		} catch (error: any) {
			console.error("Error loading nurse report:", error);
			this.showError(error.message || "Failed to load nurse report");
		} finally {
			this.hideLoading();
		}
	}

	private displayNurseReport(data: any): void {
		const container = document.getElementById("nurseReportContent");
		if (!container) return;

		const isMultipleNurses = Array.isArray(data);
		const nurses = isMultipleNurses ? data : [data];

		if (nurses.length === 0) {
			container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-inbox" style="font-size: 3rem; color: #6c757d;"></i>
                <h5 class="mt-3 text-muted">No Data Found</h5>
                <p class="text-muted">No nurses match the selected criteria</p>
            </div>
        `;
			return;
		}

		const totalPatients = nurses.reduce(
			(sum: number, n: any) => sum + n.total_patients,
			0
		);

		container.innerHTML = `
        <div class="row g-3 mb-4">
            <div class="col-md-6">
                <div class="summary-card border-start-primary">
                    <h6>Total Nurses</h6>
                    <div class="value">${nurses.length}</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="summary-card border-start-info">
                    <h6>Total Patients</h6>
                    <div class="value">${totalPatients}</div>
                </div>
            </div>
        </div>
        ${nurses.map((nurse: any) => this.renderNurseCard(nurse)).join("")}
    `;

		// Add pie chart for multiple nurses
		if (isMultipleNurses && nurses.length > 1) {
			setTimeout(() => this.renderNurseReportPieChart(nurses), 100);
		}
	}

	private renderNurseCard(nurse: any): string {
		const totalDays =
			nurse.patients?.reduce(
				(sum: number, p: any) => sum + p.total_days_assigned,
				0
			) || 0;
		const dailyAssignments = nurse.daily_assignments || [];

		return `
    	    <div class="card mb-3">
    	        <div class="card-header">
    	            <div class="d-flex justify-content-between align-items-center">
    	                <div>
    	                    <h5 class="mb-0">${this.escapeHtml(
								nurse.nurse_name
							)}</h5>
    	                    <small class="text-muted">NURSE</small>
    	                </div>
    	                <div class="text-end">
    	                    <h4 class="mb-0">${nurse.total_patients} Patients</h4>
    	                    <small class="text-muted">${totalDays} total days | ${
			dailyAssignments.length
		} work days</small>
    	                </div>
    	            </div>
    	        </div>
    	        <div class="card-body">
    	            ${
						nurse.patients && nurse.patients.length > 0
							? `
    	                <div class="mb-4">
    	                    <h6 class="mb-3"><i class="bi bi-people me-2"></i>Patient Summary</h6>
    	                    <div class="table-responsive">
    	                        <table class="table table-hover report-table">
    	                            <thead>
    	                                <tr>
    	                                    <th>Patient Name</th>
    	                                    <th>Last Admission</th>
    	                                    <th>Last Discharge</th>
    	                                    <th>Payment Type</th>
    	                                    <th>Diagnosis</th>
    	                                    <th class="text-center">Days Assigned</th>
    	                                </tr>
    	                            </thead>
    	                            <tbody>
    	                                ${nurse.patients
											.map(
												(patient: any) => `
    	                                    <tr>
    	                                        <td>${this.escapeHtml(
													patient.patient_name
												)}</td>
    	                                        <td>${
													patient.last_admission_time
														? this.formatDateTime(
																patient.last_admission_time
														  )
														: "N/A"
												}</td>
    	                                        <td>${
													patient.last_discharge_time
														? this.formatDateTime(
																patient.last_discharge_time
														  )
														: '<span class="badge bg-success">Active</span>'
												}</td>
    	                                        <td><span class="payment-type-badge badge-${
													patient.payment_type
												}">${patient.payment_type.toUpperCase()}</span></td>
    	                                        <td>${
													patient.diagnosis
														? this.escapeHtml(
																patient.diagnosis
														  )
														: "N/A"
												}</td>
    	                                        <td class="text-center">${
													patient.total_days_assigned
												}</td>
    	                                    </tr>
    	                                `
											)
											.join("")}
    	                            </tbody>
    	                            <tfoot>
    	                                <tr class="totals-row">
    	                                    <td colspan="5" class="text-end"><strong>TOTAL DAYS:</strong></td>
    	                                    <td class="text-center"><strong>${totalDays}</strong></td>
    	                                </tr>
    	                            </tfoot>
    	                        </table>
    	                    </div>
    	                </div>
    	            `
							: '<p class="text-muted">No patients found for this nurse</p>'
					}
										
    	            ${
						dailyAssignments.length > 0
							? `
    	                <div class="mt-4">
    	                    <h6 class="mb-3"><i class="bi bi-calendar-week me-2"></i>Daily Work Assignments (${
								dailyAssignments.length
							} days)</h6>
    	                    <div class="accordion" id="dailyAssignmentsAccordion${
								nurse.nurse_id
							}">
    	                        ${dailyAssignments
									.map((day: any, index: number) =>
										this.renderDailyAssignmentCard(
											day,
											index,
											nurse.nurse_id
										)
									)
									.join("")}
    	                    </div>
    	                </div>
    	            `
							: ""
					}
	   	        </div>
	   	    </div>
		`;
	}

	private renderDailyAssignmentCard(
		day: any,
		index: number,
		nurseId: number
	): string {
		return `
	        <div class="accordion-item">
	            <h2 class="accordion-header" id="heading${nurseId}_${index}">
	                <button class="accordion-button ${
						index === 0 ? "" : "collapsed"
					}" type="button" 
	                        data-bs-toggle="collapse" data-bs-target="#collapse${nurseId}_${index}" 
	                        aria-expanded="${
								index === 0 ? "true" : "false"
							}" aria-controls="collapse${nurseId}_${index}">
	                    <div class="d-flex justify-content-between w-100 me-3">
	                        <span><strong>${this.formatDate(
								day.work_date
							)}</strong></span>
	                        <span class="text-muted">
	                            ${day.patient_count} patient${
			day.patient_count !== 1 ? "s" : ""
		} | 
	                            ${day.total_hours.toFixed(1)} hours
	                        </span>
	                    </div>
	                </button>
	            </h2>
	            <div id="collapse${nurseId}_${index}" class="accordion-collapse collapse ${
			index === 0 ? "show" : ""
		}" 
	                 aria-labelledby="heading${nurseId}_${index}" data-bs-parent="#dailyAssignmentsAccordion${nurseId}">
	                <div class="accordion-body">
	                    <div class="table-responsive">
	                        <table class="table table-sm table-hover mb-0">
	                            <thead>
	                                <tr>
	                                    <th>Patient Name</th>
	                                    <th>Payment Type</th>
	                                    <th>Diagnosis</th>
	                                    <th class="text-center">Hours Worked</th>
	                                </tr>
	                            </thead>
	                            <tbody>
	                                ${day.patients
										.map(
											(patient: any) => `
	                                    <tr>
	                                        <td>${this.escapeHtml(
												patient.patient_name
											)}</td>
	                                        <td><span class="payment-type-badge badge-${
												patient.payment_type
											}">${patient.payment_type.toUpperCase()}</span></td>
	                                        <td>${
												patient.diagnosis
													? this.escapeHtml(
															patient.diagnosis
													  )
													: "N/A"
											}</td>
	                                        <td class="text-center">${patient.hours_worked.toFixed(
												1
											)}h</td>
	                                    </tr>
	                                `
										)
										.join("")}
	                            </tbody>
	                            <tfoot>
	                                <tr class="table-light">
	                                    <td colspan="3" class="text-end"><strong>Total:</strong></td>
	                                    <td class="text-center"><strong>${day.total_hours.toFixed(
											1
										)}h</strong></td>
	                                </tr>
	                            </tfoot>
	                        </table>
	                    </div>
	                </div>
	            </div>
	        </div>
	    `;
	}

	private async printNurseReport(): Promise<void> {
		if (!this.currentReportData) {
			this.showError("No report data to print");
			return;
		}
		const isMultipleNurses = Array.isArray(this.currentReportData);

		try {
			if (isMultipleNurses) {
				// Multiple nurses with pie chart
				await this.generateMultipleNursesReportPDF(
					this.currentReportData
				);
			} else {
				// Single nurse with patient details
				await this.generateSingleNurseReportPDF(this.currentReportData);
			}
		} catch (error) {
			console.error("Error printing nurse report:", error);
			this.showError("Failed to generate report");
		}
	}

	/**
	 * Generate PDF for multiple nurses with pie chart
	 */
	private async generateMultipleNursesReportPDF(
		nurses: any[]
	): Promise<void> {
		const filters = this.getReportFilters();

		// Calculate totals
		const totalPatients = nurses.reduce(
			(sum, n) => sum + n.total_patients,
			0
		);

		// Generate pie chart as base64 image
		const pieChartImage = await this.generateNursePieChart(nurses);

		// Create summary table
		const summaryTableBody = [];
		summaryTableBody.push([
			{ text: "Nurse Name", bold: true, fillColor: "#f0f0f0" },
			{
				text: "Patients Attended",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "center"
			},
			{
				text: "Percentage",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "center"
			}
		]);

		nurses.forEach((nurse) => {
			const percentage = (
				(nurse.total_patients / totalPatients) *
				100
			).toFixed(1);
			summaryTableBody.push([
				nurse.nurse_name,
				{ text: nurse.total_patients.toString(), alignment: "center" },
				{ text: `${percentage}%`, alignment: "center" }
			]);
		});

		// Add total row
		summaryTableBody.push([
			{ text: "TOTAL", bold: true, fillColor: "#f0f0f0" },
			{
				text: totalPatients.toString(),
				bold: true,
				alignment: "center",
				fillColor: "#f0f0f0"
			},
			{
				text: "100%",
				bold: true,
				alignment: "center",
				fillColor: "#f0f0f0"
			}
		]);

		const docDefinition = {
			content: [
				// Title
				{
					text: "Nursing Staff Report",
					style: "header",
					alignment: "center"
				},
				{
					text: `Report Period: ${this.formatDate(
						filters.start_date
					)} - ${this.formatDate(filters.end_date)}`,
					style: "subheader",
					alignment: "center",
					margin: [0, 0, 0, 20]
				},

				// Pie Chart
				{
					image: pieChartImage,
					width: 400,
					alignment: "center",
					margin: [0, 0, 0, 20]
				},

				// Summary Table
				{
					text: "Nurse Summary",
					style: "sectionHeader",
					margin: [0, 10, 0, 10]
				},
				{
					table: {
						headerRows: 1,
						widths: ["*", "auto", "auto"],
						body: summaryTableBody
					},
					layout: {
						fillColor: function (rowIndex: number, node: any) {
							if (
								rowIndex === 0 ||
								rowIndex === node.table.body.length - 1
							) {
								return "#f0f0f0";
							}
							return rowIndex % 2 === 0 ? "#f9f9f9" : null;
						}
					},
					margin: [0, 0, 0, 20]
				},

				// Detailed patient data for each nurse
				...this.generateNurseDetailedPages(nurses)
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
					margin: [0, 5, 0, 5]
				},
				sectionHeader: {
					fontSize: 14,
					bold: true,
					color: "#0d6efd",
					margin: [0, 15, 0, 10]
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
			},
			pageSize: "A4"
		};

		//@ts-ignore
		const pdf = pdfMake.createPdf(docDefinition);
		pdf.open();
		this.showSuccess("Report generated successfully");
	}

	/**
	 * Generate pie chart for nurse distribution
	 */
	private async generateNursePieChart(nurses: any[]): Promise<string> {
		return new Promise((resolve) => {
			const canvas = document.createElement("canvas");
			canvas.width = 600;
			canvas.height = 400;

			const labels = nurses.map((n) => n.nurse_name);
			const data = nurses.map((n) => n.total_patients);

			const colors = this.generateChartColors(nurses.length);

			//@ts-ignore
			const chart = new Chart(canvas, {
				type: "pie",
				data: {
					labels: labels,
					datasets: [
						{
							data: data,
							backgroundColor: colors,
							borderColor: "#ffffff",
							borderWidth: 2
						}
					]
				},
				options: {
					responsive: false,
					plugins: {
						legend: {
							display: true,
							position: "bottom"
						},
						title: {
							display: true,
							text: "Patient Distribution by Nurse",
							font: {
								size: 16,
								weight: "bold"
							}
						}
					}
				}
			});

			setTimeout(() => {
				const base64Image = canvas.toDataURL("image/png");
				chart.destroy();
				resolve(base64Image);
			}, 1000);
		});
	}

	/**
	 * Generate detailed pages for each nurse
	 */
	private generateNurseDetailedPages(nurses: any[]): any[] {
		const content: any[] = [];

		nurses.forEach((nurse, index) => {
			// Page break before each nurse except the first
			if (index > 0) {
				content.push({ text: "", pageBreak: "before" });
			}

			// Nurse header
			content.push({
				text: `Nurse ${nurse.nurse_name}`,
				style: "sectionHeader"
			});

			content.push({
				text: `Total Patients Attended: ${nurse.total_patients}`,
				bold: true,
				margin: [0, 5, 0, 10]
			});

			if (nurse.patients && nurse.patients.length > 0) {
				// Patient details table
				const patientTableBody = [];

				// Header
				patientTableBody.push([
					{ text: "Patient Name", bold: true, fillColor: "#f0f0f0" },
					{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" },
					{
						text: "Last Admission",
						bold: true,
						fillColor: "#f0f0f0"
					},
					{
						text: "Last Discharge",
						bold: true,
						fillColor: "#f0f0f0"
					},
					{ text: "Diagnosis", bold: true, fillColor: "#f0f0f0" },
					{
						text: "Days Assigned",
						bold: true,
						fillColor: "#f0f0f0",
						alignment: "center"
					}
				]);

				// Data rows
				nurse.patients.forEach((patient: any) => {
					patientTableBody.push([
						patient.patient_name,
						this.capitalizeFirst(patient.payment_type),
						patient.last_admission_time
							? this.formatDateTime(patient.last_admission_time)
							: "N/A",
						patient.last_discharge_time
							? this.formatDateTime(patient.last_discharge_time)
							: "Active",
						patient.diagnosis || "N/A",
						{
							text: patient.total_days_assigned.toString(),
							alignment: "center"
						}
					]);
				});

				// Calculate totals
				const totalDays = nurse.patients.reduce(
					(sum: number, p: any) => sum + p.total_days_assigned,
					0
				);

				patientTableBody.push([
					{ text: "TOTAL", bold: true, fillColor: "#f0f0f0" },
					{ text: "", fillColor: "#f0f0f0" },
					{ text: "", fillColor: "#f0f0f0" },
					{ text: "", fillColor: "#f0f0f0" },
					{ text: "", fillColor: "#f0f0f0" },
					{
						text: totalDays.toString(),
						bold: true,
						alignment: "center",
						fillColor: "#f0f0f0"
					}
				]);

				content.push({
					text: "Patient Summary",
					bold: true,
					fontSize: 11,
					margin: [0, 5, 0, 5]
				});

				content.push({
					table: {
						headerRows: 1,
						widths: ["*", "auto", "auto", "auto", "*", "auto"],
						body: patientTableBody
					},
					layout: {
						fillColor: function (rowIndex: number, node: any) {
							if (
								rowIndex === 0 ||
								rowIndex === node.table.body.length - 1
							) {
								return "#f0f0f0";
							}
							return rowIndex % 2 === 0 ? "#f9f9f9" : null;
						},
						hLineWidth: function (i: number, node: any) {
							if (i === node.table.body.length - 1) return 2;
							return 1;
						}
					},
					margin: [0, 0, 0, 20],
					fontSize: 9
				});
			}

			// Add daily assignments table
			if (nurse.daily_assignments && nurse.daily_assignments.length > 0) {
				content.push({
					text: `Daily Work Assignments (${nurse.daily_assignments.length} days)`,
					bold: true,
					fontSize: 11,
					margin: [0, 15, 0, 10]
				});

				nurse.daily_assignments.forEach(
					(day: any, dayIndex: number) => {
						// Add page break if needed (every 3 days to prevent overflow)
						if (dayIndex > 0 && dayIndex % 3 === 0) {
							content.push({ text: "", pageBreak: "before" });
							content.push({
								text: `Nurse ${nurse.nurse_name} - Daily Assignments (continued)`,
								style: "sectionHeader"
							});
						}

						content.push({
							text: `${this.formatDate(day.work_date)} - ${
								day.patient_count
							} patient${
								day.patient_count !== 1 ? "s" : ""
							} (${day.total_hours.toFixed(1)} hours)`,
							bold: true,
							fontSize: 10,
							margin: [0, 10, 0, 5]
						});

						const dailyTableBody = [];

						// Header
						dailyTableBody.push([
							{
								text: "Patient Name",
								bold: true,
								fillColor: "#e9ecef"
							},
							{
								text: "Payment Type",
								bold: true,
								fillColor: "#e9ecef"
							},
							{
								text: "Diagnosis",
								bold: true,
								fillColor: "#e9ecef"
							},
							{
								text: "Hours",
								bold: true,
								fillColor: "#e9ecef",
								alignment: "center"
							}
						]);

						// Patients for this day
						day.patients.forEach((patient: any) => {
							dailyTableBody.push([
								patient.patient_name,
								this.capitalizeFirst(patient.payment_type),
								patient.diagnosis || "N/A",
								{
									text: `${patient.hours_worked.toFixed(1)}h`,
									alignment: "center"
								}
							]);
						});

						// Total for the day
						dailyTableBody.push([
							{
								text: "TOTAL",
								bold: true,
								fillColor: "#e9ecef",
								colSpan: 3
							},
							{},
							{},
							{
								text: `${day.total_hours.toFixed(1)}h`,
								bold: true,
								alignment: "center",
								fillColor: "#e9ecef"
							}
						]);

						content.push({
							table: {
								headerRows: 1,
								widths: ["*", "auto", "*", "auto"],
								body: dailyTableBody
							},
							layout: {
								fillColor: function (
									rowIndex: number,
									node: any
								) {
									if (
										rowIndex === 0 ||
										rowIndex === node.table.body.length - 1
									) {
										return "#e9ecef";
									}
									return rowIndex % 2 === 0
										? "#f8f9fa"
										: null;
								}
							},
							margin: [0, 0, 0, 10],
							fontSize: 8
						});
					}
				);
			}
		});

		return content;
	}

	/**
	 * Generate PDF for single nurse with detailed patient information
	 */
	private async generateSingleNurseReportPDF(nurse: any): Promise<void> {
		const filters = this.getReportFilters();

		const docDefinition = {
			content: [
				// Title
				{
					text: "Nurse Report",
					style: "header",
					alignment: "center"
				},
				{
					text: `Nurse ${nurse.nurse_name}`,
					style: "subheader",
					alignment: "center"
				},
				{
					text: `Report Period: ${this.formatDate(
						filters.start_date
					)} - ${this.formatDate(filters.end_date)}`,
					alignment: "center",
					margin: [0, 5, 0, 15]
				},
				{
					text: `Total Patients Attended: ${nurse.total_patients}`,
					bold: true,
					fontSize: 14,
					margin: [0, 0, 0, 20]
				},

				// Patient summary table
				...this.generateNurseSinglePatientDetails(nurse.patients),

				// Daily assignments
				...this.generateNurseDailyAssignmentsForPDF(
					nurse.daily_assignments
				)
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
					color: "#0d6efd",
					margin: [0, 5, 0, 5]
				},
				sectionHeader: {
					fontSize: 12,
					bold: true,
					margin: [0, 10, 0, 5]
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
			},
			pageSize: "A4"
		};

		//@ts-ignore
		const pdf = pdfMake.createPdf(docDefinition);
		pdf.open();
		this.showSuccess("Report generated successfully");
	}

	/**
	 * Generate daily assignments section for PDF
	 */
	private generateNurseDailyAssignmentsForPDF(
		dailyAssignments: any[]
	): any[] {
		if (!dailyAssignments || dailyAssignments.length === 0) {
			return [];
		}

		const content: any[] = [];

		content.push({
			text: "",
			pageBreak: "before"
		});

		content.push({
			text: `Daily Work Assignments (${dailyAssignments.length} days)`,
			style: "sectionHeader"
		});

		dailyAssignments.forEach((day: any, index: number) => {
			// Add page break every 3 days for readability
			if (index > 0 && index % 3 === 0) {
				content.push({ text: "", pageBreak: "before" });
				content.push({
					text: "Daily Work Assignments (continued)",
					style: "sectionHeader"
				});
			}

			content.push({
				text: `${this.formatDate(day.work_date)} - ${
					day.patient_count
				} patient${
					day.patient_count !== 1 ? "s" : ""
				} (${day.total_hours.toFixed(1)} hours)`,
				bold: true,
				fontSize: 10,
				margin: [0, 10, 0, 5]
			});

			const dailyTableBody = [];

			// Header
			dailyTableBody.push([
				{ text: "Patient Name", bold: true, fillColor: "#e9ecef" },
				{ text: "Payment Type", bold: true, fillColor: "#e9ecef" },
				{ text: "Diagnosis", bold: true, fillColor: "#e9ecef" },
				{
					text: "Hours Worked",
					bold: true,
					fillColor: "#e9ecef",
					alignment: "center"
				}
			]);

			// Patients for this day
			day.patients.forEach((patient: any) => {
				dailyTableBody.push([
					patient.patient_name,
					this.capitalizeFirst(patient.payment_type),
					patient.diagnosis || "N/A",
					{
						text: `${patient.hours_worked.toFixed(1)}h`,
						alignment: "center"
					}
				]);
			});

			// Total for the day
			dailyTableBody.push([
				{ text: "TOTAL", bold: true, fillColor: "#e9ecef", colSpan: 3 },
				{},
				{},
				{
					text: `${day.total_hours.toFixed(1)}h`,
					bold: true,
					alignment: "center",
					fillColor: "#e9ecef"
				}
			]);

			content.push({
				table: {
					headerRows: 1,
					widths: ["*", "auto", "*", "auto"],
					body: dailyTableBody
				},
				layout: {
					fillColor: function (rowIndex: number, node: any) {
						if (
							rowIndex === 0 ||
							rowIndex === node.table.body.length - 1
						) {
							return "#e9ecef";
						}
						return rowIndex % 2 === 0 ? "#f8f9fa" : null;
					}
				},
				margin: [0, 0, 0, 10],
				fontSize: 9
			});
		});

		return content;
	}

	/**
	 * Generate patient details for single nurse report
	 */
	private generateNurseSinglePatientDetails(patients: any[]): any[] {
		const content: any[] = [];

		const tableBody = [];

		tableBody.push([
			{ text: "Patient Name", bold: true, fillColor: "#f0f0f0" },
			{ text: "Payment Type", bold: true, fillColor: "#f0f0f0" },
			{ text: "Last Admission", bold: true, fillColor: "#f0f0f0" },
			{ text: "Last Discharge", bold: true, fillColor: "#f0f0f0" },
			{ text: "Diagnosis", bold: true, fillColor: "#f0f0f0" },
			{
				text: "Days Assigned",
				bold: true,
				fillColor: "#f0f0f0",
				alignment: "center"
			}
		]);

		patients.forEach((patient: any) => {
			tableBody.push([
				patient.patient_name,
				this.capitalizeFirst(patient.payment_type),
				patient.last_admission_time
					? this.formatDateTime(patient.last_admission_time)
					: "N/A",
				patient.last_discharge_time
					? this.formatDateTime(patient.last_discharge_time)
					: "Active",
				patient.diagnosis || "N/A",
				{
					text: patient.total_days_assigned.toString(),
					alignment: "center"
				}
			]);
		});

		content.push({
			table: {
				headerRows: 1,
				widths: ["*", "auto", "auto", "auto", "*", "auto"],
				body: tableBody
			},
			layout: {
				fillColor: function (rowIndex: number, node: any) {
					if (rowIndex === 0) {
						return "#f0f0f0";
					}
					return rowIndex % 2 === 0 ? "#f9f9f9" : null;
				},
				hLineWidth: function (i: number, node: any) {
					if (i === node.table.body.length - 1) return 2;
					return 1;
				}
			},
			margin: [0, 0, 0, 20]
		});

		return content;
	}

	/**
	 * Render pie chart in the reports page for nurse reports
	 */
	private renderNurseReportPieChart(nurses: any[]): void {
		const container = document.getElementById("nurseReportContent");
		if (!container) return;

		// Check if we should add a chart
		const existingChart = container.querySelector("#nurseReportPieChart");
		if (!existingChart) {
			const chartContainer = document.createElement("div");
			chartContainer.className = "card mb-3";
			chartContainer.innerHTML = `
            <div class="card-header">
                <h5 class="mb-0">Patient Distribution</h5>
            </div>
            <div class="card-body">
                <canvas id="nurseReportPieChart" height="300"></canvas>
            </div>
        `;
			container.insertBefore(chartContainer, container.firstChild);
		}

		const chartCanvas = document.getElementById(
			"nurseReportPieChart"
		) as HTMLCanvasElement;
		if (!chartCanvas) return;

		const labels = nurses.map((n) => n.nurse_name);
		const data = nurses.map((n) => n.total_patients);
		const colors = this.generateChartColors(nurses.length);

		//@ts-ignore
		new Chart(chartCanvas, {
			type: "pie",
			data: {
				labels: labels,
				datasets: [
					{
						data: data,
						backgroundColor: colors,
						borderColor: "#ffffff",
						borderWidth: 2
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "bottom"
					},
					title: {
						display: false
					}
				}
			}
		});
	}

	// ==================== STATISTICS ====================

	private async loadStatistics(): Promise<void> {
		const filters = this.getReportFilters();

		if (!filters.start_date || !filters.end_date) {
			this.showError("Please select both start and end dates");
			return;
		}

		try {
			await this.showLoading();

			const url = `/api/reports/statistics/comprehensive?start_date=${filters.start_date}&end_date=${filters.end_date}&grouping=${filters.grouping}`;

			const data = await this.fetchStatistics(url);

			this.currentStatistics = data;

			this.displayStatistics();
			this.showSuccess("Statistics loaded successfully");
		} catch (error: any) {
			console.error("Error loading statistics:", error);
			this.showError(error.message || "Failed to load statistics");
		} finally {
			this.hideLoading();
		}
	}

	private async fetchStatistics(url: string): Promise<any> {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${localStorage.getItem("token")}`
			}
		});

		if (!response.ok) throw new Error(`Failed to fetch from ${url}`);
		return await response.json();
	}

	private displayStatistics(): void {
		if (!this.currentStatistics) return;

		const stats = this.currentStatistics.patient_statistics;
		const revenue = this.currentStatistics.revenue_trends;

		// Update summary cards
		document.getElementById("statTotalPatients")!.textContent =
			stats.total_patients.toString();
		document.getElementById("statAvgStay")!.textContent =
			stats.avg_stay_duration.toFixed(1);

		// Calculate total revenue
		const totalRevenue = revenue.reduce(
			(sum: number, r: any) => sum + r.total_revenue,
			0
		);
		document.getElementById("statTotalRevenue")!.textContent =
			this.formatCurrency(totalRevenue);

		// Render all charts
		this.renderPatientTrendsChart();
		this.renderDistributionChart("payment");
		this.renderAverageStayChart();
		this.renderRevenueChart();
		this.renderAdmissionDischargeChart();
		this.renderTopServicesChart();
		this.renderTopDrugsChart();
		this.renderStaffUtilizationChart();
	}

	private renderPatientTrendsChart(): void {
		const canvas = document.getElementById(
			"patientTrendsChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		if (this.patientTrendsChart) {
			this.patientTrendsChart.destroy();
		}

		const data = this.currentStatistics.patient_statistics.time_grouped;

		//@ts-ignore
		this.patientTrendsChart = new Chart(canvas, {
			type: "line",
			data: {
				labels: data.map((d: any) => d.period),
				datasets: [
					{
						label: "Patients in Hospital",
						data: data.map((d: any) => d.count),
						backgroundColor: "rgba(13, 110, 253, 0.2)",
						borderColor: "rgba(13, 110, 253, 1)",
						borderWidth: 2,
						fill: true,
						tension: 0.4,
						pointRadius: 4,
						pointHoverRadius: 6,
						pointBackgroundColor: "rgba(13, 110, 253, 1)",
						pointBorderColor: "#fff",
						pointBorderWidth: 2
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "top"
					},
					tooltip: {
						mode: "index",
						intersect: false,
						callbacks: {
							title: function (context: any) {
								return `Period: ${context[0].label}`;
							},
							label: function (context: any) {
								return `Patients in hospital: ${context.parsed.y}`;
							},
							afterLabel: function (context: any) {
								const dataPoint = data[context.dataIndex];
								if (dataPoint.total_amount > 0) {
									return `Revenue: ${new Intl.NumberFormat(
										"en-US",
										{
											style: "currency",
											currency: "USD"
										}
									).format(dataPoint.total_amount)}`;
								}
								return "";
							}
						}
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							precision: 0,
							callback: function (value: any) {
								return value + " patients";
							}
						},
						title: {
							display: true,
							text: "Number of Patients"
						}
					},
					x: {
						ticks: {
							maxRotation: 45,
							minRotation: 45
						},
						title: {
							display: true,
							text: "Time Period"
						}
					}
				}
			}
		});
	}

	private renderDistributionChart(type: "payment" | "gender"): void {
		const canvas = document.getElementById(
			"distributionChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		// Destroy existing chart
		if (this.distributionChart) {
			this.distributionChart.destroy();
		}

		let labels: string[];
		let data: number[];
		let colors: string[];
		let borderColors: string[];
		let title: string;

		if (type === "payment") {
			const paymentData =
				this.currentStatistics.patient_statistics.by_payment_type;
			labels = ["Cash", "Credit", "Insurance"];
			data = [
				paymentData.cash || 0,
				paymentData.credit || 0,
				paymentData.insurance || 0
			];
			colors = [
				"rgba(40, 167, 69, 0.7)", // Green for cash
				"rgba(255, 193, 7, 0.7)", // Yellow for credit
				"rgba(13, 110, 253, 0.7)" // Blue for insurance
			];
			borderColors = [
				"rgba(40, 167, 69, 1)",
				"rgba(255, 193, 7, 1)",
				"rgba(13, 110, 253, 1)"
			];
			title = "Patients by Payment Type";
		} else {
			const genderData =
				this.currentStatistics.patient_statistics.by_gender;
			labels = ["Male", "Female", "Other"];
			data = [
				genderData.male || 0,
				genderData.female || 0,
				genderData.other || 0
			];
			colors = [
				"rgba(13, 110, 253, 0.7)", // Blue for male
				"rgba(220, 53, 69, 0.7)", // Pink/Red for female
				"rgba(108, 117, 125, 0.7)" // Gray for other
			];
			borderColors = [
				"rgba(13, 110, 253, 1)",
				"rgba(220, 53, 69, 1)",
				"rgba(108, 117, 125, 1)"
			];
			title = "Patients by Gender";
		}

		// Calculate total for percentages
		const total = data.reduce((sum, value) => sum + value, 0);

		//@ts-ignore
		this.distributionChart = new Chart(canvas, {
			type: "pie",
			data: {
				labels: labels,
				datasets: [
					{
						data: data,
						backgroundColor: colors,
						borderColor: borderColors,
						borderWidth: 2,
						hoverOffset: 10,
						hoverBorderWidth: 3
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "bottom",
						labels: {
							padding: 15,
							font: {
								size: 12,
								weight: "500"
							},
							generateLabels: function (chart: any) {
								const data = chart.data;
								if (
									data.labels.length &&
									data.datasets.length
								) {
									return data.labels.map(
										(label: string, i: number) => {
											const value =
												data.datasets[0].data[i];
											const percentage =
												total > 0
													? (
															(value / total) *
															100
													  ).toFixed(1)
													: "0.0";
											return {
												text: `${label}: ${value} (${percentage}%)`,
												fillStyle:
													data.datasets[0]
														.backgroundColor[i],
												strokeStyle:
													data.datasets[0]
														.borderColor[i],
												lineWidth: 2,
												hidden: false,
												index: i
											};
										}
									);
								}
								return [];
							}
						}
					},
					title: {
						display: true,
						text: title,
						font: {
							size: 14,
							weight: "bold"
						},
						padding: {
							top: 10,
							bottom: 20
						}
					},
					tooltip: {
						backgroundColor: "rgba(0, 0, 0, 0.8)",
						padding: 12,
						titleFont: {
							size: 14,
							weight: "bold"
						},
						bodyFont: {
							size: 13
						},
						callbacks: {
							title: function (context: any) {
								return context[0].label;
							},
							label: function (context: any) {
								const value = context.parsed;
								const percentage =
									total > 0
										? ((value / total) * 100).toFixed(1)
										: "0.0";
								return [
									`Count: ${value} patients`,
									`Percentage: ${percentage}%`
								];
							},
							afterLabel: function (context: any) {
								// Add additional context
								if (total > 0) {
									const value = context.parsed;
									const remaining = total - value;
									return `Remaining: ${remaining} patients`;
								}
								return "";
							}
						}
					}
				},
				animation: {
					animateRotate: true,
					animateScale: true
				}
			}
		});
	}

	/**
	 * Render average stay chart
	 */
	private renderAverageStayChart(): void {
		const canvas = document.getElementById(
			"avgStayChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		if (this.avgStayChart) {
			this.avgStayChart.destroy();
		}

		const data = this.currentStatistics.average_stay;

		//@ts-ignore
		this.avgStayChart = new Chart(canvas, {
			type: "line",
			data: {
				labels: data.map((d: any) => d.period),
				datasets: [
					{
						label: "Average Stay (Days)",
						data: data.map((d: any) => d.avg_stay_days),
						backgroundColor: "rgba(40, 167, 69, 0.2)",
						borderColor: "rgba(40, 167, 69, 1)",
						borderWidth: 2,
						fill: true,
						tension: 0.4
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "top"
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								return `Avg Stay: ${context.parsed.y.toFixed(
									2
								)} days`;
							}
						}
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							callback: function (value: any) {
								return value.toFixed(1) + " days";
							}
						}
					},
					x: {
						ticks: {
							maxRotation: 45,
							minRotation: 45
						}
					}
				}
			}
		});
	}

	/**
	 * Render revenue chart
	 */
	private renderRevenueChart(): void {
		const canvas = document.getElementById(
			"revenueChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		if (this.revenueChart) {
			this.revenueChart.destroy();
		}

		const data = this.currentStatistics.revenue_trends;

		//@ts-ignore
		this.revenueChart = new Chart(canvas, {
			type: "bar",
			data: {
				labels: data.map((d: any) => d.period),
				datasets: [
					{
						label: "Total Revenue",
						data: data.map((d: any) => d.total_revenue),
						backgroundColor: "rgba(40, 167, 69, 0.7)",
						borderColor: "rgba(40, 167, 69, 1)",
						borderWidth: 1
					},
					{
						label: "Collected",
						data: data.map((d: any) => d.collected_revenue),
						backgroundColor: "rgba(13, 110, 253, 0.7)",
						borderColor: "rgba(13, 110, 253, 1)",
						borderWidth: 1
					},
					{
						label: "Outstanding",
						data: data.map((d: any) => d.outstanding_revenue),
						backgroundColor: "rgba(255, 193, 7, 0.7)",
						borderColor: "rgba(255, 193, 7, 1)",
						borderWidth: 1
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "top"
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								return (
									context.dataset.label +
									": " +
									new Intl.NumberFormat("en-US", {
										style: "currency",
										currency: "USD"
									}).format(context.parsed.y)
								);
							}
						}
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							callback: function (value: any) {
								return "$" + value.toLocaleString();
							}
						}
					},
					x: {
						ticks: {
							maxRotation: 45,
							minRotation: 45
						}
					}
				}
			}
		});
	}

	/**
	 * Render admission vs discharge chart
	 */
	private renderAdmissionDischargeChart(): void {
		const canvas = document.getElementById(
			"admissionDischargeChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		if (this.admissionDischargeChart) {
			this.admissionDischargeChart.destroy();
		}

		const data = this.currentStatistics.admission_discharge;

		//@ts-ignore
		this.admissionDischargeChart = new Chart(canvas, {
			type: "line",
			data: {
				labels: data.map((d: any) => d.period),
				datasets: [
					{
						label: "Admissions",
						data: data.map((d: any) => d.admissions),
						backgroundColor: "rgba(13, 110, 253, 0.2)",
						borderColor: "rgba(13, 110, 253, 1)",
						borderWidth: 2,
						fill: true,
						tension: 0.4
					},
					{
						label: "Discharges",
						data: data.map((d: any) => d.discharges),
						backgroundColor: "rgba(40, 167, 69, 0.2)",
						borderColor: "rgba(40, 167, 69, 1)",
						borderWidth: 2,
						fill: true,
						tension: 0.4
					},
					{
						label: "Net Change",
						data: data.map((d: any) => d.net_change),
						backgroundColor: "rgba(255, 193, 7, 0.2)",
						borderColor: "rgba(255, 193, 7, 1)",
						borderWidth: 2,
						fill: false,
						tension: 0.4,
						borderDash: [5, 5]
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "top"
					},
					tooltip: {
						mode: "index",
						intersect: false
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							precision: 0
						}
					},
					x: {
						ticks: {
							maxRotation: 45,
							minRotation: 45
						}
					}
				}
			}
		});
	}

	/**
	 * Render top services chart
	 */
	private renderTopServicesChart(): void {
		const canvas = document.getElementById(
			"topServicesChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		if (this.topServicesChart) {
			this.topServicesChart.destroy();
		}

		const data = this.currentStatistics.top_services;

		//@ts-ignore
		this.topServicesChart = new Chart(canvas, {
			type: "bar",
			data: {
				labels: data.map((d: any) => d.service_name),
				datasets: [
					{
						label: "Revenue",
						data: data.map((d: any) => d.total_revenue),
						backgroundColor: "rgba(111, 66, 193, 0.7)",
						borderColor: "rgba(111, 66, 193, 1)",
						borderWidth: 1
					}
				]
			},
			options: {
				indexAxis: "y",
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								return (
									"Revenue: " +
									new Intl.NumberFormat("en-US", {
										style: "currency",
										currency: "USD"
									}).format(context.parsed.x)
								);
							},
							afterLabel: function (context: any) {
								const service = data[context.dataIndex];
								return [
									`Usage Count: ${service.usage_count}`,
									`Quantity: ${service.total_quantity}`,
									`Type: ${service.service_type}`
								];
							}
						}
					}
				},
				scales: {
					x: {
						beginAtZero: true,
						ticks: {
							callback: function (value: any) {
								return "$" + value.toLocaleString();
							}
						}
					}
				}
			}
		});
	}

	/**
	 * Render top drugs chart
	 */
	private renderTopDrugsChart(): void {
		const canvas = document.getElementById(
			"topDrugsChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		if (this.topDrugsChart) {
			this.topDrugsChart.destroy();
		}

		const data = this.currentStatistics.top_drugs;

		//@ts-ignore
		this.topDrugsChart = new Chart(canvas, {
			type: "bar",
			data: {
				labels: data.map((d: any) => d.drug_name),
				datasets: [
					{
						label: "Revenue",
						data: data.map((d: any) => d.total_revenue),
						backgroundColor: "rgba(253, 126, 20, 0.7)",
						borderColor: "rgba(253, 126, 20, 1)",
						borderWidth: 1
					}
				]
			},
			options: {
				indexAxis: "y",
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								return (
									"Revenue: " +
									new Intl.NumberFormat("en-US", {
										style: "currency",
										currency: "USD"
									}).format(context.parsed.x)
								);
							},
							afterLabel: function (context: any) {
								const drug = data[context.dataIndex];
								return [
									`Usage Count: ${drug.usage_count}`,
									`Quantity: ${drug.total_quantity}`,
									`Manufacturer: ${
										drug.manufacturer || "N/A"
									}`
								];
							}
						}
					}
				},
				scales: {
					x: {
						beginAtZero: true,
						ticks: {
							callback: function (value: any) {
								return "$" + value.toLocaleString();
							}
						}
					}
				}
			}
		});
	}

	/**
	 * Render staff utilization chart
	 */
	private renderStaffUtilizationChart(): void {
		const canvas = document.getElementById(
			"staffUtilizationChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		if (this.staffUtilizationChart) {
			this.staffUtilizationChart.destroy();
		}

		const data = this.currentStatistics.staff_utilization;

		//@ts-ignore
		this.staffUtilizationChart = new Chart(canvas, {
			type: "bar",
			data: {
				labels: data.map((d: any) => d.employee_type.toUpperCase()),
				datasets: [
					{
						label: "Staff Count",
						data: data.map((d: any) => d.staff_count),
						backgroundColor: "rgba(13, 110, 253, 0.7)",
						borderColor: "rgba(13, 110, 253, 1)",
						borderWidth: 1,
						yAxisID: "y"
					},
					{
						label: "Patients Served",
						data: data.map((d: any) => d.patients_served),
						backgroundColor: "rgba(40, 167, 69, 0.7)",
						borderColor: "rgba(40, 167, 69, 1)",
						borderWidth: 1,
						yAxisID: "y"
					},
					{
						label: "Total Hours Worked",
						data: data.map((d: any) => d.total_hours_worked),
						backgroundColor: "rgba(255, 193, 7, 0.7)",
						borderColor: "rgba(255, 193, 7, 1)",
						borderWidth: 1,
						yAxisID: "y1"
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "top"
					},
					tooltip: {
						callbacks: {
							afterLabel: function (context: any) {
								const staff = data[context.datasetIndex];
								if (context.datasetIndex === 0) {
									return `Avg Patients/Staff: ${
										staff.avg_patients_per_staff?.toFixed(
											2
										) || "N/A"
									}`;
								} else if (context.datasetIndex === 2) {
									return `Avg Hours/Assignment: ${
										staff.avg_hours_per_assignment?.toFixed(
											2
										) || "N/A"
									}`;
								}
								return "";
							}
						}
					}
				},
				scales: {
					y: {
						type: "linear",
						display: true,
						position: "left",
						beginAtZero: true,
						ticks: {
							precision: 0
						},
						title: {
							display: true,
							text: "Count"
						}
					},
					y1: {
						type: "linear",
						display: true,
						position: "right",
						beginAtZero: true,
						grid: {
							drawOnChartArea: false
						},
						title: {
							display: true,
							text: "Hours"
						}
					}
				}
			}
		});
	}

	/**
	 * Destroy all charts on cleanup
	 */
	private destroyAllCharts(): void {
		const charts = [
			this.patientTrendsChart,
			this.distributionChart,
			this.doctorPerformanceChart,
			this.avgStayChart,
			this.revenueChart,
			this.admissionDischargeChart,
			this.topServicesChart,
			this.topDrugsChart,
			this.staffUtilizationChart,
			this.paymentTimelineChart,
			this.paymentTypeChart
		];

		charts.forEach((chart) => {
			if (chart) {
				try {
					chart.destroy();
				} catch (error) {
					console.error("Error destroying chart:", error);
				}
			}
		});
	}

	private switchDistributionChart(type: "payment" | "gender"): void {
		if (this.currentStatistics) {
			this.renderDistributionChart(type);
		}
	}

	/**private renderDoctorPerformanceChart(): void {
		const canvas = document.getElementById(
			"doctorPerformanceChart"
		) as HTMLCanvasElement;
		if (!canvas) return;

		// Destroy existing chart
		if (this.doctorPerformanceChart) {
			this.doctorPerformanceChart.destroy();
		}

		const chartData = this.currentStatistics.doctors.chartData;

		//@ts-ignore
		this.doctorPerformanceChart = new Chart(canvas, {
			type: "bar",
			data: chartData,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: "top"
					}
				},
				scales: {
					y: {
						beginAtZero: true
					}
				}
			}
		});
	}*/

	// ==================== EMPLOYEE PAYMENT REPORTS ====================

	private async loadEmployeePaymentReport(): Promise<void> {
		const filters = this.getReportFilters();

		if (!filters.start_date || !filters.end_date) {
			this.showError("Please select both start and end dates");
			return;
		}

		const employeeType = (
			document.getElementById("employeeType") as HTMLSelectElement
		).value;
		const employeeId = (
			document.getElementById("employeeSelect") as HTMLSelectElement
		).value;

		try {
			await this.showLoading();

			let url = `/api/reports/employees/payments/chart?start_date=${filters.start_date}&end_date=${filters.end_date}`;

			if (employeeType !== "all") {
				url += `&employee_type=${employeeType}`;
			}

			if (employeeId) {
				url += `&employee_id=${employeeId}`;
			}

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok)
				throw new Error("Failed to fetch employee payment report");

			const data = await response.json();
			this.currentReportData = data;
			this.currentReportType = "employee-payments";

			this.displayEmployeePaymentReport(data.data);
			this.displayEmployeePaymentReport(data.data);
			this.renderEmployeePaymentCharts(
				data.timeChartData,
				data.typeChartData
			);
			this.enablePrintButton("printEmployeePaymentReportBtn");

			this.showSuccess("Employee payment report generated successfully");
		} catch (error: any) {
			console.error("Error loading employee payment report:", error);
			this.showError(
				error.message || "Failed to load employee payment report"
			);
		} finally {
			this.hideLoading();
		}
	}

	private displayEmployeePaymentReport(employees: any[]): void {
		const container = document.getElementById("employeePaymentContent");
		if (!container) return;

		if (employees.length === 0) {
			container.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-inbox" style="font-size: 3rem; color: #6c757d;"></i>
                    <h5 class="mt-3 text-muted">No Data Found</h5>
                    <p class="text-muted">No employee payments found for the selected criteria</p>
                </div>
            `;
			return;
		}

		const totalPayments = employees.reduce(
			(sum, e) => sum + e.payment_summary.total_payments,
			0
		);
		const totalPaid = employees.reduce(
			(sum, e) => sum + e.payment_summary.total_paid,
			0
		);
		const totalUnpaid = employees.reduce(
			(sum, e) => sum + e.payment_summary.total_unpaid,
			0
		);

		container.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-md-3">
                    <div class="summary-card border-start-primary">
                        <h6>Total Employees</h6>
                        <div class="value">${employees.length}</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="summary-card border-start-info">
                        <h6>Total Payments</h6>
                        <div class="value">${totalPayments}</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="summary-card border-start-success">
                        <h6>Total Paid</h6>
                        <div class="value text-success">${this.formatCurrency(
							totalPaid
						)}</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="summary-card border-start-warning">
                        <h6>Total Unpaid</h6>
                        <div class="value text-warning">${this.formatCurrency(
							totalUnpaid
						)}</div>
                    </div>
                </div>
            </div>
            ${employees
				.map((employee) => this.renderEmployeePaymentCard(employee))
				.join("")}
        `;
	}

	private renderEmployeePaymentCard(employee: any): string {
		const summary = employee.payment_summary;

		return `
            <div class="card mb-3">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h5 class="mb-0">${this.escapeHtml(
								employee.employee_name
							)}</h5>
                            <small class="text-muted">${employee.employee_type.toUpperCase()} | Hired: ${this.formatDate(
			employee.hire_date
		)}</small>
                        </div>
                        <div class="text-end">
                            <h6 class="mb-0">Total: ${this.formatCurrency(
								summary.total_base_pay + summary.total_extra_pay
							)}</h6>
                            <small class="text-muted">${
								summary.total_payments
							} payments</small>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row g-3 mb-3">
                        <div class="col-md-3">
                            <small class="text-muted">Base Pay</small>
                            <div class="fw-bold">${this.formatCurrency(
								summary.total_base_pay
							)}</div>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Extra Pay</small>
                            <div class="fw-bold">${this.formatCurrency(
								summary.total_extra_pay
							)}</div>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Paid</small>
                            <div class="fw-bold text-success">${this.formatCurrency(
								summary.total_paid
							)}</div>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted">Unpaid</small>
                            <div class="fw-bold text-warning">${this.formatCurrency(
								summary.total_unpaid
							)}</div>
                        </div>
                    </div>
                    ${
						employee.payment_details &&
						employee.payment_details.length > 0
							? `
                        <div class="mt-3">
                            <h6 class="mb-3">Payment Details</h6>
                            ${employee.payment_details
								.map((payment: any) =>
									this.renderPaymentDetail(payment)
								)
								.join("")}
                        </div>
                    `
							: '<p class="text-muted">No payment details available</p>'
					}
                </div>
            </div>
        `;
	}

	private renderPaymentDetail(payment: any): string {
		return `
            <div class="payment-detail-card">
                <div class="payment-header">
                    <div class="payment-date">
                        <i class="bi bi-calendar3 me-2"></i>
                        ${this.formatDateTime(payment.payment_date)}
                    </div>
                    <div>
                        <span class="payment-amount">${this.formatCurrency(
							payment.payment_amount + payment.extra_amount
						)}</span>
                        <span class="status-badge badge-${
							payment.is_paid ? "paid" : "unpaid"
						} ms-2">
                            ${payment.is_paid ? "PAID" : "UNPAID"}
                        </span>
                    </div>
                </div>
                <div class="payment-meta">
                    <div><strong>Type:</strong> ${payment.payment_type}</div>
                    ${
						payment.extra_payment_type !== "none"
							? `<div><strong>Extra Type:</strong> ${payment.extra_payment_type}</div>`
							: ""
					}
                    <div><strong>Base:</strong> ${this.formatCurrency(
						payment.payment_amount
					)}</div>
                    ${
						payment.extra_amount > 0
							? `<div><strong>Extra:</strong> ${this.formatCurrency(
									payment.extra_amount
							  )}</div>`
							: ""
					}
                    ${
						payment.is_paid && payment.paid_timestamp
							? `<div><strong>Paid:</strong> ${this.formatDateTime(
									payment.paid_timestamp
							  )}</div>`
							: ""
					}
                    ${
						payment.is_paid && payment.paid_by
							? `<div><strong>Paid By:</strong> ${this.escapeHtml(
									payment.paid_by
							  )}</div>`
							: ""
					}
                </div>
                ${
					payment.patient_associations &&
					payment.patient_associations.length > 0
						? `
                    <div class="mt-2">
                        <small class="text-muted">Patient Associations:</small>
                        ${payment.patient_associations
							.map(
								(assoc: any) => `
                            <div class="patient-association">
                                <strong>${this.escapeHtml(
									assoc.patient_name
								)}</strong> - 
                                ${this.formatDate(assoc.work_date)} - 
                                ${assoc.hours_worked}h - 
                                ${this.formatCurrency(assoc.payment_amount)}
                            </div>
                        `
							)
							.join("")}
                    </div>
                `
						: ""
				}
            </div>
        `;
	}

	private renderEmployeePaymentCharts(
		timeChartData: any,
		typeChartData: any
	): void {
		// Timeline Chart
		const timelineCanvas = document.getElementById(
			"paymentTimelineChart"
		) as HTMLCanvasElement;
		if (timelineCanvas) {
			if (this.paymentTimelineChart) {
				this.paymentTimelineChart.destroy();
			}

			//@ts-ignore
			this.paymentTimelineChart = new Chart(timelineCanvas, {
				type: "line",
				data: timeChartData,
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							display: true,
							position: "top"
						}
					},
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								callback: (value: number) =>
									this.formatCurrency(value as number)
							}
						}
					}
				}
			});
		}

		// Type Distribution Chart
		const typeCanvas = document.getElementById(
			"paymentTypeChart"
		) as HTMLCanvasElement;
		if (typeCanvas) {
			if (this.paymentTypeChart) {
				this.paymentTypeChart.destroy();
			}

			//@ts-ignore
			this.paymentTypeChart = new Chart(typeCanvas, {
				type: "doughnut",
				data: typeChartData,
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							display: true,
							position: "bottom"
						}
					}
				}
			});
		}
	}

	private async printEmployeePaymentReport(): Promise<void> {
		if (!this.currentReportData) {
			this.showError("No report data to print");
			return;
		}

		try {
			const filters = this.getReportFilters();
			const reportTitle = `Employee Payment Report (${this.formatDate(
				filters.start_date
			)} - ${this.formatDate(filters.end_date)})`;

			const employees = this.currentReportData.data;

			const pdf = createCustomReport(
				reportTitle,
				[
					{
						type: "header",
						title: `Total Employees: ${employees.length}`
					},
					{
						type: "table",
						fields: [
							{
								key: "employee_name",
								label: "Employee Name",
								type: "text"
							},
							{
								key: "employee_type",
								label: "Type",
								type: "text"
							},
							{
								key: "payment_summary.total_payments",
								label: "Total Payments",
								type: "number"
							},
							{
								key: "payment_summary.total_paid",
								label: "Total Paid",
								type: "currency"
							},
							{
								key: "payment_summary.total_unpaid",
								label: "Total Unpaid",
								type: "currency"
							}
						]
					}
				],
				{ data: employees }
			);

			pdf.open();
			this.showSuccess("Report generated successfully");
		} catch (error) {
			console.error("Error printing employee payment report:", error);
			this.showError("Failed to generate report");
		}
	}

	// ==================== HELPER METHODS ====================

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

	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	private capitalizeFirst(str: string): string {
		if (!str) return "";
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	}

	private showLoading(): Promise<void> {
		return new Promise((resolve, reject) => {
			const modalElement = document.getElementById("loadingModal");
			if (!modalElement) {
				console.error("Loading modal element not found in DOM");
				reject(new Error("Loading modal element not found"));
				return;
			}

			// Listen for the shown.bs.modal event to confirm the modal is visible
			const onShown = () => {
				modalElement.removeEventListener("shown.bs.modal", onShown);
				resolve();
			};

			modalElement.addEventListener("shown.bs.modal", onShown);
			try {
				this.loadingModal.show();
			} catch (error) {
				modalElement.removeEventListener("shown.bs.modal", onShown);
				console.error("Error showing loading modal:", error);
				reject(error);
			}
		});
	}

	private hideLoading(): void {
		this.loadingModal.hide();
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
		reportsManager: ReportsManager;
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

// Initialize the reports manager
(window.reportsManager as ReportsManager) = new ReportsManager();
