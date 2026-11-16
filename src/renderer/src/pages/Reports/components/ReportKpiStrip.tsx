"use client"

/**
 * KPI strip — Phase 6.11 plan §4.5.
 *
 * Thin, label-driven wrapper around `EditorialKpiCard` so every report tab
 * renders its summary with the same rail, spacing and tabular numerals. The
 * values arrive pre-formatted (currency vs count vs days) because only the
 * tab knows the semantics.
 *
 * Layout is item-count aware: a fixed 5-column grid leaves a 4-card tab
 * (patient detail, payroll, clock-in) rendering 4 cards at 1/5 width each,
 * which clips currency values. The strip therefore widens its columns to
 * fill the row: 5 items keep the 5-up rhythm, 4 items use a 4-up grid, and
 * anything narrower falls back to 2/3-up. `className` still wins for callers
 * that need a bespoke grid.
 */

import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import { cn } from "@/lib/utils"
import type { ReportKpi } from "@/pages/Reports/types/reports"

export interface ReportKpiStripProps {
  items: ReportKpi[]
  loading?: boolean
  className?: string
}

/**
 * Breakpoint classes for a given card count. Every card in the row must be
 * exactly `grid-columns = item count` wide at the largest breakpoint, or the
 * remaining track leaves the last card short and squeezes its neighbours.
 */
function gridColumnsFor(count: number): string {
  if (count <= 1) return ""
  if (count === 2) return "sm:grid-cols-2"
  if (count === 3) return "sm:grid-cols-3"
  if (count === 4) return "lg:grid-cols-4"
  return "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
}

export function ReportKpiStrip({ items, loading = false, className }: ReportKpiStripProps) {
  if (items.length === 0) return null

  return (
    <div
      className={cn("grid grid-cols-2 gap-3", gridColumnsFor(items.length), className)}
    >
      {items.map((item) => (
        <EditorialKpiCard
          key={item.key}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tone={item.tone ?? "neutral"}
          loading={loading}
        />
      ))}
    </div>
  )
}
