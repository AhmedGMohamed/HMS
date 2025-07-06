//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

interface Doctor {
	employee_id: number;
	doctor_id: number;
	name: string;
	phone?: string;
	is_facility_employee: boolean;
	hire_date: string;
	employee_type: "doctor";
	daily_pay?: number;
	per_patient_pay?: number;
	payment_calculation?: string;
	per_patient_payment_type?: string;
	percentage_scope?: string;
	need_clock_in: boolean;
	doctor_type: string;
	is_active: boolean;
}

interface Payment {
	payment_id: number;
	employee_id: number;
	payment_amount: number;
	payment_type: string;
	extra_payment_type: string;
	issued_timestamp: string;
	is_paid: boolean;
	is_void: boolean;
}

class DoctorManager {
	private doctorModal: any;
	private doctorForm: HTMLFormElement;
	private saveDoctorButton: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private doctors: Map<number, Doctor> = new Map();
	private payments: Map<number, Payment> = new Map();

	constructor() {
		new SidebarManager();
		toastr.options = { positionClass: "toast-top-right", timeOut: 3000 };

		//@ts-ignore
		this.doctorModal = new bootstrap.Modal(
			document.getElementById("doctorModal")!
		);
		this.doctorForm = document.getElementById(
			"doctorForm"
		) as HTMLFormElement;
		this.saveDoctorButton = document.getElementById(
			"saveDoctorBtn"
		) as HTMLButtonElement;
		this.searchInput = document.getElementById(
			"searchDoctor"
		) as HTMLInputElement;

		this.initializeEventListeners();
		this.loadDoctors();
		this.loadPayments();
	}

	private initializeEventListeners(): void {
		document
			.getElementById("createDoctorBtn")
			?.addEventListener("click", () => {
				this.showDoctorModal();
			});

		this.saveDoctorButton.addEventListener("click", () => {
			this.handleSaveDoctor();
		});

		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.renderDoctors();
			}, 300)
		);

		document
			.getElementById("doctorModal")!
			.addEventListener("hidden.bs.modal", () => {
				this.resetDoctorForm();
			});

		document
			.getElementById("payments-tab")!
			.addEventListener("shown.bs.tab", () => {
				this.loadPayments();
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
			const doctors: Doctor[] = await response.json();
			this.doctors.clear();
			doctors.forEach((doctor) =>
				this.doctors.set(doctor.doctor_id, doctor)
			);
			this.renderDoctors();
		} catch (error) {
			this.showError("Failed to load doctors");
		}
	}

	private async loadPayments(): Promise<void> {
		try {
			const response = await fetch(
				"/api/employee-payments/unpaid-system",
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);
			if (!response.ok) throw new Error("Failed to fetch payments");
			const payments: Payment[] = await response.json();
			this.payments.clear();
			payments.forEach((payment) =>
				this.payments.set(payment.payment_id, payment)
			);
			this.renderPayments();
		} catch (error) {
			this.showError("Failed to load payments");
		}
	}

	private renderDoctors(filterTerm: string = ""): void {
		const tbody = document.getElementById("doctorsTableBody")!;
		const filteredDoctors = Array.from(this.doctors.values()).filter(
			(doctor) =>
				doctor.name.toLowerCase().includes(filterTerm.toLowerCase())
		);

		tbody.innerHTML = filteredDoctors
			.map(
				(doctor) => `
      <tr>
        <td>${this.escapeHtml(doctor.name)}</td>
        <td>${this.escapeHtml(doctor.doctor_type)}</td>
        <td>${new Date(doctor.hire_date).toLocaleDateString()}</td>
        <td>$${doctor.daily_pay?.toFixed(2) || "-"}</td>
        <td>$${doctor.per_patient_pay?.toFixed(2) || "-"}</td>
        <td>${doctor.is_active ? "Yes" : "No"}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-outline-primary" onclick="doctorManager.editDoctor(${
				doctor.doctor_id
			})">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="doctorManager.deleteDoctor(${
				doctor.doctor_id
			})">
              <i class="bi bi-trash"></i> Delete
            </button>
          </div>
        </td>
      </tr>
    `
			)
			.join("");
	}

	private renderPayments(): void {
		const tbody = document.getElementById("paymentsTableBody")!;
		const doctorNames = new Map(
			Array.from(this.doctors).map(([_id, d]) => [d.employee_id, d.name])
		);

		tbody.innerHTML = Array.from(this.payments.values())
			.filter((p) => doctorNames.has(p.employee_id))
			.map(
				(payment) => `
        <tr>
          <td>${this.escapeHtml(
				doctorNames.get(payment.employee_id) || "Unknown"
			)}</td>
          <td>$${payment.payment_amount}</td>
          <td>${this.escapeHtml(payment.extra_payment_type || "None")}</td>
          <td>${new Date(payment.issued_timestamp).toLocaleString()}</td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-success" onclick="doctorManager.markPaymentPaid(${
					payment.payment_id
				})">
                <i class="bi bi-check-circle"></i> Mark Paid
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="doctorManager.voidPayment(${
					payment.payment_id
				})">
                <i class="bi bi-x-circle"></i> Void
              </button>
            </div>
          </td>
        </tr>
      `
			)
			.join("");
	}

	private showDoctorModal(doctorId?: number): void {
		this.resetDoctorForm();
		const modalTitle = document.getElementById("doctorModalLabel")!;
		if (doctorId) {
			modalTitle.textContent = "Edit Doctor";
			const doctor = this.doctors.get(doctorId);
			if (doctor) this.populateDoctorForm(doctor);
		} else {
			modalTitle.textContent = "Create New Doctor";
		}
		this.doctorModal.show();
	}

	private populateDoctorForm(doctor: Doctor): void {
		(document.getElementById("doctorId") as HTMLInputElement).value =
			doctor.doctor_id.toString();
		(document.getElementById("employeeId") as HTMLInputElement).value =
			doctor.employee_id.toString();
		(document.getElementById("doctorName") as HTMLInputElement).value =
			doctor.name;
		(document.getElementById("doctorType") as HTMLSelectElement).value =
			doctor.doctor_type;
		(document.getElementById("hireDate") as HTMLInputElement).value =
			doctor.hire_date;
		(document.getElementById("dailyPay") as HTMLInputElement).value =
			doctor.daily_pay?.toString() || "";
		(document.getElementById("perPatientPay") as HTMLInputElement).value =
			doctor.per_patient_pay?.toString() || "";
		(
			document.getElementById("paymentCalculation") as HTMLSelectElement
		).value = doctor.payment_calculation || "daily";
		(
			document.getElementById(
				"perPatientPaymentType"
			) as HTMLSelectElement
		).value = doctor.per_patient_payment_type || "";
		(
			document.getElementById("percentageScope") as HTMLSelectElement
		).value = doctor.percentage_scope || "";
		(document.getElementById("isActive") as HTMLInputElement).checked =
			doctor.is_active;
		(document.getElementById("needClockIn") as HTMLInputElement).checked =
			doctor.need_clock_in;
	}

	private async handleSaveDoctor(): Promise<void> {
		if (!this.validateDoctorForm()) return;

		const doctorId = (
			document.getElementById("doctorId") as HTMLInputElement
		).value;
		const doctorData = {
			name: (document.getElementById("doctorName") as HTMLInputElement)
				.value,
			employee_type: "doctor",
			hire_date: (document.getElementById("hireDate") as HTMLInputElement)
				.value,
			daily_pay:
				parseFloat(
					(document.getElementById("dailyPay") as HTMLInputElement)
						.value
				) || undefined,
			per_patient_pay:
				parseFloat(
					(
						document.getElementById(
							"perPatientPay"
						) as HTMLInputElement
					).value
				) || undefined,
			payment_calculation: (
				document.getElementById(
					"paymentCalculation"
				) as HTMLSelectElement
			).value,
			per_patient_payment_type:
				(
					document.getElementById(
						"perPatientPaymentType"
					) as HTMLSelectElement
				).value || undefined,
			percentage_scope:
				(
					document.getElementById(
						"percentageScope"
					) as HTMLSelectElement
				).value || undefined,
			doctor_type: (
				document.getElementById("doctorType") as HTMLSelectElement
			).value,
			is_active: (document.getElementById("isActive") as HTMLInputElement)
				.checked,
			need_clock_in: (
				document.getElementById("needClockIn") as HTMLInputElement
			).checked,
			is_facility_employee: true
		};

		try {
			this.setDoctorLoading(true);
			const response = await fetch(
				`/api/doctors${doctorId ? `/${doctorId}` : ""}`,
				{
					method: doctorId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(doctorData)
				}
			);

			if (!response.ok) throw new Error("Failed to save doctor");
			await this.loadDoctors();
			this.doctorModal.hide();
			toastr.success(
				`Doctor successfully ${doctorId ? "updated" : "created"}`
			);
		} catch (error) {
			this.showError("Failed to save doctor");
		} finally {
			this.setDoctorLoading(false);
		}
	}

	public async deleteDoctor(doctorId: number): Promise<void> {
		const result = await Swal.fire({
			title: "Are you sure?",
			text: "This action cannot be undone!",
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#dc3545",
			cancelButtonColor: "#6c757d",
			confirmButtonText: "Yes, delete it!"
		});

		if (result.isConfirmed) {
			try {
				const response = await fetch(`/api/doctors/${doctorId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (!response.ok) throw new Error("Failed to delete doctor");
				await this.loadDoctors();
				toastr.success("Doctor deleted successfully");
			} catch (error) {
				this.showError("Failed to delete doctor");
			}
		}
	}

	public editDoctor(doctorId: number): void {
		this.showDoctorModal(doctorId);
	}

	public async markPaymentPaid(paymentId: number): Promise<void> {
		const result = await Swal.fire({
			title: "Confirm Payment",
			text: "Mark this payment as paid?",
			icon: "question",
			showCancelButton: true,
			confirmButtonColor: "#0d6efd",
			cancelButtonColor: "#6c757d",
			confirmButtonText: "Yes, mark as paid"
		});

		if (result.isConfirmed) {
			try {
				const response = await fetch(
					`/api/employee-payments/${paymentId}/paid`,
					{
						method: "PUT",
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);
				if (!response.ok)
					throw new Error("Failed to mark payment as paid");
				await this.loadPayments();
				toastr.success("Payment marked as paid");
			} catch (error) {
				this.showError("Failed to mark payment as paid");
			}
		}
	}

	public async voidPayment(paymentId: number): Promise<void> {
		const result = await Swal.fire({
			title: "Void Payment",
			text: "Void this payment? This action cannot be undone!",
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#dc3545",
			cancelButtonColor: "#6c757d",
			confirmButtonText: "Yes, void it"
		});

		if (result.isConfirmed) {
			try {
				const response = await fetch(
					`/api/employee-payments/${paymentId}/void`,
					{
						method: "PUT",
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);
				if (!response.ok) throw new Error("Failed to void payment");
				await this.loadPayments();
				toastr.success("Payment voided successfully");
			} catch (error) {
				this.showError("Failed to void payment");
			}
		}
	}

	private validateDoctorForm(): boolean {
		this.doctorForm.classList.add("was-validated");
		return this.doctorForm.checkValidity();
	}

	private resetDoctorForm(): void {
		this.doctorForm.reset();
		this.doctorForm.classList.remove("was-validated");
		(document.getElementById("doctorId") as HTMLInputElement).value = "";
		(document.getElementById("employeeId") as HTMLInputElement).value = "";
	}

	private setDoctorLoading(loading: boolean): void {
		const spinner = this.saveDoctorButton.querySelector(".spinner-border")!;
		const buttonText = this.saveDoctorButton.querySelector(".btn-text")!;
		this.saveDoctorButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading ? "Saving..." : "Save";
	}

	private showError(message: string): void {
		Swal.fire({
			icon: "error",
			title: "Error",
			text: message,
			confirmButtonColor: "#0d6efd"
		});
	}

	private escapeHtml(unsafe: string): string {
		return unsafe
			.replace(/&/g, `&`)
			.replace(/</g, `<`)
			.replace(/>/g, `>`)
			.replace(/"/g, `"`)
			.replace(/'/g, `'`);
	}

	private debounce(func: Function, wait: number): (...args: any[]) => void {
		let timeout: NodeJS.Timeout;
		return (...args: any[]) => {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), wait);
		};
	}
}

declare global {
	interface Window {
		doctorManager: DoctorManager;
	}
}

window.doctorManager = new DoctorManager();
