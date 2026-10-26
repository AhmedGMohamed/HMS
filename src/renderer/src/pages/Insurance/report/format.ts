/**
 * Export formatting helpers for insurance reports — Phase 6.10.
 *
 * PDFs and CSVs are English-only (legacy parity — the legacy
 * `printReport`/`printPatientReport` hardcoded English labels and
 * `toLocaleDateString("en-GB")`). Keeping the formatters here means the
 * on-screen tables stay localized while the exports stay stable.
 */

/** `26/10/2026` — matches the legacy `en-GB` date rendering. */
export function formatEnGbDate(value: string | null | undefined): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB")
}

/** `26/10/2026, 14:05` — legacy `formatDateTime` equivalent for exports. */
export function formatEnGbDateTime(value: string | null | undefined): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
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
