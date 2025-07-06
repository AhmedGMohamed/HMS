//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

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
	private clockIns: Map<number, ClockIn> = new Map();
	private employees: Map<number, Employee> = new Map();

	constructor() {
		new SidebarManager();
		toastr.options = { positionClass: "toast-top-right", timeOut: 3000 };

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
			"searchClockIn"
		) as HTMLInputElement;

		this.initializeEventListeners();
		this.loadEmployees();
		this.loadClockIns();
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
				this.renderClockIns();
			}, 300)
		);

		document
			.getElementById("clockInModal")!
			.addEventListener("hidden.bs.modal", () => {
				this.resetClockInForm();
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
				.filter((e) => e.need_clock_in)
				.forEach((employee) =>
					this.employees.set(employee.employee_id, employee)
				);
			this.populateEmployeeSelect();
		} catch (error) {
			this.showError("Failed to load employees");
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
			this.renderClockIns();
		} catch (error) {
			this.showError("Failed to load clock-ins");
		}
	}

	private populateEmployeeSelect(): void {
		const select = document.getElementById(
			"employeeId"
		) as HTMLSelectElement;
		select.innerHTML =
			'<option value="">Select Employee</option>' +
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

	private renderClockIns(filterTerm: string = ""): void {
		const tbody = document.getElementById("clockInTableBody")!;
		const filteredClockIns = Array.from(this.clockIns.values()).filter(
			(clockIn) => {
				const employee = this.employees.get(clockIn.employee_id);
				return employee?.name
					.toLowerCase()
					.includes(filterTerm.toLowerCase());
			}
		);

		tbody.innerHTML = filteredClockIns
			.map((clockIn) => {
				const employee = this.employees.get(clockIn.employee_id);
				return `
        <tr>
          <td>${this.escapeHtml(employee?.name || "Unknown")}</td>
          <td>${new Date(clockIn.clock_in).toLocaleString()}</td>
          <td>${
				clockIn.clock_out
					? new Date(clockIn.clock_out).toLocaleString()
					: "-"
			}</td>
          <td>$${clockIn.pay_deduction}</td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-primary" onclick="clockInManager.editClockIn(${
					clockIn.clock_id
				})">
                <i class="bi bi-pencil"></i> Edit
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="clockInManager.deleteClockIn(${
					clockIn.clock_id
				})">
                <i class="bi bi-trash"></i> Delete
              </button>
            </div>
          </td>
        </tr>
      `;
			})
			.join("");
	}

	private showClockInModal(clockId?: number): void {
		this.resetClockInForm();
		const modalTitle = document.getElementById("clockInModalLabel")!;
		if (clockId) {
			modalTitle.textContent = "Edit Clock-In";
			const clockIn = this.clockIns.get(clockId);
			if (clockIn) this.populateClockInForm(clockIn);
		} else {
			modalTitle.textContent = "New Clock-In";
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
			clockIn.clock_out
				? this.localISOTime(clockIn.clock_out)
				: "";
	}

	private localISOTime(date: string): string {
		return new Date(new Date(date).getTime() - new Date(date).getTimezoneOffset() * 60000)
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
					.value || undefined
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
			toastr.success(
				`Clock-in successfully ${clockId ? "updated" : "created"}`
			);
		} catch (error) {
			this.showError("Failed to save clock-in");
		} finally {
			this.setClockInLoading(false);
		}
	}

	public async deleteClockIn(clockId: number): Promise<void> {
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
				const response = await fetch(
					`/api/clock-ins/${clockId}`,
					{
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);
				if (!response.ok) throw new Error("Failed to delete clock-in");
				await this.loadClockIns();
				toastr.success("Clock-in deleted successfully");
			} catch (error) {
				this.showError("Failed to delete clock-in");
			}
		}
	}

	public editClockIn(clockId: number): void {
		this.showClockInModal(clockId);
	}

	private validateClockInForm(): boolean {
		this.clockInForm.classList.add("was-validated");
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
		clockInManager: ClockInManager;
	}
}

window.clockInManager = new ClockInManager();
