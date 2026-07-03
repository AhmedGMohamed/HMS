/**
 * Format a numeric value as a 2-decimal currency string. The legacy
 * card used `parseFloat(...).toFixed(2)` everywhere; we mirror
 * that here so the rendered total strings match.
 *
 * Locale-aware decimal separator is intentionally avoided — billing
 * receipts must match the server's stored DECIMAL(15,2) value to
 * avoid rounding drift.
 */
export function formatCurrency(value: number): string {
  const v = Number.isFinite(value) ? value : 0
  return v.toFixed(2)
}
