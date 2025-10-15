import { Patient } from "../../../utils/types/patients.js";
import { Bill, BillDetail } from "../../../utils/types/billing.js";
import { initRTLSupport } from "./rtlWrapper.js";

// Declare global pdfMake and pdfFonts (set by <script> tags)
declare global {
	interface Window {
		pdfMake: {
			createPdf: (docDefinition: any) => any;
			vfs?: any;
			fonts?: any;
		};
		vfs?: any;
	}
}

const pdfMake = window.pdfMake;

window.pdfMake.vfs = { ...window.vfs };
window.pdfMake.fonts = {
	Roboto: {
		normal: "Roboto-Regular.ttf",
		bold: "Roboto-Medium.ttf",
		italics: "Roboto-Italic.ttf",
		bolditalics: "Roboto-MediumItalic.ttf"
	},
	"Segoe UI": {
		normal: "Segoe UI.ttf",
		bold: "Segoe UI Semibold.ttf",
		italics: "Segoe UI Semibold.ttf",
		bolditalics: "Segoe UI Semibold.ttf"
	}
};

initRTLSupport(window.pdfMake);

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
		groupBy?: string; // For grouping table data
	};
}

interface ReportConfig {
	title: string;
	sections: ReportSection[];
	styles?: any;
}

// Default formatters
const defaultFormatters = {
	currency: (value: number) => `${value.toFixed(2)} EGP`,
	date: (value: string | Date) => new Date(value).toLocaleDateString(),
	percentage: (value: number) => `${value}%`,
	boolean: (value: boolean) => (value ? "Yes" : "No"),
	capitalize: (value: string) =>
		value.charAt(0).toUpperCase() + value.slice(1)
};

// Group bill details by service/drug ID
function groupBillDetails(billDetails: BillDetail[]): BillDetail[] {
	const grouped = new Map<string, BillDetail>();

	billDetails.forEach((detail) => {
		// Create a unique key for grouping
		const key = detail.service_id
			? `service_${detail.service_id}`
			: `drug_${detail.drug_shipment_id}`;

		if (grouped.has(key)) {
			// Add to existing group
			const existing = grouped.get(key)!;
			existing.quantity += detail.quantity;
		} else {
			// Create new group
			grouped.set(key, { ...detail });
		}
	});

	return Array.from(grouped.values());
}

// Generic PDF generator
export function generateReport(config: ReportConfig, data?: any) {
	const content: any[] = [];

	// Add title
	if (config.title) {
		content.push({
			text: config.title,
			style: "header",
			alignment: "center"
		});
	}

	// Process sections
	config.sections.forEach((section) => {
		switch (section.type) {
			case "header":
				if (section.title) {
					content.push({
						text: section.title,
						style: "subheader",
						margin: [0, 20, 0, 10]
					});
				}
				break;

			case "columns":
				if (section.columns) {
					const columns = section.columns.map((col) =>
						buildSectionContent(col, data)
					);
					content.push({ columns });
				}
				break;

			case "table":
				content.push(buildTable(section, data));
				break;

			case "summary":
				content.push(buildSummary(section, data));
				break;

			case "custom":
				// Handle custom content for patient grouping
				if (section.customContent) {
					if (Array.isArray(section.customContent)) {
						content.push(...section.customContent);
					} else {
						content.push(section.customContent);
					}
				}
				break;
		}
	});

	const docDefinition = {
		content,
		styles: {
			header: {
				fontSize: 18,
				bold: true,
				margin: [0, 0, 0, 10]
			},
			subheader: {
				fontSize: 14,
				bold: true,
				margin: [0, 10, 0, 5]
			},
			patientHeader: {
				fontSize: 12,
				bold: true,
				color: "#0d6efd"
			},
			patientInfo: {
				fontSize: 10,
				color: "#6c757d"
			},
			...config.styles
		},
		pageMargins: [40, 60, 40, 60],
		defaultStyle: {
			font: "Segoe UI",
			fontSize: 12
		},
		pageSize: "A4"
	};

	pdfMake.vfs = { ...window.vfs };
	pdfMake.fonts = {
		Roboto: {
			normal: "Roboto-Regular.ttf",
			bold: "Roboto-Medium.ttf",
			italics: "Roboto-Italic.ttf",
			bolditalics: "Roboto-MediumItalic.ttf"
		},
		"Segoe UI": {
			normal: "Segoe UI.ttf",
			bold: "Segoe UI Semibold.ttf",
			italics: "Segoe UI Semibold.ttf",
			bolditalics: "Segoe UI Semibold.ttf"
		}
	};

	return pdfMake.createPdf(docDefinition);
}

function buildSectionContent(section: ReportSection, data: any): any {
	if (section.fields && data) {
		const textContent: any[] = [];

		section.fields.forEach((field) => {
			const value = getNestedValue(data, field.key);
			const formattedValue = formatValue(value, field, data); // Pass data as context

			textContent.push(
				{ text: `${field.label}: `, bold: field.bold || false },
				formattedValue,
				"\n"
			);
		});

		return {
			width: "*",
			text: textContent
		};
	}

	return { width: "*", text: "" };
}

function buildTable(section: ReportSection, data: any): any {
	if (!section.fields || !data) return { text: "" };

	// Handle different data structures
	let tableData: any[] = [];

	// For bill details (patient bills)
	if (section.tableConfig?.groupBy === "billDetails" && data.billDetails) {
		tableData = groupBillDetails(data.billDetails);
	}
	// For vault reports with data property
	else if (data.data && Array.isArray(data.data)) {
		tableData = data.data;
	}
	// For direct array data
	else if (Array.isArray(data)) {
		tableData = data;
	}
	// For single object data
	else {
		tableData = [data];
	}

	// If no data found, return empty table message
	if (!tableData || tableData.length === 0) {
		return {
			text: "No data available for this report.",
			style: "subheader",
			alignment: "center",
			margin: [0, 20, 0, 20]
		};
	}

	// Build header row
	const headerRow = section.fields.map((field) => ({
		text: field.label,
		bold: true,
		fillColor: "#f0f0f0"
	}));

	// Build data rows
	const dataRows = tableData.map((item: any) =>
		section.fields!.map((field) => {
			const value = field.key.includes(".")
				? getNestedValue(item, field.key)
				: item[field.key];
			return formatValue(value, field, item); // Pass item as context
		})
	);

	return {
		table: {
			headerRows: section.tableConfig?.headerRows || 1,
			widths:
				section.tableConfig?.widths ||
				section.fields.map((f, i) =>
					f.width || i == 0 ? "*" : "auto"
				),
			body: [headerRow, ...dataRows]
		},
		layout: {
			fillColor: function (rowIndex: number) {
				return rowIndex === 0
					? "#f0f0f0"
					: rowIndex % 2 === 0
					? "#f9f9f9"
					: null;
			}
		}
	};
}

function buildSummary(section: ReportSection, data: any): any {
	if (!section.fields || !data) return { text: "" };

	// Filter fields based on conditions
	const filteredFields = section.fields.filter((field) => {
		if (field.condition) {
			return data.bill && data.bill[field.condition] !== false;
		}
		return true;
	});

	const summaryRows = filteredFields.map((field) => {
		const value = calculateSummaryValue(field, data);
		const formattedValue = formatValue(value, field, data); // Pass data as context

		return [
			field.label,
			field.bold ? { text: formattedValue, bold: true } : formattedValue
		];
	});

	return {
		columns: [
			{ width: "*", text: "" },
			{
				width: 200,
				table: {
					body: summaryRows
				},
				layout: "noBorders"
			}
		]
	};
}

function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => current?.[key], obj);
}

function formatValue(value: any, field: ReportField, item?: any): string {
	// If field has a custom formatter, call it first (even if value is null)
	// This allows formatters to calculate values from the item
	if (field.formatter) {
		return field.formatter(value, item);
	}

	// Check for null/undefined after custom formatter
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
	// Handle calculated fields for summaries
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
									defaultFormatters.capitalize(value) // Fixed formatter
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
									// Add safety check for data
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
						key: "description", // Use a simpler key
						label: "Description",
						type: "text" as const,
						formatter: (_value: any, item: any) => {
							// Add safety check
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
						width: "auto"
					},
					{
						key: "unit_price",
						label: "Unit Price",
						type: "currency" as const,
						width: "auto"
					},
					{
						key: "total",
						label: "Total",
						type: "currency" as const,
						formatter: (_value: any, item: any) => {
							// Add safety check
							if (
								!item ||
								typeof item.quantity !== "number" ||
								typeof item.unit_price !== "number"
							) {
								return "$0.00";
							}
							return defaultFormatters.currency(
								item.quantity * item.unit_price
							);
						},
						width: "auto"
					}
				],
				tableConfig: {
					headerRows: 1,
					widths: ["*", "auto", "auto", "auto"],
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
) {
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
): any {
	const config: ReportConfig = {
		title,
		sections,
		styles
	};

	return generateReport(config, data);
}
