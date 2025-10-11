//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

interface Permission {
	permission_id: number;
	feature_name: string;
	description: string | null;
}

interface Role {
	role_id: number;
	name: string;
	permissions: Permission[];
}

class RoleManager {
	//@ts-ignore
	private roleModal: Modal;
	private roleForm: HTMLFormElement;
	private saveButton: HTMLButtonElement;
	private roles: Role[] = [];
	private permissions: Permission[] = [];

	constructor() {
		// Initialize modal
		const modalElement = document.getElementById("roleModal")!;
		//@ts-ignore
		this.roleModal = new bootstrap.Modal(modalElement);

		// Initialize form elements
		this.roleForm = document.getElementById("roleForm") as HTMLFormElement;
		this.saveButton = document.getElementById(
			"saveRoleBtn"
		) as HTMLButtonElement;

		this.waitForI18n().then(() => {
			new SidebarManager();

			this.initializeEventListeners();
			this.loadInitialData();

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
		document.title = i18n.t("roles.pageTitle");

		// Re-render roles with translated labels
		this.renderRoles();

		// Re-render permissions grid with translated labels
		this.renderPermissionsGrid();
	}

	private initializeEventListeners(): void {
		// Create role button
		document
			.getElementById("createRoleBtn")
			?.addEventListener("click", () => {
				this.showRoleModal();
			});

		// Save role button
		this.saveButton.addEventListener("click", () => {
			this.handleSaveRole();
		});

		// Select/Deselect all permissions
		document
			.getElementById("selectAllPermissions")
			?.addEventListener("click", () => {
				this.toggleAllPermissions(true);
			});

		document
			.getElementById("deselectAllPermissions")
			?.addEventListener("click", () => {
				this.toggleAllPermissions(false);
			});

		// Modal events
		const modalElement = document.getElementById("roleModal")!;
		modalElement.addEventListener("hidden.bs.modal", () => {
			this.resetForm();
		});
	}
	private async loadInitialData(): Promise<void> {
		try {
			document.title = i18n.t("roles.pageTitle");
			await Promise.all([this.loadPermissions(), this.loadRoles()]);
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError(i18n.t("roles.messages.loadError"));
		}
	}

	private async loadPermissions(): Promise<void> {
		try {
			const response = await fetch("/api/permissions", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch permissions");

			this.permissions = await response.json();
			this.renderPermissionsGrid();
		} catch (error) {
			console.error("Error loading permissions:", error);
			this.showError(i18n.t("roles.messages.loadError"));
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
			this.renderRoles();
		} catch (error) {
			console.error("Error loading roles:", error);
			this.showError(i18n.t("roles.messages.loadError"));
		}
	}

	private renderRoles(): void {
		const container = document.getElementById("rolesContainer")!;

		if (this.roles.length === 0) {
			container.innerHTML = `
				<div class="col-12">
					<div class="alert alert-info text-center">
						<i class="bi bi-info-circle"></i>
						${i18n.t("common.noData")}
					</div>
				</div>
			`;
			return;
		}

		container.innerHTML = this.roles
			.map(
				(role) => `
				<div class="col-md-6 col-lg-4 mb-4">
					<div class="card role-card">
						<div class="card-header d-flex justify-content-between align-items-center">
							<h5 class="card-title">${this.escapeHtml(role.name)}</h5>
							<div class="btn-group">
								<button class="btn btn-sm btn-outline-primary" 
										onclick="roleManager.editRole(${role.role_id})"
										title="${i18n.t("roles.buttons.edit")}">
									<i class="bi bi-pencil"></i>
								</button>
								${
									role.name !== "Admin"
										? `
									<button class="btn btn-sm btn-outline-danger" 
											onclick="roleManager.deleteRole(${role.role_id})"
											title="${i18n.t("roles.buttons.delete")}">
										<i class="bi bi-trash"></i>
									</button>
								`
										: ""
								}
							</div>
						</div>
						<div class="card-body">
							<h6 class="card-subtitle mb-3 text-muted">${i18n.t(
								"roles.permissionsLabel"
							)}</h6>
							<div class="permissions-list">
								${
									role.permissions.length > 0
										? role.permissions
												.map(
													(permission) => `
										<span class="permission-badge">
											${this.escapeHtml(this.translatePermission(permission.feature_name))}
										</span>
									`
												)
												.join("")
										: `<span class="text-muted">${i18n.t(
												"roles.noPermissions"
										  )}</span>`
								}
							</div>
						</div>
					</div>
				</div>
			`
			)
			.join("");
	}

	private translatePermission(featureName: string): string {
		// Try to get translation for permission
		const key = `roles.permissions.${featureName}`;
		const translation = i18n.t(key);

		// If no translation found, return the feature name
		return translation === key ? featureName : translation;
	}

	private renderPermissionsGrid(): void {
		const container = document.getElementById("permissionsGrid")!;
		container.innerHTML = this.permissions
			.map(
				(permission) => `
				<div class="col-md-6">
					<div class="permission-check">
						<div class="form-check">
							<input class="form-check-input" 
								   type="checkbox" 
								   value="${permission.permission_id}" 
								   id="permission_${permission.permission_id}">
							<label class="form-check-label" for="permission_${permission.permission_id}">
								${this.escapeHtml(this.translatePermission(permission.feature_name))}
								${
									permission.description
										? `
									<i class="bi bi-info-circle text-muted" 
									   data-bs-toggle="tooltip" 
									   title="${this.escapeHtml(permission.description)}"></i>
								`
										: ""
								}
							</label>
						</div>
					</div>
				</div>
			`
			)
			.join("");

		// Initialize tooltips
		const tooltips = document.querySelectorAll(
			'[data-bs-toggle="tooltip"]'
		);
		tooltips.forEach((element) => {
			//@ts-ignore
			new bootstrap.Tooltip(element);
		});
	}

	private showRoleModal(roleId?: number): void {
		this.resetForm();
		const modalTitle = document.getElementById("roleModalLabel")!;

		if (roleId) {
			const role = this.roles.find((r) => r.role_id === roleId);
			if (!role) return;

			modalTitle.textContent = i18n.t("roles.editRole");
			(document.getElementById("roleId") as HTMLInputElement).value =
				roleId.toString();
			(document.getElementById("roleName") as HTMLInputElement).value =
				role.name;

			// Set permissions
			role.permissions.forEach((permission) => {
				const checkbox = document.getElementById(
					`permission_${permission.permission_id}`
				) as HTMLInputElement;
				if (checkbox) checkbox.checked = true;
			});
		} else {
			modalTitle.textContent = i18n.t("roles.createNewRole");
		}

		this.roleModal.show();
	}

	private async handleSaveRole(): Promise<void> {
		if (!this.validateForm()) return;

		const roleId = (document.getElementById("roleId") as HTMLInputElement)
			.value;
		const roleName = (
			document.getElementById("roleName") as HTMLInputElement
		).value;
		const selectedPermissions = Array.from(
			document.querySelectorAll(".form-check-input:checked")
		).map((checkbox) => parseInt((checkbox as HTMLInputElement).value));
		const deselectedPermissions = Array.from(
			document.querySelectorAll(".form-check-input:not(:checked)")
		).map((checkbox) => parseInt((checkbox as HTMLInputElement).value));

		try {
			this.setLoading(true);

			const method = roleId ? "PUT" : "POST";
			const url = `/api/roles${roleId ? `/${roleId}` : ""}`;
			const data = roleId
				? {
						role_id: parseInt(roleId),
						name: roleName,
						permissions: {
							add: selectedPermissions,
							remove: deselectedPermissions
						}
				  }
				: {
						name: roleName,
						permissions: selectedPermissions
				  };

			const response = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				},
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(
					error.error || i18n.t("roles.messages.saveError")
				);
			}

			await this.loadRoles();
			this.roleModal.hide();

			Swal.fire({
				icon: "success",
				title: i18n.t("common.success"),
				text: roleId
					? i18n.t("roles.messages.updateSuccess")
					: i18n.t("roles.messages.createSuccess"),
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000,
				timerProgressBar: true
			});
		} catch (error) {
			console.error("Error saving role:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("roles.messages.saveError")
			);
		} finally {
			this.setLoading(false);
		}
	}

	public async deleteRole(roleId: number): Promise<void> {
		try {
			// Check if trying to delete Admin role
			const role = this.roles.find((r) => r.role_id === roleId);
			if (role && role.name === "Admin") {
				this.showError(i18n.t("roles.messages.cannotDeleteAdmin"));
				return;
			}

			const result = await Swal.fire({
				title: i18n.t("roles.messages.deleteConfirmTitle"),
				text: i18n.t("roles.messages.deleteConfirmText"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("common.yes"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const response = await fetch(`/api/roles/${roleId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});

				if (!response.ok) {
					throw new Error(i18n.t("roles.messages.deleteError"));
				}

				await this.loadRoles();

				Swal.fire({
					icon: "success",
					title: i18n.t("common.success"),
					text: i18n.t("roles.messages.deleteSuccess"),
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000,
					timerProgressBar: true
				});
			}
		} catch (error) {
			console.error("Error deleting role:", error);
			this.showError(i18n.t("roles.messages.deleteError"));
		}
	}

	public editRole(roleId: number): void {
		this.showRoleModal(roleId);
	}

	private toggleAllPermissions(checked: boolean): void {
		const checkboxes = document.querySelectorAll(
			".form-check-input"
		) as NodeListOf<HTMLInputElement>;
		checkboxes.forEach((checkbox) => {
			checkbox.checked = checked;
		});
	}

	private validateForm(): boolean {
		this.roleForm.classList.add("was-validated");
		return this.roleForm.checkValidity();
	}

	private resetForm(): void {
		this.roleForm.reset();
		this.roleForm.classList.remove("was-validated");
		(document.getElementById("roleId") as HTMLInputElement).value = "";
		this.toggleAllPermissions(false);
	}

	private setLoading(loading: boolean): void {
		const spinner = this.saveButton.querySelector(".spinner-border")!;
		const buttonText = this.saveButton.querySelector(".btn-text")!;
		this.saveButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("roles.buttons.saving")
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
}

// Initialize and expose for HTML onclick handlers
declare global {
	interface Window {
		roleManager: RoleManager;
	}
}

window.roleManager = new RoleManager();
