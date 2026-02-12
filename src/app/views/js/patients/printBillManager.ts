//@ts-ignore
import Swal from "../../sweetalert2/src/sweetalert2.js";
import { generatePatientBill } from "../utils/pdfGenerator.js";
import { i18n } from "../utils/i18n.js";

interface PrintBillItem {
	id: string;
	type: "service" | "drug" | "supply";
	service_id?: number;
	service_name?: string;
	drug_shipment_id?: number;
	drug_name?: string;
	medical_supply_shipment_id?: number;
	medical_supply_name?: string;
	description: string;
	quantity: number;
	unit_price: number;
}

interface PatientHistory {
	patient_history_id: number;
	patient_id: number;
	bill_id: number | null;
	diagnosis: string | null;
	admission_time: Date;
	discharge_time: Date | null;
	attending_doctors?: string[];
	attending_doctor_ids?: number[];
	attending_nurses?: string[];
	attending_nurse_ids?: number[];
	total_amount?: number;
	paid_amount?: number;
	pricelist_id: number | null;
	quick_check: boolean;
}

export class PrintBillManager {
	//@ts-ignore
	private printCustomizationModal: Modal;
	//@ts-ignore
	private addItemToPrintModal: Modal;
	private customBillItems: PrintBillItem[] = [];
	private customBillData: any = {};

	// Dependencies injected from PatientManager
	private availableServices: any[] = [];
	private availableDrugs: any[] = [];
	private servicePrices: Map<number, number> = new Map();
	private currentAdmission: PatientHistory | null = null;
	private showSuccess: (message: string) => void;
	private showError: (message: string) => void;
	private escapeHtml: (text: string) => string;
	private formatServiceType: (type: string) => string;

	constructor(
		availableServices: any[],
		availableDrugs: any[],
		servicePrices: Map<number, number>,
		showSuccess: (message: string) => void,
		showError: (message: string) => void,
		escapeHtml: (text: string) => string,
		formatServiceType: (type: string) => string
	) {
		this.availableServices = availableServices;
		this.availableDrugs = availableDrugs;
		this.servicePrices = servicePrices;
		this.showSuccess = showSuccess;
		this.showError = showError;
		this.escapeHtml = escapeHtml;
		this.formatServiceType = formatServiceType;

		this.initializeModals();
		this.initializeEventListeners();
	}

	private initializeModals(): void {
		//@ts-ignore
		this.printCustomizationModal = new bootstrap.Modal(
			document.getElementById("printCustomizationModal")!
		);
		//@ts-ignore
		this.addItemToPrintModal = new bootstrap.Modal(
			document.getElementById("addItemToPrintModal")!
		);
	}

	private initializeEventListeners(): void {
		// Print customization modal events
		document
			.getElementById("addPrintServiceBtn")
			?.addEventListener("click", () => {
				this.showAddItemModal("service");
			});

		document
			.getElementById("addPrintDrugBtn")
			?.addEventListener("click", () => {
				this.showAddItemModal("drug");
			});

		document
			.getElementById("generateCustomPdfBtn")
			?.addEventListener("click", () => {
				this.generateCustomPdf();
			});

		// Billing calculation events for print modal
		[
			"printDiscount",
			"printDiscountType",
			"printVatPercentage",
			"printVatScope",
			"printAdminExpenses",
			"printIncludeDiscount",
			"printMedicalTestsAmount"
		].forEach((id) => {
			document.getElementById(id)?.addEventListener("input", () => {
				this.calculatePrintBilling();
			});
			document.getElementById(id)?.addEventListener("change", () => {
				this.calculatePrintBilling();
			});
		});

		// Scope checkboxes listeners
		document.querySelectorAll('.print-discount-scope').forEach(checkbox => {
			checkbox.addEventListener('change', () => this.calculatePrintBilling());
		});

		document.querySelectorAll('.print-vat-scope').forEach(checkbox => {
			checkbox.addEventListener('change', () => this.calculatePrintBilling());
		});

		// Search events for add item modal
		document
			.getElementById("serviceSearchInput")
			?.addEventListener("input", (e) => {
				this.filterPrintServices((e.target as HTMLInputElement).value);
			});

		document
			.getElementById("drugSearchInput")
			?.addEventListener("input", (e) => {
				this.filterPrintDrugs((e.target as HTMLInputElement).value);
			});
	}

	public async showPrintModal(patient: any, bill: any): Promise<void> {
		if (!bill || !patient) {
			this.showError(
				i18n.t("patients.printBill.messages.noBillOrPatient")
			);
			return;
		}

		try {
			// Initialize custom bill data with current bill
			this.initializeCustomBillData(patient, bill);

			// Populate the modal
			this.populatePrintModal();

			// Show the customization modal
			this.printCustomizationModal.show();
		} catch (error) {
			console.error("Error preparing print modal:", error);
			this.showError(i18n.t("patients.printBill.messages.prepareFailed"));
		}
	}

	private initializeCustomBillData(patient: any, bill: any): void {
		// Clone current bill details and group them
		this.customBillItems = this.groupBillDetails([...bill.bill_details]);

		this.customBillData = {
			patient: { ...patient },
			bill: { ...bill },
			discount: bill.discount || 0,
			discountType: bill.discount_type || "fixed",
			vatPercentage: bill.vat_percentage || 0,
			adminExpenses: bill.administrative_expenses || 0,
			medicalTestsAmount: bill.medical_tests_amount || 0
		};
	}

	private groupBillDetails(billDetails: any[]): PrintBillItem[] {
		const grouped = new Map<string, PrintBillItem>();

		billDetails.forEach((detail) => {
			const key = detail.service_id
				? `service_${detail.service_id}`
				: detail.drug_shipment_id
					? `drug_${detail.drug_shipment_id}`
					: `supply_${detail.medical_supply_shipment_id}`;

			if (grouped.has(key)) {
				const existing = grouped.get(key)!;
				existing.quantity += detail.quantity;
			} else {
				let type: "service" | "drug" | "supply" = "supply";
				if (detail.service_id) type = "service";
				else if (detail.drug_shipment_id) type = "drug";

				grouped.set(key, {
					id: key,
					type: type,
					service_id: detail.service_id,
					service_name: detail.service_name,
					drug_shipment_id: detail.drug_shipment_id,
					drug_name: detail.drug_name,
					medical_supply_shipment_id: detail.medical_supply_shipment_id,
					medical_supply_name: detail.medical_supply_name,
					description:
						detail.service_name ||
						detail.drug_name ||
						detail.medical_supply_name ||
						i18n.t("patients.printBill.unknownItem"),
					quantity: detail.quantity,
					unit_price: detail.unit_price
				});
			}
		});

		return Array.from(grouped.values());
	}

	private populatePrintModal(): void {
		// Populate patient info
		document.getElementById("printPatientName")!.textContent =
			this.customBillData.patient.name;
		document.getElementById("printPatientPhone")!.textContent =
			this.customBillData.patient.phone || i18n.t("common.unknown");
		document.getElementById("printPaymentType")!.textContent =
			this.customBillData.patient.payment_type.charAt(0).toUpperCase() +
			this.customBillData.patient.payment_type.slice(1);
		document.getElementById("printBillId")!.textContent =
			this.customBillData.bill.bill_id.toString();

		// Populate billing fields
		(document.getElementById("printDiscount") as HTMLInputElement).value =
			this.customBillData.discount.toString();
		(
			document.getElementById("printDiscountType") as HTMLInputElement
		).checked = this.customBillData.discountType === "percentage";
		(
			document.getElementById("printVatPercentage") as HTMLInputElement
		).value = this.customBillData.vatPercentage.toString();

		// Populate discount scope checkboxes
		const discountScope = this.customBillData.bill.discount_scope || ["services", "drugs", "supplies", "tests"];
		document.querySelectorAll('.print-discount-scope').forEach((checkbox: any) => {
			checkbox.checked = discountScope.includes(checkbox.value);
		});

		// Populate VAT scope checkboxes
		const vatScopeCustom = this.customBillData.bill.vat_scope_custom || ["services", "drugs", "supplies", "tests"];
		document.querySelectorAll('.print-vat-scope').forEach((checkbox: any) => {
			checkbox.checked = vatScopeCustom.includes(checkbox.value);
		});

		(document.getElementById("printVatScope") as HTMLSelectElement).value =
			this.customBillData.bill.vat_scope || "both";
		(
			document.getElementById("printAdminExpenses") as HTMLInputElement
		).value = (this.customBillData.bill.administrative_expenses || 0).toString();
		(
			document.getElementById("printMedicalTestsAmount") as HTMLInputElement
		).value = (this.customBillData.bill.medical_tests_amount || 0).toString();
		(
			document.getElementById("printIncludeDiscount") as HTMLInputElement
		).checked = true;

		// Populate paid amount (read-only)
		document.getElementById("printPaidAmount")!.textContent =
			i18n.formatCurrency(
				parseInt(
					this.customBillData.bill.paid_amount as unknown as string
				)
			);

		// Populate bill items
		this.updatePrintBillItemsTable();

		// Calculate totals
		this.calculatePrintBilling();
	}

	private updatePrintBillItemsTable(): void {
		const tbody = document.getElementById("printBillItemsBody")!;

		if (this.customBillItems.length === 0) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">${i18n.t(
				"patients.printBill.noItemsInBill"
			)}</td></tr>`;
			return;
		}

		tbody.innerHTML = this.customBillItems
			.map(
				(item, index) => `
            <tr>
                <td>
                    <div class="fw-medium">${this.escapeHtml(
					item.description
				)}</div>
                    <small class="text-muted">${item.type === "service"
						? i18n.t("patients.printBill.itemTypes.service")
						: item.type === "supply"
							? i18n.t("patients.printBill.itemTypes.supply")
							: i18n.t("patients.printBill.itemTypes.drug")
					}</small>
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           value="${item.quantity}" min="1" step="1"
                           onchange="window.printBillManager.updatePrintItemQuantity(${index}, this.value)">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           value="${item.unit_price}" min="0" step="0.01"
                           onchange="window.printBillManager.updatePrintItemPrice(${index}, this.value)">
                </td>
                <td class="fw-bold">${i18n.formatCurrency(
						item.quantity * item.unit_price
					)}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-danger" 
                            onclick="window.printBillManager.removePrintItem(${index})"
                            title="${i18n.t("common.delete")}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `
			)
			.join("");
	}

	public updatePrintItemQuantity(index: number, quantity: string): void {
		const qty = parseInt(quantity) || 1;
		if (this.customBillItems[index]) {
			this.customBillItems[index].quantity = Math.max(1, qty);
			this.updatePrintBillItemsTable();
			this.calculatePrintBilling();
		}
	}

	public updatePrintItemPrice(index: number, price: string): void {
		const prc = parseFloat(price) || 0;
		if (this.customBillItems[index]) {
			this.customBillItems[index].unit_price = Math.max(0, prc);
			this.updatePrintBillItemsTable();
			this.calculatePrintBilling();
		}
	}

	public removePrintItem(index: number): void {
		this.customBillItems.splice(index, 1);
		this.updatePrintBillItemsTable();
		this.calculatePrintBilling();
	}

	private calculatePrintBilling(): void {
		// Calculate services, drugs, and supplies totals separately
		let servicesTotal = 0;
		let drugsTotal = 0;
		let suppliesTotal = 0;

		this.customBillItems.forEach((item) => {
			const lineTotal = item.quantity * item.unit_price;
			if (item.type === "service") {
				servicesTotal += lineTotal;
			} else if (item.type === "drug") {
				drugsTotal += lineTotal;
			} else if (item.type === "supply") {
				suppliesTotal += lineTotal; // Separate total for supplies
			}
		});

		const medicalTestsAmount =
			parseFloat(
				(
					document.getElementById(
						"printMedicalTestsAmount"
					) as HTMLInputElement
				).value
			) || 0;

		const subtotal = servicesTotal + drugsTotal + suppliesTotal + medicalTestsAmount;

		// Get form values
		const includeDiscount = (
			document.getElementById("printIncludeDiscount") as HTMLInputElement
		).checked;
		const discount =
			parseFloat(
				(document.getElementById("printDiscount") as HTMLInputElement)
					.value
			) || 0;
		const isDiscountPercentage = (
			document.getElementById("printDiscountType") as HTMLInputElement
		).checked;
		const vatPercentage =
			parseFloat(
				(
					document.getElementById(
						"printVatPercentage"
					) as HTMLInputElement
				).value
			) || 0;

		// Get scopes from UI
		const discountScope: string[] = [];
		document.querySelectorAll('.print-discount-scope:checked').forEach((cb: any) => discountScope.push(cb.value));

		const vatScope: string[] = [];
		document.querySelectorAll('.print-vat-scope:checked').forEach((cb: any) => vatScope.push(cb.value));

		const adminExpenses =
			parseFloat(
				(
					document.getElementById(
						"printAdminExpenses"
					) as HTMLInputElement
				).value
			) || 0;

		// Category totals map
		const categoryTotals: Record<string, number> = {
			services: servicesTotal,
			drugs: drugsTotal,
			supplies: suppliesTotal,
			tests: medicalTestsAmount
		};

		// Calculate discount amount (but only apply if includeDiscount is checked)
		let discountAmount = 0;
		if (includeDiscount) {
			// Calculate discount only on selected categories
			let discountableAmount = 0;
			discountScope.forEach(category => {
				if (categoryTotals[category] !== undefined) {
					discountableAmount += categoryTotals[category];
				}
			});

			if (discountableAmount > 0) {
				if (isDiscountPercentage) {
					discountAmount = (discountableAmount * discount) / 100;
				} else {
					discountAmount = discount;
				}
			}
		}

		const totalAfterDiscount = subtotal - discountAmount;

		// Calculate VAT only on selected categories after discount
		let vattableCategoriesTotal = 0;
		vatScope.forEach(category => {
			if (categoryTotals[category] !== undefined) {
				vattableCategoriesTotal += categoryTotals[category];
			}
		});

		let vatBase = 0;
		let vattableAfterDiscount = 0;
		if (vattableCategoriesTotal > 0) {
			// Calculate proportional discount for vattable categories
			// We need to know how much discount was applied to the vattable items

			// If discountAmount is 0, then base is just the category total
			if (discountAmount === 0) {
				vattableAfterDiscount = vattableCategoriesTotal;
			} else {
				// Find overlap
				let vattableAndDiscountableTotal = 0;
				let discountableAmount = 0;

				// Re-calculate discountable amount to be safe
				discountScope.forEach(category => {
					if (categoryTotals[category] !== undefined) {
						discountableAmount += categoryTotals[category];
					}
				});

				if (discountableAmount > 0) {
					vatScope.forEach(category => {
						if (discountScope.includes(category) && categoryTotals[category] !== undefined) {
							vattableAndDiscountableTotal += categoryTotals[category];
						}
					});

					const vattableDiscount = (vattableAndDiscountableTotal / discountableAmount) * discountAmount;
					vattableAfterDiscount = vattableCategoriesTotal - vattableDiscount;
				} else {
					vattableAfterDiscount = vattableCategoriesTotal;
				}
			}
		}

		vatBase = vattableAfterDiscount;

		// VAT calculation includes administrative expenses (matching patients file logic)
		const vatAmount = ((vatBase + adminExpenses) * vatPercentage) / 100;

		// Calculate total
		const totalAmount = totalAfterDiscount + vatAmount + adminExpenses;
		const paidAmount = this.customBillData.bill.paid_amount || 0;
		const balance = totalAmount - paidAmount;

		// Update display
		document.getElementById("printSubtotal")!.textContent =
			i18n.formatCurrency(subtotal);
		document.getElementById("printServicesTotal")!.textContent =
			i18n.formatCurrency(servicesTotal);
		document.getElementById("printDrugsTotal")!.textContent =
			i18n.formatCurrency(drugsTotal);
		document.getElementById("printSuppliesTotal")!.textContent =
			i18n.formatCurrency(suppliesTotal);
		document.getElementById("printMedicalTestsTotal")!.textContent =
			i18n.formatCurrency(medicalTestsAmount);
		document.getElementById("printDiscountAmount")!.textContent =
			i18n.formatCurrency(discountAmount);
		document.getElementById("printVatAmount")!.textContent =
			i18n.formatCurrency(vatAmount);
		document.getElementById("printTotalAmount")!.textContent =
			i18n.formatCurrency(totalAmount);
		document.getElementById("printBalance")!.textContent =
			i18n.formatCurrency(balance);

		// Enable/disable discount fields based on checkbox
		const discountInput = document.getElementById(
			"printDiscount"
		) as HTMLInputElement;
		const discountTypeInput = document.getElementById(
			"printDiscountType"
		) as HTMLInputElement;
		discountInput.disabled = !includeDiscount;
		discountTypeInput.disabled = !includeDiscount;

		// Disable/Enable discount scope checkboxes
		document.querySelectorAll('.print-discount-scope').forEach((checkbox: any) => {
			checkbox.disabled = !includeDiscount;
		});

		// Update visual styling
		const discountContainer = discountInput.closest(
			".col-md-3"
		) as HTMLElement;
		if (discountContainer) {
			discountContainer.style.opacity = includeDiscount ? "1" : "0.6";
		}
	}

	private async showAddItemModal(type: "service" | "drug"): Promise<void> {
		// Set active tab
		if (type === "service") {
			(
				document.getElementById("services-tab") as HTMLButtonElement
			).click();
		} else {
			(document.getElementById("drugs-tab") as HTMLButtonElement).click();
		}

		// Populate available items
		await this.populateAvailableItemsForPrint();

		// Show modal
		this.addItemToPrintModal.show();
	}

	private async populateAvailableItemsForPrint(): Promise<void> {
		// Populate services
		const servicesContainer = document.getElementById(
			"availableServicesForPrint"
		)!;
		servicesContainer.innerHTML = this.availableServices
			.map((service) => {
				const price =
					this.servicePrices.get(service.service_id) ||
					service.price ||
					0;
				return `
				<div class="print-item-row" onclick="window.printBillManager.addPrintItem('service', ${service.service_id
					})">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="print-item-name">${this.escapeHtml(
						service.name
					)}</div>
                            <div class="print-item-details">
                                ${i18n.t(
						"patients.printBill.type"
					)}: ${this.formatServiceType(
						service.service_type
					)}
                                ${service.auto_renew
						? " • " +
						i18n.t("patients.printBill.autoRenew")
						: ""
					}
                            </div>
                        </div>
                        <div class="print-item-price">${i18n.formatCurrency(
						price
					)}</div>
                    </div>
                </div>
            `;
			})
			.join("");

		// Populate drugs
		const drugsContainer = document.getElementById(
			"availableDrugsForPrint"
		)!;
		drugsContainer.innerHTML = await this.renderAvailableDrugs(
			this.availableDrugs
		);
	}

	private async renderAvailableDrugs(drugList: any[]): Promise<string> {
		return (
			await Promise.all(
				drugList
					.filter((drug) => drug.available_quantity > 0)
					.map(async (drug) => {
						let drugShipments = await this.getAvailableShipments(
							drug.drug_id
						);

						const shipment = drugShipments[0];

						const sellingPrice = shipment.prices?.find(
							(p: any) =>
								p.pricelist_id ==
								this.currentAdmission?.pricelist_id
						)!.price;

						return `
			            <div class="print-item-row" onclick="window.printBillManager.addPrintItem('drug', ${drug.drug_id
							}, ${sellingPrice})">
			                <div class="d-flex justify-content-between align-items-center">
			                    <div>
			                        <div class="print-item-name">${this.escapeHtml(
								drug.name
							)}</div>
			                        <div class="print-item-details">
			                            ${i18n.t("patients.printBill.available")}: ${drug.available_quantity
							} ${drug.unit_conversion?.smaller ||
							i18n.t("common.units")
							}
			                            ${drug.manufacturer
								? ` • ${drug.manufacturer}`
								: ""
							}
			                        </div>
			                    </div>
			                    <div class="print-item-price">${i18n.formatCurrency(
								sellingPrice || 0
							)}</div>
			                </div>
			            </div>
			        `;
					})
			)
		).join("");
	}

	private async getAvailableShipments(drugId: number): Promise<any[]> {
		try {
			let pricelistId = this.currentAdmission?.pricelist_id;
			if (!pricelistId) {
				const defRes = await fetch("/api/price-lists/default", {
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (defRes.ok) {
					const defPl = await defRes.json();
					pricelistId = defPl.pricelist_id;
				}
			}
			const url = `/api/pharmacy/drugs/shipments/drug/${drugId}`;

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`
				}
			});

			if (!response.ok) throw new Error("Failed to fetch shipments");

			return await response.json();
		} catch (error) {
			console.error("Error fetching shipments:", error);
			return [];
		}
	}

	private filterPrintServices(searchTerm: string): void {
		const servicesContainer = document.getElementById(
			"availableServicesForPrint"
		)!;
		const filteredServices = this.availableServices.filter((service) =>
			service.name.toLowerCase().includes(searchTerm.toLowerCase())
		);

		servicesContainer.innerHTML = filteredServices
			.map((service) => {
				const price =
					this.servicePrices.get(service.service_id) ||
					service.price ||
					0;
				return `
                <div class="print-item-row" onclick="window.printBillManager.addPrintItem('service', ${service.service_id
					})">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="print-item-name">${this.escapeHtml(
						service.name
					)}</div>
                            <div class="print-item-details">
                                ${i18n.t(
						"patients.printBill.type"
					)}: ${this.formatServiceType(
						service.service_type
					)}
                                ${service.auto_renew
						? " • " +
						i18n.t("patients.printBill.autoRenew")
						: ""
					}
                            </div>
                        </div>
                        <div class="print-item-price">${i18n.formatCurrency(
						price
					)}</div>
                    </div>
                </div>
            `;
			})
			.join("");
	}

	private async filterPrintDrugs(searchTerm: string): Promise<void> {
		const drugsContainer = document.getElementById(
			"availableDrugsForPrint"
		)!;

		const filteredDrugs = this.availableDrugs.filter(
			(drug) =>
				drug.available_quantity > 0 &&
				drug.name.toLowerCase().includes(searchTerm.toLowerCase())
		);

		drugsContainer.innerHTML = await this.renderAvailableDrugs(
			filteredDrugs
		);
	}

	public addPrintItem(
		type: "service" | "drug",
		itemId: number,
		drugPrice: number | null = null
	): void {
		let item: any = null;
		let newBillItem: PrintBillItem | null = null;

		if (type === "service") {
			item = this.availableServices.find((s) => s.service_id === itemId);
			if (item) {
				const price =
					this.servicePrices.get(item.service_id) || item.price || 0;
				newBillItem = {
					id: `service_${item.service_id}`,
					type: "service",
					service_id: item.service_id,
					service_name: item.name,
					drug_shipment_id: undefined,
					drug_name: undefined,
					description: item.name,
					quantity: 1,
					unit_price: price
				};
			}
		} else {
			item = this.availableDrugs.find((d) => d.drug_id === itemId);
			if (item) {
				newBillItem = {
					id: `drug_${item.drug_id}`,
					type: "drug",
					service_id: undefined,
					service_name: undefined,
					drug_shipment_id: item.drug_id,
					drug_name: item.name,
					description: item.name,
					quantity: 1,
					unit_price: drugPrice || 0
				};
			}
		}

		if (newBillItem) {
			// Check if item already exists
			const existingIndex = this.customBillItems.findIndex(
				(existing) => existing.id === newBillItem!.id
			);

			if (existingIndex >= 0) {
				// Increase quantity of existing item
				this.customBillItems[existingIndex].quantity += 1;
			} else {
				// Add new item
				this.customBillItems.push(newBillItem);
			}

			// Update the table and calculations
			this.updatePrintBillItemsTable();
			this.calculatePrintBilling();

			// Close the add item modal
			this.addItemToPrintModal.hide();

			this.showSuccess(
				i18n.t("patients.printBill.messages.itemAdded", {
					name: item.name
				})
			);
		}
	}

	private async generateCustomPdf(): Promise<void> {
		try {
			// Update custom bill data with current form values
			const includeDiscount = (
				document.getElementById(
					"printIncludeDiscount"
				) as HTMLInputElement
			).checked;
			const discount =
				parseFloat(
					(
						document.getElementById(
							"printDiscount"
						) as HTMLInputElement
					).value
				) || 0;
			const isDiscountPercentage = (
				document.getElementById("printDiscountType") as HTMLInputElement
			).checked;
			const vatPercentage =
				parseFloat(
					(
						document.getElementById(
							"printVatPercentage"
						) as HTMLInputElement
					).value
				) || 0;
			const vatScope = (
				document.getElementById("printVatScope") as HTMLSelectElement
			).value;
			const adminExpenses =
				parseFloat(
					(
						document.getElementById(
							"printAdminExpenses"
						) as HTMLInputElement
					).value
				) || 0;
			const medicalTestsAmount =
				parseFloat(
					(
						document.getElementById(
							"printMedicalTestsAmount"
						) as HTMLInputElement
					).value
				) || 0;

			// Calculate totals
			let servicesTotal = 0;
			let drugsTotal = 0;
			let suppliesTotal = 0;
			this.customBillItems.forEach((item) => {
				const lineTotal = item.quantity * item.unit_price;
				if (item.type === "service") {
					servicesTotal += lineTotal;
				} else if (item.type === "drug") {
					drugsTotal += lineTotal;
				} else if (item.type === "supply") {
					suppliesTotal += lineTotal;
				}
			});

			const subtotal = servicesTotal + drugsTotal + suppliesTotal + medicalTestsAmount;

			const discountAmount = includeDiscount
				? isDiscountPercentage
					? (subtotal * discount) / 100
					: discount
				: 0;

			const totalAfterDiscount = subtotal - discountAmount;

			// Calculate VAT based on scope
			// Include supplies with drugs for VAT calculation as requested
			let vatBase = 0;
			if (subtotal > 0) {
				switch (vatScope) {
					case "services":
						vatBase =
							servicesTotal -
							discountAmount * (servicesTotal / subtotal);
						break;
					case "drugs":
						vatBase =
							(drugsTotal + suppliesTotal) -
							discountAmount * ((drugsTotal + suppliesTotal) / subtotal);
						break;
					case "both":
					default:
						vatBase = totalAfterDiscount;
						break;
				}
			}

			const vatAmount = ((vatBase + adminExpenses) * vatPercentage) / 100;
			const totalAmount =
				totalAfterDiscount + vatAmount + adminExpenses;

			// Create custom bill object
			const customBill = {
				...this.customBillData.bill,
				discount: includeDiscount ? discount : 0, // Keep original discount value for display/recalc
				discount_type: isDiscountPercentage ? "percentage" : "fixed",
				vat_percentage: vatPercentage,
				vat_amount: vatAmount, // Pass calculated VAT amount
				administrative_expenses: adminExpenses,
				medical_tests_amount: medicalTestsAmount,
				total_amount: totalAmount,
				show_discount: includeDiscount,
				vat_scope: vatScope || "both",
				servicesTotal,
				drugsTotal,
				suppliesTotal
			};

			// Generate PDF with custom data
			const pdf = generatePatientBill(
				this.customBillData.patient,
				customBill,
				this.customBillItems
			);

			// Close modal and open PDF
			this.printCustomizationModal.hide();
			pdf.open();

			this.showSuccess(
				i18n.t("patients.printBill.messages.pdfGeneratedSuccess")
			);
		} catch (error) {
			console.error("Error generating custom PDF:", error);
			this.showError(
				i18n.t("patients.printBill.messages.pdfGenerateFailed")
			);
		}
	}

	// Update data when parent data changes
	public updateData(
		availableServices: any[],
		availableDrugs: any[],
		servicePrices: Map<number, number>,
		currentAdmission: PatientHistory
	): void {
		this.availableServices = availableServices;
		this.availableDrugs = availableDrugs;
		this.servicePrices = servicePrices;
		this.currentAdmission = currentAdmission;
	}
}
