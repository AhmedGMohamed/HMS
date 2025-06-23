//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";

export class SidebarManager {
	private sidebarCollapse: HTMLElement;
	private sidebar: HTMLElement;
	private logoutBtn: HTMLElement;

	constructor() {
		this.sidebarCollapse = document.getElementById("sidebarCollapse")!;
		this.sidebar = document.getElementById("sidebar")!;
		this.logoutBtn = document.getElementById("logoutBtn")!;

		this.initializeSidebar();
	}

	private async initializeSidebar(): Promise<void> {
		// Load user info
		this.loadUserInfo();

		// Add event listeners
		this.sidebarCollapse.addEventListener(
			"click",
			this.toggleSidebar.bind(this)
		);
		this.logoutBtn.addEventListener("click", this.handleLogout.bind(this));

		// Handle permission-based visibility
		this.handlePermissionBasedVisibility();
	}

	private loadUserInfo(): void {
		const userString = localStorage.getItem("user");
		if (!userString) {
			this.handleAuthError();
			return;
		}

		const user = JSON.parse(userString);

		// Update sidebar profile
		const userFullName = document.getElementById("userFullName");
		const userRole = document.getElementById("userRole");

		if (userFullName) {
			userFullName.textContent = user.username;
		}
		if (userRole) {
			userRole.textContent = user.role;
		}
	}

	private handlePermissionBasedVisibility(): void {
		const userString = localStorage.getItem("user");
		if (!userString) return;

		const user = JSON.parse(userString);

		// Handle role-based visibility
		const roleElements = document.querySelectorAll("[data-requires-role]");
		roleElements.forEach((element) => {
			const requiredRole = element.getAttribute("data-requires-role");
			if (requiredRole && user.role !== requiredRole) {
				element.remove();
			}
		});

		// Handle permission-based visibility
		const permissionElements = document.querySelectorAll(
			"[data-requires-permission]"
		);
		permissionElements.forEach((element) => {
			const requiredPermission = element.getAttribute(
				"data-requires-permission"
			);
			if (
				requiredPermission &&
				!this.hasPermission(user, requiredPermission)
			) {
				element.remove();
			}
		});

		this.cleanupEmptySections();
	}

	private hasPermission(user: any, permission: string): boolean {
		if (user.role === "Admin") return true;
		return user.permissions.includes(permission);
	}

	private cleanupEmptySections(): void {
		const headers = document.querySelectorAll(".nav-item-header");
		headers.forEach((header) => {
			let nextElement = header.nextElementSibling;
			while (
				nextElement &&
				nextElement.tagName !== "LI" &&
				!nextElement.classList.contains("nav-item-header")
			) {
				nextElement = nextElement.nextElementSibling;
			}

			if (
				!nextElement ||
				nextElement.classList.contains("nav-item-header")
			) {
				header.remove();
			}
		});
	}

	private toggleSidebar(): void {
		this.sidebar.classList.toggle("active");
	}

	private async handleLogout(): Promise<void> {
		try {
			const result = await Swal.fire({
				title: "Logout Confirmation",
				text: "Are you sure you want to logout?",
				icon: "question",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Yes, logout"
			});

			if (result.isConfirmed) {
				localStorage.removeItem("token");
				localStorage.removeItem("user");

				await Swal.fire({
					icon: "success",
					title: "Logged Out Successfully",
					text: "You have been logged out of the system.",
					timer: 1500,
					showConfirmButton: false
				});

				window.location.href = "/login";
			}
		} catch (error) {
			console.error("Logout error:", error);
			Swal.fire({
				icon: "error",
				title: "Logout Failed",
				text: "An error occurred during logout. Please try again."
			});
		}
	}

	private handleAuthError(): void {
		localStorage.removeItem("token");
		localStorage.removeItem("user");

		Swal.fire({
			icon: "error",
			title: "Authentication Error",
			text: "Please log in again to continue.",
			confirmButtonColor: "#0d6efd"
		}).then(() => {
			window.location.href = "/login";
		});
	}
}
