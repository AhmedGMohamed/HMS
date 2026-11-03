//@ts-ignore
import Swal from "../sweetalert2/src/sweetalert2.js";
import { SidebarManager } from "../shared/sidebar.js";
import { i18n } from "../utils/i18n.js";

interface MedicalSupply {
    supply_id: number;
    name: string;
    is_obligatory_continuous: boolean;
    sale_quantity: number;
    frequency: { hours?: number; minutes?: number } | null;
    min_stock_alert: number | null;
}

interface ShipmentPrice {
    pricelist_id: number;
    price: string;
}

interface MedicalSupplyShipment {
    shipment_id: number;
    supply_id: number;
    warehouse_id: number;
    quantity: number;
    buy_price: string;
    expiry_date: string | null;
    received_date: string;
    warehouse_name: string;
    prices: ShipmentPrice[];
}

interface PriceList {
    pricelist_id: number;
    name: string;
    is_default: boolean;
}

interface SupplyStock {
    total_quantity: number;
    shipments: MedicalSupplyShipment[];
}

interface Warehouse {
    warehouse_id: number;
    name: string;
    location: string;
    total_shipments?: number;
}

class MedicalSuppliesManager {
    //@ts-ignore
    private supplyModal: Modal;
    //@ts-ignore
    private shipmentModal: Modal;
    //@ts-ignore
    private warehouseModal: Modal;
    //@ts-ignore
    private addWarehouseModal: Modal;

    private supplyForm: HTMLFormElement;
    private shipmentForm: HTMLFormElement;
    private warehouseForm: HTMLFormElement;
    private saveSupplyButton: HTMLButtonElement;
    private saveShipmentButton: HTMLButtonElement;
    private saveWarehouseButton: HTMLButtonElement;
    private searchInput: HTMLInputElement;

    private supplies: Map<number, MedicalSupply> = new Map();
    private supplyStocks: Map<number, SupplyStock> = new Map();
    private expandedSupplies: Set<number> = new Set();
    private priceLists: PriceList[] = [];
    private warehouses: Warehouse[] = [];
    private currentSupply: MedicalSupply | null = null;
    private userPermissions: string[] = [];

    constructor() {
        // Initialize modals
        const supplyModalElement = document.getElementById("supplyModal")!;
        const shipmentModalElement = document.getElementById("shipmentModal")!;
        const warehouseModalElement = document.getElementById("warehouseModal")!;
        const addWarehouseModalElement = document.getElementById("addWarehouseModal")!;

        //@ts-ignore
        this.supplyModal = new bootstrap.Modal(supplyModalElement);
        //@ts-ignore
        this.shipmentModal = new bootstrap.Modal(shipmentModalElement);
        //@ts-ignore
        this.warehouseModal = new bootstrap.Modal(warehouseModalElement);
        //@ts-ignore
        this.addWarehouseModal = new bootstrap.Modal(addWarehouseModalElement);

        // Initialize form elements
        this.supplyForm = document.getElementById("supplyForm") as HTMLFormElement;
        this.shipmentForm = document.getElementById("shipmentForm") as HTMLFormElement;
        this.warehouseForm = document.getElementById("warehouseForm") as HTMLFormElement;

        this.saveSupplyButton = document.getElementById("saveSupplyBtn") as HTMLButtonElement;
        this.saveShipmentButton = document.getElementById("saveShipmentBtn") as HTMLButtonElement;
        this.saveWarehouseButton = document.getElementById("saveWarehouseBtn") as HTMLButtonElement;
        this.searchInput = document.getElementById("searchSupply") as HTMLInputElement;

        this.waitForI18n().then(() => {
            new SidebarManager();
            this.loadUser();
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
        this.renderSupplies();
        this.renderWarehousesTable();
        this.updateStats();
    }

    private async loadUser(): Promise<void> {
        try {
            const userString = localStorage.getItem("user");
            if (!userString) return;

            const user = JSON.parse(userString);
            this.userPermissions = user.permissions;
        } catch (error) {
            this.showError(i18n.t("employees.messages.loadError"));
        }
    }

    private async loadInitialData(): Promise<void> {
        try {
            await Promise.all([
                this.loadSupplies(),
                this.loadPriceLists(),
                this.loadWarehouses()
            ]);
            this.updateStats();
        } catch (error) {
            console.error("Error loading initial data:", error);
            this.showError(i18n.t("medicalSupplies.messages.loadInitialDataError"));
        }
    }

    private initializeEventListeners(): void {
        document.getElementById("createSupplyBtn")?.addEventListener("click", () => {
            this.showSupplyModal();
        });

        this.saveSupplyButton.addEventListener("click", () => {
            this.handleSaveSupply();
        });

        this.saveShipmentButton.addEventListener("click", () => {
            this.handleSaveShipment();
        });

        this.saveWarehouseButton.addEventListener("click", () => {
            this.handleSaveWarehouse();
        });

        this.searchInput.addEventListener("input", this.debounce(() => {
            this.filterSupplies();
        }, 300));

        document.getElementById("manageWarehousesBtn")?.addEventListener("click", () => {
            this.showWarehouseModal();
        });

        document.getElementById("addWarehouseBtn")?.addEventListener("click", () => {
            this.showAddWarehouseModal();
        });

        // Modal reset on close
        document.getElementById("supplyModal")!.addEventListener("hidden.bs.modal", () => {
            this.resetSupplyForm();
        });

        document.getElementById("shipmentModal")!.addEventListener("hidden.bs.modal", () => {
            this.resetShipmentForm();
        });

        document.getElementById("addWarehouseModal")!.addEventListener("hidden.bs.modal", () => {
            this.resetWarehouseForm();
        });
    }

    private async loadSupplies(): Promise<void> {
        try {
            const response = await fetch("/api/pharmacy/medical-supplies", {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                }
            });

            if (!response.ok) throw new Error("Failed to fetch medical supplies");

            const supplies: MedicalSupply[] = await response.json();
            this.supplies.clear();
            supplies.forEach((supply) => this.supplies.set(supply.supply_id, supply));

            await this.loadSupplyStocks();
            this.renderSupplies();
        } catch (error) {
            console.error("Error loading medical supplies:", error);
            this.showError(i18n.t("medicalSupplies.messages.loadSuppliesError"));
        }
    }

    private async loadSupplyStocks(): Promise<void> {
        try {
            // Note: You'll need to create this endpoint or modify the existing one
            for (const supplyId of this.supplies.keys()) {
                const response = await fetch(
                    `/api/pharmacy/medical-supply-shipments/supply/${supplyId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem("token")}`
                        }
                    }
                );

                if (!response.ok) continue;

                const shipments: MedicalSupplyShipment[] = await response.json();
                const totalQuantity = shipments.reduce((sum, shipment) => sum + shipment.quantity, 0);

                this.supplyStocks.set(supplyId, {
                    total_quantity: totalQuantity,
                    shipments: shipments
                });
            }
        } catch (error) {
            console.error("Error loading supply stocks:", error);
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
        } catch (error) {
            console.error("Error loading price lists:", error);
            this.showError(i18n.t("medicalSupplies.messages.loadPriceListsError"));
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
            this.renderWarehousesTable();
        } catch (error) {
            console.error("Error loading warehouses:", error);
            this.showError(i18n.t("medicalSupplies.messages.loadWarehousesError"));
        }
    }

    private updateWarehouseSelect(): void {
        const select = document.getElementById("warehouseSelect") as HTMLSelectElement;
        const defaultOption = `<option value="">${i18n.t("medicalSupplies.placeholders.selectWarehouse")}</option>`;

        select.innerHTML = defaultOption + this.warehouses
            .map(warehouse => `
				<option value="${warehouse.warehouse_id}">
					${this.escapeHtml(warehouse.name)}
				</option>
			`)
            .join("");
    }

    private updateStats(): void {
        const totalSupplies = this.supplies.size;
        const inStock = Array.from(this.supplyStocks.values()).filter(stock => stock.total_quantity > 0).length;
        const lowStock = Array.from(this.supplies.values()).filter(supply => {
            const stock = this.supplyStocks.get(supply.supply_id);
            return stock && stock.total_quantity < (supply.min_stock_alert || 0);
        }).length;

        let totalValue = 0;
        this.supplyStocks.forEach(stock => {
            stock.shipments.forEach(shipment => {
                totalValue += shipment.quantity * parseFloat(shipment.buy_price);
            });
        });

        document.getElementById("totalSuppliesCount")!.textContent = totalSupplies.toString();
        document.getElementById("inStockCount")!.textContent = inStock.toString();
        document.getElementById("lowStockCount")!.textContent = lowStock.toString();
        document.getElementById("totalValueAmount")!.textContent = i18n.formatCurrency(totalValue);
    }

    private renderSupplies(filterTerm: string = ""): void {
        const tbody = document.getElementById("suppliesTableBody")!;
        const filteredSupplies = Array.from(this.supplies.values()).filter(
            (supply) =>
                supply.name.toLowerCase().includes(filterTerm.toLowerCase())
        );

        tbody.innerHTML = filteredSupplies
            .map((supply) => {
                const stock = this.supplyStocks.get(supply.supply_id);
                const isExpanded = this.expandedSupplies.has(supply.supply_id);
                const totalQuantity = stock?.total_quantity || 0;

                return `
					<tr class="supply-row ${isExpanded ? "expanded" : ""}" data-supply-id="${supply.supply_id}">
						<td>
							<button class="toggle-shipments ${isExpanded ? "expanded" : ""}" 
									onclick="suppliesManager.toggleShipments(${supply.supply_id})">
								<i class="bi bi-chevron-down"></i>
							</button>
						</td>
						<td>${this.escapeHtml(supply.name)}</td>
						<td>
							<span class="feature-indicator ${supply.is_obligatory_continuous ? "enabled" : "disabled"}">
								<i class="bi ${supply.is_obligatory_continuous ? "bi-check-circle-fill" : "bi-x-circle-fill"}"></i>
								${supply.is_obligatory_continuous ? i18n.t("common.yes") : i18n.t("common.no")}
							</span>
							${supply.frequency ? `<small class="d-block text-muted">${i18n.t("medicalSupplies.frequency.every")} ${supply.frequency.hours || (supply.frequency.minutes ? supply.frequency.minutes / 60 : 0)} ${i18n.t("medicalSupplies.frequency.hours")}</small>` : ""}
						</td>
						<td>
							<div class="stock-display">
								<span class="stock-quantity">${i18n.formatNumber(totalQuantity)} units</span>
								${totalQuantity < (supply.min_stock_alert || 0) ? `<span class="badge bg-danger">${i18n.t("medicalSupplies.status.lowStock")}</span>` : ""}
							</div>
						</td>
						<td>
							<div class="action-buttons">
								<button class="btn btn-sm btn-outline-primary" onclick="suppliesManager.editSupply(${supply.supply_id})">
									<i class="bi bi-pencil"></i> ${i18n.t("common.edit")}
								</button>
								<button class="btn btn-sm btn-outline-danger" onclick="suppliesManager.deleteSupply(${supply.supply_id})">
									<i class="bi bi-trash"></i> ${i18n.t("common.delete")}
								</button>
							</div>
						</td>
					</tr>
					${isExpanded ? this.renderShipmentRows(supply, stock?.shipments || []) : ""}
				`;
            })
            .join("");
    }

    private renderShipmentRows(supply: MedicalSupply, shipments: MedicalSupplyShipment[]): string {
        if (shipments.length === 0) {
            return `
				<tr class="shipment-rows">
					<td colspan="7" class="text-center py-3">
						<div class="text-muted mb-3">${i18n.t("medicalSupplies.messages.noShipments")}</div>
						<button class="btn btn-sm btn-primary" onclick="suppliesManager.showShipmentModal(${supply.supply_id})">
							<i class="bi bi-plus-circle"></i> ${i18n.t("medicalSupplies.buttons.addShipment")}
						</button>
					</td>
				</tr>
			`;
        }

        let rows = shipments.map((shipment) => {
            return `
				<tr class="shipment-rows">
					<td colspan="7">
						<div class="shipment-detail">
							<div class="row align-items-center justify-content-between">
								<div class="col-md-2">
									<strong>${i18n.t("medicalSupplies.fields.warehouse")}:</strong> ${this.escapeHtml(shipment.warehouse_name)}
								</div>
								<div class="col-md-2">
									<strong>${i18n.t("medicalSupplies.fields.buyPrice")}:</strong> ${i18n.formatCurrency(parseFloat(shipment.buy_price))}
								</div>
								<div class="col-md-2">
									<strong>${i18n.t("medicalSupplies.fields.quantity")}:</strong> ${i18n.formatNumber(shipment.quantity)} units
								</div>
								<div class="col-md-2">
									<strong>${i18n.t("medicalSupplies.fields.expiry")}:</strong> ${shipment.expiry_date ? i18n.formatDate(shipment.expiry_date) : "-"}
								</div>
								<div class="col-md-2">
									<div class="btn-group btn-group-sm" role="group">
										<button class="btn btn-primary" onclick="suppliesManager.showShipmentModal(${supply.supply_id}, ${shipment.shipment_id})" title="${i18n.t("common.edit")}">
											<i class="bi bi-pencil"></i> ${i18n.t("common.edit")}
										</button>
										<button class="btn btn-danger" onclick="suppliesManager.deleteShipment(${shipment.shipment_id}, ${supply.supply_id})" title="${i18n.t("common.delete")}">
											<i class="bi bi-trash"></i> ${i18n.t("common.delete")}
										</button>
									</div>
								</div>
							</div>
							<div class="mt-2">
								<strong>${i18n.t("medicalSupplies.fields.prices")}:</strong>
								${shipment.prices.map(price => {
                const priceList = this.priceLists.find(pl => pl.pricelist_id === price.pricelist_id);
                return `
										<span class="price-badge">
											${this.escapeHtml(priceList?.name || "")}: ${i18n.formatCurrency(parseFloat(price.price))}
										</span>
									`;
            }).join("")}
							</div>
						</div>
					</td>
				</tr>
			`;
        });

        rows.push(`
			<tr class="shipment-rows">
				<td colspan="7" class="text-center py-2">
					<button class="btn btn-sm btn-outline-primary" onclick="suppliesManager.showShipmentModal(${supply.supply_id})">
						<i class="bi bi-plus-circle"></i> ${i18n.t("medicalSupplies.buttons.addShipment")}
					</button>
				</td>
			</tr>
		`);

        return rows.join("");
    }

    public toggleShipments(supplyId: number): void {
        if (this.expandedSupplies.has(supplyId)) {
            this.expandedSupplies.delete(supplyId);
        } else {
            this.expandedSupplies.add(supplyId);
        }
        this.renderSupplies(this.searchInput.value);
    }

    private filterSupplies(): void {
        this.renderSupplies(this.searchInput.value);
    }

    private showSupplyModal(supply?: MedicalSupply): void {
        this.resetSupplyForm();

        if (supply) {
            document.getElementById("supplyModalLabel")!.textContent = i18n.t("medicalSupplies.modals.editSupply");
            (document.getElementById("supplyId") as HTMLInputElement).value = supply.supply_id.toString();
            (document.getElementById("supplyName") as HTMLInputElement).value = supply.name;
            (document.getElementById("saleQuantity") as HTMLInputElement).value = supply.sale_quantity.toString();
            (document.getElementById("minStockAlert") as HTMLInputElement).value = supply.min_stock_alert?.toString() || "";
            (document.getElementById("isObligatoryContinuous") as HTMLInputElement).checked = supply.is_obligatory_continuous;
            let freqValue = "";
            if (supply.frequency) {
                if (supply.frequency.hours) freqValue = supply.frequency.hours.toString();
                else if (supply.frequency.minutes) freqValue = (supply.frequency.minutes / 60).toString();
            }
            (document.getElementById("frequency") as HTMLInputElement).value = freqValue;
        } else {
            document.getElementById("supplyModalLabel")!.textContent = i18n.t("medicalSupplies.modals.createSupply");
        }

        this.supplyModal.show();
    }

    public editSupply(supplyId: number): void {
        const supply = this.supplies.get(supplyId);
        if (supply) {
            this.showSupplyModal(supply);
        }
    }

    public async deleteSupply(supplyId: number): Promise<void> {
        const result = await Swal.fire({
            title: i18n.t("medicalSupplies.confirmations.deleteSupplyTitle"),
            text: i18n.t("medicalSupplies.confirmations.deleteSupplyText"),
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: i18n.t("common.delete"),
            cancelButtonText: i18n.t("common.cancel")
        });

        if (!result.isConfirmed) return;

        try {
            const response = await fetch(`/api/pharmacy/medical-supplies/${supplyId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                }
            });

            if (!response.ok) throw new Error("Failed to delete supply");

            this.showSuccess(i18n.t("medicalSupplies.messages.deleteSuccess"));
            await this.loadSupplies();
            this.updateStats();
        } catch (error) {
            console.error("Error deleting supply:", error);
            this.showError(i18n.t("medicalSupplies.messages.deleteError"));
        }
    }

    private async handleSaveSupply(): Promise<void> {
        if (!this.supplyForm.checkValidity()) {
            this.supplyForm.classList.add("was-validated");
            return;
        }

        const supplyId = (document.getElementById("supplyId") as HTMLInputElement).value;
        const supplyData = {
            name: (document.getElementById("supplyName") as HTMLInputElement).value,
            sale_quantity: parseInt((document.getElementById("saleQuantity") as HTMLInputElement).value),
            min_stock_alert: parseInt((document.getElementById("minStockAlert") as HTMLInputElement).value) || null,
            is_obligatory_continuous: (document.getElementById("isObligatoryContinuous") as HTMLInputElement).checked,
            frequency: (document.getElementById("frequency") as HTMLInputElement).value ? `${(document.getElementById("frequency") as HTMLInputElement).value} hours` : null
        };

        this.setButtonLoading(this.saveSupplyButton, true);

        try {
            const url = supplyId
                ? `/api/pharmacy/medical-supplies/${supplyId}`
                : "/api/pharmacy/medical-supplies";

            const method = supplyId ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(supplyData)
            });

            if (!response.ok) throw new Error("Failed to save supply");

            this.showSuccess(i18n.t(supplyId ? "medicalSupplies.messages.updateSuccess" : "medicalSupplies.messages.createSuccess"));
            this.supplyModal.hide();
            await this.loadSupplies();
            this.updateStats();
        } catch (error) {
            console.error("Error saving supply:", error);
            this.showError(i18n.t("medicalSupplies.messages.saveError"));
        } finally {
            this.setButtonLoading(this.saveSupplyButton, false);
        }
    }

    public showShipmentModal(supplyId: number, shipmentId?: number): void {
        this.resetShipmentForm();
        this.currentSupply = this.supplies.get(supplyId) || null;

        (document.getElementById("shipmentSupplyId") as HTMLInputElement).value = supplyId.toString();

        if (shipmentId) {
            // Load shipment data for editing
            const stock = this.supplyStocks.get(supplyId);
            const shipment = stock?.shipments.find(s => s.shipment_id === shipmentId);

            if (shipment) {
                document.getElementById("shipmentModalLabel")!.textContent = i18n.t("medicalSupplies.modals.editShipment");
                (document.getElementById("shipmentId") as HTMLInputElement).value = shipmentId.toString();
                (document.getElementById("warehouseSelect") as HTMLSelectElement).value = shipment.warehouse_id.toString();
                (document.getElementById("quantity") as HTMLInputElement).value = shipment.quantity.toString();
                (document.getElementById("buyPrice") as HTMLInputElement).value = shipment.buy_price;
                (document.getElementById("expiryDate") as HTMLInputElement).value = shipment.expiry_date || "";

                this.populatePriceListInputs(shipment.prices);
            }
        } else {
            document.getElementById("shipmentModalLabel")!.textContent = i18n.t("medicalSupplies.modals.addShipment");
            this.populatePriceListInputs();
        }

        this.shipmentModal.show();
    }

    private populatePriceListInputs(existingPrices: ShipmentPrice[] = []): void {
        const container = document.getElementById("priceListContainer")!;
        container.innerHTML = this.priceLists.map(priceList => {
            const existingPrice = existingPrices.find(p => p.pricelist_id === priceList.pricelist_id);
            return `
				<div class="mb-3">
					<label for="price_${priceList.pricelist_id}" class="form-label">
						${this.escapeHtml(priceList.name)} ${priceList.is_default ? `<span class="badge bg-primary">${i18n.t("common.default")}</span>` : ""}
					</label>
					<div class="input-group">
						<span class="input-group-text">${i18n.t("common.currency")}</span>
						<input type="number" class="form-control" id="price_${priceList.pricelist_id}" 
							   data-pricelist-id="${priceList.pricelist_id}" 
							   min="0.01" step="0.01" value="${existingPrice?.price || ""}" required>
					</div>
				</div>
			`;
        }).join("");
    }

    private async handleSaveShipment(): Promise<void> {
        if (!this.shipmentForm.checkValidity()) {
            this.shipmentForm.classList.add("was-validated");
            return;
        }

        const shipmentId = (document.getElementById("shipmentId") as HTMLInputElement).value;
        const supplyId = parseInt((document.getElementById("shipmentSupplyId") as HTMLInputElement).value);

        const prices: ShipmentPrice[] = this.priceLists.map(priceList => ({
            pricelist_id: priceList.pricelist_id,
            price: (document.getElementById(`price_${priceList.pricelist_id}`) as HTMLInputElement).value
        }));

        const shipmentData = {
            supply_id: supplyId,
            warehouse_id: parseInt((document.getElementById("warehouseSelect") as HTMLSelectElement).value),
            quantity: parseInt((document.getElementById("quantity") as HTMLInputElement).value),
            buy_price: parseFloat((document.getElementById("buyPrice") as HTMLInputElement).value),
            expiry_date: (document.getElementById("expiryDate") as HTMLInputElement).value || null,
            prices
        };

        this.setButtonLoading(this.saveShipmentButton, true);

        try {
            const url = shipmentId
                ? `/api/pharmacy/medical-supply-shipments/${shipmentId}`
                : "/api/pharmacy/medical-supply-shipments";

            const method = shipmentId ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(shipmentData)
            });

            if (!response.ok) throw new Error("Failed to save shipment");

            this.showSuccess(i18n.t(shipmentId ? "medicalSupplies.messages.shipmentUpdateSuccess" : "medicalSupplies.messages.shipmentCreateSuccess"));
            this.shipmentModal.hide();
            await this.loadSupplies();
            this.updateStats();
        } catch (error) {
            console.error("Error saving shipment:", error);
            this.showError(i18n.t("medicalSupplies.messages.shipmentSaveError"));
        } finally {
            this.setButtonLoading(this.saveShipmentButton, false);
        }
    }

    public async deleteShipment(shipmentId: number, supplyId: number): Promise<void> {
        const result = await Swal.fire({
            title: i18n.t("medicalSupplies.confirmations.deleteShipmentTitle"),
            text: i18n.t("medicalSupplies.confirmations.deleteShipmentText"),
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: i18n.t("common.delete"),
            cancelButtonText: i18n.t("common.cancel")
        });

        if (!result.isConfirmed) return;

        try {
            const response = await fetch(`/api/pharmacy/medical-supply-shipments/${shipmentId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                }
            });

            if (!response.ok) throw new Error("Failed to delete shipment");

            this.showSuccess(i18n.t("medicalSupplies.messages.shipmentDeleteSuccess"));
            await this.loadSupplies();
            this.updateStats();
        } catch (error) {
            console.error("Error deleting shipment:", error);
            this.showError(i18n.t("medicalSupplies.messages.shipmentDeleteError"));
        }
    }

    private showWarehouseModal(): void {
        this.renderWarehousesTable();
        this.warehouseModal.show();
    }

    private showAddWarehouseModal(warehouse?: Warehouse): void {
        this.resetWarehouseForm();

        if (warehouse) {
            document.getElementById("addWarehouseModalLabel")!.textContent = i18n.t("medicalSupplies.modals.editWarehouse");
            (document.getElementById("warehouseId") as HTMLInputElement).value = warehouse.warehouse_id.toString();
            (document.getElementById("warehouseName") as HTMLInputElement).value = warehouse.name;
            (document.getElementById("warehouseLocation") as HTMLTextAreaElement).value = warehouse.location;
        } else {
            document.getElementById("addWarehouseModalLabel")!.textContent = i18n.t("medicalSupplies.modals.addWarehouse");
        }

        this.addWarehouseModal.show();
    }

    private async handleSaveWarehouse(): Promise<void> {
        if (!this.warehouseForm.checkValidity()) {
            this.warehouseForm.classList.add("was-validated");
            return;
        }

        const warehouseId = (document.getElementById("warehouseId") as HTMLInputElement).value;
        const warehouseData = {
            name: (document.getElementById("warehouseName") as HTMLInputElement).value,
            location: (document.getElementById("warehouseLocation") as HTMLTextAreaElement).value
        };

        this.setButtonLoading(this.saveWarehouseButton, true);

        try {
            const url = warehouseId
                ? `/api/warehouse/${warehouseId}`
                : "/api/warehouse";

            const method = warehouseId ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(warehouseData)
            });

            if (!response.ok) throw new Error("Failed to save warehouse");

            this.showSuccess(i18n.t(warehouseId ? "medicalSupplies.messages.warehouseUpdateSuccess" : "medicalSupplies.messages.warehouseCreateSuccess"));
            this.addWarehouseModal.hide();
            await this.loadWarehouses();
        } catch (error) {
            console.error("Error saving warehouse:", error);
            this.showError(i18n.t("medicalSupplies.messages.warehouseSaveError"));
        } finally {
            this.setButtonLoading(this.saveWarehouseButton, false);
        }
    }

    private renderWarehousesTable(): void {
        const tbody = document.getElementById("warehousesTableBody")!;
        tbody.innerHTML = this.warehouses.map(warehouse => `
			<tr>
				<td>${this.escapeHtml(warehouse.name)}</td>
				<td>${this.escapeHtml(warehouse.location)}</td>
				<td>${warehouse.total_shipments || 0}</td>
				<td>
					<button class="btn btn-sm btn-outline-primary" onclick="suppliesManager.editWarehouse(${warehouse.warehouse_id})">
						<i class="bi bi-pencil"></i> ${i18n.t("common.edit")}
					</button>
					<button class="btn btn-sm btn-outline-danger" onclick="suppliesManager.deleteWarehouse(${warehouse.warehouse_id})">
						<i class="bi bi-trash"></i> ${i18n.t("common.delete")}
					</button>
				</td>
			</tr>
		`).join("");
    }

    public editWarehouse(warehouseId: number): void {
        const warehouse = this.warehouses.find(w => w.warehouse_id === warehouseId);
        if (warehouse) {
            this.showAddWarehouseModal(warehouse);
        }
    }

    public async deleteWarehouse(warehouseId: number): Promise<void> {
        const result = await Swal.fire({
            title: i18n.t("medicalSupplies.confirmations.deleteWarehouseTitle"),
            text: i18n.t("medicalSupplies.confirmations.deleteWarehouseText"),
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: i18n.t("common.delete"),
            cancelButtonText: i18n.t("common.cancel")
        });

        if (!result.isConfirmed) return;

        try {
            const response = await fetch(`/api/warehouse/${warehouseId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                }
            });

            if (!response.ok) throw new Error("Failed to delete warehouse");

            this.showSuccess(i18n.t("medicalSupplies.messages.warehouseDeleteSuccess"));
            await this.loadWarehouses();
        } catch (error) {
            console.error("Error deleting warehouse:", error);
            this.showError(i18n.t("medicalSupplies.messages.warehouseDeleteError"));
        }
    }

    private resetSupplyForm(): void {
        this.supplyForm.reset();
        this.supplyForm.classList.remove("was-validated");
        (document.getElementById("supplyId") as HTMLInputElement).value = "";
    }

    private resetShipmentForm(): void {
        this.shipmentForm.reset();
        this.shipmentForm.classList.remove("was-validated");
        (document.getElementById("shipmentId") as HTMLInputElement).value = "";
        (document.getElementById("shipmentSupplyId") as HTMLInputElement).value = "";
    }

    private resetWarehouseForm(): void {
        this.warehouseForm.reset();
        this.warehouseForm.classList.remove("was-validated");
        (document.getElementById("warehouseId") as HTMLInputElement).value = "";
    }

    private setButtonLoading(button: HTMLButtonElement, loading: boolean): void {
        const spinner = button.querySelector(".spinner-border");
        const text = button.querySelector(".btn-text");

        if (loading) {
            spinner?.classList.remove("d-none");
            button.disabled = true;
        } else {
            spinner?.classList.add("d-none");
            button.disabled = false;
        }
    }

    private showSuccess(message: string): void {
        Swal.fire({
            icon: "success",
            title: i18n.t("common.success"),
            text: message,
            timer: 3000,
            showConfirmButton: false
        });
    }

    private showError(message: string): void {
        Swal.fire({
            icon: "error",
            title: i18n.t("common.error"),
            text: message
        });
    }

    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    private debounce(func: Function, wait: number): (...args: any[]) => void {
        let timeout: NodeJS.Timeout;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
}

// Initialize the manager
const suppliesManager = new MedicalSuppliesManager();

// Export for use in HTML onclick handlers
//@ts-ignore
window.suppliesManager = suppliesManager;
