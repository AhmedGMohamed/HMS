/**
 * Value formatters shared by the Reports chart wrappers — Phase 6.11.
 *
 * Two variants per metric because axes and tooltips want different
 * precision: an axis tick reads `EGP 1.2K` while the tooltip must say
 * `EGP 1,234.50`. Keeping both in one factory means every chart on a page
 * formats its numbers identically (the legacy reports mixed `$` axis ticks
 * with EGP tooltips).
 */

import { formatCurrency, formatNumber } from "@/lib/utils"
import type { StaticLocale } from "@/lib/types-extras"

export type ChartValueFormat =
  | "currency"
  | "number"
  | "days"
  | "hours"
  | "percent"

export interface ChartFormatter {
  /** Compact axis tick label. */
  axis: (value: number) => string
  /** Exact tooltip label. */
  full: (value: number) => string
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

/**
 * Builds the axis/tooltip pair for one metric.
 *
 * `locale` must be an Intl locale (`en-US` / `ar-EG`); callers get it from
 * `resolveLocale(uiStore.language)`.
 */
export function createChartFormatter(
  format: ChartValueFormat,
  locale: StaticLocale
): ChartFormatter {
  switch (format) {
    case "currency": {
      const compact = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EGP",
        notation: "compact",
        maximumFractionDigits: 1,
      })
      return {
        axis: (value) => compact.format(safeNumber(value)),
        full: (value) => formatCurrency(safeNumber(value), locale),
      }
    }
    case "percent":
      return {
        axis: (value) => `${formatNumber(safeNumber(value))}%`,
        full: (value) => `${formatNumber(safeNumber(value))}%`,
      }
    case "days": {
      const suffix = locale === "ar-EG" ? "ي" : "d"
      return {
        axis: (value) => `${formatNumber(safeNumber(value))}${suffix}`,
        full: (value) => `${formatNumber(safeNumber(value))}${suffix}`,
      }
    }
    case "hours": {
      const suffix = locale === "ar-EG" ? "س" : "h"
      return {
        axis: (value) => `${formatNumber(safeNumber(value))}${suffix}`,
        full: (value) => `${formatNumber(safeNumber(value))}${suffix}`,
      }
    }
    case "number":
    default:
      return {
        axis: (value) => formatNumber(safeNumber(value)),
        full: (value) => formatNumber(safeNumber(value)),
      }
  }
}
