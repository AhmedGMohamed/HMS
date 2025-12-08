//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { i18n } from "../utils/i18n.js";

interface Doctor {
	employee_id: number;
	name: string;
	phone?: string;
	is_facility_employee: boolean;
	is_active: boolean;
	hire_date: string;
	employee_type: "doctor";
	daily_pay?: number;
	extra_payment: number;
	per_patient_pay?: number;
	payment_calculation?: string;
	per_patient_payment_type?: string;
	percentage_scope?: string;
	need_clock_in: boolean;
	doctor_type: string;
	referral_bonus?: number;
	shift_type?: string;
	shift_start_time: string;
	shift_end_time: string;
}

interface Payment {
	payment_id: number;
	employee_id: number;
	payment_amount: number;
	payment_type: string;
	extra_payment_type: string;
	extra_amount: number;
	issued_timestamp: string;
	is_paid: boolean;
	is_void: boolean;
	paid_by?: string;
	paid_by_user_id?: string | number;
	paid_timestamp?: string;
}

class DoctorManager {
	private doctorModal: any;
	private doctorForm: HTMLFormElement;
	private saveDoctorButton: HTMLButtonElement;
	private searchDoctor: HTMLInputElement;
	private doctorPaymentStartDate: HTMLInputElement;
	private doctorPaymentEndDate: HTMLInputElement;
	private doctors: Map<number, Doctor> = new Map();
	private userPermissions: string[] = [];
	private userRole: string = "";

	constructor() {
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
		this.searchDoctor = document.getElementById(
			"searchDoctor"
		) as HTMLInputElement;
		this.doctorPaymentStartDate = document.getElementById(
			"doctorPaymentStartDate"
		) as HTMLInputElement;
		this.doctorPaymentEndDate = document.getElementById(
			"doctorPaymentEndDate"
		) as HTMLInputElement;

		this.waitForI18n().then(() => {
			this.initializeEventListeners();
			this.loadUser();
			this.loadDoctors();

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
		// Re-render doctors table with new formatting and translations
		this.renderDoctors(this.searchDoctor.value);
	}

	private initializeEventListeners(): void {
		document
			.getElementById("createEmployeeBtnDoctorsTab")
			?.addEventListener("click", () => {
				if (this.userRole !== "Admin") {
					this.showError(
						i18n.t("employees.messages.onlyAdminsCanCreate")
					);
					return;
				}
				this.showDoctorModal();
			});

		this.saveDoctorButton.addEventListener("click", () => {
			this.handleSaveDoctor();
		});

		this.doctorModal._element.addEventListener("hidden.bs.modal", () => {
			this.resetDoctorForm();
		});

		const perPatientPaymentTypeSelect = document.getElementById(
			"perPatientPaymentTypeDoctor"
		) as HTMLSelectElement;
		perPatientPaymentTypeSelect.addEventListener("change", () => {
			const percentageScopeContainer = document.getElementById(
				"percentageScopeContainerDoctor"
			)!;
			percentageScopeContainer.style.display =
				perPatientPaymentTypeSelect.value === "percentage"
					? "block"
					: "none";
		});

		this.searchDoctor.addEventListener(
			"input",
			this.debounce(() => {
				this.renderDoctors(this.searchDoctor.value);
			}, 300)
		);

		this.doctorPaymentStartDate.addEventListener("change", () =>
			this.renderDoctors(this.searchDoctor.value)
		);
		this.doctorPaymentEndDate.addEventListener("change", () =>
			this.renderDoctors(this.searchDoctor.value)
		);
		document
			.getElementById("doctorClearDateFilter")
			?.addEventListener("click", () => {
				this.doctorPaymentStartDate.value = "";
				this.doctorPaymentEndDate.value = "";
				this.renderDoctors(this.searchDoctor.value);
			});
	}

	private async loadUser(): Promise<void> {
		try {
			const userString = localStorage.getItem("user");
			if (!userString) return;

			const user = JSON.parse(userString);
			this.userPermissions = user.permissions;
			this.userRole = user.role;
		} catch (error) {
			this.showError(i18n.t("employees.messages.loadError"));
		}
	}

	private async loadDoctors(): Promise<void> {
		try {
			const response = await fetch("/api/doctors", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (!response.ok)
				throw new Error(i18n.t("employees.messages.loadError"));
			const doctors: Doctor[] = await response.json();
			this.doctors.clear();
			doctors.forEach((doctor) =>
				this.doctors.set(doctor.employee_id, doctor)
			);
			this.renderDoctors(this.searchDoctor.value);
		} catch (error) {
			this.showError(i18n.t("employees.messages.loadError"));
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

	private async renderDoctors(filterTerm: string = ""): Promise<void> {
		const tbody = document.getElementById("doctorsTableBody")!;
		const startDate = this.doctorPaymentStartDate.value
			? new Date(this.doctorPaymentStartDate.value).getTime()
			: null;
		const endDate = this.doctorPaymentEndDate.value
			? new Date(this.doctorPaymentEndDate.value).getTime()
			: null;

		const filteredDoctors = Array.from(this.doctors.values()).filter(
			(doctor) =>
				doctor.employee_type === "doctor" &&
				doctor.name.toLowerCase().includes(filterTerm.toLowerCase())
		);

		if (filteredDoctors.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="9" class="text-center text-muted">
						${i18n.t("common.noData")}
					</td>
				</tr>
			`;
			return;
		}

		const doctorData = await Promise.all(
			filteredDoctors.map(async (doctor) => {
				const payments = this.userPermissions.includes(
					"manage_payments"
				)
					? await this.loadEmployeePayments(doctor.employee_id)
					: [];
				let filteredPayments = payments.filter((payment) => {
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
							Number(payment.paid_by_user_id)
						);
						payment.paid_by = name;
					}
				}
				return { doctor, payments: filteredPayments };
			})
		);

		tbody.innerHTML = doctorData
			.map(({ doctor, payments }) => {
				const collapseId = `doctorPayments${doctor.employee_id}`;
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
            <td>${this.escapeHtml(doctor.name)}</td>
            <td>${i18n.t(`employees.doctorTypes.${doctor.doctor_type}`)}</td>
            <td>${i18n.formatDate(new Date(doctor.hire_date))}</td>
            <td>${
				this.userPermissions.includes("manage_payments")
					? i18n.formatCurrency(Number(doctor.daily_pay) || 0)
					: "-"
			}</td>
            <td>${
				this.userPermissions.includes("manage_payments")
					? this.formatPerPatientPay(doctor)
					: "-"
			}</td>
			<td>${
				doctor.shift_type
					? i18n.t(`employees.shiftTypes.${doctor.shift_type}`)
					: "-"
			}</td>
            <td>${
				doctor.is_active
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
                ${
					this.userRole === "Admin"
						? `<button class="btn btn-sm btn-outline-primary" onclick="doctorManager.editDoctor(${
								doctor.employee_id
						  })">
                             <i class="bi bi-pencil"></i> ${i18n.t(
									"employees.buttons.edit"
								)}
                           </button>
                           <button class="btn btn-sm btn-outline-danger" onclick="doctorManager.deleteDoctor(${
								doctor.employee_id
							})">
                             <i class="bi bi-trash"></i> ${i18n.t(
									"employees.buttons.delete"
								)}
                           </button>`
						: ""
				}
                ${
					this.userPermissions.includes("manage_payments")
						? `<button class="btn btn-sm btn-outline-success" onclick="employeeManager.showPaymentModal(${
								doctor.employee_id
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
                <td colspan="9">
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
								)})</small>
							</td>
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

	private formatPerPatientPay(doctor: Doctor): string {
		if (!doctor.per_patient_pay) return "-";

		const amount = Number(doctor.per_patient_pay);
		if (doctor.per_patient_payment_type === "fixed") {
			return i18n.formatCurrency(amount);
		} else if (doctor.per_patient_payment_type === "percentage") {
			return `${i18n.formatNumber(amount, 0)}%`;
		}
		return i18n.formatCurrency(amount);
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

	private showDoctorModal(doctorId?: number): void {
		this.resetDoctorForm();
		const modalTitle = document.getElementById("doctorModalLabel")!;
		if (doctorId) {
			modalTitle.textContent = i18n.t("employees.editDoctor");
			const doctor = this.doctors.get(doctorId);
			if (doctor) this.populateDoctorForm(doctor);
		} else {
			modalTitle.textContent = i18n.t("employees.createNewDoctor");
		}
		this.doctorModal.show();
	}

	private populateDoctorForm(doctor: Doctor): void {
		(document.getElementById("doctorId") as HTMLInputElement).value =
			doctor.employee_id.toString();
		(document.getElementById("employeeId") as HTMLInputElement).value =
			doctor.employee_id.toString();
		(document.getElementById("doctorName") as HTMLInputElement).value =
			doctor.name;
		(document.getElementById("phone") as HTMLInputElement).value =
			doctor.phone || "";
		(document.getElementById("doctorType") as HTMLSelectElement).value =
			doctor.doctor_type;
		(document.getElementById("hireDateDoctor") as HTMLInputElement).value =
			doctor.hire_date;
		(document.getElementById("dailyPayDoctor") as HTMLInputElement).value =
			doctor.daily_pay?.toString() || "";
		(
			document.getElementById("perPatientPayDoctor") as HTMLInputElement
		).value = doctor.per_patient_pay?.toString() || "";
		(document.getElementById("referralBonus") as HTMLInputElement).value =
			doctor.referral_bonus?.toString() || "";
		(
			document.getElementById("paymentCalculation") as HTMLSelectElement
		).value = doctor.payment_calculation || "daily";
		(
			document.getElementById(
				"perPatientPaymentTypeDoctor"
			) as HTMLSelectElement
		).value = doctor.per_patient_payment_type || "";
		(
			document.getElementById(
				"percentageScopeDoctor"
			) as HTMLSelectElement
		).value = doctor.percentage_scope || "";
		(
			document.getElementById("shiftTypeDoctor") as HTMLSelectElement
		).value = doctor.shift_type || "";
		(
			document.getElementById("needClockInDoctor") as HTMLInputElement
		).checked = doctor.need_clock_in;
		(
			document.getElementById("shiftStartTimeDoctor") as HTMLInputElement
		).value = doctor.shift_start_time || "";
		(
			document.getElementById("shiftEndTimeDoctor") as HTMLInputElement
		).value = doctor.shift_end_time || "";
		(
			document.getElementById("isActiveDoctor") as HTMLInputElement
		).checked = doctor.is_active;
		(
			document.getElementById("isFacilityEmployee") as HTMLInputElement
		).checked = doctor.is_facility_employee;
		(
			document.getElementById(
				"perPatientPaymentTypeDoctor"
			) as HTMLSelectElement
		).dispatchEvent(new Event("change"));
	}

	private async handleSaveDoctor(): Promise<void> {
		if (this.userRole !== "Admin") {
			this.showError(i18n.t("employees.messages.onlyAdminsCanSave"));
			return;
		}

		if (!this.validateDoctorForm()) return;

		const doctorId = (
			document.getElementById("doctorId") as HTMLInputElement
		).value;
		const doctorData = {
			name: (document.getElementById("doctorName") as HTMLInputElement)
				.value,
			phone:
				(document.getElementById("phone") as HTMLInputElement).value ||
				undefined,
			employee_type: "doctor",
			hire_date: (
				document.getElementById("hireDateDoctor") as HTMLInputElement
			).value,
			daily_pay:
				parseFloat(
					(
						document.getElementById(
							"dailyPayDoctor"
						) as HTMLInputElement
					).value
				) ?? undefined,
			base_pay:
				parseFloat(
					(
						document.getElementById(
							"dailyPayDoctor"
						) as HTMLInputElement
					).value
				) ?? undefined,
			per_patient_pay:
				parseFloat(
					(
						document.getElementById(
							"perPatientPayDoctor"
						) as HTMLInputElement
					).value
				) ?? undefined,
			referral_bonus:
				parseFloat(
					(
						document.getElementById(
							"referralBonus"
						) as HTMLInputElement
					).value
				) ?? undefined,
			extra_payment_type: (
				document.getElementById(
					"paymentCalculation"
				) as HTMLSelectElement
			).value,
			payment_calculation: (
				document.getElementById(
					"paymentCalculation"
				) as HTMLSelectElement
			).value,
			per_patient_payment_type:
				(
					document.getElementById(
						"perPatientPaymentTypeDoctor"
					) as HTMLSelectElement
				).value || undefined,
			percentage_scope:
				(
					document.getElementById(
						"percentageScopeDoctor"
					) as HTMLSelectElement
				).value || undefined,
			doctor_type: (
				document.getElementById("doctorType") as HTMLSelectElement
			).value,
			shift_type: (
				document.getElementById("shiftTypeDoctor") as HTMLSelectElement
			).value,
			is_active: (
				document.getElementById("isActiveDoctor") as HTMLInputElement
			).checked,
			need_clock_in: (
				document.getElementById("needClockInDoctor") as HTMLInputElement
			).checked,
			is_facility_employee: (
				document.getElementById(
					"isFacilityEmployee"
				) as HTMLInputElement
			).checked,
			shift_start_time: (
				document.getElementById(
					"shiftStartTimeDoctor"
				) as HTMLInputElement
			).value,
			shift_end_time: (
				document.getElementById(
					"shiftEndTimeDoctor"
				) as HTMLInputElement
			).value
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

			if (!response.ok)
				throw new Error(i18n.t("employees.messages.saveError"));
			await this.loadDoctors();
			this.doctorModal.hide();
			toastr.success(
				doctorId
					? i18n.t("employees.messages.updateSuccess")
					: i18n.t("employees.messages.createSuccess")
			);
		} catch (error) {
			this.showError(i18n.t("employees.messages.saveError"));
		} finally {
			this.setDoctorLoading(false);
		}
	}

	public async deleteDoctor(doctorId: number): Promise<void> {
		if (this.userRole !== "Admin") {
			this.showError(i18n.t("employees.messages.onlyAdminsCanDelete"));
			return;
		}

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
				const response = await fetch(`/api/doctors/${doctorId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (!response.ok)
					throw new Error(i18n.t("employees.messages.deleteError"));
				await this.loadDoctors();
				toastr.success(i18n.t("employees.messages.deleteSuccess"));
			} catch (error) {
				this.showError(i18n.t("employees.messages.deleteError"));
			}
		}
	}

	public editDoctor(doctorId: number): void {
		if (this.userRole !== "Admin") {
			this.showError(i18n.t("employees.messages.onlyAdminsCanEdit"));
			return;
		}
		this.showDoctorModal(doctorId);
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
		(
			document.getElementById(
				"perPatientPaymentTypeDoctor"
			) as HTMLSelectElement
		).dispatchEvent(new Event("change"));
	}

	private setDoctorLoading(loading: boolean): void {
		const spinner = this.saveDoctorButton.querySelector(".spinner-border")!;
		const buttonText = this.saveDoctorButton.querySelector(".btn-text")!;
		this.saveDoctorButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("employees.buttons.saving")
			: i18n.t("common.save");
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
			.replace(/&/g, "&")
			.replace(/</g, "<")
			.replace(/>/g, ">")
			.replace(/"/g, '"')
			.replace(/'/g, "'")
			.replace(/_/g, " ");
	}

	private debounce(func: Function, wait: number): (...args: any[]) => void {
		let timeout: NodeJS.Timeout;
		return (...args: any[]) => {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), wait);
		};
	}

	public refreshDoctors(): void {
		this.renderDoctors(this.searchDoctor.value);
	}
}

declare global {
	interface Window {
		doctorManager: DoctorManager;
	}
}

window.doctorManager = new DoctorManager();
