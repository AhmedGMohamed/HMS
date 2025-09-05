//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { PrintBillManager } from "./printBillManager.js";

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
}

interface Doctor {
	employee_id: number;
	name: string;
	doctor_type: string;
	is_active: boolean;
}

interface Nurse {
	// NEW
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

interface BillDetail {
	bill_id: number;
	bill_detail_id: number;
	service_id: number | null;
	service_name: string | null;
	drug_shipment_id: number | null;
	drug_name: string | null;
	quantity: number;
	unit_price: number;
	charge_type: string;
	sale_type: string;
	generated_at: Date;
}

interface Bill {
	bill_id: number;
	patient_id: number;
	total_amount: number;
	paid_amount: number;
	discount_type: "fixed" | "percentage" | null;
	discount: number;
	administrative_expenses: number;
	vat_percentage: number | null;
	vat_scope: "services" | "drugs" | "both" | null;
	bill_details: BillDetail[];
	issued_by_user_id: number;
	generated_at: Date;
	updated_at: Date;
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

	private currentPatient: Patient | null = null;
	private currentAdmission: PatientHistory | null = null;
	private currentBill: Bill | null = null;
	private doctors: Doctor[] = [];
	private nurses: Nurse[] = [];
	private insuranceCompanies: InsuranceCompany[] = [];
	private priceLists: PriceList[] = [];
	private availableServices: Service[] = [];
	private availableDrugs: Drug[] = [];
	private assignedServices: any[] = [];
	private assignedDrugs: any[] = [];
	private servicePrices: Map<number, number> = new Map();

	private searchTimeout: NodeJS.Timeout | null = null;
	private allPatients: Patient[] = [];

	private currentAdmissionDetails: any = null;

	private printBillManager: PrintBillManager | null = null;

	constructor() {
		// Initialize sidebar
		new SidebarManager();

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

		this.initializeEventListeners();
		this.loadInitialData();
		this.loadAllPatients();
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

		// Hide suggestions when clicking outside
		/*document.addEventListener("click", (e) => {
			const searchContainer = document.querySelector(
				".patient-search-container"
			);
			if (!searchContainer?.contains(e.target as Node)) {
				this.hideSuggestions();
			}
		});*/

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
			this.showError("Failed to load initial data");
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
			this.showError("Failed to load patients list");
		}
	}

	private displayPatientList(patients: Patient[]): void {
		document.getElementById("patientContent")!.style.display = "none";
		document.getElementById("patientListContainer")!.style.display =
			"block";
		const container = document.getElementById("patientListContainer")!;

		if (patients.length === 0) {
			container.innerHTML =
				'<p class="text-muted text-center">No patients found</p>';
			return;
		}

		let tableHtml = `
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Name</th>
						<th>National ID</th>
						<th>Admitted</th>
						<th>Payment Type</th>
						<th>Insurance Company</th>
						<th>Insurance ID</th>
						<th>Claims Form ID</th>
					</tr>
				</thead>
				<tbody>
		`;

		patients.forEach((patient) => {
			const admitted = patient.is_active
				? '<span class="badge bg-success">Yes</span>'
				: '<span class="badge bg-secondary">No</span>';
			const insurance =
				patient.payment_type === "insurance"
					? this.insuranceCompanies.find(
							(c) => c.insurance_id === patient.insurance_id
					  )?.name || "-"
					: "-";
			tableHtml += `
				<tr onclick="patientManager.selectPatient(${
					patient.patient_id
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

			this.insuranceCompanies = await response.json();
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
			'<option value="">Select Referring Doctor</option>' +
			this.doctors
				.map(
					(doctor) =>
						`<option value="${
							doctor.employee_id
						}">${this.escapeHtml(doctor.name)} (${
							doctor.doctor_type
						})</option>`
				)
				.join("");

		// Populate attending doctors checkboxes
		attendingContainer.innerHTML = this.doctors
			.map(
				(doctor) => `
            <div class="form-check doctor-checkbox">
                <input class="form-check-input" type="checkbox" 
                       value="${doctor.employee_id}" id="doctor_${
					doctor.employee_id
				}">
                <label class="form-check-label" for="doctor_${
					doctor.employee_id
				}">
                    ${this.escapeHtml(doctor.name)} (${doctor.doctor_type})
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
                       value="${nurse.employee_id}" id="nurse_${
					nurse.employee_id
				}">
                <label class="form-check-label" for="nurse_${
					nurse.employee_id
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
			'<option value="">Select Insurance Company</option>' +
			this.insuranceCompanies
				.map(
					(company) =>
						`<option value="${
							company.insurance_id
						}">${this.escapeHtml(company.name)}</option>`
				)
				.join("");
	}

	private populatePriceListSelect(): void {
		const select = document.getElementById(
			"modalPriceList"
		) as HTMLSelectElement;
		select.innerHTML =
			'<option value="">Default</option>' +
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

	private displaySuggestions(suggestions: any[]): void {
		const container = document.getElementById("searchSuggestions")!;

		if (suggestions.length === 0) {
			container.style.display = "none";
			return;
		}

		container.innerHTML = suggestions
			.map(
				(patient) => `
            <div class="suggestion-item" onclick="patientManager.selectPatient(${
				patient.patient_id
			})">
                <div class="suggestion-name">${this.escapeHtml(
					patient.name
				)}</div>
                <div class="suggestion-details">
                    Registered: ${new Date(
						patient.registration_date
					).toLocaleDateString()}
                </div>
                <div class="suggestion-status ${
					patient.is_active ? "admitted" : "not-admitted"
				}">
                    ${patient.is_active ? "Currently Admitted" : "Not Admitted"}
                </div>
            </div>
        `
			)
			.join("");

		container.style.display = "block";
	}

	/*private hideSuggestions(): void {
		document.getElementById("searchSuggestions")!.style.display = "none";
	}*/

	public async selectPatient(patientId: number): Promise<void> {
		try {
			//this.hideSuggestions();
			const searchInput = document.getElementById(
				"patientSearch"
			) as HTMLInputElement;

			// Load patient data
			await this.loadPatientData(patientId);

			// Update search input with patient name
			if (this.currentPatient) {
				searchInput.value = this.currentPatient.name;
			}

			// Show patient content
			document.getElementById("patientListContainer")!.style.display =
				"none";
			document.getElementById("patientContent")!.style.display = "block";
		} catch (error) {
			console.error("Error selecting patient:", error);
			this.showError("Failed to load patient data");
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

			// Load price maps based on patient's price list
			await this.loadPriceMaps();

			// Load current admission if patient is active
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
					}
				} catch (error) {
					console.warn("No current admission found");
					this.currentAdmission = null;
				}
			} else {
				this.currentAdmission = null;
			}

			// Load assigned services and drugs if admitted
			if (this.currentAdmission) {
				await Promise.all([
					this.loadAssignedServices(patientId),
					this.loadAssignedDrugs(patientId),
					this.loadCurrentBill(this.currentAdmission.bill_id!)
				]);
			} else {
				this.assignedServices = [];
				this.assignedDrugs = [];
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
		document.getElementById("registrationDate")!.textContent = new Date(
			patient.registration_date
		).toLocaleDateString();

		// Status
		const statusElement = document.getElementById("patientStatus")!;
		if (patient.is_active) {
			statusElement.innerHTML =
				'<span class="badge bg-success">Currently Admitted</span>';
		} else {
			statusElement.innerHTML =
				'<span class="badge bg-secondary">Not Admitted</span>';
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
			this.getPriceListName() || "Default";

		// Medical information
		document.getElementById("quickCheck")!.innerHTML = patient.quick_check
			? '<span class="badge bg-warning">Yes</span>'
			: '<span class="badge bg-secondary">No</span>';

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
	}

	private getPriceListName(): string {
		if (!this.currentAdmission?.pricelist_id) return "Default";
		return (
			this.priceLists.find(
				(p) => p.pricelist_id === this.currentAdmission!.pricelist_id
			)?.name || "Default"
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
			container.innerHTML =
				'<div class="text-muted text-center py-3">No services assigned</div>';
			return;
		}

		container.innerHTML = this.assignedServices
			.map(
				(service) => `
            <div class="assigned-item">
                <div class="assigned-item-info">
                    <div class="assigned-item-name">${this.escapeHtml(
						service.name
					)}</div>
                    <div class="assigned-item-details">
                        Type: ${this.formatServiceType(service.service_type)} • 
                        Started: ${new Date(
							service.start_date
						).toLocaleDateString()}
                        ${
							service.end_date
								? ` • Ended: ${new Date(
										service.end_date
								  ).toLocaleDateString()}`
								: ""
						}
                    </div>
                </div>
                <div class="assigned-item-actions">
                    ${
						service.is_active
							? `
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="patientManager.removeService(${service.service_id})">
                            <i class="bi bi-x-circle"></i> Remove
                        </button>
                    `
							: '<span class="badge bg-secondary">Completed</span>'
					}
                </div>
            </div>
        `
			)
			.join("");
	}

	private updateAssignedDrugsDisplay(): void {
		const container = document.getElementById("assignedDrugs")!;

		if (this.assignedDrugs.length === 0) {
			container.innerHTML =
				'<div class="text-muted text-center py-3">No drugs assigned</div>';
			return;
		}

		container.innerHTML = this.assignedDrugs
			.map(
				(drug) => `
            <div class="assigned-item">
                <div class="assigned-item-info">
                    <div class="assigned-item-name">${this.escapeHtml(
						drug.drug_name
					)}</div>
                    <div class="assigned-item-details">
                        Remaining: ${drug.remaining_quantity} ${
					drug.unit_conversion?.smaller || "units"
				}
                        ${
							drug.last_administered
								? ` • Last: ${new Date(
										drug.last_administered
								  ).toLocaleString()}`
								: " • Not administered yet"
						}
                    </div>
                </div>
                <div class="assigned-item-actions">
                    <button class="btn btn-sm btn-outline-primary" 
                            onclick="patientManager.administerDrug(${
								drug.usage_id
							})">
                        <i class="bi bi-capsule"></i> Administer
                    </button>
                </div>
            </div>
        `
			)
			.join("");
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
				}
			});
		}

		// Update display fields
		(document.getElementById("servicesTotal") as HTMLInputElement).value =
			servicesTotal.toFixed(2);
		(document.getElementById("drugsTotal") as HTMLInputElement).value =
			drugsTotal.toFixed(2);
		(document.getElementById("paidAmount") as HTMLInputElement).value =
			parseInt(bill.paid_amount as unknown as string).toFixed(2);

		// Set editable fields from bill
		(document.getElementById("discount") as HTMLInputElement).value =
			bill.discount.toString();
		(document.getElementById("discountType") as HTMLInputElement).checked =
			bill.discount_type === "percentage";
		(document.getElementById("vatPercentage") as HTMLInputElement).value = (
			bill.vat_percentage || 0
		).toString();
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
		(document.getElementById("vatScope") as HTMLSelectElement).value =
			"both";
	}

	private calculateBilling(): void {
		const servicesTotal =
			parseFloat(
				(document.getElementById("servicesTotal") as HTMLInputElement)
					.value
			) || 0;
		const drugsTotal =
			parseFloat(
				(document.getElementById("drugsTotal") as HTMLInputElement)
					.value
			) || 0;
		const paidAmount =
			parseFloat(
				(document.getElementById("paidAmount") as HTMLInputElement)
					.value
			) || 0;
		const discount =
			parseFloat(
				(document.getElementById("discount") as HTMLInputElement).value
			) || 0;
		const isDiscountPercentage = (
			document.getElementById("discountType") as HTMLInputElement
		).checked;
		const vatPercentage =
			parseFloat(
				(document.getElementById("vatPercentage") as HTMLInputElement)
					.value
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

		const subtotal = servicesTotal + drugsTotal;

		// Calculate discount
		let discountAmount = 0;
		if (isDiscountPercentage) {
			discountAmount = (subtotal * discount) / 100;
		} else {
			discountAmount = discount;
		}

		const totalAfterDiscount = subtotal - discountAmount;

		// Calculate VAT (administrative expenses always included in VAT)
		let vatBase = 0;
		switch (vatScope) {
			case "services":
				vatBase =
					servicesTotal - discountAmount * (servicesTotal / subtotal);
				break;
			case "drugs":
				vatBase = drugsTotal - discountAmount * (drugsTotal / subtotal);
				break;
			case "both":
			default:
				vatBase = totalAfterDiscount;
				break;
		}

		const vatAmount =
			((vatBase + administrativeExpenses) * vatPercentage) / 100;
		const totalFee =
			totalAfterDiscount + vatAmount + administrativeExpenses;
		const remaining = totalFee - paidAmount;

		// Update display
		(document.getElementById("discountTotal") as HTMLInputElement).value =
			discountAmount.toFixed(2);
		(
			document.getElementById("totalAfterDiscount") as HTMLInputElement
		).value = totalAfterDiscount.toFixed(2);
		(document.getElementById("totalFee") as HTMLInputElement).value =
			totalFee.toFixed(2);

		if (remaining > 0) {
			(
				document.getElementById("remainingFacility") as HTMLInputElement
			).value = remaining.toFixed(2);
			(
				document.getElementById("remainingPatient") as HTMLInputElement
			).value = "0.00";
		} else {
			(
				document.getElementById("remainingFacility") as HTMLInputElement
			).value = "0.00";
			(
				document.getElementById("remainingPatient") as HTMLInputElement
			).value = Math.abs(remaining).toFixed(2);
		}
	}

	private async updateBilling(): Promise<void> {
		if (!this.currentBill) {
			this.showError("No active bill to update");
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

			const updateData = {
				discount_type: isDiscountPercentage ? "percentage" : "fixed",
				discount: discount,
				vat_percentage: vatPercentage,
				vat_scope: vatScope,
				administrative_expenses: administrativeExpenses
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

			this.showSuccess("Billing information updated successfully");

			// Reload bill data
			await this.loadCurrentBill(this.currentBill.bill_id);
			this.updateBillingDisplay();
		} catch (error) {
			console.error("Error updating billing:", error);
			this.showError("Failed to update billing information");
		}
	}

	private async confirmPayment(): Promise<void> {
		if (!this.currentBill) {
			this.showError("No active bill for payment");
			return;
		}

		const paymentAmount =
			parseFloat(
				(document.getElementById("paymentAmount") as HTMLInputElement)
					.value
			) || 0;

		if (paymentAmount === 0) {
			this.showError("Please enter a payment amount");
			return;
		}

		try {
			const result = await Swal.fire({
				title: "Confirm Payment",
				text: `Confirm payment of $${paymentAmount.toFixed(2)}?`,
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#28a745",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Confirm Payment"
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

				this.showSuccess("Payment processed successfully");

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
			this.showError("Failed to process payment");
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
			modalTitle.textContent = "Edit Patient";
			this.populatePatientForm(this.currentPatient);
		} else {
			modalTitle.textContent = "Register New Patient";
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
			document.getElementById("modalQuickCheck") as HTMLInputElement
		).checked = patient.quick_check;
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
		document.getElementById("insuranceFormGroup")!.style.display = "non";
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
				quick_check: (
					document.getElementById(
						"modalQuickCheck"
					) as HTMLInputElement
				).checked,
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
						"modalInsuranceCardId"
					) as HTMLInputElement
				).value.trim();

				if (!insuranceCompanyId) {
					this.showError("Please select an insurance company");
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
					this.showError("Please enter a diagnosis for admission");
					return;
				}

				if (attendingDoctorCheckboxes.length === 0) {
					this.showError(
						"Please select at least one attending doctor"
					);
					return;
				}
				if (attendingNurseCheckboxes.length === 0) {
					this.showError("Please select at least one nurse");
					return;
				}
				patientData.diagnosis = diagnosis;

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
					patientData.pricelist_id = pricelistId;
				}
			}

			// Handle attending nurses if editing and patient is admitted
			if (isEdit && this.currentAdmission) {
				const attendingNurseCheckboxes = document.querySelectorAll(
					'#attendingNursesSelection input[type="checkbox"]:checked'
				);

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
			}

			// Add nurses for new admission
			if (admitPatient && !isEdit) {
				const attendingNurseCheckboxes = document.querySelectorAll(
					'#attendingNursesSelection input[type="checkbox"]:checked'
				);

				if (attendingNurseCheckboxes.length > 0) {
					patientData.attending_nurses = Array.from(
						attendingNurseCheckboxes
					).map((checkbox) =>
						parseInt((checkbox as HTMLInputElement).value)
					);
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

			this.showSuccess(
				`Patient successfully ${isEdit ? "updated" : "created"}${
					admitPatient && !isEdit ? " and admitted" : ""
				}`
			);

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
			this.showError(error.message || "Failed to save patient");
		} finally {
			this.setButtonLoading(saveBtn, false);
		}
	}

	private showAdmitPatientModal(): void {
		if (!this.currentPatient || this.currentPatient.is_active) {
			return;
		}

		Swal.fire({
			title: "Admit Patient",
			html: `
                <div class="mb-3">
                    <label for="swal-diagnosis" class="form-label">Diagnosis</label>
                    <textarea id="swal-diagnosis" class="form-control" rows="3" placeholder="Enter diagnosis"></textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label">Attending Doctors</label>
                    <div class="doctors-selection" style="max-height: 200px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 0.375rem; padding: 0.75rem;">
                        ${this.doctors
							.map(
								(doctor) => `
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" value="${
									doctor.employee_id
								}" id="swal-doctor-${doctor.employee_id}">
                                <label class="form-check-label" for="swal-doctor-${
									doctor.employee_id
								}">
                                    ${this.escapeHtml(doctor.name)} (${
									doctor.doctor_type
								})
                                </label>
                            </div>
                        `
							)
							.join("")}
                    </div>
                </div>
				<div class="mb-3">
				    <label class="form-label">Attending Nurses</label>
				    <div class="nurses-selection" style="max-height: 200px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 0.375rem; padding: 0.75rem;">
				        ${this.nurses
							.map(
								(nurse) => `
				            <div class="form-check">
				                <input class="form-check-input" type="checkbox" value="${
									nurse.employee_id
								}" id="swal-nurse-${nurse.employee_id}">
				                <label class="form-check-label" for="swal-nurse-${
									nurse.employee_id
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
                    <label for="swal-pricelist" class="form-label">Price List</label>
                    <select id="swal-pricelist" class="form-select">
                        <option value="">Default</option>
                        ${this.priceLists
							.map(
								(list) =>
									`<option value="${
										list.pricelist_id
									}">${this.escapeHtml(list.name)}</option>`
							)
							.join("")}
                    </select>
                </div>
            `,
			showCancelButton: true,
			confirmButtonText: "Admit Patient",
			confirmButtonColor: "#28a745",
			cancelButtonColor: "#6c757d",
			preConfirm: () => {
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
					Swal.showValidationMessage("Please enter a diagnosis");
					return false;
				}

				if (selectedDoctors.length === 0) {
					Swal.showValidationMessage(
						"Please select at least one attending doctor"
					);
					return false;
				}

				return {
					diagnosis: diagnosis,
					attending_doctors: selectedDoctors,
					attending_nurses: selectedNurses,
					pricelist_id: pricelistId
				};
			}
		}).then(async (result: any) => {
			if (result.isConfirmed && result.value) {
				await this.admitPatient(
					result.value.diagnosis,
					result.value.attending_doctors,
					result.value.attending_nurses,
					result.value.pricelist_id
				);
			}
		});
	}

	private async admitPatient(
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

			this.showSuccess("Patient admitted successfully");
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error admitting patient:", error);
			this.showError(error.message || "Failed to admit patient");
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
			this.showSuccess("Patient discharged successfully");
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error discharging patient:", error);
			this.showError(error.message || "Failed to discharge patient");
		} finally {
			this.setButtonLoading(dischargeBtn, false);
		}
	}

	private showAddServiceModal(): void {
		if (!this.currentPatient || !this.currentPatient.is_active) {
			this.showError("Patient must be admitted to add services");
			return;
		}

		this.renderAvailableServices();
		this.addServiceModal.show();
	}

	private renderAvailableServices(): void {
		const container = document.getElementById("availableServicesList")!;
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
			container.innerHTML =
				'<div class="text-muted text-center py-4">No available services found</div>';
			return;
		}

		container.innerHTML = filteredServices
			.map((service) => {
				const price =
					this.servicePrices.get(service.service_id) ?? service.price;
				return `
            <div class="available-item" onclick="patientManager.addServiceToPatient(${
				service.service_id
			})">
                <div class="available-item-info">
                    <div class="available-item-name">${this.escapeHtml(
						service.name
					)}</div>
                    <div class="available-item-details">
                        Type: ${this.formatServiceType(service.service_type)}
                        ${service.auto_renew ? " • Auto Renew" : ""}
                    </div>
                </div>
                <div class="available-item-price">$${(+price || 0).toFixed(
					2
				)}</div>
                <div class="available-item-actions">
                    <button class="btn btn-primary">Add Service</button>
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

			this.addServiceModal.hide();
			this.showSuccess("Service added successfully");

			// Reload patient data
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error adding service:", error);
			this.showError(error.message || "Failed to add service");
		}
	}

	public async removeService(serviceId: number): Promise<void> {
		if (!this.currentPatient) return;

		try {
			const result = await Swal.fire({
				title: "Remove Service",
				text: "Are you sure you want to remove this service?",
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Remove Service"
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

				this.showSuccess("Service removed successfully");
				await this.loadPatientData(this.currentPatient.patient_id);
			}
		} catch (error) {
			console.error("Error removing service:", error);
			this.showError("Failed to remove service");
		}
	}

	private showAddDrugModal(): void {
		if (!this.currentPatient || !this.currentPatient.is_active) {
			this.showError("Patient must be admitted to add drugs");
			return;
		}

		this.renderAvailableDrugs();
		this.addDrugModal.show();
	}

	private renderAvailableDrugs(): void {
		const container = document.getElementById("availableDrugsList")!;
		const searchInput = document.getElementById(
			"drugSearch"
		) as HTMLInputElement;

		searchInput.oninput = () => {
			this.filterAndRenderDrugs(searchInput.value.trim());
		};

		this.filterAndRenderDrugs("");
	}

	private filterAndRenderDrugs(searchTerm: string): void {
		const container = document.getElementById("availableDrugsList")!;

		let filteredDrugs = this.availableDrugs.filter(
			(drug) =>
				drug.available_quantity > 0 &&
				(searchTerm === "" ||
					drug.name.toLowerCase().includes(searchTerm.toLowerCase()))
		);

		if (filteredDrugs.length === 0) {
			container.innerHTML =
				'<div class="text-muted text-center py-4">No available drugs found</div>';
			return;
		}

		container.innerHTML = filteredDrugs
			.map(
				(drug) => `
            <div class="available-item" onclick="patientManager.showAddDrugQuantityModal(${
				drug.drug_id
			})">
                <div class="available-item-info">
                    <div class="available-item-name">${this.escapeHtml(
						drug.name
					)}</div>
                    <div class="available-item-details">
                        Available: ${drug.available_quantity} ${
					drug.unit_conversion?.smaller || "units"
				}
                        ${drug.manufacturer ? ` • ${drug.manufacturer}` : ""}
                    </div>
                </div>
                <div class="available-item-actions">
                    <button class="btn btn-primary">Add Drug</button>
                </div>
            </div>
        `
			)
			.join("");
	}

	public showAddDrugQuantityModal(drugId: number): void {
		const drug = this.availableDrugs.find((d) => d.drug_id === drugId);
		if (!drug) return;

		Swal.fire({
			title: `Add ${drug.name}`,
			html: `
                <div class="mb-3">
                    <label for="swal-quantity" class="form-label">Quantity (${
						drug.unit_conversion?.larger || "units"
					})</label>
                    <input type="number" id="swal-quantity" class="form-control" min="1" max="${Math.floor(
						drug.available_quantity /
							(drug.unit_conversion?.ratio || 1)
					)}" value="1">
                    <div class="form-text">Available: ${Math.floor(
						drug.available_quantity /
							(drug.unit_conversion?.ratio || 1)
					)} ${drug.unit_conversion?.larger || "units"}</div>
                </div>
            `,
			showCancelButton: true,
			confirmButtonText: "Add Drug",
			confirmButtonColor: "#28a745",
			preConfirm: () => {
				const quantity = parseInt(
					(
						document.getElementById(
							"swal-quantity"
						) as HTMLInputElement
					).value
				);
				if (!quantity || quantity <= 0) {
					Swal.showValidationMessage("Please enter a valid quantity");
					return false;
				}
				return quantity;
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

			this.addDrugModal.hide();
			this.showSuccess("Drug added successfully");

			// Reload patient data
			await this.loadPatientData(this.currentPatient.patient_id);
		} catch (error: any) {
			console.error("Error adding drug:", error);
			this.showError(error.message || "Failed to add drug");
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
			const url = `/api/pharmacy/drugs/usages/shipments/${drugId}${
				pricelistId ? `?pricelist_id=${pricelistId}` : ""
			}`;

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
				title: "Administer Drug",
				text: "Confirm drug administration?",
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#28a745",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Administer"
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
					throw new Error("No remaining quantity to administer");
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

				this.showSuccess("Drug administered successfully");
				if (this.currentPatient) {
					await this.loadAssignedDrugs(
						this.currentPatient.patient_id
					);
					this.updateAssignedDrugsDisplay();
				}
			}
		} catch (error) {
			console.error("Error administering drug:", error);
			this.showError("Failed to administer drug");
		}
	}

	private async showPastAdmissionsModal(): Promise<void> {
		if (!this.currentPatient) {
			this.showError("No patient selected");
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
			this.showError("Failed to load past admissions");
		}
	}

	private displayPastAdmissions(admissions: any[]): void {
		const container = document.getElementById("pastAdmissionsContent")!;

		if (admissions.length === 0) {
			container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-clock-history" style="font-size: 3rem;"></i>
                <h5 class="mt-3">No Past Admissions</h5>
                <p>This patient has no previous admission history.</p>
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
		const admissionDate = new Date(
			admission.admission_time
		).toLocaleDateString();
		const dismissalDate = new Date(
			admission.discharge_time
		).toLocaleDateString();
		const totalServices = admission.total_services_count || 0;
		const totalDrugs = admission.total_drugs_count || 0;
		const totalOwed = parseFloat(admission.total_amount || 0);
		const totalPaid = parseFloat(admission.paid_amount || 0);
		const balance = totalOwed - totalPaid;

		const doctors = admission.assigned_doctors || [];
		const nurses = admission.assigned_nurses || [];

		return `
        <div class="admission-card" onclick="patientManager.showAdmissionDetails(${
			admission.patient_history_id
		})">
            <div class="admission-card-header">
                <div class="admission-date-range">
                    ${admissionDate} - ${dismissalDate}
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">Admission ID: ${
						admission.patient_history_id
					}</small>
                    <span class="dismissal-reason-badge dismissal-reason-${
						admission.leave_reason
					}">
                        ${this.formatDismissalReason(admission.leave_reason)}
                    </span>
                </div>
            </div>
            <div class="admission-card-body">
                <div class="admission-summary">
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">Services Used</span>
                        <span class="admission-summary-value">${totalServices}</span>
                    </div>
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">Drugs Used</span>
                        <span class="admission-summary-value">${totalDrugs}</span>
                    </div>
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">Total Owed</span>
                        <span class="admission-summary-value">$${totalOwed.toFixed(
							2
						)}</span>
                    </div>
                    <div class="admission-summary-item">
                        <span class="admission-summary-label">Balance</span>
                        <span class="admission-summary-value ${
							balance > 0 ? "text-danger" : "text-success"
						}">
                            $${Math.abs(balance).toFixed(2)} ${
			balance > 0 ? "Due" : "Credit"
		}
                        </span>
                    </div>
                </div>
                
                <div class="admission-staff-list">
                    <div class="mb-2">
                        <strong class="text-muted">Doctors:</strong>
                        ${
							doctors.length > 0
								? doctors
										.map(
											(doctor: any) =>
												`<span class="admission-staff-item">${this.escapeHtml(
													doctor
												)}</span>`
										)
										.join("")
								: '<span class="text-muted">None assigned</span>'
						}
                    </div>
                    <div>
                        <strong class="text-muted">Nurses:</strong>
                        ${
							nurses.length > 0
								? nurses
										.map(
											(nurse: any) =>
												`<span class="admission-staff-item">${this.escapeHtml(
													nurse
												)}</span>`
										)
										.join("")
								: '<span class="text-muted">None assigned</span>'
						}
                    </div>
                </div>
                
                ${
					admission.diagnosis
						? `
                    <div class="admission-diagnosis">
                        <strong>Final Diagnosis:</strong> ${this.escapeHtml(
							admission.diagnosis
						)}
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
			this.showError("Failed to load admission details");
		}
	}

	private displayAdmissionDetails(admission: any): void {
		const container = document.getElementById("admissionDetailsContent")!;

		const admissionDate = new Date(
			admission.admission_time
		).toLocaleString();
		const dismissalDate = new Date(
			admission.discharge_time
		).toLocaleString();
		const totalAmount = parseFloat(admission.total_amount || 0);
		const paidAmount = parseFloat(admission.paid_amount || 0);
		const balance = totalAmount - paidAmount;

		const doctors = admission.assigned_doctors || [];
		const nurses = admission.assigned_nurses || [];
		const services = this.groupServicesByServiceId(
			admission.services || []
		);
		const drugs = this.groupDrugsByDrugId(admission.drugs || []);

		container.innerHTML = `
        <!-- Admission Overview -->
        <div class="admission-details-grid">
            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-calendar-event me-2"></i>Admission Information
                </div>
                <div class="admission-details-section-body">
                    <div class="detail-row">
                        <span class="detail-label">Admission ID:</span>
                        <span class="detail-value">${
							admission.patient_history_id
						}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Admission Date:</span>
                        <span class="detail-value">${admissionDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Discharge Date:</span>
                        <span class="detail-value">${dismissalDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Length of Stay:</span>
                        <span class="detail-value">${this.calculateLengthOfStay(
							admission.admission_time,
							admission.discharge_time
						)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Dismissal Reason:</span>
                        <span class="detail-value">
                            <span class="dismissal-reason-badge dismissal-reason-${
								admission.leave_reason
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
                    <i class="bi bi-currency-dollar me-2"></i>Financial Summary
                </div>
                <div class="admission-details-section-body">
                    <div class="detail-row">
                        <span class="detail-label">Services Total:</span>
                        <span class="detail-value">$${
							admission.services_total?.toFixed(2) || "0.00"
						}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Drugs Total:</span>
                        <span class="detail-value">$${
							admission.drugs_total?.toFixed(2) || "0.00"
						}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Discount:</span>
                        <span class="detail-value">$${parseFloat(
							admission.discount || 0
						)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">VAT:</span>
                        <span class="detail-value">${
							admission.vat_percentage || 0
						}%</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Admin Expenses:</span>
                        <span class="detail-value">$${
							admission.administrative_expenses || 0
						}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label"><strong>Total Amount:</strong></span>
                        <span class="detail-value"><strong>$${totalAmount.toFixed(
							2
						)}</strong></span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Paid Amount:</span>
                        <span class="detail-value">$${paidAmount.toFixed(
							2
						)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label"><strong>Balance:</strong></span>
                        <span class="detail-value">
                            <strong class="${
								balance > 0 ? "text-danger" : "text-success"
							}">
                                $${Math.abs(balance).toFixed(2)} ${
			balance > 0 ? "Due" : "Credit"
		}
                            </strong>
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Assigned Staff -->
        <div class="admission-details-grid">
            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-people me-2"></i>Assigned Doctors
                </div>
                <div class="admission-details-section-body">
                    ${
						doctors.length > 0
							? doctors
									.map(
										(doctor: any) => `
                        <div class="detail-row">
                            <span class="detail-label">${this.escapeHtml(
								doctor.doctor_name
							)}</span>
                            <span class="detail-value">
                                <span class="badge bg-primary">${this.escapeHtml(
									doctor.doctor_type || "Doctor"
								)}</span>
                            </span>
                        </div>
                    `
									)
									.join("")
							: '<p class="text-muted">No doctors assigned</p>'
					}
                </div>
            </div>

            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-person-heart me-2"></i>Assigned Nurses
                </div>
                <div class="admission-details-section-body">
                    ${
						nurses.length > 0
							? nurses
									.map(
										(nurse: any) => `
                        <div class="detail-row">
                            <span class="detail-label">${this.escapeHtml(
								nurse.nurse_name
							)}</span>
                            <span class="detail-value">
                                <span class="badge bg-success">Nurse</span>
                            </span>
                        </div>
                    `
									)
									.join("")
							: '<p class="text-muted">No nurses assigned</p>'
					}
                </div>
            </div>
        </div>

        <!-- Diagnosis -->
        ${
			admission.diagnosis
				? `
            <div class="admission-details-section mb-4">
                <div class="admission-details-section-header">
                    <i class="bi bi-clipboard2-pulse me-2"></i>Final Diagnosis
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
                    <i class="bi bi-clipboard2-pulse me-2"></i>Services Used (${
						services.length
					})
                </div>
                <div class="admission-details-section-body">
                    ${
						services.length > 0
							? `
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Service</th>
                                    <th>Type</th>
                                    <th>Quantity</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
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
                                        <td>$${parseFloat(
											service.unit_price
										).toFixed(2)}</td>
                                        <td>$${
											service.total_cost
												? parseFloat(
														service.total_cost
												  ).toFixed(2)
												: (
														service.quantity *
														service.unit_price
												  ).toFixed(2)
										}</td>
                                    </tr>
                                `
									)
									.join("")}
                            </tbody>
                        </table>
                    `
							: '<p class="text-muted">No services used</p>'
					}
                </div>
            </div>

            <div class="admission-details-section">
                <div class="admission-details-section-header">
                    <i class="bi bi-capsule me-2"></i>Drugs Used (${
						drugs.length
					})
                </div>
                <div class="admission-details-section-body">
                    ${
						drugs.length > 0
							? `
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Drug</th>
                                    <th>Manufacturer</th>
                                    <th>Quantity</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
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
                                        <td>$${parseFloat(
											drug.unit_price
										).toFixed(2)}</td>
                                        <td>$${
											drug.total_cost
												? parseFloat(
														drug.total_cost
												  ).toFixed(2)
												: (
														drug.quantity *
														drug.unit_price
												  ).toFixed(2)
										}</td>
                                    </tr>
                                `
									)
									.join("")}
                            </tbody>
                        </table>
                    `
							: '<p class="text-muted">No drugs used</p>'
					}
                </div>
            </div>
        </div>
    `;
	}

	private async printAdmissionBill(): Promise<void> {
		if (!this.currentAdmissionDetails || !this.currentPatient) {
			this.showError("No admission details available for printing");
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
				this.servicePrices
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
				bill_detail_id: `service_${
					service.service_id
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

		return billDetails;
	}

	private formatDismissalReason(reason: string): string {
		const reasons: { [key: string]: string } = {
			improvement: "Improvement",
			death: "Death",
			transfer: "Transfer",
			as_desired: "As Desired"
		};
		return reasons[reason] || reason;
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
			return "1 day";
		} else if (diffDays < 1) {
			const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
			return `${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
		} else {
			return `${diffDays} days`;
		}
	}

	private async printBill(): Promise<void> {
		if (!this.currentBill || !this.currentPatient) {
			this.showError("No bill or patient selected");
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
			this.servicePrices
		);

		// Show print modal
		await this.printBillManager.showPrintModal(
			this.currentPatient,
			this.currentBill
		);
	}

	// Utility methods

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
	private formatGender(gender: string): string {
		return gender.charAt(0).toUpperCase() + gender.slice(1);
	}

	private formatPaymentType(paymentType: string): string {
		const badge = `payment-type-${paymentType}`;
		const text = paymentType.charAt(0).toUpperCase() + paymentType.slice(1);
		return `<span class="badge ${badge}">${text}</span>`;
	}

	private formatServiceType(serviceType: string): string {
		switch (serviceType) {
			case "once":
				return "One Time";
			case "hourly":
				return "Hourly";
			case "daily":
				return "Daily";
			default:
				return serviceType;
		}
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

	private escapeHtml(unsafe: string): string {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
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

(window.patientManager as PatientManager) = new PatientManager();
