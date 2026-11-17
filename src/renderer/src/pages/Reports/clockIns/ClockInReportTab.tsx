"use client"

/**
 * Clock-in report tab — Phase 6.11.6.
 *
 * One report shape: a list of employees who were expected to clock in (or who
 * worked in the window), their sessions, the hours those sessions produced, the
 * attendance classification of every day, and the deductions that came out of
 * it. The detail dialog owns the per-day table; the tab owns the list, the two
 * charts and the exports.
 *
 * ## Days are not sessions
 *
 * `Clock-Ins` counts sessions, `Days` counts distinct dates, and `Avg / Day`
 * divides by the latter. The footer therefore repeats the server's whole-set
 * `summary` instead of re-summing the visible page — a page of 25 employees is
 * not the report.
 *
 * ## Missing days are synthesized server-side
 *
 * The server derives absences from `max(range start, hire date)` to
 * `min(range end, today)` for employees who are **active and expected to clock
 * in**. The tab only reports the count (`totalMissingDays`) and tones it
 * `danger` when non-zero; it never invents rows client-side.
 */

import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { DataTable } from "@/components/common/DataTable"
import { ChartSnapshotSurface } from "@/components/charts"
import { captureChartSnapshots, waitForSnapshotRoot } from "@/lib/chartSnapshot"
import type { StaticLocale } from "@/lib/types-extras"
import { formatDate } from "@/lib/utils"
import { exportClockIns } from "@/pages/Reports/api"
import {
  ClockInChartCard,
  ClockInSnapshotCharts,
  HoursByEmployeeChart,
  StatusDistributionChart,
} from "@/pages/Reports/clockIns/ClockInCharts"
import { ClockInDetailDialog } from "@/pages/Reports/clockIns/ClockInDetailDialog"
import { buildClockInColumns } from "@/pages/Reports/clockIns/clockInColumns"
import { DateRangeField } from "@/pages/Reports/components/DateRangeField"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { ReportShell } from "@/pages/Reports/components/ReportShell"
import { ReportState } from "@/pages/Reports/components/ReportState"
import { SearchField } from "@/pages/Reports/components/SearchField"
import { SelectField } from "@/pages/Reports/components/SelectField"
import { exportClockInReportCsv } from "@/pages/Reports/export/csv/exportClockInReportCsv"
import { buildClockInReportPdf } from "@/pages/Reports/export/pdf/buildClockInReportPdf"
import { useClockInReport } from "@/pages/Reports/hooks/useClockInReport"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  ClockInExportPayload,
  ClockInQueryFilters,
  ClockInQueryPaging,
  ClockInReportRow,
} from "@/pages/Reports/types/clockInReport"
import type {
  EmployeeTypeFilter,
  ReportDraft,
  ReportOption,
} from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface ClockInReportTabProps {
  title: string
  description: string
  draft: ReportDraft
  onDraftChange: (patch: Partial<ReportDraft>) => void
  generated: ReportDraft | null
  generatedKey: string | null
  isGenerated: boolean
  isStale: boolean
  onGenerate: () => void
  validationError: string | null
  /** Employees eligible for a clock-in report (`options.clockInEmployees`). */
  employees: ReportOption[]
  session: ReportSessionResult
  canExport: boolean
}

/**
 * The list opens by name — that is the server default (`parseClockInSort`), and
 * matching it here means the first request and the header arrow agree.
 */
/** Module-scope so `DataTable`'s memo sees a stable `getRowId`. */
const getClockInRowId = (row: ClockInReportRow) => row.employeeId

const INITIAL_PAGING: ClockInQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "name", direction: "asc" },
}

const EMPLOYEE_TYPE_VALUES: EmployeeTypeFilter[] = [
  "all",
  "doctor",
  "nurse",
  "other",
]

interface PagingState {
  key: string | null
  value: ClockInQueryPaging
}

export function ClockInReportTab({
  title,
  description,
  draft,
  onDraftChange,
  generated,
  generatedKey,
  isGenerated,
  isStale,
  onGenerate,
  validationError,
  employees,
  session,
  canExport,
}: ClockInReportTabProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = (language === "ar" ? "ar-EG" : "en-US") as StaticLocale

  /** Hours carry fractions; counts do not. */
  const hours = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value),
    [locale]
  )
  const count = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value),
    [locale]
  )
  const money = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EGP",
        maximumFractionDigits: 0,
      }).format(value),
    [locale]
  )

  /* ---------------------------------------------------------------- */
  /* Paging (per generated report)                                     */
  /* ---------------------------------------------------------------- */
  const [pagingState, setPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PAGING,
  })
  const paging =
    pagingState.key === generatedKey ? pagingState.value : INITIAL_PAGING

  const setPaging = useCallback(
    (patch: Partial<ClockInQueryPaging>) => {
      setPagingState((prev) => {
        const current = prev.key === generatedKey ? prev.value : INITIAL_PAGING
        return { key: generatedKey, value: { ...current, ...patch } }
      })
    },
    [generatedKey]
  )

  /* ---------------------------------------------------------------- */
  /* Query                                                             */
  /* ---------------------------------------------------------------- */

  const filters: ClockInQueryFilters | null = generated
    ? {
        range: generated.range,
        employeeType: generated.employeeType,
        employeeId: generated.employeeId,
        search: generated.search,
      }
    : null

  const query = useClockInReport({
    filters,
    paging,
    session,
    enabled: isGenerated,
  })

  const payload = query.payload
  const summary = payload?.summary ?? null

  /* ---------------------------------------------------------------- */
  /* Detail dialog + export state                                      */
  /* ---------------------------------------------------------------- */

  const [detailEmployeeId, setDetailEmployeeId] = useState<number | null>(null)
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null)
  const [snapshotPayload, setSnapshotPayload] =
    useState<ClockInExportPayload | null>(null)

  /** Detail always describes the generated period, never the draft. */
  const range = generated?.range ?? draft.range

  /* ---------------------------------------------------------------- */
  /* Exports — always the generated filters                            */
  /* ---------------------------------------------------------------- */

  const handleExportPdf = async () => {
    if (!filters) return
    setExporting("pdf")
    try {
      const exportPayload = await exportClockIns(filters)

      setSnapshotPayload(exportPayload)
      let images: Record<string, string> = {}
      try {
        const root = await waitForSnapshotRoot()
        if (root) images = await captureChartSnapshots(root)
      } finally {
        setSnapshotPayload(null)
      }

      await buildClockInReportPdf({
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
      const exportPayload = await exportClockIns(filters)
      exportClockInReportCsv({ payload: exportPayload })
    } catch {
      toast.error(t("reports.messages.exportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setExporting(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Labels                                                            */
  /* ---------------------------------------------------------------- */

  const statusLabel = (key: string): string =>
    t(`reports.enums.attendance.${key}`, { defaultValue: key })

  const chartLabels = {
    hours: t("reports.clockInReports.charts.hoursWorked"),
    employee: t("reports.table.employee"),
    status: t("reports.clockInReports.charts.attendanceStatus"),
    emptyTitle: t("reports.clockInReports.emptyTitle"),
    emptyDescription: t("reports.clockInReports.emptyDescription"),
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const kpiItems = summary
    ? [
        {
          key: "employees",
          label: t("reports.summary.totalEmployees"),
          value: count(summary.totalEmployees),
        },
        {
          key: "clockIns",
          label: t("reports.clockInReports.stats.totalClockIns"),
          value: count(summary.totalClockIns),
        },
        {
          key: "hours",
          label: t("reports.summary.totalHours"),
          value: hours(summary.totalHours),
        },
        {
          key: "workedDays",
          label: t("reports.clockInReports.stats.totalWorkedDays"),
          value: count(summary.totalWorkedDays),
        },
        {
          key: "avgPerDay",
          label: t("reports.clockInReports.stats.avgHoursPerDay"),
          value: hours(summary.avgHoursPerDay),
        },
        {
          key: "avgPerEmployee",
          label: t("reports.clockInReports.stats.avgHoursPerEmployee"),
          value: hours(summary.avgHoursPerEmployee),
        },
        {
          key: "missing",
          label: t("reports.clockInReports.stats.totalMissingDays"),
          value: count(summary.totalMissingDays),
          tone:
            summary.totalMissingDays > 0
              ? ("danger" as const)
              : ("neutral" as const),
        },
        {
          key: "deductions",
          label: t("reports.clockInReports.stats.totalDeductions"),
          value: money(summary.totalDeductions),
          tone:
            summary.totalDeductions > 0
              ? ("warning" as const)
              : ("neutral" as const),
        },
      ]
    : []

  const handleViewClockIn = useCallback(
    (row: ClockInReportRow) => setDetailEmployeeId(row.employeeId),
    []
  )

  const columns = useMemo(
    () =>
      buildClockInColumns({
        t,
        language,
        onView: handleViewClockIn,
      }),
    [t, language, handleViewClockIn]
  )

  const footerItems = useMemo(
    () =>
      summary
        ? [
            {
              key: "clockIns",
              label: t("reports.table.clockIns"),
              value: count(summary.totalClockIns),
            },
            {
              key: "days",
              label: t("reports.table.days"),
              value: count(summary.totalWorkedDays),
            },
            {
              key: "hours",
              label: t("reports.table.hours"),
              value: hours(summary.totalHours),
            },
            {
              key: "avgPerDay",
              label: t("reports.table.avgPerDay"),
              value: hours(summary.avgHoursPerDay),
            },
            {
              key: "missing",
              label: t("reports.enums.attendance.missing"),
              value: count(summary.totalMissingDays),
            },
            {
              key: "deductions",
              label: t("reports.table.deductions"),
              value: money(summary.totalDeductions),
            },
          ]
        : [],
    [summary, t, count, hours, money]
  )

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

  /* Stable DataTable props: memoizing the callbacks, pagination object and
     footer keeps the S15 memo effective across unrelated re-renders. */
  const handleSortToggle = useCallback(
    (
      _columnId: string,
      next: { columnId: string; direction: "asc" | "desc" }
    ) => setPaging({ sort: next, page: 1 }),
    [setPaging]
  )
  const handlePageChange = useCallback(
    (page: number) => setPaging({ page }),
    [setPaging]
  )
  const handlePageSizeChange = useCallback(
    (pageSize: number) => setPaging({ page: 1, pageSize }),
    [setPaging]
  )
  const pagination = useMemo(
    () =>
      payload
        ? {
            page: payload.page,
            pageSize: payload.pageSize,
            total: payload.total,
            onPageChange: handlePageChange,
            onPageSizeChange: handlePageSizeChange,
          }
        : undefined,
    [payload, handlePageChange, handlePageSizeChange]
  )
  const footer = useMemo(
    () =>
      footerItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">
            {t("reports.table.totals")}
          </span>
          {footerItems.map((item) => (
            <span key={item.key} className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground">{item.label}</span>
              <span
                className="tabular-nums font-medium text-foreground"
                dir="ltr"
              >
                {item.value}
              </span>
            </span>
          ))}
        </div>
      ) : undefined,
    [footerItems, t]
  )

  /**
   * The export document prints one record per session, not one per employee, so
   * sessions are the rows that drive build time.
   */
  const exportRowCount = payload?.summary.totalClockIns

  const employeeOptions = [
    { value: "", label: t("reports.filters.allEmployees") },
    ...employees.map((employee) => ({
      value: String(employee.id),
      label: employee.name,
    })),
  ]

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
            ? [period, t("reports.state.records", { count: payload.total })].join(
                "  ·  "
              )
            : undefined
        }
        filters={
          <>
            <DateRangeField
              value={draft.range}
              onChange={(next) => onDraftChange({ range: next })}
            />

            <SelectField
              id="reports-clock-in-employee-type"
              label={t("reports.filters.employeeType")}
              value={draft.employeeType}
              options={EMPLOYEE_TYPE_VALUES.map((value) => ({
                value,
                label:
                  value === "all"
                    ? t("reports.filters.allEmployees")
                    : t(`reports.enums.employeeType.${value}`),
              }))}
              onChange={(value) =>
                onDraftChange({ employeeType: value as EmployeeTypeFilter })
              }
            />

            <SelectField
              id="reports-clock-in-employee"
              label={t("reports.filters.employee")}
              value={draft.employeeId ? String(draft.employeeId) : ""}
              options={employeeOptions}
              onChange={(value) =>
                onDraftChange({
                  employeeId: value ? Number.parseInt(value, 10) : null,
                })
              }
            />

            <SearchField
              id="reports-clock-in-search"
              label={t("reports.filters.searchEmployee")}
              placeholder={t("reports.detail.searchPlaceholder")}
              value={draft.search}
              onChange={(search) => onDraftChange({ search })}
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
            <ReportKpiStrip
              items={kpiItems}
              className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4"
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <ClockInChartCard
                title={t("reports.clockInReports.charts.hoursWorked")}
                caption={t("reports.clockInReports.charts.hoursCaption")}
              >
                <HoursByEmployeeChart
                  data={payload.charts.hoursByEmployee}
                  labels={chartLabels}
                  locale={locale}
                />
              </ClockInChartCard>

              <ClockInChartCard
                title={t("reports.clockInReports.charts.attendanceStatus")}
                caption={t("reports.clockInReports.charts.statusCaption")}
              >
                <StatusDistributionChart
                  data={payload.charts.statusDistribution}
                  labels={chartLabels}
                  locale={locale}
                  labelFor={statusLabel}
                />
              </ClockInChartCard>
            </div>

            <DataTable
              data={payload.data}
              columns={columns}
              loading={query.loading || query.refreshing}
              getRowId={getClockInRowId}
              onRowClick={handleViewClockIn}
              sort={paging.sort}
              onSortToggle={handleSortToggle}
              pagination={pagination}
              emptyTitle={t("reports.clockInReports.emptyTitle")}
              emptyDescription={t("reports.clockInReports.emptyDescription")}
              ariaLabel={t("reports.tabs.clockInReports")}
              footer={footer}
            />
          </>
        )}
      </ReportShell>

      <ClockInDetailDialog
        open={detailEmployeeId !== null}
        employeeId={detailEmployeeId}
        range={range}
        onClose={() => setDetailEmployeeId(null)}
      />

      <ChartSnapshotSurface
        active={snapshotPayload !== null}
        height={2 * 320}
      >
        {snapshotPayload ? (
          <ClockInSnapshotCharts payload={snapshotPayload} />
        ) : null}
      </ChartSnapshotSurface>
    </>
  )
}
