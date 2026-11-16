/**
 * Export formatting helpers — Phase 6.11 (promoted from Insurance 6.10).
 *
 * PDFs and CSVs are English-only (legacy parity: the old `printReport`
 * implementations hardcoded English labels and used
 * `toLocaleDateString("en-GB")`). Keeping the formatters here means the
 * on-screen tables stay localized while exports stay stable and identical
 * across pages.
 */

/** Formats an ISO string / Date as `26/10/2026`. `-` for missing/invalid. */
export function formatEnGbDate(value: string | Date | null | undefined): string {
	if (!value) return "-"
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return "-"
	return date.toLocaleDateString("en-GB")
}

/** Formats an ISO string / Date as `26/10/2026, 14:05`. */
export function formatEnGbDateTime(value: string | Date | null | undefined): string {
	if (!value) return "-"
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return "-"
	return date.toLocaleString("en-GB", {
		dateStyle: "short",
		timeStyle: "short",
	})
}

/** `14:05` — time-only rendering for clock-in exports. */
export function formatEnGbTime(value: string | Date | null | undefined): string {
	if (!value) return "-"
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return "-"
	return date.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	})
}

/** `1,234.50` — grouped, two decimals, no currency symbol. */
export function formatMoneyEn(value: number): string {
	const amount = Number(value)
	if (!Number.isFinite(amount)) return "0.00"
	return amount.toLocaleString("en-GB", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}

/** `EGP 1,234.50` — money with the currency code (exports are EGP-only). */
export function formatCurrencyEn(value: number): string {
	return `EGP ${formatMoneyEn(value)}`
}

/** `12` / `12.5` — plain number without trailing zeros. */
export function formatNumberEn(value: number, maximumFractionDigits = 2): string {
	const amount = Number(value)
	if (!Number.isFinite(amount)) return "0"
	return amount.toLocaleString("en-GB", { maximumFractionDigits })
}
