//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

interface Employee {
	employee_id: number;
	name: string;
	phone?: string;
	is_facility_employee: boolean;
	is_active: boolean;
	hire_date: string;
	employee_type: "doctor" | "nurse" | "other";
	base_pay?: number;
	extra_amount?: number;
	extra_payment_type?: string;
	per_patient_payment_type?: string;
	percentage_scope?: string;
	need_clock_in: boolean;
	shift_type?: string;
	shift_start_time?: string;
	shift_end_time?: string; 
}

interface Payment {
	payment_id: number;
	employee_id: number;
	payment_amount: number;
	payment_type: string;
	extra_amount?: number;
	extra_payment_type: string;
	issued_timestamp: string;
	is_paid: boolean;
	is_void: boolean;
	paid_by?: string;
	paid_by_user_id?: number;
	paid_timestamp?: string;
}

class EmployeeManager {
	private employeeModal: any;
	private paymentModal: any;
	private employeeForm: HTMLFormElement;
	private paymentForm: HTMLFormElement;
	private saveEmployeeButton: HTMLButtonElement;
	private savePaymentButton: HTMLButtonElement;
	private searchInputEmployees: HTMLInputElement;
	private searchInputNurses: HTMLInputElement;
	private employees: Map<number, Employee> = new Map();
	private payments: Map<number, Payment> = new Map();
	private userPermissions: string[] = [];
	private employeePaymentStartDate: HTMLInputElement;
	private employeePaymentEndDate: HTMLInputElement;
	private nursePaymentStartDate: HTMLInputElement;
	private nursePaymentEndDate: HTMLInputElement;
	private pendingPaymentStartDate: HTMLInputElement;
	private pendingPaymentEndDate: HTMLInputElement;

	constructor() {
		new SidebarManager();
		toastr.options = { positionClass: "toast-top-right", timeOut: 3000 };

		//@ts-ignore
		this.employeeModal = new bootstrap.Modal(
			document.getElementById("employeeModal")!
		);
		//@ts-ignore
		this.paymentModal = new bootstrap.Modal(
			document.getElementById("paymentModal")!
		);
		this.employeeForm = document.getElementById(
			"employeeForm"
		) as HTMLFormElement;
		this.paymentForm = document.getElementById(
			"paymentForm"
		) as HTMLFormElement;
		this.savePaymentButton = document.getElementById(
			"savePaymentBtn"
		) as HTMLButtonElement;
		this.saveEmployeeButton = document.getElementById(
			"saveEmployeeBtn"
		) as HTMLButtonElement;
		this.searchInputEmployees = document.getElementById(
			"searchEmployee"
		) as HTMLInputElement;
		this.searchInputNurses = document.getElementById(
			"searchNurse"
		) as HTMLInputElement;
		this.employeePaymentStartDate = document.getElementById(
			"employeePaymentStartDate"
		) as HTMLInputElement;
		this.employeePaymentEndDate = document.getElementById(
			"employeePaymentEndDate"
		) as HTMLInputElement;
		this.nursePaymentStartDate = document.getElementById(
			"nursePaymentStartDate"
		) as HTMLInputElement;
		this.nursePaymentEndDate = document.getElementById(
			"nursePaymentEndDate"
		) as HTMLInputElement;
		this.pendingPaymentStartDate = document.getElementById(
			"pendingPaymentStartDate"
		) as HTMLInputElement;
		this.pendingPaymentEndDate = document.getElementById(
			"pendingPaymentEndDate"
		) as HTMLInputElement;

		this.initializeEventListeners();
		this.loadUser();
		this.loadEmployees();
		if (this.userPermissions.includes("manage_payments"))
			this.loadPayments();
	}

	private initializeEventListeners(): void {
		const employeesTab = document.getElementById("employees-tab");
		const nursesTab = document.getElementById("nurses-tab");
		const paymentsTab = document.getElementById("payments-tab");

		document
			.getElementById("createEmployeeBtnEmployeesTab")
			?.addEventListener("click", () => {
				this.showEmployeeModal();
			});
		document
			.getElementById("createEmployeeBtnNursesTab")
			?.addEventListener("click", () => {
				this.showEmployeeModal();
			});
		this.savePaymentButton.addEventListener("click", () => {
			this.handleSavePayment();
		});

		this.saveEmployeeButton.addEventListener("click", () => {
			this.handleSaveEmployee();
		});

		// Search input event listeners
		this.searchInputEmployees.addEventListener(
			"input",
			this.debounce(() => {
				this.renderEmployeesWithFilter(this.searchInputEmployees.value);
			}, 300)
		);
		this.searchInputNurses.addEventListener(
			"input",
			this.debounce(() => {
				this.renderEmployeesWithFilter(this.searchInputNurses.value);
			}, 300)
		);

		document
			.getElementById("employeeModal")!
			.addEventListener("hidden.bs.modal", () => {
				this.resetEmployeeForm();
			});

		if (employeesTab) {
			employeesTab.addEventListener("shown.bs.tab", () => {
				this.loadEmployees();
			});
		}

		if (nursesTab) {
			nursesTab.addEventListener("shown.bs.tab", () => {
				this.loadEmployees();
			});
		}

		if (paymentsTab) {
			paymentsTab.addEventListener("shown.bs.tab", () => {
				this.loadPayments();
			});
		}

		// Dynamic visibility for extra payment fields
		const extraPaymentTypeSelect = document.getElementById(
			"extraPaymentType"
		) as HTMLSelectElement;
		const perPatientPaymentTypeSelect = document.getElementById(
			"perPatientPaymentType"
		) as HTMLSelectElement;

		extraPaymentTypeSelect.addEventListener("change", () => {
			const extraAmountContainer = document.getElementById(
				"extraAmountContainer"
			)!;
			const perPatientPaymentTypeContainer = document.getElementById(
				"perPatientPaymentTypeContainer"
			)!;
			const percentageScopeContainer = document.getElementById(
				"percentageScopeContainer"
			)!;
			const extraPaymentValue = extraPaymentTypeSelect.value;
			const perPatientValue = perPatientPaymentTypeSelect.value;
			extraAmountContainer.style.display =
				extraPaymentValue === "per_patient" ||
				extraPaymentValue === "income"
					? "block"
					: "none";
			perPatientPaymentTypeContainer.style.display =
				extraPaymentValue === "per_patient" ? "block" : "none";
			percentageScopeContainer.style.display =
				perPatientValue === "percentage" ||
				extraPaymentValue === "income"
					? "block"
					: "none";
		});

		// Dynamic visibility for payment extra payment fields
		const paymentExtraPaymentTypeSelect = document.getElementById(
			"paymentExtraPaymentType"
		) as HTMLSelectElement;
		paymentExtraPaymentTypeSelect.addEventListener("change", () => {
			const paymentExtraAmountContainer = document.getElementById(
				"paymentExtraAmountContainer"
			)!;
			const paymentPercentageScopeContainer = document.getElementById(
				"paymentPercentageScopeContainer"
			)!;
			const value = paymentExtraPaymentTypeSelect.value;
			paymentExtraAmountContainer.style.display =
				value === "per_patient" || value === "income"
					? "block"
					: "none";
			paymentPercentageScopeContainer.style.display =
				value === "income" ? "block" : "none";
		});

		perPatientPaymentTypeSelect.addEventListener("change", () => {
			const percentageScopeContainer = document.getElementById(
				"percentageScopeContainer"
			)!;
			const extraPaymentValue = extraPaymentTypeSelect.value;
			const perPatientValue = perPatientPaymentTypeSelect.value;

			percentageScopeContainer.style.display =
				perPatientValue === "percentage" ||
				extraPaymentValue === "income"
					? "block"
					: "none";
		});

		// Date filter events for Employees tab
		this.employeePaymentStartDate.addEventListener("change", () =>
			this.renderEmployees(
				"other",
				"employeesTableBody",
				this.employeePaymentStartDate,
				this.employeePaymentEndDate
			)
		);
		this.employeePaymentEndDate.addEventListener("change", () =>
			this.renderEmployees(
				"other",
				"employeesTableBody",
				this.employeePaymentStartDate,
				this.employeePaymentEndDate
			)
		);
		document
			.getElementById("employeeClearDateFilter")
			?.addEventListener("click", () => {
				this.employeePaymentStartDate.value = "";
				this.employeePaymentEndDate.value = "";
				this.renderEmployees(
					"other",
					"employeesTableBody",
					this.employeePaymentStartDate,
					this.employeePaymentEndDate
				);
			});

		// Date filter events for Nurses tab
		this.nursePaymentStartDate.addEventListener("change", () =>
			this.renderEmployees(
				"nurse",
				"nursesTableBody",
				this.nursePaymentStartDate,
				this.nursePaymentEndDate
			)
		);
		this.nursePaymentEndDate.addEventListener("change", () =>
			this.renderEmployees(
				"nurse",
				"nursesTableBody",
				this.nursePaymentStartDate,
				this.nursePaymentEndDate
			)
		);
		document
			.getElementById("nurseClearDateFilter")
			?.addEventListener("click", () => {
				this.nursePaymentStartDate.value = "";
				this.nursePaymentEndDate.value = "";
				this.renderEmployees(
					"nurse",
					"nursesTableBody",
					this.nursePaymentStartDate,
					this.nursePaymentEndDate
				);
			});
		if (paymentsTab) {
			// Date filter events for Pending Payments tab
			this.pendingPaymentStartDate.addEventListener("change", () =>
				this.renderPayments()
			);
			this.pendingPaymentEndDate.addEventListener("change", () =>
				this.renderPayments()
			);
			document
				.getElementById("pendingClearDateFilter")
				?.addEventListener("click", () => {
					this.pendingPaymentStartDate.value = "";
					this.pendingPaymentEndDate.value = "";
					this.renderPayments();
				});
		}
	}

	private renderEmployeesWithFilter(filter: string): void {
		this.renderEmployees(
			"other",
			"employeesTableBody",
			this.employeePaymentStartDate,
			this.employeePaymentEndDate,
			filter
		);
		this.renderEmployees(
			"nurse",
			"nursesTableBody",
			this.nursePaymentStartDate,
			this.nursePaymentEndDate,
			filter
		);
	}

	private async loadUser(): Promise<void> {
		try {
			const userString = localStorage.getItem("user");
			if (!userString) return;

			const user = JSON.parse(userString);
			this.userPermissions = user.permissions;
		} catch (error) {
			this.showError("Failed to load user permissions");
		}
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
			employees.forEach((employee) =>
				this.employees.set(employee.employee_id, employee)
			);
			this.renderEmployees(
				"other",
				"employeesTableBody",
				this.employeePaymentStartDate,
				this.employeePaymentEndDate
			);
			this.renderEmployees(
				"nurse",
				"nursesTableBody",
				this.nursePaymentStartDate,
				this.nursePaymentEndDate
			);
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
			payments.forEach((payment) => {
				this.payments.set(payment.payment_id, payment);
			});
			this.renderPayments();
		} catch (error) {
			this.showError("Failed to load payments");
		}
	}

	private async loadEmployeePayments(employeeId: number): Promise<Payment[]> {
		try {
			const response = await fetch(
				`/api/employee-payments/employee/${employeeId}`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);
			if (!response.ok)
				throw new Error(
					`Failed to fetch payments for employee ${employeeId}`
				);
			return await response.json();
		} catch (error) {
			this.showError(`Failed to load payments for employee`);
			return [];
		}
	}

	private async renderEmployees(
		employeeType: "doctor" | "nurse" | "other",
		tableBodyId: string,
		startDateInput: HTMLInputElement,
		endDateInput: HTMLInputElement,
		filterTerm: string = ""
	): Promise<void> {
		const tbody = document.getElementById(tableBodyId)!;
		const startDate = startDateInput.value
			? new Date(startDateInput.value).getTime()
			: null;
		const endDate = endDateInput.value
			? new Date(endDateInput.value).getTime()
			: null;

		const filteredEmployees = Array.from(this.employees.values()).filter(
			(employee) =>
				employee.employee_type === employeeType &&
				employee.name.toLowerCase().includes(filterTerm.toLowerCase())
		);

		const employeeData = await Promise.all(
			filteredEmployees.map(async (employee) => {
				const payments = this.userPermissions.includes(
					"manage_payments"
				)
					? await this.loadEmployeePayments(employee.employee_id)
					: [];
				const filteredPayments = payments.filter((payment) => {
					const issuedTime = new Date(
						payment.issued_timestamp
					).getTime();
					if (startDate && issuedTime < startDate) return false;
					if (endDate && issuedTime > endDate) return false;
					return true;
				});

				for (const payment of filteredPayments) {
					if (payment.is_paid && payment.paid_by_user_id) {
						const name = await this.getUserNameById(
							payment.paid_by_user_id
						);
						payment.paid_by = name;
					}
					this.payments.set(payment.payment_id, payment);
				}
				return { employee, payments: filteredPayments };
			})
		);
		tbody.innerHTML = employeeData
			.map(({ employee, payments }) => {
				const collapseId = `employeePayments${employee.employee_id}`;
				return `
          <tr>
            <td>
              ${
					this.userPermissions.includes("manage_payments") &&
					payments.length > 0
						? `<button class="btn btn-link p-0" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                                 <i class="bi bi-chevron-down"></i>
                               </button>`
						: ""
				}
            </td>
            <td>${this.escapeHtml(employee.name)}</td>
            <td>${this.escapeHtml(employee.employee_type)}</td>
            <td>${new Date(employee.hire_date).toLocaleDateString()}</td>
            <td>$${
				this.userPermissions.includes("manage_payments")
					? employee.base_pay || "-"
					: "-"
			}</td>
            <td>${employee.shift_type || "-"}</td>
            <td>${
				this.escapeHtml(employee.per_patient_payment_type || "") +
				" " +
				this.escapeHtml(employee.extra_payment_type || "-")
			}</td>
			<td>${
				employee.is_active
					? `<span class='feature-indicator enabled'>
						<i class='bi bi-check-circle-fill text-success'></i>
						Yes
					</span>`
					: `<span class="feature-indicator disabled">
                        <i class="bi bi-x-circle-fill text-danger"></i>
                        No
                    </span>`
			}</td>
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
			    ${
					this.userPermissions.includes("manage_payments")
						? `<button class="btn btn-sm btn-outline-success" onclick="employeeManager.showPaymentModal(${employee.employee_id})">
                 <i class="bi bi-plus-circle"></i> Create Payment
               </button>`
						: ""
				}
              </div>
            </td>
          </tr>
          ${
				this.userPermissions.includes("manage_payments") &&
				payments.length > 0
					? `
              <tr class="collapse" id="${collapseId}">
                <td colspan="12">
                  <div class="table-responsive">
                    <table class="table table-hover">
                      <thead>
                        <tr>
                          <th>Payment ID</th>
                          <th>Amount</th>
                          <th>Type</th>
                          <th>Issued</th>
                          <th>Status</th>
                          <th>Paid By</th>
                          <th>Paid On</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${payments
							.map(
								(payment) => `
                          <tr>
                            <td>${payment.payment_id}</td>
                            <td>$${
								Number(payment.payment_amount) +
								Number(payment.extra_amount || 0)
							}<small class="d-block text-muted">($${
									payment.payment_amount
								} + $${payment.extra_amount || 0})</small></td>
                            <td>${this.escapeHtml(
								payment.extra_payment_type || "None"
							)}</td>
                            <td>${new Date(
								payment.issued_timestamp
							).toLocaleString()}</td>
                            <td>${
								payment.is_void
									? "Void"
									: payment.is_paid
									? "Paid"
									: "Pending"
							}</td>
                            <td>${
								payment.is_paid && payment.paid_by
									? this.escapeHtml(payment.paid_by || "-")
									: "-"
							}</td>
                            <td>${
								payment.is_paid && payment.paid_timestamp
									? new Date(
											payment.paid_timestamp
									  ).toLocaleString()
									: "-"
							}</td>
                            <td>
                              <div class="action-buttons">
                                ${
									!payment.is_paid && !payment.is_void
										? `
                                  <button class="btn btn-sm btn-outline-success" onclick="employeeManager.markPaymentPaid(${payment.payment_id})">
                                    <i class="bi bi-check-circle"></i> Mark Paid
                                  </button>
                                  <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidPayment(${payment.payment_id})">
                                    <i class="bi bi-x-circle"></i> Void
                                  </button>
                                `
										: payment.is_paid && !payment.is_void
										? `
                                  <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidPayment(${payment.payment_id})">
                                    <i class="bi bi-x-circle"></i> Void
                                  </button>
                                `
										: ""
								}
                              </div>
                            </td>
                          </tr>
                        `
							)
							.join("")}
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            `
					: ""
			}
        `;
			})
			.join("");
	}

	private async getUserNameById(id: number): Promise<string> {
		try {
			const response = await fetch("/api/users/name/" + id, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (!response.ok) {
				throw new Error("Failed to load user name");
			}
			return await response.json();
		} catch (error) {
			this.showError("Failed to load user name");
			return "";
		}
	}

	private renderPayments(): void {
		const tbody = document.getElementById("paymentsTableBody")!;
		const employeeNames = new Map(
			Array.from(this.employees).map(([id, e]) => [id, e.name])
		);

		// Group payments by employee_id
		const paymentsByEmployee = Array.from(this.payments.values())
			.filter((p) => this.employees.has(p.employee_id))
			.reduce((acc, payment) => {
				if (!acc[payment.employee_id]) {
					acc[payment.employee_id] = [];
				}
				acc[payment.employee_id].push(payment);
				return acc;
			}, {} as Record<number, Payment[]>);

		tbody.innerHTML = Object.entries(paymentsByEmployee)
			.map(([employeeId, payments]) => {
				const totalAmount = payments.reduce(
					(sum, p) => sum + Number(p.payment_amount),
					0
				);
				const paymentType = payments[0]?.extra_payment_type || "None";
				const dateRange =
					payments.length > 0
						? `${new Date(
								Math.min(
									...payments.map((p) =>
										new Date(p.issued_timestamp).getTime()
									)
								)
						  ).toLocaleDateString()} - ${new Date(
								Math.max(
									...payments.map((p) =>
										new Date(p.issued_timestamp).getTime()
									)
								)
						  ).toLocaleDateString()}`
						: "-";
				const collapseId = `paymentDetails${employeeId}`;
				return `
          <tr>
            <td>
              <button class="btn btn-link" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                <i class="bi bi-chevron-down"></i>
              </button>
            </td>
            <td>${this.escapeHtml(
				employeeNames.get(Number(employeeId)) || "Unknown"
			)}</td>
            <td>$${totalAmount}</td>
            <td>${this.escapeHtml(paymentType)}</td>
            <td>${dateRange}</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn-sm btn-outline-success" onclick="employeeManager.markAllPaymentsPaid(${employeeId})">
                  <i class="bi bi-check-circle"></i> Mark All Paid
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidAllPayments(${employeeId})">
                  <i class="bi bi-x-circle"></i> Void All
                </button>
              </div>
            </td>
          </tr>
          <tr class="collapse" id="${collapseId}">
            <td colspan="6">
              <div class="table-responsive">
                <table class="table table-hover">
                  <thead>
                    <tr>
                      <th>Payment ID</th>
                      <th>Amount</th>
                      <th>Type</th>
                      <th>Issued</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${payments
						.map(
							(payment) => `
                        <tr>
                          <td>${payment.payment_id}</td>
                          <td>$${payment.payment_amount}</td>
                          <td>${this.escapeHtml(
								payment.extra_payment_type || "None"
							)}</td>
                          <td>${new Date(
								payment.issued_timestamp
							).toLocaleString()}</td>
                          <td>
                            <div class="action-buttons">
                              <button class="btn btn-sm btn-outline-success" onclick="employeeManager.markPaymentPaid(${
									payment.payment_id
								})">
                                <i class="bi bi-check-circle"></i> Mark Paid
                              </button>
                              <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidPayment(${
									payment.payment_id
								})">
                                <i class="bi bi-x-circle"></i> Void
                              </button>
                            </div>
                          </td>
                        </tr>
                      `
						)
						.join("")}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        `;
			})
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

	private showPaymentModal(employeeId: number): void {
		this.resetPaymentForm();
		(
			document.getElementById("paymentEmployeeId") as HTMLInputElement
		).value = employeeId.toString();
		const modalTitle = document.getElementById("paymentModalLabel")!;
		const employee = this.employees.get(employeeId);
		modalTitle.textContent = `Create Manual Payment for ${
			employee ? this.escapeHtml(employee.name) : "Employee"
		}`;
		this.paymentModal.show();
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
		(document.getElementById("extraAmount") as HTMLInputElement).value =
			employee.extra_amount?.toString() || "";
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
		(document.getElementById("shiftStartTime") as HTMLInputElement).value =
			employee.shift_start_time || "";
		(document.getElementById("shiftEndTime") as HTMLInputElement).value =
			employee.shift_end_time || "";
		(document.getElementById("isActive") as HTMLInputElement).checked =
			employee.is_active !== false;
		const extraPaymentTypeSelect = document.getElementById(
			"extraPaymentType"
		) as HTMLSelectElement;
		extraPaymentTypeSelect.dispatchEvent(new Event("change"));
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
			extra_amount:
				parseFloat(
					(document.getElementById("extraAmount") as HTMLInputElement)
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
			is_active: (document.getElementById("isActive") as HTMLInputElement)
				.checked,
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

	private async handleSavePayment(): Promise<void> {
		if (!this.validatePaymentForm()) return;

		const employeeId = (
			document.getElementById("paymentEmployeeId") as HTMLInputElement
		).value;
		const paymentData = {
			employee_id: Number(employeeId),
			payment_amount: parseFloat(
				(document.getElementById("paymentAmount") as HTMLInputElement)
					.value
			),
			payment_type: (
				document.getElementById("paymentType") as HTMLSelectElement
			).value,
			extra_payment_type:
				(
					document.getElementById(
						"paymentExtraPaymentType"
					) as HTMLSelectElement
				).value || undefined,
			extra_amount:
				parseFloat(
					(
						document.getElementById(
							"paymentExtraAmount"
						) as HTMLInputElement
					).value
				) || undefined,
			percentage_scope:
				(
					document.getElementById(
						"paymentPercentageScope"
					) as HTMLSelectElement
				).value || undefined
		};

		try {
			this.setPaymentLoading(true);
			const response = await fetch("/api/employee-payments", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				},
				body: JSON.stringify(paymentData)
			});

			if (!response.ok) throw new Error("Failed to create payment");
			const data = await response.json();
			await this.markPaymentPaid(Number(data.payment_id), true);
			await this.loadEmployees(); // Reload to update payment tables
			this.paymentModal.hide();
			toastr.success("Payment created successfully");
		} catch (error) {
			this.showError("Failed to create payment");
		} finally {
			this.setPaymentLoading(false);
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

	public async markPaymentPaid(
		paymentId: number,
		noConfirm = false
	): Promise<void> {
		let result = null;
		if (!noConfirm) {
			result = await Swal.fire({
				title: "Confirm Payment",
				text: "Mark this payment as paid?",
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#0d6efd",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Yes, mark as paid"
			});
		}

		if (noConfirm || result.isConfirmed) {
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
				await this.loadEmployees();
				toastr.success("Payment marked as paid");
			} catch (error) {
				this.showError("Failed to mark payment as paid");
			}
		}
	}

	public async markAllPaymentsPaid(employeeId: number): Promise<void> {
		const result = await Swal.fire({
			title: "Confirm All Payments",
			text: "Mark all pending payments for this employee as paid?",
			icon: "question",
			showCancelButton: true,
			confirmButtonColor: "#0d6efd",
			cancelButtonColor: "#6c757d",
			confirmButtonText: "Yes, mark all as paid"
		});

		if (result.isConfirmed) {
			try {
				const payments = Array.from(this.payments.values()).filter(
					(p) =>
						p.employee_id === employeeId && !p.is_paid && !p.is_void
				);
				for (const payment of payments) {
					const response = await fetch(
						`/api/employee-payments/${payment.payment_id}/paid`,
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
				}
				await this.loadPayments();
				await this.loadEmployees();
				toastr.success("All payments marked as paid");
			} catch (error) {
				this.showError("Failed to mark all payments as paid");
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
				await this.loadEmployees();
				//@ts-ignore
				await doctorManager.refreshDoctors();
				toastr.success("Payment voided successfully");
			} catch (error) {
				this.showError("Failed to void payment");
			}
		}
	}

	public async voidAllPayments(employeeId: number): Promise<void> {
		const result = await Swal.fire({
			title: "Void All Payments",
			text: "Void all pending payments for this employee? This action cannot be undone!",
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#dc3545",
			cancelButtonColor: "#6c757d",
			confirmButtonText: "Yes, void all"
		});

		if (result.isConfirmed) {
			try {
				const payments = Array.from(this.payments.values()).filter(
					(p) =>
						p.employee_id === employeeId && !p.is_paid && !p.is_void
				);
				for (const payment of payments) {
					const response = await fetch(
						`/api/employee-payments/${payment.payment_id}/void`,
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
				}
				await this.loadPayments();
				await this.loadEmployees();
				toastr.success("All payments voided successfully");
			} catch (error) {
				this.showError("Failed to void all payments");
			}
		}
	}

	private validateEmployeeForm(): boolean {
		this.employeeForm.classList.add("was-validated");
		return this.employeeForm.checkValidity();
	}

	private validatePaymentForm(): boolean {
		this.paymentForm.classList.add("was-validated");
		return this.paymentForm.checkValidity();
	}

	private resetEmployeeForm(): void {
		this.employeeForm.reset();
		this.employeeForm.classList.remove("was-validated");
		(document.getElementById("employeeId") as HTMLInputElement).value = "";
		(
			document.getElementById("extraAmountContainer") as HTMLElement
		).style.display = "none";
		(
			document.getElementById(
				"perPatientPaymentTypeContainer"
			) as HTMLElement
		).style.display = "none";
		(
			document.getElementById("percentageScopeContainer") as HTMLElement
		).style.display = "none";
	}

	private resetPaymentForm(): void {
		this.paymentForm.reset();
		this.paymentForm.classList.remove("was-validated");
		(
			document.getElementById("paymentEmployeeId") as HTMLInputElement
		).value = "";
		(
			document.getElementById(
				"paymentExtraAmountContainer"
			) as HTMLElement
		).style.display = "none";
		(
			document.getElementById(
				"paymentPercentageScopeContainer"
			) as HTMLElement
		).style.display = "none";
	}

	private setEmployeeLoading(loading: boolean): void {
		const spinner =
			this.saveEmployeeButton.querySelector(".spinner-border")!;
		const buttonText = this.saveEmployeeButton.querySelector(".btn-text")!;
		this.saveEmployeeButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading ? "Saving..." : "Save";
	}

	private setPaymentLoading(loading: boolean): void {
		const spinner =
			this.savePaymentButton.querySelector(".spinner-border")!;
		const buttonText = this.savePaymentButton.querySelector(".btn-text")!;
		this.savePaymentButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading ? "Saving..." : "Save Payment";
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
			.replace(/'/g, "&#039;")
			.replace(/_/g, " ");
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
