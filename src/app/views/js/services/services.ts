//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

interface ServicePrice {
	service_id: number;
	pricelist_id: number;
	price: number | string;
	requires_prepayment: boolean;
	prepayment_type: "fixed" | "percentage" | null;
	prepayment_amount: number | null;
}

interface PriceList {
	pricelist_id: number;
	name: string;
	is_default: boolean;
}

interface Drug {
	drug_id: number;
	name: string;
}

interface ServiceDrug {
	service_id: number;
	drug_id: number;
	name: string;
}

interface Service {
	service_id: number;
	name: string;
	auto_renew: boolean;
	auto_add_on_admission: boolean;
	service_type: "once" | "hourly" | "daily";
	prices: ServicePrice[];
	drugs: ServiceDrug[];
}

class ServiceManager {
	//@ts-ignore
	private serviceModal: Modal;
	private serviceForm: HTMLFormElement;
	private saveButton: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private typeFilter: HTMLSelectElement;
	private priceListFilter: HTMLSelectElement;
	private drugFilter: HTMLInputElement;
	private services: Service[] = [];
	private priceLists: PriceList[] = [];
	private availableDrugs: Drug[] = [];
	private selectedDrugIds: Set<number> = new Set();
	private drugSearchTimeout: NodeJS.Timeout | null = null;

	constructor() {
		// Initialize modal
		const modalElement = document.getElementById("serviceModal")!;
		//@ts-ignore
		this.serviceModal = new bootstrap.Modal(modalElement);

		// Initialize form elements
		this.serviceForm = document.getElementById(
			"serviceForm"
		) as HTMLFormElement;
		this.saveButton = document.getElementById(
			"saveServiceBtn"
		) as HTMLButtonElement;
		this.searchInput = document.getElementById(
			"searchService"
		) as HTMLInputElement;
		this.typeFilter = document.getElementById(
			"typeFilter"
		) as HTMLSelectElement;
		this.priceListFilter = document.getElementById(
			"priceListFilter"
		) as HTMLSelectElement;
		this.drugFilter = document.getElementById(
			"drugFilter"
		) as HTMLInputElement;

		this.waitForI18n().then(() => {
			// Initialize sidebar
			new SidebarManager();

			this.initializeEventListeners();
			this.loadInitialData();

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
		// Reload and re-render all data with new locale
		this.filterServices();
		this.updatePriceListFilter();
	}

	private initializeEventListeners(): void {
		// Create service button
		document
			.getElementById("createServiceBtn")
			?.addEventListener("click", () => {
				this.showServiceModal();
			});

		// Save service button
		this.saveButton.addEventListener("click", () => {
			this.handleSaveService();
		});

		// Search and filters
		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.filterServices();
			}, 300)
		);

		this.typeFilter.addEventListener("change", () => {
			this.filterServices();
		});

		this.priceListFilter.addEventListener("change", () => {
			this.filterServices();
		});

		this.drugFilter.addEventListener(
			"input",
			this.debounce(() => {
				this.filterServices();
			}, 300)
		);

		// Modal events
		const modalElement = document.getElementById("serviceModal")!;
		modalElement.addEventListener("hidden.bs.modal", () => {
			this.resetForm();
		});

		// Service type change event
		document
			.getElementById("serviceType")
			?.addEventListener("change", (e) => {
				const target = e.target as HTMLSelectElement;
				const autoRenewCheckbox = document.getElementById(
					"autoRenew"
				) as HTMLInputElement;

				// Only enable auto-renew for hourly or daily services
				if (target.value === "once") {
					autoRenewCheckbox.checked = false;
					autoRenewCheckbox.disabled = true;
				} else {
					autoRenewCheckbox.disabled = false;
				}
			});
	}

	private async loadInitialData(): Promise<void> {
		try {
			await Promise.all([
				this.loadPriceLists(),
				this.loadServices(),
				this.loadDrugs()
			]);
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError(i18n.t("services.messages.loadInitialDataError"));
		}
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

			// Update price list filter
			this.updatePriceListFilter();

			// Update modal price lists
			this.updateModalPriceLists();
		} catch (error) {
			console.error("Error loading price lists:", error);
			this.showError(i18n.t("services.messages.loadPriceListsError"));
		}
	}

	private async loadDrugs(): Promise<void> {
		try {
			const response = await fetch("/api/pharmacy/drugs/cards", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch drugs");

			response.json().then((drugs: Drug[]) => {
				this.availableDrugs = drugs;
				this.renderAvailableDrugs();
			});
		} catch (error) {
			console.error("Error loading drugs:", error);
			this.showError(i18n.t("services.messages.loadDrugsError"));
		}
	}

	private initializeDrugSearch(): void {
		const searchInput = document.getElementById(
			"drugSearch"
		) as HTMLInputElement;
		searchInput.addEventListener("input", () => {
			if (this.drugSearchTimeout) {
				clearTimeout(this.drugSearchTimeout);
			}
			this.drugSearchTimeout = setTimeout(() => {
				this.filterAndRenderDrugs(searchInput.value);
			}, 300);
		});
	}

	private filterAndRenderDrugs(searchTerm: string): void {
		const filteredDrugs = this.availableDrugs.filter(
			(drug) =>
				drug.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
				!this.selectedDrugIds.has(drug.drug_id)
		);
		this.renderAvailableDrugs(filteredDrugs);
	}

	private renderAvailableDrugs(drugs: Drug[] = this.availableDrugs): void {
		const container = document.getElementById("availableDrugs")!;
		const availableDrugs = drugs.filter(
			(drug) => !this.selectedDrugIds.has(drug.drug_id)
		);

		container.innerHTML = availableDrugs.length
			? availableDrugs
					.map(
						(drug) => `
            <div class="list-group-item drug-item d-flex justify-content-between align-items-center" 
                 onclick="serviceManager.addDrug(${drug.drug_id})">
                ${this.escapeHtml(drug.name)}
                <i class="bi bi-plus-circle text-primary"></i>
            </div>
        `
					)
					.join("")
			: `<div class="list-group-item text-center text-muted">${i18n.t(
					"services.messages.noDrugsAvailable"
			  )}</div>`;
	}

	private renderSelectedDrugs(): void {
		const container = document.getElementById("selectedDrugs")!;
		const selectedDrugs = this.availableDrugs.filter((drug) =>
			this.selectedDrugIds.has(drug.drug_id)
		);

		container.innerHTML = selectedDrugs.length
			? selectedDrugs
					.map(
						(drug) => `
            <div class="list-group-item selected-drug-item">
                ${this.escapeHtml(drug.name)}
                <i class="bi bi-x-circle remove-drug" 
                   onclick="serviceManager.removeDrug(${drug.drug_id})"></i>
            </div>
        `
					)
					.join("")
			: `<div class="list-group-item text-center text-muted">${i18n.t(
					"services.messages.noDrugsSelected"
			  )}</div>`;
	}

	public addDrug(drugId: number): void {
		this.selectedDrugIds.add(drugId);
		this.renderAvailableDrugs();
		this.renderSelectedDrugs();
	}

	public removeDrug(drugId: number): void {
		this.selectedDrugIds.delete(drugId);
		this.renderAvailableDrugs();
		this.renderSelectedDrugs();
	}

	private updatePriceListFilter(): void {
		this.priceListFilter.innerHTML =
			`<option value="">${i18n.t(
				"services.filters.allPriceLists"
			)}</option>` +
			this.priceLists
				.map(
					(list) =>
						`<option value="${list.pricelist_id}">${this.escapeHtml(
							list.name
						)}</option>`
				)
				.join("");
	}

	private updateModalPriceLists(): void {
		const container = document.getElementById("priceListsContainer")!;
		container.innerHTML = this.priceLists
			.map(
				(list) =>
					`<div class="price-list-row ${
						list.is_default ? "default-price-list" : ""
					}" data-pricelist-id="${list.pricelist_id}">
					    <div class="d-flex justify-content-between align-items-center mb-2">
					        <div class="price-list-title">
					            ${this.escapeHtml(list.name)}
					            ${
									list.is_default
										? `<span class="badge bg-primary ms-2">${i18n.t(
												"services.status.default"
										  )}</span>`
										: ""
								}
					        </div>
					        ${
								!list.is_default
									? `
					            <div class="form-check">
					                <input class="form-check-input price-list-toggle" 
					                       type="checkbox" 
					                       id="include_${list.pricelist_id}"
					                       data-pricelist-id="${list.pricelist_id}">
					                <label class="form-check-label" for="include_${
										list.pricelist_id
									}">
					                    ${i18n.t("services.fields.includePriceList")}
					                </label>
					            </div>
					        `
									: ""
							}
					    </div>
					    <div class="price-list-controls ${list.is_default ? "" : "disabled"}">
					        <div class="row g-3">
					            <div class="col-md-6">
					                <div class="input-group">
					                    <span class="input-group-text">${i18n.t(
											"common.currency"
										)}</span>
					                    <input type="number" 
					                           class="form-control price-input" 
					                           name="price_${list.pricelist_id}"
					                           required="${list.is_default}"
					                           min="0"
					                           step="0.01"
					                           ${!list.is_default ? "disabled" : ""}>
					                    <div class="invalid-feedback">
					                        ${i18n.t("services.validation.priceRequired")}
					                    </div>
					                </div>
					            </div>
					            <div class="col-md-6">
					                <div class="form-check">
					                    <input class="form-check-input prepayment-toggle" 
					                           type="checkbox" 
					                           id="prepayment_${list.pricelist_id}"
					                           ${!list.is_default ? "disabled" : ""}>
					                    <label class="form-check-label" for="prepayment_${
											list.pricelist_id
										}">
					                        ${i18n.t("services.fields.requiresPrepayment")}
					                    </label>
					                </div>
					            </div>
					            <div class="col-12 prepayment-controls" id="prepaymentControls_${
									list.pricelist_id
								}">
					                <div class="row g-3">
					                    <div class="col-md-6">
					                        <select class="form-select prepayment-type" 
					                                id="prepaymentType_${list.pricelist_id}"
					                                disabled>
					                            <option value="fixed">${i18n.t(
													"services.prepaymentTypes.fixed"
												)}</option>
					                            <option value="percentage">${i18n.t(
													"services.prepaymentTypes.percentage"
												)}</option>
					                        </select>
					                    </div>
					                    <div class="col-md-6">
					                        <div class="input-group">
					                            <input type="number" 
					                                   class="form-control prepayment-amount" 
					                                   id="prepaymentAmount_${list.pricelist_id}"
					                                   min="0"
					                                   step="0.01"
					                                   disabled>
					                            <span class="input-group-text prepayment-symbol">${i18n.t(
													"common.currency"
												)}</span>
					                        </div>
					                    </div>
					                </div>
					            </div>
					        </div>
					    </div>
					</div>
					`
			)
			.join("");

		// Add event listeners for prepayment toggles
		document.querySelectorAll(".prepayment-toggle").forEach((toggle) => {
			toggle.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				const priceListId = target.id.split("_")[1];
				const controls = document.getElementById(
					`prepaymentControls_${priceListId}`
				);
				controls?.classList.toggle("show", target.checked);
			});
		});

		// Add event listeners for prepayment type changes
		document.querySelectorAll(".prepayment-type").forEach((select) => {
			select.addEventListener("change", (e) => {
				const target = e.target as HTMLSelectElement;
				const priceListId = target.id.split("_")[1];
				const symbol = document.querySelector(
					`#prepaymentControls_${priceListId} .prepayment-symbol`
				);
				if (symbol) {
					symbol.textContent =
						target.value === "fixed"
							? i18n.t("common.currency")
							: "%";
				}
			});
		});

		this.initializePriceListControls();
	}

	private async getServicesWithPrices(
		services: Service[]
	): Promise<Service[] | null> {
		let servicesWithPrices = [];
		try {
			for (const service of services) {
				const response = await fetch(
					`/api/services/${service.service_id}`,
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
						"Failed to fetch service with ID " + service.service_id
					);

				const serviceWithPrice = await response.json();
				servicesWithPrices.push(serviceWithPrice);
			}
			return servicesWithPrices;
		} catch (error) {
			console.error("Error loading services:", error);
			this.showError(i18n.t("services.messages.loadServicesError"));
			return null;
		}
	}

	private async loadServices(): Promise<void> {
		try {
			const response = await fetch("/api/services", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch services");

			const allServices = await response.json();
			const servicesWithPrices = await this.getServicesWithPrices(
				allServices
			);

			if (!servicesWithPrices)
				throw new Error("Failed to fetch services");

			this.services = servicesWithPrices;
			this.filterServices();
		} catch (error) {
			console.error("Error loading services:", error);
			this.showError(i18n.t("services.messages.loadServicesError"));
		}
	}

	private filterServices(): void {
		const searchTerm = this.searchInput.value.toLowerCase().trim();
		const typeFilter = this.typeFilter.value;
		const priceListFilter = parseInt(this.priceListFilter.value);
		const drugFilter = this.drugFilter.value.toLowerCase().trim();

		let filteredServices = [...this.services];

		if (searchTerm) {
			filteredServices = filteredServices.filter((service) =>
				service.name.toLowerCase().includes(searchTerm)
			);
		}

		if (typeFilter) {
			filteredServices = filteredServices.filter(
				(service) => service.service_type === typeFilter
			);
		}

		if (priceListFilter) {
			filteredServices = filteredServices.filter((service) =>
				service.prices.some(
					(price) => price.pricelist_id === priceListFilter
				)
			);
		}

		if (drugFilter) {
			filteredServices = filteredServices.filter((service) =>
				service.drugs?.some((drug) => {
					return drug.name.toLowerCase().includes(drugFilter);
				})
			);
		}

		this.renderServices(filteredServices);
	}

	private renderServices(services: Service[]): void {
		const tbody = document.getElementById("servicesTableBody")!;
		tbody.innerHTML = services
			.map(
				(service) => `
            <tr>
                <td>${this.escapeHtml(service.name)}</td>
                <td>
                    <span class="service-type-badge ${service.service_type}">
                        ${this.formatServiceType(service.service_type)}
                    </span>
                </td>
                <td>
                    <span class="feature-indicator ${
						service.auto_renew ? "enabled" : "disabled"
					}">
                        <i class="bi ${
							service.auto_renew
								? "bi-check-circle-fill text-success"
								: "bi-x-circle-fill text-danger"
						}"></i>
                        ${
							service.auto_renew
								? i18n.t("common.yes")
								: i18n.t("common.no")
						}
                    </span>
                </td>
                <td>
                    <span class="feature-indicator ${
						service.auto_add_on_admission ? "enabled" : "disabled"
					}">
                        <i class="bi ${
							service.auto_add_on_admission
								? "bi-check-circle-fill text-success"
								: "bi-x-circle-fill text-danger"
						}"></i>
                        ${
							service.auto_add_on_admission
								? i18n.t("common.yes")
								: i18n.t("common.no")
						}
                    </span>
                </td>
                <td>
                    ${this.renderPriceListBadges(service.prices)}
                </td>
				<td>
                    ${
						service.drugs
							?.map(
								(drug) => `
                        <span class="drug-badge">
                            ${this.escapeHtml(drug.name)}
                        </span>
                    `
							)
							.join("\n") || ""
					}
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline-primary" 
                                onclick="serviceManager.editService(${
									service.service_id
								})">
                            <i class="bi bi-pencil"></i> ${i18n.t(
								"common.edit"
							)}
                        </button>
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="serviceManager.deleteService(${
									service.service_id
								})">
                            <i class="bi bi-trash"></i> ${i18n.t(
								"common.delete"
							)}
                        </button>
                    </div>
                </td>
            </tr>
        `
			)
			.join("");
	}

	private renderPriceListBadges(prices: ServicePrice[]): string {
		return prices
			.map((price) => {
				const priceList = this.priceLists.find(
					(pl) => pl.pricelist_id === price.pricelist_id
				);
				if (!priceList) return "";

				return `
                <span class="price-list-badge" title="${this.formatPriceDetails(
					price
				)}">
                    ${this.escapeHtml(priceList.name)}: ${i18n.formatCurrency(
					Number(price.price)
				)}
                </span>
            `;
			})
			.join("\n");
	}

	private formatPriceDetails(price: ServicePrice): string {
		let details = `${i18n.t(
			"services.fields.price"
		)}: ${i18n.formatCurrency(Number(price.price))}`;
		if (price.requires_prepayment) {
			details += `\n${i18n.t("services.fields.prepaymentRequired")}: ${
				price.prepayment_type === "fixed"
					? i18n.formatCurrency(price.prepayment_amount || 0)
					: `${price.prepayment_amount}%`
			}`;
		}
		return details;
	}

	private formatServiceType(type: string): string {
		switch (type) {
			case "once":
				return i18n.t("services.serviceTypes.once");
			case "hourly":
				return i18n.t("services.serviceTypes.hourly");
			case "daily":
				return i18n.t("services.serviceTypes.daily");
			default:
				return type;
		}
	}

	private initializePriceListControls(): void {
		// Handle price list toggles
		document.querySelectorAll(".price-list-toggle").forEach((toggle) => {
			toggle.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				const priceListId = target.dataset.pricelistId;
				if (!priceListId) return;

				const controls = target
					.closest(".price-list-row")
					?.querySelector(".price-list-controls");
				const priceInput = document.querySelector(
					`input[name="price_${priceListId}"]`
				) as HTMLInputElement;
				const prepaymentToggle = document.getElementById(
					`prepayment_${priceListId}`
				) as HTMLInputElement;

				if (controls) {
					controls.classList.toggle("disabled", !target.checked);
				}

				const defaultPriceList = document.querySelector(
					".price-list-row.default-price-list .price-list-controls"
				);

				if (defaultPriceList) {
					defaultPriceList.classList.remove("disabled");
				}

				if (priceInput) {
					priceInput.disabled = !target.checked;
					priceInput.required = target.checked;
				}

				if (prepaymentToggle) {
					prepaymentToggle.disabled = !target.checked;
					if (!target.checked) {
						prepaymentToggle.checked = false;
						this.updatePrepaymentControls(priceListId, false);
					}
				}
			});
		});

		// Handle prepayment toggles
		document.querySelectorAll(".prepayment-toggle").forEach((toggle) => {
			toggle.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				const priceListId = target.id.split("_")[1];
				this.updatePrepaymentControls(priceListId, target.checked);
			});
		});
	}

	private updatePrepaymentControls(
		priceListId: string,
		enabled: boolean
	): void {
		const controls = document.getElementById(
			`prepaymentControls_${priceListId}`
		);
		const type = document.getElementById(
			`prepaymentType_${priceListId}`
		) as HTMLSelectElement;
		const amount = document.getElementById(
			`prepaymentAmount_${priceListId}`
		) as HTMLInputElement;

		if (controls) {
			controls.classList.toggle("show", enabled);
			controls.classList.toggle("disabled", !enabled);
		}

		if (type) {
			type.disabled = !enabled;
		}

		if (amount) {
			amount.disabled = !enabled;
		}
	}

	private async showServiceModal(serviceId?: number): Promise<void> {
		this.resetForm();
		const modalTitle = document.getElementById("serviceModalLabel")!;

		// Reset drug selection
		this.selectedDrugIds.clear();

		// Load drugs if not already loaded
		if (this.availableDrugs.length === 0) {
			await this.loadDrugs();
		}

		if (serviceId) {
			const service = this.services.find(
				(s) => s.service_id === serviceId
			);
			if (!service) return;

			modalTitle.textContent = i18n.t("services.modals.editService");
			this.populateForm(service);

			// Set selected drugs
			if (service.drugs) {
				service.drugs.forEach((drug) =>
					this.selectedDrugIds.add(drug.drug_id)
				);
				this.renderSelectedDrugs();
				this.renderAvailableDrugs();
			}
		} else {
			modalTitle.textContent = i18n.t("services.modals.createService");
			this.renderAvailableDrugs();
			this.renderSelectedDrugs();
		}

		// Remove disabled from default price list
		document
			.querySelector(
				".price-list-row.default-price-list .price-list-controls"
			)
			?.classList.remove("disabled");

		this.initializeDrugSearch();
		this.serviceModal.show();
	}

	private populateForm(service: Service): void {
		// Set basic fields
		(document.getElementById("serviceId") as HTMLInputElement).value =
			service.service_id.toString();
		(document.getElementById("serviceName") as HTMLInputElement).value =
			service.name;
		(document.getElementById("serviceType") as HTMLSelectElement).value =
			service.service_type;
		(document.getElementById("autoRenew") as HTMLInputElement).checked =
			service.auto_renew;
		(document.getElementById("autoAdd") as HTMLInputElement).checked =
			service.auto_add_on_admission;

		// Handle service type specific behavior
		const autoRenewCheckbox = document.getElementById(
			"autoRenew"
		) as HTMLInputElement;
		autoRenewCheckbox.disabled = service.service_type === "once";

		// Set prices
		service.prices.forEach((price) => {
			const priceList = this.priceLists.find(
				(pl) => pl.pricelist_id === price.pricelist_id
			);
			if (!priceList) return;

			// Handle include toggle for non-default price lists
			if (!priceList.is_default) {
				const includeToggle = document.getElementById(
					`include_${price.pricelist_id}`
				) as HTMLInputElement;
				if (includeToggle) {
					includeToggle.checked = true;
					const controls = includeToggle
						.closest(".price-list-row")
						?.querySelector(".price-list-controls");
					if (controls) {
						controls.classList.remove("disabled");
					}
				}
			}

			const priceInput = document.querySelector(
				`input[name="price_${price.pricelist_id}"]`
			) as HTMLInputElement;
			const prepaymentToggle = document.getElementById(
				`prepayment_${price.pricelist_id}`
			) as HTMLInputElement;

			if (priceInput) {
				priceInput.value = Number(price.price).toString();
				priceInput.disabled = false;
			}

			if (prepaymentToggle) {
				prepaymentToggle.checked = price.requires_prepayment;
				prepaymentToggle.disabled = false;
				this.updatePrepaymentControls(
					price.pricelist_id.toString(),
					price.requires_prepayment
				);

				if (price.requires_prepayment) {
					const prepaymentType = document.getElementById(
						`prepaymentType_${price.pricelist_id}`
					) as HTMLSelectElement;
					const prepaymentAmount = document.getElementById(
						`prepaymentAmount_${price.pricelist_id}`
					) as HTMLInputElement;

					if (prepaymentType && price.prepayment_type) {
						prepaymentType.value = price.prepayment_type;
						prepaymentType.disabled = false;
					}

					if (prepaymentAmount && price.prepayment_amount !== null) {
						prepaymentAmount.value =
							price.prepayment_amount.toString();
						prepaymentAmount.disabled = false;
					}
				}
			}
		});
	}

	private async handleSaveService(): Promise<void> {
		if (!this.validateForm()) return;

		const serviceId = (
			document.getElementById("serviceId") as HTMLInputElement
		).value;
		const serviceName = (
			document.getElementById("serviceName") as HTMLInputElement
		).value;
		const serviceType = (
			document.getElementById("serviceType") as HTMLSelectElement
		).value as "once" | "hourly" | "daily";
		const autoRenew = (
			document.getElementById("autoRenew") as HTMLInputElement
		).checked;
		const autoAdd = (document.getElementById("autoAdd") as HTMLInputElement)
			.checked;

		// Collect prices
		const prices = this.priceLists
			.filter((priceList) => {
				// Always include default price list
				if (priceList.is_default) return true;

				// For non-default price lists, check if they're included
				const includeToggle = document.getElementById(
					`include_${priceList.pricelist_id}`
				) as HTMLInputElement;
				return includeToggle && includeToggle.checked;
			})
			.map((priceList) => {
				const priceInput = document.querySelector(
					`input[name="price_${priceList.pricelist_id}"]`
				) as HTMLInputElement;
				const prepaymentToggle = document.getElementById(
					`prepayment_${priceList.pricelist_id}`
				) as HTMLInputElement;
				const prepaymentType = document.getElementById(
					`prepaymentType_${priceList.pricelist_id}`
				) as HTMLSelectElement;
				const prepaymentAmount = document.getElementById(
					`prepaymentAmount_${priceList.pricelist_id}`
				) as HTMLInputElement;

				return {
					pricelist_id: priceList.pricelist_id,
					price: parseFloat(priceInput.value),
					requires_prepayment: prepaymentToggle.checked,
					...(prepaymentToggle.checked && {
						prepayment_type: prepaymentType.value as
							| "fixed"
							| "percentage",
						prepayment_amount: parseFloat(prepaymentAmount.value)
					})
				};
			});

		const serviceData = {
			...(serviceId ? { service_id: parseInt(serviceId) } : {}),
			name: serviceName,
			service_type: serviceType,
			auto_renew: autoRenew,
			auto_add_on_admission: autoAdd,
			prices,
			drugs: Array.from(this.selectedDrugIds)
		};

		try {
			this.setLoading(true);

			const response = await fetch(
				`/api/services${serviceId ? `/${serviceId}` : ""}`,
				{
					method: serviceId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(serviceData)
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to save service");
			}

			await this.loadServices();
			this.serviceModal.hide();

			Swal.fire({
				icon: "success",
				title: i18n.t("common.success"),
				text: serviceId
					? i18n.t("services.messages.updateSuccess")
					: i18n.t("services.messages.createSuccess"),
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error saving service:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("services.messages.saveError")
			);
		} finally {
			this.setLoading(false);
		}
	}

	public async deleteService(serviceId: number): Promise<void> {
		try {
			const result = await Swal.fire({
				title: i18n.t("services.messages.deleteConfirmTitle"),
				text: i18n.t("services.messages.deleteConfirmText"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("common.yes"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (result.isConfirmed) {
				const response = await fetch(`/api/services/${serviceId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});

				if (!response.ok) {
					throw new Error("Failed to delete service");
				}

				await this.loadServices();

				Swal.fire({
					icon: "success",
					title: i18n.t("common.success"),
					text: i18n.t("services.messages.deleteSuccess"),
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});
			}
		} catch (error) {
			console.error("Error deleting service:", error);
			this.showError(i18n.t("services.messages.deleteError"));
		}
	}

	public editService(serviceId: number): void {
		this.showServiceModal(serviceId);
	}

	private validateForm(): boolean {
		this.serviceForm.classList.add("was-validated");

		// Check basic form validity
		if (!this.serviceForm.checkValidity()) {
			return false;
		}

		// Additional validation for prepayment amounts
		const prepaymentToggles = document.querySelectorAll(
			".prepayment-toggle:checked"
		);
		//@ts-ignore
		for (const toggle of prepaymentToggles) {
			const priceListId = (toggle as HTMLInputElement).id.split("_")[1];
			const amountInput = document.getElementById(
				`prepaymentAmount_${priceListId}`
			) as HTMLInputElement;
			const typeSelect = document.getElementById(
				`prepaymentType_${priceListId}`
			) as HTMLSelectElement;

			if (!amountInput.value) {
				this.showError(
					i18n.t("services.validation.prepaymentAmountRequired")
				);
				return false;
			}

			const amount = parseFloat(amountInput.value);
			if (
				typeSelect.value === "percentage" &&
				(amount < 0 || amount > 100)
			) {
				this.showError(
					i18n.t("services.validation.prepaymentPercentageRange")
				);
				return false;
			}
		}

		return true;
	}

	private resetForm(): void {
		this.serviceForm.reset();
		this.serviceForm.classList.remove("was-validated");
		(document.getElementById("serviceId") as HTMLInputElement).value = "";

		// Reset price inputs
		document
			.querySelectorAll(`input.price-list-toggle`)
			.forEach((toggle) => {
				(toggle as HTMLInputElement).checked = false;
			});

		document
			.querySelectorAll(`:not(.default-price-list) .price-list-controls`)
			.forEach((control) => {
				control.classList.add("disabled");
			});

		// Reset prepayment controls
		document.querySelectorAll(".prepayment-controls").forEach((control) => {
			control.classList.remove("show");
		});

		// Enable auto-renew checkbox
		(document.getElementById("autoRenew") as HTMLInputElement).disabled =
			false;

		this.selectedDrugIds.clear();
		if (this.availableDrugs.length > 0) {
			this.renderAvailableDrugs();
			this.renderSelectedDrugs();
		}

		const drugSearch = document.getElementById(
			"drugSearch"
		) as HTMLInputElement;
		if (drugSearch) {
			drugSearch.value = "";
		}
	}

	private setLoading(loading: boolean): void {
		const spinner = this.saveButton.querySelector(".spinner-border")!;
		const buttonText = this.saveButton.querySelector(".btn-text")!;
		this.saveButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("services.buttons.saving")
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
		serviceManager: ServiceManager;
	}
}

(window.serviceManager as ServiceManager) = new ServiceManager();
