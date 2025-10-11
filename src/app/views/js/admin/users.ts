//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

interface User {
	user_id: number;
	username: string;
	role_id: number;
	role_name: string;
	created_at: string;
}

interface Role {
	role_id: number;
	name: string;
}

class UserManager {
	//@ts-ignore
	private userModal: Modal;
	private userForm: HTMLFormElement;
	private saveButton: HTMLButtonElement;
	private togglePasswordBtn: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private roleFilter: HTMLSelectElement;
	private users: User[] = [];
	private roles: Role[] = [];

	constructor() {
		//@ts-ignore
		this.userModal = new bootstrap.Modal(
			document.getElementById("userModal")!
		);
		this.userForm = document.getElementById("userForm") as HTMLFormElement;
		this.saveButton = document.getElementById(
			"saveUserBtn"
		) as HTMLButtonElement;
		this.togglePasswordBtn = document.getElementById(
			"togglePassword"
		) as HTMLButtonElement;
		this.searchInput = document.getElementById(
			"searchUser"
		) as HTMLInputElement;
		this.roleFilter = document.getElementById(
			"roleFilter"
		) as HTMLSelectElement;

		this.waitForI18n().then(() => {
			new SidebarManager();

			this.initializeEventListeners();
			this.loadInitialData();
		});
	}

	private async waitForI18n(): Promise<void> {
		if (i18n) {
			await i18n.init();
		}
	}

	private handleLocaleChange(): void {
		// Update page title
		document.title = i18n.t("users.pageTitle");

		// Reload roles to update dropdowns with new translations
		this.loadRoles();

		// Re-render users table with new date formatting
		this.filterUsers();
	}

	private initializeEventListeners(): void {
		// Create user button
		document
			.getElementById("createUserBtn")
			?.addEventListener("click", () => {
				this.showUserModal();
			});

		// Save user button
		this.saveButton.addEventListener("click", () => {
			this.handleSaveUser();
		});

		// Toggle password visibility
		this.togglePasswordBtn.addEventListener("click", () => {
			this.togglePasswordVisibility();
		});

		// Search and filters
		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.filterUsers();
			}, 300)
		);

		this.roleFilter.addEventListener("change", () => {
			this.filterUsers();
		});

		// Modal events
		const modalElement = document.getElementById("userModal")!;
		modalElement.addEventListener("hidden.bs.modal", () => {
			this.resetForm();
		});

		// Listen for locale changes
		window.addEventListener("localeChanged", () => {
			this.handleLocaleChange();
		});
	}

	private async loadInitialData(): Promise<void> {
		try {
			// Update page title
			document.title = i18n.t("users.pageTitle");
			await Promise.all([this.loadRoles(), this.loadUsers()]);
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError(i18n.t("users.messages.loadError"));
		}
	}

	private async loadRoles(): Promise<void> {
		try {
			const response = await fetch("/api/roles", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch roles");

			this.roles = await response.json();

			// Populate role filter with translation
			this.roleFilter.innerHTML =
				`<option value="">${i18n.t(
					"users.filters.allRoles"
				)}</option>` +
				this.roles
					.map(
						(role) =>
							`<option value="${role.role_id}">${role.name}</option>`
					)
					.join("");

			// Populate modal role select with translation
			const roleSelect = document.getElementById(
				"roleSelect"
			) as HTMLSelectElement;
			roleSelect.innerHTML =
				`<option value="">${i18n.t("users.selectRole")}</option>` +
				this.roles
					.map(
						(role) =>
							`<option value="${role.role_id}">${role.name}</option>`
					)
					.join("");
		} catch (error) {
			console.error("Error loading roles:", error);
			this.showError(i18n.t("users.messages.loadError"));
		}
	}

	private async loadUsers(): Promise<void> {
		try {
			const response = await fetch("/api/users", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch users");

			this.users = await response.json();
			this.filterUsers();
		} catch (error) {
			console.error("Error loading users:", error);
			this.showError(i18n.t("users.messages.loadError"));
		}
	}

	private filterUsers(): void {
		const searchTerm = this.searchInput.value.toLowerCase();
		const roleId = this.roleFilter.value;

		let filteredUsers = [...this.users];

		if (searchTerm) {
			filteredUsers = filteredUsers.filter((user) =>
				user.username.toLowerCase().includes(searchTerm)
			);
		}

		if (roleId) {
			filteredUsers = filteredUsers.filter(
				(user) => user.role_id === parseInt(roleId)
			);
		}

		this.renderUsers(filteredUsers);
	}

	private renderUsers(users: User[]): void {
		const tbody = document.getElementById("usersTableBody")!;

		if (users.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="4" class="text-center text-muted">
						${i18n.t("common.noData")}
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = users
			.map(
				(user) => `
				<tr>
					<td>${this.escapeHtml(user.username)}</td>
					<td>${this.escapeHtml(user.role_name)}</td>
					<td>${i18n.formatDate(new Date(user.created_at))}</td>
					<td>
						<div class="action-buttons">
							<button class="btn btn-sm btn-outline-primary" 
									onclick="userManager.editUser(${user.user_id})">
								<i class="bi bi-pencil"></i> ${i18n.t("users.buttons.edit")}
							</button>
							<button class="btn btn-sm btn-outline-danger" 
									onclick="userManager.deleteUser(${user.user_id})">
								<i class="bi bi-trash"></i> ${i18n.t("users.buttons.delete")}
							</button>
						</div>
					</td>
				</tr>
			`
			)
			.join("");
	}

	private showUserModal(userId?: number): void {
		this.resetForm();
		const modalTitle = document.getElementById("userModalLabel")!;
		const passwordField = document.getElementById(
			"password"
		) as HTMLInputElement;

		if (userId) {
			const user = this.users.find((u) => u.user_id === userId);
			if (!user) return;

			modalTitle.textContent = i18n.t("users.editUser");
			(document.getElementById("userId") as HTMLInputElement).value =
				userId.toString();
			(document.getElementById("username") as HTMLInputElement).value =
				user.username;
			(document.getElementById("roleSelect") as HTMLSelectElement).value =
				user.role_id.toString();
			passwordField.required = false;
		} else {
			modalTitle.textContent = i18n.t("users.createNewUser");
			passwordField.required = true;
		}

		this.userModal.show();
	}

	private async handleSaveUser(): Promise<void> {
		if (!this.validateForm()) return;

		const userId = (document.getElementById("userId") as HTMLInputElement)
			.value;
		const username = (
			document.getElementById("username") as HTMLInputElement
		).value;
		const password = (
			document.getElementById("password") as HTMLInputElement
		).value;
		const roleId = parseInt(
			(document.getElementById("roleSelect") as HTMLSelectElement).value
		);

		const userData = {
			...(userId ? { user_id: parseInt(userId) } : {}),
			username,
			...(password ? { password } : {}),
			role_id: roleId
		};

		try {
			this.setLoading(true);

			const response = await fetch(
				`/api/users${userId ? `/${userId}` : ""}`,
				{
					method: userId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(userData)
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(
					error.error || i18n.t("users.messages.saveError")
				);
			}

			await this.loadUsers();
			this.userModal.hide();

			Swal.fire({
				icon: "success",
				title: i18n.t("common.success"),
				text: userId
					? i18n.t("users.messages.updateSuccess")
					: i18n.t("users.messages.createSuccess"),
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000,
				timerProgressBar: true
			});
		} catch (error) {
			console.error("Error saving user:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("users.messages.saveError")
			);
		} finally {
			this.setLoading(false);
		}
	}

	public async deleteUser(userId: number): Promise<void> {
		try {
			const result = await Swal.fire({
				title: i18n.t("users.messages.deleteConfirmTitle"),
				text: i18n.t("users.messages.deleteConfirmText"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("common.yes"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const response = await fetch(`/api/users/${userId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});

				if (!response.ok) {
					throw new Error(i18n.t("users.messages.deleteError"));
				}

				await this.loadUsers();

				Swal.fire({
					icon: "success",
					title: i18n.t("common.success"),
					text: i18n.t("users.messages.deleteSuccess"),
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000,
					timerProgressBar: true
				});
			}
		} catch (error) {
			console.error("Error deleting user:", error);
			this.showError(i18n.t("users.messages.deleteError"));
		}
	}

	public editUser(userId: number): void {
		this.showUserModal(userId);
	}

	private validateForm(): boolean {
		this.userForm.classList.add("was-validated");
		return this.userForm.checkValidity();
	}

	private resetForm(): void {
		this.userForm.reset();
		this.userForm.classList.remove("was-validated");
		(document.getElementById("userId") as HTMLInputElement).value = "";
	}

	private togglePasswordVisibility(): void {
		const passwordInput = document.getElementById(
			"password"
		) as HTMLInputElement;
		const icon = this.togglePasswordBtn.querySelector("i")!;

		if (passwordInput.type === "password") {
			passwordInput.type = "text";
			icon.className = "bi bi-eye-slash-fill";
		} else {
			passwordInput.type = "password";
			icon.className = "bi bi-eye-fill";
		}
	}

	private setLoading(loading: boolean): void {
		const spinner = this.saveButton.querySelector(".spinner-border")!;
		const buttonText = this.saveButton.querySelector(".btn-text")!;
		this.saveButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("users.buttons.saving")
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

// Initialize and expose for HTML onclick handlers
declare global {
	interface Window {
		userManager: UserManager;
	}
}

window.userManager = new UserManager();
