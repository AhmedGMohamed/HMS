"use client"

/**
 * Payroll charts — Phase 6.11.5.
 *
 * Two cards, both on shared wrappers so they inherit the `sr`-only data table,
 * the skeleton and the empty state (contract 49: animation is a context
 * switch, so the off-screen snapshot surface captures still frames):
 *
 *   - **timeline** — gross pay per bucket (`MultiLineChart`, currency),
 *   - **type distribution** — gross pay per payment type (`DistributionDonutChart`).
 *
 * Both series are **gross** (`base + extra`): deductions are a per-employee
 * period total, so spreading them across buckets would be an invented
 * attribution (plan D15).
 *
 * The screen cards are localized; the snapshot components below are fixed
 * English and fixed-size, and are mounted only inside `ChartSnapshotSurface`
 * during a PDF export.
 */

import type { ReactNode } from "react"

import {
  ChartSnapshotSlot,
  DistributionDonutChart,
  MultiLineChart,
} from "@/components/charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { StaticLocale } from "@/lib/types-extras"
import type { EmployeePaymentCharts } from "@/pages/Reports/types/employeePaymentReport"
import {
  PAYROLL_SNAPSHOT_KEYS,
  PAYROLL_SNAPSHOT_LABELS,
  PAYROLL_SNAPSHOT_TITLES,
  type PayrollChartLabels,
} from "@/pages/Reports/employeePayments/payrollChartSnapshot"

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface PayrollChartCardProps {
  title: string
  caption?: string
  children: ReactNode
}

/** Shared card chrome: title, one-line caption, chart body. */
export function PayrollChartCard({
  title,
  caption,
  children,
}: PayrollChartCardProps) {
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

export interface PayrollChartProps {
  labels: PayrollChartLabels
  locale: StaticLocale
  height?: number
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export interface PaymentTimelineChartProps extends PayrollChartProps {
  data: EmployeePaymentCharts["timeline"]
}

export function PaymentTimelineChart({
  data,
  labels,
  locale,
  height = 260,
}: PaymentTimelineChartProps) {
  return (
    <MultiLineChart
      data={data.map((point) => ({
        period: point.period,
        total: point.total,
      }))}
      xKey="period"
      series={[{ key: "total", label: labels.grossPay }]}
      format="currency"
      locale={locale}
      srCaption={labels.grossPay}
      xHeader={labels.period}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Type distribution                                                   */
/* ------------------------------------------------------------------ */

export interface PaymentTypeChartProps extends PayrollChartProps {
  data: EmployeePaymentCharts["byType"]
  /** Localized label for a payment-type key (`salary`, `bonus`, …). */
  labelFor: (key: string) => string
}

export function PaymentTypeChart({
  data,
  labels,
  locale,
  labelFor,
  height = 260,
}: PaymentTypeChartProps) {
  return (
    <DistributionDonutChart
      data={data.map((entry) => ({
        name: labelFor(entry.paymentType),
        value: entry.total,
      }))}
      format="currency"
      locale={locale}
      showPercent
      centerLabel={labels.grossPay}
      srCaption={labels.paymentType}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      height={height}
    />
  )
}

/* ------------------------------------------------------------------ */
/* PDF snapshot                                                        */
/* ------------------------------------------------------------------ */

const SNAPSHOT_SLOT_HEIGHT = 300
const SNAPSHOT_CHART_HEIGHT = 230

export interface PayrollSnapshotChartsProps {
  /** Any payload carrying the two series (list or export envelope). */
  payload: EmployeePaymentCharts | { charts: EmployeePaymentCharts }
}

/**
 * The two charts as English, fixed-size slots for one `html-to-image` pass.
 *
 * Every slot is a fixed-height box so the charts cannot collapse inside the
 * off-screen surface (a `height: 100%` slot inside an auto-height parent
 * measures as 0 and captures blank).
 */
export function PayrollSnapshotCharts({ payload }: PayrollSnapshotChartsProps) {
  const charts: EmployeePaymentCharts =
    "charts" in payload ? payload.charts : payload
  const labels = PAYROLL_SNAPSHOT_LABELS
  const locale = "en-US" as StaticLocale

  return (
    <>
      <div style={{ height: SNAPSHOT_SLOT_HEIGHT }}>
        <ChartSnapshotSlot name={PAYROLL_SNAPSHOT_KEYS.timeline}>
          <PayrollChartCard title={PAYROLL_SNAPSHOT_TITLES.timeline}>
            <PaymentTimelineChart
              data={charts.timeline}
              labels={labels}
              locale={locale}
              height={SNAPSHOT_CHART_HEIGHT}
            />
          </PayrollChartCard>
        </ChartSnapshotSlot>
      </div>

      <div style={{ height: SNAPSHOT_SLOT_HEIGHT }}>
        <ChartSnapshotSlot name={PAYROLL_SNAPSHOT_KEYS.typeDistribution}>
          <PayrollChartCard title={PAYROLL_SNAPSHOT_TITLES.typeDistribution}>
            <PaymentTypeChart
              data={charts.byType}
              labels={labels}
              locale={locale}
              labelFor={(key) => key.replace(/_/g, " ").toUpperCase()}
              height={SNAPSHOT_CHART_HEIGHT}
            />
          </PayrollChartCard>
        </ChartSnapshotSlot>
      </div>
    </>
  )
}
