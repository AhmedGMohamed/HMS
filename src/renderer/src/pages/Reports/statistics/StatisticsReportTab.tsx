"use client"

/**
 * Statistics tab — Phase 6.11.4.
 *
 * One report, eight charts, no paging: the whole range is a single document, so
 * this tab has none of the detail-dialog machinery the patient/doctor/nurse
 * tabs needed.
 *
 * ## What replaced the legacy page
 *
 *   - **no occupancy card** — it was hardcoded to `-%`; without a beds table
 *     the metric cannot be computed, so it is gone rather than faked (§2.8);
 *   - **census and admissions are two series**, not one mislabelled line;
 *   - **revenue KPIs are billed *and* collected *and* outstanding**;
 *   - **the distribution toggle is view state** — both splits arrive in the
 *     same payload, so switching it never refetches and never marks the report
 *     stale (`reportParamsKey` ignores `dist`);
 *   - **every chart has an `sr` data table** via the shared wrappers, and the
 *     PDF prints the numbers under each bitmap.
 *
 * ## Exports
 *
 * The PDF is built from the **export** payload (same seven queries as the
 * screen) and mounts the eight English, fixed-size charts off-screen for one
 * `html-to-image` pass. A failed capture only drops that bitmap; the table
 * underneath it still prints.
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  ChartSnapshotSurface,
} from "@/components/charts"
import type { StaticLocale } from "@/lib/types-extras"
import { captureChartSnapshots, waitForSnapshotRoot } from "@/lib/chartSnapshot"
import { cn, formatDate, formatNumber } from "@/lib/utils"
import { exportStatistics } from "@/pages/Reports/api"
import { DateRangeField } from "@/pages/Reports/components/DateRangeField"
import { GroupByField } from "@/pages/Reports/components/GroupByField"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { ReportShell } from "@/pages/Reports/components/ReportShell"
import { ReportState } from "@/pages/Reports/components/ReportState"
import { exportStatisticsReportCsv } from "@/pages/Reports/export/csv/exportStatisticsReportCsv"
import { buildStatisticsReportPdf } from "@/pages/Reports/export/pdf/buildStatisticsReportPdf"
import { useStatisticsReport } from "@/pages/Reports/hooks/useStatisticsReport"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import {
  AverageStayChart,
  CensusChart,
  DistributionChart,
  FlowChart,
  RevenueChart,
  StaffChart,
  StatisticsChartCard,
  StatisticsSnapshotCharts,
  TopDrugsChart,
  TopServicesChart,
} from "@/pages/Reports/statistics/StatisticsCharts"
import type { StatisticsChartLabels } from "@/pages/Reports/statistics/statisticsChartSnapshot"
import type {
  StatisticsDistributionMode,
  StatisticsQueryFilters,
  StatisticsReportPayload,
} from "@/pages/Reports/types/statisticsReport"
import type {
  ReportDraft,
  ReportGrouping,
} from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface StatisticsReportTabProps {
  title: string
  description: string
  draft: ReportDraft
  onDraftChange: (patch: Partial<ReportDraft>) => void
  /** View-only toggle: keeps `run=1` and does not invalidate the result. */
  onDistributionChange: (mode: StatisticsDistributionMode) => void
  generated: ReportDraft | null
  isGenerated: boolean
  isStale: boolean
  onGenerate: () => void
  validationError: string | null
  session: ReportSessionResult
  canExport: boolean
}

/** Chart height on screen; the PDF snapshot uses its own fixed height. */
const CHART_HEIGHT = 260

export function StatisticsReportTab({
  title,
  description,
  draft,
  onDraftChange,
  onDistributionChange,
  generated,
  isGenerated,
  isStale,
  onGenerate,
  validationError,
  session,
  canExport,
}: StatisticsReportTabProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = (language === "ar" ? "ar-EG" : "en-US") as StaticLocale

  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null)
  const [snapshotPayload, setSnapshotPayload] =
    useState<StatisticsReportPayload | null>(null)

  const filters: StatisticsQueryFilters | null = generated
    ? { range: generated.range, grouping: generated.grouping }
    : null

  const query = useStatisticsReport({
    filters,
    session,
    enabled: isGenerated,
  })

  const payload = query.payload

  /**
   * The donut split comes from the generated snapshot (falling back to the
   * draft), so a reload restores the same choice and an unsaved form edit does
   * not repaint the chart behind the report's back.
   */
  const distributionMode: StatisticsDistributionMode =
    (generated ?? draft).distribution

  /* ---------------------------------------------------------------- */
  /* Labels                                                            */
  /* ---------------------------------------------------------------- */

  /** The grouping the visible report was generated with, not the form's. */
  const grouping: ReportGrouping = (generated ?? draft).grouping

  const groupingLabel = t(`reports.filters.groupByOptions.${grouping}`)
  const captionVars = { grouping: groupingLabel }

  const labels: StatisticsChartLabels = {
    census: t("reports.statistics.series.census"),
    admissions: t("reports.statistics.series.admissions"),
    discharges: t("reports.statistics.series.discharges"),
    netChange: t("reports.statistics.series.netChange"),
    billed: t("reports.statistics.series.billed"),
    collected: t("reports.statistics.series.collected"),
    outstanding: t("reports.statistics.series.outstanding"),
    avgStay: t("reports.statistics.series.avgStay"),
    staff: t("reports.statistics.series.staff"),
    patients: t("reports.statistics.series.patients"),
    hours: t("reports.statistics.series.hours"),
    revenue: t("reports.statistics.series.revenue"),
    period: t("reports.statistics.axis.period"),
    employeeType: t("reports.statistics.axis.employeeType"),
    service: t("reports.statistics.axis.service"),
    drug: t("reports.statistics.axis.drug"),
    emptyTitle: t("reports.statistics.emptyTitle"),
    emptyDescription: t("reports.statistics.emptyDescription"),
  }

  /** Distribution keys are enum values; unknown keys fall back to the raw id. */
  const distributionLabel = (key: string): string => {
    const group = distributionMode === "gender" ? "genderTypes" : "paymentTypes"
    const translated = t(`reports.${group}.${key}`)
    return translated.startsWith("reports.") ? key : translated
  }

  const staffLabel = (key: string): string => {
    const translated = t(`reports.enums.employeeType.${key}`)
    return translated.startsWith("reports.") ? key : translated
  }

  /* ---------------------------------------------------------------- */
  /* Exports                                                           */
  /* ---------------------------------------------------------------- */

  const handleExportPdf = async () => {
    if (!filters) return
    setExporting("pdf")
    try {
      const exportPayload = await exportStatistics(filters)

      setSnapshotPayload(exportPayload)
      let images: Record<string, string> = {}
      try {
        const root = await waitForSnapshotRoot()
        if (root) images = await captureChartSnapshots(root)
      } finally {
        setSnapshotPayload(null)
      }

      await buildStatisticsReportPdf({
        payload: exportPayload,
        t,
        language,
        images,
      })
    } catch {
      toast.error(t("reports.messages.exportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setSnapshotPayload(null)
      setExporting(null)
    }
  }

  const handleExportCsv = async () => {
    if (!filters) return
    setExporting("csv")
    try {
      const exportPayload = await exportStatistics(filters)
      exportStatisticsReportCsv({ payload: exportPayload })
    } catch {
      toast.error(t("reports.messages.exportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setExporting(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const kpis = payload?.kpis
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 0,
    }).format(value)

  const clinicalKpis = kpis
    ? [
        {
          key: "patients",
          label: t("reports.statistics.kpis.patients"),
          value: String(kpis.totalPatients),
        },
        {
          key: "admissions",
          label: t("reports.statistics.kpis.admissions"),
          value: String(kpis.totalAdmissions),
        },
        {
          key: "discharges",
          label: t("reports.statistics.kpis.discharges"),
          value: String(kpis.totalDischarges),
        },
        {
          key: "avgStay",
          label: t("reports.statistics.kpis.avgStay"),
          value: formatNumber(kpis.avgStayDays, 1),
        },
      ]
    : []

  const revenueKpis = kpis
    ? [
        {
          key: "billed",
          label: t("reports.statistics.kpis.billed"),
          value: money(kpis.totalBilled),
        },
        {
          key: "collected",
          label: t("reports.statistics.kpis.collected"),
          value: money(kpis.totalCollected),
        },
        {
          key: "outstanding",
          label: t("reports.statistics.kpis.outstanding"),
          value: money(kpis.totalOutstanding),
          tone: kpis.totalOutstanding > 0 ? ("warning" as const) : ("neutral" as const),
        },
      ]
    : []

  const range = (generated ?? draft).range
  const period = t("reports.state.range", {
    from: formatDate(new Date(`${range.from}T00:00:00`), language),
    to: formatDate(new Date(`${range.to}T00:00:00`), language),
  })

  const exportDisabled = !canExport || !payload
  const exportDisabledReason = !canExport
    ? t("reports.state.exportForbidden")
    : t("reports.state.notGeneratedDescription")

  const exportHandlerProps = canExport
    ? { onExportPdf: handleExportPdf, onExportCsv: handleExportCsv }
    : {}

  const distributionToggle = (
    <div
      className="inline-flex overflow-hidden rounded-md border border-border"
      role="group"
      aria-label={t("reports.statistics.distribution.toggleLabel")}
    >
      {(["payment", "gender"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={distributionMode === mode}
          onClick={() => onDistributionChange(mode)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium transition-colors",
            distributionMode === mode
              ? "bg-primary text-primary-foreground"
              : "bg-surface text-muted-foreground hover:bg-surface-muted"
          )}
        >
          {t(`reports.statistics.distribution.${mode}`)}
        </button>
      ))}
    </div>
  )

  /**
   * Statistics has no `total`: the export is the same document, so the figure
   * that predicts build time is the number of table rows the PDF will lay out —
   * every series, added up.
   */
  const exportRowCount = payload
    ? payload.patientCensus.length +
      payload.revenueTrends.length +
      payload.admissionDischarge.length +
      payload.averageStay.length +
      payload.topServices.length +
      payload.topDrugs.length +
      payload.staffUtilization.length
    : undefined

  return (
    <>
      <ReportShell
        title={title}
        description={description}
        onGenerate={onGenerate}
        generating={query.loading && payload === undefined}
        stale={isStale}
        validationError={validationError}
        {...exportHandlerProps}
        exportDisabled={exportDisabled}
        exportDisabledReason={exportDisabled ? exportDisabledReason : undefined}
        exporting={exporting}
        exportRowCount={exportRowCount}
        meta={
          payload
            ? [
                period,
                t(`reports.filters.groupByOptions.${payload.range.grouping}`),
              ].join("  ·  ")
            : undefined
        }
        filters={
          <>
            <DateRangeField
              value={draft.range}
              onChange={(next) => onDraftChange({ range: next })}
            />
            <GroupByField
              value={draft.grouping}
              onChange={(grouping) => onDraftChange({ grouping })}
            />
          </>
        }
      >
        {!isGenerated ? (
          <ReportState kind="not-generated" onGenerate={onGenerate} />
        ) : query.error ? (
          <ReportState kind="error" onRetry={query.reload} />
        ) : !payload ? (
          <ReportState kind="loading" />
        ) : (
          <>
            <ReportKpiStrip items={clinicalKpis} />
            <ReportKpiStrip items={revenueKpis} />

            <div className="grid gap-4 xl:grid-cols-2">
              <StatisticsChartCard
                title={t("reports.statistics.charts.census")}
                caption={t("reports.statistics.charts.censusCaption", captionVars)}
              >
                <CensusChart
                  data={payload.patientCensus}
                  labels={labels}
                  locale={locale}
                  height={CHART_HEIGHT}
                />
              </StatisticsChartCard>

              <StatisticsChartCard
                title={t("reports.statistics.charts.distribution")}
                caption={t("reports.statistics.charts.distributionCaption")}
                action={distributionToggle}
              >
                <DistributionChart
                  payment={payload.distribution.paymentType}
                  gender={payload.distribution.gender}
                  mode={distributionMode}
                  labelFor={distributionLabel}
                  labels={labels}
                  locale={locale}
                  height={CHART_HEIGHT}
                />
              </StatisticsChartCard>

              <StatisticsChartCard
                title={t("reports.statistics.charts.averageStay")}
                caption={t("reports.statistics.charts.averageStayCaption", captionVars)}
              >
                <AverageStayChart
                  data={payload.averageStay}
                  labels={labels}
                  locale={locale}
                  height={CHART_HEIGHT}
                />
              </StatisticsChartCard>

              <StatisticsChartCard
                title={t("reports.statistics.charts.revenue")}
                caption={t("reports.statistics.charts.revenueCaption", captionVars)}
              >
                <RevenueChart
                  data={payload.revenueTrends}
                  labels={labels}
                  locale={locale}
                  height={CHART_HEIGHT}
                />
              </StatisticsChartCard>

              <StatisticsChartCard
                title={t("reports.statistics.charts.flow")}
                caption={t("reports.statistics.charts.flowCaption")}
              >
                <FlowChart
                  data={payload.admissionDischarge}
                  labels={labels}
                  locale={locale}
                  height={CHART_HEIGHT}
                />
              </StatisticsChartCard>

              <StatisticsChartCard
                title={t("reports.statistics.charts.staff")}
                caption={t("reports.statistics.charts.staffCaption")}
              >
                <StaffChart
                  data={payload.staffUtilization}
                  labels={labels}
                  locale={locale}
                  height={CHART_HEIGHT}
                />
              </StatisticsChartCard>
            </div>

            <StatisticsChartCard
              title={t("reports.statistics.charts.topServices")}
              caption={t("reports.statistics.charts.topCaption")}
            >
              <TopServicesChart
                data={payload.topServices}
                labels={labels}
                locale={locale}
              />
            </StatisticsChartCard>

            <StatisticsChartCard
              title={t("reports.statistics.charts.topDrugs")}
              caption={t("reports.statistics.charts.topCaption")}
            >
              <TopDrugsChart
                data={payload.topDrugs}
                labels={labels}
                locale={locale}
              />
            </StatisticsChartCard>

            {/*
              The staff chart's category axis is an enum, so the chart itself
              renders raw type ids; this legend line is the localized spelling.
            */}
            {payload.staffUtilization.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {payload.staffUtilization
                  .map((row) => staffLabel(row.employeeType))
                  .join("  ·  ")}
              </p>
            ) : null}
          </>
        )}
      </ReportShell>

      <ChartSnapshotSurface
        active={snapshotPayload !== null}
        height={8 * 300}
      >
        {snapshotPayload ? (
          <StatisticsSnapshotCharts payload={snapshotPayload} />
        ) : null}
      </ChartSnapshotSurface>
    </>
  )
}
