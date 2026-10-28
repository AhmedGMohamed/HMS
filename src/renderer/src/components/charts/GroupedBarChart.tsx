"use client"

/**
 * Grouped / stacked bar chart, vertical or horizontal — Phase 6.11 (Reports).
 *
 * Used by the statistics tab (revenue trends grouped by period, top services
 * and top drugs as horizontal bars), the doctor/nurse distribution charts and
 * the clock-in hours-per-employee chart.
 *
 * Recharts semantics: `layout="vertical"` means the *bars* run horizontally
 * (categories on the y axis), so this wrapper exposes the intent as
 * `horizontal` instead of leaking that inversion to callers.
 */

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { useChartAnimation } from "./chartAnimation"
import { seriesColor, type ChartSeries } from "./chartPalette"
import { createChartFormatter, type ChartValueFormat } from "./chartFormat"
import { CHART_DIRECTION, ChartEmpty, ChartSrTable } from "./ChartShell"
import type { StaticLocale } from "@/lib/types-extras"

export interface GroupedBarChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: string
  series: ChartSeries[]
  format: ChartValueFormat
  locale: StaticLocale
  /** Horizontal bars (categories on the y axis). Default false. */
  horizontal?: boolean
  /** Stack the series instead of grouping them side by side. */
  stacked?: boolean
  loading?: boolean
  srCaption: string
  xHeader: string
  emptyTitle: string
  emptyDescription?: string
  className?: string
  height?: number
  /** Truncate long category labels on the axis. */
  maxCategoryLabelLength?: number
  /**
   * Cap on a bar's thickness, in px. A horizontal chart with one or two
   * categories otherwise stretches each bar across the whole plot, which reads
   * as a filled block rather than a value.
   */
  maxBarSize?: number
}

export function GroupedBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  format,
  locale,
  horizontal = false,
  stacked = false,
  loading = false,
  srCaption,
  xHeader,
  emptyTitle,
  emptyDescription,
  className,
  height,
  maxCategoryLabelLength = 22,
  maxBarSize,
}: GroupedBarChartProps<T>) {
  const formatter = useMemo(() => createChartFormatter(format, locale), [format, locale])

  const animate = useChartAnimation()
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

  const truncate = (value: unknown): string => {
    const text = String(value ?? "")
    return text.length > maxCategoryLabelLength
      ? `${text.slice(0, maxCategoryLabelLength - 1)}…`
      : text
  }

  // Horizontal bars need room for category labels on the left.
  const categoryWidth = horizontal ? 120 : undefined
  const chartHeight = height ?? (horizontal ? Math.max(220, data.length * 28 + 60) : 280)

  return (
    <div className={className}>
      <div dir={CHART_DIRECTION}>
        <ChartContainer config={config} className="w-full" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={data}
              layout={horizontal ? "vertical" : "horizontal"}
              margin={{ top: 8, right: 12, left: horizontal ? 4 : 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={horizontal ? true : false}
                horizontal={horizontal ? false : true}
                stroke="var(--color-border)"
              />
              {horizontal ? (
                <>
                  <XAxis
                    type="number"
                    tickFormatter={formatter.axis}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    stroke="var(--color-text-secondary)"
                  />
                  <YAxis
                    type="category"
                    dataKey={xKey}
                    tickLine={false}
                    axisLine={false}
                    width={categoryWidth}
                    tickMargin={6}
                    tickFormatter={truncate}
                    stroke="var(--color-text-secondary)"
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey={xKey}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={truncate}
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
                </>
              )}
              <ChartTooltip
                cursor={{ fill: "var(--color-surface-muted)" }}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(value) => formatter.full(Number(value))}
                    labelFormatter={(label) => String(label)}
                  />
                }
              />
              {series.map((entry, index) => (
                <Bar
                  key={entry.key}
                  dataKey={entry.key}
                  fill={entry.color ?? seriesColor(index)}
                  stackId={stacked ? "stack" : undefined}
                  radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  maxBarSize={maxBarSize}
                  isAnimationActive={animate}
                />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
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
