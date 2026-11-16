"use client"

/**
 * Dual-axis composed chart (bars + line) — Phase 6.11 (Reports).
 *
 * The statistics "staff utilization" card plots head-counts on the left axis
 * and hours on the right. Two separate value formats are therefore required —
 * the legacy chart shared one axis and its tooltip read `data[datasetIndex]`
 * instead of `data[dataIndex]`, so values were attributed to the wrong series.
 */

import { useMemo } from "react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

export interface DualAxisComposedChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: string
  /** Bars, plotted against the left axis. */
  leftSeries: ChartSeries[]
  /** Line, plotted against the right axis. */
  rightSeries: ChartSeries
  leftFormat: ChartValueFormat
  rightFormat: ChartValueFormat
  locale: StaticLocale
  loading?: boolean
  srCaption: string
  xHeader: string
  emptyTitle: string
  emptyDescription?: string
  className?: string
  height?: number
}

export function DualAxisComposedChart<T extends Record<string, unknown>>({
  data,
  xKey,
  leftSeries,
  rightSeries,
  leftFormat,
  rightFormat,
  locale,
  loading = false,
  srCaption,
  xHeader,
  emptyTitle,
  emptyDescription,
  className,
  height = 280,
}: DualAxisComposedChartProps<T>) {
  const left = useMemo(() => createChartFormatter(leftFormat, locale), [leftFormat, locale])
  const right = useMemo(
    () => createChartFormatter(rightFormat, locale),
    [rightFormat, locale]
  )

  const series = [...leftSeries, rightSeries]

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

  return (
    <div className={className}>
      <div dir={CHART_DIRECTION}>
        <ChartContainer config={config} className="w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              accessibilityLayer
              data={data}
              margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
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
                yAxisId="left"
                tickFormatter={left.axis}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={56}
                stroke="var(--color-text-secondary)"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={right.axis}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={56}
                stroke="var(--color-text-secondary)"
              />
              <ChartTooltip
                cursor={{ fill: "var(--color-surface-muted)" }}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(value, name) => {
                      const label = String(name)
                      const isRight = label === rightSeries.label
                      return (isRight ? right : left).full(Number(value))
                    }}
                    labelFormatter={(label) => String(label)}
                  />
                }
              />
              {leftSeries.map((entry, index) => (
                <Bar
                  key={entry.key}
                  yAxisId="left"
                  dataKey={entry.key}
                  fill={entry.color ?? seriesColor(index)}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={animate}
                />
              ))}
              <Line
                yAxisId="right"
                dataKey={rightSeries.key}
                type="monotone"
                stroke={rightSeries.color ?? seriesColor(series.length - 1)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={animate}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
      <ChartSrTable
        caption={srCaption}
        headers={[xHeader, ...series.map((entry) => entry.label)]}
        rows={data.map((point) => [
          String(point[xKey] ?? ""),
          ...leftSeries.map((entry) => left.full(Number(point[entry.key]))),
          right.full(Number(point[rightSeries.key])),
        ])}
      />
    </div>
  )
}
