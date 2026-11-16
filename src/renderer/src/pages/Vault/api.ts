/**
 * Vault page data layer — Phase 6.9 plan §3.2 (A5, A6).
 *
 * All endpoints require `start_date` + `end_date` query params (backend 400s
 * otherwise — the UI never sends incomplete ranges, plan §3.7). Dates are sent
 * as plain `YYYY-MM-DD` local calendar dates; the backend applies its own
 * inclusive-boundary logic (`+1 day` interval for timestamp columns, bare
 * inclusive DATE for shipment `received_date`).
 *
 * Money normalization (A6): PostgreSQL DECIMAL columns can arrive as strings;
 * every report fetcher coerces declared money fields to `number` before the
 * rows reach the UI (prevents `formatCurrency`/sort bugs like "10" < "9").
 */
import { api } from "@/lib/api"
import type {
	CreateManualPaymentPayload,
	DateRange,
	DrugProfitsRow,
	DrugSalesRow,
	DrugShipmentsRow,
	InsurancePaymentsRow,
	ManualPaymentsRow,
	PatientDiscountsRow,
	PatientDrugsRow,
	PatientMedicalTestsRow,
	PatientOutstandingRow,
	PatientPaymentsRow,
	PatientServicesRow,
	PatientSuppliesRow,
	PatientVatAdminRow,
	ReportType,
	SupplyProfitsRow,
	SupplySalesRow,
	SupplyShipmentsRow,
	VaultSummary,
	WagesOwedRow,
	WagesPaidRow,
} from "./types/vault"

/** Normalizes a money-ish value (`number | string | null | undefined`) to a finite number. */
function toMoney(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
	return Number.isFinite(parsed) ? parsed : 0
}

/** Serializes a Date as a local `YYYY-MM-DD` calendar date (no TZ shifting). */
function toDateParam(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

/** Query params accepted by every Vault GET endpoint. */
function rangeParams(range: DateRange): { start_date: string; end_date: string } {
	return { start_date: toDateParam(range.from), end_date: toDateParam(range.to) }
}

/** `GET /api/vault/summary` — totals arrive as numbers (server parseFloat'd). */
export function getVaultSummary(range: DateRange): Promise<VaultSummary> {
	return api.get<VaultSummary>("/vault/summary", rangeParams(range))
}

/* ---------------------------------- Normalizers (A6) ---------------------------------- */

/** Coerces the given money keys of `row` to numbers in place (spread copy). */
function normalizeMoneyKeys<T extends object>(row: T, keys: string[]): T {
	const copy = { ...row } as Record<string, unknown>
	for (const key of keys) {
		copy[key] = toMoney(copy[key])
	}
	return copy as T
}



function normalizePatientPaymentsRow(row: PatientPaymentsRow): PatientPaymentsRow {
	return { ...row, totalAmount: toMoney(row.totalAmount), paidAmount: toMoney(row.paidAmount) }
}

function normalizePatientOutstandingRow(row: PatientOutstandingRow): PatientOutstandingRow {
	return { ...row, totalAmount: toMoney(row.totalAmount), paidAmount: toMoney(row.paidAmount), outstandingAmount: toMoney(row.outstandingAmount) }
}

function normalizePatientDiscountsRow(row: PatientDiscountsRow): PatientDiscountsRow {
	return { ...row, discount: toMoney(row.discount), totalAmount: toMoney(row.totalAmount), discountAmount: toMoney(row.discountAmount) }
}

function normalizePatientVatAdminRow(row: PatientVatAdminRow): PatientVatAdminRow {
	return { ...row, totalAmount: toMoney(row.totalAmount), vatAmount: toMoney(row.vatAmount), administrativeExpenses: toMoney(row.administrativeExpenses) }
}

function normalizeMedicalTestsRow(row: PatientMedicalTestsRow): PatientMedicalTestsRow {
	return { ...row, medicalTestsAmount: toMoney(row.medicalTestsAmount) }
}

function normalizeManualPaymentsRow(row: ManualPaymentsRow): ManualPaymentsRow {
	return { ...row, paymentAmount: toMoney(row.paymentAmount) }
}

function normalizeInsurancePaymentsRow(row: InsurancePaymentsRow): InsurancePaymentsRow {
	return { ...row, paymentAmount: toMoney(row.paymentAmount) }
}

function normalizeShipmentRow<T extends { buyPrice: unknown; totalCost: unknown }>(row: T) {
	return { ...row, buyPrice: toMoney(row.buyPrice), totalCost: toMoney(row.totalCost) }
}

function normalizeSalesRow<T extends { price: unknown; totalRevenue: unknown }>(row: T) {
	return { ...row, price: toMoney(row.price), totalRevenue: toMoney(row.totalRevenue) }
}

function normalizeProfitsRow<T extends { totalRevenue: unknown; totalCost: unknown; totalProfit: unknown }>(row: T) {
	return {
		...row,
		totalRevenue: toMoney(row.totalRevenue),
		totalCost: toMoney(row.totalCost),
		totalProfit: toMoney(row.totalProfit),
	}
}

function normalizeWagesRow<T extends { paymentAmount: unknown; extraAmount: unknown }>(row: T) {
	return { ...row, paymentAmount: toMoney(row.paymentAmount), extraAmount: row.extraAmount == null ? null : toMoney(row.extraAmount) }
}

/* ---------------------------------- Report fetchers ---------------------------------- */

export function getPatientServicesReport(range: DateRange): Promise<PatientServicesRow[]> {
	return api
		.get<PatientServicesRow[]>("/vault/patient-services", rangeParams(range))
		.then((rows) => rows.map((row) => normalizeMoneyKeys(row, ["servicesTotal", "discountAmount", "paidAmount"])))
}

export function getPatientDrugsReport(range: DateRange): Promise<PatientDrugsRow[]> {
	return api
		.get<PatientDrugsRow[]>("/vault/patient-drugs", rangeParams(range))
		.then((rows) => rows.map((row) => normalizeMoneyKeys(row, ["drugsTotal", "discountAmount", "paidAmount"])))
}

export function getPatientSuppliesReport(range: DateRange): Promise<PatientSuppliesRow[]> {
	return api
		.get<PatientSuppliesRow[]>("/vault/patient-supplies", rangeParams(range))
		.then((rows) => rows.map((row) => normalizeMoneyKeys(row, ["suppliesTotal", "discountAmount", "paidAmount"])))
}

export function getPatientPaymentsReport(range: DateRange): Promise<PatientPaymentsRow[]> {
	return api
		.get<PatientPaymentsRow[]>("/vault/patient-payments", rangeParams(range))
		.then((rows) => rows.map(normalizePatientPaymentsRow))
}

export function getPatientOutstandingReport(range: DateRange): Promise<PatientOutstandingRow[]> {
	return api
		.get<PatientOutstandingRow[]>("/vault/patient-outstanding", rangeParams(range))
		.then((rows) => rows.map(normalizePatientOutstandingRow))
}

export function getPatientDiscountsReport(range: DateRange): Promise<PatientDiscountsRow[]> {
	return api
		.get<PatientDiscountsRow[]>("/vault/patient-discounts", rangeParams(range))
		.then((rows) => rows.map(normalizePatientDiscountsRow))
}

export function getPatientMedicalTestsReport(range: DateRange): Promise<PatientMedicalTestsRow[]> {
	return api
		.get<PatientMedicalTestsRow[]>("/vault/patient-medical-tests", rangeParams(range))
		.then((rows) => rows.map(normalizeMedicalTestsRow))
}

export function getPatientVatAdminReport(range: DateRange): Promise<PatientVatAdminRow[]> {
	return api
		.get<PatientVatAdminRow[]>("/vault/patient-vat-admin", rangeParams(range))
		.then((rows) => rows.map(normalizePatientVatAdminRow))
}

export function getManualPaymentsReport(range: DateRange): Promise<ManualPaymentsRow[]> {
	return api
		.get<ManualPaymentsRow[]>("/vault/manual-payments", rangeParams(range))
		.then((rows) => rows.map(normalizeManualPaymentsRow))
}

export function getInsurancePaymentsReport(range: DateRange): Promise<InsurancePaymentsRow[]> {
	return api
		.get<InsurancePaymentsRow[]>("/vault/insurance-payments", rangeParams(range))
		.then((rows) => rows.map(normalizeInsurancePaymentsRow))
}

export function getDrugShipmentsReport(range: DateRange): Promise<DrugShipmentsRow[]> {
	return api
		.get<DrugShipmentsRow[]>("/vault/drug-shipments", rangeParams(range))
		.then((rows) => rows.map(normalizeShipmentRow))
}

export function getDrugSalesReport(range: DateRange): Promise<DrugSalesRow[]> {
	return api
		.get<DrugSalesRow[]>("/vault/drug-sales", rangeParams(range))
		.then((rows) => rows.map(normalizeSalesRow))
}

export function getDrugProfitsReport(range: DateRange): Promise<DrugProfitsRow[]> {
	return api
		.get<DrugProfitsRow[]>("/vault/drug-profits", rangeParams(range))
		.then((rows) => rows.map(normalizeProfitsRow))
}

export function getSupplyShipmentsReport(range: DateRange): Promise<SupplyShipmentsRow[]> {
	return api
		.get<SupplyShipmentsRow[]>("/vault/supply-shipments", rangeParams(range))
		.then((rows) => rows.map(normalizeShipmentRow))
}

export function getSupplySalesReport(range: DateRange): Promise<SupplySalesRow[]> {
	return api
		.get<SupplySalesRow[]>("/vault/supply-sales", rangeParams(range))
		.then((rows) => rows.map(normalizeSalesRow))
}

export function getSupplyProfitsReport(range: DateRange): Promise<SupplyProfitsRow[]> {
	return api
		.get<SupplyProfitsRow[]>("/vault/supply-profits", rangeParams(range))
		.then((rows) => rows.map(normalizeProfitsRow))
}

export function getWagesOwedReport(range: DateRange): Promise<WagesOwedRow[]> {
	return api
		.get<WagesOwedRow[]>("/vault/wages-owed", rangeParams(range))
		.then((rows) => rows.map(normalizeWagesRow))
}

export function getWagesPaidReport(range: DateRange): Promise<WagesPaidRow[]> {
	return api
		.get<WagesPaidRow[]>("/vault/wages-paid", rangeParams(range))
		.then((rows) => rows.map(normalizeWagesRow))
}

/** Dispatches a report fetch by `ReportType` (plan §3.2). */
export function getVaultReport(type: ReportType, range: DateRange): Promise<unknown[]> {
	switch (type) {
		case "patient-services":
			return getPatientServicesReport(range)
		case "patient-drugs":
			return getPatientDrugsReport(range)
		case "patient-supplies":
			return getPatientSuppliesReport(range)
		case "patient-payments":
			return getPatientPaymentsReport(range)
		case "patient-outstanding":
			return getPatientOutstandingReport(range)
		case "patient-discounts":
			return getPatientDiscountsReport(range)
		case "patient-medical-tests":
			return getPatientMedicalTestsReport(range)
		case "patient-vat-admin":
			return getPatientVatAdminReport(range)
		case "manual-payments":
			return getManualPaymentsReport(range)
		case "insurance-payments":
			return getInsurancePaymentsReport(range)
		case "drug-shipments":
			return getDrugShipmentsReport(range)
		case "drug-sales":
			return getDrugSalesReport(range)
		case "drug-profits":
			return getDrugProfitsReport(range)
		case "supply-shipments":
			return getSupplyShipmentsReport(range)
		case "supply-sales":
			return getSupplySalesReport(range)
		case "supply-profits":
			return getSupplyProfitsReport(range)
		case "wages-owed":
			return getWagesOwedReport(range)
		case "wages-paid":
			return getWagesPaidReport(range)
	}
}

/**
 * `POST /api/vault/manual-payments` — gated by `manage_vault` server-side
 * (the client hides the entry point, plan A12/D7). The backend rejects
 * falsy amounts with 400; the form's `min(0.01)` rule makes that unreachable.
 */
export function addManualPayment(body: CreateManualPaymentPayload): Promise<ManualPaymentsRow> {
	return api.post<ManualPaymentsRow>("/vault/manual-payments", body).then(normalizeManualPaymentsRow)
}
