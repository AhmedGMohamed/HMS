//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

interface PriceList {
	pricelist_id: number;
	name: string;
	is_default: boolean;
}

interface PriceListStats {
	total_services: number;
	total_drugs: number;
}

class PriceListManager {
	//@ts-ignore
	private priceListModal: Modal;
	private priceListForm: HTMLFormElement;
	private saveButton: HTMLButtonElement;
	private priceLists: PriceList[] = [];
	private priceListStats: Map<number, PriceListStats> = new Map();

	constructor() {
		// Initialize sidebar
		new SidebarManager();

		// Initialize modal
		const modalElement = document.getElementById("priceListModal")!;
		//@ts-ignore
		this.priceListModal = new bootstrap.Modal(modalElement);

		// Initialize form elements
		this.priceListForm = document.getElementById(
			"priceListForm"
		) as HTMLFormElement;
		this.saveButton = document.getElementById(
			"savePriceListBtn"
		) as HTMLButtonElement;

		this.initializeEventListeners();
		this.loadPriceLists();
	}

	private initializeEventListeners(): void {
		// Create price list button
		document
			.getElementById("createPriceListBtn")
			?.addEventListener("click", () => {
				this.showPriceListModal();
			});

		// Save price list button
		this.saveButton.addEventListener("click", () => {
			this.handleSavePriceList();
		});

		// Modal events
		const modalElement = document.getElementById("priceListModal")!;
		modalElement.addEventListener("hidden.bs.modal", () => {
			this.resetForm();
		});

		// Default checkbox handler
		const defaultCheckbox = document.getElementById(
			"isDefault"
		) as HTMLInputElement;
		defaultCheckbox.addEventListener("change", () => {
			if (defaultCheckbox.checked) {
				Swal.fire({
					title: "Change Default Price List?",
					text: "This will remove default status from the current default price list.",
					icon: "warning",
					showCancelButton: true,
					confirmButtonColor: "#0d6efd",
					cancelButtonColor: "#6c757d",
					confirmButtonText: "Yes, make default"
				}).then((result: any) => {
					if (!result.isConfirmed) {
						defaultCheckbox.checked = false;
					}
				});
			}
		});
	}

	private async loadPriceLists(): Promise<void> {
		try {
			const response = await fetch("/api/price-lists", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch price lists");

			this.priceLists = await response.json();
			await this.loadPriceListStats();
			this.renderPriceLists();
		} catch (error) {
			console.error("Error loading price lists:", error);
			this.showError("Failed to load price lists");
		}
	}

	private async loadPriceListStats(): Promise<void> {
		try {
			for (const priceList of this.priceLists) {
				const response = await fetch(
					`/api/price-lists/${priceList.pricelist_id}/stats`,
					{
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);

				if (!response.ok)
					throw new Error(
						`Failed to fetch stats for price list ${priceList.pricelist_id}`
					);

				const stats = await response.json();
				this.priceListStats.set(priceList.pricelist_id, stats);
			}
		} catch (error) {
			console.error("Error loading price list stats:", error);
			// Continue without stats if they fail to load
		}
	}

	private renderPriceLists(): void {
		const container = document.getElementById("priceListsContainer")!;
		container.innerHTML = this.priceLists
			.map((priceList) => {
				const stats = this.priceListStats.get(
					priceList.pricelist_id
				) || {
					total_services: 0,
					total_drugs: 0
				};

				return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card price-list-card ${
						priceList.is_default ? "default" : ""
					}">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="card-title">
                                ${this.escapeHtml(priceList.name)}
                                ${
									priceList.is_default
										? '<span class="default-badge">Default</span>'
										: ""
								}
                            </h5>
                            <div class="action-buttons">
                                <button class="btn btn-sm btn-outline-primary" 
                                        onclick="priceListManager.editPriceList(${
											priceList.pricelist_id
										})">
                                    <i class="bi bi-pencil"></i> Edit
                                </button>
                                ${
									!priceList.is_default
										? `
                                    <button class="btn btn-sm btn-outline-danger" 
                                            onclick="priceListManager.deletePriceList(${priceList.pricelist_id})">
                                        <i class="bi bi-trash"></i> Delete
                                    </button>
                                `
										: ""
								}
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="price-list-stats">
                                <div class="stat-item">
                                    <div class="stat-value">${
										stats.total_services
									}</div>
                                    <div class="stat-label">Services</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${
										stats.total_drugs
									}</div>
                                    <div class="stat-label">Drugs</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
			})
			.join("");
	}

	private showPriceListModal(priceListId?: number): void {
		this.resetForm();
		const modalTitle = document.getElementById("priceListModalLabel")!;

		if (priceListId) {
			const priceList = this.priceLists.find(
				(pl) => pl.pricelist_id === priceListId
			);
			if (!priceList) return;

			modalTitle.textContent = "Edit Price List";
			this.populateForm(priceList);
		} else {
			modalTitle.textContent = "Create New Price List";
		}

		this.priceListModal.show();
	}

	private populateForm(priceList: PriceList): void {
		(document.getElementById("priceListId") as HTMLInputElement).value =
			priceList.pricelist_id.toString();
		(document.getElementById("priceListName") as HTMLInputElement).value =
			priceList.name;
		(document.getElementById("isDefault") as HTMLInputElement).checked =
			priceList.is_default;
	}

	private async handleSavePriceList(): Promise<void> {
		if (!this.validateForm()) return;

		const priceListId = (
			document.getElementById("priceListId") as HTMLInputElement
		).value;
		const name = (
			document.getElementById("priceListName") as HTMLInputElement
		).value;
		const isDefault = (
			document.getElementById("isDefault") as HTMLInputElement
		).checked;

		const priceListData = {
			...(priceListId ? { pricelist_id: parseInt(priceListId) } : {}),
			name,
			is_default: isDefault
		};

		try {
			this.setLoading(true);

			const response = await fetch(
				`/api/price-lists${priceListId ? `/${priceListId}` : ""}`,
				{
					method: priceListId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(priceListData)
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to save price list");
			}

			await this.loadPriceLists();
			this.priceListModal.hide();

			Swal.fire({
				icon: "success",
				title: "Success",
				text: `Price list successfully ${
					priceListId ? "updated" : "created"
				}`,
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error saving price list:", error);
			this.showError(
				error instanceof Error
					? error.message
					: "Failed to save price list"
			);
		} finally {
			this.setLoading(false);
		}
	}

	public async deletePriceList(priceListId: number): Promise<void> {
		try {
			const stats = this.priceListStats.get(priceListId);
			let warningMessage = "This action cannot be undone!";
			if (stats && (stats.total_services > 0 || stats.total_drugs > 0)) {
				warningMessage = `This price list is associated with ${stats.total_services} service(s) and ${stats.total_drugs} drug(s). Deleting it will remove these associations. This action cannot be undone!`;
			}

			const result = await Swal.fire({
				title: "Are you sure?",
				text: warningMessage,
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Yes, delete it!"
			});

			if (result.isConfirmed) {
				const response = await fetch(
					`/api/price-lists/${priceListId}`,
					{
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);

				if (!response.ok) {
					throw new Error("Failed to delete price list");
				}

				await this.loadPriceLists();

				Swal.fire({
					icon: "success",
					title: "Deleted!",
					text: "Price list has been deleted.",
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});
			}
		} catch (error) {
			console.error("Error deleting price list:", error);
			this.showError("Failed to delete price list");
		}
	}

	public editPriceList(priceListId: number): void {
		this.showPriceListModal(priceListId);
	}

	private validateForm(): boolean {
		this.priceListForm.classList.add("was-validated");
		return this.priceListForm.checkValidity();
	}

	private resetForm(): void {
		this.priceListForm.reset();
		this.priceListForm.classList.remove("was-validated");
		(document.getElementById("priceListId") as HTMLInputElement).value = "";
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
		priceListManager: PriceListManager;
	}
}

window.priceListManager = new PriceListManager();