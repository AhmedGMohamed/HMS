/**
 * Vault report configuration — Phase 6.9 plan §3.3.
 *
 * Literal i18n key constants (`REPORT_TITLES`, per-type `REPORT_COLUMNS`)
 * keep `check-i18n:renderer` satisfied: every key consumed by the report
 * dialog/print flow appears as a static string in this file.
 *
 * Column layout and cell semantics port the legacy `getReportColumns`
 * (vault.ts:887-1428) with its label/labelKey swap bug on
 * `patient-discounts` fixed (plan A9).
 */
import type { ReportType } from "@/pages/Vault/types/vault"

export type ReportColumnKind =
	| "text"
	| "date"
	| "currency"
	| "number"
	/** wages-owed `isPaid` → paymentStatus.paid/pending */
	| "status"
	/** manual-payments `paymentType` → paymentTypes.addition/deduction */
	| "paymentType"
	/** patient-discounts `discount` → `%` when discountType is percentage, else currency */
	| "discountValue"

export interface ReportColumnSpec {
	/** camelCase row key — also the DataTable column id. */
	id: string
	/** Literal i18n key under `vault.reportColumns.` (or `common.`). */
	headerKey: string
	kind: ReportColumnKind
}

/** Report titles: literal `vault.reportTitles.*` keys (camelCase per D10). */
export const REPORT_TITLES: Array<{ id: ReportType; titleKey: string }> = [
	{ id: "patient-services", titleKey: "vault.reportTitles.patientServices" },
	{ id: "patient-drugs", titleKey: "vault.reportTitles.patientDrugs" },
	{ id: "patient-supplies", titleKey: "vault.reportTitles.patientSupplies" },
	{ id: "patient-payments", titleKey: "vault.reportTitles.patientPayments" },
	{ id: "patient-outstanding", titleKey: "vault.reportTitles.patientOutstanding" },
	{ id: "patient-discounts", titleKey: "vault.reportTitles.patientDiscounts" },
	{ id: "patient-medical-tests", titleKey: "vault.reportTitles.patientMedicalTests" },
	{ id: "patient-vat-admin", titleKey: "vault.reportTitles.patientVatAdmin" },
	{ id: "manual-payments", titleKey: "vault.reportTitles.manualPayments" },
	{ id: "insurance-payments", titleKey: "vault.reportTitles.insurancePayments" },
	{ id: "drug-shipments", titleKey: "vault.reportTitles.drugShipments" },
	{ id: "drug-sales", titleKey: "vault.reportTitles.drugSales" },
	{ id: "drug-profits", titleKey: "vault.reportTitles.drugProfits" },
	{ id: "supply-shipments", titleKey: "vault.reportTitles.supplyShipments" },
	{ id: "supply-sales", titleKey: "vault.reportTitles.supplySales" },
	{ id: "supply-profits", titleKey: "vault.reportTitles.supplyProfits" },
	{ id: "wages-owed", titleKey: "vault.reportTitles.wagesOwed" },
	{ id: "wages-paid", titleKey: "vault.reportTitles.wagesPaid" },
]

/** Lookup helper over `REPORT_TITLES`. */
export function reportTitleKey(type: ReportType): string {
	return REPORT_TITLES.find((entry) => entry.id === type)?.titleKey ?? ""
}

/** Column set shared by the two wages reports (statusCol = wages-owed variant). */
const wagesColumns = (statusCol: boolean): ReportColumnSpec[] => [
	{ id: "employeeName", headerKey: "vault.reportColumns.employee", kind: "text" },
	{ id: "employeeType", headerKey: "vault.reportColumns.type", kind: "text" },
	{ id: "paymentAmount", headerKey: "vault.reportColumns.basePay", kind: "currency" },
	{ id: "extraAmount", headerKey: "vault.reportColumns.extraAmount", kind: "currency" },
	{ id: "extraPaymentType", headerKey: "vault.reportColumns.extraType", kind: "text" },
	...(statusCol
		? [{ id: "issuedTimestamp", headerKey: "vault.reportColumns.issuedDate", kind: "date" } as const]
		: [{ id: "paidTimestamp", headerKey: "vault.reportColumns.paidDate", kind: "date" } as const]),
	...(statusCol ? [{ id: "isPaid", headerKey: "vault.reportColumns.status", kind: "status" } as const] : []),
	...(statusCol ? [] : [{ id: "paidBy", headerKey: "vault.reportColumns.paidBy", kind: "text" } as const]),
]

/** Per-report column specs (ported from legacy `getReportColumns`). */
export const REPORT_COLUMNS: Record<ReportType, ReportColumnSpec[]> = {
	"patient-services": [
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "billId", headerKey: "vault.reportColumns.billId", kind: "text" },
		{ id: "generatedAt", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "servicesTotal", headerKey: "vault.reportColumns.servicesTotal", kind: "currency" },
		{ id: "discountAmount", headerKey: "vault.reportColumns.discount", kind: "currency" },
		{ id: "paidAmount", headerKey: "vault.reportColumns.paid", kind: "currency" },
	],
	"patient-drugs": [
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "billId", headerKey: "vault.reportColumns.billId", kind: "text" },
		{ id: "generatedAt", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "drugsTotal", headerKey: "vault.reportColumns.drugsTotal", kind: "currency" },
		{ id: "discountAmount", headerKey: "vault.reportColumns.discount", kind: "currency" },
		{ id: "paidAmount", headerKey: "vault.reportColumns.paid", kind: "currency" },
	],
	// patient-supplies had no legacy column config (broken drill) — designed mirroring patient-services/drugs.
	"patient-supplies": [
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "billId", headerKey: "vault.reportColumns.billId", kind: "text" },
		{ id: "generatedAt", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "suppliesTotal", headerKey: "vault.reportColumns.suppliesTotal", kind: "currency" },
		{ id: "discountAmount", headerKey: "vault.reportColumns.discount", kind: "currency" },
		{ id: "paidAmount", headerKey: "vault.reportColumns.paid", kind: "currency" },
	],
	"patient-medical-tests": [
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "billId", headerKey: "vault.reportColumns.billId", kind: "text" },
		{ id: "generatedAt", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "medicalTestsAmount", headerKey: "vault.reportColumns.amount", kind: "currency" },
	],
	"patient-vat-admin": [
		{ id: "generatedAt", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "totalAmount", headerKey: "vault.reportColumns.totalAmount", kind: "currency" },
		{ id: "administrativeExpenses", headerKey: "vault.reportColumns.adminExpenses", kind: "currency" },
		{ id: "vatAmount", headerKey: "vault.reportColumns.vatAmount", kind: "currency" },
	],
	"patient-payments": [
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "billId", headerKey: "vault.reportColumns.billId", kind: "text" },
		{ id: "updatedAt", headerKey: "vault.reportColumns.paymentDate", kind: "date" },
		{ id: "totalAmount", headerKey: "vault.reportColumns.totalAmount", kind: "currency" },
		{ id: "paidAmount", headerKey: "vault.reportColumns.paidAmount", kind: "currency" },
		{ id: "paymentType", headerKey: "vault.reportColumns.paymentType", kind: "text" },
	],
	"patient-outstanding": [
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "billId", headerKey: "vault.reportColumns.billId", kind: "text" },
		{ id: "generatedAt", headerKey: "vault.reportColumns.billDate", kind: "date" },
		{ id: "totalAmount", headerKey: "vault.reportColumns.totalAmount", kind: "currency" },
		{ id: "paidAmount", headerKey: "vault.reportColumns.paidAmount", kind: "currency" },
		{ id: "outstandingAmount", headerKey: "vault.reportColumns.outstanding", kind: "currency" },
		{ id: "paymentType", headerKey: "vault.reportColumns.paymentType", kind: "text" },
	],
	"patient-discounts": [
		{ id: "patientName", headerKey: "vault.reportColumns.patientName", kind: "text" },
		{ id: "billId", headerKey: "vault.reportColumns.billId", kind: "text" },
		{ id: "generatedAt", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "discountType", headerKey: "vault.reportColumns.discountType", kind: "text" },
		{ id: "discount", headerKey: "vault.reportColumns.discountValue", kind: "discountValue" },
		{ id: "totalAmount", headerKey: "vault.reportColumns.totalAmount", kind: "currency" },
		{ id: "discountAmount", headerKey: "vault.reportColumns.discountAmount", kind: "currency" },
	],
	"manual-payments": [
		{ id: "paymentId", headerKey: "vault.reportColumns.paymentId", kind: "text" },
		{ id: "paymentTime", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "paymentType", headerKey: "vault.reportColumns.type", kind: "paymentType" },
		{ id: "paymentAmount", headerKey: "vault.reportColumns.amount", kind: "currency" },
		{ id: "description", headerKey: "vault.reportColumns.description", kind: "text" },
	],
	"insurance-payments": [
		{ id: "insuranceName", headerKey: "vault.reportColumns.insuranceCompany", kind: "text" },
		{ id: "paymentAmount", headerKey: "vault.reportColumns.amount", kind: "currency" },
		{ id: "paymentFrom", headerKey: "vault.reportColumns.periodFrom", kind: "date" },
		{ id: "paymentTo", headerKey: "vault.reportColumns.periodTo", kind: "date" },
		{ id: "issuedTimestamp", headerKey: "vault.reportColumns.recordedDate", kind: "date" },
		{ id: "addedBy", headerKey: "vault.reportColumns.addedBy", kind: "text" },
	],
	"drug-shipments": [
		{ id: "drugName", headerKey: "vault.reportColumns.drugName", kind: "text" },
		{ id: "manufacturer", headerKey: "vault.reportColumns.manufacturer", kind: "text" },
		{ id: "buyQuantity", headerKey: "vault.reportColumns.quantity", kind: "number" },
		{ id: "buyPrice", headerKey: "vault.reportColumns.unitCost", kind: "currency" },
		{ id: "totalCost", headerKey: "vault.reportColumns.totalCost", kind: "currency" },
		{ id: "receivedDate", headerKey: "vault.reportColumns.receivedDate", kind: "date" },
		{ id: "warehouseName", headerKey: "vault.reportColumns.warehouse", kind: "text" },
	],
	"drug-sales": [
		{ id: "drugName", headerKey: "vault.reportColumns.drugName", kind: "text" },
		{ id: "transactionType", headerKey: "vault.reportColumns.transactionType", kind: "text" },
		{ id: "quantity", headerKey: "vault.reportColumns.quantity", kind: "number" },
		{ id: "price", headerKey: "vault.reportColumns.unitPrice", kind: "currency" },
		{ id: "totalRevenue", headerKey: "vault.reportColumns.totalRevenue", kind: "currency" },
		{ id: "timestamp", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "saleType", headerKey: "vault.reportColumns.saleType", kind: "text" },
	],
	"drug-profits": [
		{ id: "drugName", headerKey: "vault.reportColumns.drugName", kind: "text" },
		{ id: "manufacturer", headerKey: "vault.reportColumns.manufacturer", kind: "text" },
		{ id: "totalQuantitySold", headerKey: "vault.reportColumns.quantitySold", kind: "number" },
		{ id: "totalRevenue", headerKey: "vault.reportColumns.revenue", kind: "currency" },
		{ id: "totalCost", headerKey: "vault.reportColumns.cost", kind: "currency" },
		{ id: "totalProfit", headerKey: "vault.reportColumns.profit", kind: "currency" },
		{ id: "transactionCount", headerKey: "vault.reportColumns.transactions", kind: "number" },
	],
	"supply-shipments": [
		{ id: "supplyName", headerKey: "vault.reportColumns.supplyName", kind: "text" },
		{ id: "manufacturer", headerKey: "vault.reportColumns.manufacturer", kind: "text" },
		{ id: "buyQuantity", headerKey: "vault.reportColumns.quantity", kind: "number" },
		{ id: "buyPrice", headerKey: "vault.reportColumns.unitCost", kind: "currency" },
		{ id: "totalCost", headerKey: "vault.reportColumns.totalCost", kind: "currency" },
		{ id: "receivedDate", headerKey: "vault.reportColumns.receivedDate", kind: "date" },
		{ id: "warehouseName", headerKey: "vault.reportColumns.warehouse", kind: "text" },
	],
	"supply-sales": [
		{ id: "supplyName", headerKey: "vault.reportColumns.supplyName", kind: "text" },
		{ id: "transactionType", headerKey: "vault.reportColumns.transactionType", kind: "text" },
		{ id: "quantity", headerKey: "vault.reportColumns.quantity", kind: "number" },
		{ id: "price", headerKey: "vault.reportColumns.unitPrice", kind: "currency" },
		{ id: "totalRevenue", headerKey: "vault.reportColumns.totalRevenue", kind: "currency" },
		{ id: "timestamp", headerKey: "vault.reportColumns.date", kind: "date" },
		{ id: "saleType", headerKey: "vault.reportColumns.saleType", kind: "text" },
	],
	"supply-profits": [
		{ id: "supplyName", headerKey: "vault.reportColumns.supplyName", kind: "text" },
		{ id: "manufacturer", headerKey: "vault.reportColumns.manufacturer", kind: "text" },
		{ id: "totalQuantitySold", headerKey: "vault.reportColumns.quantitySold", kind: "number" },
		{ id: "totalRevenue", headerKey: "vault.reportColumns.revenue", kind: "currency" },
		{ id: "totalCost", headerKey: "vault.reportColumns.cost", kind: "currency" },
		{ id: "totalProfit", headerKey: "vault.reportColumns.profit", kind: "currency" },
		{ id: "transactionCount", headerKey: "vault.reportColumns.transactions", kind: "number" },
	],
	"wages-owed": wagesColumns(true),
	"wages-paid": wagesColumns(false),
}

/** Metric drill map — the summary metric rows and their report targets. */
export interface VaultMetricSpec {
	/** Literal i18n key under `vault.metrics.`. */
	labelKey: string
	/** Summary field, or a resolver over the summary (vat+admin is combined — legacy parity). */
	value: (summary: Record<string, number>) => number
	/** Value kind: currency vs count (insurance payment count). */
	kind: "currency" | "count"
	/** KPI/tone class: success | danger | warning | primary | neutral (legacy colors). */
	tone: "success" | "danger" | "warning" | "primary" | "neutral"
	/** Report drill — omit for metrics with no report (none currently; supplies has one now). */
	reportType?: ReportType
}

export interface VaultSectionSpec {
	/** Literal i18n key under `vault.sections.`. */
	titleKey: string
	/** DOM id for the D9 KPI scroll target. */
	id: string
	metrics: VaultMetricSpec[]
}

/** The 5 summary sections (legacy vault.html layout, plan A1). */
export const VAULT_SECTIONS: VaultSectionSpec[] = [
	{
		titleKey: "vault.sections.patientRevenue",
		id: "vault-section-patient-revenue",
		metrics: [
			{ labelKey: "vault.metrics.servicesRevenue", value: (s) => s.patientServicesTotal, kind: "currency", tone: "neutral", reportType: "patient-services" },
			{ labelKey: "vault.metrics.drugsRevenue", value: (s) => s.patientDrugsTotal, kind: "currency", tone: "neutral", reportType: "patient-drugs" },
			{ labelKey: "vault.metrics.suppliesRevenue", value: (s) => s.patientSuppliesTotal, kind: "currency", tone: "neutral", reportType: "patient-supplies" },
			{ labelKey: "vault.metrics.medicalTestsRevenue", value: (s) => s.patientMedicalTestsTotal, kind: "currency", tone: "neutral", reportType: "patient-medical-tests" },
			{ labelKey: "vault.metrics.totalPayments", value: (s) => s.patientPaymentsTotal, kind: "currency", tone: "success", reportType: "patient-payments" },
			{ labelKey: "vault.metrics.outstandingBalance", value: (s) => s.patientOutstandingTotal, kind: "currency", tone: "warning", reportType: "patient-outstanding" },
			{ labelKey: "vault.metrics.totalDiscounts", value: (s) => s.patientDiscountsTotal, kind: "currency", tone: "neutral", reportType: "patient-discounts" },
			{
				labelKey: "vault.metrics.vatAndAdminTotal",
				value: (s) => s.patientVatTotal + s.patientAdminTotal,
				kind: "currency",
				tone: "primary",
				reportType: "patient-vat-admin",
			},
		],
	},
	{
		titleKey: "vault.sections.manualPayments",
		id: "vault-section-manual-payments",
		metrics: [
			{ labelKey: "vault.metrics.manualAdditions", value: (s) => s.manualAdditionsTotal, kind: "currency", tone: "success", reportType: "manual-payments" },
			{ labelKey: "vault.metrics.manualDeductions", value: (s) => s.manualDeductionsTotal, kind: "currency", tone: "danger", reportType: "manual-payments" },
			{
				labelKey: "vault.metrics.netManual",
				value: (s) => s.manualNetTotal,
				kind: "currency",
				tone: "neutral",
				reportType: "manual-payments",
				// Legacy colored this value green/red by sign — handled in MetricRow via value sign.
				// (kept as neutral here; the sign tone is applied at render time)
			},
		],
	},
	{
		titleKey: "vault.sections.insurancePayments",
		id: "vault-section-insurance-payments",
		metrics: [
			{ labelKey: "vault.metrics.totalReceived", value: (s) => s.insurancePaymentsTotal, kind: "currency", tone: "success", reportType: "insurance-payments" },
			{ labelKey: "vault.metrics.paymentCount", value: (s) => s.insurancePaymentCount, kind: "count", tone: "neutral", reportType: "insurance-payments" },
			{ labelKey: "vault.metrics.averagePayment", value: (s) => s.insurancePaymentAverage, kind: "currency", tone: "primary", reportType: "insurance-payments" },
		],
	},
	{
		titleKey: "vault.sections.pharmacyOperations",
		id: "vault-section-pharmacy-supplies",
		metrics: [
			{ labelKey: "vault.metrics.shipmentCosts", value: (s) => s.drugShipmentCostsTotal, kind: "currency", tone: "danger", reportType: "drug-shipments" },
			{ labelKey: "vault.metrics.salesRevenue", value: (s) => s.drugSalesRevenueTotal, kind: "currency", tone: "success", reportType: "drug-sales" },
			{ labelKey: "vault.metrics.salesProfit", value: (s) => s.drugSalesProfitTotal, kind: "currency", tone: "primary", reportType: "drug-profits" },
			{ labelKey: "vault.metrics.supplyShipmentCosts", value: (s) => s.supplyShipmentCostsTotal, kind: "currency", tone: "danger", reportType: "supply-shipments" },
			{ labelKey: "vault.metrics.supplySalesRevenue", value: (s) => s.supplySalesRevenueTotal, kind: "currency", tone: "success", reportType: "supply-sales" },
			{ labelKey: "vault.metrics.supplySalesProfit", value: (s) => s.supplySalesProfitTotal, kind: "currency", tone: "primary", reportType: "supply-profits" },
		],
	},
	{
		titleKey: "vault.sections.employeeWages",
		id: "vault-section-employee-wages",
		metrics: [
			{ labelKey: "vault.metrics.wagesOwed", value: (s) => s.wagesOwedTotal, kind: "currency", tone: "warning", reportType: "wages-owed" },
			{ labelKey: "vault.metrics.wagesPaid", value: (s) => s.wagesPaidTotal, kind: "currency", tone: "success", reportType: "wages-paid" },
			// Legacy parity: the outstanding-wages drill opens the wages-owed report.
			{ labelKey: "vault.metrics.outstandingWages", value: (s) => s.wagesOutstandingTotal, kind: "currency", tone: "danger", reportType: "wages-owed" },
		],
	},
]

/** English labels for PDF/CSV (English-only exports — legacy parity, plan A10/A11). */
export const REPORT_TITLE_LABELS: Record<ReportType, string> = {
	"patient-services": "Patient Services Revenue",
	"patient-drugs": "Patient Drugs Revenue",
	"patient-supplies": "Patient Supplies Revenue",
	"patient-payments": "Patient Payments",
	"patient-outstanding": "Outstanding Balances",
	"patient-discounts": "Patient Discounts",
	"patient-medical-tests": "Medical Tests Revenue",
	"patient-vat-admin": "Patient VAT & Admin Expenses",
	"manual-payments": "Manual Payments",
	"insurance-payments": "Insurance Payments",
	"drug-shipments": "Drug Shipment Costs",
	"drug-sales": "Drug Sales Revenue",
	"drug-profits": "Drug Sales Profit",
	"supply-shipments": "Supply Shipment Costs",
	"supply-sales": "Supply Sales Revenue",
	"supply-profits": "Supply Sales Profit",
	"wages-owed": "Wages Owed",
	"wages-paid": "Wages Paid",
}

/** English column labels for PDF/CSV, keyed by column id (mirrors REPORT_COLUMNS order). */export const REPORT_COLUMN_LABELS: Record<string, string> = {
	patientName: "Patient Name",
	billId: "Bill ID",
	generatedAt: "Date",
	updatedAt: "Payment Date",
	servicesTotal: "Services Total",
	drugsTotal: "Drugs Total",
	suppliesTotal: "Supplies Total",
	medicalTestsAmount: "Amount",
	discountAmount: "Discount",
	paidAmount: "Paid",
	discountType: "Discount Type",
	discount: "Discount Value",
	totalAmount: "Total Amount",
	administrativeExpenses: "Administrative Expenses",
	vatAmount: "VAT Amount",
	paymentType: "Payment Type",
	paymentId: "Payment ID",
	paymentTime: "Date",
	paymentAmount: "Amount",
	description: "Description",
	insuranceName: "Insurance Company",
	paymentFrom: "Period From",
	paymentTo: "Period To",
	issuedTimestamp: "Recorded Date",
	addedBy: "Added By",
	drugName: "Drug Name",
	supplyName: "Supply Name",
	manufacturer: "Manufacturer",
	buyQuantity: "Quantity",
	quantity: "Quantity",
	buyPrice: "Unit Cost",
	totalCost: "Total Cost",
	receivedDate: "Received Date",
	warehouseName: "Warehouse",
	timestamp: "Date",
	price: "Unit Price",
	totalRevenue: "Total Revenue",
	saleType: "Sale Type",
	transactionType: "Transaction Type",
	totalQuantitySold: "Quantity Sold",
	transactionCount: "Transactions",
	totalProfit: "Profit",
	employeeName: "Employee",
	employeeType: "Type",
	extraAmount: "Extra Amount",
	extraPaymentType: "Extra Type",
	isPaid: "Status",
	paidTimestamp: "Paid Date",
	paidBy: "Paid By",
}

/** Drill-button titles: literal `vault.reportButtons.*` keys (aria-label/tooltip). */
export const REPORT_BUTTON_TITLES: Array<{ id: ReportType; titleKey: string }> = [
	{ id: "patient-services", titleKey: "vault.reportButtons.viewServicesReport" },
	{ id: "patient-drugs", titleKey: "vault.reportButtons.viewDrugsReport" },
	{ id: "patient-supplies", titleKey: "vault.reportButtons.viewSuppliesReport" },
	{ id: "patient-medical-tests", titleKey: "vault.reportButtons.viewMedicalTestsReport" },
	{ id: "patient-vat-admin", titleKey: "vault.reportButtons.viewVatAdminReport" },
	{ id: "patient-payments", titleKey: "vault.reportButtons.viewPaymentsReport" },
	{ id: "patient-outstanding", titleKey: "vault.reportButtons.viewOutstandingReport" },
	{ id: "patient-discounts", titleKey: "vault.reportButtons.viewDiscountsReport" },
	{ id: "manual-payments", titleKey: "vault.reportButtons.viewManualPaymentsReport" },
	{ id: "insurance-payments", titleKey: "vault.reportButtons.viewInsurancePaymentsReport" },
	{ id: "drug-shipments", titleKey: "vault.reportButtons.viewShipmentsReport" },
	{ id: "drug-sales", titleKey: "vault.reportButtons.viewSalesReport" },
	{ id: "drug-profits", titleKey: "vault.reportButtons.viewProfitsReport" },
	{ id: "supply-shipments", titleKey: "vault.reportButtons.viewSupplyShipmentsReport" },
	{ id: "supply-sales", titleKey: "vault.reportButtons.viewSupplySalesReport" },
	{ id: "supply-profits", titleKey: "vault.reportButtons.viewSupplyProfitsReport" },
	{ id: "wages-owed", titleKey: "vault.reportButtons.viewWagesOwedReport" },
	{ id: "wages-paid", titleKey: "vault.reportButtons.viewWagesPaidReport" },
]

/** Lookup helper over `REPORT_BUTTON_TITLES`. */
export function reportButtonTitleKey(type: ReportType): string {
	return REPORT_BUTTON_TITLES.find((entry) => entry.id === type)?.titleKey ?? ""
}
