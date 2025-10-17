//@ts-ignore
import Swal from "../../sweetalert2/src/sweetalert2.js";
import { generatePatientBill } from "../utils/pdfGenerator.js";
import { i18n } from "../utils/i18n.js";

interface PrintBillItem {
	id: string;
	type: "service" | "drug";
	service_id?: number;
	service_name?: string;
	drug_shipment_id?: number;
	drug_name?: string;
	description: string;
	quantity: number;
	unit_price: number;
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
			"printIncludeDiscount"
		].forEach((id) => {
			document.getElementById(id)?.addEventListener("input", () => {
				this.calculatePrintBilling();
			});
			document.getElementById(id)?.addEventListener("change", () => {
				this.calculatePrintBilling();
			});
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
			this.showError(i18n.t("patients.printBill.messages.noBillOrPatient"));
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
			adminExpenses: bill.administrative_expenses || 0
		};
	}

	private groupBillDetails(billDetails: any[]): PrintBillItem[] {
		const grouped = new Map<string, PrintBillItem>();

		billDetails.forEach((detail) => {
			const key = detail.service_id
				? `service_${detail.service_id}`
				: `drug_${detail.drug_shipment_id}`;

			if (grouped.has(key)) {
				const existing = grouped.get(key)!;
				existing.quantity += detail.quantity;
			} else {
				grouped.set(key, {
					id: key,
					type: detail.service_id ? "service" : "drug",
					service_id: detail.service_id,
					service_name: detail.service_name,
					drug_shipment_id: detail.drug_shipment_id,
					drug_name: detail.drug_name,
					description:
						detail.service_name ||
						detail.drug_name ||
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
		(document.getElementById("printVatScope") as HTMLSelectElement).value =
			this.customBillData.bill.vat_scope || "both";
		(
			document.getElementById("printAdminExpenses") as HTMLInputElement
		).value = this.customBillData.adminExpenses.toString();
		(
			document.getElementById("printIncludeDiscount") as HTMLInputElement
		).checked = true;

		// Populate paid amount (read-only)
		document.getElementById("printPaidAmount")!.textContent = 
			i18n.formatCurrency(parseInt(this.customBillData.bill.paid_amount as unknown as string));

		// Populate bill items
		this.updatePrintBillItemsTable();

		// Calculate totals
		this.calculatePrintBilling();
	}

	private updatePrintBillItemsTable(): void {
		const tbody = document.getElementById("printBillItemsBody")!;

		if (this.customBillItems.length === 0) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">${i18n.t("patients.printBill.noItemsInBill")}</td></tr>`;
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
                    <small class="text-muted">${
						item.type === "service" 
							? i18n.t("patients.printBill.itemTypes.service")
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
                <td class="fw-bold">${i18n.formatCurrency(item.quantity * item.unit_price)}</td>
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
		// Calculate services and drugs totals separately
		let servicesTotal = 0;
		let drugsTotal = 0;

		this.customBillItems.forEach((item) => {
			const lineTotal = item.quantity * item.unit_price;
			if (item.type === "service") {
				servicesTotal += lineTotal;
			} else if (item.type === "drug") {
				drugsTotal += lineTotal;
			}
		});

		const subtotal = servicesTotal + drugsTotal;

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
		const vatScope =
			(document.getElementById("printVatScope") as HTMLSelectElement)
				?.value || "both";
		const adminExpenses =
			parseFloat(
				(
					document.getElementById(
						"printAdminExpenses"
					) as HTMLInputElement
				).value
			) || 0;

		// Calculate discount amount (but only apply if includeDiscount is checked)
		let discountAmount = 0;
		if (includeDiscount) {
			if (isDiscountPercentage) {
				discountAmount = (subtotal * discount) / 100;
			} else {
				discountAmount = discount;
			}
		}

		const totalAfterDiscount = subtotal - discountAmount;

		// Calculate VAT based on scope (matching the patients file logic)
		let vatBase = 0;
		if (subtotal > 0) {
			// Avoid division by zero
			switch (vatScope) {
				case "services":
					vatBase =
						servicesTotal -
						discountAmount * (servicesTotal / subtotal);
					break;
				case "drugs":
					vatBase =
						drugsTotal - discountAmount * (drugsTotal / subtotal);
					break;
				case "both":
				default:
					vatBase = totalAfterDiscount;
					break;
			}
		}

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

		// Update visual styling
		const discountContainer = discountInput.closest(
			".col-6"
		) as HTMLElement;
		if (discountContainer) {
			discountContainer.style.opacity = includeDiscount ? "1" : "0.6";
		}
	}

	private showAddItemModal(type: "service" | "drug"): void {
		// Set active tab
		if (type === "service") {
			(
				document.getElementById("services-tab") as HTMLButtonElement
			).click();
		} else {
			(document.getElementById("drugs-tab") as HTMLButtonElement).click();
		}

		// Populate available items
		this.populateAvailableItemsForPrint();

		// Show modal
		this.addItemToPrintModal.show();
	}

	private populateAvailableItemsForPrint(): void {
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
                <div class="print-item-row" onclick="window.printBillManager.addPrintItem('service', ${
					service.service_id
				})">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="print-item-name">${this.escapeHtml(
								service.name
							)}</div>
                            <div class="print-item-details">
                                ${i18n.t("patients.printBill.type")}: ${this.formatServiceType(
									service.service_type
								)}
                                ${service.auto_renew ? " • " + i18n.t("patients.printBill.autoRenew") : ""}
                            </div>
                        </div>
                        <div class="print-item-price">${i18n.formatCurrency(price)}</div>
                    </div>
                </div>
            `;
			})
			.join("");

		// Populate drugs
		const drugsContainer = document.getElementById(
			"availableDrugsForPrint"
		)!;
		drugsContainer.innerHTML = this.availableDrugs.filter((drug) => drug.available_quantity > 0)
			.map(
				(drug) => `
            <div class="print-item-row" onclick="window.printBillManager.addPrintItem('drug', ${
				drug.drug_id
			})">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="print-item-name">${this.escapeHtml(
							drug.name
						)}</div>
                        <div class="print-item-details">
                            ${i18n.t("patients.printBill.available")}: ${drug.available_quantity} ${
					drug.unit_conversion?.smaller || i18n.t("common.units")
				}
                            ${
								drug.manufacturer
									? ` • ${drug.manufacturer}`
									: ""
							}
                        </div>
                    </div>
                    <div class="print-item-price">${i18n.formatCurrency(drug.price || 0)}</div>
                </div>
            </div>
        `
			)
			.join("");
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
                <div class="print-item-row" onclick="window.printBillManager.addPrintItem('service', ${
					service.service_id
				})">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="print-item-name">${this.escapeHtml(
								service.name
							)}</div>
                            <div class="print-item-details">
                                ${i18n.t("patients.printBill.type")}: ${this.formatServiceType(
									service.service_type
								)}
                                ${service.auto_renew ? " • " + i18n.t("patients.printBill.autoRenew") : ""}
                            </div>
                        </div>
                        <div class="print-item-price">${i18n.formatCurrency(price)}</div>
                    </div>
                </div>
            `;
			})
			.join("");
	}

	private filterPrintDrugs(searchTerm: string): void {
		const drugsContainer = document.getElementById(
			"availableDrugsForPrint"
		)!;
		const filteredDrugs = this.availableDrugs.filter(
			(drug) =>
				drug.available_quantity > 0 &&
				drug.name.toLowerCase().includes(searchTerm.toLowerCase())
		);

		drugsContainer.innerHTML = filteredDrugs
			.map(
				(drug) => `
            <div class="print-item-row" onclick="window.printBillManager.addPrintItem('drug', ${
				drug.drug_id
			})">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="print-item-name">${this.escapeHtml(
							drug.name
						)}</div>
                        <div class="print-item-details">
                            ${i18n.t("patients.printBill.available")}: ${drug.available_quantity} ${
					drug.unit_conversion?.smaller || i18n.t("common.units")
				}
                            ${
								drug.manufacturer
									? ` • ${drug.manufacturer}`
									: ""
							}
                        </div>
                    </div>
                    <div class="print-item-price">${i18n.formatCurrency(drug.price || 0)}</div>
                </div>
            </div>
        `
			)
			.join("");
	}

	public addPrintItem(type: "service" | "drug", itemId: number): void {
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
					unit_price: item.price || 0
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

			this.showSuccess(i18n.t("patients.printBill.messages.itemAdded", { name: item.name }));
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

			// Calculate totals
			let servicesTotal = 0;
			let drugsTotal = 0;
			this.customBillItems.forEach((item) => {
				const lineTotal = item.quantity * item.unit_price;
				if (item.type === "service") {
					servicesTotal += lineTotal;
				} else if (item.type === "drug") {
					drugsTotal += lineTotal;
				}
			});

			const subtotal = servicesTotal + drugsTotal;
			const discountAmount = includeDiscount
				? isDiscountPercentage
					? (subtotal * discount) / 100
					: discount
				: 0;
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
							drugsTotal -
							discountAmount * (drugsTotal / subtotal);
						break;
					case "both":
					default:
						vatBase = subtotal - discountAmount;
						break;
				}
			}

			const vatAmount = ((vatBase + adminExpenses) * vatPercentage) / 100;
			const totalAmount =
				subtotal - discountAmount + vatAmount + adminExpenses;

			// Create custom bill object
			const customBill = {
				...this.customBillData.bill,
				discount: includeDiscount ? discountAmount : 0,
				discount_type: isDiscountPercentage ? "percentage" : "fixed",
				vat_percentage: vatPercentage,
				administrative_expenses: adminExpenses,
				total_amount: totalAmount,
				show_discount: includeDiscount
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

			this.showSuccess(i18n.t("patients.printBill.messages.pdfGeneratedSuccess"));
		} catch (error) {
			console.error("Error generating custom PDF:", error);
			this.showError(i18n.t("patients.printBill.messages.pdfGenerateFailed"));
		}
	}

	// Update data when parent data changes
	public updateData(
		availableServices: any[],
		availableDrugs: any[],
		servicePrices: Map<number, number>
	): void {
		this.availableServices = availableServices;
		this.availableDrugs = availableDrugs;
		this.servicePrices = servicePrices;
	}
}