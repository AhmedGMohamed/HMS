"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { StaticLocale } from "@/lib/types-extras"
import { EmptyState } from "@/components/common/EmptyState"
import { StatTileSkeleton } from "./StatTileSkeleton"
import { useChartConfig } from "./useChartConfig"

export interface RevenueLineChartPoint {
  /** ISO date string or any sortable label; rendered as X axis tick. */
  date: string
  revenue: number
  profit: number
}

export interface RevenueLineChartProps {
  data: RevenueLineChartPoint[]
  loading?: boolean
  /** Required: rendering skipped silently in prod when missing. */
  srSummary?: string
  /** Locale override; defaults to `uiStore.language`. */
  locale?: StaticLocale
  /** Approximate head height. The container is `aspect-video` by default. */
  className?: string
}

/**
 * Revenue + Profit line chart for the Admin Dashboard (design.md §7.4).
 *
 * Built on shadcn `<ChartContainer>` + Recharts `<LineChart>`. The chart
 * pulls currency symbols from `formatCurrency`, locale-resolved via
 * `uiStore.language`. Empty data renders `<EmptyState>` rather than an
 * empty axis frame (design.md §6.8).
 *
 * `srSummary` — required for accessibility — is rendered into an
 * `sr-only` table directly under the chart so screen-reader users get a
 * tabular equivalent.
 */
export function RevenueLineChart({
  data,
  loading = false,
  srSummary,
  locale,
  className,
}: RevenueLineChartProps) {
  const language = useUIStore((s) => s.language)
  const resolvedLocale = locale ?? (resolveLocale(language) as StaticLocale)

  const config = useChartConfig({
    revenue: { label: "Revenue", color: "var(--color-primary)" },
    profit: { label: "Profit", color: "var(--color-success)" },
  })

  const formattedTickValue = useMemo(
    () => (value: number) => formatCurrency(value, resolvedLocale),
    [resolvedLocale]
  )

  if (loading) {
    return <StatTileSkeleton aspect="video" className={className} />
  }

  if (!data || data.length === 0) {
    return (
      <div className={className}>
        <EmptyState title="No revenue data" description="There are no revenue points to chart for the selected period." />
      </div>
    )
  }

  return (
    <div className={className}>
      <ChartContainer
        config={config}
        className="aspect-video h-(--revenue-chart-height,260px) w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--color-text-secondary)"
            />
            <YAxis
              tickFormatter={formattedTickValue}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={70}
              stroke="var(--color-text-secondary)"
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  formatter={(value) => {
                    const numeric =
                      typeof value === "number" ? value : Number(value)
                    return formattedTickValue(numeric)
                  }}
                  labelFormatter={(label) => String(label)}
                />
              }
            />
            <Line
              dataKey="revenue"
              type="monotone"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              dataKey="profit"
              type="monotone"
              stroke="var(--color-success)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
      {srSummary ? (
        <table className="sr-only">
          <caption>Revenue & Profit summary</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Revenue</th>
              <th scope="col">Profit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.date}>
                <th scope="row">{point.date}</th>
                <td>{formatCurrency(point.revenue, resolvedLocale)}</td>
                <td>{formatCurrency(point.profit, resolvedLocale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
