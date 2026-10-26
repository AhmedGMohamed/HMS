/**
 * Port of the legacy `VaultManager.calculateReportSummary` (vault.ts:575-784)
 * with the D8 camelCase rename applied to every summary key so the chips read
 * from `vault.reportSummary.*` camelCase locale keys.
 *
 * Chips carry full literal i18n keys (`titleKey`) so `check-i18n:renderer`
 * sees every key usage statically.
 *
 * `kind: "count"` chips are rendered with `formatNumber`; `kind: "currency"`
 * chips with `formatCurrency` (plan A8 / chip rule: keys containing
 * records/unique/quantity/count/shipments/transactions are counts).
 */
import type { ReportRow, ReportType } from "@/pages/Vault/types/vault"

export interface ReportSummaryChip {
	/** Full literal i18n key under `vault.reportSummary.` (camelCase — D8). */
	titleKey: string
	kind: "currency" | "count"
	value: number
}

type Row = ReportRow & Record<string, unknown>

function num(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0))
	return Number.isFinite(parsed) ? parsed : 0
}

function sumBy(rows: Row[], pick: (row: Row) => number): number {
	return rows.reduce((sum, row) => sum + pick(row), 0)
}

export function calculateReportSummary(reportType: ReportType, data: ReportRow[]): ReportSummaryChip[] {
	const rows = data as Row[]

	switch (reportType) {
		case "patient-services":
		case "patient-drugs":
		case "patient-supplies": {
			const total = sumBy(rows, (r) => num(r.servicesTotal ?? r.drugsTotal ?? r.suppliesTotal))
			return [
				{ titleKey: "vault.reportSummary.totalRevenue", kind: "currency", value: total },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
				{ titleKey: "vault.reportSummary.avgPerPatient", kind: "currency", value: rows.length > 0 ? total / rows.length : 0 },
			]
		}

		case "patient-medical-tests": {
			const total = sumBy(rows, (r) => num(r.medicalTestsAmount))
			return [
				{ titleKey: "vault.reportSummary.totalRevenue", kind: "currency", value: total },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
				{ titleKey: "vault.reportSummary.avgPerPatient", kind: "currency", value: rows.length > 0 ? total / rows.length : 0 },
			]
		}

		case "patient-payments": {
			const total = sumBy(rows, (r) => num(r.paidAmount))
			return [
				{ titleKey: "vault.reportSummary.totalPaid", kind: "currency", value: total },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
				{ titleKey: "vault.reportSummary.avgPayment", kind: "currency", value: rows.length > 0 ? total / rows.length : 0 },
			]
		}

		case "patient-outstanding": {
			const total = sumBy(rows, (r) => num(r.outstandingAmount))
			return [
				{ titleKey: "vault.reportSummary.totalOutstanding", kind: "currency", value: total },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
				{ titleKey: "vault.reportSummary.avgOutstanding", kind: "currency", value: rows.length > 0 ? total / rows.length : 0 },
			]
		}

		case "patient-discounts":
			return [
				{ titleKey: "vault.reportSummary.totalDiscounts", kind: "currency", value: sumBy(rows, (r) => num(r.discountAmount)) },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
			]

		case "patient-vat-admin":
			return [
				{ titleKey: "vault.reportSummary.totalVat", kind: "currency", value: sumBy(rows, (r) => num(r.vatAmount)) },
				{ titleKey: "vault.reportSummary.totalAdminExpenses", kind: "currency", value: sumBy(rows, (r) => num(r.administrativeExpenses)) },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
			]

		case "manual-payments":
			return [
				{
					titleKey: "vault.reportSummary.totalAdditions",
					kind: "currency",
					value: sumBy(rows.filter((r) => r.paymentType === "addition"), (r) => num(r.paymentAmount)),
				},
				{
					titleKey: "vault.reportSummary.totalDeductions",
					kind: "currency",
					value: sumBy(rows.filter((r) => r.paymentType === "deduction"), (r) => num(r.paymentAmount)),
				},
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
			]

		case "insurance-payments": {
			const total = sumBy(rows, (r) => num(r.paymentAmount))
			return [
				// Legacy used a nonexistent "total_payments" locale key (bug) — mapped to totalRevenue.
				{ titleKey: "vault.reportSummary.totalRevenue", kind: "currency", value: total },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
				{ titleKey: "vault.reportSummary.avgPayment", kind: "currency", value: rows.length > 0 ? total / rows.length : 0 },
				{ titleKey: "vault.reportSummary.uniqueCompanies", kind: "count", value: new Set(rows.map((r) => r.insuranceId)).size },
			]
		}

		case "drug-shipments":
		case "supply-shipments":
			return [
				{ titleKey: "vault.reportSummary.totalCost", kind: "currency", value: sumBy(rows, (r) => num(r.totalCost)) },
				{ titleKey: "vault.reportSummary.totalQuantity", kind: "count", value: sumBy(rows, (r) => Math.trunc(num(r.buyQuantity))) },
				{ titleKey: "vault.reportSummary.totalShipments", kind: "count", value: rows.length },
			]

		case "drug-sales":
		case "supply-sales":
			return [
				{ titleKey: "vault.reportSummary.totalRevenue", kind: "currency", value: sumBy(rows, (r) => num(r.totalRevenue)) },
				{ titleKey: "vault.reportSummary.totalQuantity", kind: "count", value: sumBy(rows, (r) => Math.trunc(num(r.quantity))) },
				{ titleKey: "vault.reportSummary.totalTransactions", kind: "count", value: rows.length },
			]

		case "drug-profits":
		case "supply-profits":
			return [
				{ titleKey: "vault.reportSummary.totalRevenue", kind: "currency", value: sumBy(rows, (r) => num(r.totalRevenue)) },
				{ titleKey: "vault.reportSummary.totalCost", kind: "currency", value: sumBy(rows, (r) => num(r.totalCost)) },
				{ titleKey: "vault.reportSummary.totalProfit", kind: "currency", value: sumBy(rows, (r) => num(r.totalProfit)) },
			]

		case "wages-owed":
		case "wages-paid":
			return [
				{ titleKey: "vault.reportSummary.totalWages", kind: "currency", value: sumBy(rows, (r) => num(r.paymentAmount) + num(r.extraAmount)) },
				{ titleKey: "vault.reportSummary.totalRecords", kind: "count", value: rows.length },
				{ titleKey: "vault.reportSummary.uniqueEmployees", kind: "count", value: new Set(rows.map((r) => r.employeeId)).size },
			]

		default:
			return []
	}
}
