//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

interface Employee {
	employee_id: number;
	name: string;
	phone?: string;
	is_facility_employee: boolean;
	hire_date: string;
	employee_type: "doctor" | "nurse" | "other";
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

class EmployeeManager {
	private employeeModal: any;
	private employeeForm: HTMLFormElement;
	private saveEmployeeButton: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private employees: Map<number, Employee> = new Map();
	private payments: Map<number, Payment> = new Map();

	constructor() {
		new SidebarManager();
		toastr.options = { positionClass: "toast-top-right", timeOut: 3000 };

		//@ts-ignore
		this.employeeModal = new bootstrap.Modal(
			document.getElementById("employeeModal")!
		);
		this.employeeForm = document.getElementById(
			"employeeForm"
		) as HTMLFormElement;
		this.saveEmployeeButton = document.getElementById(
			"saveEmployeeBtn"
		) as HTMLButtonElement;
		this.searchInput = document.getElementById(
			"searchEmployee"
		) as HTMLInputElement;

		this.initializeEventListeners();
		this.loadEmployees();
		this.loadPayments();
	}

	private initializeEventListeners(): void {
		document
			.getElementById("createEmployeeBtn")
			?.addEventListener("click", () => {
				this.showEmployeeModal();
			});

		this.saveEmployeeButton.addEventListener("click", () => {
			this.handleSaveEmployee();
		});

		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.renderEmployees();
			}, 300)
		);

		document
			.getElementById("employeeModal")!
			.addEventListener("hidden.bs.modal", () => {
				this.resetEmployeeForm();
			});

		document
			.getElementById("payments-tab")!
			.addEventListener("shown.bs.tab", () => {
				this.loadPayments();
			});
	}

	private async loadEmployees(): Promise<void> {
		try {
			const response = await fetch("/api/employees", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (!response.ok) throw new Error("Failed to fetch employees");
			const employees: Employee[] = await response.json();
			this.employees.clear();
			employees
				.filter((e) => e.employee_type !== "doctor" && e.employee_type !== "nurse")
				.forEach((employee) =>
					this.employees.set(employee.employee_id, employee)
				);
			this.renderEmployees();
		} catch (error) {
			this.showError("Failed to load employees");
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

	private renderEmployees(filterTerm: string = ""): void {
		const tbody = document.getElementById("employeesTableBody")!;
		const filteredEmployees = Array.from(this.employees.values()).filter(
			(employee) =>
				employee.name.toLowerCase().includes(filterTerm.toLowerCase())
		);

		tbody.innerHTML = filteredEmployees
			.map(
				(employee) => `
      <tr>
        <td>${this.escapeHtml(employee.name)}</td>
        <td>${this.escapeHtml(employee.employee_type)}</td>
        <td>${new Date(employee.hire_date).toLocaleDateString()}</td>
        <td>$${employee.base_pay || "-"}</td>
        <td>${employee.shift_type || "-"}</td>
        <td>${employee.extra_payment_type || "-"}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-outline-primary" onclick="employeeManager.editEmployee(${
				employee.employee_id
			})">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.deleteEmployee(${
				employee.employee_id
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
		const employeeNames = new Map(
			Array.from(this.employees).map(([id, e]) => [id, e.name])
		);

		tbody.innerHTML = Array.from(this.payments.values())
			.filter((p) => this.employees.has(p.employee_id))
			.map(
				(payment) => `
      			  <tr>
      			    <td>${this.escapeHtml(
									employeeNames.get(payment.employee_id) || "Unknown"
								)}</td>
      			    <td>$${payment.payment_amount}</td>
      			    <td>${this.escapeHtml(payment.extra_payment_type || "None")}</td>
      			    <td>${new Date(payment.issued_timestamp).toLocaleString()}</td>
      			    <td>
      			      <div class="action-buttons">
      			        <button class="btn btn-sm btn-outline-success" onclick="employeeManager.markPaymentPaid(${payment.payment_id
									})">
      			          <i class="bi bi-check-circle"></i> Mark Paid
      			        </button>
      			        <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidPayment(${payment.payment_id
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

	private showEmployeeModal(employeeId?: number): void {
		this.resetEmployeeForm();
		const modalTitle = document.getElementById("employeeModalLabel")!;
		if (employeeId) {
			modalTitle.textContent = "Edit Employee";
			const employee = this.employees.get(employeeId);
			if (employee) this.populateEmployeeForm(employee);
		} else {
			modalTitle.textContent = "Create New Employee";
		}
		this.employeeModal.show();
	}

	private populateEmployeeForm(employee: Employee): void {
		(document.getElementById("employeeId") as HTMLInputElement).value =
			employee.employee_id.toString();
		(document.getElementById("employeeName") as HTMLInputElement).value =
			employee.name;
		(document.getElementById("employeeType") as HTMLSelectElement).value =
			employee.employee_type;
		(document.getElementById("hireDate") as HTMLInputElement).value =
			employee.hire_date;
		(document.getElementById("basePay") as HTMLInputElement).value =
			employee.base_pay?.toString() || "";
		(document.getElementById("shiftType") as HTMLSelectElement).value =
			employee.shift_type || "";
		(
			document.getElementById("extraPaymentType") as HTMLSelectElement
		).value = employee.extra_payment_type || "none";
		(
			document.getElementById(
				"perPatientPaymentType"
			) as HTMLSelectElement
		).value = employee.per_patient_payment_type || "";
		(
			document.getElementById("percentageScope") as HTMLSelectElement
		).value = employee.percentage_scope || "";
		(document.getElementById("needClockIn") as HTMLInputElement).checked =
			employee.need_clock_in;
	}

	private async handleSaveEmployee(): Promise<void> {
		if (!this.validateEmployeeForm()) return;

		const employeeId = (
			document.getElementById("employeeId") as HTMLInputElement
		).value;
		const employeeData = {
			name: (document.getElementById("employeeName") as HTMLInputElement)
				.value,
			employee_type: (
				document.getElementById("employeeType") as HTMLSelectElement
			).value as "nurse" | "other",
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
			this.setEmployeeLoading(true);
			const response = await fetch(
				`/api/employees${employeeId ? `/${employeeId}` : ""}`,
				{
					method: employeeId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(employeeData)
				}
			);

			if (!response.ok) throw new Error("Failed to save employee");
			await this.loadEmployees();
			this.employeeModal.hide();
			toastr.success(
				`Employee successfully ${employeeId ? "updated" : "created"}`
			);
		} catch (error) {
			this.showError("Failed to save employee");
		} finally {
			this.setEmployeeLoading(false);
		}
	}

	public async deleteEmployee(employeeId: number): Promise<void> {
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
				const response = await fetch(`/api/employees/${employeeId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (!response.ok) throw new Error("Failed to delete employee");
				await this.loadEmployees();
				toastr.success("Employee deleted successfully");
			} catch (error) {
				this.showError("Failed to delete employee");
			}
		}
	}

	public editEmployee(employeeId: number): void {
		this.showEmployeeModal(employeeId);
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

	private validateEmployeeForm(): boolean {
		this.employeeForm.classList.add("was-validated");
		return this.employeeForm.checkValidity();
	}

	private resetEmployeeForm(): void {
		this.employeeForm.reset();
		this.employeeForm.classList.remove("was-validated");
		(document.getElementById("employeeId") as HTMLInputElement).value = "";
	}

	private setEmployeeLoading(loading: boolean): void {
		const spinner =
			this.saveEmployeeButton.querySelector(".spinner-border")!;
		const buttonText = this.saveEmployeeButton.querySelector(".btn-text")!;
		this.saveEmployeeButton.disabled = loading;
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
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
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
		employeeManager: EmployeeManager;
	}
}

window.employeeManager = new EmployeeManager();
