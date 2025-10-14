import { Patient } from "../../../utils/types/patients.js";
import { Bill, BillDetail } from "../../../utils/types/billing.js";

// Extend jsPDF type to include autoTable
declare global {
	interface Window {
		jspdf: {
			jsPDF: new (options?: {
				orientation?: "portrait" | "landscape";
				unit?: "pt" | "px" | "in" | "mm" | "cm" | "ex" | "em" | "pc";
				format?: string | number[];
				compress?: boolean;
				precision?: number;
				userUnit?: number;
			}) => jsPDF;
		};
		autoTable: any;
	}

	interface jsPDF {
		internal: {
			pageSize: {
				width: number;
				height: number;
				getWidth: () => number;
				getHeight: () => number;
			};
			scaleFactor: number;
			pageFormats: any;
		};

		// Page management
		addPage(
			format?: string | number[],
			orientation?: "portrait" | "landscape"
		): jsPDF;
		setPage(pageNumber: number): jsPDF;
		insertPage(beforePage: number): jsPDF;
		movePage(targetPage: number, beforePage: number): jsPDF;
		deletePage(targetPage: number): jsPDF;

		// Text
		text(
			text: string | string[],
			x: number,
			y: number,
			options?: {
				align?: "left" | "center" | "right" | "justify";
				baseline?:
					| "alphabetic"
					| "ideographic"
					| "bottom"
					| "top"
					| "middle"
					| "hanging";
				angle?: number | number[];
				rotationDirection?: 0 | 1;
				charSpace?: number;
				lineHeightFactor?: number;
				flags?: {
					noBOM?: boolean;
					autoencode?: boolean;
				};
				maxWidth?: number;
			}
		): jsPDF;

		// Font
		setFont(
			fontName: string,
			fontStyle?: string,
			fontWeight?: string | number
		): jsPDF;
		setFontSize(size: number): jsPDF;
		setTextColor(r: number, g?: number, b?: number, a?: number): jsPDF;
		setTextColor(hexColor: string): jsPDF;

		// Lines and shapes
		line(
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			style?: string
		): jsPDF;
		rect(
			x: number,
			y: number,
			width: number,
			height: number,
			style?: "S" | "F" | "FD" | "DF"
		): jsPDF;
		circle(x: number, y: number, r: number, style?: string): jsPDF;
		ellipse(
			x: number,
			y: number,
			rx: number,
			ry: number,
			style?: string
		): jsPDF;
		triangle(
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			x3: number,
			y3: number,
			style?: string
		): jsPDF;

		// Drawing properties
		setLineWidth(width: number): jsPDF;
		setDrawColor(r: number, g?: number, b?: number, a?: number): jsPDF;
		setDrawColor(hexColor: string): jsPDF;
		setFillColor(r: number, g?: number, b?: number, a?: number): jsPDF;
		setFillColor(hexColor: string): jsPDF;

		// Images
		addImage(
			imageData:
				| string
				| HTMLImageElement
				| HTMLCanvasElement
				| Uint8Array,
			format: string,
			x: number,
			y: number,
			width: number,
			height: number,
			alias?: string,
			compression?: "NONE" | "FAST" | "MEDIUM" | "SLOW",
			rotation?: number
		): jsPDF;

		// Utilities
		getTextWidth(text: string): number;
		splitTextToSize(
			text: string,
			maxWidth: number,
			options?: any
		): string[];
		getLineHeight(): number;
		getLineHeightFactor(): number;
		setLineHeightFactor(factor: number): jsPDF;

		// Output
		output(type: "arraybuffer"): ArrayBuffer;
		output(type: "blob"): Blob;
		output(type: "bloburi" | "bloburl"): string;
		output(type: "datauristring" | "dataurlstring"): string;
		output(
			type: "datauri" | "dataurl",
			options?: { filename?: string }
		): void;
		output(type: "dataurlnewwindow"): void;
		output(type: "pdfobjectnewwindow"): void;
		output(type: "pdfjsnewwindow"): void;
		output(type?: string): any;

		save(filename: string): jsPDF;

		// AutoTable plugin
		autoTable: (options: any) => jsPDF;
		lastAutoTable?: {
			finalY: number;
		};
		previousAutoTable?: {
			finalY: number;
		};
	}
}


// Generic report configuration interfaces
interface ReportField {
	key: string;
	label: string;
	type: "text" | "number" | "currency" | "date" | "boolean";
	formatter?: (value: any, item?: any) => string;
	alignment?: "left" | "center" | "right";
	bold?: boolean;
	width?: string | number;
	condition?: string;
}

interface ReportSection {
	title?: string;
	type: "header" | "columns" | "table" | "summary" | "custom";
	data?: any;
	fields?: ReportField[];
	columns?: ReportSection[];
	customContent?: any;
	tableConfig?: {
		headerRows?: number;
		widths?: (string | number)[];
		groupBy?: string;
	};
}

interface ReportConfig {
	title: string;
	sections: ReportSection[];
	styles?: any;
}

interface JSPDFWithAutoTable extends jsPDF {
	autoTable: any;
}

const jsPDF = window.jspdf.jsPDF as unknown as JSPDFWithAutoTable
jsPDF.autoTable = window.autoTable

// Default formatters
const defaultFormatters = {
	currency: (value: number) => `${value.toFixed(2)} EGP`,
	date: (value: string | Date) => new Date(value).toLocaleDateString(),
	percentage: (value: number) => `${value}%`,
	boolean: (value: boolean) => (value ? "Yes" : "No"),
	capitalize: (value: string) =>
		value.charAt(0).toUpperCase() + value.slice(1)
};

// PDF Configuration
const PDF_CONFIG = {
	margin: {
		top: 20,
		right: 15,
		bottom: 20,
		left: 15
	},
	fontSize: {
		header: 18,
		subheader: 14,
		normal: 10,
		small: 8
	},
	colors: {
		primary: "#0d6efd",
		secondary: "#6c757d",
		headerBg: "#f0f0f0",
		altRowBg: "#f9f9f9"
	}
};

// Group bill details by service/drug ID
function groupBillDetails(billDetails: BillDetail[]): BillDetail[] {
	const grouped = new Map<string, BillDetail>();

	billDetails.forEach((detail) => {
		const key = detail.service_id
			? `service_${detail.service_id}`
			: `drug_${detail.drug_shipment_id}`;

		if (grouped.has(key)) {
			const existing = grouped.get(key)!;
			existing.quantity += detail.quantity;
		} else {
			grouped.set(key, { ...detail });
		}
	});

	return Array.from(grouped.values());
}

// Helper class for managing PDF generation
class PDFGenerator {
	private doc: jsPDF;
	private currentY: number;
	private pageWidth: number;
	private pageHeight: number;

	constructor() {
		//@ts-ignore
		this.doc = new jsPDF({
			orientation: "portrait",
			unit: "mm",
			format: "a4"
		});
		this.pageWidth = this.doc.internal.pageSize.getWidth();
		this.pageHeight = this.doc.internal.pageSize.getHeight();
		this.currentY = PDF_CONFIG.margin.top;
	}

	// Add title to document
	addTitle(title: string): void {
		this.doc.setFontSize(PDF_CONFIG.fontSize.header);
		this.doc.setFont("helvetica", "bold");
		const textWidth = this.doc.getTextWidth(title);
		const x = (this.pageWidth - textWidth) / 2;
		this.doc.text(title, x, this.currentY);
		this.currentY += 10;
	}

	// Add section header
	addSectionHeader(title: string): void {
		this.checkPageBreak(15);
		this.currentY += 5;
		this.doc.setFontSize(PDF_CONFIG.fontSize.subheader);
		this.doc.setFont("helvetica", "bold");
		this.doc.text(title, PDF_CONFIG.margin.left, this.currentY);
		this.currentY += 8;
	}

	// Add columns section
	addColumns(columns: ReportSection[], data: any): void {
		this.checkPageBreak(40);

		const columnWidth =
			(this.pageWidth -
				PDF_CONFIG.margin.left -
				PDF_CONFIG.margin.right) /
			columns.length;
		let startX = PDF_CONFIG.margin.left;

		columns.forEach((column) => {
			if (column.fields && data) {
				let tempY = this.currentY;
				this.doc.setFontSize(PDF_CONFIG.fontSize.normal);

				column.fields.forEach((field) => {
					const value = getNestedValue(data, field.key);
					const formattedValue = formatValue(value, field, data);

					// Label
					this.doc.setFont(
						"helvetica",
						field.bold ? "bold" : "normal"
					);
					this.doc.text(`${field.label}:`, startX, tempY);

					// Value
					this.doc.setFont("helvetica", "normal");
					const labelWidth = this.doc.getTextWidth(
						`${field.label}: `
					);
					this.doc.text(formattedValue, startX + labelWidth, tempY);

					tempY += 6;
				});

				startX += columnWidth;
			}
		});

		this.currentY +=
			Math.max(
				...columns.map((col) =>
					col.fields ? col.fields.length * 6 : 0
				)
			) + 5;
	}

	// Add table section
	addTable(section: ReportSection, data: any): void {
		if (!section.fields || !data) return;

		this.checkPageBreak(30);

		let tableData: any[] = [];

		// Handle different data structures
		if (
			section.tableConfig?.groupBy === "billDetails" &&
			data.billDetails
		) {
			tableData = groupBillDetails(data.billDetails);
		} else if (data.data && Array.isArray(data.data)) {
			tableData = data.data;
		} else if (Array.isArray(data)) {
			tableData = data;
		} else {
			tableData = [data];
		}

		if (!tableData || tableData.length === 0) {
			this.doc.setFontSize(PDF_CONFIG.fontSize.normal);
			this.doc.setFont("helvetica", "normal");
			const text = "No data available for this report.";
			const textWidth = this.doc.getTextWidth(text);
			this.doc.text(
				text,
				(this.pageWidth - textWidth) / 2,
				this.currentY
			);
			this.currentY += 10;
			return;
		}

		// Prepare table headers
		const headers = section.fields.map((field) => field.label);

		// Prepare table body
		const body = tableData.map((item: any) =>
			section.fields!.map((field) => {
				const value = field.key.includes(".")
					? getNestedValue(item, field.key)
					: item[field.key];
				return formatValue(value, field, item);
			})
		);

		// Calculate column widths
		const columnStyles: any = {};
		section.fields.forEach((field, index) => {
			columnStyles[index] = {
				cellWidth: field.width === "*" ? "auto" : field.width,
				halign: field.alignment || "left"
			};
		});

		(jsPDF as any).autoTable(this.doc, {
			startY: this.currentY,
			head: [headers],
			body: body,
			theme: "striped",
			headStyles: {
				fillColor: [240, 240, 240],
				textColor: [0, 0, 0],
				fontStyle: "bold",
				fontSize: PDF_CONFIG.fontSize.normal
			},
			bodyStyles: {
				fontSize: PDF_CONFIG.fontSize.normal
			},
			alternateRowStyles: {
				fillColor: [249, 249, 249]
			},
			columnStyles: columnStyles,
			margin: {
				left: PDF_CONFIG.margin.left,
				right: PDF_CONFIG.margin.right
			}
		});

		this.currentY = (this.doc as any).lastAutoTable.finalY + 5;
	}

	// Add summary section
	addSummary(section: ReportSection, data: any): void {
		if (!section.fields || !data) return;

		this.checkPageBreak(50);

		// Filter fields based on conditions
		const filteredFields = section.fields.filter((field) => {
			if (field.condition) {
				return data.bill && data.bill[field.condition] !== false;
			}
			return true;
		});

		const summaryData = filteredFields.map((field) => {
			const value = calculateSummaryValue(field, data);
			const formattedValue = formatValue(value, field, data);
			return [field.label, formattedValue];
		});

		const summaryStartX = this.pageWidth - PDF_CONFIG.margin.right - 70;

		(jsPDF as any).autoTable(this.doc, {
			startY: this.currentY,
			body: summaryData,
			theme: "plain",
			styles: {
				fontSize: PDF_CONFIG.fontSize.normal,
				cellPadding: 2
			},
			columnStyles: {
				0: { halign: "right", fontStyle: "normal", cellWidth: 40 },
				1: { halign: "right", cellWidth: 30 }
			},
			margin: { left: summaryStartX },
			didParseCell: (data: any) => {
				// Make specific rows bold
				const boldLabels = ["Total:", "Balance:"];
				if (
					data.column.index === 0 &&
					boldLabels.includes(data.cell.raw)
				) {
					data.cell.styles.fontStyle = "bold";
				}
				if (
					data.column.index === 1 &&
					boldLabels.includes(summaryData[data.row.index][0])
				) {
					data.cell.styles.fontStyle = "bold";
				}
			}
		});

		this.currentY = (this.doc as any).lastAutoTable.finalY + 5;
	}

	// Add custom content
	addCustomContent(content: any): void {
		// Handle custom content if needed
		if (typeof content === "string") {
			this.checkPageBreak(10);
			this.doc.setFontSize(PDF_CONFIG.fontSize.normal);
			this.doc.text(content, PDF_CONFIG.margin.left, this.currentY);
			this.currentY += 6;
		}
	}

	// Check if page break is needed
	private checkPageBreak(requiredSpace: number): void {
		if (
			this.currentY + requiredSpace >
			this.pageHeight - PDF_CONFIG.margin.bottom
		) {
			this.doc.addPage();
			this.currentY = PDF_CONFIG.margin.top;
		}
	}

	// Get the final PDF document
	getDocument(): jsPDF {
		return this.doc;
	}

	open(): void {
		pdfHelpers.openInNewWindow(this.doc)
	}
}

// Generic PDF generator
export function generateReport(config: ReportConfig, data?: any): PDFGenerator {
	const pdfGen = new PDFGenerator();

	// Add title
	if (config.title) {
		pdfGen.addTitle(config.title);
	}

	// Process sections
	config.sections.forEach((section) => {
		switch (section.type) {
			case "header":
				if (section.title) {
					pdfGen.addSectionHeader(section.title);
				}
				break;

			case "columns":
				if (section.columns) {
					pdfGen.addColumns(section.columns, data);
				}
				break;

			case "table":
				pdfGen.addTable(section, data);
				break;

			case "summary":
				pdfGen.addSummary(section, data);
				break;

			case "custom":
				if (section.customContent) {
					if (Array.isArray(section.customContent)) {
						section.customContent.forEach((content) =>
							pdfGen.addCustomContent(content)
						);
					} else {
						pdfGen.addCustomContent(section.customContent);
					}
				}
				break;
		}
	});

	return pdfGen;
}

function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => current?.[key], obj);
}

function formatValue(value: any, field: ReportField, item?: any): string {
	if (field.formatter) {
		return field.formatter(value, item);
	}

	if (value == null) return "N/A";

	switch (field.type) {
		case "currency":
			return defaultFormatters.currency(Number(value));
		case "date":
			return defaultFormatters.date(value);
		case "boolean":
			return defaultFormatters.boolean(value);
		case "number":
			return Number(value).toString();
		default:
			return String(value);
	}
}

function calculateSummaryValue(field: ReportField, data: any): any {
	switch (field.key) {
		case "calculated.subtotal":
			return (
				data.billDetails?.reduce(
					(sum: number, detail: BillDetail) =>
						sum + detail.quantity * detail.unit_price,
					0
				) || 0
			);
		case "calculated.vat_amount":
			const subtotal = calculateSummaryValue(
				{ key: "calculated.subtotal" } as ReportField,
				data
			);
			return data.bill?.vat_percentage
				? (subtotal - (data.bill?.discount || 0)) *
						(data.bill.vat_percentage / 100)
				: 0;
		case "calculated.balance":
			return (
				(data.bill?.total_amount || 0) - (data.bill?.paid_amount || 0)
			);
		default:
			return getNestedValue(data, field.key);
	}
}

// Pre-configured report templates
export const reportTemplates = {
	patientBill: {
		title: "PATIENT BILL",
		sections: [
			{
				type: "columns" as const,
				columns: [
					{
						type: "columns" as const,
						fields: [
							{
								key: "patient.name",
								label: "Patient",
								type: "text" as const,
								bold: true
							},
							{
								key: "patient.phone",
								label: "Phone",
								type: "text" as const
							},
							{
								key: "patient.payment_type",
								label: "Payment Type",
								type: "text" as const,
								formatter: (value: any) =>
									defaultFormatters.capitalize(value)
							}
						]
					},
					{
						type: "columns" as const,
						fields: [
							{
								key: "bill.bill_id",
								label: "Bill ID",
								type: "text" as const,
								bold: true
							},
							{
								key: "bill.generated_at",
								label: "Date",
								type: "date" as const
							},
							{
								key: "bill.paid_amount",
								label: "Status",
								type: "text" as const,
								formatter: (value: number, data: any) => {
									if (!data || !data.bill) return "Unknown";
									return value >= data.bill.total_amount
										? "Paid"
										: "Pending";
								}
							}
						]
					}
				]
			},
			{
				type: "header" as const,
				title: "BILL DETAILS"
			},
			{
				type: "table" as const,
				fields: [
					{
						key: "description",
						label: "Description",
						type: "text" as const,
						formatter: (value: any, item: any) => {
							if (!item) return "Unknown Item";
							return (
								item.service_name ||
								item.drug_name ||
								item.description ||
								"Unknown Item"
							);
						},
						width: "*"
					},
					{
						key: "quantity",
						label: "Quantity",
						type: "number" as const,
						width: 25,
						alignment: "center" as const
					},
					{
						key: "unit_price",
						label: "Unit Price",
						type: "currency" as const,
						width: 30,
						alignment: "right" as const
					},
					{
						key: "total",
						label: "Total",
						type: "currency" as const,
						formatter: (value: any, item: any) => {
							if (
								!item ||
								typeof item.quantity !== "number" ||
								typeof item.unit_price !== "number"
							) {
								return "0.00 EGP";
							}
							return defaultFormatters.currency(
								item.quantity * item.unit_price
							);
						},
						width: 30,
						alignment: "right" as const
					}
				],
				tableConfig: {
					headerRows: 1,
					widths: ["*", 25, 30, 30],
					groupBy: "billDetails"
				}
			},
			{
				type: "summary" as const,
				fields: [
					{
						key: "calculated.subtotal",
						label: "Subtotal:",
						type: "currency" as const
					},
					{
						key: "bill.discount",
						label: "Discount:",
						type: "currency" as const,
						condition: "show_discount"
					},
					{
						key: "bill.administrative_expenses",
						label: "Administrative:",
						type: "currency" as const
					},
					{
						key: "calculated.vat_amount",
						label: "VAT:",
						type: "currency" as const
					},
					{
						key: "bill.total_amount",
						label: "Total:",
						type: "currency" as const,
						bold: true
					},
					{
						key: "bill.paid_amount",
						label: "Paid:",
						type: "currency" as const
					},
					{
						key: "calculated.balance",
						label: "Balance:",
						type: "currency" as const,
						bold: true
					}
				]
			}
		]
	} as ReportConfig
};

// Convenience function for generating patient bills
export function generatePatientBill(
	patient: Patient,
	bill: Bill,
	billDetails: Partial<BillDetail>[]
): PDFGenerator {
	const groupedBillDetails = groupBillDetails(billDetails as BillDetail[]);

	const data = {
		patient,
		bill,
		billDetails: groupedBillDetails
	};

	return generateReport(reportTemplates.patientBill, data);
}

// Function to create custom reports
export function createCustomReport(
	title: string,
	sections: ReportSection[],
	data: any,
	styles?: any
): PDFGenerator {
	const config: ReportConfig = {
		title,
		sections,
		styles
	};

	return generateReport(config, data);
}

// Helper functions for using the generated PDFs
export const pdfHelpers = {
	// Open PDF in new window
	openInNewWindow: (doc: jsPDF) => {
		const blob = doc.output("blob");
		const url = URL.createObjectURL(blob);
		window.open(url, "_blank");
	},

	// Download PDF
	download: (doc: jsPDF, filename: string = "report.pdf") => {
		doc.save(filename);
	},

	// Print PDF
	print: (doc: jsPDF) => {
		const blob = doc.output("blob");
		const url = URL.createObjectURL(blob);
		const iframe = document.createElement("iframe");
		iframe.style.display = "none";
		iframe.src = url;
		document.body.appendChild(iframe);
		iframe.onload = () => {
			iframe.contentWindow?.print();
		};
	},

	// Get PDF as base64 string
	getBase64: (doc: jsPDF): string => {
		return doc.output("datauristring");
	},

	// Get PDF as blob
	getBlob: (doc: jsPDF): Blob => {
		return doc.output("blob");
	}
};
