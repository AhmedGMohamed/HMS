"use client"

/**
 * Statistics charts — Phase 6.11.4.
 *
 * One module, eight chart components, because the eight cards share the same
 * three decisions and splitting them would only duplicate the plumbing:
 *
 *   - **wrapper**: `MultiLineChart` (flows), `GroupedBarChart` (period bars and
 *     the two top-N lists), `DualAxisComposedChart` (staff utilisation) and
 *     `DistributionDonutChart` (the toggle). No chart is hand-rolled, so every
 *     one gets an `sr`-only data table, a skeleton and an empty state.
 *   - **labels**: every string arrives through `StatisticsChartLabels`, filled
 *     from `reports.statistics.*` on screen and from `EN_LABELS` in the PDF
 *     snapshot. Nothing is hardcoded English in the UI.
 *   - **data shape**: rows are mapped to plain objects before they reach the
 *     wrappers, whose generics are constrained to `Record<string, unknown>` —
 *     the wire interfaces have no index signature.
 *
 * Charts render `dir="ltr"` internally (`CHART_DIRECTION`), so an Arabic page
 * keeps its axes LTR while the labels stay localized (plan §4.10).
 */

import type { ReactNode } from "react"

import { GroupedBarChart, MultiLineChart } from "@/components/charts"
import { ChartSnapshotSlot } from "@/components/charts"
import { DualAxisComposedChart } from "@/components/charts"
import { DistributionDonutChart } from "@/components/charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { StaticLocale } from "@/lib/types-extras"
import type {
  AdmissionDischargePoint,
  AverageStayPoint,
  PatientCensusPoint,
  RevenueTrendPoint,
  StaffUtilizationRow,
  StatisticsDistributionEntry,
  StatisticsReportPayload,
  TopDrugRow,
  TopServiceRow,
} from "@/pages/Reports/types/statisticsReport"
import type { StatisticsChartLabels } from "@/pages/Reports/statistics/statisticsChartSnapshot"
import {
  EN_LABELS,
  STATISTICS_SNAPSHOT_KEYS,
} from "@/pages/Reports/statistics/statisticsChartSnapshot"

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface StatisticsChartCardProps {
  title: string
  caption?: string
  /** Extra control rendered next to the title (the donut's toggle). */
  action?: ReactNode
  children: ReactNode
}

/** Shared card chrome: title, one-line caption, chart body. */
export function StatisticsChartCard({
  title,
  caption,
  action,
  children,
}: StatisticsChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-sm font-medium text-foreground">
              {title}
            </CardTitle>
            {caption ? (
              <p className="text-xs text-muted-foreground">{caption}</p>
            ) : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

export interface StatisticsChartProps {
  labels: StatisticsChartLabels
  locale: StaticLocale
  height?: number
}

/* ------------------------------------------------------------------ */
/* Census + admissions                                                 */
/* ------------------------------------------------------------------ */

export interface CensusChartProps extends StatisticsChartProps {
  data: PatientCensusPoint[]
}

/**
 * Census **and** admissions, as two lines.
 *
 * The legacy chart plotted admissions and called it "Patient Admission Trends";
 * showing both is what makes the difference visible (a full ward with no new
 * admissions is a flat census line and a flat admissions line, not one line
 * that looks like a wave).
 */
export function CensusChart({ data, labels, locale, height = 280 }: CensusChartProps) {
  return (
    <MultiLineChart
      data={data.map((point) => ({
        period: point.period,
        census: point.census,
        admissions: point.admissions,
      }))}
      xKey="period"
      series={[
        { key: "census", label: labels.census },
        { key: "admissions", label: labels.admissions },
      ]}
      format="number"
      locale={locale}
      srCaption={`${labels.census} / ${labels.admissions}`}
      xHeader={labels.period}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Distribution                                                        */
/* ------------------------------------------------------------------ */

export interface DistributionChartProps {
  payment: StatisticsDistributionEntry[]
  gender: StatisticsDistributionEntry[]
  /** Which split to draw. */
  mode: "payment" | "gender"
  /** Localized label for a slice key (`cash`, `male`, …). */
  labelFor: (key: string) => string
  labels: StatisticsChartLabels
  locale: StaticLocale
  height?: number
}

/**
 * Both splits come from the same payload, so switching `mode` re-renders and
 * never refetches (see `useStatisticsReport`).
 */
export function DistributionChart({
  payment,
  gender,
  mode,
  labelFor,
  labels,
  locale,
  height = 280,
}: DistributionChartProps) {
  const entries = mode === "gender" ? gender : payment
  const slices = entries.map((entry) => ({
    name: labelFor(entry.key),
    value: entry.count,
  }))

  return (
    <DistributionDonutChart
      data={slices}
      format="number"
      locale={locale}
      showPercent
      centerLabel={labels.patients}
      srCaption={labels.patients}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Average stay                                                        */
/* ------------------------------------------------------------------ */

export interface AverageStayChartProps extends StatisticsChartProps {
  data: AverageStayPoint[]
}

/**
 * A bar rather than a line: each bar is the average of the stays discharged in
 * that bucket, and a line would imply interpolation between unrelated cohorts.
 */
export function AverageStayChart({
  data,
  labels,
  locale,
  height = 260,
}: AverageStayChartProps) {
  return (
    <GroupedBarChart
      data={data.map((point) => ({
        period: point.period,
        avgStayDays: point.avgStayDays,
        discharges: point.discharges,
      }))}
      xKey="period"
      series={[{ key: "avgStayDays", label: labels.avgStay }]}
      format="days"
      locale={locale}
      srCaption={labels.avgStay}
      xHeader={labels.period}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Revenue                                                             */
/* ------------------------------------------------------------------ */

export interface RevenueChartProps extends StatisticsChartProps {
  data: RevenueTrendPoint[]
}

/** Billed / collected / outstanding, grouped per bucket. Currency only. */
export function RevenueChart({
  data,
  labels,
  locale,
  height = 280,
}: RevenueChartProps) {
  return (
    <GroupedBarChart
      data={data.map((point) => ({
        period: point.period,
        billed: point.billed,
        collected: point.collected,
        outstanding: point.outstanding,
      }))}
      xKey="period"
      series={[
        { key: "billed", label: labels.billed },
        { key: "collected", label: labels.collected },
        { key: "outstanding", label: labels.outstanding },
      ]}
      format="currency"
      locale={locale}
      srCaption={`${labels.billed} / ${labels.collected} / ${labels.outstanding}`}
      xHeader={labels.period}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Admissions vs discharges                                            */
/* ------------------------------------------------------------------ */

export interface FlowChartProps extends StatisticsChartProps {
  data: AdmissionDischargePoint[]
}

/** Two lines plus a dashed net change, so the gap is readable at a glance. */
export function FlowChart({ data, labels, locale, height = 280 }: FlowChartProps) {
  return (
    <MultiLineChart
      data={data.map((point) => ({
        period: point.period,
        admissions: point.admissions,
        discharges: point.discharges,
        netChange: point.netChange,
      }))}
      xKey="period"
      series={[
        { key: "admissions", label: labels.admissions },
        { key: "discharges", label: labels.discharges },
        { key: "netChange", label: labels.netChange, dashed: true },
      ]}
      format="number"
      locale={locale}
      srCaption={`${labels.admissions} / ${labels.discharges}`}
      xHeader={labels.period}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Top N                                                               */
/* ------------------------------------------------------------------ */

export interface TopServicesChartProps extends StatisticsChartProps {
  data: TopServiceRow[]
}

export function TopServicesChart({
  data,
  labels,
  locale,
  height,
}: TopServicesChartProps) {
  return (
    <GroupedBarChart
      data={data.map((row) => ({
        name: row.serviceName,
        revenue: row.totalRevenue,
      }))}
      xKey="name"
      series={[{ key: "revenue", label: labels.revenue }]}
      format="currency"
      locale={locale}
      horizontal
      srCaption={labels.revenue}
      xHeader={labels.service}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height ?? Math.max(240, data.length * 30 + 60)}
      maxCategoryLabelLength={30}
    />
  )
}

export interface TopDrugsChartProps extends StatisticsChartProps {
  data: TopDrugRow[]
}

export function TopDrugsChart({ data, labels, locale, height }: TopDrugsChartProps) {
  return (
    <GroupedBarChart
      data={data.map((row) => ({
        name: row.drugName,
        revenue: row.totalRevenue,
      }))}
      xKey="name"
      series={[{ key: "revenue", label: labels.revenue }]}
      format="currency"
      locale={locale}
      horizontal
      srCaption={labels.revenue}
      xHeader={labels.drug}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height ?? Math.max(240, data.length * 30 + 60)}
      maxCategoryLabelLength={30}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Staff utilisation                                                   */
/* ------------------------------------------------------------------ */

export interface StaffChartProps extends StatisticsChartProps {
  data: StaffUtilizationRow[]
}

/**
 * Dual axis: head-counts as bars (left, `number`) and hours as a line (right,
 * `hours`). Two formats is the whole point — the legacy chart shared one axis
 * and mis-attributed its tooltip values.
 */
export function StaffChart({ data, labels, locale, height = 280 }: StaffChartProps) {
  return (
    <DualAxisComposedChart
      data={data.map((row) => ({
        employeeType: row.employeeType,
        staffCount: row.staffCount,
        patientsServed: row.patientsServed,
        totalHoursWorked: row.totalHoursWorked,
      }))}
      xKey="employeeType"
      leftSeries={[
        { key: "staffCount", label: labels.staff },
        { key: "patientsServed", label: labels.patients },
      ]}
      rightSeries={{ key: "totalHoursWorked", label: labels.hours }}
      leftFormat="number"
      rightFormat="hours"
      locale={locale}
      srCaption={`${labels.staff} / ${labels.hours}`}
      xHeader={labels.employeeType}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* PDF snapshot                                                        */
/* ------------------------------------------------------------------ */

/** Fixed width/height of one slot inside the capture surface. */
const SNAPSHOT_SLOT_HEIGHT = 300
const SNAPSHOT_CHART_HEIGHT = 230

const SNAPSHOT_TITLES = {
  census: "Patient Census & Admissions",
  distribution: "Patient Distribution",
  averageStay: "Average Stay Duration",
  revenue: "Revenue Trends",
  flow: "Admissions vs Discharges",
  topServices: "Top 10 Services by Revenue",
  topDrugs: "Top 10 Drugs by Revenue",
  staff: "Staff Utilization",
} as const

export interface StatisticsSnapshotChartsProps {
  payload: StatisticsReportPayload
}

/**
 * The eight charts as English, fixed-size slots for one `html-to-image` pass.
 *
 * Every slot is a fixed-height box so the charts cannot collapse inside the
 * off-screen surface (a `height: 100%` slot inside an auto-height parent
 * measures as 0 and captures blank). `captureChartSnapshots` walks the slots by
 * name, so this component only has to mount them.
 */
export function StatisticsSnapshotCharts({
  payload,
}: StatisticsSnapshotChartsProps) {
  const labels = EN_LABELS
  const locale = "en-US" as StaticLocale

  const slot = (
    key: string,
    title: string,
    caption: string,
    chart: ReactNode
  ) => (
    <div key={key} style={{ height: SNAPSHOT_SLOT_HEIGHT }}>
      <ChartSnapshotSlot name={key}>
        <StatisticsChartCard title={title} caption={caption}>
          {chart}
        </StatisticsChartCard>
      </ChartSnapshotSlot>
    </div>
  )

  return (
    <>
      {slot(
        STATISTICS_SNAPSHOT_KEYS.census,
        SNAPSHOT_TITLES.census,
        labels.period,
        <CensusChart
          data={payload.patientCensus}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
      {slot(
        STATISTICS_SNAPSHOT_KEYS.distribution,
        SNAPSHOT_TITLES.distribution,
        labels.patients,
        <DistributionChart
          payment={payload.distribution.paymentType}
          gender={payload.distribution.gender}
          mode="payment"
          labelFor={(key) => key.toUpperCase()}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
      {slot(
        STATISTICS_SNAPSHOT_KEYS.averageStay,
        SNAPSHOT_TITLES.averageStay,
        labels.avgStay,
        <AverageStayChart
          data={payload.averageStay}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
      {slot(
        STATISTICS_SNAPSHOT_KEYS.revenue,
        SNAPSHOT_TITLES.revenue,
        labels.revenue,
        <RevenueChart
          data={payload.revenueTrends}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
      {slot(
        STATISTICS_SNAPSHOT_KEYS.flow,
        SNAPSHOT_TITLES.flow,
        labels.netChange,
        <FlowChart
          data={payload.admissionDischarge}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
      {slot(
        STATISTICS_SNAPSHOT_KEYS.topServices,
        SNAPSHOT_TITLES.topServices,
        labels.revenue,
        <TopServicesChart
          data={payload.topServices}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
      {slot(
        STATISTICS_SNAPSHOT_KEYS.topDrugs,
        SNAPSHOT_TITLES.topDrugs,
        labels.revenue,
        <TopDrugsChart
          data={payload.topDrugs}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
      {slot(
        STATISTICS_SNAPSHOT_KEYS.staff,
        SNAPSHOT_TITLES.staff,
        labels.hours,
        <StaffChart
          data={payload.staffUtilization}
          labels={labels}
          locale={locale}
          height={SNAPSHOT_CHART_HEIGHT}
        />
      )}
    </>
  )
}
