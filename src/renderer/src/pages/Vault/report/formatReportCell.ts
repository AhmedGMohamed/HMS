/**
 * Pure report-cell formatting shared by the Report dialog, the PDF
 * builder and the CSV exporter (single source of truth — legacy
 * `formatCell` port, plan A9/A10/A11).
 *
 * English-only consumers (PDF/CSV) pass an English locale; the dialog
 * passes the active page locale.
 */
import { formatCurrency, formatDate, formatNumber, resolveLocale } from "@/lib/utils"
import type { ReportColumnSpec } from "@/pages/Vault/report/reportConfig"
import type { ReportRow } from "@/pages/Vault/types/vault"
import type { TFunction } from "i18next"

function toNumber(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0))
	return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Formats one row cell to a display string.
 * - `status` → `paymentStatus.paid/pending`
 * - `paymentType` → capitalized `paymentTypes.addition/deduction`
 * - `discountValue` → `${value}%` when the row's `discountType` is
 *   "percentage", else currency (legacy parity)
 * - `date` → localized date; `currency` → EGP currency; `number` → grouped
 */
export function formatReportCell(
	row: ReportRow | Record<string, unknown>,
	column: ReportColumnSpec,
	t: TFunction,
	language: string = "en"
): string {
	const locale = language === "ar" ? "ar-EG" : "en-US"
	const value = (row as unknown as Record<string, unknown>)[column.id]

	switch (column.kind) {
		case "date":
			return value ? formatDate(new Date(String(value)), language) : "—"
		case "currency":
			return formatCurrency(toNumber(value), locale)
		case "number":
			return formatNumber(toNumber(value), 0)
		case "status":
			return value ? t("vault.paymentStatus.paid") : t("vault.paymentStatus.pending")
		case "paymentType": {
			const raw = String(value ?? "")
			const key = raw === "deduction" ? "deduction" : "addition"
			return t(`vault.paymentTypes.${key}`)
		}
		case "discountValue": {
			const numeric = toNumber(value)
			const discountType = String((row as unknown as Record<string, unknown>).discountType ?? "")
			return discountType === "percentage" ? `${numeric}%` : formatCurrency(numeric, locale)
		}
		default: {
			const text = String(value ?? "")
			return text.length > 0 ? text : "—"
		}
	}
}

/** Re-export for callers that need the locale mapping (CSV/PDF). */
export function englishLocale(): string {
	return resolveLocale("en")
}
