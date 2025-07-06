//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

interface Nurse {
	employee_id: number;
	name: string;
	phone?: string;
	is_facility_employee: boolean;
	hire_date: string;
	employee_type: "nurse";
	base_pay?: number;
	extra_payment_type?: string;
	per_patient_payment_type?: string;
	percentage_scope?: string;
	need_clock_in: boolean;
	shift_type?: string;
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

class NurseManager {
	private nurseModal: any;
	private nurseForm: HTMLFormElement;
	private saveNurseButton: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private nurses: Map<number, Nurse> = new Map();
	private payments: Map<number, Payment> = new Map();

	constructor() {
		new SidebarManager();
		toastr.options = { positionClass: "toast-top-right", timeOut: 3000 };

		//@ts-ignore
		this.nurseModal = new bootstrap.Modal(
			document.getElementById("nurseModal")!
		);
		this.nurseForm = document.getElementById(
			"nurseForm"
		) as HTMLFormElement;
		this.saveNurseButton = document.getElementById(
			"saveNurseBtn"
		) as HTMLButtonElement;
		this.searchInput = document.getElementById(
			"searchNurse"
		) as HTMLInputElement;

		this.initializeEventListeners();
		this.loadNurses();
		this.loadPayments();
	}

	private initializeEventListeners(): void {
		document
			.getElementById("createNurseBtn")
			?.addEventListener("click", () => {
				this.showNurseModal();
			});

		this.saveNurseButton.addEventListener("click", () => {
			this.handleSaveNurse();
		});

		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.renderNurses();
			}, 300)
		);

		document
			.getElementById("nurseModal")!
			.addEventListener("hidden.bs.modal", () => {
				this.resetNurseForm();
			});

		document
			.getElementById("payments-tab")!
			.addEventListener("shown.bs.tab", () => {
				this.loadPayments();
			});
	}

	private async loadNurses(): Promise<void> {
		try {
			const response = await fetch("/api/employees", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (!response.ok) throw new Error("Failed to fetch nurses");
			const employees: Nurse[] = await response.json();
			this.nurses.clear();
			employees
				.filter((e) => e.employee_type === "nurse")
				.forEach((nurse) => this.nurses.set(nurse.employee_id, nurse));
			this.renderNurses();
		} catch (error) {
			this.showError("Failed to load nurses");
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

	private renderNurses(filterTerm: string = ""): void {
		const tbody = document.getElementById("nursesTableBody")!;
		const filteredNurses = Array.from(this.nurses.values()).filter(
			(nurse) =>
				nurse.name.toLowerCase().includes(filterTerm.toLowerCase())
		);

		tbody.innerHTML = filteredNurses
			.map(
				(nurse) => `
      <tr>
        <td>${this.escapeHtml(nurse.name)}</td>
        <td>${new Date(nurse.hire_date).toLocaleDateString()}</td>
        <td>$${nurse.base_pay || "-"}</td>
        <td>${nurse.shift_type || "-"}</td>
        <td>${nurse.extra_payment_type || "-"}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-outline-primary" onclick="nurseManager.editNurse(${
				nurse.employee_id
			})">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="nurseManager.deleteNurse(${
				nurse.employee_id
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
		const nurseNames = new Map(
			Array.from(this.nurses).map(([id, n]) => [id, n.name])
		);

		tbody.innerHTML = Array.from(this.payments.values())
			.filter((p) => nurseNames.has(p.employee_id))
			.map(
				(payment) => `
        <tr>
          <td>${this.escapeHtml(
				nurseNames.get(payment.employee_id) || "Unknown"
			)}</td>
          <td>$${payment.payment_amount}</td>
          <td>${this.escapeHtml(payment.extra_payment_type || "-")}</td>
          <td>${new Date(payment.issued_timestamp).toLocaleString()}</td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-success" onclick="nurseManager.markPaymentPaid(${
					payment.payment_id
				})">
                <i class="bi bi-check-circle"></i> Mark Paid
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="nurseManager.voidPayment(${
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

	private showNurseModal(nurseId?: number): void {
		this.resetNurseForm();
		const modalTitle = document.getElementById("nurseModalLabel")!;
		if (nurseId) {
			modalTitle.textContent = "Edit Nurse";
			const nurse = this.nurses.get(nurseId);
			if (nurse) this.populateNurseForm(nurse);
		} else {
			modalTitle.textContent = "Create New Nurse";
		}
		this.nurseModal.show();
	}

	private populateNurseForm(nurse: Nurse): void {
		(document.getElementById("nurseId") as HTMLInputElement).value =
			nurse.employee_id.toString();
		(document.getElementById("nurseName") as HTMLInputElement).value =
			nurse.name;
		(document.getElementById("hireDate") as HTMLInputElement).value =
			nurse.hire_date;
		(document.getElementById("basePay") as HTMLInputElement).value =
			nurse.base_pay?.toString() || "";
		(document.getElementById("shiftType") as HTMLSelectElement).value =
			nurse.shift_type || "";
		(
			document.getElementById("extraPaymentType") as HTMLSelectElement
		).value = nurse.extra_payment_type || "none";
		(
			document.getElementById(
				"perPatientPaymentType"
			) as HTMLSelectElement
		).value = nurse.per_patient_payment_type || "";
		(
			document.getElementById("percentageScope") as HTMLSelectElement
		).value = nurse.percentage_scope || "";
		(document.getElementById("needClockIn") as HTMLInputElement).checked =
			nurse.need_clock_in;
	}

	private async handleSaveNurse(): Promise<void> {
		if (!this.validateNurseForm()) return;

		const nurseId = (document.getElementById("nurseId") as HTMLInputElement)
			.value;
		const nurseData = {
			name: (document.getElementById("nurseName") as HTMLInputElement)
				.value,
			employee_type: "nurse",
			hire_date: (document.getElementById("hireDate") as HTMLInputElement)
				.value,
			base_pay:
				parseFloat(
					(document.getElementById("basePay") as HTMLInputElement)
						.value
				) || undefined,
			shift_type:
				(document.getElementById("shiftType") as HTMLSelectElement)
					.value || undefined,
			extra_payment_type:
				(
					document.getElementById(
						"extraPaymentType"
					) as HTMLSelectElement
				).value || undefined,
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
			need_clock_in: (
				document.getElementById("needClockIn") as HTMLInputElement
			).checked,
			is_facility_employee: true
		};

		try {
			this.setNurseLoading(true);
			const response = await fetch(
				`/api/employees${nurseId ? `/${nurseId}` : ""}`,
				{
					method: nurseId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(nurseData)
				}
			);

			if (!response.ok) throw new Error("Failed to save nurse");
			await this.loadNurses();
			this.nurseModal.hide();
			toastr.success(
				`Nurse successfully ${nurseId ? "updated" : "created"}`
			);
		} catch (error) {
			this.showError("Failed to save nurse");
		} finally {
			this.setNurseLoading(false);
		}
	}

	public async deleteNurse(nurseId: number): Promise<void> {
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
				const response = await fetch(`/api/employees/${nurseId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (!response.ok) throw new Error("Failed to delete nurse");
				await this.loadNurses();
				toastr.success("Nurse deleted successfully");
			} catch (error) {
				this.showError("Failed to delete nurse");
			}
		}
	}

	public editNurse(nurseId: number): void {
		this.showNurseModal(nurseId);
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

	private validateNurseForm(): boolean {
		this.nurseForm.classList.add("was-validated");
		return this.nurseForm.checkValidity();
	}

	private resetNurseForm(): void {
		this.nurseForm.reset();
		this.nurseForm.classList.remove("was-validated");
		(document.getElementById("nurseId") as HTMLInputElement).value = "";
	}

	private setNurseLoading(loading: boolean): void {
		const spinner = this.saveNurseButton.querySelector(".spinner-border")!;
		const buttonText = this.saveNurseButton.querySelector(".btn-text")!;
		this.saveNurseButton.disabled = loading;
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
		nurseManager: NurseManager;
	}
}

window.nurseManager = new NurseManager();
