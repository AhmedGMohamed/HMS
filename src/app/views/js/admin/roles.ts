//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

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
		new SidebarManager();

		// Initialize modal
		const modalElement = document.getElementById("roleModal")!;
		//@ts-ignore
		this.roleModal = new bootstrap.Modal(modalElement);

		// Initialize form elements
		this.roleForm = document.getElementById("roleForm") as HTMLFormElement;
		this.saveButton = document.getElementById(
			"saveRoleBtn"
		) as HTMLButtonElement;

		this.initializeEventListeners();
		this.loadInitialData();
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
			await Promise.all([this.loadPermissions(), this.loadRoles()]);
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError("Failed to load initial data");
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
			this.showError("Failed to load permissions");
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
			this.showError("Failed to load roles");
		}
	}

	private renderRoles(): void {
		const container = document.getElementById("rolesContainer")!;
		container.innerHTML = this.roles
			.map(
				(role) => `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card role-card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="card-title">${this.escapeHtml(
							role.name
						)}</h5>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-primary" onclick="roleManager.editRole(${
								role.role_id
							})">
                                <i class="bi bi-pencil"></i>
                            </button>
                            ${
								role.name !== "Admin"
									? `
                                <button class="btn btn-sm btn-outline-danger" onclick="roleManager.deleteRole(${role.role_id})">
                                    <i class="bi bi-trash"></i>
                                </button>
                            `
									: ""
							}
                        </div>
                    </div>
                    <div class="card-body">
                        <h6 class="card-subtitle mb-3 text-muted">Permissions</h6>
                        <div class="permissions-list">
                            ${role.permissions
								.map(
									(permission) => `
                                <span class="permission-badge">
                                    ${this.escapeHtml(permission.feature_name)}
                                </span>
                            `
								)
								.join("")}
                        </div>
                    </div>
                </div>
            </div>
        `
			)
			.join("");
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
                        <label class="form-check-label" for="permission_${
							permission.permission_id
						}">
                            ${this.escapeHtml(permission.feature_name)}
                            ${
								permission.description
									? `
                                <i class="bi bi-info-circle text-muted" 
                                   data-bs-toggle="tooltip" 
                                   title="${this.escapeHtml(
										permission.description
									)}"></i>
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
			// @ts-ignore
			new bootstrap.Tooltip(element);
		});
	}

	private showRoleModal(roleId?: number): void {
		this.resetForm();
		const modalTitle = document.getElementById("roleModalLabel")!;

		if (roleId) {
			const role = this.roles.find((r) => r.role_id === roleId);
			if (!role) return;

			modalTitle.textContent = "Edit Role";
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
			modalTitle.textContent = "Create New Role";
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
				throw new Error(error.error || "Failed to save role");
			}

			await this.loadRoles();
			this.roleModal.hide();

			Swal.fire({
				icon: "success",
				title: "Success",
				text: `Role successfully ${roleId ? "updated" : "created"}`,
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error saving role:", error);
			this.showError(
				error instanceof Error ? error.message : "Failed to save role"
			);
		} finally {
			this.setLoading(false);
		}
	}

	public async deleteRole(roleId: number): Promise<void> {
		try {
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
				const response = await fetch(`/api/roles/${roleId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});

				if (!response.ok) {
					throw new Error("Failed to delete role");
				}

				await this.loadRoles();

				Swal.fire({
					icon: "success",
					title: "Deleted!",
					text: "Role has been deleted.",
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});
			}
		} catch (error) {
			console.error("Error deleting role:", error);
			this.showError("Failed to delete role");
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
}

// Initialize and expose for HTML onclick handlers
declare global {
	interface Window {
		roleManager: RoleManager;
	}
}

window.roleManager = new RoleManager();
