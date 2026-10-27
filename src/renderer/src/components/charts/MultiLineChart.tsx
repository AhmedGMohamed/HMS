"use client"

/**
 * Multi-series line chart — Phase 6.11 (Reports).
 *
 * Used by the statistics tab (patient census vs admissions, admissions vs
 * discharges with a dashed net-change series, average stay) and the payroll
 * timeline. Series are declared by the caller so labels stay in the page's
 * i18n namespace.
 */

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
import { StatTileSkeleton } from "./StatTileSkeleton"
import { useChartConfig } from "./useChartConfig"
import { seriesColor, type ChartSeries } from "./chartPalette"
import { createChartFormatter, type ChartValueFormat } from "./chartFormat"
import { CHART_DIRECTION, ChartEmpty, ChartSrTable } from "./ChartShell"
import type { StaticLocale } from "@/lib/types-extras"

export interface MultiLineChartProps<T extends Record<string, unknown>> {
  data: T[]
  /** Key holding the x category (already formatted for display). */
  xKey: string
  series: ChartSeries[]
  format: ChartValueFormat
  locale: StaticLocale
  loading?: boolean
  /** Caption for the screen-reader table. */
  srCaption: string
  /** Header for the x column in the screen-reader table. */
  xHeader: string
  emptyTitle: string
  emptyDescription?: string
  className?: string
  /** Height of the plotting area in px (default 260). */
  height?: number
}

export function MultiLineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  format,
  locale,
  loading = false,
  srCaption,
  xHeader,
  emptyTitle,
  emptyDescription,
  className,
  height = 260,
}: MultiLineChartProps<T>) {
  const formatter = useMemo(() => createChartFormatter(format, locale), [format, locale])

  const config = useChartConfig(
    Object.fromEntries(
      series.map((entry, index) => [
        entry.key,
        { label: entry.label, color: entry.color ?? seriesColor(index) },
      ])
    )
  )

  if (loading) {
    return <StatTileSkeleton aspect="video" className={className} />
  }

  if (!data || data.length === 0) {
    return (
      <ChartEmpty
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    )
  }

  return (
    <div className={className}>
      <div dir={CHART_DIRECTION}>
        <ChartContainer
          config={config}
          className="w-full"
          style={{ height }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={data}
              margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                stroke="var(--color-text-secondary)"
              />
              <YAxis
                tickFormatter={formatter.axis}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={64}
                stroke="var(--color-text-secondary)"
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value) => formatter.full(Number(value))}
                    labelFormatter={(label) => String(label)}
                  />
                }
              />
              {series.map((entry, index) => (
                <Line
                  key={entry.key}
                  dataKey={entry.key}
                  type="monotone"
                  stroke={entry.color ?? seriesColor(index)}
                  strokeWidth={2}
                  strokeDasharray={entry.dashed ? "4 4" : undefined}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
      <ChartSrTable
        caption={srCaption}
        headers={[xHeader, ...series.map((entry) => entry.label)]}
        rows={data.map((point) => [
          String(point[xKey] ?? ""),
          ...series.map((entry) => formatter.full(Number(point[entry.key]))),
        ])}
      />
    </div>
  )
}
