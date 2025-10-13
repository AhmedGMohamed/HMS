//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

interface ClockIn {
	clock_id: number;
	employee_id: number;
	clock_in: string;
	clock_out?: string;
	pay_deduction: number;
}

interface Employee {
	employee_id: number;
	name: string;
	employee_type: string;
	need_clock_in: boolean;
}

class ClockInManager {
	private clockInModal: any;
	private clockInForm: HTMLFormElement;
	private saveClockInButton: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private filterFromDate: HTMLInputElement;
	private filterToDate: HTMLInputElement;
	private clockIns: Map<number, ClockIn> = new Map();
	private employees: Map<number, Employee> = new Map();
	private durationIntervals: Map<number, NodeJS.Timeout> = new Map();

	constructor() {
		// Wait for i18n to initialize

		//@ts-ignore
		toastr.options = {
			positionClass: "toast-top-right",
			timeOut: 3000
		};

		//@ts-ignore
		this.clockInModal = new bootstrap.Modal(
			document.getElementById("clockInModal")!
		);
		this.clockInForm = document.getElementById(
			"clockInForm"
		) as HTMLFormElement;
		this.saveClockInButton = document.getElementById(
			"saveClockInBtn"
		) as HTMLButtonElement;
		this.searchInput = document.getElementById(
			"searchEmployee"
		) as HTMLInputElement;
		this.filterFromDate = document.getElementById(
			"filterFromDate"
		) as HTMLInputElement;
		this.filterToDate = document.getElementById(
			"filterToDate"
		) as HTMLInputElement;

		this.waitForI18n().then(() => {
			new SidebarManager();
			this.initializeEventListeners();
			this.loadEmployees();
			this.loadClockIns();

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
		// Re-render tables with new locale
		this.renderActiveClockIns();
		this.renderHistoryClockIns();
	}

	private initializeEventListeners(): void {
		document
			.getElementById("createClockInBtn")
			?.addEventListener("click", () => {
				this.showClockInModal();
			});

		this.saveClockInButton.addEventListener("click", () => {
			this.handleSaveClockIn();
		});

		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.renderHistoryClockIns();
			}, 300)
		);

		this.filterFromDate.addEventListener("change", () => {
			this.renderHistoryClockIns();
		});

		this.filterToDate.addEventListener("change", () => {
			this.renderHistoryClockIns();
		});

		document
			.getElementById("clearFiltersBtn")
			?.addEventListener("click", () => {
				this.clearFilters();
			});

		document
			.getElementById("clockInModal")!
			.addEventListener("hidden.bs.modal", () => {
				this.resetClockInForm();
			});
	}

	private clearFilters(): void {
		this.searchInput.value = "";
		this.filterFromDate.value = "";
		this.filterToDate.value = "";
		this.renderHistoryClockIns();
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
				.filter((e) => e.need_clock_in)
				.forEach((employee) =>
					this.employees.set(employee.employee_id, employee)
				);
			this.populateEmployeeSelect();
		} catch (error) {
			this.showError(i18n.t("clocking.messages.loadEmployeesError"));
		}
	}

	private async loadClockIns(): Promise<void> {
		try {
			const response = await fetch("/api/clock-ins", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});
			if (!response.ok) throw new Error("Failed to fetch clock-ins");
			const clockIns: ClockIn[] = await response.json();
			this.clockIns.clear();
			clockIns.forEach((clockIn) =>
				this.clockIns.set(clockIn.clock_id, clockIn)
			);
			this.renderActiveClockIns();
			this.renderHistoryClockIns();
		} catch (error) {
			this.showError(i18n.t("clocking.messages.loadClockInsError"));
		}
	}

	private populateEmployeeSelect(): void {
		const select = document.getElementById(
			"employeeId"
		) as HTMLSelectElement;
		select.innerHTML =
			`<option value="">${i18n.t(
				"clocking.placeholders.selectEmployee"
			)}</option>` +
			Array.from(this.employees.values())
				.map(
					(employee) => `
        <option value="${employee.employee_id}">${this.escapeHtml(
						employee.name
					)} (${employee.employee_type})</option>
      `
				)
				.join("");
	}

	private renderActiveClockIns(): void {
		const tbody = document.getElementById("activeClockInTableBody")!;
		const activeClockIns = Array.from(this.clockIns.values()).filter(
			(clockIn) => !clockIn.clock_out
		);

		// Update active count badge
		const activeCountBadge = document.getElementById("activeCount")!;
		activeCountBadge.textContent = activeClockIns.length.toString();

		// Clear existing intervals
		this.durationIntervals.forEach((interval) => clearInterval(interval));
		this.durationIntervals.clear();

		if (activeClockIns.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="4" class="text-center py-4 text-muted">
						${i18n.t("clocking.messages.noActiveClockIns")}
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = activeClockIns
			.map((clockIn) => {
				const employee = this.employees.get(clockIn.employee_id);
				const durationId = `duration-${clockIn.clock_id}`;

				// Start interval for this clock-in
				const interval = setInterval(() => {
					const durationElement = document.getElementById(durationId);
					if (durationElement) {
						durationElement.textContent = this.calculateDuration(
							clockIn.clock_in
						);
					}
				}, 1000);
				this.durationIntervals.set(clockIn.clock_id, interval);

				return `
        <tr>
          <td>${this.escapeHtml(
				employee?.name || i18n.t("common.unknown")
			)}</td>
          <td>${i18n.formatDateTime(clockIn.clock_in)}</td>
          <td><span id="${durationId}" class="duration-live">${this.calculateDuration(
					clockIn.clock_in
				)}</span></td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-success" onclick="clockInManager.quickClockOut(${
					clockIn.clock_id
				})" title="${i18n.t("clocking.buttons.clockOut")}">
                <i class="bi bi-clock"></i> ${i18n.t(
					"clocking.buttons.clockOut"
				)}
              </button>
              <button class="btn btn-sm btn-outline-primary" onclick="clockInManager.editClockIn(${
					clockIn.clock_id
				})" title="${i18n.t("common.edit")}">
                <i class="bi bi-pencil"></i> ${i18n.t("common.edit")}
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="clockInManager.deleteClockIn(${
					clockIn.clock_id
				})" title="${i18n.t("common.delete")}">
                <i class="bi bi-trash"></i> ${i18n.t("common.delete")}
              </button>
            </div>
          </td>
        </tr>
      `;
			})
			.join("");
	}

	private renderHistoryClockIns(): void {
		const tbody = document.getElementById("historyClockInTableBody")!;
		const searchTerm = this.searchInput.value.toLowerCase().trim();
		const fromDate = this.filterFromDate.value
			? new Date(this.filterFromDate.value)
			: null;
		const toDate = this.filterToDate.value
			? new Date(this.filterToDate.value + "T23:59:59")
			: null;

		let filteredClockIns = Array.from(this.clockIns.values()).filter(
			(clockIn) => clockIn.clock_out // Only show completed clock-ins
		);

		// Apply filters
		if (searchTerm) {
			filteredClockIns = filteredClockIns.filter((clockIn) => {
				const employee = this.employees.get(clockIn.employee_id);
				return employee?.name.toLowerCase().includes(searchTerm);
			});
		}

		if (fromDate) {
			filteredClockIns = filteredClockIns.filter((clockIn) => {
				const clockInDate = new Date(clockIn.clock_in);
				return clockInDate >= fromDate;
			});
		}

		if (toDate) {
			filteredClockIns = filteredClockIns.filter((clockIn) => {
				const clockInDate = new Date(clockIn.clock_in);
				return clockInDate <= toDate;
			});
		}

		// Sort by clock-in time (most recent first)
		filteredClockIns.sort(
			(a, b) =>
				new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime()
		);

		if (filteredClockIns.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="6" class="text-center py-4 text-muted">
						${i18n.t("clocking.messages.noHistoryFound")}
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = filteredClockIns
			.map((clockIn) => {
				const employee = this.employees.get(clockIn.employee_id);
				const duration = clockIn.clock_out
					? this.calculateDuration(
							clockIn.clock_in,
							clockIn.clock_out
					  )
					: "-";

				return `
        <tr>
          <td>${this.escapeHtml(
				employee?.name || i18n.t("common.unknown")
			)}</td>
          <td>${i18n.formatDateTime(clockIn.clock_in)}</td>
          <td>${i18n.formatDateTime(clockIn.clock_out!)}</td>
          <td>${duration}</td>
          <td>${i18n.formatCurrency(clockIn.pay_deduction)}</td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-primary" onclick="clockInManager.editClockIn(${
					clockIn.clock_id
				})" title="${i18n.t("common.edit")}">
                <i class="bi bi-pencil"></i> ${i18n.t("common.edit")}
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="clockInManager.deleteClockIn(${
					clockIn.clock_id
				})" title="${i18n.t("common.delete")}">
                <i class="bi bi-trash"></i> ${i18n.t("common.delete")}
              </button>
            </div>
          </td>
        </tr>
      `;
			})
			.join("");
	}

	private calculateDuration(startTime: string, endTime?: string): string {
		const start = new Date(startTime);
		const end = endTime ? new Date(endTime) : new Date();
		const diffMs = end.getTime() - start.getTime();

		const hours = Math.floor(diffMs / (1000 * 60 * 60));
		const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

		if (hours > 0) {
			return i18n.t("clocking.duration.hoursMinutes", { hours, minutes });
		} else {
			return i18n.t("clocking.duration.minutes", { minutes });
		}
	}

	private showClockInModal(clockId?: number): void {
		this.resetClockInForm();
		const modalTitle = document.getElementById("clockInModalLabel")!;

		if (clockId) {
			modalTitle.textContent = i18n.t("clocking.modals.editClockIn");
			const clockIn = this.clockIns.get(clockId);
			if (clockIn) this.populateClockInForm(clockIn);
		} else {
			modalTitle.textContent = i18n.t("clocking.modals.newClockIn");
			// Set default clock-in time to current time
			const now = new Date();
			const localTime = new Date(
				now.getTime() - now.getTimezoneOffset() * 60000
			)
				.toISOString()
				.slice(0, 16);
			(document.getElementById("clockInTime") as HTMLInputElement).value =
				localTime;
		}
		this.clockInModal.show();
	}

	private populateClockInForm(clockIn: ClockIn): void {
		(document.getElementById("clockId") as HTMLInputElement).value =
			clockIn.clock_id.toString();
		(document.getElementById("employeeId") as HTMLSelectElement).value =
			clockIn.employee_id.toString();
		(document.getElementById("clockInTime") as HTMLInputElement).value =
			this.localISOTime(clockIn.clock_in);
		(document.getElementById("clockOutTime") as HTMLInputElement).value =
			clockIn.clock_out ? this.localISOTime(clockIn.clock_out) : "";
		(document.getElementById("payDeduction") as HTMLInputElement).value =
			clockIn.pay_deduction.toString();
	}

	private localISOTime(date: string): string {
		return new Date(
			new Date(date).getTime() -
				new Date(date).getTimezoneOffset() * 60000
		)
			.toISOString()
			.slice(0, 16);
	}

	private async handleSaveClockIn(): Promise<void> {
		if (!this.validateClockInForm()) return;

		const clockId = (document.getElementById("clockId") as HTMLInputElement)
			.value;
		const clockInData = {
			employee_id: parseInt(
				(document.getElementById("employeeId") as HTMLSelectElement)
					.value
			),
			clock_in: (
				document.getElementById("clockInTime") as HTMLInputElement
			).value,
			clock_out:
				(document.getElementById("clockOutTime") as HTMLInputElement)
					.value || undefined,
			pay_deduction:
				parseFloat(
					(
						document.getElementById(
							"payDeduction"
						) as HTMLInputElement
					).value
				) || 0
		};

		try {
			this.setClockInLoading(true);
			const response = await fetch(
				`/api/clock-ins${clockId ? `/${clockId}` : ""}`,
				{
					method: clockId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(clockInData)
				}
			);

			if (!response.ok) throw new Error("Failed to save clock-in");
			await this.loadClockIns();
			this.clockInModal.hide();

			//@ts-ignore
			toastr.success(
				clockId
					? i18n.t("clocking.messages.updateSuccess")
					: i18n.t("clocking.messages.createSuccess")
			);
		} catch (error) {
			this.showError(i18n.t("clocking.messages.saveError"));
		} finally {
			this.setClockInLoading(false);
		}
	}

	public async quickClockOut(clockId: number): Promise<void> {
		try {
			const clockIn = this.clockIns.get(clockId);
			if (!clockIn) return;

			const result = await Swal.fire({
				title: i18n.t("clocking.messages.clockOutConfirmTitle"),
				text: i18n.t("clocking.messages.clockOutConfirmText"),
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#28a745",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("clocking.buttons.confirmClockOut"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const now = new Date();
				const localTime = new Date(
					now.getTime() - now.getTimezoneOffset() * 60000
				)
					.toISOString()
					.slice(0, 16);

				const response = await fetch(`/api/clock-ins/${clockId}`, {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify({
						employee_id: clockIn.employee_id,
						clock_in: clockIn.clock_in,
						clock_out: localTime,
						pay_deduction: clockIn.pay_deduction
					})
				});

				if (!response.ok) throw new Error("Failed to clock out");
				await this.loadClockIns();

				//@ts-ignore
				toastr.success(i18n.t("clocking.messages.clockOutSuccess"));
			}
		} catch (error) {
			this.showError(i18n.t("clocking.messages.clockOutError"));
		}
	}

	public async deleteClockIn(clockId: number): Promise<void> {
		const result = await Swal.fire({
			title: i18n.t("clocking.messages.deleteConfirmTitle"),
			text: i18n.t("clocking.messages.deleteConfirmText"),
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#dc3545",
			cancelButtonColor: "#6c757d",
			confirmButtonText: i18n.t("common.yes"),
			cancelButtonText: i18n.t("common.cancel")
		});

		if (result.isConfirmed) {
			try {
				const response = await fetch(`/api/clock-ins/${clockId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (!response.ok) throw new Error("Failed to delete clock-in");
				await this.loadClockIns();

				//@ts-ignore
				toastr.success(i18n.t("clocking.messages.deleteSuccess"));
			} catch (error) {
				this.showError(i18n.t("clocking.messages.deleteError"));
			}
		}
	}

	public editClockIn(clockId: number): void {
		this.showClockInModal(clockId);
	}

	private validateClockInForm(): boolean {
		this.clockInForm.classList.add("was-validated");

		// Additional validation: clock-out must be after clock-in
		const clockInTime = (
			document.getElementById("clockInTime") as HTMLInputElement
		).value;
		const clockOutTime = (
			document.getElementById("clockOutTime") as HTMLInputElement
		).value;

		if (clockInTime && clockOutTime) {
			const clockIn = new Date(clockInTime);
			const clockOut = new Date(clockOutTime);

			if (clockOut <= clockIn) {
				this.showError(
					i18n.t("clocking.validation.clockOutAfterClockIn")
				);
				return false;
			}
		}

		return this.clockInForm.checkValidity();
	}

	private resetClockInForm(): void {
		this.clockInForm.reset();
		this.clockInForm.classList.remove("was-validated");
		(document.getElementById("clockId") as HTMLInputElement).value = "";
	}

	private setClockInLoading(loading: boolean): void {
		const spinner =
			this.saveClockInButton.querySelector(".spinner-border")!;
		const buttonText = this.saveClockInButton.querySelector(".btn-text")!;
		this.saveClockInButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("clocking.buttons.saving")
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
		clockInManager: ClockInManager;
	}
}

window.clockInManager = new ClockInManager();
