//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { PrintBillManager } from "./printBillManager.js";
import { i18n } from "../utils/i18n.js";

interface Patient {
	patient_id: number;
	name: string;
	national_id: string;
	gender: "male" | "female" | "other";
	phone: string | null;
	address: string | null;
	payment_type: "cash" | "credit" | "insurance";
	insurance_id: number | null;
	insurance_card_id: string | null;
	insurance_form_id: string | null;
	guardian_info: {
		name: string;
		phone: string;
		national_id?: string;
		address: string;
		kinship: string;
	} | null;
	quick_check: boolean;
	is_active: boolean;
	registration_date: Date;
	referring_doctor_id: number | null;
	insurance_company_name?: string;
	created_by_user_id: number;
}

interface PatientHistory {
	patient_history_id: number;
	patient_id: number;
	bill_id: number | null;
	diagnosis: string | null;
	admission_time: Date;
	discharge_time: Date | null;
	attending_doctors?: string[];
	attending_doctor_ids?: number[];
	attending_nurses?: string[];
	attending_nurse_ids?: number[];
	total_amount?: number;
	paid_amount?: number;
	pricelist_id: number | null;
	quick_check: boolean;
}

interface Doctor {
	employee_id: number;
	name: string;
	doctor_type: string;
	is_active: boolean;
}

interface Nurse {
	employee_id: number;
	name: string;
	phone: string | null;
	hire_date: Date;
}

interface Service {
	service_id: number;
	auto_renew: boolean;
	name: string;
	service_type: "once" | "hourly" | "daily";
	price: number;
}

interface Drug {
	drug_id: number;
	name: string;
	manufacturer: string | null;
	unit_conversion: {
		larger: string;
		smaller: string;
		ratio: number;
	};
	available_quantity: number;
	price: number;
}

interface InsuranceCompany {
	insurance_id: number;
	contact_info: string | null;
	pricelist_id: number | null;
	pricelist_name: string | null;
	name: string;
}

interface PriceList {
	pricelist_id: number;
	name: string;
}

interface DrugPrice {
	pricelist_name: string;
	pricelist_id: number;
	price: number;
	requires_prepayment: boolean;
	prepayment_type: string;
}

interface PriceList {
	pricelist_id: number;
	name: string;
	is_default: boolean;
	rounding_rule: string;
}

interface BillDetail {
	bill_id: number;
	bill_detail_id: number;
	service_id: number | null;
	service_name: string | null;
	drug_shipment_id: number | null;
	drug_name: string | null;
	medical_supply_shipment_id: number | null;
	medical_supply_name: string | null;
	supply_id: number | null;
	quantity: number;
	unit_price: number;
	charge_type: string;
	sale_type: string;
	generated_at: Date;
}

interface MedicalSupply {
	supply_id: number;
	name: string;
	manufacturer: string | null;
	provider: string | null;
	is_obligatory_continuous: boolean;
	sale_quantity: number;
	frequency: { minutes: number } | null;
	min_stock_alert: number | null;
}

interface Bill {
	bill_id: number;
	patient_id: number;
	total_amount: number;
	paid_amount: number;
	medical_tests_amount: number;
	discount_type: "fixed" | "percentage" | null;
	discount: number;
	administrative_expenses: number;
	vat_percentage: number | null;
	vat_scope: "services" | "drugs" | "both" | null;
	discount_scope?: string[];
	vat_scope_custom?: string[];
	bill_details: BillDetail[];
	issued_by_user_id: number;
	generated_at: Date;
	updated_at: Date;
}

interface ClockedInEmployee {
	clock_id: number;
	employee_id: number;
	name: string;
	employee_type: "doctor" | "nurse" | "other";
	clock_in: Date;
	clock_out: Date | null;
	shift_start_time: string | null;
	shift_end_time: string | null;
	doctor_type?: string;
}

interface CurrentAdmission {
	patient_id: number;
	patient_name: string;
	patient_history_id: number;
	diagnosis: string | null;
	admission_time: Date;
	quick_check: boolean;
	attending_doctor_ids: number[];
	attending_doctors: string[];
	doctor_types: string;
	attending_nurse_ids: number[];
	attending_nurses: string[];
}

interface StaffAssignment {
	patient_id: number;
	patient_name: string;
	assigned_at: Date;
	admission_time: Date;
	diagnosis: string | null;
}

class PatientManager {
	//@ts-ignore
	private patientModal: Modal;
	//@ts-ignore
	private addServiceModal: Modal;
	//@ts-ignore
	private addDrugModal: Modal;
	//@ts-ignore
	private dischargeModal: Modal;
	//@ts-ignore
	private pastAdmissionsModal: Modal;
	//@ts-ignore
	private admissionDetailsModal: Modal;
	//@ts-ignore
	private editStaffAssignmentModal: Modal;
	//@ts-ignore
	private settleBillModal: Modal;
	//@ts-ignore
	private addSupplyModal: Modal;
	//@ts-ignore
	private viewItemDetailsModal: Modal;

	private currentPatient: Patient | null = null;
	private currentAdmission: PatientHistory | null = null;
	private currentBill: Bill | null = null;
	private currentEditingPatient: CurrentAdmission | null = null;
	private doctors: Doctor[] = [];
	private nurses: Nurse[] = [];
	private insuranceCompanies: InsuranceCompany[] = [];
	private priceLists: PriceList[] = [];
	private availableServices: Service[] = [];
	private availableDrugs: Drug[] = [];
	private assignedServices: any[] = [];
	private assignedDrugs: any[] = [];
	private assignedSupplies: any[] = [];
	private availableSupplies: MedicalSupply[] = [];
	private servicePrices: Map<number, number> = new Map();
	private clockedInStaff: ClockedInEmployee[] = [];
	private staffAssignments: Map<number, StaffAssignment[]> = new Map();
	private staffStatusInterval: NodeJS.Timeout | null = null;
	private currentSettlementBill: Bill | null = null;

	private searchTimeout: NodeJS.Timeout | null = null;
	private allPatients: Patient[] = [];

	private currentAdmissionDetails: any = null;

	private printBillManager: PrintBillManager | null = null;

	constructor() {
		// Initialize modals
		//@ts-ignore
		this.patientModal = new bootstrap.Modal(
			document.getElementById("patientModal")!
		);
		//@ts-ignore
		this.addServiceModal = new bootstrap.Modal(
			document.getElementById("addServiceModal")!
		);
		//@ts-ignore
		this.addDrugModal = new bootstrap.Modal(
			document.getElementById("addDrugModal")!
		);
		//@ts-ignore
		this.dischargeModal = new bootstrap.Modal(
			document.getElementById("dischargeModal")!
		);

		//@ts-ignore
		this.printCustomizationModal = new bootstrap.Modal(
			document.getElementById("printCustomizationModal")!
		);
		//@ts-ignore
		this.addItemToPrintModal = new bootstrap.Modal(
			document.getElementById("addItemToPrintModal")!
		);
		// In the constructor, initialize the new modals:
		//@ts-ignore
		this.pastAdmissionsModal = new bootstrap.Modal(
			document.getElementById("pastAdmissionsModal")!
		);
		//@ts-ignore
		this.admissionDetailsModal = new bootstrap.Modal(
			document.getElementById("admissionDetailsModal")!
		);

		//@ts-ignore
		this.editStaffAssignmentModal = new bootstrap.Modal(
			document.getElementById("editStaffAssignmentModal")!
		);

		//@ts-ignore
		this.settleBillModal = new bootstrap.Modal(
			document.getElementById("settleBillModal")!
		);

		//@ts-ignore
		this.addSupplyModal = new bootstrap.Modal(
			document.getElementById("addSupplyModal")!
		);

		//@ts-ignore
		this.viewItemDetailsModal = new bootstrap.Modal(
			document.getElementById("viewItemDetailsModal")!
		);

		this.waitForI18n().then(() => {
			// Initialize sidebar
			new SidebarManager();

			this.initializeEventListeners();
			this.loadInitialData();
			this.loadAllPatients();

			window.addEventListener("localeChanged", () => {
				this.handleLocaleChange();
			});

			window.addEventListener("beforeunload", () => {
				if (this.staffStatusInterval) {
					clearInterval(this.staffStatusInterval);
				}
			});
		});
	}

	private async waitForI18n(): Promise<void> {
		if (i18n) {
			await i18n.init();
		}
	}

	private handleLocaleChange(): void {
		// Reload patient list if displayed
		if (this.allPatients.length > 0) {
			this.displayPatientList(this.allPatients);
		}

		// Reload current patient display if a patient is selected
		if (this.currentPatient) {
			this.updatePatientDisplay();
			this.updateBillingDisplay();
		}
	}

	private initializeEventListeners(): void {
		// Patient search
		const searchInput = document.getElementById(
			"patientSearch"
		) as HTMLInputElement;
		searchInput.addEventListener("input", (e) => {
			const searchTerm = (e.target as HTMLInputElement).value;
			this.handlePatientSearch(searchTerm);
		});

		// Create patient button
		document
			.getElementById("createPatientBtn")
			?.addEventListener("click", () => {
				this.showPatientModal();
			});

		// Patient action buttons
		document
			.getElementById("editPatientBtn")
			?.addEventListener("click", () => {
				if (this.currentPatient) {
					this.showPatientModal(this.currentPatient.patient_id);
				}
			});

		document
			.getElementById("admitPatientBtn")
			?.addEventListener("click", () => {
				this.showAdmitPatientModal();
			});

		document
			.getElementById("dischargePatientBtn")
			?.addEventListener("click", () => {
				this.showDischargeModal();
			});

		document
			.getElementById("printBillBtn")
			?.addEventListener("click", () => {
				this.printBill();
			});

		// Service and drug buttons
		document
			.getElementById("addServiceBtn")
			?.addEventListener("click", () => {
				this.showAddServiceModal();
			});

		document.getElementById("addDrugBtn")?.addEventListener("click", () => {
			this.showAddDrugModal();
		});

		document.getElementById("addSupplyBtn")?.addEventListener("click", () => {
			this.showAddSupplyModal();
		});

		document.getElementById("addPrintSupplyBtn")?.addEventListener("click", () => {
			this.showAddSupplyModal();
		});

		// Supply search
		const supplySearchInput = document.getElementById(
			"supplySearch"
		) as HTMLInputElement;
		supplySearchInput?.addEventListener("input", (e) => {
			const searchTerm = (e.target as HTMLInputElement).value;
			this.handleSupplySearch(searchTerm);
		});

		// Billing calculations
		document.getElementById("discount")?.addEventListener("input", () => {
			this.calculateBilling();
		});

		document
			.getElementById("discountType")
			?.addEventListener("change", () => {
				this.calculateBilling();
			});

		document
			.getElementById("vatPercentage")
			?.addEventListener("input", () => {
				this.calculateBilling();
			});

		document.getElementById("vatScope")?.addEventListener("change", () => {
			this.calculateBilling();
		});

		// Scope checkboxes listeners
		document.querySelectorAll('.discount-scope').forEach(checkbox => {
			checkbox.addEventListener('change', () => this.calculateBilling());
		});

		document.querySelectorAll('.vat-scope').forEach(checkbox => {
			checkbox.addEventListener('change', () => this.calculateBilling());
		});

		document
			.getElementById("administrativeExpenses")
			?.addEventListener("input", () => {
				this.calculateBilling();
			});

		document
			.getElementById("updateBillingBtn")
			?.addEventListener("click", () => {
				this.updateBilling();
			});

		document
			.getElementById("confirmPaymentBtn")
			?.addEventListener("click", () => {
				this.confirmPayment();
			});

		// Modal form submissions
		document
			.getElementById("savePatientBtn")
			?.addEventListener("click", () => {
				this.savePatient();
			});

		document
			.getElementById("confirmDischargeBtn")
			?.addEventListener("click", () => {
				this.dischargePatient();
			});

		// Payment type change handler
		document
			.getElementById("modalPaymentType")
			?.addEventListener("change", (e) => {
				this.handlePaymentTypeChange(
					(e.target as HTMLSelectElement).value
				);
			});

		// Admit patient checkbox handler
		document
			.getElementById("modalAdmitPatient")
			?.addEventListener("change", (e) => {
				this.toggleAdmissionSection(
					(e.target as HTMLInputElement).checked
				);
			});

		document
			.getElementById("patientSearchIcon")
			?.addEventListener("click", () => {
				this.loadAllPatients();
			});

		document
			.getElementById("viewPastAdmissionsBtn")
			?.addEventListener("click", () => {
				this.showPastAdmissionsModal();
			});

		document
			.getElementById("printAdmissionBillBtn")
			?.addEventListener("click", () => {
				this.printAdmissionBill();
			});

		// Staff status tab
		document
			.getElementById("refreshStaffStatusBtn")
			?.addEventListener("click", () => {
				this.loadStaffStatus();
			});

		// Staff assignment editing
		document
			.getElementById("saveStaffAssignmentBtn")
			?.addEventListener("click", () => {
				this.saveStaffAssignment();
			});

		document
			.getElementById("confirmSettleBillBtn")
			?.addEventListener("click", () => {
				this.settleBill();
			});

		// Add real-time balance calculation
		document
			.getElementById("settleNewPaidAmount")
			?.addEventListener("input", () => {
				this.updateSettleBalancePreview();
			});

		document
			.getElementById("staff-status-tab")
			?.addEventListener("shown.bs.tab", () => {
				// Hide patient details when switching to staff status
				document.getElementById("patientContent")!.style.display =
					"none";

				this.loadStaffStatus();
				// Auto-refresh every 30 seconds when tab is active
				this.staffStatusInterval = setInterval(() => {
					this.loadStaffStatus();
				}, 30000);
			});

		document
			.getElementById("all-patients-tab")
			?.addEventListener("shown.bs.tab", () => {
				// Stop auto-refresh when leaving staff status tab
				if (this.staffStatusInterval) {
					clearInterval(this.staffStatusInterval);
					this.staffStatusInterval = null;
				}

				// If no patient is currently selected, show the patient list
				if (
					!this.currentPatient ||
					document.getElementById("patientContent")!.style.display ===
					"none"
				) {
					document.getElementById(
						"patientListContainer"
					)!.style.display = "block";
				}
			});
	}

	private async loadInitialData(): Promise<void> {
		try {
			await Promise.all([
				this.loadDoctors(),
				this.loadNurses(),
				this.loadInsuranceCompanies(),
				this.loadPriceLists(),
				this.loadServices(),
				this.loadDrugs()
			]);

			this.initializePrintManager();
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError(i18n.t("patients.messages.loadInitialDataError"));
		}
	}

	private async loadAllPatients(): Promise<void> {
		try {
			const response = await fetch("/api/patients", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (!response.ok) throw new Error("Failed to fetch patients");
			this.allPatients = await response.json();
			this.displayPatientList(this.allPatients);
		} catch (error) {
			console.error("Error loading patients:", error);
			this.showError(i18n.t("patients.messages.loadPatientsError"));
		}
	}

	private displayPatientList(patients: Patient[]): void {
		document.getElementById("patientContent")!.style.display = "none";
		document.getElementById("patientListContainer")!.style.display =
			"block";
		const container = document.getElementById("patientListContainer")!;

		if (patients.length === 0) {
			container.innerHTML = `<p class="text-muted text-center">${i18n.t(
				"patients.noPatients"
			)}</p>`;
			return;
		}

		let tableHtml = `
			<table class="table table-hover">
				<thead>
					<tr class="table-secondary">
						<th>${i18n.t("common.name")}</th>
						<th>${i18n.t("patients.fields.nationalId")}</th>
						<th>${i18n.t("patients.table.admitted")}</th>
						<th>${i18n.t("patients.fields.paymentType")}</th>
						<th>${i18n.t("patients.fields.insuranceCompany")}</th>
						<th>${i18n.t("patients.fields.insuranceCardId")}</th>
						<th>${i18n.t("patients.fields.insuranceFormId")}</th>
					</tr>
				</thead>
				<tbody>
		`;

		patients.forEach((patient) => {
			const admitted = patient.is_active
				? `<span class="badge bg-success">${i18n.t(
					"common.yes"
				)}</span>`
				: `<span class="badge bg-secondary">${i18n.t(
					"common.no"
				)}</span>`;
			const insurance =
				patient.payment_type === "insurance"
					? this.insuranceCompanies.find(
						(c) => c.insurance_id === patient.insurance_id
					)?.name || "-"
					: "-";
			tableHtml += `
				<tr onclick="patientManager.selectPatient(${patient.patient_id
				})" style="cursor: pointer;">
					<td>${this.escapeHtml(patient.name)}</td>
					<td>${this.escapeHtml(patient.national_id || "-")}</td>
					<td>${admitted}</td>
					<td>${this.formatPaymentType(patient.payment_type)}</td>
					<td>${insurance}</td>
					<td>${patient.insurance_card_id || "-"}</td>
					<td>${patient.insurance_form_id || "-"}</td>
				</tr>
			`;
		});

		tableHtml += "</tbody></table>";
		container.innerHTML = tableHtml;
	}

	private async loadDoctors(): Promise<void> {
		try {
			const response = await fetch("/api/doctors", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch doctors");

			this.doctors = await response.json();
			this.populateDoctorSelects();
		} catch (error) {
			console.error("Error loading doctors:", error);
		}
	}

	private async loadNurses(): Promise<void> {
		try {
			const response = await fetch("/api/employees/nurses/available", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch nurses");

			this.nurses = await response.json();
			this.populateNurseSelects();
		} catch (error) {
			console.error("Error loading nurses:", error);
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

	private async loadPriceLists(): Promise<void> {
		try {
			const response = await fetch("/api/price-lists", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch price lists");

			this.priceLists = await response.json();
			this.populatePriceListSelect();
		} catch (error) {
			console.error("Error loading price lists:", error);
		}
	}

	private async loadServices(): Promise<void> {
		try {
			const response = await fetch("/api/services", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch services");

			this.availableServices = await response.json();
		} catch (error) {
			console.error("Error loading services:", error);
		}
	}

	private async loadDrugs(): Promise<void> {
		try {
			const response = await fetch("/api/pharmacy/drugs/cards", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch drugs");

			this.availableDrugs = await response.json();

			if (this.availableDrugs.length > 0) {
				for (const drug of this.availableDrugs) {
					const shipmentsResponse = await fetch(
						`/api/pharmacy/drugs/shipments/drug/${drug.drug_id}`,
						{
							headers: {
								Authorization: `Bearer ${localStorage.getItem(
									"token"
								)}`
							}
						}
					);

					if (!shipmentsResponse.ok)
						throw new Error("Failed to fetch drug shipment");

					let available_quantity = 0;
					const shipments = await shipmentsResponse.json();
					for (const shipment of shipments) {
						available_quantity += parseInt(shipment.quantity);
					}

					drug.available_quantity = available_quantity;
				}
			}
		} catch (error) {
			console.error("Error loading drugs:", error);
		}
	}

	private initializePrintManager(): void {
		this.printBillManager = new PrintBillManager(
			this.availableServices,
			this.availableDrugs,
			this.servicePrices,
			this.showSuccess.bind(this),
			this.showError.bind(this),
			this.escapeHtml.bind(this),
			this.formatServiceType.bind(this)
		);

		// Expose to window for HTML onclick handlers
		(window as any).printBillManager = this.printBillManager;
	}

	private populateDoctorSelects(): void {
		const referringSelect = document.getElementById(
			"modalReferringDoctor"
		) as HTMLSelectElement;
		const attendingContainer = document.getElementById(
			"attendingDoctorsSelection"
		)!;

		// Populate referring doctor select
		referringSelect.innerHTML =
			`<option value="">${i18n.t(
				"patients.placeholders.selectReferringDoctor"
			)}</option>` +
			this.doctors
				.map(
					(doctor) =>
						`<option value="${doctor.employee_id
						}">${this.escapeHtml(doctor.name)} (${i18n.t(
							`patients.doctorTypes.${doctor.doctor_type}`
						)})</option>`
				)
				.join("");

		// Populate attending doctors checkboxes
		attendingContainer.innerHTML = this.doctors
			.map(
				(doctor) => `
            <div class="form-check doctor-checkbox">
                <input class="form-check-input" type="checkbox" 
                       value="${doctor.employee_id}" id="doctor_${doctor.employee_id
					}">
                <label class="form-check-label" for="doctor_${doctor.employee_id
					}">
                    ${this.escapeHtml(doctor.name)} (${i18n.t(
						`patients.doctorTypes.${doctor.doctor_type}`
					)})
                </label>
            </div>
        `
			)
			.join("");
	}

	private populateNurseSelects(): void {
		const attendingNurseContainer = document.getElementById(
			"attendingNursesSelection"
		)!;

		// Populate attending nurses checkboxes
		attendingNurseContainer.innerHTML = this.nurses
			.map(
				(nurse) => `
            <div class="form-check nurse-checkbox">
                <input class="form-check-input" type="checkbox" 
                       value="${nurse.employee_id}" id="nurse_${nurse.employee_id
					}">
                <label class="form-check-label" for="nurse_${nurse.employee_id
					}">
                    ${this.escapeHtml(nurse.name)}
                </label>
            </div>
        `
			)
			.join("");
	}

	private populateInsuranceSelect(): void {
		const select = document.getElementById(
			"modalInsuranceCompany"
		) as HTMLSelectElement;
		select.innerHTML =
			`<option value="">${i18n.t(
				"patients.placeholders.selectInsuranceCompany"
			)}</option>` +
			this.insuranceCompanies
				.map(
					(company) =>
						`<option value="${company.insurance_id
						}" data-pricelist-id="${company.pricelist_id || ""
						}">${this.escapeHtml(company.name)}</option>`
				)
				.join("");

		// Add event listener for insurance company change
		select.addEventListener("change", (e) => {
			this.handleInsuranceCompanyChange(
				(e.target as HTMLSelectElement).value
			);
		});
	}

	private handleInsuranceCompanyChange(insuranceCompanyId: string): void {
		if (!insuranceCompanyId) {
			// Reset to default if no insurance company selected
			(
				document.getElementById("modalPriceList") as HTMLSelectElement
			).value = "";
			return;
		}

		const selectedCompany = this.insuranceCompanies.find(
			(company) => company.insurance_id === parseInt(insuranceCompanyId)
		);

		if (selectedCompany) {
			const priceListSelect = document.getElementById(
				"modalPriceList"
			) as HTMLSelectElement;

			if (selectedCompany.pricelist_id) {
				// Set the pricelist associated with the insurance company
				priceListSelect.value = selectedCompany.pricelist_id.toString();
			} else {
				// Set to default (empty value) if insurance company has no pricelist
				priceListSelect.value = "";
			}
		}
	}

	private populatePriceListSelect(): void {
		const select = document.getElementById(
			"modalPriceList"
		) as HTMLSelectElement;
		select.innerHTML =
			`<option value="">${i18n.t(
				"patients.placeholders.default"
			)}</option>` +
			this.priceLists
				.map(
					(list) =>
						`<option value="${list.pricelist_id}">${this.escapeHtml(
							list.name
						)}</option>`
				)
				.join("");
	}

	private handlePatientSearch(searchTerm: string): void {
		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
		}

		this.searchTimeout = setTimeout(() => {
			const filtered = this.allPatients.filter((patient) =>
				patient.name.toLowerCase().includes(searchTerm.toLowerCase())
			);
			this.displayPatientList(filtered);
		}, 300);
	}

	public async selectPatient(patientId: number): Promise<void> {
		try {
			const searchInput = document.getElementById(
				"patientSearch"
			) as HTMLInputElement;

			// Switch to "All Patients" tab if not already active
			const allPatientsTab = document.getElementById(
				"all-patients-tab"
			) as HTMLButtonElement;
			const staffStatusTab = document.getElementById(
				"staff-status-tab"
			) as HTMLButtonElement;

			if (staffStatusTab?.classList.contains("active")) {
				// Programmatically switch tabs using Bootstrap's tab API
				//@ts-ignore
				const bsTab = new bootstrap.Tab(allPatientsTab);
				bsTab.show();
			}

			// Load patient data
			await this.loadPatientData(patientId);

			// Update search input with patient name
			if (this.currentPatient) {
				searchInput.value = this.currentPatient.name;
			}

			// Show patient content, hide patient list
			document.getElementById("patientListContainer")!.style.display =
				"none";
			document.getElementById("patientContent")!.style.display = "block";
		} catch (error) {
			console.error("Error selecting patient:", error);
			this.showError(`${i18n.t("patients.messages.loadPatientError")}`);
		}
	}

	private async loadPatientData(patientId: number): Promise<void> {
		try {
			// Load patient details
			const patientResponse = await fetch(`/api/patients/${patientId}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!patientResponse.ok) throw new Error("Failed to fetch patient");

			this.currentPatient = await patientResponse.json();

			if (!this.currentPatient) throw new Error("Patient not found");

			// Load current admission FIRST if patient is active
			// This is critical because we need the admission's pricelist_id for pricing
			if (this.currentPatient.is_active) {
				try {
					const admissionResponse = await fetch(
						`/api/patients/${patientId}/admission/current`,
						{
							headers: {
								Authorization: `Bearer ${localStorage.getItem(
									"token"
								)}`
							}
						}
					);

					if (admissionResponse.ok) {
						this.currentAdmission = await admissionResponse.json();
					} else {
						this.currentAdmission = null;
					}
				} catch (error) {
					console.warn("No current admission found");
					this.currentAdmission = null;
				}
			} else {
				this.currentAdmission = null;
			}

			// NOW load price maps - this.currentAdmission is set, so it will use the correct pricelist
			await this.loadPriceMaps();

			// THEN reload services and drugs with the correct pricing context
			await Promise.all([this.loadServices(), this.loadDrugs()]);

			// Load assigned services and drugs if admitted
			if (this.currentAdmission) {
				await Promise.all([
					this.loadAssignedServices(patientId),
					this.loadAssignedDrugs(patientId),
					this.loadAssignedSupplies(patientId),
					this.loadCurrentBill(this.currentAdmission.bill_id!)
				]);
			} else {
				this.assignedServices = [];
				this.assignedDrugs = [];
				this.assignedSupplies = [];
				this.currentBill = null;
			}

			// Update UI
			this.updatePatientDisplay();
			this.updateBillingDisplay();
		} catch (error) {
			throw error;
		}
	}

	private async loadPriceMaps(): Promise<void> {
		this.servicePrices = new Map();

		let pricelistId = this.currentAdmission?.pricelist_id;

		if (!pricelistId) {
			const defRes = await fetch("/api/price-lists/default", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (defRes.ok) {
				const defPl = await defRes.json();
				pricelistId = defPl.pricelist_id;
			}
		}

		if (pricelistId) {
			try {
				const servicesRes = await fetch(
					`/api/price-lists/${pricelistId}/services`,
					{
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);
				if (servicesRes.ok) {
					const services: { service_id: number; price: number }[] =
						await servicesRes.json();
					services.forEach((s) =>
						this.servicePrices.set(s.service_id, s.price)
					);
				}
			} catch (error) {
				console.error("Error loading price maps:", error);
			}
		}
	}

	private async loadAssignedServices(patientId: number): Promise<void> {
		try {
			const response = await fetch(
				`/api/patients/${patientId}/services`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (response.ok) {
				this.assignedServices = await response.json();
			} else {
				this.assignedServices = [];
			}
		} catch (error) {
			console.error("Error loading assigned services:", error);
			this.assignedServices = [];
		}
	}

	private async loadAssignedDrugs(patientId: number): Promise<void> {
		try {
			const response = await fetch(`/api/patients/${patientId}/drugs`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (response.ok) {
				this.assignedDrugs = await response.json();
			} else {
				this.assignedDrugs = [];
			}
		} catch (error) {
			console.error("Error loading assigned drugs:", error);
			this.assignedDrugs = [];
		}
	}

	private async loadAssignedSupplies(patientId: number): Promise<void> {
		try {
			const response = await fetch(`/api/pharmacy/medical-supply-usages/patient-history/${patientId}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (response.ok) {
				this.assignedSupplies = await response.json();
			} else {
				this.assignedSupplies = [];
			}
		} catch (error) {
			console.error("Error loading assigned supplies:", error);
			this.assignedSupplies = [];
		}
	}

	private async loadCurrentBill(billId: number): Promise<void> {
		try {
			const response = await fetch(`/api/bills/${billId}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (response.ok) {
				this.currentBill = await response.json();
			} else {
				this.currentBill = null;
			}
		} catch (error) {
			console.error("Error loading current bill:", error);
			this.currentBill = null;
		}
	}

	private updatePatientDisplay(): void {
		if (!this.currentPatient) return;

		const patient = this.currentPatient;
		const admission = this.currentAdmission;

		// Basic information
		document.getElementById("patientName")!.textContent = patient.name;
		document.getElementById("patientGender")!.textContent =
			this.formatGender(patient.gender);
		document.getElementById("patientNationalID")!.textContent =
			patient.national_id || "-";
		document.getElementById("patientPhone")!.textContent =
			patient.phone || "-";
		document.getElementById("patientAddress")!.textContent =
			patient.address || "-";
		document.getElementById("registrationDate")!.textContent =
			i18n.formatDate(patient.registration_date);

		// Status
		const statusElement = document.getElementById("patientStatus")!;
		if (patient.is_active) {
			statusElement.innerHTML = `<span class="badge bg-success">${i18n.t(
				"patients.status.admitted"
			)} - ${i18n.formatDateTime(admission?.admission_time!)}</span>`;
		} else {
			statusElement.innerHTML = `<span class="badge bg-secondary">${i18n.t(
				"patients.status.notAdmitted"
			)}</span>`;
		}

		// Guardian information
		const guardian = patient.guardian_info;
		document.getElementById("guardianName")!.textContent =
			guardian?.name || "-";
		document.getElementById("guardianPhone")!.textContent =
			guardian?.phone || "-";
		document.getElementById("guardianNationalId")!.textContent =
			guardian?.national_id || "-";
		document.getElementById("guardianAddress")!.textContent =
			guardian?.address || "-";

		// Payment information
		document.getElementById("paymentType")!.innerHTML =
			this.formatPaymentType(patient.payment_type);
		document.getElementById("insuranceCompany")!.textContent =
			patient.insurance_company_name || "-";
		document.getElementById("insuranceCardId")!.textContent =
			patient.insurance_card_id || "-";
		document.getElementById("insuranceFormId")!.textContent =
			patient.insurance_form_id || "-";
		document.getElementById("priceList")!.textContent =
			this.getPriceListName() || i18n.t("patients.placeholders.default");

		// Medical information
		document.getElementById("quickCheck")!.innerHTML = this.currentAdmission
			?.quick_check
			? `<span class="badge bg-warning">${i18n.t("common.yes")}</span>`
			: `<span class="badge bg-secondary">${i18n.t("common.no")}</span>`;

		// Referring doctor
		const referringDoctor = this.doctors.find(
			(d) => d.employee_id === patient.referring_doctor_id
		);
		document.getElementById("referringDoctor")!.textContent =
			referringDoctor?.name || "-";

		// Diagnosis, attending doctors and attending nurses (from admission)
		document.getElementById("diagnosis")!.textContent =
			admission?.diagnosis || "-";
		document.getElementById("attendingDoctors")!.textContent =
			admission?.attending_doctors?.join(", ") || "-";
		document.getElementById("attendingNurses")!.textContent =
			admission?.attending_nurses?.join(", ") || "-";

		// Update action buttons
		this.updateActionButtons();

		// Update assigned services and drugs
		this.updateAssignedServicesDisplay();
		this.updateAssignedDrugsDisplay();
		this.updateAssignedSuppliesDisplay();
	}

	private getPriceListName(): string {
		if (!this.currentAdmission?.pricelist_id)
			return i18n.t("patients.placeholders.default");
		return (
			this.priceLists.find(
				(p) => p.pricelist_id === this.currentAdmission!.pricelist_id
			)?.name || i18n.t("patients.placeholders.default")
		);
	}

	private updateActionButtons(): void {
		const admitBtn = document.getElementById(
			"admitPatientBtn"
		) as HTMLButtonElement;
		const dischargeBtn = document.getElementById(
			"dischargePatientBtn"
		) as HTMLButtonElement;
		const pastAdmissionsBtn = document.getElementById(
			"viewPastAdmissionsBtn"
		) as HTMLButtonElement;

		if (this.currentPatient?.is_active) {
			admitBtn.style.display = "none";
			dischargeBtn.style.display = "inline-block";
		} else {
			admitBtn.style.display = "inline-block";
			dischargeBtn.style.display = "none";
		}
		// Show past admissions button for all patients
		if (pastAdmissionsBtn) {
			pastAdmissionsBtn.style.display = "inline-block";
		}
	}

	private updateAssignedServicesDisplay(): void {
		const container = document.getElementById("assignedServices")!;

		if (this.assignedServices.length === 0) {
			container.innerHTML = `<div class="text-muted text-center py-3">${i18n.t(
				"patients.messages.noServicesAssigned"
			)}</div>`;
			return;
		}

		const servicesList: Map<number, { name: string, type: string, services: Array<Service>, quantity: number }> = new Map();
		this.assignedServices.forEach((service) => {
			if (servicesList.has(service.service_id)) {
				servicesList.get(service.service_id)!.services.push(service);
				servicesList.get(service.service_id)!.quantity += 1;
			} else {
				servicesList.set(service.service_id, { name: service.name, type: service.service_type, services: [service], quantity: 1 });
			}
		});

		let html = "";
		servicesList.forEach((serviceType, serviceId) => {
			html += `
				<div class="assigned-item">
					<div class="assigned-item-info">
						<div class="assigned-item-name">${this.escapeHtml(serviceType.name)}</div>
						<div class="assigned-item-details">
							${i18n.t("patients.table.type")}: ${this.formatServiceType(serviceType.type)} • 
							${i18n.t("patients.table.quantity")}: ${serviceType.quantity}
						</div>
					</div>
					<div class="assigned-item-actions">
						<button class="btn btn-sm btn-outline-primary"
								onclick="patientManager.viewServiceList(${serviceId})">${i18n.t("patients.buttons.view")}</button>
					</div>
				</div>`;
		});

		container.innerHTML = html;
	}

	public viewServiceList(serviceId: number): void {
		const services = this.assignedServices.filter(s => s.service_id === serviceId);

		if (services.length === 0) return;

		const serviceName = services[0].name;

		// Set modal title
		document.getElementById("viewItemDetailsModalLabel")!.textContent =
			`${i18n.t("patients.sections.assignedServices")} - ${serviceName}`;

		// Create table headers
		const tableHead = document.getElementById("itemDetailsTableHead")!;
		tableHead.innerHTML = `
			<tr>
				<th>${i18n.t("patients.table.dateAdded")}</th>
				<th>${i18n.t("patients.table.type")}</th>
				<th>${i18n.t("common.status")}</th>
				<th>${i18n.t("common.actions")}</th>
			</tr>
		`;

		// Create table rows
		const tableBody = document.getElementById("itemDetailsTableBody")!;
		tableBody.innerHTML = services.map(service => `
			<tr>
				<td>${i18n.formatDateTime(service.start_date)}</td>
				<td>${this.formatServiceType(service.service_type)}</td>
				<td>
					${service.is_active
				? `<span class="badge bg-success">${i18n.t("patients.status.active")}</span>`
				: `<span class="badge bg-secondary">${i18n.t("patients.status.stopped")}</span>`
			}
				</td>
				<td>
					${service.is_active
				? `<button class="btn btn-sm btn-warning" onclick="patientManager.stopService(${service.active_service_id})">
								<i class="bi bi-pause-circle"></i> ${i18n.t("patients.buttons.stop")}
							</button>`
				: '-'
			}
					<button class="btn btn-sm btn-danger" onclick="patientManager.removeService(${service.active_service_id})">
						<i class="bi bi-trash"></i> ${i18n.t("patients.buttons.remove")}
					</button>
				</td>
			</tr>
		`).join('');

		this.viewItemDetailsModal.show();
	}

	public async stopService(serviceId: number): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const result = await Swal.fire({
				title: i18n.t("patients.messages.stopServiceTitle"),
				text: i18n.t("patients.messages.stopServiceText"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#ffc107",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("patients.buttons.stop"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const response = await fetch(
					`/api/patients/${this.currentPatient.patient_id}/services/${serviceId}/stop`,
					{
						method: "PATCH",
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);

				if (!response.ok) {
					throw new Error("Failed to stop service");
				}

				this.showSuccess(i18n.t("patients.messages.serviceStopped"));
				await this.loadPatientData(this.currentPatient.patient_id);
			}
		} catch (error) {
			console.error("Error stopping service:", error);
			this.showError(i18n.t("patients.messages.stopServiceError"));
		}
	}

	private updateAssignedDrugsDisplay(): void {
		const container = document.getElementById("assignedDrugs")!;

		if (this.assignedDrugs.length === 0) {
			container.innerHTML = `<div class="text-muted text-center py-3">${i18n.t(
				"patients.messages.noDrugsAssigned"
			)}</div>`;
			return;
		}

		// Group drugs by drug_id
		const drugsList: Map<
			number,
			{
				name: string;
				totalInitial: number;
				totalRemaining: number;
				unit: string;
				lastAdministered: Date | null;
				drugs: any[];
			}
		> = new Map();

		this.assignedDrugs.forEach((drug) => {
			if (drugsList.has(drug.drug_id)) {
				const group = drugsList.get(drug.drug_id)!;
				group.drugs.push(drug);
				group.totalInitial += parseFloat(drug.initial_quantity || 0);
				group.totalRemaining += parseFloat(drug.remaining_quantity || 0);
				if (
					drug.last_administered &&
					(!group.lastAdministered ||
						new Date(drug.last_administered) > group.lastAdministered)
				) {
					group.lastAdministered = new Date(drug.last_administered);
				}
			} else {
				drugsList.set(drug.drug_id, {
					name: drug.drug_name,
					totalInitial: parseFloat(drug.initial_quantity || 0),
					totalRemaining: parseFloat(drug.remaining_quantity || 0),
					unit: drug.unit_conversion?.smaller || "units",
					lastAdministered: drug.last_administered
						? new Date(drug.last_administered)
						: null,
					drugs: [drug]
				});
			}
		});

		let html = "";
		drugsList.forEach((group, drugId) => {
			html += `
				<div class="assigned-item">
					<div class="assigned-item-info">
						<div class="assigned-item-name">${this.escapeHtml(group.name)}</div>
						<div class="assigned-item-details">
                            ${i18n.t("patients.table.quantity")}: ${group.totalInitial} ${group.unit} •
							${i18n.t("patients.table.remaining")}: ${group.totalRemaining} ${group.unit}
							${group.lastAdministered
					? ` • ${i18n.t(
						"patients.table.lastAdministered"
					)}: ${i18n.formatDateTime(group.lastAdministered)}`
					: ` • ${i18n.t("patients.table.notAdministeredYet")}`
				}
						</div>
					</div>
					<div class="assigned-item-actions">
						<button class="btn btn-sm btn-outline-primary"
								onclick="patientManager.viewDrugList(${drugId})">${i18n.t(
					"patients.buttons.view"
				)}</button>
					</div>
				</div>`;
		});

		container.innerHTML = html;
	}

	public viewDrugList(drugId: number): void {
		const drugs = this.assignedDrugs.filter((d) => d.drug_id === drugId);

		if (drugs.length === 0) return;

		const drugName = drugs[0].drug_name;

		// Set modal title
		document.getElementById(
			"viewItemDetailsModalLabel"
		)!.textContent = `${i18n.t("patients.sections.assignedDrugs")} - ${drugName}`;

		// Create table headers
		const tableHead = document.getElementById("itemDetailsTableHead")!;
		tableHead.innerHTML = `
			<tr>
				<th>${i18n.t("patients.table.dateAdded")}</th>
				<th>${i18n.t("patients.table.quantity")}</th>
				<th>${i18n.t("patients.table.remaining")}</th>
				<th>${i18n.t("patients.table.lastAdministered")}</th>
				<th>${i18n.t("common.actions")}</th>
			</tr>
		`;

		// Create table rows
		const tableBody = document.getElementById("itemDetailsTableBody")!;
		tableBody.innerHTML = drugs
			.map(
				(drug) => `
			<tr>
				<td>${drug.start_date ? i18n.formatDateTime(drug.start_date) : "-"
					}</td>
				<td>${drug.initial_quantity || "-"}</td>
				<td>${drug.remaining_quantity}</td>
				<td>${drug.last_administered
						? i18n.formatDateTime(drug.last_administered)
						: i18n.t("patients.table.notAdministeredYet")
					}</td>
				<td>
					<button class="btn btn-sm btn-outline-primary"
							onclick="patientManager.administerDrug(${drug.usage_id})">
						<i class="bi bi-capsule"></i> ${i18n.t("patients.buttons.administer")}
					</button>
					<button class="btn btn-sm btn-danger" onclick="patientManager.removeDrug(${drug.usage_id
					})">
						<i class="bi bi-trash"></i> ${i18n.t("patients.buttons.remove")}
					</button>
				</td>
			</tr>
		`
			)
			.join("");

		this.viewItemDetailsModal.show();
	}

	public async removeDrug(drugUsageId: number): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const result = await Swal.fire({
				title: i18n.t("patients.messages.removeDrugTitle"),
				html: `
					<p>${i18n.t("patients.messages.removeDrugText")}</p>
				`,
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("patients.buttons.remove"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const response = await fetch(
					`/api/patients/${this.currentPatient.patient_id}/drugs/${drugUsageId}`,
					{
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || "Failed to remove drug");
				}

				this.showSuccess(i18n.t("patients.messages.drugRemoved"));
				await this.loadPatientData(this.currentPatient.patient_id);
			}
		} catch (error: any) {
			console.error("Error removing drug:", error);
			this.showError(
				error.message || i18n.t("patients.messages.removeDrugError")
			);
		}
	}

	private updateAssignedSuppliesDisplay(): void {
		const container = document.getElementById("assignedSupplies")!;

		if (this.assignedSupplies.length === 0) {
			container.innerHTML = `<div class="text-muted text-center py-3">${i18n.t(
				"patients.messages.noSuppliesAssigned"
			)}</div>`;
			return;
		}

		// Group supplies by supply_id
		const suppliesList: Map<
			number,
			{
				name: string;
				totalInitial: number;
				totalRemaining: number;
				supplies: any[];
			}
		> = new Map();

		this.assignedSupplies.forEach((supply) => {
			if (suppliesList.has(supply.supply_id)) {
				const group = suppliesList.get(supply.supply_id)!;
				group.supplies.push(supply);
				group.totalInitial += parseFloat(supply.initial_quantity || 0);
				group.totalRemaining += parseFloat(supply.remaining_quantity || 0);
			} else {
				suppliesList.set(supply.supply_id, {
					name: supply.supply_name,
					totalInitial: parseFloat(supply.initial_quantity || 0),
					totalRemaining: parseFloat(supply.remaining_quantity || 0),
					supplies: [supply]
				});
			}
		});

		let html = "";
		suppliesList.forEach((group, supplyId) => {
			html += `
				<div class="assigned-item">
					<div class="assigned-item-info">
						<div class="assigned-item-name">${this.escapeHtml(group.name)}</div>
						<div class="assigned-item-details">
                            ${i18n.t("patients.table.quantity")}: ${group.totalInitial} •
							${i18n.t("patients.table.remaining")}: ${group.totalRemaining}
						</div>
					</div>
					<div class="assigned-item-actions">
						<button class="btn btn-sm btn-outline-primary"
								onclick="patientManager.viewSupplyList(${supplyId})">${i18n.t(
				"patients.buttons.view"
			)}</button>
					</div>
				</div>`;
		});

		container.innerHTML = html;
	}

	public viewSupplyList(supplyId: number): void {
		const supplies = this.assignedSupplies.filter(
			(s) => s.supply_id === supplyId
		);

		if (supplies.length === 0) return;

		const supplyName = supplies[0].supply_name;

		// Set modal title
		document.getElementById(
			"viewItemDetailsModalLabel"
		)!.textContent = `${i18n.t("patients.sections.assignedSupplies")} - ${supplyName}`;

		// Create table headers
		const tableHead = document.getElementById("itemDetailsTableHead")!;
		tableHead.innerHTML = `
			<tr>
				<th>${i18n.t("patients.table.dateAdded")}</th>
				<th>${i18n.t("patients.table.quantity")}</th>
				<th>${i18n.t("patients.table.remaining")}</th>
				<th>${i18n.t("common.actions")}</th>
			</tr>
		`;

		// Create table rows
		const tableBody = document.getElementById("itemDetailsTableBody")!;
		tableBody.innerHTML = supplies
			.map(
				(supply) => `
			<tr>
				<td>${supply.start_date ? i18n.formatDateTime(supply.start_date) : "-"
					}</td>
				<td>${supply.initial_quantity || "-"}</td>
				<td>${supply.remaining_quantity}</td>
				<td>
					<button class="btn btn-sm btn-danger" onclick="patientManager.removeSupply(${supply.usage_id
					})">
						<i class="bi bi-trash"></i> ${i18n.t("patients.buttons.remove")}
					</button>
				</td>
			</tr>
		`
			)
			.join("");

		this.viewItemDetailsModal.show();
	}

	public async removeSupply(usageId: number): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const result = await Swal.fire({
				title: i18n.t("patients.messages.removeSupplyTitle"),
				text: i18n.t("patients.messages.removeSupplyText"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("patients.buttons.remove"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const response = await fetch(
					`/api/pharmacy/medical-supply-usages/patient/${this.currentPatient.patient_id}/${usageId}`,
					{
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${localStorage.getItem("token")}`
						}
					}
				);

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || "Failed to remove supply");
				}

				this.showSuccess(i18n.t("patients.messages.supplyRemoved"));
				await this.loadPatientData(this.currentPatient.patient_id);
			}
		} catch (error: any) {
			console.error("Error removing supply:", error);
			this.showError(error.message || "Failed to remove supply");
		}
	}

	private updateBillingDisplay(): void {
		if (!this.currentBill) {
			// Reset all billing fields
			this.resetBillingFields();
			return;
		}

		const bill = this.currentBill;

		// Calculate services and drugs totals from bill details
		let servicesTotal = 0;
		let drugsTotal = 0;

		if (bill.bill_details) {
			bill.bill_details.forEach((detail) => {
				const lineTotal = detail.quantity * detail.unit_price;
				if (detail.service_id) {
					servicesTotal += lineTotal;
				} else if (detail.drug_shipment_id) {
					drugsTotal += lineTotal;
				} else if (detail.medical_supply_shipment_id) {
					drugsTotal += 0; // Don't add to drugs total
					// We'll calculate supplies total separately or add here
					// Actually, I should track suppliesTotal separately
				}
			});
		}

		// Recalculate everything including supplies
		servicesTotal = 0;
		drugsTotal = 0;
		let suppliesTotal = 0;

		if (bill.bill_details) {
			bill.bill_details.forEach((detail) => {
				const lineTotal = detail.quantity * detail.unit_price;
				if (detail.service_id) {
					servicesTotal += lineTotal;
				} else if (detail.drug_shipment_id) {
					drugsTotal += lineTotal;
				} else if (detail.medical_supply_shipment_id) {
					suppliesTotal += lineTotal;
				}
			});
		}

		// Update display fields
		(document.getElementById("servicesTotal") as HTMLInputElement).value =
			parseFloat(servicesTotal.toString()).toFixed(2);
		(document.getElementById("drugsTotal") as HTMLInputElement).value =
			parseFloat(drugsTotal.toString()).toFixed(2);
		(document.getElementById("suppliesTotal") as HTMLInputElement).value =
			parseFloat(suppliesTotal.toString()).toFixed(2);
		(document.getElementById("medicalTestsAmount") as HTMLInputElement).value =
			(bill.medical_tests_amount || 0).toString();
		(document.getElementById("paidAmount") as HTMLInputElement).value =
			bill.paid_amount.toString();

		// Set editable fields from bill
		(document.getElementById("discount") as HTMLInputElement).value =
			bill.discount.toString();
		(document.getElementById("discountType") as HTMLInputElement).checked =
			bill.discount_type === "percentage";
		(document.getElementById("vatPercentage") as HTMLInputElement).value = (
			bill.vat_percentage || 0
		).toString();

		// Populate discount scope checkboxes
		const discountScope = bill.discount_scope || ["services", "drugs", "supplies", "tests"];
		document.querySelectorAll('.discount-scope').forEach((checkbox: any) => {
			checkbox.checked = discountScope.includes(checkbox.value);
		});

		// Populate VAT scope checkboxes
		const vatScopeCustom = bill.vat_scope_custom || ["services", "drugs", "supplies", "tests"];
		document.querySelectorAll('.vat-scope').forEach((checkbox: any) => {
			checkbox.checked = vatScopeCustom.includes(checkbox.value);
		});

		(document.getElementById("vatScope") as HTMLSelectElement).value =
			bill.vat_scope || "both";
		(
			document.getElementById(
				"administrativeExpenses"
			) as HTMLInputElement
		).value = bill.administrative_expenses.toString();

		// Calculate and display totals
		this.calculateBilling();
	}

	private resetBillingFields(): void {
		const fields = [
			"servicesTotal",
			"drugsTotal",
			"suppliesTotal",
			"medicalTestsAmount",
			"paidAmount",
			"discount",
			"discountTotal",
			"totalAfterDiscount",
			"vatPercentage",
			"administrativeExpenses",
			"totalFee",
			"remainingFacility",
			"remainingPatient",
			"paymentAmount"
		];

		fields.forEach((fieldId) => {
			const field = document.getElementById(fieldId) as HTMLInputElement;
			if (field) field.value = "0.00";
		});

		(document.getElementById("discountType") as HTMLInputElement).checked =
			false;

		// Reset scopes to all checked by default
		document.querySelectorAll('.discount-scope').forEach((checkbox: any) => checkbox.checked = true);
		document.querySelectorAll('.vat-scope').forEach((checkbox: any) => checkbox.checked = true);

		(document.getElementById("vatScope") as HTMLSelectElement).value =
			"both";
	}

	private calculateBilling(): void {
		const servicesTotal = parseFloat((document.getElementById("servicesTotal") as HTMLInputElement).value) || 0;
		const drugsTotal = parseFloat((document.getElementById("drugsTotal") as HTMLInputElement).value) || 0;
		const suppliesTotal = parseFloat((document.getElementById("suppliesTotal") as HTMLInputElement).value) || 0;
		const medicalTestsAmount = parseFloat((document.getElementById("medicalTestsAmount") as HTMLInputElement).value) || 0;
		const paidAmount = parseFloat((document.getElementById("paidAmount") as HTMLInputElement).value) || 0;

		const discount = parseFloat((document.getElementById("discount") as HTMLInputElement).value) || 0;
		const isDiscountPercentage = (document.getElementById("discountType") as HTMLInputElement).checked;

		const vatPercentage = parseFloat((document.getElementById("vatPercentage") as HTMLInputElement).value) || 0;
		const administrativeExpenses = parseFloat((document.getElementById("administrativeExpenses") as HTMLInputElement).value) || 0;

		// Get scopes
		const discountScope: string[] = [];
		document.querySelectorAll('.discount-scope:checked').forEach((cb: any) => discountScope.push(cb.value));

		const vatScope: string[] = [];
		document.querySelectorAll('.vat-scope:checked').forEach((cb: any) => vatScope.push(cb.value));

		const categoryTotals: Record<string, number> = {
			services: servicesTotal,
			drugs: drugsTotal,
			supplies: suppliesTotal,
			tests: medicalTestsAmount
		};

		const subtotal = servicesTotal + drugsTotal + suppliesTotal + medicalTestsAmount;

		// Calculate discount only on selected categories
		let discountableAmount = 0;
		discountScope.forEach(category => {
			if (categoryTotals[category] !== undefined) {
				discountableAmount += categoryTotals[category];
			}
		});

		let discountAmount = 0;
		if (discountableAmount > 0) {
			if (isDiscountPercentage) {
				discountAmount = (discountableAmount * discount) / 100;
			} else {
				discountAmount = discount;
			}
		}

		const totalAfterDiscount = subtotal - discountAmount;

		// Calculate VAT only on selected categories after discount
		let vattableCategoriesTotal = 0;
		vatScope.forEach(category => {
			if (categoryTotals[category] !== undefined) {
				vattableCategoriesTotal += categoryTotals[category];
			}
		});

		let vattableAfterDiscount = 0;
		if (vattableCategoriesTotal > 0) {
			// Calculate proportional discount for vattable categories
			if (discountableAmount > 0 && discountAmount > 0) {
				let vattableAndDiscountableTotal = 0;
				vatScope.forEach(category => {
					if (discountScope.includes(category) && categoryTotals[category] !== undefined) {
						vattableAndDiscountableTotal += categoryTotals[category];
					}
				});

				const vattableDiscount = (vattableAndDiscountableTotal / discountableAmount) * discountAmount;
				vattableAfterDiscount = vattableCategoriesTotal - vattableDiscount;
			} else {
				vattableAfterDiscount = vattableCategoriesTotal;
			}
		}

		const vatAmount = ((vattableAfterDiscount + administrativeExpenses) * vatPercentage) / 100;

		const totalFee = totalAfterDiscount + vatAmount + administrativeExpenses;
		const remaining = totalFee - paidAmount;

		// Update UI
		(document.getElementById("discountTotal") as HTMLInputElement).value = discountAmount.toFixed(2);
		(document.getElementById("totalAfterDiscount") as HTMLInputElement).value = totalAfterDiscount.toFixed(2);
		(document.getElementById("totalFee") as HTMLInputElement).value = totalFee.toFixed(2);

		if (remaining > 0) {
			(document.getElementById("remainingPatient") as HTMLInputElement).value = "0.00";
			(document.getElementById("remainingFacility") as HTMLInputElement).value = remaining.toFixed(2);
		} else {
			(document.getElementById("remainingPatient") as HTMLInputElement).value = Math.abs(remaining).toFixed(2);
			(document.getElementById("remainingFacility") as HTMLInputElement).value = "0.00";
		}
	}

	private async updateBilling(): Promise<void> {
		if (!this.currentBill) {
			this.showError(i18n.t("patients.messages.noBillSelected"));
			return;
		}

		try {
			const discount =
				parseFloat(
					(document.getElementById("discount") as HTMLInputElement)
						.value
				) || 0;
			const isDiscountPercentage = (
				document.getElementById("discountType") as HTMLInputElement
			).checked;
			const vatPercentage =
				parseFloat(
					(
						document.getElementById(
							"vatPercentage"
						) as HTMLInputElement
					).value
				) || 0;
			const vatScope = (
				document.getElementById("vatScope") as HTMLSelectElement
			).value;
			const administrativeExpenses =
				parseFloat(
					(
						document.getElementById(
							"administrativeExpenses"
						) as HTMLInputElement
					).value
				) || 0;

			const medicalTestsAmount =
				parseFloat(
					(document.getElementById("medicalTestsAmount") as HTMLInputElement)
						.value
				) || 0;

			const discountScopeArray: string[] = [];
			document.querySelectorAll('.discount-scope:checked').forEach((checkbox: any) => {
				discountScopeArray.push(checkbox.value);
			});

			const vatScopeArray: string[] = [];
			document.querySelectorAll('.vat-scope:checked').forEach((checkbox: any) => {
				vatScopeArray.push(checkbox.value);
			});

			const updateData = {
				discount_type: isDiscountPercentage ? "percentage" : "fixed",
				discount: discount,
				vat_percentage: vatPercentage,
				vat_scope: vatScope, // Keep for backward compatibility
				discount_scope: discountScopeArray,
				vat_scope_custom: vatScopeArray,
				administrative_expenses: administrativeExpenses,
				medical_tests_amount: medicalTestsAmount
			};

			const response = await fetch(
				`/api/bills/${this.currentBill.bill_id}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(updateData)
				}
			);

			if (!response.ok) {
				throw new Error("Failed to update billing");
			}

			this.showSuccess(i18n.t("patients.messages.billingUpdated"));

			// Reload bill data
			await this.loadCurrentBill(this.currentBill.bill_id);
			this.updateBillingDisplay();
		} catch (error) {
			console.error("Error updating billing:", error);
			this.showError(i18n.t("patients.messages.billingUpdateError"));
		}
	}

	private async confirmPayment(): Promise<void> {
		if (!this.currentBill) {
			this.showError(i18n.t("patients.messages.noBillSelected"));
			return;
		}

		const paymentAmount =
			parseFloat(
				(document.getElementById("paymentAmount") as HTMLInputElement)
					.value
			) || 0;

		if (paymentAmount === 0) {
			this.showError(i18n.t("patients.messages.enterPaymentAmount"));
			return;
		}

		try {
			const result = await Swal.fire({
				title: i18n.t("patients.messages.confirmPaymentTitle"),
				text: i18n.t("patients.messages.confirmPaymentText", {
					amount: i18n.formatCurrency(paymentAmount)
				}),
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#28a745",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("patients.buttons.confirmPayment"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const newPaidAmount =
					parseFloat(
						this.currentBill.paid_amount as unknown as string
					) + paymentAmount;

				const response = await fetch(
					`/api/bills/${this.currentBill.bill_id}`,
					{
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						},
						body: JSON.stringify({
							paid_amount: newPaidAmount
						})
					}
				);

				if (!response.ok) {
					throw new Error("Failed to process payment");
				}

				this.showSuccess(i18n.t("patients.messages.paymentProcessed"));

				// Reset payment amount field
				(
					document.getElementById("paymentAmount") as HTMLInputElement
				).value = "0";

				// Reload bill and update display
				await this.loadCurrentBill(this.currentBill.bill_id);
				this.updateBillingDisplay();
			}
		} catch (error) {
			console.error("Error processing payment:", error);
			this.showError(i18n.t("patients.messages.paymentError"));
		}
	}

	private showPatientModal(patientId?: number): void {
		const modalTitle = document.getElementById("patientModalLabel")!;
		const form = document.getElementById("patientForm") as HTMLFormElement;

		// Reset form
		form.reset();
		form.classList.remove("was-validated");
		(document.getElementById("patientId") as HTMLInputElement).value = "";

		if (patientId && this.currentPatient) {
			modalTitle.textContent = i18n.t("patients.modals.editPatient");
			this.populatePatientForm(this.currentPatient);
		} else {
			modalTitle.textContent = i18n.t("patients.modals.registerPatient");
		}

		this.patientModal.show();
	}

	private populatePatientForm(patient: Patient): void {
		(document.getElementById("patientId") as HTMLInputElement).value =
			patient.patient_id.toString();
		(
			document.getElementById("modalPatientName") as HTMLInputElement
		).value = patient.name;
		(document.getElementById("modalGender") as HTMLSelectElement).value =
			patient.gender;
		(document.getElementById("modalNationalID") as HTMLInputElement).value =
			patient.national_id || "";
		(document.getElementById("modalPhone") as HTMLInputElement).value =
			patient.phone || "";
		(document.getElementById("modalAddress") as HTMLTextAreaElement).value =
			patient.address || "";
		(
			document.getElementById("modalPaymentType") as HTMLSelectElement
		).value = patient.payment_type;

		if (patient.referring_doctor_id) {
			(
				document.getElementById(
					"modalReferringDoctor"
				) as HTMLSelectElement
			).value = patient.referring_doctor_id.toString();
		}

		if (patient.guardian_info) {
			const guardian = patient.guardian_info;
			(
				document.getElementById("modalGuardianName") as HTMLInputElement
			).value = guardian.name || "";
			(
				document.getElementById(
					"modalGuardianPhone"
				) as HTMLInputElement
			).value = guardian.phone || "";
			(
				document.getElementById(
					"modalGuardianNationalId"
				) as HTMLInputElement
			).value = guardian.national_id || "";
			(
				document.getElementById(
					"modalGuardianAddress"
				) as HTMLTextAreaElement
			).value = guardian.address || "";
		}

		if (patient.payment_type === "insurance") {
			this.showInsuranceFields();
			if (patient.insurance_id) {
				(
					document.getElementById(
						"modalInsuranceCompany"
					) as HTMLSelectElement
				).value = patient.insurance_id.toString();
			}
			(
				document.getElementById(
					"modalInsuranceCardId"
				) as HTMLInputElement
			).value = patient.insurance_card_id || "";
			(
				document.getElementById(
					"modalInsuranceFormId"
				) as HTMLInputElement
			).value = patient.insurance_form_id || "";
		}

		if (this.currentAdmission) {
			this.toggleAdmissionSection(true);

			// Set quick check value
			(
				document.getElementById(
					"modalAdmissionQuickCheck"
				) as HTMLInputElement
			).checked = this.currentAdmission.quick_check || false;

			// Set diagnosis
			(
				document.getElementById("modalDiagnosis") as HTMLTextAreaElement
			).value = this.currentAdmission.diagnosis || "";

			// Set attending doctors
			if (this.currentAdmission.attending_doctor_ids) {
				this.currentAdmission.attending_doctor_ids.forEach(
					(doctorId) => {
						const checkbox = document.getElementById(
							`doctor_${doctorId}`
						) as HTMLInputElement;
						if (checkbox) checkbox.checked = true;
					}
				);
			}

			// Set attending nurses
			if (this.currentAdmission.attending_nurse_ids) {
				this.currentAdmission.attending_nurse_ids.forEach((nurseId) => {
					const checkbox = document.getElementById(
						`nurse_${nurseId}`
					) as HTMLInputElement;
					if (checkbox) checkbox.checked = true;
				});
			}
		}
	}

	private handlePaymentTypeChange(paymentType: string): void {
		if (paymentType === "insurance") {
			this.showInsuranceFields();
		} else {
			this.hideInsuranceFields();
		}
	}

	private showInsuranceFields(): void {
		document.getElementById("insuranceCompanyGroup")!.style.display =
			"block";
		document.getElementById("insuranceCardGroup")!.style.display = "block";
		document.getElementById("insuranceFormGroup")!.style.display = "block";
	}

	private hideInsuranceFields(): void {
		document.getElementById("insuranceCompanyGroup")!.style.display =
			"none";
		document.getElementById("insuranceCardGroup")!.style.display = "none";
		document.getElementById("insuranceFormGroup")!.style.display = "none";
		(
			document.getElementById(
				"modalInsuranceCompany"
			) as HTMLSelectElement
		).value = "";
		(
			document.getElementById("modalInsuranceCardId") as HTMLInputElement
		).value = "";
		(
			document.getElementById("modalInsuranceFormId") as HTMLInputElement
		).value = "";
	}

	private toggleAdmissionSection(show: boolean): void {
		const section = document.getElementById("admissionSection")!;
		section.style.display = show ? "block" : "none";
	}

	private async savePatient(): Promise<void> {
		const form = document.getElementById("patientForm") as HTMLFormElement;
		const saveBtn = document.getElementById(
			"savePatientBtn"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		try {
			this.setButtonLoading(saveBtn, true);

			const patientId = (
				document.getElementById("patientId") as HTMLInputElement
			).value;
			const isEdit = !!patientId;

			const guardianName = (
				document.getElementById("modalGuardianName") as HTMLInputElement
			).value.trim();
			const guardianPhone = (
				document.getElementById(
					"modalGuardianPhone"
				) as HTMLInputElement
			).value.trim();
			const guardianNationalId = (
				document.getElementById(
					"modalGuardianNationalId"
				) as HTMLInputElement
			).value.trim();
			const guardianAddress = (
				document.getElementById(
					"modalGuardianAddress"
				) as HTMLTextAreaElement
			).value.trim();

			const guardianInfo =
				guardianName ||
					guardianPhone ||
					guardianNationalId ||
					guardianAddress
					? {
						name: guardianName,
						phone: guardianPhone,
						national_id: guardianNationalId,
						address: guardianAddress
					}
					: null;

			const patientData: any = {
				name: (
					document.getElementById(
						"modalPatientName"
					) as HTMLInputElement
				).value.trim(),
				gender: (
					document.getElementById("modalGender") as HTMLSelectElement
				).value,
				national_id: (
					document.getElementById(
						"modalNationalID"
					) as HTMLInputElement
				).value,
				phone:
					(
						document.getElementById(
							"modalPhone"
						) as HTMLInputElement
					).value.trim() || null,
				address:
					(
						document.getElementById(
							"modalAddress"
						) as HTMLTextAreaElement
					).value.trim() || null,
				payment_type: (
					document.getElementById(
						"modalPaymentType"
					) as HTMLSelectElement
				).value,
				guardian_info: guardianInfo
			};

			const referringDoctorId = (
				document.getElementById(
					"modalReferringDoctor"
				) as HTMLSelectElement
			).value;
			if (referringDoctorId) {
				patientData.referring_doctor_id = parseInt(referringDoctorId);
			}

			// Handle insurance information
			if (patientData.payment_type === "insurance") {
				const insuranceCompanyId = (
					document.getElementById(
						"modalInsuranceCompany"
					) as HTMLSelectElement
				).value;
				const insuranceCardId = (
					document.getElementById(
						"modalInsuranceCardId"
					) as HTMLInputElement
				).value.trim();

				const insuranceFormId = (
					document.getElementById(
						"modalInsuranceFormId"
					) as HTMLInputElement
				).value.trim();

				if (!insuranceCompanyId) {
					this.showError(
						i18n.t("patients.validation.insuranceCompanyRequired")
					);
					return;
				}

				patientData.insurance_id = parseInt(insuranceCompanyId);
				patientData.insurance_card_id = insuranceCardId || null;
				patientData.insurance_form_id = insuranceFormId || null;
			}

			// Handle admission if checkbox is checked
			const admitPatient = (
				document.getElementById("modalAdmitPatient") as HTMLInputElement
			).checked;
			if (
				(isEdit && this.currentAdmission) ||
				(!isEdit && admitPatient)
			) {
				const diagnosis = (
					document.getElementById(
						"modalDiagnosis"
					) as HTMLTextAreaElement
				).value.trim();
				const attendingDoctorCheckboxes = document.querySelectorAll(
					'#attendingDoctorsSelection input[type="checkbox"]:checked'
				);
				const attendingNurseCheckboxes = document.querySelectorAll(
					'#attendingNursesSelection input[type="checkbox"]:checked'
				);
				if (!diagnosis) {
					this.showError(
						i18n.t("patients.validation.diagnosisRequired")
					);
					return;
				}

				if (attendingDoctorCheckboxes.length === 0) {
					this.showError(
						i18n.t("patients.validation.attendingDoctorRequired")
					);
					return;
				}
				if (attendingNurseCheckboxes.length === 0) {
					this.showError(i18n.t("patients.validation.nurseRequired"));
					return;
				}
				patientData.diagnosis = diagnosis;
				patientData.quick_check = (
					document.getElementById(
						"modalAdmissionQuickCheck"
					) as HTMLInputElement
				).checked;

				if (isEdit) {
					let attendingDoctors = {
						add: [] as (number | null)[],
						remove: [] as (number | null)[]
					};
					attendingDoctors.add =
						Array.from(attendingDoctorCheckboxes)
							.map((checkbox) => {
								let doctorId = parseInt(
									(checkbox as HTMLInputElement).value
								);

								if (
									this.currentAdmission!.attending_doctor_ids?.find(
										(id) => id === doctorId
									)
								) {
									return null;
								}

								return doctorId;
							})
							.filter((id) => id !== null) ?? [];
					attendingDoctors.remove =
						this.currentAdmission!.attending_doctor_ids?.filter(
							(id) =>
								!Array.from(attendingDoctorCheckboxes).find(
									(checkbox) =>
										parseInt(
											(checkbox as HTMLInputElement).value
										) === id
								)
						).filter((id) => id !== null) ?? [];
					patientData.attending_doctors = attendingDoctors;

					let attendingNurses = {
						add: [] as (number | null)[],
						remove: [] as (number | null)[]
					};

					attendingNurses.add =
						Array.from(attendingNurseCheckboxes)
							.map((checkbox) => {
								let nurseId = parseInt(
									(checkbox as HTMLInputElement).value
								);

								if (
									this.currentAdmission!.attending_nurse_ids?.find(
										(id) => id === nurseId
									)
								) {
									return null;
								}

								return nurseId;
							})
							.filter((id) => id !== null) ?? [];

					attendingNurses.remove =
						this.currentAdmission!.attending_nurse_ids?.filter(
							(id) =>
								!Array.from(attendingNurseCheckboxes).find(
									(checkbox) =>
										parseInt(
											(checkbox as HTMLInputElement).value
										) === id
								)
						).filter((id) => id !== null) ?? [];

					patientData.attending_nurses = attendingNurses;
				} else {
					const priceList = (
						document.getElementById(
							"modalPriceList"
						) as HTMLSelectElement
					).value;
					const pricelistId = priceList ? parseInt(priceList) : null;

					patientData.attending_doctors = Array.from(
						attendingDoctorCheckboxes
					).map((checkbox) =>
						parseInt((checkbox as HTMLInputElement).value)
					);

					if (attendingNurseCheckboxes.length > 0) {
						patientData.attending_nurses = Array.from(
							attendingNurseCheckboxes
						).map((checkbox) =>
							parseInt((checkbox as HTMLInputElement).value)
						);
					}
					patientData.pricelist_id = pricelistId;
					patientData.admit_patient = true;
				}
			}

			const url = isEdit ? `/api/patients/${patientId}` : "/api/patients";
			const method = isEdit ? "PUT" : "POST";

			const response = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				},
				body: JSON.stringify(patientData)
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(
					error.error ||
					`Failed to ${isEdit ? "update" : "create"} patient`
				);
			}

			const result = await response.json();
			this.patientModal.hide();

			const successMessage = isEdit
				? i18n.t("patients.messages.patientUpdated")
				: admitPatient
					? `${i18n.t("patients.messages.patientCreated")} ${i18n.t(
						"patients.messages.patientAdmitted"
					)}`
					: i18n.t("patients.messages.patientCreated");

			this.showSuccess(successMessage);

			// If this was a new patient creation, load the patient data
			if (!isEdit) {
				const newPatientId = result.patient
					? result.patient.patient_id
					: result.patient_id;
				await this.selectPatient(newPatientId);

				// Update search input
				const searchInput = document.getElementById(
					"patientSearch"
				) as HTMLInputElement;
				searchInput.value = result.patient
					? result.patient.name
					: result.name;
			} else {
				// Reload current patient data
				await this.loadPatientData(parseInt(patientId));
			}
		} catch (error: any) {
			console.error("Error saving patient:", error);
			this.showError(
				error.message || i18n.t("patients.messages.savePatientError")
			);
		} finally {
			this.setButtonLoading(saveBtn, false);
		}
	}

	private showAdmitPatientModal(): void {
		if (!this.currentPatient || this.currentPatient.is_active) {
			return;
		}

		Swal.fire({
			title: i18n.t("patients.messages.admitPatientTitle"),
			html: `
                <div class="mb-3">
                    <label for="swal-diagnosis" class="form-label">${i18n.t(
				"patients.fields.diagnosis"
			)}</label>
                    <textarea id="swal-diagnosis" class="form-control" rows="3" placeholder="${i18n.t(
				"patients.fields.diagnosis"
			)}"></textarea>
                </div>
				<div class="mb-3">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="swal-admission-quick-check">
                    <label class="form-check-label" for="swal-admission-quick-check">
                      ${i18n.t("patients.fields.quickCheckAdmission")}
                    </label>
                    <div class="form-text">${i18n.t(
				"patients.help.quickCheckInfo"
			)}</div>
                  </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">${i18n.t(
				"patients.fields.attendingDoctors"
			)}</label>
                    <div class="doctors-selection" style="max-height: 200px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 0.375rem; padding: 0.75rem;">
                        ${this.doctors
					.map(
						(doctor) => `
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" value="${doctor.employee_id
							}" id="swal-doctor-${doctor.employee_id}">
                                <label class="form-check-label" for="swal-doctor-${doctor.employee_id
							}">
									${this.escapeHtml(doctor.name)} (${i18n.t(
								`patients.doctorTypes.${doctor.doctor_type}`
							)})
                                </label>
                            </div>
                        `
					)
					.join("")}
                    </div>
                </div>
				<div class="mb-3">
				    <label class="form-label">${i18n.t(
						"patients.fields.attendingNurses"
					)}</label>
				    <div class="nurses-selection" style="max-height: 200px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 0.375rem; padding: 0.75rem;">
				        ${this.nurses
					.map(
						(nurse) => `
				            <div class="form-check">
				                <input class="form-check-input" type="checkbox" value="${nurse.employee_id
							}" id="swal-nurse-${nurse.employee_id}">
				                <label class="form-check-label" for="swal-nurse-${nurse.employee_id
							}">
				                    ${this.escapeHtml(nurse.name)}
				                </label>
				            </div>
				        `
					)
					.join("")}
				    </div>
				</div>
				<div class="mb-3">
                    <label for="swal-pricelist" class="form-label">${i18n.t(
						"patients.fields.priceList"
					)}</label>
                    <select id="swal-pricelist" class="form-select">
                        <option value="">${i18n.t(
						"patients.placeholders.default"
					)}</option>
                        ${this.priceLists
					.map(
						(list) =>
							`<option value="${list.pricelist_id
							}">${this.escapeHtml(list.name)}</option>`
					)
					.join("")}
                    </select>
                </div>
            `,
			showCancelButton: true,
			confirmButtonText: i18n.t("patients.buttons.admitPatient"),
			cancelButtonText: i18n.t("common.cancel"),
			confirmButtonColor: "#28a745",
			cancelButtonColor: "#6c757d",
			preConfirm: () => {
				const quickCheck = (
					document.getElementById(
						"swal-admission-quick-check"
					) as HTMLInputElement
				).checked;
				const diagnosis = (
					document.getElementById(
						"swal-diagnosis"
					) as HTMLTextAreaElement
				).value.trim();
				const selectedDoctors = Array.from(
					document.querySelectorAll(
						'input[id^="swal-doctor-"]:checked'
					)
				).map((checkbox) =>
					parseInt((checkbox as HTMLInputElement).value)
				);
				const selectedNurses = Array.from(
					document.querySelectorAll(
						'input[id^="swal-nurse-"]:checked'
					)
				).map((checkbox) =>
					parseInt((checkbox as HTMLInputElement).value)
				);
				const pricelist = (
					document.getElementById(
						"swal-pricelist"
					) as HTMLSelectElement
				).value;
				const pricelistId = pricelist ? parseInt(pricelist) : null;

				if (!diagnosis) {
					Swal.showValidationMessage(
						i18n.t("patients.validation.diagnosisRequired")
					);
					return false;
				}

				if (selectedDoctors.length === 0) {
					Swal.showValidationMessage(
						i18n.t("patients.validation.attendingDoctorRequired")
					);
					return false;
				}

				return {
					quick_check: quickCheck,
					diagnosis: diagnosis,
					attending_doctors: selectedDoctors,
					attending_nurses: selectedNurses,
					pricelist_id: pricelistId
				};
			}
		}).then(async (result: any) => {
			if (result.isConfirmed && result.value) {
				await this.admitPatient(
					result.value.quick_check,
					result.value.diagnosis,
					result.value.attending_doctors,
					result.value.attending_nurses,
					result.value.pricelist_id
				);
			}
		});
	}

	private async admitPatient(
		quickCheck: boolean,
		diagnosis: string,
		attendingDoctors: number[],
		attendingNurses: number[],
		pricelistId: number | null
	): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const response = await fetch(
				`/api/patients/${this.currentPatient.patient_id}/admit`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						quick_check: quickCheck,
						diagnosis: diagnosis,
						attending_doctors: attendingDoctors,
						attending_nurses: attendingNurses,
						pricelist_id: pricelistId
					})
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to admit patient");
			}

			this.showSuccess(i18n.t("patients.messages.patientAdmitted"));
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error admitting patient:", error);
			this.showError(
				error.message || i18n.t("patients.messages.admitPatientError")
			);
		}
	}

	private showDischargeModal(): void {
		if (!this.currentPatient || !this.currentPatient.is_active) {
			return;
		}

		document
			.getElementById("dischargeForm")!
			.classList.remove("was-validated");
		(document.getElementById("leaveReason") as HTMLSelectElement).value =
			"";
		(document.getElementById("dischargeTime") as HTMLInputElement).value =
			"";

		this.dischargeModal.show();
	}

	private async dischargePatient(): Promise<void> {
		const form = document.getElementById(
			"dischargeForm"
		) as HTMLFormElement;
		const dischargeBtn = document.getElementById(
			"confirmDischargeBtn"
		) as HTMLButtonElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		if (!this.currentPatient) return;

		try {
			this.setButtonLoading(dischargeBtn, true);

			const leaveReason = (
				document.getElementById("leaveReason") as HTMLSelectElement
			).value;
			const dischargeTime = (
				document.getElementById("dischargeTime") as HTMLInputElement
			).value;

			const dischargeData: any = {
				leave_reason: leaveReason
			};

			if (dischargeTime) {
				dischargeData.discharge_time = dischargeTime;
			}

			const response = await fetch(
				`/api/patients/${this.currentPatient.patient_id}/discharge`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(dischargeData)
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to discharge patient");
			}

			this.dischargeModal.hide();
			this.showSuccess(i18n.t("patients.messages.patientDischarged"));
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error discharging patient:", error);
			this.showError(
				error.message ||
				i18n.t("patients.messages.dischargePatientError")
			);
		} finally {
			this.setButtonLoading(dischargeBtn, false);
		}
	}

	private showAddServiceModal(): void {
		if (!this.currentPatient || !this.currentPatient.is_active) {
			this.showError(i18n.t("patients.messages.patientMustBeAdmitted"));
			return;
		}

		this.renderAvailableServices();
		this.addServiceModal.show();
	}

	private renderAvailableServices(): void {
		const searchInput = document.getElementById(
			"serviceSearch"
		) as HTMLInputElement;

		searchInput.oninput = () => {
			this.filterAndRenderServices(searchInput.value.trim());
		};

		this.filterAndRenderServices("");
	}

	private filterAndRenderServices(searchTerm: string): void {
		const container = document.getElementById("availableServicesList")!;
		const assignedServiceIds = new Set(
			this.assignedServices
				.filter((s) => s.is_active)
				.map((s) => s.service_id)
		);

		let filteredServices = this.availableServices.filter(
			(service) =>
				!assignedServiceIds.has(service.service_id) &&
				(searchTerm === "" ||
					service.name
						.toLowerCase()
						.includes(searchTerm.toLowerCase()))
		);

		if (filteredServices.length === 0) {
			container.innerHTML = `<div class="text-muted text-center py-4">${i18n.t(
				"patients.messages.noAvailableServices"
			)}</div>`;
			return;
		}

		container.innerHTML = filteredServices
			.map((service) => {
				const price = this.servicePrices.get(service.service_id);
				if (!price) return "";
				return `
            <div class="available-item" onclick="patientManager.addServiceToPatient(${service.service_id
					})">
                <div class="available-item-info">
                    <div class="available-item-name">${this.escapeHtml(
						service.name
					)}</div>
                    <div class="available-item-details">
                        ${i18n.t(
						"patients.table.type"
					)}: ${this.formatServiceType(service.service_type)}
                        ${service.auto_renew
						? ` • ${i18n.t("services.table.autoRenew")}`
						: ""
					}
                    </div>
                </div>
                <div class="available-item-price">${i18n.formatCurrency(
						+price || 0
					)}</div>
                <div class="available-item-actions">
                    <button class="btn btn-primary">${i18n.t(
						"patients.buttons.addService"
					)}</button>
                </div>
            </div>
        `;
			})
			.join("");
	}

	public async addServiceToPatient(serviceId: number): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const service = this.availableServices.find(
				(s) => s.service_id === serviceId
			);
			if (!service) throw new Error("Service not found");

			const price = this.servicePrices.get(serviceId) ?? service.price;

			const response = await fetch(
				`/api/patients/${this.currentPatient.patient_id}/services`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({ service_id: serviceId, price })
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to add service");
			}

			let searchTerm = (
				document.getElementById("serviceSearch") as HTMLInputElement
			).value.trim();
			this.filterAndRenderServices(searchTerm || "");
			this.showSuccess(i18n.t("patients.messages.serviceAdded"));

			// Reload patient data
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error adding service:", error);
			this.showError(
				error.message || i18n.t("patients.messages.addServiceError")
			);
		}
	}

	public async removeService(serviceId: number): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const result = await Swal.fire({
				title: i18n.t("patients.messages.removeServiceTitle"),
				text: i18n.t("patients.messages.removeServiceText"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("patients.buttons.remove"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const response = await fetch(
					`/api/patients/${this.currentPatient.patient_id}/services/${serviceId}`,
					{
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);

				if (!response.ok) {
					throw new Error("Failed to remove service");
				}

				this.showSuccess(i18n.t("patients.messages.serviceRemoved"));
				await this.loadPatientData(this.currentPatient.patient_id);
			}
		} catch (error) {
			console.error("Error removing service:", error);
			this.showError(i18n.t("patients.messages.removeServiceError"));
		}
	}

	private showAddDrugModal(): void {
		if (!this.currentPatient || !this.currentPatient.is_active) {
			this.showError(i18n.t("patients.messages.patientMustBeAdmitted"));
			return;
		}

		this.renderAvailableDrugs();
		this.addDrugModal.show();
	}

	private renderAvailableDrugs(): void {
		const searchInput = document.getElementById(
			"drugSearch"
		) as HTMLInputElement;

		searchInput.oninput = () => {
			this.filterAndRenderDrugs(searchInput.value.trim());
		};

		this.filterAndRenderDrugs("");
	}

	private async filterAndRenderDrugs(searchTerm: string): Promise<void> {
		const container = document.getElementById("availableDrugsList")!;

		let filteredDrugs = this.availableDrugs.filter(
			(drug) =>
				drug.available_quantity > 0 &&
				(searchTerm === "" ||
					drug.name.toLowerCase().includes(searchTerm.toLowerCase()))
		);

		if (filteredDrugs.length === 0) {
			container.innerHTML = `<div class="text-muted text-center py-4">${i18n.t(
				"patients.messages.noAvailableDrugs"
			)}</div>`;
			return;
		}

		// Get pricelist_id for fetching prices
		let pricelistId = this.currentAdmission?.pricelist_id;

		// Fetch prices for all filtered drugs
		// 2. Fetch shipments **in parallel** and keep only drugs that have a price for the current pricelist
		const drugsWithPrices = (
			await Promise.all(
				filteredDrugs.map(async (drug) => {
					try {
						const url = `/api/pharmacy/drugs/shipments/drug/${drug.drug_id}`;
						const response = await fetch(url, {
							headers: {
								Authorization: `Bearer ${localStorage.getItem(
									"token"
								)}`
							}
						});

						if (!response.ok) return null; // skip on HTTP error

						const shipments: Array<{
							prices: Array<{
								pricelist_id: number;
								price: number | null;
							}>;
						}> = await response.json();

						// Find the first shipment that contains a price for the current pricelist
						const priceInfo = shipments
							.flatMap((s) => s.prices ?? [])
							.find(
								(p) =>
									p.pricelist_id == pricelistId &&
									p.price != null
							);

						if (!priceInfo) return null; // no price → discard drug

						return {
							...drug,
							displayPrice: priceInfo.price ?? 0
						};
					} catch (err) {
						console.error(
							`Error fetching shipments for drug ${drug.drug_id}:`,
							err
						);
						return null;
					}
				})
			)
		).filter((drug): drug is NonNullable<typeof drug> => drug !== null);

		container.innerHTML = drugsWithPrices
			.map(
				(drug) => `
			<div class="available-item" onclick="patientManager.showAddDrugQuantityModal(${drug.drug_id
					})">
				<div class="available-item-info">
					<div class="available-item-name">${this.escapeHtml(drug.name)}</div>
					<div class="available-item-details">
						${i18n.t("patients.table.available")}: ${drug.available_quantity} ${drug.unit_conversion?.smaller || "units"
					}
						${drug.manufacturer ? ` • ${this.escapeHtml(drug.manufacturer)}` : ""}
					</div>
				</div>
				<div class="available-item-price">${i18n.formatCurrency(
						drug.displayPrice
					)}</div>
				<div class="available-item-actions">
					<button class="btn btn-primary">${i18n.t("patients.buttons.addDrug")}</button>
				</div>
			</div>
		`
			)
			.join("");
	}

	public showAddDrugQuantityModal(drugId: number): void {
		const drug = this.availableDrugs.find((d) => d.drug_id === drugId);
		if (!drug) return;

		const ratio = drug.unit_conversion?.ratio || 1;
		const maxLargerUnit = Math.floor(drug.available_quantity / ratio);
		const maxSmallerUnit = drug.available_quantity;

		Swal.fire({
			title: i18n.t("patients.messages.addDrugTitle", {
				drugName: drug.name
			}),
			html: `
				<div class="mb-3">
					<label for="swal-quantity-larger" class="form-label">${i18n.t(
				"patients.messages.quantityLabel",
				{
					unit:
						drug.unit_conversion?.larger ||
						i18n.t("common.units")
				}
			)}</label>
					<input type="number" id="swal-quantity-larger" class="form-control" min="0" max="${maxLargerUnit}" value="0">
					<div class="form-text">${i18n.t("patients.messages.availableQuantity", {
				quantity: maxLargerUnit,
				unit: drug.unit_conversion?.larger || "units"
			})}</div>
				</div>
				<div class="mb-3">
					<label for="swal-quantity-smaller" class="form-label">${i18n.t(
				"patients.messages.quantityLabel",
				{
					unit:
						drug.unit_conversion?.smaller ||
						i18n.t("common.units")
				}
			)}</label>
					<input type="number" id="swal-quantity-smaller" class="form-control" min="0" max="${maxSmallerUnit}" value="0">
					<div class="form-text">${i18n.t("patients.messages.availableQuantity", {
				quantity: maxSmallerUnit,
				unit: drug.unit_conversion?.smaller || "units"
			})}</div>
				</div>
			`,
			showCancelButton: true,
			confirmButtonText: i18n.t("patients.buttons.addDrug"),
			cancelButtonText: i18n.t("common.cancel"),
			confirmButtonColor: "#28a745",
			preConfirm: () => {
				const quantityLarger =
					parseInt(
						(
							document.getElementById(
								"swal-quantity-larger"
							) as HTMLInputElement
						).value
					) || 0;
				const quantitySmaller =
					parseInt(
						(
							document.getElementById(
								"swal-quantity-smaller"
							) as HTMLInputElement
						).value
					) || 0;

				// Calculate total quantity in smaller units
				const totalQuantity = quantityLarger * ratio + quantitySmaller;

				if (totalQuantity <= 0) {
					Swal.showValidationMessage(
						i18n.t("patients.messages.enterValidQuantity")
					);
					return false;
				}

				if (totalQuantity > maxSmallerUnit) {
					Swal.showValidationMessage(
						i18n.t("patients.messages.quantityExceedsAvailable")
					);
					return false;
				}

				return totalQuantity;
			}
		}).then(async (result: any) => {
			if (result.isConfirmed) {
				await this.addDrugToPatient(drugId, result.value);
			}
		});
	}

	private async addDrugToPatient(
		drugId: number,
		quantity: number
	): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const drug = this.availableDrugs.find((d) => d.drug_id === drugId);
			if (!drug) throw new Error("Drug not found");

			// Find available shipment
			const shipments = await this.getAvailableShipments(drugId);
			if (shipments.length === 0) {
				throw new Error("No available shipments for this drug");
			}

			if (!this.currentAdmission) {
				throw new Error("Patient must be admitted to add drugs");
			}

			const shipment = shipments[0]; // Use first available (FIFO)

			const sellingPrice = (shipment.prices as DrugPrice[]).find(
				(p: DrugPrice) =>
					p.pricelist_id == this.currentAdmission?.pricelist_id
			)!.price;

			const response = await fetch(
				`/api/patients/${this.currentPatient.patient_id}/drugs`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						patient_id: this.currentPatient.patient_id,
						drug_id: drugId,
						patient_history_id:
							this.currentAdmission?.patient_history_id,
						shipment_id: shipment.shipment_id,
						quantity: quantity,
						price: sellingPrice
					})
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to add drug");
			}

			let searchTerm = (
				document.getElementById("drugSearch") as HTMLInputElement
			).value.trim();
			this.filterAndRenderDrugs(searchTerm || "");
			this.showSuccess(i18n.t("patients.messages.drugAdded"));

			// Reload patient data
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error adding drug:", error);
			this.showError(
				error.message || i18n.t("patients.messages.addDrugError")
			);
		}
	}

	private async getAvailableShipments(drugId: number): Promise<any[]> {
		try {
			let pricelistId = this.currentAdmission?.pricelist_id;
			if (!pricelistId) {
				const defRes = await fetch("/api/price-lists/default", {
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (defRes.ok) {
					const defPl = await defRes.json();
					pricelistId = defPl.pricelist_id;
				}
			}
			const url = `/api/pharmacy/drugs/shipments/drug/${drugId}`;

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch shipments");

			return await response.json();
		} catch (error) {
			console.error("Error fetching shipments:", error);
			return [];
		}
	}

	public async administerDrug(usageId: number): Promise<void> {
		try {
			const result = await Swal.fire({
				title: i18n.t("patients.messages.administerDrugTitle"),
				text: i18n.t("patients.messages.administerDrugText"),
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#28a745",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("patients.buttons.administer"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				await this.loadAssignedDrugs(this.currentPatient!.patient_id);
				const remaining_quantity = this.assignedDrugs.find(
					(d) => d.usage_id === usageId
				)?.remaining_quantity;

				if (
					remaining_quantity === undefined ||
					remaining_quantity <= 0
				) {
					throw new Error(
						i18n.t("patients.messages.noRemainingQuantity")
					);
				}
				const response = await fetch(
					`/api/pharmacy/drugs/usages/${usageId}`,
					{
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						},
						body: JSON.stringify({
							remaining_quantity: +remaining_quantity - 1,
							last_administered: new Date().toISOString()
						})
					}
				);

				if (!response.ok) {
					throw new Error("Failed to administer drug");
				}

				this.showSuccess(i18n.t("patients.messages.drugAdministered"));
				if (this.currentPatient) {
					await this.loadAssignedDrugs(
						this.currentPatient.patient_id
					);
					this.updateAssignedDrugsDisplay();
				}
			}
		} catch (error) {
			console.error("Error administering drug:", error);
			this.showError(i18n.t("patients.messages.administerDrugError"));
		}
	}

	private async showPastAdmissionsModal(): Promise<void> {
		if (!this.currentPatient) {
			this.showError(i18n.t("patients.messages.noBillSelected"));
			return;
		}

		try {
			const response = await fetch(
				`/api/patients/${this.currentPatient.patient_id}/admissions/past`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error("Failed to fetch past admissions");
			}

			const pastAdmissions = await response.json();
			this.displayPastAdmissions(pastAdmissions);
			this.pastAdmissionsModal.show();
		} catch (error) {
			console.error("Error fetching past admissions:", error);
			this.showError(i18n.t("patients.messages.loadAdmissionsError"));
		}
	}

	private displayPastAdmissions(admissions: any[]): void {
		const container = document.getElementById("pastAdmissionsContent")!;

		if (admissions.length === 0) {
			container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-clock-history" style="font-size: 3rem;"></i>
                <h5 class="mt-3">${i18n.t(
				"patients.messages.noPastAdmissions"
			)}</h5>
                <p>${i18n.t("patients.messages.noPastAdmissionsText")}</p>
            </div>
        `;
			return;
		}

		container.innerHTML = `
        <div class="past-admissions-list">
            ${admissions
				.map((admission) => this.renderAdmissionCard(admission))
				.join("")}
        </div>
    `;
	}

	private renderAdmissionCard(admission: any): string {
		const admissionDate = i18n.formatDate(admission.admission_time);
		const dismissalDate = i18n.formatDate(admission.discharge_time);
		const totalServices = admission.total_services_count || 0;
		const totalDrugs = admission.total_drugs_count || 0;
		const totalOwed = parseFloat(admission.total_amount || 0);
		const totalPaid = parseFloat(admission.paid_amount || 0);
		const balance = totalOwed - totalPaid;

		const doctors = admission.assigned_doctors || [];
		const nurses = admission.assigned_nurses || [];

		return `
        <div class="admission-card" onclick="patientManager.showAdmissionDetails(${admission.patient_history_id
			})">
            <div class="admission-card-header">
                <div class="admission-date-range">
                    ${admissionDate} - ${dismissalDate}
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">${i18n.t(
				"patients.messages.admissionId"
			)}: ${admission.patient_history_id}</small>
                    <span class="dismissal-reason-badge dismissal-reason-${admission.leave_reason
			}">
                        ${this.formatDismissalReason(admission.leave_reason)}
                    </span>
                </div>
            </div>
            <div class="admission-card-body">
                <div class="admission-summary">
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">${i18n.t(
				"patients.messages.servicesUsed"
			)}</span>
                        <span class="admission-summary-value">${totalServices}</span>
                    </div>
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">${i18n.t(
				"patients.messages.drugsUsed"
			)}</span>
                        <span class="admission-summary-value">${totalDrugs}</span>
                    </div>
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">${i18n.t(
				"patients.messages.totalOwed"
			)}</span>
                        <span class="admission-summary-value">${i18n.formatCurrency(
				totalOwed
			)}</span>
                    </div>
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">${i18n.t(
				"patients.billing.balance"
			)}</span>
                        <span class="admission-summary-value ${balance > 0 ? "text-danger" : "text-success"
			}">
                            ${i18n.formatCurrency(Math.abs(balance))} ${balance > 0
				? i18n.t("patients.messages.due")
				: i18n.t("patients.messages.credit")
			}
                        </span>
                    </div>
                </div>
                
                <div class="admission-staff-list">
                    <div class="mb-2">
                        <strong class="text-muted">${i18n.t(
				"patients.messages.assignedDoctors"
			)}:</strong>
                        ${doctors.length > 0
				? doctors
					.map(
						(doctor: any) =>
							`<span class="admission-staff-item">${this.escapeHtml(
								doctor
							)}</span>`
					)
					.join("")
				: `<span class="text-muted">${i18n.t(
					"patients.messages.noDoctorsAssigned"
				)}</span>`
			}
                    </div>
                    <div>
                        <strong class="text-muted">${i18n.t(
				"patients.messages.assignedNurses"
			)}:</strong>
                        ${nurses.length > 0
				? nurses
					.map(
						(nurse: any) =>
							`<span class="admission-staff-item">${this.escapeHtml(
								nurse
							)}</span>`
					)
					.join("")
				: `<span class="text-muted">${i18n.t(
					"patients.messages.noNursesAssigned"
				)}</span>`
			}
                    </div>
                </div>
                
                ${admission.diagnosis
				? `
                    <div class="admission-diagnosis">
                        <strong>${i18n.t(
					"patients.messages.finalDiagnosis"
				)}:</strong> ${this.escapeHtml(admission.diagnosis)}
                    </div>
                `
				: ""
			}
            </div>
        </div>
    `;
	}

	public async showAdmissionDetails(patientHistoryId: number): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const response = await fetch(
				`/api/patients/${this.currentPatient.patient_id}/admissions/${patientHistoryId}/details`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok) {
				throw new Error("Failed to fetch admission details");
			}

			this.currentAdmissionDetails = await response.json();
			this.displayAdmissionDetails(this.currentAdmissionDetails);

			// Hide past admissions modal and show details modal
			this.pastAdmissionsModal.hide();
			this.admissionDetailsModal.show();
		} catch (error) {
			console.error("Error fetching admission details:", error);
			this.showError(
				i18n.t("patients.messages.loadAdmissionDetailsError")
			);
		}
	}

	private displayAdmissionDetails(admission: any): void {
		const container = document.getElementById("admissionDetailsContent")!;

		const admissionDate = i18n.formatDateTime(admission.admission_time);
		const dismissalDate = i18n.formatDateTime(admission.discharge_time);
		const totalAmount = parseFloat(admission.total_amount || 0);
		const paidAmount = parseFloat(admission.paid_amount || 0);
		const balance = totalAmount - paidAmount;

		const doctors = admission.assigned_doctors || [];
		const nurses = admission.assigned_nurses || [];
		const services = this.groupServicesByServiceId(
			admission.services || []
		);
		const drugs = this.groupDrugsByDrugId(admission.drugs || []);
		const supplies = this.groupSuppliesBySupplyId(admission.supplies || []);

		// Calculate discount and VAT amounts based on scopes
		const servicesTotal = admission.services_total || 0;
		const drugsTotal = admission.drugs_total || 0;
		const suppliesTotal = admission.supplies_total || 0;
		const medicalTestsAmount = parseFloat(admission.medical_tests_amount || 0);

		const categoryTotals: Record<string, number> = {
			services: servicesTotal,
			drugs: drugsTotal,
			supplies: suppliesTotal,
			tests: medicalTestsAmount
		};

		const discountScope = admission.discount_scope || ['services', 'drugs', 'supplies', 'tests'];
		const vatScope = admission.vat_scope_custom || ['services', 'drugs', 'supplies', 'tests'];

		let discountAmount = 0;
		const discount = parseFloat(admission.discount || 0);
		if (discount > 0) {
			let discountableAmount = 0;
			discountScope.forEach((c: string) => {
				if (categoryTotals[c]) discountableAmount += categoryTotals[c];
			});
			if (discountableAmount > 0) {
				if (admission.discount_type === "percentage") {
					discountAmount = (discountableAmount * discount) / 100;
				} else {
					discountAmount = discount;
				}
			}
		}

		let vattableCategoriesTotal = 0;
		vatScope.forEach((c: string) => {
			if (categoryTotals[c]) vattableCategoriesTotal += categoryTotals[c];
		});

		let vatBase = 0;
		if (vattableCategoriesTotal > 0) {
			if (discountAmount === 0) {
				vatBase = vattableCategoriesTotal;
			} else {
				let vattableAndDiscountableTotal = 0;
				let discountableAmount = 0;
				discountScope.forEach((c: string) => {
					if (categoryTotals[c]) discountableAmount += categoryTotals[c];
				});
				if (discountableAmount > 0) {
					vatScope.forEach((c: string) => {
						if (discountScope.includes(c) && categoryTotals[c]) {
							vattableAndDiscountableTotal += categoryTotals[c];
						}
					});
					const vattableDiscount = (vattableAndDiscountableTotal / discountableAmount) * discountAmount;
					vatBase = vattableCategoriesTotal - vattableDiscount;
				} else {
					vatBase = vattableCategoriesTotal;
				}
			}
		}

		const vatPercentage = parseFloat(admission.vat_percentage || 0);
		const adminExpenses = parseFloat(admission.administrative_expenses || 0);
		const vatAmount = ((vatBase + adminExpenses) * vatPercentage) / 100;

		container.innerHTML = `
        <!-- Admission Overview -->
        <div class="admission-details-grid">
            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-calendar-event me-2"></i>${i18n.t(
			"patients.sections.admissionInfo"
		)}
                </div>
                <div class="admission-details-section-body">
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
			"patients.messages.admissionId"
		)}:</span>
                        <span class="detail-value">${admission.patient_history_id
			}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.messages.admissionDate"
			)}:</span>
                        <span class="detail-value">${admissionDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.messages.dischargeDate"
			)}:</span>
                        <span class="detail-value">${dismissalDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.messages.lengthOfStay"
			)}:</span>
                        <span class="detail-value">${this.calculateLengthOfStay(
				admission.admission_time,
				admission.discharge_time
			)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.messages.dismissalReason"
			)}:</span>
                        <span class="detail-value">
                            <span class="dismissal-reason-badge dismissal-reason-${admission.leave_reason
			}">
                                ${this.formatDismissalReason(
				admission.leave_reason
			)}
                            </span>
                        </span>
                    </div>
                </div>
            </div>

            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-currency-dollar me-2"></i>${i18n.t(
				"patients.messages.financialSummary"
			)}
                </div>
                <div class="admission-details-section-body">
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.billing.servicesTotal"
			)}:</span>
                        <span class="detail-value">${i18n.formatCurrency(
				admission.services_total || 0
			)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.billing.drugsTotal"
			)}:</span>
                        <span class="detail-value">${i18n.formatCurrency(
				admission.drugs_total || 0
			)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.billing.suppliesTotal"
			) || "Supplies Total"}:</span>
                        <span class="detail-value">${i18n.formatCurrency(
				admission.supplies_total || 0
			)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"insurance.report.totalMedicalTests"
			) || "Medical Tests Total"}:</span>
                        <span class="detail-value">${i18n.formatCurrency(
				admission.medical_tests_amount || 0
			)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.billing.discount"
			)}:</span>
                        <span class="detail-value">
                            ${admission.discount_type === "percentage" ? admission.discount + "% (" + i18n.formatCurrency(discountAmount) + ")" : i18n.formatCurrency(discountAmount)}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.billing.vatPercentage"
			)}:</span>
                        <span class="detail-value">
                            ${vatPercentage}% ${vatPercentage > 0 ? "(" + i18n.formatCurrency(vatAmount) + ")" : ""}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.billing.adminExpenses"
			)}:</span>
                        <span class="detail-value">${i18n.formatCurrency(
				admission.administrative_expenses || 0
			)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label"><strong>${i18n.t(
				"patients.billing.totalAmount"
			)}:</strong></span>
                        <span class="detail-value"><strong>${i18n.formatCurrency(
				totalAmount
			)}</strong></span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${i18n.t(
				"patients.billing.paidAmount"
			)}:</span>
                        <span class="detail-value">${i18n.formatCurrency(
				paidAmount
			)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label"><strong>${i18n.t(
				"patients.billing.balance"
			)}:</strong></span>
                        <span class="detail-value">
                            <strong class="${balance > 0 ? "text-danger" : "text-success"
			}">
                                ${i18n.formatCurrency(Math.abs(balance))} ${balance > 0
				? i18n.t("patients.messages.due")
				: i18n.t("patients.messages.credit")
			}
                            </strong>
                        </span>
                    </div>
					<div class="detail-row mt-3">
					    <div class="col-12">
					        <button class="btn btn-success btn-sm w-100" onclick="patientManager.showSettleBillModal(${admission.bill_id
			})">
					            <i class="bi bi-cash-coin"></i> 
					            ${i18n.t("patients.buttons.settleBill")}
					        </button>
					    </div>
					</div>
                </div>
            </div>
        </div>

        <!-- Assigned Staff -->
        <div class="admission-details-grid">
            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-people me-2"></i>${i18n.t(
				"patients.messages.assignedDoctors"
			)}
                </div>
                <div class="admission-details-section-body">
                    ${doctors.length > 0
				? doctors
					.map(
						(doctor: any) => `
                        <div class="detail-row">
                            <span class="detail-label">${this.escapeHtml(
							doctor.doctor_name
						)}</span>
                            <span class="detail-value">
                                <span class="badge bg-primary">${i18n.t(
							`patients.doctorTypes.${doctor.doctor_type}` ||
							"Doctor"
						)}</span>
                            </span>
                        </div>
                    `
					)
					.join("")
				: `<p class="text-muted">${i18n.t(
					"patients.messages.noDoctorsAssigned"
				)}</p>`
			}
                </div>
            </div>

            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-person-heart me-2"></i>${i18n.t(
				"patients.messages.assignedNurses"
			)}
                </div>
                <div class="admission-details-section-body">
                    ${nurses.length > 0
				? nurses
					.map(
						(nurse: any) => `
                        <div class="detail-row">
                            <span class="detail-label">${this.escapeHtml(
							nurse.nurse_name
						)}</span>
                        </div>
                    `
					)
					.join("")
				: `<p class="text-muted">${i18n.t(
					"patients.messages.noNursesAssigned"
				)}</p>`
			}
                </div>
            </div>
        </div>

        <!-- Diagnosis -->
        ${admission.diagnosis
				? `
            <div class="admission-details-section mb-4">
                <div class="admission-details-section-header">
                    <i class="bi bi-clipboard2-pulse me-2"></i>${i18n.t(
					"patients.messages.finalDiagnosis"
				)}
                </div>
                <div class="admission-details-section-body">
                    <p class="mb-0">${this.escapeHtml(admission.diagnosis)}</p>
                </div>
            </div>
        `
				: ""
			}

        <!-- Services and Drugs -->
        <div class="services-drugs-grid">
            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-clipboard2-pulse me-2"></i>${i18n.t(
				"patients.messages.servicesUsed"
			)} (${services.length})
                </div>
                <div class="admission-details-section-body">
                    ${services.length > 0
				? `
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>${i18n.t("sidebar.services")}</th>
                                    <th>${i18n.t("patients.table.type")}</th>
                                    <th>${i18n.t(
					"patients.table.quantity"
				)}</th>
                                    <th>${i18n.t(
					"patients.table.unitPrice"
				)}</th>
                                    <th>${i18n.t("common.total")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${services
					.map(
						(service: any) => `
                                    <tr>
                                        <td>${this.escapeHtml(
							service.service_name
						)}</td>
                                        <td>${this.formatServiceType(
							service.service_type || "once"
						)}</td>
                                        <td>${service.quantity}</td>
                                        <td>${i18n.formatCurrency(
							parseFloat(service.unit_price)
						)}</td>
                                        <td>${i18n.formatCurrency(
							service.total_cost
								? parseFloat(service.total_cost)
								: service.quantity *
								service.unit_price
						)}</td>
                                    </tr>
                                `
					)
					.join("")}
                            </tbody>
                        </table>
                    `
				: `<p class="text-muted">${i18n.t(
					"patients.messages.noServicesUsed"
				)}</p>`
			}
                </div>
            </div>

            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-capsule me-2"></i>${i18n.t(
				"patients.messages.drugsUsed"
			)} (${drugs.length})
                </div>
                <div class="admission-details-section-body">
                    ${drugs.length > 0
				? `
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>${i18n.t("sidebar.drugs")}</th>
                                    <th>${i18n.t(
					"pharmacy.fields.manufacturer"
				)}</th>
                                    <th>${i18n.t(
					"patients.table.quantity"
				)}</th>
                                    <th>${i18n.t(
					"patients.table.unitPrice"
				)}</th>
                                    <th>${i18n.t("common.total")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${drugs
					.map(
						(drug: any) => `
                                    <tr>
                                        <td>${this.escapeHtml(
							drug.drug_name
						)}</td>
                                        <td>${this.escapeHtml(
							drug.manufacturer || "N/A"
						)}</td>
                                        <td>${drug.quantity}</td>
                                        <td>${i18n.formatCurrency(
							parseFloat(drug.unit_price)
						)}</td>
                                        <td>${i18n.formatCurrency(
							drug.total_cost
								? parseFloat(drug.total_cost)
								: drug.quantity *
								drug.unit_price
						)}</td>
                                    </tr>
                                `
					)
					.join("")}
                            </tbody>
                        </table>
                    `
				: `<p class="text-muted">${i18n.t(
					"patients.messages.noDrugsUsed"
				)}</p>`
			}
                </div>
            </div>
        </div>

             <div class="admission-details-section mt-4">
                <div class="admission-details-section-header">
                    <i class="bi bi-box-seam me-2"></i>${i18n.t(
				"patients.messages.suppliesUsed"
			) || "Supplies Used"} (${supplies.length})
                </div>
                <div class="admission-details-section-body">
                    ${supplies.length > 0
				? `
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>${i18n.t("sidebar.medicalSupplies") || "Supply"}</th>
                                    <th>${i18n.t("pharmacy.fields.manufacturer")}</th>
                                    <th>${i18n.t("patients.table.quantity")}</th>
                                    <th>${i18n.t("patients.table.unitPrice")}</th>
                                    <th>${i18n.t("common.total")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${supplies
					.map(
						(supply: any) => `
                                    <tr>
                                        <td>${this.escapeHtml(
							supply.medical_supply_name
						)}</td>
                                        <td>${this.escapeHtml(
							supply.manufacturer || "N/A"
						)}</td>
                                        <td>${supply.quantity}</td>
                                        <td>${i18n.formatCurrency(
							parseFloat(supply.unit_price)
						)}</td>
                                        <td>${i18n.formatCurrency(
							supply.total_cost
								? parseFloat(supply.total_cost)
								: supply.quantity *
								supply.unit_price
						)}</td>
                                    </tr>
                                `
					)
					.join("")}
                            </tbody>
                        </table>
                    `
				: `<p class="text-muted">${i18n.t(
					"patients.messages.noSuppliesUsed"
				) || "No supplies used"}</p>`
			}
                </div>
            </div>
        </div>
    `;
	}

	public async showSettleBillModal(billId?: number): Promise<void> {
		if (!billId && this.currentAdmissionDetails?.bill_id) {
			billId = this.currentAdmissionDetails.bill_id;
		}

		if (!billId) {
			this.showError(i18n.t("patients.messages.noBillSelected"));
			return;
		}

		try {
			// Fetch the latest bill data
			const response = await fetch(`/api/bills/${billId}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) {
				throw new Error("Failed to fetch bill data");
			}

			const billData = await response.json();

			// Store bill data for settlement
			this.currentSettlementBill = billData;

			// Populate modal fields
			const totalAmount = parseFloat(billData.total_amount || 0);
			const currentPaid = parseFloat(billData.paid_amount || 0);
			const currentBalance = totalAmount - currentPaid;

			document.getElementById("settleTotalAmount")!.textContent =
				i18n.formatCurrency(totalAmount);
			document.getElementById("settleCurrentPaid")!.textContent =
				i18n.formatCurrency(currentPaid);
			document.getElementById("settleCurrentBalance")!.textContent =
				i18n.formatCurrency(currentBalance);
			document.getElementById("settleAdmissionId")!.textContent =
				this.currentAdmissionDetails?.patient_history_id || "-";

			// Set current paid amount as default value
			(
				document.getElementById(
					"settleNewPaidAmount"
				) as HTMLInputElement
			).value = currentPaid.toFixed(2);

			// Update preview
			this.updateSettleBalancePreview();

			// Show modal
			this.settleBillModal.show();
		} catch (error) {
			console.error("Error loading bill for settlement:", error);
			this.showError(i18n.t("patients.messages.loadBillError"));
		}
	}

	private updateSettleBalancePreview(): void {
		if (!this.currentSettlementBill) return;

		const totalAmount = Number(
			this.currentSettlementBill.total_amount || 0
		);
		const currentPaid = Number(this.currentSettlementBill.paid_amount || 0);
		const newPaidAmount =
			parseFloat(
				(
					document.getElementById(
						"settleNewPaidAmount"
					) as HTMLInputElement
				).value
			) || 0;

		const newBalance = totalAmount - newPaidAmount;
		const difference = newPaidAmount - currentPaid;

		// Update preview fields
		const newBalanceEl = document.getElementById("settleNewBalance")!;
		const differenceEl = document.getElementById("settleDifference")!;

		newBalanceEl.textContent = i18n.formatCurrency(Math.abs(newBalance));
		differenceEl.textContent = i18n.formatCurrency(Math.abs(difference));

		// Update colors based on positive/negative
		newBalanceEl.className =
			newBalance > 0 ? "fw-bold text-danger" : "fw-bold text-success";
		differenceEl.className =
			difference >= 0 ? "fw-bold text-success" : "fw-bold text-danger";
	}

	private async settleBill(): Promise<void> {
		const form = document.getElementById(
			"settleBillForm"
		) as HTMLFormElement;

		if (!form.checkValidity()) {
			form.classList.add("was-validated");
			return;
		}

		if (!this.currentSettlementBill) {
			this.showError(i18n.t("patients.messages.noBillSelected"));
			return;
		}

		const newPaidAmount = parseFloat(
			(document.getElementById("settleNewPaidAmount") as HTMLInputElement)
				.value
		);

		if (isNaN(newPaidAmount) || newPaidAmount < 0) {
			this.showError(i18n.t("patients.validation.invalidAmount"));
			return;
		}

		const totalAmount = Number(
			this.currentSettlementBill.total_amount || 0
		);

		// Optional: Confirm if paid amount exceeds total
		if (newPaidAmount > totalAmount) {
			const confirmed = await Swal.fire({
				title: i18n.t("common.warning"),
				text: i18n.t("patients.messages.paidExceedsTotal"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonText: i18n.t("common.confirm"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (!confirmed.isConfirmed) {
				return;
			}
		}

		const confirmBtn = document.getElementById("confirmSettleBillBtn")!;
		const spinner = confirmBtn.querySelector(".spinner-border")!;

		try {
			// Show loading state
			spinner.classList.remove("d-none");
			(confirmBtn as HTMLButtonElement).disabled = true;

			const response = await fetch(
				`/api/bills/${this.currentSettlementBill.bill_id}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						paid_amount: newPaidAmount
					})
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || "Failed to settle bill");
			}

			this.showSuccess(i18n.t("patients.messages.billSettled"));

			// Close modal
			this.settleBillModal.hide();
			form.classList.remove("was-validated");

			// Refresh admission details if currently viewing
			if (this.currentAdmissionDetails?.patient_history_id) {
				await this.showAdmissionDetails(
					this.currentAdmissionDetails.patient_history_id
				);
			}

			// Refresh past admissions list
			await this.showPastAdmissionsModal();
		} catch (error) {
			console.error("Error settling bill:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("patients.messages.settleBillError")
			);
		} finally {
			// Hide loading state
			spinner.classList.add("d-none");
			(confirmBtn as HTMLButtonElement).disabled = false;
		}
	}

	private async printAdmissionBill(): Promise<void> {
		if (!this.currentAdmissionDetails || !this.currentPatient) {
			this.showError(i18n.t("patients.messages.noAdmissionDetails"));
			return;
		}

		try {
			if (!this.printBillManager) {
				this.showError("Print manager not initialized");
				return;
			}

			// Create a bill object from admission details
			const admissionBill = {
				bill_id: this.currentAdmissionDetails.bill_id,
				patient_id: this.currentPatient.patient_id,
				total_amount: this.currentAdmissionDetails.total_amount || 0,
				paid_amount: this.currentAdmissionDetails.paid_amount || 0,
				discount_type:
					this.currentAdmissionDetails.discount_type || "fixed",
				discount: this.currentAdmissionDetails.discount || 0,
				administrative_expenses:
					this.currentAdmissionDetails.administrative_expenses || 0,
				vat_percentage:
					this.currentAdmissionDetails.vat_percentage || 0,
				medical_tests_amount:
					this.currentAdmissionDetails.medical_tests_amount || 0,
				vat_scope_custom: this.currentAdmissionDetails.vat_scope_custom,
				discount_scope: this.currentAdmissionDetails.discount_scope,
				vat_scope: this.currentAdmissionDetails.vat_scope || "both",
				generated_at: this.currentAdmissionDetails.admission_time,
				updated_at: this.currentAdmissionDetails.discharge_time,
				issued_by_user_id: null,
				bill_details: this.createBillDetailsFromAdmission(
					this.currentAdmissionDetails
				)
			};

			// Update print manager with latest data
			this.printBillManager.updateData(
				this.availableServices,
				this.availableDrugs,
				this.servicePrices,
				this.currentAdmission!
			);

			// Show print modal
			await this.printBillManager.showPrintModal(
				this.currentPatient,
				admissionBill
			);

			// Hide the admission details modal
			this.admissionDetailsModal.hide();
		} catch (error) {
			console.error(
				"Error preparing admission bill for printing:",
				error
			);
			this.showError("Failed to prepare bill for printing");
		}
	}

	private createBillDetailsFromAdmission(admission: any): any[] {
		const billDetails: any[] = [];

		// Use grouped services for bill details
		const groupedServices = this.groupServicesByServiceId(
			admission.services || []
		);
		groupedServices.forEach((service: any) => {
			billDetails.push({
				bill_detail_id: `service_${service.service_id
					}_${Math.random()}`,
				bill_id: admission.bill_id,
				service_id: service.service_id,
				service_name: service.service_name,
				drug_shipment_id: null,
				drug_name: null,
				quantity: service.quantity,
				unit_price: service.unit_price,
				charge_type: service.charge_type,
				sale_type: "admitted",
				generated_at: service.generated_at
			});
		});

		// Use grouped drugs for bill details
		const groupedDrugs = this.groupDrugsByDrugId(admission.drugs || []);
		groupedDrugs.forEach((drug: any) => {
			billDetails.push({
				bill_detail_id: `drug_${drug.drug_id}_${Math.random()}`,
				bill_id: admission.bill_id,
				service_id: null,
				service_name: null,
				drug_shipment_id: drug.shipment_ids[0], // Use first shipment ID
				drug_name: drug.drug_name,
				quantity: drug.quantity,
				unit_price: drug.unit_price,
				charge_type: drug.charge_type,
				sale_type: "admitted",
				generated_at: drug.generated_at
			});
		});

		// Use grouped supplies for bill details
		const groupedSupplies = this.groupSuppliesBySupplyId(
			admission.supplies || []
		);
		groupedSupplies.forEach((supply: any) => {
			billDetails.push({
				bill_detail_id: `supply_${supply.supply_id}_${Math.random()}`,
				bill_id: admission.bill_id,
				service_id: null,
				service_name: null,
				drug_shipment_id: null,
				drug_name: null,
				medical_supply_shipment_id: supply.shipment_ids[0], // Use first shipment ID
				medical_supply_name: supply.medical_supply_name,
				quantity: supply.quantity,
				unit_price: supply.unit_price,
				charge_type: supply.charge_type,
				sale_type: "admitted",
				generated_at: supply.generated_at
			});
		});

		return billDetails;
	}

	private async loadStaffStatus(): Promise<void> {
		try {
			this.showInfo(i18n.t("patients.messages.loadingStaffStatus"));

			// Fetch clocked-in employees
			await this.loadClockedInStaff();

			// Fetch current admissions with staff assignments
			await this.loadStaffAssignments();

			// Render the staff status view
			this.renderStaffStatus();
		} catch (error) {
			console.error("Error loading staff status:", error);
			this.showError(i18n.t("patients.messages.loadStaffStatusError"));
		}
	}

	private async loadClockedInStaff(): Promise<void> {
		try {
			const response = await fetch("/api/clock-ins/clocked-in", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok)
				throw new Error("Failed to fetch clocked-in staff");

			const clockIns = await response.json();

			// Enrich with employee details
			this.clockedInStaff = await Promise.all(
				clockIns.map(async (clockIn: any) => {
					// Find employee in our existing doctors/nurses arrays
					const doctor = this.doctors.find(
						(d) => d.employee_id === clockIn.employee_id
					);
					const nurse = this.nurses.find(
						(n) => n.employee_id === clockIn.employee_id
					);

					return {
						...clockIn,
						name: doctor?.name || nurse?.name || "Unknown",
						employee_type: doctor
							? "doctor"
							: nurse
								? "nurse"
								: "other",
						doctor_type: doctor?.doctor_type
					};
				})
			);
		} catch (error) {
			console.error("Error loading clocked-in staff:", error);
			throw error;
		}
	}

	private async loadStaffAssignments(): Promise<void> {
		try {
			// Fetch current admissions with staff assignments
			const response = await fetch("/api/patients/admissions/current", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok)
				throw new Error("Failed to fetch staff assignments");

			const admissions: CurrentAdmission[] = await response.json();

			// Build a map of employee_id -> assigned patients
			this.staffAssignments.clear();

			admissions.forEach((admission) => {
				const patientInfo: StaffAssignment = {
					patient_id: admission.patient_id,
					patient_name: admission.patient_name,
					assigned_at: admission.admission_time, // Using admission time as assignment time
					admission_time: admission.admission_time,
					diagnosis: admission.diagnosis
				};

				// Add to doctor assignments (only if currently assigned - unassigned_at IS NULL)
				if (
					admission.attending_doctor_ids &&
					admission.attending_doctor_ids.length > 0
				) {
					admission.attending_doctor_ids.forEach(
						(doctorId: number) => {
							if (!this.staffAssignments.has(doctorId)) {
								this.staffAssignments.set(doctorId, []);
							}
							this.staffAssignments
								.get(doctorId)!
								.push(patientInfo);
						}
					);
				}

				// Add to nurse assignments (only if currently assigned - unassigned_at IS NULL)
				if (
					admission.attending_nurse_ids &&
					admission.attending_nurse_ids.length > 0
				) {
					admission.attending_nurse_ids.forEach((nurseId: number) => {
						if (!this.staffAssignments.has(nurseId)) {
							this.staffAssignments.set(nurseId, []);
						}
						this.staffAssignments.get(nurseId)!.push(patientInfo);
					});
				}
			});
		} catch (error) {
			console.error("Error loading staff assignments:", error);
			throw error;
		}
	}

	private renderStaffStatus(): void {
		this.renderClockedInDoctors();
		this.renderClockedInNurses();
		this.renderPatientAssignments();
	}

	private renderClockedInDoctors(): void {
		const container = document.getElementById("clockedInDoctorsList")!;
		const countBadge = document.getElementById("doctorsCount")!;

		const doctors = this.clockedInStaff.filter(
			(s) => s.employee_type === "doctor"
		);
		countBadge.textContent = doctors.length.toString();

		if (doctors.length === 0) {
			container.innerHTML = `
      <div class="no-staff-message">
        <i class="bi bi-person-x"></i>
        <p>${i18n.t("patients.staffStatus.noClockedInDoctors")}</p>
      </div>
    `;
			return;
		}

		container.innerHTML = doctors
			.map((doctor) => this.renderStaffMemberCard(doctor))
			.join("");
	}

	private renderClockedInNurses(): void {
		const container = document.getElementById("clockedInNursesList")!;
		const countBadge = document.getElementById("nursesCount")!;

		const nurses = this.clockedInStaff.filter(
			(s) => s.employee_type === "nurse"
		);
		countBadge.textContent = nurses.length.toString();

		if (nurses.length === 0) {
			container.innerHTML = `
      <div class="no-staff-message">
        <i class="bi bi-person-x"></i>
        <p>${i18n.t("patients.staffStatus.noClockedInNurses")}</p>
      </div>
    `;
			return;
		}

		container.innerHTML = nurses
			.map((nurse) => this.renderStaffMemberCard(nurse))
			.join("");
	}

	private renderStaffMemberCard(staff: ClockedInEmployee): string {
		const assignments = this.staffAssignments.get(staff.employee_id) || [];
		const isAvailable = assignments.length === 0;
		const statusClass = isAvailable ? "available" : "assigned";
		const statusText = isAvailable
			? i18n.t("patients.staffStatus.available")
			: i18n.t("patients.staffStatus.assignedToPatients", {
				count: assignments.length
			});

		const clockInTime = i18n.formatTime(staff.clock_in);
		const clockedInDuration = this.calculateDuration(staff.clock_in);

		return `
    <div class="staff-member-card ${statusClass}">
      <div class="staff-member-header">
        <div>
          <div class="staff-member-name">${this.escapeHtml(staff.name)}</div>
          ${staff.doctor_type
				? `<div class="staff-member-type">${i18n.t(
					`patients.doctorTypes.${staff.doctor_type}`
				)}</div>`
				: ""
			}
        </div>
        <div class="staff-member-status">
          <span class="status-indicator ${isAvailable ? "available" : "busy"
			}"></span>
          <span class="badge bg-${isAvailable ? "success" : "warning"
			}">${statusText}</span>
        </div>
      </div>
      
      <div class="clock-in-info">
        <div class="clock-in-info-item">
          <i class="bi bi-clock"></i>
          <span>${i18n.t(
				"patients.staffStatus.clockedInAt"
			)}: ${clockInTime}</span>
        </div>
        <div class="clock-in-info-item">
          <i class="bi bi-hourglass-split"></i>
          <span>${clockedInDuration}</span>
        </div>
        ${staff.shift_start_time && staff.shift_end_time
				? `
          <div class="clock-in-info-item">
            <i class="bi bi-calendar2-week"></i>
            <span>${i18n.t("patients.staffStatus.shift")}: ${staff.shift_start_time
				} - ${staff.shift_end_time}</span>
          </div>
        `
				: ""
			}
      </div>
      
      ${assignments.length > 0
				? `
        <div class="assigned-patients-list">
          <div class="assigned-patients-title">
            <i class="bi bi-people"></i> ${i18n.t(
					"patients.staffStatus.assignedPatients"
				)}:
          </div>
          ${assignments
					.map(
						(patient) => `
            <div class="assigned-patient-item" onclick="patientManager.selectPatient(${patient.patient_id
							})">
              <span class="assigned-patient-name">${this.escapeHtml(
								patient.patient_name
							)}</span>
              <span class="assigned-patient-duration">${this.calculateDuration(
								patient.admission_time
							)}</span>
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

	private async renderPatientAssignments(): Promise<void> {
		const container = document.getElementById("patientAssignmentsList")!;

		try {
			// Fetch all current admissions again to get complete patient list
			const response = await fetch("/api/patients/admissions/current", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch admissions");

			const admissions: CurrentAdmission[] = await response.json();

			if (admissions.length === 0) {
				container.innerHTML = `
			        <div class="no-staff-message">
			          <i class="bi bi-hospital"></i>
			          <p>${i18n.t("patients.staffStatus.noCurrentAdmissions")}</p>
			        </div>
			      `;
				return;
			}

			// Build patient assignment cards for each admission
			const assignmentCards = admissions.map((admission) => {
				// Find which assigned doctors are clocked in
				const clockedInDoctors = this.clockedInStaff.filter(
					(staff) =>
						staff.employee_type === "doctor" &&
						admission.attending_doctor_ids.includes(
							staff.employee_id
						)
				);

				// Find which assigned nurses are clocked in
				const clockedInNurses = this.clockedInStaff.filter(
					(staff) =>
						staff.employee_type === "nurse" &&
						admission.attending_nurse_ids.includes(
							staff.employee_id
						)
				);

				// Get all assigned doctors (even if not clocked in)
				const allAssignedDoctors = admission.attending_doctor_ids.map(
					(id) => ({
						employee_id: id,
						name: this.doctors.find(
							(d) => d.employee_id === id)!.name,
						doctor_type: this.doctors.find(
							(d) => d.employee_id === id
						)!.doctor_type,
						isClockedIn: clockedInDoctors.some(
							(d) => d.employee_id === id
						)
					})
				);

				// Get all assigned nurses (even if not clocked in)
				const allAssignedNurses = admission.attending_nurse_ids.map(
					(id, index) => ({
						employee_id: id,
						name: admission.attending_nurses[index],
						isClockedIn: clockedInNurses.some(
							(n) => n.employee_id === id
						)
					})
				);

				return this.renderPatientAssignmentCardFromAdmission(
					admission,
					allAssignedDoctors,
					allAssignedNurses
				);
			});

			container.innerHTML = assignmentCards.join("");
		} catch (error) {
			console.error("Error rendering patient assignments:", error);
			container.innerHTML = `
		      <div class="alert alert-danger">
		        ${i18n.t("patients.messages.loadStaffStatusError")}
		      </div>
		    `;
		}
	}

	private renderPatientAssignmentCardFromAdmission(
		admission: CurrentAdmission,
		assignedDoctors: Array<{
			employee_id: number;
			name: string;
			doctor_type: string | null;
			isClockedIn: boolean;
		}>,
		assignedNurses: Array<{
			employee_id: number;
			name: string;
			isClockedIn: boolean;
		}>
	): string {
		const admissionDuration = this.calculateDuration(
			admission.admission_time
		);
		const admissionDate = i18n.formatDateTime(admission.admission_time);

		const clockedInDoctorCount = assignedDoctors.filter(
			(d) => d.isClockedIn
		).length;
		const clockedInNurseCount = assignedNurses.filter(
			(n) => n.isClockedIn
		).length;

		return `
	    <div class="patient-assignment-card">
		  <div class="patient-assignment-header">
		    <div>
		      <div class="patient-assignment-name">${this.escapeHtml(
			admission.patient_name
		)}</div>
		      ${admission.quick_check
				? '<span class="badge bg-warning text-dark ms-2">' +
				i18n.t("patients.fields.quickCheck") +
				"</span>"
				: ""
			}
		    </div>
		    <div class="btn-group">
		      <button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); patientManager.showEditStaffAssignmentModal(${admission.patient_id
			})">
		        <i class="bi bi-pencil"></i> ${i18n.t("common.edit")}
		      </button>
		      <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); patientManager.selectPatient(${admission.patient_id
			})">
		        <i class="bi bi-eye"></i> ${i18n.t("common.view")}
		      </button>
		    </div>
		  </div>
			
	      <div class="patient-assignment-meta">
	        <span><i class="bi bi-calendar-check"></i> ${i18n.t(
				"patients.fields.admittedOn"
			)}: ${admissionDate}</span>
	        <span><i class="bi bi-hourglass-split"></i> ${admissionDuration}</span>
	        ${admission.diagnosis
				? `<span><i class="bi bi-clipboard-pulse"></i> ${this.escapeHtml(
					admission.diagnosis
				)}</span>`
				: ""
			}
	      </div>
				  
	      <div class="patient-assignment-staff">
	        <div class="staff-group">
	          <div class="staff-group-title">
	            <i class="bi bi-person-badge"></i>
	            ${i18n.t("patients.staffStatus.doctors")} 
	            (${clockedInDoctorCount}/${assignedDoctors.length} ${i18n.t(
				"patients.staffStatus.clockedIn"
			)})
	          </div>
	          ${assignedDoctors.length > 0
				? assignedDoctors
					.map(
						(doctor) => `
	            <span class="staff-member-chip doctor ${doctor.isClockedIn ? "" : "not-clocked-in"
							}">
	              <i class="bi bi-${doctor.isClockedIn ? "circle-fill" : "circle"}" 
	                 style="font-size: 0.5rem; color: ${doctor.isClockedIn ? "#28a745" : "#dc3545"
							};"></i>
	              ${this.escapeHtml(doctor.name)}
	              ${doctor.doctor_type
								? `<small>(${i18n.t(
									`patients.doctorTypes.${doctor.doctor_type}`
								)})</small>`
								: ""
							}
	              ${!doctor.isClockedIn
								? `<small class="text-muted ms-1">${i18n.t(
									"patients.staffStatus.notClockedIn"
								)}</small>`
								: ""
							}
	            </span>
	          `
					)
					.join("")
				: `<span class="text-muted">${i18n.t(
					"patients.staffStatus.noDoctorsAssignedToPatient"
				)}</span>`
			}
	        </div>
					  
	        <div class="staff-group">
	          <div class="staff-group-title">
	            <i class="bi bi-person-heart"></i>
	            ${i18n.t("patients.staffStatus.nurses")} 
	            (${clockedInNurseCount}/${assignedNurses.length} ${i18n.t(
				"patients.staffStatus.clockedIn"
			)})
	          </div>
	          ${assignedNurses.length > 0
				? assignedNurses
					.map(
						(nurse) => `
	            <span class="staff-member-chip nurse ${nurse.isClockedIn ? "" : "not-clocked-in"
							}">
	              <i class="bi bi-${nurse.isClockedIn ? "circle-fill" : "circle"}" 
	                 style="font-size: 0.5rem; color: ${nurse.isClockedIn ? "#28a745" : "#dc3545"
							};"></i>
	              ${this.escapeHtml(nurse.name)}
	              ${!nurse.isClockedIn
								? `<small class="text-muted ms-1">${i18n.t(
									"patients.staffStatus.notClockedIn"
								)}</small>`
								: ""
							}
	            </span>
	          `
					)
					.join("")
				: `<span class="text-muted">${i18n.t(
					"patients.staffStatus.noNursesAssignedToPatient"
				)}</span>`
			}
	        </div>
	      </div>
	    </div>
	  `;
	}

	public async showEditStaffAssignmentModal(
		patientId: number
	): Promise<void> {
		try {
			// Find the admission from our loaded data
			const response = await fetch("/api/patients/admissions/current", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch admissions");

			const admissions: CurrentAdmission[] = await response.json();
			const admission = admissions.find(
				(a) => a.patient_id === patientId
			);

			if (!admission) {
				this.showError(i18n.t("patients.messages.patientNotFound"));
				return;
			}

			this.currentEditingPatient = admission;

			// Update modal title with patient name
			document.getElementById("editStaffPatientName")!.textContent =
				admission.patient_name;

			// Populate doctors list
			this.populateStaffAssignmentList(
				"editStaffDoctorsList",
				this.doctors,
				admission.attending_doctor_ids,
				"doctor"
			);

			// Populate nurses list
			this.populateStaffAssignmentList(
				"editStaffNursesList",
				this.nurses,
				admission.attending_nurse_ids,
				"nurse"
			);

			// Update counts
			this.updateStaffAssignmentCounts();

			// Show modal
			this.editStaffAssignmentModal.show();
		} catch (error) {
			console.error("Error showing staff assignment modal:", error);
			this.showError(
				i18n.t("patients.messages.loadStaffAssignmentError")
			);
		}
	}

	private populateStaffAssignmentList(
		containerId: string,
		staffList: (Doctor | Nurse)[],
		assignedIds: number[],
		type: "doctor" | "nurse"
	): void {
		const container = document.getElementById(containerId)!;

		if (staffList.length === 0) {
			container.innerHTML = `<div class="text-muted text-center py-3">${type === "doctor"
				? i18n.t("patients.messages.noDoctorsAvailable")
				: i18n.t("patients.messages.noNursesAvailable")
				}</div>`;
			return;
		}

		container.innerHTML = staffList
			.map((staff) => {
				const isAssigned = assignedIds.includes(staff.employee_id);
				const isClockedIn = this.clockedInStaff.some(
					(s) => s.employee_id === staff.employee_id
				);
				const doctorType =
					type === "doctor" ? (staff as Doctor).doctor_type : null;

				return `
			      <div class="form-check d-flex align-items-center">
			        <input 
			          class="form-check-input staff-assignment-checkbox" 
			          type="checkbox" 
			          value="${staff.employee_id}" 
			          id="edit-${type}-${staff.employee_id}"
			          ${isAssigned ? "checked" : ""}
			          data-type="${type}"
			          onchange="patientManager.updateStaffAssignmentCounts()"
			        >
			        <label class="form-check-label p-x-2" for="edit-${type}-${staff.employee_id
					}">
			          <div class="staff-member-info">
			            <div class="staff-member-name">${this.escapeHtml(staff.name)}</div>
			            ${doctorType
						? `<div class="staff-member-details">${i18n.t(
							`patients.doctorTypes.${doctorType}`
						)}</div>`
						: ""
					}
			          </div>
			          <div class="staff-clocked-in-indicator">
			            ${isClockedIn
						? `<i class="bi bi-circle-fill"></i><span class="text-success">${i18n.t(
							"patients.staffStatus.clockedIn"
						)}</span>`
						: `<i class="bi bi-circle"></i><span class="text-muted">${i18n.t(
							"patients.staffStatus.notClockedIn"
						)}</span>`
					}
			          </div>
			        </label>
			      </div>
			    `;
			})
			.join("");
	}

	public updateStaffAssignmentCounts(): void {
		const doctorCheckboxes = document.querySelectorAll(
			'#editStaffDoctorsList input[type="checkbox"]:checked'
		);
		const nurseCheckboxes = document.querySelectorAll(
			'#editStaffNursesList input[type="checkbox"]:checked'
		);

		document.getElementById("assignedDoctorsCount")!.textContent =
			doctorCheckboxes.length.toString();
		document.getElementById("assignedNursesCount")!.textContent =
			nurseCheckboxes.length.toString();
	}

	private async saveStaffAssignment(): Promise<void> {
		if (!this.currentEditingPatient) return;

		const saveBtn = document.getElementById(
			"saveStaffAssignmentBtn"
		) as HTMLButtonElement;

		try {
			this.setButtonLoading(saveBtn, true);

			// Get currently selected doctors
			const selectedDoctorIds = Array.from(
				document.querySelectorAll(
					'#editStaffDoctorsList input[type="checkbox"]:checked'
				)
			).map((checkbox) => parseInt((checkbox as HTMLInputElement).value));

			// Get currently selected nurses
			const selectedNurseIds = Array.from(
				document.querySelectorAll(
					'#editStaffNursesList input[type="checkbox"]:checked'
				)
			).map((checkbox) => parseInt((checkbox as HTMLInputElement).value));

			// Validate at least one doctor is assigned
			if (selectedDoctorIds.length === 0) {
				this.showError(
					i18n.t("patients.validation.attendingDoctorRequired")
				);
				return;
			}

			// Calculate changes
			const originalDoctorIds =
				this.currentEditingPatient.attending_doctor_ids;
			const originalNurseIds =
				this.currentEditingPatient.attending_nurse_ids;

			const doctorsToAdd = selectedDoctorIds.filter(
				(id) => !originalDoctorIds.includes(id)
			);
			const doctorsToRemove = originalDoctorIds.filter(
				(id) => !selectedDoctorIds.includes(id)
			);
			const nursesToAdd = selectedNurseIds.filter(
				(id) => !originalNurseIds.includes(id)
			);
			const nursesToRemove = originalNurseIds.filter(
				(id) => !selectedNurseIds.includes(id)
			);

			// Update patient with new assignments
			const updateData: any = {
				attending_doctors: {
					add: doctorsToAdd,
					remove: doctorsToRemove
				},
				attending_nurses: {
					add: nursesToAdd,
					remove: nursesToRemove
				}
			};

			const response = await fetch(
				`/api/patients/${this.currentEditingPatient.patient_id}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(updateData)
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(
					error.error || "Failed to update staff assignment"
				);
			}

			this.showSuccess(
				i18n.t("patients.messages.staffAssignmentUpdated")
			);
			this.editStaffAssignmentModal.hide();

			// Refresh the staff status view
			await this.loadStaffStatus();
		} catch (error: any) {
			console.error("Error saving staff assignment:", error);
			this.showError(
				error.message ||
				i18n.t("patients.messages.staffAssignmentUpdateError")
			);
		} finally {
			this.setButtonLoading(saveBtn, false);
		}
	}

	private calculateDuration(startDate: Date | string): string {
		const start = new Date(startDate);
		const now = new Date();
		const diffMs = now.getTime() - start.getTime();

		const hours = Math.floor(diffMs / (1000 * 60 * 60));
		const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

		if (hours === 0) {
			return i18n.t("patients.staffStatus.minutesAgo", { minutes });
		} else if (hours < 24) {
			return i18n.t("patients.staffStatus.hoursAgo", { hours, minutes });
		} else {
			const days = Math.floor(hours / 24);
			const remainingHours = hours % 24;
			return i18n.t("patients.staffStatus.daysAgo", {
				days,
				hours: remainingHours
			});
		}
	}

	private formatDismissalReason(reason: string): string {
		return i18n.t(`patients.leaveReasons.${reason}`);
	}

	private calculateLengthOfStay(
		admissionTime: string,
		dischargeTime: string
	): string {
		const admission = new Date(admissionTime);
		const discharge = new Date(dischargeTime);
		const diffTime = Math.abs(discharge.getTime() - admission.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 1) {
			return `1 ${i18n.t("patients.messages.day")}`;
		} else if (diffDays < 1) {
			const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
			return `${diffHours} ${i18n.t("patients.messages.hours")}`;
		} else {
			return `${diffDays} ${i18n.t("patients.messages.days")}`;
		}
	}

	private async printBill(): Promise<void> {
		if (!this.currentBill || !this.currentPatient) {
			this.showError(i18n.t("patients.messages.noBillSelected"));
			return;
		}

		if (!this.printBillManager) {
			this.showError("Print manager not initialized");
			return;
		}

		// Update print manager with latest data
		this.printBillManager.updateData(
			this.availableServices,
			this.availableDrugs,
			this.servicePrices,
			this.currentAdmission!
		);

		// Show print modal
		await this.printBillManager.showPrintModal(
			this.currentPatient,
			this.currentBill
		);
	}

	// Utility methods

	private async showAddSupplyModal(): Promise<void> {
		if (!this.currentPatient) return;

		try {
			// Load supplies if not loaded
			if (this.availableSupplies.length === 0) {
				const response = await fetch("/api/pharmacy/medical-supplies");
				if (!response.ok) throw new Error("Failed to load supplies");
				this.availableSupplies = await response.json();
			}

			this.displayAvailableSupplies(this.availableSupplies);
			this.addSupplyModal.show();
		} catch (error) {
			console.error("Error loading supplies:", error);
			this.showError(i18n.t("patients.messages.loadSuppliesError"));
		}
	}

	private displayAvailableSupplies(supplies: MedicalSupply[]): void {
		const container = document.getElementById("availableSuppliesList")!;
		container.innerHTML = "";

		if (supplies.length === 0) {
			container.innerHTML = `<div class="text-center text-muted p-3">${i18n.t("patients.messages.noSuppliesFound")}</div>`;
			return;
		}

		supplies.forEach((supply) => {
			const item = document.createElement("div");
			item.className = "list-group-item d-flex justify-content-between align-items-center";
			item.innerHTML = `
				<div>
					<h6 class="mb-0">${this.escapeHtml(supply.name)}</h6>
				</div>
				<button class="btn btn-sm btn-outline-primary add-supply-btn">
					<i class="bi bi-plus"></i> ${i18n.t("common.add")}
				</button>
			`;

			item.querySelector(".add-supply-btn")?.addEventListener("click", () => {
				this.addSupplyToPatient(supply);
			});

			container.appendChild(item);
		});
	}

	private handleSupplySearch(searchTerm: string): void {
		const term = searchTerm.toLowerCase();
		const filtered = this.availableSupplies.filter((supply) =>
			supply.name.toLowerCase().includes(term)
		);
		this.displayAvailableSupplies(filtered);
	}

	private async addSupplyToPatient(supply: MedicalSupply): Promise<void> {
		if (!this.currentPatient) return;

		try {
			// 1. Check for available shipments (batches)
			const shipmentsResponse = await fetch(
				`/api/pharmacy/medical-supply-usages/available-shipments/${supply.supply_id}`
			);
			if (!shipmentsResponse.ok) throw new Error("Failed to fetch shipments");
			const shipments = await shipmentsResponse.json();

			if (shipments.length === 0) {
				this.showError(i18n.t("patients.messages.outOfStock"));
				return;
			}

			// 2. Ask for Quantity and Batch
			// Simplified: If 1 batch, just ask quantity. If multiple, ask user to pick.
			// For this iteration, I'll auto-pick the first batch (FIFO usually if sorted by expiry)
			// But user might want to pick.
			// I'll use SweetAlert input with select for batch if multiple, or just number if 1.

			let shipmentId = shipments[0].shipment_id;
			let maxQuantity = shipments[0].quantity;
			let price = 0;

			// Determine Price based on current admission's price list
			const targetPricelistId = this.currentAdmission?.pricelist_id;
			const prices = shipments[0].prices || [];
			let priceObj = null;

			if (targetPricelistId) {
				priceObj = prices.find((p: any) => p.pricelist_id === targetPricelistId);
			}

			if (!priceObj) {
				// Try finding default pricelist
				const defaultPricelist = this.priceLists.find(pl => pl.is_default);
				if (defaultPricelist) {
					priceObj = prices.find((p: any) => p.pricelist_id === defaultPricelist.pricelist_id);
				}
			}

			// Fallback to first available price
			if (!priceObj && prices.length > 0) {
				priceObj = prices[0];
			}

			if (priceObj) {
				price = parseFloat(priceObj.price);
			}

			if (shipments.length > 1) {
				// TODO: Implement batch selection UI. For now, picking first one.
				// (Or I can create a complex Swal).
			}

			const { value: quantity } = await Swal.fire({
				title: i18n.t("patients.modals.addSupply"),
				input: "number",
				inputLabel: `${i18n.t("common.quantity")} (Max: ${maxQuantity})`,
				inputAttributes: {
					min: "1",
					max: maxQuantity.toString(),
					step: "1"
				},
				inputValue: 1,
				showCancelButton: true,
				confirmButtonText: i18n.t("common.add")
			});

			if (!quantity) return;

			this.addSupplyModal.hide();

			// 3. Create Usage
			const response = await fetch(
				`/api/pharmacy/medical-supply-usages/patient/${this.currentPatient.patient_id}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						supplyId: supply.supply_id,
						shipmentId: shipmentId,
						quantity: parseInt(quantity),
						patientHistoryId: this.currentAdmission?.patient_history_id,
						price: price
					})
				}
			);

			if (!response.ok) {
				const err = await response.json();
				throw new Error(err.error || "Failed to add supply");
			}

			this.showSuccess(i18n.t("patients.messages.supplyAdded"));
			await this.loadAssignedSupplies(this.currentPatient.patient_id);
			this.updateAssignedSuppliesDisplay();
			await this.loadCurrentBill(this.currentBill!.bill_id);
			this.updateBillingDisplay();

		} catch (error: any) {
			console.error("Error adding supply:", error);
			this.showError(error.message);
		}
	}

	private groupServicesByServiceId(services: any[]): any[] {
		const grouped = new Map<number, any>();

		services.forEach((service) => {
			const serviceId = service.service_id;

			if (grouped.has(serviceId)) {
				const existing = grouped.get(serviceId);
				existing.quantity += service.quantity;
				existing.total_cost += parseFloat(service.total_cost || 0);
				existing.charge_types.add(service.charge_type);
				existing.bill_details.push(service);
				// Keep the earliest date
				if (service.generated_at < existing.generated_at) {
					existing.generated_at = service.generated_at;
				}
			} else {
				grouped.set(serviceId, {
					service_id: serviceId,
					service_name: service.service_name,
					service_type: service.service_type,
					quantity: service.quantity,
					unit_price: service.unit_price,
					total_cost: parseFloat(service.total_cost || 0),
					charge_types: new Set([service.charge_type]),
					generated_at: service.generated_at,
					bill_details: [service]
				});
			}
		});

		// Convert charge_types Set to string and calculate average unit price
		return Array.from(grouped.values()).map((service) => ({
			...service,
			charge_type: Array.from(service.charge_types).join(", "),
			unit_price: service.total_cost / service.quantity, // Recalculate average price
			instances_count: service.bill_details.length
		}));
	}

	private groupDrugsByDrugId(drugs: any[]): any[] {
		const grouped = new Map<number, any>();

		drugs.forEach((drug) => {
			const drugId = drug.drug_id;

			if (grouped.has(drugId)) {
				const existing = grouped.get(drugId);
				existing.quantity += drug.quantity;
				existing.total_cost += parseFloat(drug.total_cost || 0);
				existing.charge_types.add(drug.charge_type);
				existing.shipment_ids.add(drug.drug_shipment_id);
				existing.bill_details.push(drug);
				// Keep the earliest date
				if (drug.generated_at < existing.generated_at) {
					existing.generated_at = drug.generated_at;
				}
			} else {
				grouped.set(drugId, {
					drug_id: drugId,
					drug_name: drug.drug_name,
					manufacturer: drug.manufacturer,
					unit_conversion: drug.unit_conversion,
					quantity: drug.quantity,
					unit_price: drug.unit_price,
					total_cost: parseFloat(drug.total_cost || 0),
					charge_types: new Set([drug.charge_type]),
					shipment_ids: new Set([drug.drug_shipment_id]),
					generated_at: drug.generated_at,
					bill_details: [drug]
				});
			}
		});

		// Convert Sets to arrays/strings and calculate average unit price
		return Array.from(grouped.values()).map((drug) => ({
			...drug,
			charge_type: Array.from(drug.charge_types).join(", "),
			unit_price: drug.total_cost / drug.quantity, // Recalculate average price
			shipment_ids: Array.from(drug.shipment_ids),
			instances_count: drug.bill_details.length
		}));
	}

	private groupSuppliesBySupplyId(supplies: any[]): any[] {
		const grouped = new Map<number, any>();

		supplies.forEach((supply) => {
			const supplyId = supply.supply_id;

			if (grouped.has(supplyId)) {
				const existing = grouped.get(supplyId);
				existing.quantity += supply.quantity;
				existing.total_cost += parseFloat(supply.total_cost || 0);
				existing.charge_types.add(supply.charge_type);
				existing.shipment_ids.add(supply.medical_supply_shipment_id);
				existing.bill_details.push(supply);
				// Keep the earliest date
				if (supply.generated_at < existing.generated_at) {
					existing.generated_at = supply.generated_at;
				}
			} else {
				grouped.set(supplyId, {
					supply_id: supplyId,
					medical_supply_name: supply.medical_supply_name,
					manufacturer: supply.manufacturer,
					quantity: supply.quantity,
					unit_price: supply.unit_price,
					total_cost: parseFloat(supply.total_cost || 0),
					charge_types: new Set([supply.charge_type]),
					shipment_ids: new Set([supply.medical_supply_shipment_id]),
					generated_at: supply.generated_at,
					bill_details: [supply]
				});
			}
		});

		// Convert Sets to arrays/strings and calculate average unit price
		return Array.from(grouped.values()).map((supply) => ({
			...supply,
			charge_type: Array.from(supply.charge_types).join(", "),
			unit_price: supply.total_cost / supply.quantity, // Recalculate average price
			shipment_ids: Array.from(supply.shipment_ids),
			instances_count: supply.bill_details.length
		}));
	}

	private formatGender(gender: string): string {
		return i18n.t(`patients.gender.${gender}`);
	}

	private formatPaymentType(paymentType: string): string {
		const badge = `payment-type-${paymentType}`;
		const text = i18n.t(`patients.paymentTypes.${paymentType}`);
		return `<span class="badge ${badge}">${text}</span>`;
	}

	private formatServiceType(serviceType: string): string {
		return i18n.t(`patients.serviceTypes.${serviceType}`);
	}

	private setButtonLoading(
		button: HTMLButtonElement,
		loading: boolean
	): void {
		const spinner = button.querySelector(".spinner-border");
		const text = button.querySelector(".btn-text");

		button.disabled = loading;
		if (spinner) spinner.classList.toggle("d-none", !loading);
		if (text)
			text.textContent = loading
				? "Processing..."
				: text.getAttribute("data-original") || "Save";
	}

	private escapeHtml(text: string | null | undefined): string {
		if (!text) return "";
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
}

// Initialize and expose for HTML onclick handlers
declare global {
	interface Window {
		patientManager: PatientManager & {
			showAdmissionDetails: (patientHistoryId: number) => Promise<void>;
		};
		printBillManager: {
			updatePrintItemQuantity: (index: number, quantity: string) => void;
			updatePrintItemPrice: (index: number, price: string) => void;
			removePrintItem: (index: number) => void;
			addPrintItem: (type: "service" | "drug", itemId: number) => void;
		};
	}
}

// Configure toastr
//@ts-ignore
toastr.options = {
	closeButton: true,
	debug: false,
	newestOnTop: true,
	progressBar: true,
	positionClass: i18n.isRTL() ? "toast-top-left" : "toast-top-right",
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

(window.patientManager as PatientManager) = new PatientManager();
