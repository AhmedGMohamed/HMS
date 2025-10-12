//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

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
		// Wait for i18n to initialize
		this.waitForI18n().then(() => {
			// Initialize sidebar
			new SidebarManager();

			this.initializeEventListeners();
			this.loadPriceLists();

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
		// Re-render price lists with new locale
		this.renderPriceLists();
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
					title: i18n.t("priceLists.messages.changeDefaultTitle"),
					text: i18n.t("priceLists.messages.changeDefaultText"),
					icon: "warning",
					showCancelButton: true,
					confirmButtonColor: "#0d6efd",
					cancelButtonColor: "#6c757d",
					confirmButtonText: i18n.t("priceLists.buttons.makeDefault"),
					cancelButtonText: i18n.t("common.cancel")
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
			this.showError(i18n.t("priceLists.messages.loadError"));
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

		if (this.priceLists.length === 0) {
			container.innerHTML = `
				<div class="col-12">
					<div class="card">
						<div class="card-body text-center py-5">
							<i class="bi bi-list-ul" style="font-size: 3rem; color: var(--bs-gray-400);"></i>
							<p class="mt-3 mb-3 text-muted">${i18n.t(
								"priceLists.messages.noPriceLists"
							)}</p>
							<button type="button" class="btn btn-primary" onclick="priceListManager.showPriceListModal()">
								<i class="bi bi-plus-circle"></i> ${i18n.t("priceLists.buttons.createFirst")}
							</button>
						</div>
					</div>
				</div>
			`;
			return;
		}

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
										? `<span class="default-badge">${i18n.t(
												"priceLists.status.default"
										  )}</span>`
										: ""
								}
                            </h5>
                            <div class="action-buttons">
                                <button class="btn btn-sm btn-outline-primary" 
                                        onclick="priceListManager.editPriceList(${
											priceList.pricelist_id
										})"
                                        title="${i18n.t("common.edit")}">
                                    <i class="bi bi-pencil"></i> ${i18n.t(
										"common.edit"
									)}
                                </button>
                                ${
									!priceList.is_default
										? `
                                    <button class="btn btn-sm btn-outline-danger" 
                                            onclick="priceListManager.deletePriceList(${
												priceList.pricelist_id
											})"
                                            title="${i18n.t("common.delete")}">
                                        <i class="bi bi-trash"></i> ${i18n.t(
											"common.delete"
										)}
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
                                    <div class="stat-label">${i18n.t(
										"priceLists.stats.services"
									)}</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${
										stats.total_drugs
									}</div>
                                    <div class="stat-label">${i18n.t(
										"priceLists.stats.drugs"
									)}</div>
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

			modalTitle.textContent = i18n.t("priceLists.modals.editPriceList");
			this.populateForm(priceList);
		} else {
			modalTitle.textContent = i18n.t(
				"priceLists.modals.createPriceList"
			);
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
				title: i18n.t("common.success"),
				text: priceListId
					? i18n.t("priceLists.messages.updateSuccess")
					: i18n.t("priceLists.messages.createSuccess"),
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
					: i18n.t("priceLists.messages.saveError")
			);
		} finally {
			this.setLoading(false);
		}
	}

	public async deletePriceList(priceListId: number): Promise<void> {
		try {
			const stats = this.priceListStats.get(priceListId);
			let warningMessage = i18n.t(
				"priceLists.messages.deleteConfirmText"
			);

			if (stats && (stats.total_services > 0 || stats.total_drugs > 0)) {
				warningMessage = i18n.t(
					"priceLists.messages.deleteWithAssociationsWarning",
					{
						services: stats.total_services,
						drugs: stats.total_drugs
					}
				);
			}

			const result = await Swal.fire({
				title: i18n.t("priceLists.messages.deleteConfirmTitle"),
				text: warningMessage,
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("common.yes"),
				cancelButtonText: i18n.t("common.cancel")
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
					title: i18n.t("common.success"),
					text: i18n.t("priceLists.messages.deleteSuccess"),
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});
			}
		} catch (error) {
			console.error("Error deleting price list:", error);
			this.showError(i18n.t("priceLists.messages.deleteError"));
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
		buttonText.textContent = loading
			? i18n.t("priceLists.buttons.saving")
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
		priceListManager: PriceListManager;
	}
}

window.priceListManager = new PriceListManager();
