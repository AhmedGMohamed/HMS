//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";

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
}

class DrugManager {
	//@ts-ignore
	private drugModal: Modal;
	//@ts-ignore
	private sellModal: Modal;
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
	private warehouses: Warehouse[] = [];
	private currentDrug: DrugCard | null = null;

	constructor() {
		// Initialize sidebar
		new SidebarManager();

		// Initialize modals
		const drugModalElement = document.getElementById("drugModal")!;
		const sellModalElement = document.getElementById("sellDrugModal")!;
		//@ts-ignore
		this.drugModal = new bootstrap.Modal(drugModalElement);
		//@ts-ignore
		this.sellModal = new bootstrap.Modal(sellModalElement);

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

		// Add to initializeEventListeners
		this.saveShipmentButton.addEventListener("click", () => {
			this.handleSaveShipment();
		});

		this.loadWarehouses();
		this.initializeEventListeners();
		this.loadInitialData();
	}

	private async loadInitialData(): Promise<void> {
		try {
			await Promise.all([this.loadDrugs(), this.loadPriceLists()]);
		} catch (error) {
			console.error("Error loading initial data:", error);
			this.showError("Failed to load initial data");
		}
	}

	private initializeEventListeners(): void {
		// Create drug button
		document
			.getElementById("createDrugBtn")
			?.addEventListener("click", () => {
				this.showDrugModal();
			});

		// Save drug button
		this.saveDrugButton.addEventListener("click", () => {
			this.handleSaveDrug();
		});

		// Search input
		this.searchInput.addEventListener(
			"input",
			this.debounce(() => {
				this.filterDrugs();
			}, 300)
		);

		// Drug modal events
		const drugModalElement = document.getElementById("drugModal")!;
		drugModalElement.addEventListener("hidden.bs.modal", () => {
			this.resetDrugForm();
		});

		// Sell modal events
		const sellModalElement = document.getElementById("sellDrugModal")!;
		sellModalElement.addEventListener("hidden.bs.modal", () => {
			this.resetSellForm();
		});

		// Transaction type change
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

		// Quantity input change
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

		// Price list change
		document.getElementById("priceList")?.addEventListener("change", () => {
			this.updateTotalPrice();
		});

		// Confirm sell button
		this.confirmSellButton.addEventListener("click", () => {
			this.handleSellDrug();
		});

		// Unit conversion preview
		["largerUnit", "smallerUnit", "conversionRatio"].forEach((id) => {
			document.getElementById(id)?.addEventListener("input", () => {
				this.updateUnitConversionPreview();
			});
		});
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
			this.showError("Failed to load drugs");
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

				// Calculate total quantity and find nearest expiry
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
			this.showError("Failed to load drug stocks");
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
			this.showError("Failed to load price lists");
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
			this.showError("Failed to load active patients");
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

		// Select default price list if exists
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
			: '<option value="">No active patients</option>';
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
                	        ${drug.is_obligatory_continuous ? "Yes" : "No"}
                	    </span>
                	    ${
							drug.frequency
								? `<small class="d-block text-muted">Every ${drug.frequency.hours} hour(s)</small>`
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
									? '<span class="badge bg-danger">Low Stock</span>'
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
                                ${new Date(
									stock.nearest_expiry
								).toLocaleDateString()}
                                ${
									expiryClass
										? `(${daysUntilExpiry} days)`
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
                                <i class="bi bi-pencil"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" 
                                    onclick="drugManager.deleteDrug(${
										drug.drug_id
									})">
                                <i class="bi bi-trash"></i> Delete
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
            	        <div class="text-muted mb-3">No shipments available for this drug</div>
            	        <button class="btn btn-sm btn-primary" 
            	                onclick="drugManager.showShipmentModal(${drug.drug_id})">
            	            <i class="bi bi-plus-circle"></i> Add New Shipment
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
                            <div class="row align-items-center">
                                <div class="col-md-3">
                                    <strong>Warehouse:</strong> ${this.escapeHtml(
										shipment.warehouse_name
									)}
                                </div>
								<div class="col-md-3">
									<strong>Buy Price:</strong> ${this.escapeHtml(shipment.buy_price)}$
								</div>
                                <div class="col-md-3">
                                    <strong>Quantity:</strong> 
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
                                    <strong>Expiry:</strong> 
                                    ${new Date(
										shipment.expiry_date
									).toLocaleDateString()}
                                </div>
                                <div class="col-md-1">
                                    <button class="btn btn-sm btn-success" 
                                            onclick="drugManager.showSellModal(${
												shipment.shipment_id
											})"
                                            ${
												shipment.quantity === 0
													? "disabled"
													: ""
											}>
                                        <i class="bi bi-cart"></i> Sell
                                    </button>
                                </div>
                            </div>
                            <div class="mt-2">
                                <strong>Prices:</strong>
                                ${shipment.prices
									.map((price) => {
										const priceList = this.priceLists.find(
											(pl) =>
												pl.pricelist_id ===
												price.pricelist_id
										);
										return `
                                    	    <span class="price-badge">
                                    	    ${this.escapeHtml(
												priceList?.name || ""
											)}: 
                                    	    $${Number(price.price).toFixed(2)}
                                    	    ${
												price.requires_prepayment
													? `
                                    	        <small class="ms-1">
                                    	            (Prepay: ${
														price.prepayment_type ===
														"fixed"
															? `$${price.prepayment_amount?.toFixed(
																	2
															  )}`
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
                    <i class="bi bi-plus-circle"></i> Add New Shipment
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

			modalTitle.textContent = "Edit Drug";
			this.populateDrugForm(drug);
		} else {
			modalTitle.textContent = "Create New Drug";
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
				title: "Success",
				text: `Drug successfully ${drugId ? "updated" : "created"}`,
				toast: true,
				position: "top-end",
				showConfirmButton: false,
				timer: 3000
			});
		} catch (error) {
			console.error("Error saving drug:", error);
			this.showError(
				error instanceof Error ? error.message : "Failed to save drug"
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
			let warningMessage = "This action cannot be undone!";
			if (stock && stock.total_quantity > 0) {
				warningMessage = `This drug has ${stock.total_quantity} units in stock. Deleting it will remove all stock records. This action cannot be undone!`;
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
					title: "Deleted!",
					text: "Drug has been deleted.",
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});
			}
		} catch (error) {
			console.error("Error deleting drug:", error);
			this.showError("Failed to delete drug");
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

			// Update labels
			const sellQuantityLargerLabel = document.getElementById(
				"sellQuantityLargerLabel"
			)!;
			sellQuantityLargerLabel.textContent =
				drug.unit_conversion.larger + " Quantity";
			const sellQuantitySmallerLabel = document.getElementById(
				"sellQuantitySmallerLabel"
			)!;
			sellQuantitySmallerLabel.textContent =
				drug.unit_conversion.smaller + " Quantity";

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

			// Update quantity unit
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
			this.showError("Failed to load shipment details");
		}
	}

	private async handleSellDrug(): Promise<void> {
		if (!this.validateSellForm()) return;

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
			) +
			parseInt(
				(
					document.getElementById(
						"sellQuantitySmaller"
					) as HTMLInputElement
				).value
			);
		const priceListId = parseInt(
			(document.getElementById("priceList") as HTMLSelectElement).value
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

		if (!this.currentShipment) return;

		const drug = this.drugs.get(this.currentShipment.drug_id);
		if (!drug) return;

		if (quantity > this.currentShipment.quantity) {
			this.showError("Insufficient quantity available");
			return;
		}

		const price = parseFloat((
			document.getElementById("totalPrice") as HTMLInputElement
		).value);

		if (!price) {
			this.showError("Invalid price");
			return;
		}

		// Check if price is less than buy price
		if (price / quantity < parseFloat(this.currentShipment.buy_price)) {
			const result = await Swal.fire({
				title: "Are you sure?",
				text: "This price is less than the buy price. Are you sure you want to sell this drug?",
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#dc3545",
				cancelButtonColor: "#6c757d",
				confirmButtonText: "Yes, Sell it!"
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
					price: price / quantity,
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
				title: "Success",
				text: "Sale processed successfully",
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
					: "Failed to process sale"
			);
		} finally {
			this.setSellLoading(false);
		}
	}

	private async loadWarehouses(): Promise<void> {
		try {
			const response = await fetch("/api/pharmacy/warehouses", {
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
			'<option value="">Select Warehouse</option>' +
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
								? '<span class="badge bg-primary ms-1">Default</span>'
								: ""
						}
                    </label>
                    <div class="input-group">
                        <span class="input-group-text">$</span>
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
                            Requires Prepayment
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
                                <option value="fixed">Fixed Amount</option>
                                <option value="percentage">Percentage</option>
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
                                <span class="input-group-text prepayment-symbol">$</span>
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
					symbol.textContent = target.value === "fixed" ? "$" : "%";
				}
			});
		});
	}

	public showShipmentModal(drugId: number, shipmentId?: number): void {
		if (!this.drugs.get(drugId)) return;
		this.currentDrug = this.drugs.get(drugId)!;

		this.resetShipmentForm();
		const modalTitle = document.getElementById("shipmentModalLabel")!;
		const quantityUnitLarger =
			document.getElementById("quantityUnitLarger")!;
		const quantityUnitSmaller = document.getElementById(
			"quantityUnitSmaller"
		)!;

		// Set drug ID and unit
		(document.getElementById("shipmentDrugId") as HTMLInputElement).value =
			drugId.toString();
		quantityUnitLarger.textContent =
			this.currentDrug.unit_conversion.larger;
		quantityUnitSmaller.textContent =
			this.currentDrug.unit_conversion.smaller;

		if (shipmentId) {
			modalTitle.textContent = "Edit Shipment";
			this.populateShipmentForm(shipmentId);
		} else {
			modalTitle.textContent = "Add New Shipment";
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
			).value = shipment.warehouse_id;
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
			this.showError("Failed to load shipment details");
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
			quantity: quantity, // Convert to smaller units
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
				title: "Success",
				text: `Shipment successfully ${
					shipmentId ? "updated" : "created"
				}`,
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
					: "Failed to save shipment"
			);
		} finally {
			this.setShipmentLoading(false);
		}
	}

	public async deleteShipment(shipmentId: number): Promise<void> {
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
					throw new Error("Failed to delete shipment");
				}

				await this.loadDrugs();

				Swal.fire({
					icon: "success",
					title: "Deleted!",
					text: "Shipment has been deleted.",
					toast: true,
					position: "top-end",
					showConfirmButton: false,
					timer: 3000
				});
			}
		} catch (error) {
			console.error("Error deleting shipment:", error);
			this.showError("Failed to delete shipment");
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

		// Validate quantity
		const quantity = parseInt(
			(document.getElementById("quantity") as HTMLInputElement).value
		);
		if (quantity <= 0) {
			this.showError("Quantity must be greater than 0");
			return false;
		}

		// Validate buy price
		const buyPrice = parseFloat(
			(document.getElementById("buyPrice") as HTMLInputElement).value
		);
		if (buyPrice <= 0) {
			this.showError("Buy price must be greater than 0");
			return false;
		}

		// Validate expiry date
		const expiryDate = new Date(
			(document.getElementById("expiryDate") as HTMLInputElement).value
		);
		if (expiryDate <= new Date()) {
			this.showError("Expiry date must be in the future");
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
				this.showError("Default price list must have a valid price");
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
					"Please enter valid prepayment amounts for all enabled prepayments"
				);
				return false;
			}

			if (
				typeSelect.value === "percentage" &&
				parseFloat(amountInput.value) > 100
			) {
				this.showError("Percentage prepayment cannot exceed 100%");
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
		buttonText.textContent = loading ? "Saving..." : "Save";
	}

	private validateDrugForm(): boolean {
		this.drugForm.classList.add("was-validated");

		if (!this.drugForm.checkValidity()) {
			return false;
		}

		// Additional validation for unit conversion
		const ratio = parseInt(
			(document.getElementById("conversionRatio") as HTMLInputElement)
				.value
		);
		if (ratio <= 0) {
			this.showError("Conversion ratio must be greater than 0");
			return false;
		}

		// Validate min stock alert
		const minStock = (
			document.getElementById("minStockAlert") as HTMLInputElement
		).value;
		if (minStock && parseInt(minStock) < 0) {
			this.showError("Minimum stock alert cannot be negative");
			return false;
		}

		// Validate expiry alert days
		const expiryDays = (
			document.getElementById("maxDaysExpiry") as HTMLInputElement
		).value;
		if (expiryDays && parseInt(expiryDays) < 0) {
			this.showError("Expiry alert days cannot be negative");
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
			this.showError("Quantity must be greater than 0");
			return false;
		}

		if (!this.currentShipment) return false;

		const drug = this.drugs.get(this.currentShipment.drug_id);
		if (!drug) return false;

		const quantityInSmaller = quantity;
		if (quantityInSmaller > this.currentShipment.quantity) {
			this.showError("Insufficient quantity available");
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
		if (!drug) throw new Error("Drug not found");
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
			const total =
				(quantity * Number(price.price)) / drug.unit_conversion.ratio;
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
		buttonText.textContent = loading ? "Saving..." : "Save";
	}

	private setSellLoading(loading: boolean): void {
		const spinner =
			this.confirmSellButton.querySelector(".spinner-border")!;
		const buttonText = this.confirmSellButton.querySelector(".btn-text")!;
		this.confirmSellButton.disabled = loading;
		spinner.classList.toggle("d-none", !loading);
		buttonText.textContent = loading ? "Processing..." : "Confirm Sale";
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
