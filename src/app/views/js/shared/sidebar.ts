//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";

interface NavigationItem {
	id: string;
	label: string;
	icon: string;
	url?: string;
	permission?: string;
	role?: string;
	children?: NavigationItem[];
	isHeader?: boolean;
	isActive?: boolean;
}

export class SidebarManager {
	private sidebarCollapse: HTMLElement;
	private sidebar: HTMLElement;
	private logoutBtn: HTMLElement;
	private sidebarComponents: HTMLElement;
	private currentPath: string;

	constructor() {
		this.sidebarCollapse = document.getElementById("sidebarCollapse")!;
		this.sidebar = document.getElementById("sidebar")!;
		this.logoutBtn = document.getElementById("logoutBtn")!;
		this.sidebarComponents = document.getElementById("sidebarComponents")!;
		this.currentPath = window.location.pathname;

		console.log("here");
		this.initializeSidebar();
	}

	private async initializeSidebar(): Promise<void> {
		// Load user info
		this.loadUserInfo();

		// Load and build navigation
		await this.loadNavigation();

		// Add event listeners
		this.sidebarCollapse.addEventListener(
			"click",
			this.toggleSidebar.bind(this)
		);
		this.logoutBtn.addEventListener("click", this.handleLogout.bind(this));
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

	private async loadNavigation(): Promise<void> {
		try {
			const response = await fetch("/navigation", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) {
				throw new Error("Failed to fetch navigation");
			}

			const navigation: NavigationItem[] = await response.json();
			this.buildNavigationHTML(navigation);
		} catch (error) {
			console.error("Error loading navigation:", error);
			this.handleAuthError();
		}
	}

	private buildNavigationHTML(navigation: NavigationItem[]): void {
		console.log(navigation);
		const html = navigation
			.map((item) => this.buildNavigationItem(item))
			.join("");
		this.sidebarComponents.innerHTML = html;

		// Add event listeners for collapsible items
		this.addNavigationEventListeners();
	}

	private buildNavigationItem(item: NavigationItem): string {
		if (item.isHeader) {
			return `<li class="nav-item-header">${item.label}</li>`;
		}

		const isActive = this.isItemActive(item);
		const activeClass = isActive ? "active" : "";

		if (item.children && item.children.length > 0) {
			// Collapsible menu item
			const childrenId = `${item.id}Submenu`;
			const showClass = isActive ? "show" : "";
			const childrenHTML = item.children
				.map((child) => this.buildChildNavigationItem(child))
				.join("");

			return `
                <li class="${activeClass}">
                    <a href="#${childrenId}" data-bs-toggle="collapse" class="dropdown-toggle">
                        <i class="${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                    <ul class="collapse list-unstyled ${showClass}" id="${childrenId}">
                        ${childrenHTML}
                    </ul>
                </li>
            `;
		} else {
			// Regular menu item
			return `
                <li class="${activeClass}">
                    <a href="${item.url}" class="nav-link">
                        <i class="${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                </li>
            `;
		}
	}

	private buildChildNavigationItem(item: NavigationItem): string {
		const isActive = this.currentPath === item.url;
		const activeClass = isActive ? "active" : "";

		return `
            <li class="${activeClass}">
                <a href="${item.url}" class="nav-link">
                    <i class="${item.icon}"></i>
                    <span>${item.label}</span>
                </a>
            </li>
        `;
	}

	private isItemActive(item: NavigationItem): boolean {
		if (item.url === this.currentPath) {
			return true;
		}

		if (item.children) {
			return item.children.some(
				(child) => child.url === this.currentPath
			);
		}

		return false;
	}

	private addNavigationEventListeners(): void {
		// Handle navigation clicks
		const navLinks = this.sidebarComponents.querySelectorAll(
			"a[href]:not([data-bs-toggle])"
		);
		navLinks.forEach((link) => {
			link.addEventListener("click", (e) => {
				const href = (e.target as HTMLAnchorElement).getAttribute(
					"href"
				);
				if (href && !href.startsWith("#")) {
					// Remove active classes from all items
					this.sidebarComponents
						.querySelectorAll("li")
						.forEach((li) => {
							li.classList.remove("active");
						});

					// Add active class to clicked item
					const parentLi = (e.target as HTMLElement).closest("li");
					if (parentLi) {
						parentLi.classList.add("active");

						// If this is a child item, also make parent active
						const parentCollapse = parentLi.closest(".collapse");
						if (parentCollapse) {
							const parentItem =
								parentCollapse.previousElementSibling?.closest(
									"li"
								);
							if (parentItem) {
								parentItem.classList.add("active");
							}
						}
					}
				}
			});
		});

		// Handle Bootstrap collapse events
		const collapseElements = this.sidebarComponents.querySelectorAll(
			'[data-bs-toggle="collapse"]'
		);
		collapseElements.forEach((element) => {
			element.addEventListener("click", (e) => {
				e.preventDefault();
				const target = element.getAttribute("href");
				if (target) {
					const collapseElement = document.querySelector(target);
					if (collapseElement) {
						//@ts-ignore
						const bsCollapse = new bootstrap.Collapse(
							collapseElement,
							{
								toggle: true
							}
						);
					}
				}
			});
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
