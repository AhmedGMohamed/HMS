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

interface Service {
	service_id: number;
	name: string;
	service_type: string;
	prices: ServicePrice[];
}

interface DrugShipment {
	shipment_id: number;
	drug_id: number;
	drug_name: string;
	quantity: number;
	expiry_date: string;
	warehouse_name: string;
	prices: DrugPrice[];
}

interface ServicePrice {
	pricelist_id?: number;
	service_id: number;
	price: number;
	requires_prepayment: boolean;
	prepayment_type?: "fixed" | "percentage";
	prepayment_amount?: number;
}

interface DrugPrice {
	pricelist_id?: number;
	shipment_id: number;
	price: number;
	requires_prepayment: boolean;
	prepayment_type?: "fixed" | "percentage";
	prepayment_amount?: number;
}

class PriceListManager {
	//@ts-ignore
	private priceListModal: Modal;
	//@ts-ignore
	private addPricesModal: Modal;
	private priceListForm: HTMLFormElement;
	private saveButton: HTMLButtonElement;
	private savePricesButton: HTMLButtonElement;
	private priceLists: PriceList[] = [];
	private priceListStats: Map<number, PriceListStats> = new Map();
	private services: Service[] = [];
	private drugShipments: DrugShipment[] = [];
	private filteredServices: Service[] = [];
	private filteredDrugShipments: DrugShipment[] = [];
	private currentPriceListId: number | null = null;

	constructor() {
		// Initialize modals
		const priceListModalElement =
			document.getElementById("priceListModal")!;
		const addPricesModalElement =
			document.getElementById("addPricesModal")!;
		//@ts-ignore
		this.priceListModal = new bootstrap.Modal(priceListModalElement);
		//@ts-ignore
		this.addPricesModal = new bootstrap.Modal(addPricesModalElement);

		// Initialize form elements
		this.priceListForm = document.getElementById(
			"priceListForm"
		) as HTMLFormElement;
		this.saveButton = document.getElementById(
			"savePriceListBtn"
		) as HTMLButtonElement;
		this.savePricesButton = document.getElementById(
			"savePricesBtn"
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

		// Save prices button
		this.savePricesButton.addEventListener("click", () => {
			this.handleSavePrices();
		});

		// Skip prices button
		document
			.getElementById("skipPricesBtn")
			?.addEventListener("click", () => {
				this.addPricesModal.hide();
			});

		// Modal events
		const priceListModalElement =
			document.getElementById("priceListModal")!;
		priceListModalElement.addEventListener("hidden.bs.modal", () => {
			this.resetForm();
		});

		// Add prices modal events
		const addPricesModalElement =
			document.getElementById("addPricesModal")!;
		addPricesModalElement.addEventListener("shown.bs.modal", () => {
			this.loadServicesAndDrugs();
		});

		// Search inputs
		document
			.getElementById("serviceSearchInput")
			?.addEventListener("input", (e) => {
				const searchTerm = (e.target as HTMLInputElement).value;
				this.filterServices(searchTerm);
			});

		document
			.getElementById("drugSearchInput")
			?.addEventListener("input", (e) => {
				const searchTerm = (e.target as HTMLInputElement).value;
				this.filterDrugs(searchTerm);
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

	private async loadServicesAndDrugs(): Promise<void> {
		try {
			// Load services
			const servicesResponse = await fetch("/api/services", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!servicesResponse.ok)
				throw new Error("Failed to fetch services");
			this.services = await servicesResponse.json();

			// Load drug shipments
			const drugsResponse = await fetch("/api/pharmacy/drugs/shipments", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!drugsResponse.ok)
				throw new Error("Failed to fetch drug shipments");
			this.drugShipments = (await drugsResponse.json()).filter(
				(shipment: DrugShipment) => shipment.quantity > 0
			);

			// Initialize filtered lists
			this.filteredServices = [...this.services];
			this.filteredDrugShipments = [...this.drugShipments];

			// Render lists
			this.renderServicesList();
			this.renderDrugsList();

			// Update counts
			document.getElementById("servicesCount")!.textContent =
				this.services.length.toString();
			document.getElementById("drugsCount")!.textContent =
				this.drugShipments.length.toString();
		} catch (error) {
			console.error("Error loading services and drugs:", error);
			this.showError("Failed to load services and drug shipments");
		}
	}

	private filterServices(searchTerm: string): void {
		const term = searchTerm.toLowerCase();
		this.filteredServices = this.services.filter((service) =>
			service.name.toLowerCase().includes(term)
		);
		this.renderServicesList();
	}

	private filterDrugs(searchTerm: string): void {
		const term = searchTerm.toLowerCase();
		this.filteredDrugShipments = this.drugShipments.filter(
			(shipment) =>
				shipment.drug_name.toLowerCase().includes(term) ||
				shipment.warehouse_name.toLowerCase().includes(term)
		);
		this.renderDrugsList();
	}

	private renderServicesList(): void {
		const container = document.getElementById("servicesListContainer")!;

		if (this.filteredServices.length === 0) {
			container.innerHTML = `
            <div class="text-center py-4">
                <i class="bi bi-inbox" style="font-size: 2rem; color: var(--bs-gray-400);"></i>
                <p class="mt-2 text-muted" data-i18n="priceLists.messages.noServices">${i18n.t(
					"priceLists.messages.noServices"
				)}</p>
            </div>
        `;
			return;
		}

		container.innerHTML = this.filteredServices
			.map((service) => {
				const existingPrice = service.prices.find(
					(price) => price.pricelist_id === this.currentPriceListId
				);
				const hasExistingPrice =
					existingPrice && existingPrice.price !== undefined;
				const hasPrepayment =
					hasExistingPrice && existingPrice.requires_prepayment;

				return `
		        <div class="card mb-3 ${hasExistingPrice ? "border-primary" : ""}">
		            <div class="card-body">
		                ${
							hasExistingPrice
								? `
		                <div class="badge bg-primary position-absolute top-0 end-0 m-2">
		                    <i class="bi bi-check-circle"></i> ${i18n.t(
								"priceLists.status.hasPrice"
							)}
		                </div>
		                `
								: ""
						}
		                <div class="row align-items-center">
		                    <div class="col-md-4">
		                        <h6 class="mb-1">${this.escapeHtml(service.name)}</h6>
		                        <small class="text-muted">
									<span class="badge bg-info">${i18n.t(
										`priceLists.serviceTypes.${service.service_type}`
									)}</span>
		                        </small>
		                    </div>
		                    <div class="col-md-8">
		                        <div class="row g-2">
		                            <div class="col-md-4">
		                                <label class="form-label small" data-i18n="priceLists.fields.price">${i18n.t(
											"priceLists.fields.price"
										)}</label>
		                                <input type="number" 
		                                       class="form-control form-control-sm" 
		                                       id="service_price_${service.service_id}"
		                                       placeholder="0" 
		                                       step="0.01" 
		                                       min="0"
		                                       value="${
													hasExistingPrice
														? existingPrice.price
														: ""
												}">
		                            </div>
		                            <div class="col-md-8">
		                                <div class="form-check mt-4">
		                                    <input class="form-check-input" 
		                                           type="checkbox" 
		                                           id="service_prepayment_${
														service.service_id
													}"
		                                           ${hasPrepayment ? "checked" : ""}
		                                           onchange="priceListManager.togglePrepaymentFields('service', ${
														service.service_id
													})">
		                                    <label class="form-check-label small" for="service_prepayment_${
												service.service_id
											}" data-i18n="priceLists.fields.requirePrepayment">
		                                        ${i18n.t(
													"priceLists.fields.requirePrepayment"
												)}
		                                    </label>
		                                </div>
		                            </div>
		                        </div>
		                        <div class="row g-2 mt-1 ${
									hasPrepayment ? "" : "d-none"
								}" id="service_prepayment_fields_${
					service.service_id
				}">
		                            <div class="col-md-6">
		                                <label class="form-label small" data-i18n="priceLists.fields.prepaymentType">${i18n.t(
											"priceLists.fields.prepaymentType"
										)}</label>
		                                <select class="form-select form-select-sm" id="service_prepayment_type_${
											service.service_id
										}">
		                                    <option value="fixed" ${
												hasPrepayment &&
												existingPrice.prepayment_type ===
													"fixed"
													? "selected"
													: ""
											} data-i18n="priceLists.prepaymentTypes.fixed">${i18n.t(
					"priceLists.prepaymentTypes.fixed"
				)}</option>
		                                    <option value="percentage" ${
												hasPrepayment &&
												existingPrice.prepayment_type ===
													"percentage"
													? "selected"
													: ""
											} data-i18n="priceLists.prepaymentTypes.percentage">${i18n.t(
					"priceLists.prepaymentTypes.percentage"
				)}</option>
		                                </select>
		                            </div>
		                            <div class="col-md-6">
		                                <label class="form-label small" data-i18n="priceLists.fields.prepaymentAmount">${i18n.t(
											"priceLists.fields.prepaymentAmount"
										)}</label>
		                                <input type="number" 
		                                       class="form-control form-control-sm" 
		                                       id="service_prepayment_amount_${
													service.service_id
												}"
		                                       placeholder="0" 
		                                       step="0.01" 
		                                       min="0"
		                                       value="${
													hasPrepayment &&
													existingPrice.prepayment_amount
														? existingPrice.prepayment_amount
														: ""
												}">
		                            </div>
		                        </div>
		                    </div>
		                </div>
		            </div>
		        </div>
		    `;
			})
			.join("");
	}

	private renderDrugsList(): void {
		const container = document.getElementById("drugsListContainer")!;

		if (this.filteredDrugShipments.length === 0) {
			container.innerHTML = `
            <div class="text-center py-4">
                <i class="bi bi-inbox" style="font-size: 2rem; color: var(--bs-gray-400);"></i>
                <p class="mt-2 text-muted" data-i18n="priceLists.messages.noDrugs">${i18n.t(
					"priceLists.messages.noDrugs"
				)}</p>
            </div>
        `;
			return;
		}

		container.innerHTML = this.filteredDrugShipments
			.map((shipment) => {
				const existingPrice = shipment.prices.find(
					(price) => price.pricelist_id === this.currentPriceListId
				);
				const hasExistingPrice =
					existingPrice && existingPrice.price !== undefined;
				const hasPrepayment =
					hasExistingPrice && existingPrice.requires_prepayment;

				return `
		        <div class="card mb-3 ${hasExistingPrice ? "border-primary" : ""}">
		            <div class="card-body">
		                ${
							hasExistingPrice
								? `
		                <div class="badge bg-primary position-absolute top-0 end-0 m-2">
		                    <i class="bi bi-check-circle"></i> ${i18n.t(
								"priceLists.status.hasPrice"
							)}
		                </div>
		                `
								: ""
						}
		                <div class="row align-items-center">
		                    <div class="col-md-4">
		                        <h6 class="mb-1">${this.escapeHtml(
									shipment.drug_name
								)}</h6>
		                        <small class="text-muted">
		                            <span data-i18n="priceLists.fields.warehouse">${i18n.t(
										"priceLists.fields.warehouse"
									)}</span>: ${this.escapeHtml(
					shipment.warehouse_name
				)}<br>
		                            <span data-i18n="priceLists.fields.quantity">${i18n.t(
										"priceLists.fields.quantity"
									)}</span>: ${i18n.formatCurrency(
					shipment.quantity
				)}<br>
		                            <span data-i18n="priceLists.fields.expiry">${i18n.t(
										"priceLists.fields.expiry"
									)}</span>: ${i18n.formatDate(
					new Date(shipment.expiry_date)
				)}
		                        </small>
		                    </div>
		                    <div class="col-md-8">
		                        <div class="row g-2">
		                            <div class="col-md-4">
		                                <label class="form-label small" data-i18n="priceLists.fields.price">${i18n.t(
											"priceLists.fields.price"
										)}</label>
		                                <input type="number" 
		                                       class="form-control form-control-sm" 
		                                       id="drug_price_${shipment.shipment_id}"
		                                       placeholder="0" 
		                                       step="0.01" 
		                                       min="0"
		                                       value="${
													hasExistingPrice
														? existingPrice.price
														: ""
												}">
		                            </div>
		                            <div class="col-md-8">
		                                <div class="form-check mt-4">
		                                    <input class="form-check-input" 
		                                           type="checkbox" 
		                                           id="drug_prepayment_${
														shipment.shipment_id
													}"
		                                           ${hasPrepayment ? "checked" : ""}
		                                           onchange="priceListManager.togglePrepaymentFields('drug', ${
														shipment.shipment_id
													})">
		                                    <label class="form-check-label small" for="drug_prepayment_${
												shipment.shipment_id
											}" data-i18n="priceLists.fields.requirePrepayment">
		                                        ${i18n.t(
													"priceLists.fields.requirePrepayment"
												)}
		                                    </label>
		                                </div>
		                            </div>
		                        </div>
		                        <div class="row g-2 mt-1 ${
									hasPrepayment ? "" : "d-none"
								}" id="drug_prepayment_fields_${
					shipment.shipment_id
				}">
		                            <div class="col-md-6">
		                                <label class="form-label small" data-i18n="priceLists.fields.prepaymentType">${i18n.t(
											"priceLists.fields.prepaymentType"
										)}</label>
		                                <select class="form-select form-select-sm" id="drug_prepayment_type_${
											shipment.shipment_id
										}">
		                                    <option value="fixed" ${
												hasPrepayment &&
												existingPrice.prepayment_type ===
													"fixed"
													? "selected"
													: ""
											} data-i18n="priceLists.prepaymentTypes.fixed">${i18n.t(
					"priceLists.prepaymentTypes.fixed"
				)}</option>
		                                    <option value="percentage" ${
												hasPrepayment &&
												existingPrice.prepayment_type ===
													"percentage"
													? "selected"
													: ""
											} data-i18n="priceLists.prepaymentTypes.percentage">${i18n.t(
					"priceLists.prepaymentTypes.percentage"
				)}</option>
		                                </select>
		                            </div>
		                            <div class="col-md-6">
		                                <label class="form-label small" data-i18n="priceLists.fields.prepaymentAmount">${i18n.t(
											"priceLists.fields.prepaymentAmount"
										)}</label>
		                                <input type="number" 
		                                       class="form-control form-control-sm" 
		                                       id="drug_prepayment_amount_${
													shipment.shipment_id
												}"
		                                       placeholder="0" 
		                                       step="0.01" 
		                                       min="0"
		                                       value="${
													hasPrepayment &&
													existingPrice.prepayment_amount
														? existingPrice.prepayment_amount
														: ""
												}">
		                            </div>
		                        </div>
		                    </div>
		                </div>
		            </div>
		        </div>
		    `;
			})
			.join("");
	}

	public togglePrepaymentFields(type: "service" | "drug", id: number): void {
		const checkbox = document.getElementById(
			`${type}_prepayment_${id}`
		) as HTMLInputElement;
		const fields = document.getElementById(
			`${type}_prepayment_fields_${id}`
		)!;

		if (checkbox.checked) {
			fields.classList.remove("d-none");
		} else {
			fields.classList.add("d-none");
		}
	}

	private async handleSavePrices(): Promise<void> {
		try {
			this.setPricesLoading(true);

			const servicePrices: ServicePrice[] = [];
			const drugPrices: DrugPrice[] = [];

			// Collect service prices
			for (const service of this.services) {
				const priceInput = document.getElementById(
					`service_price_${service.service_id}`
				) as HTMLInputElement;
				const price = parseFloat(priceInput.value);

				if (priceInput.value && !isNaN(price) && price > 0) {
					const prepaymentCheckbox = document.getElementById(
						`service_prepayment_${service.service_id}`
					) as HTMLInputElement;
					const prepaymentType = document.getElementById(
						`service_prepayment_type_${service.service_id}`
					) as HTMLSelectElement;
					const prepaymentAmount = document.getElementById(
						`service_prepayment_amount_${service.service_id}`
					) as HTMLInputElement;

					servicePrices.push({
						service_id: service.service_id,
						price,
						requires_prepayment: prepaymentCheckbox.checked,
						...(prepaymentCheckbox.checked && {
							prepayment_type: prepaymentType.value as
								| "fixed"
								| "percentage",
							prepayment_amount: parseFloat(
								prepaymentAmount.value
							)
						})
					});
				}
			}

			// Collect drug prices
			for (const shipment of this.drugShipments) {
				const priceInput = document.getElementById(
					`drug_price_${shipment.shipment_id}`
				) as HTMLInputElement;
				const price = parseFloat(priceInput.value);

				if (priceInput.value && !isNaN(price) && price > 0) {
					const prepaymentCheckbox = document.getElementById(
						`drug_prepayment_${shipment.shipment_id}`
					) as HTMLInputElement;
					const prepaymentType = document.getElementById(
						`drug_prepayment_type_${shipment.shipment_id}`
					) as HTMLSelectElement;
					const prepaymentAmount = document.getElementById(
						`drug_prepayment_amount_${shipment.shipment_id}`
					) as HTMLInputElement;

					drugPrices.push({
						shipment_id: shipment.shipment_id,
						price,
						requires_prepayment: prepaymentCheckbox.checked,
						...(prepaymentCheckbox.checked && {
							prepayment_type: prepaymentType.value as
								| "fixed"
								| "percentage",
							prepayment_amount: parseFloat(
								prepaymentAmount.value
							)
						})
					});
				}
			}

			// Save service prices
			for (const servicePrice of servicePrices) {
				const response = await fetch(
					`/api/services/${servicePrice.service_id}`,
					{
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						},
						body: JSON.stringify({
							prices: [
								{
									pricelist_id: this.currentPriceListId,
									price: servicePrice.price,
									requires_prepayment:
										servicePrice.requires_prepayment,
									...(servicePrice.requires_prepayment && {
										prepayment_type:
											servicePrice.prepayment_type,
										prepayment_amount:
											servicePrice.prepayment_amount
									})
								}
							]
						})
					}
				);

				if (!response.ok) {
					throw new Error(
						`Failed to save price for service ${servicePrice.service_id}`
					);
				}
			}

			// Save drug prices
			for (const drugPrice of drugPrices) {
				const response = await fetch(
					`/api/pharmacy/drugs/shipments/${drugPrice.shipment_id}`,
					{
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						},
						body: JSON.stringify({
							prices: [
								{
									pricelist_id: this.currentPriceListId,
									price: drugPrice.price,
									requires_prepayment:
										drugPrice.requires_prepayment,
									...(drugPrice.requires_prepayment && {
										prepayment_type:
											drugPrice.prepayment_type,
										prepayment_amount:
											drugPrice.prepayment_amount
									})
								}
							]
						})
					}
				);

				if (!response.ok) {
					throw new Error(
						`Failed to save price for drug shipment ${drugPrice.shipment_id}`
					);
				}
			}

			this.addPricesModal.hide();
			await this.loadPriceLists();

			Swal.fire({
				icon: "success",
				title: i18n.t("common.success"),
				text: i18n.t("priceLists.messages.pricesAddedSuccess", {
					services: servicePrices.length,
					drugs: drugPrices.length
				}),
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error saving prices:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("priceLists.messages.pricesSaveError")
			);
		} finally {
			this.setPricesLoading(false);
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
                                <button class="btn btn-sm btn-outline-info" 
                                        onclick="priceListManager.showAddPricesModal(${
											priceList.pricelist_id
										})"
                                        title="${i18n.t(
											"priceLists.buttons.addPrices"
										)}">
                                    <i class="bi bi-plus-circle"></i> ${i18n.t(
										"priceLists.buttons.addPrices"
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

	public showAddPricesModal(priceListId: number): void {
		const priceList = this.priceLists.find(
			(pl) => pl.pricelist_id === priceListId
		);
		if (!priceList) return;

		this.currentPriceListId = priceListId;
		const priceListNameElement = document.getElementById(
			"addPricesPriceListName"
		)!;
		priceListNameElement.textContent = priceList.name;

		this.addPricesModal.show();
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

			const savedPriceList = await response.json();

			this.priceListModal.hide();

			// Show success message
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

			// If creating a new price list, ask if user wants to add prices
			if (!priceListId) {
				const result = await Swal.fire({
					title: i18n.t("priceLists.messages.addPricesNow"),
					text: i18n.t("priceLists.messages.addPricesNowText"),
					icon: "question",
					showCancelButton: true,
					confirmButtonColor: "#0d6efd",
					cancelButtonColor: "#6c757d",
					confirmButtonText: i18n.t("common.yes"),
					cancelButtonText: i18n.t("priceLists.buttons.skipForNow")
				});

				await this.loadPriceLists();

				if (result.isConfirmed) {
					// Show add prices modal
					this.showAddPricesModal(savedPriceList.pricelist_id);
				}
			} else {
				await this.loadPriceLists();
			}
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

	private setPricesLoading(loading: boolean): void {
		const spinner = this.savePricesButton.querySelector(".spinner-border")!;
		const buttonText = this.savePricesButton.querySelector(".btn-text")!;
		this.savePricesButton.disabled = loading;
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
