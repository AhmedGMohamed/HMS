/**
 * Re-export shim — Phase 6.11.
 *
 * The date-range presets moved to `@/lib/dateRange` so Reports can reuse
 * them. Kept so existing Vault imports keep resolving; new code should
 * import from `@/lib/dateRange`.
 */
export {
  currentMonthRange,
  fromDateParam,
  isValidRange,
  rangeForPreset,
  thisMonthRange,
  thisWeekRange,
  thisYearRange,
  toDateParam,
  todayRange,
} from "@/lib/dateRange"
export type { DateRangePreset } from "@/lib/dateRange"
