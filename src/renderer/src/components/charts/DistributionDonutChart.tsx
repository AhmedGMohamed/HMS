"use client"

/**
 * Distribution donut — Phase 6.11 (Reports).
 *
 * Generalizes `PatientServicesDonut` (Dashboard) so the Reports page can plot
 * payment-type / gender / attendance-status distributions with its own
 * formatter (counts vs currency), percentage labels and empty state. The
 * Dashboard wrapper stays a thin call site to avoid churn there.
 *
 * Slices come from the API in a stable order, and colours are assigned by
 * index from `CHART_PALETTE` — never by identity — so a donut with a single
 * slice still matches its legend swatch.
 */

import { useMemo } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { StatTileSkeleton } from "./StatTileSkeleton"
import { useChartConfig } from "./useChartConfig"
import { seriesColor } from "./chartPalette"
import { createChartFormatter, type ChartValueFormat } from "./chartFormat"
import { CHART_DIRECTION, ChartEmpty, ChartSrTable } from "./ChartShell"
import type { StaticLocale } from "@/lib/types-extras"

export interface DistributionSlice {
  /** Legend label (already localized). */
  name: string
  value: number
  /** Optional override colour. */
  color?: string
}

export interface DistributionDonutChartProps {
  data: DistributionSlice[]
  format: ChartValueFormat
  locale: StaticLocale
  /** Caption/centre label for the donut hole (e.g. "Patients"). */
  centerLabel?: string
  /** Show `12 (34%)` in the tooltip instead of the bare value. */
  showPercent?: boolean
  loading?: boolean
  srCaption: string
  emptyTitle: string
  emptyDescription?: string
  className?: string
  height?: number
}

export function DistributionDonutChart({
  data,
  format,
  locale,
  centerLabel,
  showPercent = false,
  loading = false,
  srCaption,
  emptyTitle,
  emptyDescription,
  className,
  height = 280,
}: DistributionDonutChartProps) {
  const formatter = useMemo(() => createChartFormatter(format, locale), [format, locale])

  const total = useMemo(
    () => data.reduce((sum, slice) => sum + (Number(slice.value) || 0), 0),
    [data]
  )

  const config = useChartConfig(
    Object.fromEntries(
      data.map((slice, index) => [
        slice.name,
        { label: slice.name, color: slice.color ?? seriesColor(index) },
      ])
    )
  )

  if (loading) {
    return <StatTileSkeleton aspect="square" className={className} />
  }

  if (!data || data.length === 0 || total === 0) {
    return (
      <ChartEmpty
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    )
  }

  const share = (value: number): string =>
    total > 0 ? `${Math.round((value / total) * 100)}%` : "0%"

  return (
    <div className={className}>
      <div dir={CHART_DIRECTION}>
        <ChartContainer config={config} className="mx-auto w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    nameKey="name"
                    formatter={(value) => {
                      const numeric = Number(value)
                      return showPercent
                        ? `${formatter.full(numeric)} (${share(numeric)})`
                        : formatter.full(numeric)
                    }}
                    labelFormatter={(label) => String(label ?? "")}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="82%"
                strokeWidth={2}
                stroke="var(--color-surface)"
                paddingAngle={2}
              >
                {data.map((slice, index) => (
                  <Cell
                    key={`${slice.name}-${index}`}
                    fill={slice.color ?? seriesColor(index)}
                  />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
        {centerLabel ? (
          <p className="mt-1 text-center text-xs text-muted-foreground">{centerLabel}</p>
        ) : null}
      </div>
      <ChartSrTable
        caption={srCaption}
        headers={[srCaption, "Value", "Share"]}
        rows={data.map((slice) => [
          slice.name,
          formatter.full(Number(slice.value)),
          share(Number(slice.value)),
        ])}
      />
    </div>
  )
}
