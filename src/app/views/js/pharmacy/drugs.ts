//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

interface UnitConversion {
	larger: string;
	smaller: string;
	ratio: number;
}

interface DrugCard {
	drug_id: number;
	name: string;
	manufacturer: string | null;
	provider: string | null;
	is_obligatory_continuous: boolean;
	sale_quantity: number;
	frequency: { hours: number } | null;
	min_stock_alert: number | null;
	max_days_expiry_alert: number | null;
	unit_conversion: UnitConversion;
}

interface ShipmentPrice {
	pricelist_id: number;
	price: string;
	requires_prepayment: boolean;
	prepayment_type: "fixed" | "percentage" | null;
	prepayment_amount: number | null;
}

interface DrugShipment {
	shipment_id: number;
	drug_id: number;
	warehouse_id: number;
	quantity: number;
	buy_price: string;
	expiry_date: string;
	received_date: string;
	warehouse_name: string;
	prices: ShipmentPrice[];
}

interface PriceList {
	pricelist_id: number;
	name: string;
	is_default: boolean;
}

interface Patient {
	patient_id: number;
	name: string;
	is_active: boolean;
}

interface DrugStock {
	total_quantity: number;
	nearest_expiry: string | null;
	shipments: DrugShipment[];
}

interface Warehouse {
	warehouse_id: number;
	name: string;
	location: string;
	total_shipments?: number;
	total_drugs?: number;
	total_stock_value?: number;
}

class DrugManager {
	//@ts-ignore
	private drugModal: Modal;
	//@ts-ignore
	private sellModal: Modal;
	//@ts-ignore
	private warehouseModal: Modal;
	//@ts-ignore
	private addWarehouseModal: Modal;

	private drugForm: HTMLFormElement;
	private sellForm: HTMLFormElement;
	private saveDrugButton: HTMLButtonElement;
	private confirmSellButton: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private drugs: Map<number, DrugCard> = new Map();
	private drugStocks: Map<number, DrugStock> = new Map();
	private expandedDrugs: Set<number> = new Set();
	private priceLists: PriceList[] = [];
	private activePatients: Patient[] = [];
	private currentShipment: DrugShipment | null = null;
	//@ts-ignore
	private shipmentModal: Modal;
	private shipmentForm: HTMLFormElement;
	private saveShipmentButton: HTMLButtonElement;
	private currentDrug: DrugCard | null = null;
	private warehouses: Warehouse[] = [];
	private saveWarehouseButton: HTMLButtonElement;
	private warehouseForm: HTMLFormElement;
	private userPermissions: string[] = [];
	private userRole: string = "";

	constructor() {
		// Initialize modals
		const drugModalElement = document.getElementById("drugModal")!;
		const sellModalElement = document.getElementById("sellDrugModal")!;
		const warehouseModalElement =
			document.getElementById("warehouseModal")!;
		const addWarehouseModalElement =
			document.getElementById("addWarehouseModal")!;

		//@ts-ignore
		this.drugModal = new bootstrap.Modal(drugModalElement);
		//@ts-ignore
		this.sellModal = new bootstrap.Modal(sellModalElement);
		//@ts-ignore
		this.warehouseModal = new bootstrap.Modal(warehouseModalElement);
		//@ts-ignore
		this.addWarehouseModal = new bootstrap.Modal(addWarehouseModalElement);

		// Initialize form elements
		this.drugForm = document.getElementById("drugForm") as HTMLFormElement;
		this.sellForm = document.getElementById(
			"sellDrugForm"
		) as HTMLFormElement;
		this.saveDrugButton = document.getElementById(
			"saveDrugBtn"
		) as HTMLButtonElement;
		this.confirmSellButton = document.getElementById(
			"confirmSellBtn"
		) as HTMLButtonElement;
		this.searchInput = document.getElementById(
			"searchDrug"
		) as HTMLInputElement;

		const shipmentModalElement = document.getElementById("shipmentModal")!;
		//@ts-ignore
		this.shipmentModal = new bootstrap.Modal(shipmentModalElement);
		this.shipmentForm = document.getElementById(
			"shipmentForm"
		) as HTMLFormElement;
		this.saveShipmentButton = document.getElementById(
			"saveShipmentBtn"
		) as HTMLButtonElement;

		this.warehouseForm = document.getElementById(
			"warehouseForm"
		) as HTMLFormElement;

		// Add after existing button initializations
		this.saveWarehouseButton = document.getElementById(
			"saveWarehouseBtn"
		) as HTMLButtonElement;

		// Add to initializeEventListeners
		this.saveShipmentButton.addEventListener("click", () => {
			this.handleSaveShipment();
		});

		this.waitForI18n().then(() => {
			// Initialize sidebar
			new SidebarManager();

			this.loadUser();
			this.loadWarehouses();
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
		this.renderDrugs();
		this.renderWarehousesTable();
	}

	private async loadInitialData(): Promise<void> {
		try {
			await Promise.all([
				this.loadDrugs(),
				this.loadPriceLists(),
				this.loadWarehouses()
			]);
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError(i18n.t("pharmacy.messages.loadInitialDataError"));
		}
	}

	private initializeEventListeners(): void {
		document
			.getElementById("createDrugBtn")
			?.addEventListener("click", () => {
				this.showDrugModal();
			});

		this.saveDrugButton.addEventListener("click", () => {
			this.handleSaveDrug();
		});

		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.filterDrugs();
			}, 300)
		);

		document
			.getElementById("manageWarehousesBtn")
			?.addEventListener("click", () => {
				this.showWarehouseModal();
			});

		document
			.getElementById("addWarehouseBtn")
			?.addEventListener("click", () => {
				this.showAddWarehouseModal();
			});

		this.saveWarehouseButton.addEventListener("click", () => {
			this.handleSaveWarehouse();
		});

		const addWarehouseModalElement =
			document.getElementById("addWarehouseModal")!;
		addWarehouseModalElement.addEventListener("hidden.bs.modal", () => {
			this.resetWarehouseForm();
		});

		const drugModalElement = document.getElementById("drugModal")!;
		drugModalElement.addEventListener("hidden.bs.modal", () => {
			this.resetDrugForm();
		});

		const sellModalElement = document.getElementById("sellDrugModal")!;
		sellModalElement.addEventListener("hidden.bs.modal", () => {
			this.resetSellForm();
		});

		document
			.getElementById("transactionType")
			?.addEventListener("change", (e) => {
				const target = e.target as HTMLSelectElement;
				const patientContainer = document.querySelector(
					".patient-select-container"
				);
				const patientSelect = document.getElementById(
					"patientSelect"
				) as HTMLSelectElement;

				if (target.value === "patient") {
					patientContainer?.classList.remove("d-none");
					patientSelect.required = true;
					this.loadActivePatients();
				} else {
					patientContainer?.classList.add("d-none");
					patientSelect.required = false;
				}
			});

		document
			.getElementById("sellQuantityLarger")
			?.addEventListener("input", () => {
				this.updateTotalPrice();
			});

		document
			.getElementById("sellQuantitySmaller")
			?.addEventListener("input", () => {
				this.updateTotalPrice();
			});

		document.getElementById("priceList")?.addEventListener("change", () => {
			this.updateTotalPrice();
		});

		this.confirmSellButton.addEventListener("click", () => {
			this.handleSellDrug();
		});

		["largerUnit", "smallerUnit", "conversionRatio"].forEach((id) => {
			document.getElementById(id)?.addEventListener("input", () => {
				this.updateUnitConversionPreview();
			});
		});
	}

	private async loadUser(): Promise<void> {
		try {
			const userString = localStorage.getItem("user");
			if (!userString) return;

			const user = JSON.parse(userString);
			this.userPermissions = user.permissions;
			this.userRole = user.role;
		} catch (error) {
			this.showError(i18n.t("employees.messages.loadError"));
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

			const drugs: DrugCard[] = await response.json();
			this.drugs.clear();
			drugs.forEach((drug) => this.drugs.set(drug.drug_id, drug));

			await this.loadDrugStocks();
			this.renderDrugs();
		} catch (error) {
			console.error("Error loading drugs:", error);
			this.showError(i18n.t("pharmacy.messages.loadDrugsError"));
		}
	}

	private async loadDrugStocks(): Promise<void> {
		try {
			for (const drugId of this.drugs.keys()) {
				const response = await fetch(
					`/api/pharmacy/drugs/shipments/drug/${drugId}`,
					{
						headers: {
							Authorization: `Bearer ${localStorage.getItem(
								"token"
							)}`
						}
					}
				);

				if (!response.ok)
					throw new Error(`Failed to fetch stock for drug ${drugId}`);

				const shipments: DrugShipment[] = await response.json();

				const totalQuantity = shipments.reduce(
					(sum, shipment) => sum + shipment.quantity,
					0
				);
				const validShipments = shipments.filter((s) => s.quantity > 0);
				const nearestExpiry =
					validShipments.length > 0
						? validShipments.reduce((nearest, shipment) => {
								return !nearest ||
									new Date(shipment.expiry_date) <
										new Date(nearest)
									? shipment.expiry_date
									: nearest;
						  }, null as string | null)
						: null;

				this.drugStocks.set(drugId, {
					total_quantity: totalQuantity,
					nearest_expiry: nearestExpiry,
					shipments: shipments
				});
			}
		} catch (error) {
			console.error("Error loading drug stocks:", error);
			this.showError(i18n.t("pharmacy.messages.loadStocksError"));
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
			this.updatePriceListSelect();
		} catch (error) {
			console.error("Error loading price lists:", error);
			this.showError(i18n.t("pharmacy.messages.loadPriceListsError"));
		}
	}

	private async loadActivePatients(): Promise<void> {
		try {
			const response = await fetch("/api/patients/active", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok)
				throw new Error("Failed to fetch active patients");

			this.activePatients = await response.json();
			this.updatePatientSelect();
		} catch (error) {
			console.error("Error loading active patients:", error);
			this.showError(i18n.t("pharmacy.messages.loadPatientsError"));
		}
	}

	private updatePriceListSelect(): void {
		const select = document.getElementById(
			"priceList"
		) as HTMLSelectElement;
		select.innerHTML = this.priceLists
			.map(
				(list) => `
            <option value="${list.pricelist_id}">
                ${this.escapeHtml(list.name)}
            </option>
        `
			)
			.join("");

		const defaultPriceList = this.priceLists.find(
			(list) => list.is_default
		);
		if (defaultPriceList) {
			select.value = defaultPriceList.pricelist_id.toString();
		}
	}

	private updatePatientSelect(): void {
		const select = document.getElementById(
			"patientSelect"
		) as HTMLSelectElement;
		select.innerHTML = this.activePatients.length
			? this.activePatients
					.map(
						(patient) => `
                <option value="${patient.patient_id}">
                    ${this.escapeHtml(patient.name)}
                </option>
            `
					)
					.join("")
			: `<option value="">${i18n.t(
					"pharmacy.messages.noActivePatients"
			  )}</option>`;
	}

	private renderDrugs(filterTerm: string = ""): void {
		const tbody = document.getElementById("drugsTableBody")!;
		const filteredDrugs = Array.from(this.drugs.values()).filter(
			(drug) =>
				drug.name.toLowerCase().includes(filterTerm.toLowerCase()) ||
				drug.manufacturer
					?.toLowerCase()
					.includes(filterTerm.toLowerCase()) ||
				drug.provider?.toLowerCase().includes(filterTerm.toLowerCase())
		);

		tbody.innerHTML = filteredDrugs
			.map((drug) => {
				const stock = this.drugStocks.get(drug.drug_id);
				const isExpanded = this.expandedDrugs.has(drug.drug_id);
				const totalQuantity = stock?.total_quantity || 0;
				const largerQuantity = Math.floor(
					totalQuantity / drug.unit_conversion.ratio
				);
				const smallerQuantity =
					totalQuantity % drug.unit_conversion.ratio;

				let expiryClass = "";
				let daysUntilExpiry = 0;
				if (stock?.nearest_expiry) {
					daysUntilExpiry = Math.ceil(
						(new Date(stock.nearest_expiry).getTime() -
							new Date().getTime()) /
							(1000 * 60 * 60 * 24)
					);
					if (daysUntilExpiry <= (drug.max_days_expiry_alert || 30)) {
						expiryClass =
							daysUntilExpiry <= 7 ? "danger" : "warning";
					}
				}

				return `
                <tr class="drug-row ${
					isExpanded ? "expanded" : ""
				}" data-drug-id="${drug.drug_id}">
                    <td>
                        <button class="toggle-shipments ${
							isExpanded ? "expanded" : ""
						}" 
                                onclick="drugManager.toggleShipments(${
									drug.drug_id
								})">
                            <i class="bi bi-chevron-down"></i>
                        </button>
                    </td>
                    <td>${this.escapeHtml(drug.name)}</td>
                    <td>${this.escapeHtml(drug.manufacturer || "-")}</td>
                    <td>${this.escapeHtml(drug.provider || "-")}</td>
					<td>
                	    <span class="feature-indicator ${
							drug.is_obligatory_continuous
								? "enabled"
								: "disabled"
						}">
                	        <i class="bi ${
								drug.is_obligatory_continuous
									? "bi-check-circle-fill"
									: "bi-x-circle-fill"
							}"></i>
                	        ${
								drug.is_obligatory_continuous
									? i18n.t("common.yes")
									: i18n.t("common.no")
							}
                	    </span>
                	    ${
							drug.frequency
								? `<small class="d-block text-muted">${i18n.t(
										"pharmacy.frequency.every"
								  )} ${drug.frequency.hours} ${i18n.t(
										"pharmacy.frequency.hours"
								  )}</small>`
								: ""
						}
                	</td>
                    <td>
                        <div class="stock-display">
                            <span class="stock-quantity">
                                ${largerQuantity} ${drug.unit_conversion.larger}
                                ${
									smallerQuantity > 0
										? ` + ${smallerQuantity} ${drug.unit_conversion.smaller}`
										: ""
								}
                            </span>
                            ${
								totalQuantity < (drug.min_stock_alert || 0)
									? `<span class="badge bg-danger">${i18n.t(
											"pharmacy.status.lowStock"
									  )}</span>`
									: ""
							}
                        </div>
                    </td>
                    <td>
                        ${
							stock?.nearest_expiry
								? `
                            <div class="expiry-date ${expiryClass}">
                                <i class="bi bi-calendar-event"></i>
                                ${i18n.formatDate(stock.nearest_expiry)}
                                ${
									expiryClass
										? `(${i18n.t("pharmacy.daysRemaining", {
												days: daysUntilExpiry
										  })})`
										: ""
								}
                            </div>
                        `
								: "-"
						}
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="drugManager.editDrug(${
										drug.drug_id
									})">
                                <i class="bi bi-pencil"></i> ${i18n.t(
									"common.edit"
								)}
                            </button>
                            <button class="btn btn-sm btn-outline-danger" 
                                    onclick="drugManager.deleteDrug(${
										drug.drug_id
									})">
                                <i class="bi bi-trash"></i> ${i18n.t(
									"common.delete"
								)}
                            </button>
                        </div>
                    </td>
                </tr>
                ${
					isExpanded
						? this.renderShipmentRows(drug, stock?.shipments || [])
						: ""
				}
            `;
			})
			.join("");
	}

	private renderShipmentRows(
		drug: DrugCard,
		shipments: DrugShipment[]
	): string {
		if (shipments.length === 0) {
			return `
	        	<tr class="shipment-rows">
	        	    <td colspan="8" class="text-center py-3">
	        	        <div class="text-muted mb-3">${i18n.t(
							"pharmacy.messages.noShipments"
						)}</div>
	        	        <button class="btn btn-sm btn-primary" 
	        	                onclick="drugManager.showShipmentModal(${
									drug.drug_id
								})">
		        	            <i class="bi bi-plus-circle"></i> ${i18n.t(
									"pharmacy.buttons.addShipment"
								)}
	        	        </button>
	        	    </td>
	        	</tr>
	        `;
		}

		let rows = shipments.map((shipment) => {
			const quantityInLarger = Math.floor(
				shipment.quantity / drug.unit_conversion.ratio
			);
			const quantityInSmaller =
				shipment.quantity % drug.unit_conversion.ratio;

			return `
		            <tr class="shipment-rows">
		                <td colspan="8">
		                    <div class="shipment-detail">
		                        <div class="row align-items-center justify-content-between">
		                            <div class="col-md-2">
		                                <strong>${i18n.t(
											"pharmacy.fields.warehouse"
										)}:</strong> ${this.escapeHtml(
				shipment.warehouse_name
			)}
		                            </div>
									<div class="col-md-2">
										<strong>${i18n.t("pharmacy.fields.buyPrice")}:</strong> ${i18n.formatCurrency(
				parseFloat(shipment.buy_price)
			)}
									</div>
		                            <div class="col-md-2">
		                                <strong>${i18n.t(
											"pharmacy.fields.quantity"
										)}:</strong> 
		                                ${quantityInLarger} ${
				drug.unit_conversion.larger
			}
		                                ${
											quantityInSmaller > 0
												? ` + ${quantityInSmaller} ${drug.unit_conversion.smaller}`
												: ""
										}
		                            </div>
		                            <div class="col-md-2">
		                                <strong>${i18n.t(
											"pharmacy.fields.expiry"
										)}:</strong> 
		                                ${i18n.formatDate(shipment.expiry_date)}
		                            </div>
		                            <div class="col-md-2">
		                                <div class="btn-group btn-group-sm" role="group" aria-label="${i18n.t(
											"pharmacy.shipmentActions"
										)}">
		                                    <button class="btn btn-success" 
		                                            onclick="drugManager.showSellModal(${
														shipment.shipment_id
													})"
		                                            ${
														shipment.quantity === 0
															? "disabled"
															: ""
													}
		                                            title="${i18n.t(
														"pharmacy.buttons.sell"
													)}">
		                                        <i class="bi bi-cart"></i> ${i18n.t(
													"pharmacy.buttons.sell"
												)}
		                                    </button>
											${
												this.userPermissions.includes(
													"manage_shipments"
												)
													? `
		                                    <button class="btn btn-primary" data-requires-permission="manage_shipments"
		                                            onclick="drugManager.showShipmentModal(${
														drug.drug_id
													}, ${shipment.shipment_id})"
		                                            title="${i18n.t("common.edit")}">
		                                        <i class="bi bi-pencil"></i> ${i18n.t(
													"common.edit"
												)}
		                                    </button>`
													: ""
											}
		                                    <button class="btn btn-danger" 
		                                            onclick="drugManager.deleteShipment(${
														shipment.shipment_id
													}, ${drug.drug_id})"
		                                            title="${i18n.t("common.delete")}">
		                                        <i class="bi bi-trash"></i> ${i18n.t(
													"common.delete"
												)}
		                                    </button>
		                                </div>
		                            </div>
		                        </div>
		                        <div class="mt-2">
		                            <strong>${i18n.t(
										"pharmacy.fields.prices"
									)}:</strong>
		                            ${shipment.prices
										.map((price) => {
											const priceList =
												this.priceLists.find(
													(pl) =>
														pl.pricelist_id ===
														price.pricelist_id
												);
											return `
		                                	    <span class="price-badge">
		                                	    ${this.escapeHtml(priceList?.name || "")}: 
		                                	    ${i18n.formatCurrency(
													parseFloat(price.price)
												)}
		                                	    ${
													price.requires_prepayment
														? `
		                                	        <small class="ms-1">
		                                	            (${i18n.t(
															"pharmacy.fields.prepayment"
														)}: ${
																price.prepayment_type ===
																"fixed"
																	? i18n.formatCurrency(
																			price.prepayment_amount ||
																				0
																	  )
																	: `${price.prepayment_amount}%`
														  })
		                                	        </small>
		                                	    `
														: ""
												}
		                                	</span>
		                                `;
										})
										.join("")}
		                        </div>
		                    </div>
		                </td>
		            </tr>
		        `;
		});

		rows.push(`
		    <tr class="shipment-rows">
		        <td colspan="8" class="text-center py-2">
		            <button class="btn btn-sm btn-outline-primary" 
		                    onclick="drugManager.showShipmentModal(${drug.drug_id})">
		                <i class="bi bi-plus-circle"></i> ${i18n.t(
							"pharmacy.buttons.addShipment"
						)}
		            </button>
		        </td>
		    </tr>
		`);

		return rows.join("");
	}

	public toggleShipments(drugId: number): void {
		if (this.expandedDrugs.has(drugId)) {
			this.expandedDrugs.delete(drugId);
		} else {
			this.expandedDrugs.add(drugId);
		}
		this.renderDrugs(this.searchInput.value);
	}

	private filterDrugs(): void {
		this.renderDrugs(this.searchInput.value);
	}

	private showDrugModal(drugId?: number): void {
		this.resetDrugForm();
		const modalTitle = document.getElementById("drugModalLabel")!;

		if (drugId) {
			const drug = this.drugs.get(drugId);
			if (!drug) return;

			modalTitle.textContent = i18n.t("pharmacy.modals.editDrug");
			this.populateDrugForm(drug);
		} else {
			modalTitle.textContent = i18n.t("pharmacy.modals.createDrug");
		}

		this.drugModal.show();
	}

	private populateDrugForm(drug: DrugCard): void {
		(document.getElementById("drugId") as HTMLInputElement).value =
			drug.drug_id.toString();
		(document.getElementById("drugName") as HTMLInputElement).value =
			drug.name;
		(document.getElementById("manufacturer") as HTMLInputElement).value =
			drug.manufacturer || "";
		(document.getElementById("provider") as HTMLInputElement).value =
			drug.provider || "";
		(document.getElementById("saleQuantity") as HTMLInputElement).value =
			drug.sale_quantity.toString();
		(document.getElementById("largerUnit") as HTMLInputElement).value =
			drug.unit_conversion.larger;
		(document.getElementById("smallerUnit") as HTMLInputElement).value =
			drug.unit_conversion.smaller;
		(document.getElementById("conversionRatio") as HTMLInputElement).value =
			drug.unit_conversion.ratio.toString();
		(document.getElementById("minStockAlert") as HTMLInputElement).value =
			drug.min_stock_alert?.toString() || "";
		(document.getElementById("maxDaysExpiry") as HTMLInputElement).value =
			drug.max_days_expiry_alert?.toString() || "";
		(
			document.getElementById(
				"isObligatoryContinuous"
			) as HTMLInputElement
		).checked = drug.is_obligatory_continuous;
		(document.getElementById("frequency") as HTMLInputElement).value =
			drug.frequency?.hours.toString()
				? drug.frequency!.hours.toString() + " hours"
				: "";

		this.updateUnitConversionPreview();
	}

	private async handleSaveDrug(): Promise<void> {
		if (!this.validateDrugForm()) return;

		const drugId = (document.getElementById("drugId") as HTMLInputElement)
			.value;
		const drugData = {
			...(drugId ? { drug_id: parseInt(drugId) } : {}),
			name: (document.getElementById("drugName") as HTMLInputElement)
				.value,
			manufacturer:
				(document.getElementById("manufacturer") as HTMLInputElement)
					.value || null,
			provider:
				(document.getElementById("provider") as HTMLInputElement)
					.value || null,
			sale_quantity: parseInt(
				(document.getElementById("saleQuantity") as HTMLInputElement)
					.value
			),
			unit_conversion: {
				larger: (
					document.getElementById("largerUnit") as HTMLInputElement
				).value,
				smaller: (
					document.getElementById("smallerUnit") as HTMLInputElement
				).value,
				ratio: parseInt(
					(
						document.getElementById(
							"conversionRatio"
						) as HTMLInputElement
					).value
				)
			},
			min_stock_alert: (
				document.getElementById("minStockAlert") as HTMLInputElement
			).value
				? parseInt(
						(
							document.getElementById(
								"minStockAlert"
							) as HTMLInputElement
						).value
				  )
				: null,
			max_days_expiry_alert: (
				document.getElementById("maxDaysExpiry") as HTMLInputElement
			).value
				? parseInt(
						(
							document.getElementById(
								"maxDaysExpiry"
							) as HTMLInputElement
						).value
				  )
				: null,
			is_obligatory_continuous: (
				document.getElementById(
					"isObligatoryContinuous"
				) as HTMLInputElement
			).checked,
			frequency: +(
				document.getElementById("frequency") as HTMLInputElement
			).value
				? (document.getElementById("frequency") as HTMLInputElement)
						.value + " hours"
				: null
		};

		try {
			this.setDrugLoading(true);

			const response = await fetch(
				`/api/pharmacy/drugs/cards${drugId ? `/${drugId}` : ""}`,
				{
					method: drugId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(drugData)
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to save drug");
			}

			await this.loadDrugs();
			this.drugModal.hide();

			Swal.fire({
				icon: "success",
				title: i18n.t("common.success"),
				text: drugId
					? i18n.t("pharmacy.messages.updateSuccess")
					: i18n.t("pharmacy.messages.createSuccess"),
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error saving drug:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("pharmacy.messages.saveError")
			);
		} finally {
			this.setDrugLoading(false);
		}
	}

	public async deleteDrug(drugId: number): Promise<void> {
		try {
			const drug = this.drugs.get(drugId);
			if (!drug) return;

			const stock = this.drugStocks.get(drugId);
			let warningMessage = i18n.t("pharmacy.messages.deleteConfirmText");
			if (stock && stock.total_quantity > 0) {
				warningMessage = i18n.t(
					"pharmacy.messages.deleteWithStockWarning",
					{
						quantity: stock.total_quantity
					}
				);
			}

			const result = await Swal.fire({
				title: i18n.t("pharmacy.messages.deleteConfirmTitle"),
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
					`/api/pharmacy/drugs/cards/${drugId}`,
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
					throw new Error("Failed to delete drug");
				}

				await this.loadDrugs();

				Swal.fire({
					icon: "success",
					title: i18n.t("common.success"),
					text: i18n.t("pharmacy.messages.deleteSuccess"),
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});
			}
		} catch (error) {
			console.error("Error deleting drug:", error);
			this.showError(i18n.t("pharmacy.messages.deleteError"));
		}
	}

	public editDrug(drugId: number): void {
		this.showDrugModal(drugId);
	}

	public async showSellModal(shipmentId: number): Promise<void> {
		try {
			const response = await fetch(
				`/api/pharmacy/drugs/shipments/${shipmentId}`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok)
				throw new Error("Failed to fetch shipment details");

			this.currentShipment = await response.json();

			if (!this.currentShipment) throw new Error("Shipment not found");

			const drug = this.drugs.get(this.currentShipment.drug_id);
			if (!drug) throw new Error("Drug not found");

			// Update labels with translated text
			const sellQuantityLargerLabel = document.getElementById(
				"sellQuantityLargerLabel"
			)!;
			sellQuantityLargerLabel.textContent =
				drug.unit_conversion.larger +
				" " +
				i18n.t("pharmacy.fields.quantity");

			const sellQuantitySmallerLabel = document.getElementById(
				"sellQuantitySmallerLabel"
			)!;
			sellQuantitySmallerLabel.textContent =
				drug.unit_conversion.smaller +
				" " +
				i18n.t("pharmacy.fields.quantity");

			// Update available quantity display
			const quantityInLarger = Math.floor(
				this.currentShipment.quantity / drug.unit_conversion.ratio
			);
			const quantityInSmaller =
				this.currentShipment.quantity % drug.unit_conversion.ratio;

			const availableQuantityLargerSpan = document.getElementById(
				"availableQuantityLarger"
			)!;
			availableQuantityLargerSpan.textContent = `${quantityInLarger} ${drug.unit_conversion.larger}`;

			const availableQuantitySmallerSpan = document.getElementById(
				"availableQuantitySmaller"
			)!;
			availableQuantitySmallerSpan.textContent = `${
				quantityInLarger * drug.unit_conversion.ratio +
				quantityInSmaller
			} ${drug.unit_conversion.smaller}`;

			// Update quantity unit labels
			const quantityUnitLarger =
				document.getElementById("quantityUnitLarger")!;
			quantityUnitLarger.textContent = drug.unit_conversion.larger;

			const quantityUnitSmaller = document.getElementById(
				"quantityUnitSmaller"
			)!;
			quantityUnitSmaller.textContent = drug.unit_conversion.smaller;

			// Reset form
			this.resetSellForm();
			this.sellModal.show();
		} catch (error) {
			console.error("Error showing sell modal:", error);
			this.showError(i18n.t("pharmacy.messages.loadShipmentError"));
		}
	}

	private async handleSellDrug(): Promise<void> {
		if (!this.validateSellForm()) return;
		if (!this.currentShipment) return;

		const currentDrug = this.drugs.get(this.currentShipment.drug_id);
		if (!currentDrug) return;

		const transactionType = (
			document.getElementById("transactionType") as HTMLSelectElement
		).value;
		const quantity =
			parseInt(
				(
					document.getElementById(
						"sellQuantityLarger"
					) as HTMLInputElement
				).value
			) *
				(currentDrug.unit_conversion.ratio || 1) +
			parseInt(
				(
					document.getElementById(
						"sellQuantitySmaller"
					) as HTMLInputElement
				).value
			);

		const patientId =
			transactionType === "patient"
				? parseInt(
						(
							document.getElementById(
								"patientSelect"
							) as HTMLSelectElement
						).value
				  )
				: null;

		const drug = this.drugs.get(this.currentShipment.drug_id);
		if (!drug) return;

		if (quantity > this.currentShipment.quantity) {
			this.showError(i18n.t("pharmacy.validation.insufficientQuantity"));
			return;
		}

		const totalPrice = Number(
			(document.getElementById("totalPrice") as HTMLInputElement).value
		);

		if (!totalPrice) {
			this.showError(i18n.t("pharmacy.validation.invalidPrice"));
			return;
		}

		// Check if price is less than buy price
		if (
			totalPrice / quantity <
			parseFloat(this.currentShipment.buy_price)
		) {
			const result = await Swal.fire({
				title: i18n.t("common.warning"),
				text: i18n.t("pharmacy.messages.priceBelowBuyPrice"),
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("common.yes"),
				cancelButtonText: i18n.t("common.cancel")
			});

			if (!result.isConfirmed) return;
		}

		try {
			this.setSellLoading(true);

			const response = await fetch("/api/pharmacy/drugs/transactions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				},
				body: JSON.stringify({
					shipment_id: this.currentShipment.shipment_id,
					transaction_type: transactionType,
					quantity: quantity,
					price: totalPrice * quantity,
					patient_id: patientId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to process sale");
			}

			await this.loadDrugs();
			this.sellModal.hide();

			Swal.fire({
				icon: "success",
				title: i18n.t("common.success"),
				text: i18n.t("pharmacy.messages.saleSuccess"),
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error processing sale:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("pharmacy.messages.saleError")
			);
		} finally {
			this.setSellLoading(false);
		}
	}

	private async loadWarehouses(): Promise<void> {
		try {
			const response = await fetch("/api/warehouse", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch warehouses");

			this.warehouses = await response.json();
			this.updateWarehouseSelect();
		} catch (error) {
			console.error("Error loading warehouses:", error);
			this.showError("Failed to load warehouses");
		}
	}

	private updateWarehouseSelect(): void {
		const select = document.getElementById(
			"warehouseSelect"
		) as HTMLSelectElement;
		select.innerHTML =
			`<option value="">${i18n.t(
				"pharmacy.placeholders.selectWarehouse"
			)}</option>` +
			this.warehouses
				.map(
					(warehouse) => `
            <option value="${warehouse.warehouse_id}">
                ${this.escapeHtml(warehouse.name)}
            </option>
        `
				)
				.join("");
	}

	private renderPriceListInputs(): void {
		const container = document.getElementById("priceListContainer")!;
		container.innerHTML = this.priceLists
			.map(
				(priceList) => `
        <div class="price-list-input mb-3" data-pricelist-id="${
			priceList.pricelist_id
		}">
            <div class="row align-items-end">
                <div class="col-md-4">
                    <label class="form-label">
                        ${this.escapeHtml(priceList.name)}
                        ${
							priceList.is_default
								? `<span class="badge bg-primary ms-1">${i18n.t(
										"pharmacy.status.default"
								  )}</span>`
								: ""
						}
                    </label>
                    <div class="input-group">
                        <span class="input-group-text">${i18n.t(
							"common.currency"
						)}</span>
                        <input type="number" 
                               class="form-control price-input" 
                               name="price_${priceList.pricelist_id}"
                               required="${priceList.is_default}"
                               min="0.01"
                               step="0.01">
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-check">
                        <input class="form-check-input prepayment-toggle" 
                               type="checkbox" 
                               id="prepayment_${priceList.pricelist_id}">
                        <label class="form-check-label" for="prepayment_${
							priceList.pricelist_id
						}">
                            ${i18n.t("pharmacy.fields.requiresPrepayment")}
                        </label>
                    </div>
                </div>
                <div class="col-md-5 prepayment-controls d-none">
                    <div class="row g-2">
                        <div class="col-6">
                            <select class="form-select prepayment-type" 
                                    id="prepaymentType_${
										priceList.pricelist_id
									}">
                                <option value="fixed">${i18n.t(
									"pharmacy.prepaymentTypes.fixed"
								)}</option>
                                <option value="percentage">${i18n.t(
									"pharmacy.prepaymentTypes.percentage"
								)}</option>
                            </select>
                        </div>
                        <div class="col-6">
                            <div class="input-group">
                                <input type="number" 
                                       class="form-control prepayment-amount" 
                                       id="prepaymentAmount_${
											priceList.pricelist_id
										}"
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
    `
			)
			.join("");

		// Add event listeners for prepayment toggles
		document.querySelectorAll(".prepayment-toggle").forEach((toggle) => {
			toggle.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				const controls = target
					.closest(".price-list-input")
					?.querySelector(".prepayment-controls");
				const amountInput = target
					.closest(".price-list-input")
					?.querySelector(".prepayment-amount") as HTMLInputElement;

				if (controls) {
					controls.classList.toggle("d-none", !target.checked);
					if (amountInput) {
						amountInput.disabled = !target.checked;
						if (!target.checked) {
							amountInput.value = "";
						}
					}
				}
			});
		});

		// Add event listeners for prepayment type changes
		document.querySelectorAll(".prepayment-type").forEach((select) => {
			select.addEventListener("change", (e) => {
				const target = e.target as HTMLSelectElement;
				const symbol = target
					.closest(".prepayment-controls")
					?.querySelector(".prepayment-symbol");
				if (symbol) {
					symbol.textContent =
						target.value === "fixed"
							? i18n.t("common.currency")
							: "%";
				}
			});
		});
	}

	public showShipmentModal(drugId: number, shipmentId?: number): void {
		if (!this.drugs.get(drugId)) return;
		this.currentDrug = this.drugs.get(drugId)!;

		this.resetShipmentForm();
		const modalTitle = document.getElementById("shipmentModalLabel")!;
		const quantityUnit = document.getElementById("quantityUnit")!;

		// Set drug ID and unit
		(document.getElementById("shipmentDrugId") as HTMLInputElement).value =
			drugId.toString();
		quantityUnit.textContent = this.currentDrug.unit_conversion.larger;

		if (shipmentId) {
			modalTitle.textContent = i18n.t("pharmacy.modals.editShipment");
			this.populateShipmentForm(shipmentId);
		} else {
			modalTitle.textContent = i18n.t("pharmacy.modals.addShipment");
			// Set minimum date for expiry date input
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			(document.getElementById("expiryDate") as HTMLInputElement).min =
				tomorrow.toISOString().split("T")[0];
		}

		this.renderPriceListInputs();
		this.shipmentModal.show();
	}

	private async populateShipmentForm(shipmentId: number): Promise<void> {
		try {
			const response = await fetch(
				`/api/pharmacy/drugs/shipments/${shipmentId}`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				}
			);

			if (!response.ok)
				throw new Error("Failed to fetch shipment details");

			const shipment = await response.json();

			(document.getElementById("shipmentId") as HTMLInputElement).value =
				shipmentId.toString();
			(
				document.getElementById("warehouseSelect") as HTMLSelectElement
			).value = shipment.warehouse_id.toString();
			(document.getElementById("quantity") as HTMLInputElement).value =
				Math.floor(
					shipment.quantity / this.currentDrug!.unit_conversion.ratio
				).toString();
			(document.getElementById("buyPrice") as HTMLInputElement).value =
				shipment.buy_price.toString();
			(document.getElementById("expiryDate") as HTMLInputElement).value =
				new Date(shipment.expiry_date).toISOString().split("T")[0];

			// Set prices
			shipment.prices.forEach((price: ShipmentPrice) => {
				const priceInput = document.querySelector(
					`input[name="price_${price.pricelist_id}"]`
				) as HTMLInputElement;
				const prepaymentToggle = document.getElementById(
					`prepayment_${price.pricelist_id}`
				) as HTMLInputElement;

				if (priceInput) {
					priceInput.value = Number(price.price).toString();
				}

				if (prepaymentToggle && price.requires_prepayment) {
					prepaymentToggle.checked = true;
					const controls = prepaymentToggle
						.closest(".price-list-input")
						?.querySelector(".prepayment-controls");
					const typeSelect = document.getElementById(
						`prepaymentType_${price.pricelist_id}`
					) as HTMLSelectElement;
					const amountInput = document.getElementById(
						`prepaymentAmount_${price.pricelist_id}`
					) as HTMLInputElement;

					if (controls) controls.classList.remove("d-none");
					if (typeSelect)
						typeSelect.value = price.prepayment_type || "fixed";
					if (amountInput) {
						amountInput.disabled = false;
						amountInput.value =
							price.prepayment_amount?.toString() || "";
					}
				}
			});
		} catch (error) {
			console.error("Error loading shipment:", error);
			this.showError(i18n.t("pharmacy.messages.loadShipmentError"));
			this.shipmentModal.hide();
		}
	}

	private async handleSaveShipment(): Promise<void> {
		if (!this.validateShipmentForm()) return;

		const shipmentId = (
			document.getElementById("shipmentId") as HTMLInputElement
		).value;
		const drugId = parseInt(
			(document.getElementById("shipmentDrugId") as HTMLInputElement)
				.value
		);
		const warehouseId = parseInt(
			(document.getElementById("warehouseSelect") as HTMLSelectElement)
				.value
		);
		const quantity = parseInt(
			(document.getElementById("quantity") as HTMLInputElement).value
		);
		const buyPrice = parseFloat(
			(document.getElementById("buyPrice") as HTMLInputElement).value
		);
		const expiryDate = (
			document.getElementById("expiryDate") as HTMLInputElement
		).value;

		// Collect prices
		const prices = this.priceLists
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

				if (!priceInput.value && !priceList.is_default) return null;

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
			})
			.filter((price) => price !== null);

		const shipmentData = {
			...(shipmentId ? { shipment_id: parseInt(shipmentId) } : {}),
			drug_id: drugId,
			warehouse_id: warehouseId,
			quantity: quantity,
			buy_price: buyPrice,
			expiry_date: expiryDate,
			prices
		};

		try {
			this.setShipmentLoading(true);

			const response = await fetch(
				`/api/pharmacy/drugs/shipments${
					shipmentId ? `/${shipmentId}` : ""
				}`,
				{
					method: shipmentId ? "PUT" : "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					},
					body: JSON.stringify(shipmentData)
				}
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to save shipment");
			}

			await this.loadDrugs();
			this.shipmentModal.hide();

			Swal.fire({
				icon: "success",
				title: i18n.t("common.success"),
				text: shipmentId
					? i18n.t("pharmacy.messages.shipmentUpdateSuccess")
					: i18n.t("pharmacy.messages.shipmentCreateSuccess"),
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error saving shipment:", error);
			this.showError(
				error instanceof Error
					? error.message
					: i18n.t("pharmacy.messages.shipmentSaveError")
			);
		} finally {
			this.setShipmentLoading(false);
		}
	}

	public async deleteShipment(
		shipmentId: number,
		drugId: number
	): Promise<void> {
		try {
			const drug = this.drugs.get(drugId);
			const stock = this.drugStocks.get(drugId);
			const shipment = stock?.shipments.find(
				(s) => s.shipment_id === shipmentId
			);

			if (!drug || !shipment) {
				this.showError(i18n.t("pharmacy.messages.shipmentNotFound"));
				return;
			}

			// Build warning message based on shipment quantity
			let warningMessage = i18n.t(
				"pharmacy.messages.deleteShipmentConfirm"
			);
			let warningHtml = "";

			if (shipment.quantity > 0) {
				const quantityInLarger = Math.floor(
					shipment.quantity / drug.unit_conversion.ratio
				);
				const quantityInSmaller =
					shipment.quantity % drug.unit_conversion.ratio;

				const quantityDisplay =
					quantityInLarger > 0
						? `${quantityInLarger} ${drug.unit_conversion.larger}` +
						  (quantityInSmaller > 0
								? ` + ${quantityInSmaller} ${drug.unit_conversion.smaller}`
								: "")
						: `${quantityInSmaller} ${drug.unit_conversion.smaller}`;

				warningHtml = `
				<div class="alert alert-danger mb-3">
					<i class="bi bi-exclamation-triangle-fill me-2"></i>
					<strong>${i18n.t("pharmacy.messages.warning")}:</strong> 
					${i18n.t("pharmacy.messages.shipmentHasStock")}
				</div>
				<div class="text-start mb-3">
					<p><strong>${i18n.t("pharmacy.fields.drugName")}:</strong> ${this.escapeHtml(
					drug.name
				)}</p>
					<p><strong>${i18n.t("pharmacy.fields.warehouse")}:</strong> ${this.escapeHtml(
					shipment.warehouse_name
				)}</p>
					<p><strong>${i18n.t(
						"pharmacy.fields.quantity"
					)}:</strong> ${quantityDisplay}</p>
					<p><strong>${i18n.t(
						"pharmacy.fields.buyPrice"
					)}:</strong> ${i18n.formatCurrency(
					parseFloat(shipment.buy_price)
				)}</p>
					<p><strong>${i18n.t("pharmacy.fields.expiryDate")}:</strong> ${i18n.formatDate(
					shipment.expiry_date
				)}</p>
				</div>
				<p class="text-danger fw-bold">${i18n.t(
					"pharmacy.messages.deleteShipmentWarning"
				)}</p>
			`;
			} else {
				warningHtml = `
				<div class="text-start mb-3">
					<p><strong>${i18n.t("pharmacy.fields.drugName")}:</strong> ${this.escapeHtml(
					drug.name
				)}</p>
					<p><strong>${i18n.t("pharmacy.fields.warehouse")}:</strong> ${this.escapeHtml(
					shipment.warehouse_name
				)}</p>
					<p><strong>${i18n.t("pharmacy.fields.expiryDate")}:</strong> ${i18n.formatDate(
					shipment.expiry_date
				)}</p>
				</div>
				<p>${i18n.t("pharmacy.messages.deleteShipmentConfirmText")}</p>
			`;
			}

			const result = await Swal.fire({
				title: i18n.t("pharmacy.messages.deleteShipmentTitle"),
				html: warningHtml,
				icon: shipment.quantity > 0 ? "warning" : "question",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: i18n.t("common.deleteConfirm"),
				cancelButtonText: i18n.t("common.cancel"),
				focusCancel: true,
				reverseButtons: true
			});

			if (result.isConfirmed) {
				// Show loading state
				Swal.fire({
					title: i18n.t("pharmacy.messages.deletingShipment"),
					allowOutsideClick: false,
					allowEscapeKey: false,
					didOpen: () => {
						Swal.showLoading();
					}
				});

				const response = await fetch(
					`/api/pharmacy/drugs/shipments/${shipmentId}`,
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
					const error = await response.json();
					throw new Error(error.error || "Failed to delete shipment");
				}

				// Reload drugs to reflect changes
				await this.loadDrugs();

				// Show success message
				await Swal.fire({
					icon: "success",
					title: i18n.t("common.success"),
					text: i18n.t("pharmacy.messages.shipmentDeleteSuccess"),
					timer: 3000,
					showConfirmButton: false,
					toast: true,
					position: "top-end"
				});
			}
		} catch (error) {
			console.error("Error deleting shipment:", error);
			Swal.fire({
				icon: "error",
				title: i18n.t("common.error"),
				text:
					error instanceof Error
						? error.message
						: i18n.t("pharmacy.messages.shipmentDeleteError"),
				confirmButtonColor: "#dc3545"
			});
		}
	}

	public editShipment(shipmentId: number): void {
		const shipment = this.findShipmentById(shipmentId);
		if (!shipment) return;

		this.showShipmentModal(shipment.drug_id, shipmentId);
	}

	private findShipmentById(shipmentId: number): DrugShipment | null {
		for (const stock of this.drugStocks.values()) {
			const shipment = stock.shipments.find(
				(s) => s.shipment_id === shipmentId
			);
			if (shipment) return shipment;
		}
		return null;
	}

	private validateShipmentForm(): boolean {
		this.shipmentForm.classList.add("was-validated");

		if (!this.shipmentForm.checkValidity()) {
			return false;
		}

		const quantity = parseInt(
			(document.getElementById("quantity") as HTMLInputElement).value
		);
		if (quantity <= 0) {
			this.showError(i18n.t("pharmacy.validation.quantityMin"));
			return false;
		}

		const buyPrice = parseFloat(
			(document.getElementById("buyPrice") as HTMLInputElement).value
		);
		if (buyPrice <= 0) {
			this.showError(i18n.t("pharmacy.validation.buyPriceMin"));
			return false;
		}

		const expiryDate = new Date(
			(document.getElementById("expiryDate") as HTMLInputElement).value
		);
		if (expiryDate <= new Date()) {
			this.showError(i18n.t("pharmacy.validation.expiryDateFuture"));
			return false;
		}

		// Validate prices
		const defaultPriceList = this.priceLists.find((pl) => pl.is_default);
		if (defaultPriceList) {
			const defaultPriceInput = document.querySelector(
				`input[name="price_${defaultPriceList.pricelist_id}"]`
			) as HTMLInputElement;

			if (
				!defaultPriceInput.value ||
				parseFloat(defaultPriceInput.value) <= 0
			) {
				this.showError(
					i18n.t("pharmacy.validation.defaultPriceRequired")
				);
				return false;
			}
		}

		// Validate prepayment amounts
		const prepaymentToggles = document.querySelectorAll(
			".prepayment-toggle:checked"
		);
		for (const toggle of prepaymentToggles) {
			const priceListId = (toggle as HTMLInputElement).id.split("_")[1];
			const typeSelect = document.getElementById(
				`prepaymentType_${priceListId}`
			) as HTMLSelectElement;
			const amountInput = document.getElementById(
				`prepaymentAmount_${priceListId}`
			) as HTMLInputElement;

			if (!amountInput.value || parseFloat(amountInput.value) <= 0) {
				this.showError(
					i18n.t("pharmacy.validation.prepaymentAmountRequired")
				);
				return false;
			}

			if (
				typeSelect.value === "percentage" &&
				parseFloat(amountInput.value) > 100
			) {
				this.showError(
					i18n.t("pharmacy.validation.prepaymentPercentageMax")
				);
				return false;
			}
		}

		return true;
	}

	private resetShipmentForm(): void {
		this.shipmentForm.reset();
		this.shipmentForm.classList.remove("was-validated");
		(document.getElementById("shipmentId") as HTMLInputElement).value = "";
		document.querySelectorAll(".prepayment-controls").forEach((control) => {
			control.classList.add("d-none");
		});
		document.querySelectorAll(".prepayment-amount").forEach((input) => {
			(input as HTMLInputElement).disabled = true;
		});
	}

	private setShipmentLoading(loading: boolean): void {
		const spinner =
			this.saveShipmentButton.querySelector(".spinner-border")!;
		const buttonText = this.saveShipmentButton.querySelector(".btn-text")!;
		this.saveShipmentButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("pharmacy.buttons.saving")
			: i18n.t("common.save");
	}

	private validateDrugForm(): boolean {
		this.drugForm.classList.add("was-validated");

		if (!this.drugForm.checkValidity()) {
			return false;
		}

		const ratio = parseInt(
			(document.getElementById("conversionRatio") as HTMLInputElement)
				.value
		);
		if (ratio <= 0) {
			this.showError(i18n.t("pharmacy.validation.conversionRatioMin"));
			return false;
		}

		const minStock = (
			document.getElementById("minStockAlert") as HTMLInputElement
		).value;
		if (minStock && parseInt(minStock) < 0) {
			this.showError(i18n.t("pharmacy.validation.minStockNegative"));
			return false;
		}

		const expiryDays = (
			document.getElementById("maxDaysExpiry") as HTMLInputElement
		).value;
		if (expiryDays && parseInt(expiryDays) < 0) {
			this.showError(i18n.t("pharmacy.validation.expiryDaysNegative"));
			return false;
		}

		return true;
	}

	private validateSellForm(): boolean {
		this.sellForm.classList.add("was-validated");

		if (!this.sellForm.checkValidity()) {
			return false;
		}

		const transactionType = (
			document.getElementById("transactionType") as HTMLSelectElement
		).value;
		if (transactionType === "patient") {
			const patientSelect = document.getElementById(
				"patientSelect"
			) as HTMLSelectElement;
			if (!patientSelect.value) {
				patientSelect.classList.add("is-invalid");
				return false;
			}
		}

		const quantity =
			parseInt(
				(
					document.getElementById(
						"sellQuantityLarger"
					) as HTMLInputElement
				).value
			) +
			parseInt(
				(
					document.getElementById(
						"sellQuantitySmaller"
					) as HTMLInputElement
				).value
			);
		if (quantity <= 0) {
			this.showError(i18n.t("pharmacy.validation.quantityMin"));
			return false;
		}

		if (!this.currentShipment) return false;

		const drug = this.drugs.get(this.currentShipment.drug_id);
		if (!drug) return false;

		const quantityInSmaller = quantity;
		if (quantityInSmaller > this.currentShipment.quantity) {
			this.showError(i18n.t("pharmacy.validation.insufficientQuantity"));
			return false;
		}

		return true;
	}

	private updateUnitConversionPreview(): void {
		const larger = (
			document.getElementById("largerUnit") as HTMLInputElement
		).value;
		const smaller = (
			document.getElementById("smallerUnit") as HTMLInputElement
		).value;
		const ratio = (
			document.getElementById("conversionRatio") as HTMLInputElement
		).value;

		if (larger && smaller && ratio) {
			const preview = document.createElement("div");
			preview.className = "unit-conversion-preview";
			preview.textContent = `1 ${larger} = ${ratio} ${smaller}`;

			const existingPreview = document.querySelector(
				".unit-conversion-preview"
			);
			if (existingPreview) {
				existingPreview.replaceWith(preview);
			} else {
				document
					.getElementById("conversionRatio")
					?.parentElement?.appendChild(preview);
			}
		}
	}

	private updateTotalPrice(): void {
		if (!this.currentShipment) return;

		const drug = this.drugs.get(this.currentShipment.drug_id);
		if (!drug) return;

		const largerQuantity =
			parseInt(
				(
					document.getElementById(
						"sellQuantityLarger"
					) as HTMLInputElement
				).value
			) * drug.unit_conversion.ratio;
		const smallerQuantity = parseInt(
			(document.getElementById("sellQuantitySmaller") as HTMLInputElement)
				.value
		);
		const quantity = (largerQuantity || 0) + (smallerQuantity || 0);
		const priceListId = parseInt(
			(document.getElementById("priceList") as HTMLSelectElement).value
		);
		const price = this.currentShipment.prices.find(
			(p) => p.pricelist_id === priceListId
		);

		const totalPriceInput = document.getElementById(
			"totalPrice"
		) as HTMLInputElement;

		if (price && quantity > 0) {
			const total = quantity * Number(price.price);
			totalPriceInput.value = total.toFixed(2);
		} else {
			totalPriceInput.value = "0.00";
		}
	}

	private resetDrugForm(): void {
		this.drugForm.reset();
		this.drugForm.classList.remove("was-validated");
		(document.getElementById("drugId") as HTMLInputElement).value = "";
		document.querySelector(".unit-conversion-preview")?.remove();
	}

	private resetSellForm(): void {
		this.sellForm.reset();
		this.sellForm.classList.remove("was-validated");
		document
			.querySelector(".patient-select-container")
			?.classList.add("d-none");
		(document.getElementById("totalPrice") as HTMLInputElement).value =
			"0.00";

		// Reset and update price list select
		this.updatePriceListSelect();
	}

	private setDrugLoading(loading: boolean): void {
		const spinner = this.saveDrugButton.querySelector(".spinner-border")!;
		const buttonText = this.saveDrugButton.querySelector(".btn-text")!;
		this.saveDrugButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("pharmacy.buttons.saving")
			: i18n.t("common.save");
	}

	private setSellLoading(loading: boolean): void {
		const spinner =
			this.confirmSellButton.querySelector(".spinner-border")!;
		const buttonText = this.confirmSellButton.querySelector(".btn-text")!;
		this.confirmSellButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading
			? i18n.t("pharmacy.buttons.processing")
			: i18n.t("pharmacy.buttons.confirmSale");
	}

	private async showWarehouseModal(): Promise<void> {
		try {
			await this.loadWarehouses();
			this.renderWarehousesTable();
			this.warehouseModal.show();
		} catch (error) {
			console.error("Error showing warehouse modal:", error);
			this.showError("Failed to load warehouses");
		}
	}

	public showAddWarehouseModal(warehouse?: Warehouse): void {
		const title = document.getElementById("addWarehouseModalLabel")!;

		this.resetWarehouseForm();

		if (warehouse) {
			title.textContent = i18n.t("pharmacy.modals.editWarehouse");
			(document.getElementById("warehouseId") as HTMLInputElement).value =
				warehouse.warehouse_id.toString();
			(
				document.getElementById("warehouseName") as HTMLInputElement
			).value = warehouse.name;
			(
				document.getElementById(
					"warehouseLocation"
				) as HTMLTextAreaElement
			).value = warehouse.location;
		} else {
			title.textContent = i18n.t("pharmacy.modals.addWarehouse");
			(document.getElementById("warehouseId") as HTMLInputElement).value =
				"";
		}

		this.addWarehouseModal.show();
	}

	private renderWarehousesTable(): void {
		const tbody = document.getElementById("warehousesTableBody")!;

		if (this.warehouses.length === 0) {
			tbody.innerHTML = `
			<tr>
				<td colspan="4" class="text-center py-4">
					<div class="text-muted mb-3">
						<i class="bi bi-building" style="font-size: 3rem; color: var(--bs-gray-400);"></i>
						<p class="mt-2 mb-3">${i18n.t("pharmacy.messages.noWarehouses")}</p>
						<button type="button" class="btn btn-primary btn-sm" onclick="drugManager.showAddWarehouseModal()">
							${i18n.t("pharmacy.buttons.addFirstWarehouse")}
						</button>
					</div>
				</td>
			</tr>
		`;
			return;
		}

		tbody.innerHTML = this.warehouses
			.map(
				(warehouse) => `
		<tr class="warehouse-row">
			<td>
				<div class="warehouse-info">
					<div class="warehouse-name">${this.escapeHtml(warehouse.name)}</div>
				</div>
			</td>
			<td>
				<div class="warehouse-location">${this.escapeHtml(warehouse.location)}</div>
			</td>
			<td>
				<span class="shipment-count">${warehouse.total_shipments || 0}</span>
			</td>
			<td>
				<div class="warehouse-actions">
					<button type="button" class="btn btn-outline-primary btn-sm" 
							onclick="drugManager.editWarehouse(${warehouse.warehouse_id})"
							title="${i18n.t("pharmacy.buttons.editWarehouse")}">
						<i class="bi bi-pencil"></i>
					</button>
					<button type="button" class="btn btn-outline-info btn-sm" 
							onclick="drugManager.viewWarehouseInventory(${warehouse.warehouse_id})"
							title="${i18n.t("pharmacy.buttons.viewInventory")}">
						<i class="bi bi-box-seam"></i>
					</button>
					<button type="button" class="btn btn-outline-danger btn-sm" 
							onclick="drugManager.deleteWarehouse(${warehouse.warehouse_id})"
							title="${i18n.t("common.delete")}"
							${(warehouse.total_shipments || 0) > 0 ? "disabled" : ""}>
						<i class="bi bi-trash"></i>
					</button>
				</div>
			</td>
		</tr>
	`
			)
			.join("");
	}

	public editWarehouse(warehouseId: number): void {
		const warehouse = this.warehouses.find(
			(w) => w.warehouse_id === warehouseId
		);
		if (warehouse) {
			this.showAddWarehouseModal(warehouse);
		}
	}

	public async deleteWarehouse(warehouseId: number): Promise<void> {
		const warehouse = this.warehouses.find(
			(w) => w.warehouse_id === warehouseId
		);
		if (!warehouse) return;

		const result = await Swal.fire({
			title: i18n.t("pharmacy.messages.deleteWarehouseTitle"),
			text: i18n.t("pharmacy.messages.deleteWarehouseText", {
				name: warehouse.name
			}),
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#d33",
			cancelButtonColor: "#3085d6",
			confirmButtonText: i18n.t("common.yes"),
			cancelButtonText: i18n.t("common.cancel")
		});

		if (result.isConfirmed) {
			try {
				const response = await fetch(`/api/warehouse/${warehouseId}`, {
					method: "DELETE",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});

				const data = await response.json();

				if (response.ok) {
					Swal.fire({
						icon: "success",
						title: i18n.t("common.success"),
						text: i18n.t(
							"pharmacy.messages.warehouseDeleteSuccess"
						),
						toast: true,
						position: "top-end",
						showConfirmButton: false,
						timer: 3000
					});
					await this.loadWarehouses();
					this.renderWarehousesTable();
				} else {
					Swal.fire(i18n.t("common.error"), data.error, "error");
				}
			} catch (error) {
				console.error("Error deleting warehouse:", error);
				Swal.fire(
					i18n.t("common.error"),
					i18n.t("pharmacy.messages.warehouseDeleteError"),
					"error"
				);
			}
		}
	}

	public async viewWarehouseInventory(warehouseId: number): Promise<void> {
		const warehouse = this.warehouses.find(
			(w) => w.warehouse_id === warehouseId
		);
		if (warehouse) {
			Swal.fire({
				title: i18n.t("pharmacy.warehouseInventory.title", {
					name: warehouse.name
				}),
				html: `
				<div class="text-start">
					<p><strong>${i18n.t("pharmacy.warehouseInventory.totalShipments")}:</strong> ${
					warehouse.total_shipments || 0
				}</p>
					<p><strong>${i18n.t("pharmacy.warehouseInventory.totalDrugs")}:</strong> ${
					warehouse.total_drugs || 0
				}</p>
					<p><strong>${i18n.t(
						"pharmacy.warehouseInventory.totalValue"
					)}:</strong> ${i18n.formatCurrency(
					warehouse.total_stock_value || 0
				)}</p>
				</div>
			`,
				icon: "info",
				confirmButtonText: i18n.t("common.close")
			});
		}
	}

	private async handleSaveWarehouse(): Promise<void> {
		if (!this.validateWarehouseForm()) return;

		const warehouseId = (
			document.getElementById("warehouseId") as HTMLInputElement
		).value;
		const name = (
			document.getElementById("warehouseName") as HTMLInputElement
		).value.trim();
		const location = (
			document.getElementById("warehouseLocation") as HTMLTextAreaElement
		).value.trim();

		const isEdit = warehouseId !== "";
		const url = isEdit ? `/api/warehouse/${warehouseId}` : "/api/warehouse";
		const method = isEdit ? "PUT" : "POST";

		try {
			this.setWarehouseLoading(true);

			const response = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`
				},
				body: JSON.stringify({ name, location })
			});

			const data = await response.json();

			if (response.ok) {
				this.addWarehouseModal.hide();

				Swal.fire({
					icon: "success",
					title: i18n.t("common.success"),
					text: isEdit
						? i18n.t("pharmacy.messages.warehouseUpdateSuccess")
						: i18n.t("pharmacy.messages.warehouseCreateSuccess"),
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});

				await this.loadWarehouses();
				this.renderWarehousesTable();
			} else {
				Swal.fire(i18n.t("common.error"), data.error, "error");
			}
		} catch (error) {
			console.error("Error saving warehouse:", error);
			Swal.fire(
				i18n.t("common.error"),
				i18n.t("pharmacy.messages.warehouseSaveError"),
				"error"
			);
		} finally {
			this.setWarehouseLoading(false);
		}
	}

	private validateWarehouseForm(): boolean {
		this.warehouseForm.classList.add("was-validated");
		return this.warehouseForm.checkValidity();
	}

	private resetWarehouseForm(): void {
		this.warehouseForm.reset();
		this.warehouseForm.classList.remove("was-validated");
		(document.getElementById("warehouseId") as HTMLInputElement).value = "";
	}

	private setWarehouseLoading(loading: boolean): void {
		const spinner =
			this.saveWarehouseButton.querySelector(".spinner-border")!;
		const btnText = this.saveWarehouseButton.querySelector(".btn-text")!;
		this.saveWarehouseButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		btnText.textContent = loading
			? i18n.t("pharmacy.buttons.saving")
			: i18n.t("pharmacy.buttons.saveWarehouse");
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
		drugManager: DrugManager;
	}
}

window.drugManager = new DrugManager();
