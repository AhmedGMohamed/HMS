//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";

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

		this.initializeEventListeners();
		this.loadUser();
		this.loadDoctors();
	}

	private initializeEventListeners(): void {
		document
			.getElementById("createEmployeeBtnDoctorsTab")
			?.addEventListener("click", () => {
				if (this.userRole !== "Admin") {
					this.showError("Only admins can create doctors");
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
				"percentageScopeContainer"
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
			this.showError("Failed to load user permissions");
		}
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
				this.doctors.set(doctor.employee_id, doctor)
			);
			this.renderDoctors(this.searchDoctor.value);
		} catch (error) {
			this.showError("Failed to load doctors");
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
			this.showError(`Failed to load payments for doctor`);
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
						? `<button class="btn btn-link" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                                 <i class="bi bi-chevron-down"></i>
                               </button>`
						: ""
				}
            </td>
            <td>${this.escapeHtml(doctor.name)}</td>
            <td>${this.escapeHtml(doctor.doctor_type)}</td>
            <td>${new Date(doctor.hire_date).toLocaleDateString("en-GB")}</td>
            <td>$${
				this.userPermissions.includes("manage_payments")
					? Number(doctor.daily_pay) || "-"
					: "-"
			}</td>
            <td>${doctor.per_patient_payment_type == "fixed" ? "$" : ""}${
					this.userPermissions.includes("manage_payments")
						? Number(doctor.per_patient_pay) || "-"
						: "-"
				}${doctor.per_patient_payment_type != "fixed" ? "%" : ""}</td>
			<td>${this.escapeHtml(doctor.shift_type || "-")}</td>
            <td>${
				doctor.is_active
					? `<span class='feature-indicator enabled'>
						<i class='bi bi-check-circle-fill text-success'></i>
						Yes
					</span>`
					: `<span class="feature-indicator disabled">
                        <i class="bi bi-x-circle-fill text-danger"></i>
                        No
                    </span>}</td>`
			}<td>
              <div class="action-buttons">
                ${
					this.userRole === "Admin"
						? `<button class="btn btn-sm btn-outline-primary" onclick="doctorManager.editDoctor(${doctor.employee_id})">
                                 <i class="bi bi-pencil"></i> Edit
                               </button>
                               <button class="btn btn-sm btn-outline-danger" onclick="doctorManager.deleteDoctor(${doctor.employee_id})">
                                 <i class="bi bi-trash"></i> Delete
                               </button>`
						: ""
				}
                ${
					this.userPermissions.includes("manage_payments")
						? `<button class="btn btn-sm btn-outline-success" onclick="employeeManager.showPaymentModal(${doctor.employee_id})">
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
                <td colspan="9">
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
                            <td>$${Number(payment.payment_amount)}</td>
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
									? this.escapeHtml(payment.paid_by)
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
			this.showError("Only admins can save doctors");
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
				) || undefined,
			per_patient_pay:
				parseFloat(
					(
						document.getElementById(
							"perPatientPayDoctor"
						) as HTMLInputElement
					).value
				) || undefined,
			referral_bonus:
				parseFloat(
					(
						document.getElementById(
							"referralBonus"
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
		if (this.userRole !== "Admin") {
			this.showError("Only admins can delete doctors");
			return;
		}

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
		if (this.userRole !== "Admin") {
			this.showError("Only admins can edit doctors");
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
