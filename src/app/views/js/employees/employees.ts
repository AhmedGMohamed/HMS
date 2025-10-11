//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

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
		this.waitForI18n().then(() => {
			new SidebarManager();

			this.initializeEventListeners();
			this.loadUser();
			this.loadEmployees();
			if (this.userPermissions.includes("manage_payments"))
				this.loadPayments();

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
		// Update page title
		document.title = i18n.t("employees.pageTitle");

		// Re-render all employee tables with new formatting and translations
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

		// Re-render payments if user has permission
		if (this.userPermissions.includes("manage_payments")) {
			this.renderPayments();
		}
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
			document.title = i18n.t("employees.pageTitle");

			const userString = localStorage.getItem("user");
			if (!userString) return;

			const user = JSON.parse(userString);
			this.userPermissions = user.permissions;
		} catch (error) {
			this.showError(i18n.t("employees.messages.loadError"));
		}
	}

	private async loadEmployees(): Promise<void> {
		try {
			const response = await fetch("/api/employees", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (!response.ok)
				throw new Error(i18n.t("employees.messages.loadError"));
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
			this.showError(i18n.t("employees.messages.loadError"));
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
			if (!response.ok)
				throw new Error(i18n.t("employees.messages.loadPaymentsError"));
			const payments: Payment[] = await response.json();
			this.payments.clear();
			payments.forEach((payment) => {
				this.payments.set(payment.payment_id, payment);
			});
			this.renderPayments();
		} catch (error) {
			this.showError(i18n.t("employees.messages.loadPaymentsError"));
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
				throw new Error(i18n.t("employees.messages.loadPaymentsError"));
			return await response.json();
		} catch (error) {
			this.showError(i18n.t("employees.messages.loadPaymentsError"));
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

		if (filteredEmployees.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="9" class="text-center text-muted">
						${i18n.t("common.noData")}
					</td>
				</tr>
			`;
			return;
		}

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
            <td>${i18n.t(`employees.types.${employee.employee_type}`)}</td>
            <td>${i18n.formatDate(new Date(employee.hire_date))}</td>
            <td>${
				this.userPermissions.includes("manage_payments")
					? i18n.formatCurrency(employee.base_pay || 0)
					: "-"
			}</td>
            <td>${
				employee.shift_type
					? i18n.t(`employees.shiftTypes.${employee.shift_type}`)
					: "-"
			}</td>
            <td>${
				(employee.per_patient_payment_type
					? i18n.t(
							`employees.perPatientPaymentTypes.${employee.per_patient_payment_type}`
					  )
					: "") +
				" " +
				(employee.extra_payment_type &&
				employee.extra_payment_type !== "none"
					? i18n.t(
							`employees.paymentTypes.${employee.extra_payment_type}`
					  )
					: i18n.t("employees.paymentTypes.none"))
			}</td>
			<td>${
				employee.is_active
					? `<span class='feature-indicator enabled'>
						<i class='bi bi-check-circle-fill text-success'></i>
						${i18n.t("common.yes")}
					</span>`
					: `<span class="feature-indicator disabled">
                        <i class="bi bi-x-circle-fill text-danger"></i>
                        ${i18n.t("common.no")}
                    </span>`
			}</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn-sm btn-outline-primary" onclick="employeeManager.editEmployee(${
					employee.employee_id
				})">
                  <i class="bi bi-pencil"></i> ${i18n.t(
						"employees.buttons.edit"
					)}
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.deleteEmployee(${
					employee.employee_id
				})">
                  <i class="bi bi-trash"></i> ${i18n.t(
						"employees.buttons.delete"
					)}
                </button>
			    ${
					this.userPermissions.includes("manage_payments")
						? `<button class="btn btn-sm btn-outline-success" onclick="employeeManager.showPaymentModal(${
								employee.employee_id
						  })">
                 <i class="bi bi-plus-circle"></i> ${i18n.t(
						"employees.buttons.createPayment"
					)}
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
                          <th>${i18n.t("employees.table.paymentId")}</th>
                          <th>${i18n.t("employees.table.amount")}</th>
                          <th>${i18n.t("employees.table.type")}</th>
                          <th>${i18n.t("employees.table.issued")}</th>
                          <th>${i18n.t("employees.table.status")}</th>
                          <th>${i18n.t("employees.table.paidBy")}</th>
                          <th>${i18n.t("employees.table.paidOn")}</th>
                          <th>${i18n.t("common.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${payments
							.map(
								(payment) => `
                          <tr>
                            <td>${payment.payment_id}</td>
                            <td>${i18n.formatCurrency(
								Number(payment.payment_amount) +
									Number(payment.extra_amount || 0)
							)}<small class="d-block text-muted">(${i18n.formatCurrency(
									payment.payment_amount
								)} + ${i18n.formatCurrency(
									payment.extra_amount || 0
								)})</small></td>
                            <td>${
								payment.extra_payment_type &&
								payment.extra_payment_type !== "none"
									? i18n.t(
											`employees.paymentTypes.${payment.extra_payment_type}`
									  )
									: i18n.t("employees.paymentTypes.none")
							}</td>
                            <td>${i18n.formatDateTime(
								new Date(payment.issued_timestamp)
							)}</td>
                            <td>${
								payment.is_void
									? i18n.t("employees.paymentStatus.void")
									: payment.is_paid
									? i18n.t("employees.paymentStatus.paid")
									: i18n.t("employees.paymentStatus.pending")
							}</td>
                            <td>${
								payment.is_paid && payment.paid_by
									? this.escapeHtml(payment.paid_by)
									: "-"
							}</td>
                            <td>${
								payment.is_paid && payment.paid_timestamp
									? i18n.formatDateTime(
											new Date(payment.paid_timestamp)
									  )
									: "-"
							}</td>
                            <td>
                              <div class="action-buttons">
                                ${
									!payment.is_paid && !payment.is_void
										? `
                                  <button class="btn btn-sm btn-outline-success" onclick="employeeManager.markPaymentPaid(${
										payment.payment_id
									})">
                                    <i class="bi bi-check-circle"></i> ${i18n.t(
										"employees.buttons.markPaid"
									)}
                                  </button>
                                  <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidPayment(${
										payment.payment_id
									})">
                                    <i class="bi bi-x-circle"></i> ${i18n.t(
										"employees.buttons.void"
									)}
                                  </button>
                                `
										: payment.is_paid && !payment.is_void
										? `
                                  <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidPayment(${
										payment.payment_id
									})">
                                    <i class="bi bi-x-circle"></i> ${i18n.t(
										"employees.buttons.void"
									)}
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
				throw new Error(i18n.t("employees.messages.loadUserNameError"));
			}
			return await response.json();
		} catch (error) {
			this.showError(i18n.t("employees.messages.loadUserNameError"));
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

		if (Object.keys(paymentsByEmployee).length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="6" class="text-center text-muted">
						${i18n.t("common.noData")}
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = Object.entries(paymentsByEmployee)
			.map(([employeeId, payments]) => {
				const totalAmount = payments.reduce(
					(sum, p) => sum + Number(p.payment_amount),
					0
				);
				const paymentType = payments[0]?.extra_payment_type
					? i18n.t(
							`employees.paymentTypes.${payments[0].extra_payment_type}`
					  )
					: i18n.t("employees.paymentTypes.none");
				const dateRange =
					payments.length > 0
						? `${i18n.formatDate(
								new Date(
									Math.min(
										...payments.map((p) =>
											new Date(
												p.issued_timestamp
											).getTime()
										)
									)
								)
						  )} - ${i18n.formatDate(
								new Date(
									Math.max(
										...payments.map((p) =>
											new Date(
												p.issued_timestamp
											).getTime()
										)
									)
								)
						  )}`
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
            <td>${i18n.formatCurrency(totalAmount)}</td>
            <td>${paymentType}</td>
            <td>${dateRange}</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn-sm btn-outline-success" onclick="employeeManager.markAllPaymentsPaid(${employeeId})">
                  <i class="bi bi-check-circle"></i> ${i18n.t(
						"employees.buttons.markAllPaid"
					)}
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidAllPayments(${employeeId})">
                  <i class="bi bi-x-circle"></i> ${i18n.t(
						"employees.buttons.voidAll"
					)}
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
                      <th>${i18n.t("employees.table.paymentId")}</th>
                      <th>${i18n.t("employees.table.amount")}</th>
                      <th>${i18n.t("employees.table.type")}</th>
                      <th>${i18n.t("employees.table.issued")}</th>
                      <th>${i18n.t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${payments
						.map(
							(payment) => `
                        <tr>
                          <td>${payment.payment_id}</td>
                          <td>${i18n.formatCurrency(
								payment.payment_amount
							)}</td>
                          <td>${
								payment.extra_payment_type &&
								payment.extra_payment_type !== "none"
									? i18n.t(
											`employees.paymentTypes.${payment.extra_payment_type}`
									  )
									: i18n.t("employees.paymentTypes.none")
							}</td>
                          <td>${i18n.formatDateTime(
								new Date(payment.issued_timestamp)
							)}</td>
                          <td>
                            <div class="action-buttons">
                              <button class="btn btn-sm btn-outline-success" onclick="employeeManager.markPaymentPaid(${
									payment.payment_id
								})">
                                <i class="bi bi-check-circle"></i> ${i18n.t(
									"employees.buttons.markPaid"
								)}
                              </button>
                              <button class="btn btn-sm btn-outline-danger" onclick="employeeManager.voidPayment(${
									payment.payment_id
								})">
                                <i class="bi bi-x-circle"></i> ${i18n.t(
									"employees.buttons.void"
								)}
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
			modalTitle.textContent = i18n.t("employees.editEmployee");
			const employee = this.employees.get(employeeId);
			if (employee) this.populateEmployeeForm(employee);
		} else {
			modalTitle.textContent = i18n.t("employees.createNew");
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
		const employeeName = employee
			? this.escapeHtml(employee.name)
			: i18n.t("common.loading");
		modalTitle.textContent = i18n.t("employees.createManualPaymentFor", {
			name: employeeName
		});
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
			shift_start_time:
				(document.getElementById("shiftStartTime") as HTMLInputElement)
					.value || undefined,
			shift_end_time:
				(document.getElementById("shiftEndTime") as HTMLInputElement)
					.value || undefined,
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

			if (!response.ok)
				throw new Error(i18n.t("employees.messages.saveError"));
			await this.loadEmployees();
			this.employeeModal.hide();
			toastr.success(
				employeeId
					? i18n.t("employees.messages.updateSuccess")
					: i18n.t("employees.messages.createSuccess")
			);
		} catch (error) {
			this.showError(i18n.t("employees.messages.saveError"));
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

			if (!response.ok)
				throw new Error(
					i18n.t("employees.messages.paymentCreateError")
				);
			const data = await response.json();
			await this.markPaymentPaid(Number(data.payment_id), true);
			await this.loadEmployees();
			this.paymentModal.hide();
			toastr.success(i18n.t("employees.messages.paymentCreateSuccess"));
		} catch (error) {
			this.showError(i18n.t("employees.messages.paymentCreateError"));
		} finally {
			this.setPaymentLoading(false);
		}
	}

	public async deleteEmployee(employeeId: number): Promise<void> {
		const result = await Swal.fire({
			title: i18n.t("employees.messages.deleteConfirmTitle"),
			text: i18n.t("employees.messages.deleteConfirmText"),
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#dc3545",
			cancelButtonColor: "#6c757d",
			confirmButtonText: i18n.t("common.yes"),
			cancelButtonText: i18n.t("common.cancel")
		});

		if (result.isConfirmed) {
			try {
				const response = await fetch(`/api/employees/${employeeId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (!response.ok)
					throw new Error(i18n.t("employees.messages.deleteError"));
				await this.loadEmployees();
				toastr.success(i18n.t("employees.messages.deleteSuccess"));
			} catch (error) {
				this.showError(i18n.t("employees.messages.deleteError"));
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
				title: i18n.t("employees.messages.markPaidConfirmTitle"),
				text: i18n.t("employees.messages.markPaidConfirmText"),
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#0d6efd",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("common.yes"),
				cancelButtonText: i18n.t("common.cancel")
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
					throw new Error(i18n.t("employees.messages.markPaidError"));
				await this.loadPayments();
				await this.loadEmployees();
				toastr.success(i18n.t("employees.messages.markPaidSuccess"));
			} catch (error) {
				this.showError(i18n.t("employees.messages.markPaidError"));
			}
		}
	}

	public async markAllPaymentsPaid(employeeId: number): Promise<void> {
		const result = await Swal.fire({
			title: i18n.t("employees.messages.markAllPaidConfirmTitle"),
			text: i18n.t("employees.messages.markAllPaidConfirmText"),
			icon: "question",
			showCancelButton: true,
			confirmButtonColor: "#0d6efd",
			cancelButtonColor: "#6c757d",
			confirmButtonText: i18n.t("common.yes"),
			cancelButtonText: i18n.t("common.cancel")
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
						throw new Error(
							i18n.t("employees.messages.markAllPaidError")
						);
				}
				await this.loadPayments();
				await this.loadEmployees();
				toastr.success(i18n.t("employees.messages.markAllPaidSuccess"));
			} catch (error) {
				this.showError(i18n.t("employees.messages.markAllPaidError"));
			}
		}
	}

	public async voidPayment(paymentId: number): Promise<void> {
		const result = await Swal.fire({
			title: i18n.t("employees.messages.voidConfirmTitle"),
			text: i18n.t("employees.messages.voidConfirmText"),
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#dc3545",
			cancelButtonColor: "#6c757d",
			confirmButtonText: i18n.t("common.yes"),
			cancelButtonText: i18n.t("common.cancel")
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
				if (!response.ok)
					throw new Error(i18n.t("employees.messages.voidError"));
				await this.loadPayments();
				await this.loadEmployees();
				//@ts-ignore
				await doctorManager.refreshDoctors();
				toastr.success(i18n.t("employees.messages.voidSuccess"));
			} catch (error) {
				this.showError(i18n.t("employees.messages.voidError"));
			}
		}
	}

	public async voidAllPayments(employeeId: number): Promise<void> {
		const result = await Swal.fire({
			title: i18n.t("employees.messages.voidAllConfirmTitle"),
			text: i18n.t("employees.messages.voidAllConfirmText"),
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#dc3545",
			cancelButtonColor: "#6c757d",
			confirmButtonText: i18n.t("common.yes"),
			cancelButtonText: i18n.t("common.cancel")
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
					if (!response.ok)
						throw new Error(
							i18n.t("employees.messages.voidAllError")
						);
				}
				await this.loadPayments();
				await this.loadEmployees();
				toastr.success(i18n.t("employees.messages.voidAllSuccess"));
			} catch (error) {
				this.showError(i18n.t("employees.messages.voidAllError"));
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
		buttonText.textContent = loading
			? i18n.t("employees.buttons.saving")
			: i18n.t("common.save");
	}

	private setPaymentLoading(loading: boolean): void {
		const spinner =
			this.savePaymentButton.querySelector(".spinner-border")!;
		const buttonText = this.savePaymentButton.querySelector(".btn-text")!;
		this.savePaymentButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("employees.buttons.savingPayment")
			: i18n.t("employees.savePayment");
	}

	private showError(message: string): void {
		Swal.fire({
			icon: "error",
			title: i18n.t("common.error"),
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
