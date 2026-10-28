"use client"

/**
 * Clock-in charts — Phase 6.11.6.
 *
 * Two cards, both on shared wrappers so they inherit the `sr`-only data table,
 * the skeleton and the empty state (contract 49: animation is a context
 * switch, so the off-screen snapshot surface captures still frames):
 *
 *   - **hours by employee** — a horizontal `GroupedBarChart` in hours. Horizontal
 *     because employee names are long and a rotated x axis is unreadable; the
 *     server already caps the series at twelve bars (hours desc) so the card
 *     never turns into a scrollbar.
 *   - **status distribution** — a `DistributionDonutChart` in plain counts. The
 *     series includes `missing`, so the donut accounts for every day in the
 *     range rather than only the days someone showed up.
 *
 * The screen cards are localized; the snapshot components below are fixed
 * English and fixed-size, and are mounted only inside `ChartSnapshotSurface`
 * during a PDF export.
 */

import type { ReactNode } from "react"

import {
  ChartSnapshotSlot,
  DistributionDonutChart,
  GroupedBarChart,
} from "@/components/charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { StaticLocale } from "@/lib/types-extras"
import type { ClockInCharts } from "@/pages/Reports/types/clockInReport"
import {
  CLOCK_IN_SNAPSHOT_KEYS,
  CLOCK_IN_SNAPSHOT_LABELS,
  CLOCK_IN_SNAPSHOT_TITLES,
  type ClockInChartLabels,
} from "@/pages/Reports/clockIns/clockInChartSnapshot"

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface ClockInChartCardProps {
  title: string
  caption?: string
  children: ReactNode
}

/** Shared card chrome: title, one-line caption, chart body. */
export function ClockInChartCard({
  title,
  caption,
  children,
}: ClockInChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-sm font-medium text-foreground">
            {title}
          </CardTitle>
          {caption ? (
            <p className="text-xs text-muted-foreground">{caption}</p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

export interface ClockInChartProps {
  labels: ClockInChartLabels
  locale: StaticLocale
  height?: number
}

/* ------------------------------------------------------------------ */
/* Hours by employee                                                   */
/* ------------------------------------------------------------------ */

export interface HoursByEmployeeChartProps extends ClockInChartProps {
  data: ClockInCharts["hoursByEmployee"]
}

export function HoursByEmployeeChart({
  data,
  labels,
  locale,
  height = 280,
}: HoursByEmployeeChartProps) {
  return (
    <GroupedBarChart
      data={data.map((entry) => ({
        employee: entry.employeeName,
        hours: entry.hours,
      }))}
      xKey="employee"
      series={[{ key: "hours", label: labels.hours }]}
      format="hours"
      locale={locale}
      horizontal
      srCaption={labels.hours}
      xHeader={labels.employee}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      maxCategoryLabelLength={24}
      maxBarSize={40}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Status distribution                                                 */
/* ------------------------------------------------------------------ */

/**
 * Semantic slice colours, matching `AttendanceStatusBadge`.
 *
 * The donut's default palette is positional, which painted `missing` — the
 * worst outcome and usually the biggest slice — in the success green. Absences
 * must read as red, late as amber, early as informational, and a complete
 * on-time day as the only green.
 */
const STATUS_COLORS: Record<string, string> = {
  on_time: "var(--color-success)",
  late: "var(--color-warning)",
  early: "var(--color-info)",
  incomplete: "var(--color-text-tertiary)",
  missing: "var(--color-destructive)",
}

export interface StatusDistributionChartProps extends ClockInChartProps {
  data: ClockInCharts["statusDistribution"]
  /** Localized label for a status key (`on_time`, `missing`, …). */
  labelFor: (key: string) => string
}

export function StatusDistributionChart({
  data,
  labels,
  locale,
  labelFor,
  height = 280,
}: StatusDistributionChartProps) {
  return (
    <DistributionDonutChart
      data={data.map((entry) => ({
        name: labelFor(entry.status),
        value: entry.count,
        color: STATUS_COLORS[entry.status],
      }))}
      format="number"
      locale={locale}
      showPercent
      centerLabel={labels.status}
      srCaption={labels.status}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* PDF snapshot                                                        */
/* ------------------------------------------------------------------ */

const SNAPSHOT_SLOT_HEIGHT = 320
const SNAPSHOT_CHART_HEIGHT = 250

export interface ClockInSnapshotChartsProps {
  /** Any payload carrying the two series (list or export envelope). */
  payload: ClockInCharts | { charts: ClockInCharts }
}

/**
 * The two charts as English, fixed-size slots for one `html-to-image` pass.
 *
 * Every slot is a fixed-height box so the charts cannot collapse inside the
 * off-screen surface (a `height: 100%` slot inside an auto-height parent
 * measures as 0 and captures blank).
 */
export function ClockInSnapshotCharts({ payload }: ClockInSnapshotChartsProps) {
  const charts: ClockInCharts = "charts" in payload ? payload.charts : payload
  const labels = CLOCK_IN_SNAPSHOT_LABELS
  const locale = "en-US" as StaticLocale

  return (
    <>
      <div style={{ height: SNAPSHOT_SLOT_HEIGHT }}>
        <ChartSnapshotSlot name={CLOCK_IN_SNAPSHOT_KEYS.hours}>
          <ClockInChartCard title={CLOCK_IN_SNAPSHOT_TITLES.hours}>
            <HoursByEmployeeChart
              data={charts.hoursByEmployee}
              labels={labels}
              locale={locale}
              height={SNAPSHOT_CHART_HEIGHT}
            />
          </ClockInChartCard>
        </ChartSnapshotSlot>
      </div>

      <div style={{ height: SNAPSHOT_SLOT_HEIGHT }}>
        <ChartSnapshotSlot name={CLOCK_IN_SNAPSHOT_KEYS.status}>
          <ClockInChartCard title={CLOCK_IN_SNAPSHOT_TITLES.status}>
            <StatusDistributionChart
              data={charts.statusDistribution}
              labels={labels}
              locale={locale}
              labelFor={(key) => key.replace(/_/g, " ").toUpperCase()}
              height={SNAPSHOT_CHART_HEIGHT}
            />
          </ClockInChartCard>
        </ChartSnapshotSlot>
      </div>
    </>
  )
}
