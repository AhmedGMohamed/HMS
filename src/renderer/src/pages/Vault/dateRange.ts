/**
 * Date-range presets — Phase 6.9 plan §3.5 (A3, A4).
 *
 * Module-level pure helpers (kept out of the toolbar component file so the
 * react-refresh only-export-components rule stays satisfied). All ranges
 * are local calendar dates; the backend applies its own inclusive-boundary
 * semantics.
 */
import type { DateRange } from "@/pages/Vault/types/vault"

/** First day of the current month → today (plan default range). */
export function currentMonthRange(): DateRange {
	const now = new Date()
	return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
}

/** Today → today preset. */
export function todayRange(): DateRange {
	const now = new Date()
	return { from: now, to: now }
}

/** First day → last day of the current month preset. */
export function thisMonthRange(): DateRange {
	const now = new Date()
	return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }
}
