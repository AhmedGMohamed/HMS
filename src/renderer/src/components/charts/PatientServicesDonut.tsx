"use client"

import { Cell, Pie, PieChart } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { StaticLocale } from "@/lib/types-extras"
import { EmptyState } from "@/components/common/EmptyState"
import { StatTileSkeleton } from "./StatTileSkeleton"
import { useChartConfig } from "./useChartConfig"

export interface PatientServicesDonutSlice {
  /** Slice label (e.g. "Patient Services", "Pharmacy"). */
  name: string
  /** Slice value (revenue or profit, depending on `metric`). */
  value: number
  /** Optional override colour. Otherwise the wrapper picks by index. */
  color?: string
}

export interface PatientServicesDonutProps {
  data: PatientServicesDonutSlice[]
  loading?: boolean
  /** Switches between revenue / profit semantics (used by tooltip text). */
  metric: "revenue" | "profit"
  srSummary?: string
  locale?: StaticLocale
  className?: string
}

const PALETTE = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-danger)",
]

/**
 * Donut/pie chart for revenue-by-category or patient-by-gender.
 *
 * Replaces the old `DonutChart.tsx` (Phase 0 reference). Honours the
 * revenue/profit toggle from design.md §6.2 — only the `metric` prop
 * changes the legend label and tooltip copy; the chart itself is
 * parameterised by `data`.
 *
 * Empty data renders `<EmptyState>` rather than an empty arc frame.
 * `srSummary` is required for accessibility.
 */
export function PatientServicesDonut({
  data,
  loading = false,
  metric,
  srSummary,
  locale,
  className,
}: PatientServicesDonutProps) {
  const language = useUIStore((s) => s.language)
  const resolvedLocale = locale ?? (resolveLocale(language) as StaticLocale)

  const config = useChartConfig(
    Object.fromEntries(
      data.length > 0
        ? data.map((slice, index) => [
            slice.name,
            {
              label: slice.name,
              color: slice.color ?? PALETTE[index % PALETTE.length]!,
            },
          ])
        : Object.entries({ placeholder: { label: "—", color: "var(--color-border)" } })
    )
  )

  if (loading) {
    return <StatTileSkeleton aspect="square" className={className} />
  }

  if (!data || data.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          title="No distribution data"
          description={`There is no ${metric} distribution to chart yet.`}
        />
      </div>
    )
  }

  const total = data.reduce((sum, slice) => sum + (slice.value || 0), 0)

  return (
    <div className={className}>
      <ChartContainer
        config={config}
        className="aspect-square h-(--donut-chart-height,260px) w-full"
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => {
                  const numeric =
                    typeof value === "number" ? value : Number(value)
                  const formatted = formatCurrency(numeric, resolvedLocale)
                  const percentage =
                    total > 0 ? Math.round((numeric / total) * 100) : 0
                  return `${formatted} (${percentage}%)`
                }}
              />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            stroke="var(--color-surface)"
          >
            {data.map((slice, index) => (
              <Cell
                key={slice.name}
                fill={slice.color ?? PALETTE[index % PALETTE.length]!}
              />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
        </PieChart>
      </ChartContainer>
      {srSummary ? (
        <table className="sr-only">
          <caption>{`${metric === "revenue" ? "Revenue" : "Profit"} distribution`}</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">{metric === "revenue" ? "Revenue" : "Profit"}</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {data.map((slice) => {
              const safeValue = slice.value || 0
              const percentage =
                total > 0 ? Math.round((safeValue / total) * 100) : 0
              return (
                <tr key={slice.name}>
                  <th scope="row">{slice.name}</th>
                  <td>{formatCurrency(safeValue, resolvedLocale)}</td>
                  <td>{`${percentage}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
