"use client"

/**
 * Employee payments (payroll) tab — Phase 6.11.5.
 *
 * One report shape: a list of employees with in-range payments, their gross
 * pay split into base and extra, the period's clock-in deductions, what has
 * been paid and what has not, and the resulting net. The detail dialog owns
 * the per-payment and per-deduction tables; the tab owns the list, the two
 * charts and the exports.
 *
 * ## The money rules are server-side, and the screen says so
 *
 * Deductions are counted **once per employee per period** (plan D15), never per
 * payment, and paid/unpaid are **gross** (`base + extra`). The footer therefore
 * repeats the server's whole-set `summary` instead of re-summing the visible
 * page, and the deductions KPI is toned `warning` only when it is non-zero.
 *
 * ## `grouping` is generated, not live
 *
 * The timeline buckets by the grouping frozen at Generate time; the filter
 * control edits the draft, so a changed grouping marks the report stale and
 * requires a regenerate, exactly like the date range. That keeps the chart,
 * the table and the PDF describing the same buckets.
 *
 * ## Exports re-fetch
 *
 * Both handlers call `exportEmployeePayments` with the **generated** filters
 * (never the paginated list, never the draft), so a download always matches
 * the report on screen. The PDF additionally mounts the two English charts on
 * the off-screen capture surface.
 */

import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { DataTable } from "@/components/common/DataTable"
import { ChartSnapshotSurface } from "@/components/charts"
import { captureChartSnapshots, waitForSnapshotRoot } from "@/lib/chartSnapshot"
import type { StaticLocale } from "@/lib/types-extras"
import { formatDate } from "@/lib/utils"
import { exportEmployeePayments } from "@/pages/Reports/api"
import { DateRangeField } from "@/pages/Reports/components/DateRangeField"
import { GroupByField } from "@/pages/Reports/components/GroupByField"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { ReportShell } from "@/pages/Reports/components/ReportShell"
import { ReportState } from "@/pages/Reports/components/ReportState"
import { SearchField } from "@/pages/Reports/components/SearchField"
import { SelectField } from "@/pages/Reports/components/SelectField"
import { EmployeePaymentDetailDialog } from "@/pages/Reports/employeePayments/EmployeePaymentDetailDialog"
import {
  PaymentTimelineChart,
  PaymentTypeChart,
  PayrollChartCard,
  PayrollSnapshotCharts,
} from "@/pages/Reports/employeePayments/PayrollCharts"
import { buildEmployeePaymentColumns } from "@/pages/Reports/employeePayments/employeePaymentsColumns"
import { exportEmployeePaymentsCsv } from "@/pages/Reports/export/csv/exportEmployeePaymentsCsv"
import { buildEmployeePaymentsReportPdf } from "@/pages/Reports/export/pdf/buildEmployeePaymentsReportPdf"
import { useEmployeePaymentsReport } from "@/pages/Reports/hooks/useEmployeePaymentsReport"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  EmployeePaymentExportPayload,
  EmployeePaymentQueryFilters,
  EmployeePaymentQueryPaging,
  EmployeePaymentRow,
} from "@/pages/Reports/types/employeePaymentReport"
import type {
  EmployeeTypeFilter,
  ReportDraft,
  ReportOption,
} from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface EmployeePaymentsTabProps {
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
  /** Employees eligible for a payroll report (`options.payrollEmployees`). */
  employees: ReportOption[]
  session: ReportSessionResult
  canExport: boolean
}

/** Module-scope so `DataTable`'s memo sees a stable `getRowId`. */
const getEmployeePaymentRowId = (row: EmployeePaymentRow) => row.employeeId

/**
 * The list opens with the largest net first — that is the server default
 * (`parseSort(..., "net", "desc")`), and matching it here means the first
 * request and the header arrow agree.
 */
const INITIAL_PAGING: EmployeePaymentQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "net", direction: "desc" },
}

const EMPLOYEE_TYPE_VALUES: EmployeeTypeFilter[] = [
  "all",
  "doctor",
  "nurse",
  "other",
]

interface PagingState {
  key: string | null
  value: EmployeePaymentQueryPaging
}

export function EmployeePaymentsTab({
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
}: EmployeePaymentsTabProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = (language === "ar" ? "ar-EG" : "en-US") as StaticLocale

  /** Payroll money is whole pounds on screen; the dialog shows fractions. */
  const money = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EGP",
        maximumFractionDigits: 0,
      }).format(value),
    [locale]
  )
  const count = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value),
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
    (patch: Partial<EmployeePaymentQueryPaging>) => {
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

  const filters: EmployeePaymentQueryFilters | null = generated
    ? {
        range: generated.range,
        employeeType: generated.employeeType,
        employeeId: generated.employeeId,
        search: generated.search,
        grouping: generated.grouping,
      }
    : null

  const query = useEmployeePaymentsReport({
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
    useState<EmployeePaymentExportPayload | null>(null)

  /** Detail always describes the generated period, never the draft. */
  const range = generated?.range ?? draft.range

  /* ---------------------------------------------------------------- */
  /* Exports — always the generated filters                            */
  /* ---------------------------------------------------------------- */

  const exportFilters: EmployeePaymentQueryFilters | null = generated
    ? {
        range: generated.range,
        employeeType: generated.employeeType,
        employeeId: generated.employeeId,
        search: generated.search,
        grouping: generated.grouping,
      }
    : null

  const handleExportPdf = async () => {
    if (!exportFilters) return
    setExporting("pdf")
    try {
      const exportPayload = await exportEmployeePayments(exportFilters, paging)

      setSnapshotPayload(exportPayload)
      let images: Record<string, string> = {}
      try {
        const root = await waitForSnapshotRoot()
        if (root) images = await captureChartSnapshots(root)
      } finally {
        setSnapshotPayload(null)
      }

      await buildEmployeePaymentsReportPdf({
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
    if (!exportFilters) return
    setExporting("csv")
    try {
      const exportPayload = await exportEmployeePayments(exportFilters, paging)
      exportEmployeePaymentsCsv({ payload: exportPayload })
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

  const paymentTypeLabel = (key: string): string =>
    t(`reports.payrollReports.paymentTypes.${key}`, { defaultValue: key })

  const chartLabels = {
    grossPay: t("reports.payrollReports.charts.grossPay"),
    period: t("reports.payrollReports.charts.period"),
    paymentType: t("reports.payrollReports.charts.paymentType"),
    emptyTitle: t("reports.payrollReports.emptyTitle"),
    emptyDescription: t("reports.payrollReports.emptyDescription"),
  }

  const groupingLabel = t(
    `reports.filters.groupByOptions.${(generated ?? draft).grouping}`
  )

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
          key: "payments",
          label: t("reports.summary.totalPayments"),
          value: count(summary.totalPayments),
        },
        {
          key: "base",
          label: t("reports.payrollReports.kpis.basePay"),
          value: money(summary.totalBasePay),
        },
        {
          key: "extra",
          label: t("reports.payrollReports.kpis.extraPay"),
          value: money(summary.totalExtraPay),
        },
        {
          key: "deductions",
          label: t("reports.payrollReports.kpis.deductions"),
          value: money(summary.totalDeductions),
          tone:
            summary.totalDeductions > 0
              ? ("warning" as const)
              : ("neutral" as const),
        },
        {
          key: "paid",
          label: t("reports.summary.totalPaid"),
          value: money(summary.totalPaid),
        },
        {
          key: "unpaid",
          label: t("reports.summary.totalUnpaid"),
          value: money(summary.totalUnpaid),
          tone:
            summary.totalUnpaid > 0 ? ("warning" as const) : ("neutral" as const),
        },
        {
          key: "net",
          label: t("reports.payrollReports.kpis.netPay"),
          value: money(summary.totalNet),
          tone: "primary" as const,
        },
      ]
    : []

  const handleViewEmployeePayment = useCallback(
    (row: EmployeePaymentRow) => setDetailEmployeeId(row.employeeId),
    []
  )

  const columns = useMemo(
    () =>
      buildEmployeePaymentColumns({
        t,
        language,
        onView: handleViewEmployeePayment,
      }),
    [t, language, handleViewEmployeePayment]
  )

  const footerItems = useMemo(
    () =>
      summary
        ? [
            {
              key: "payments",
              label: t("reports.table.payments"),
              value: count(summary.totalPayments),
            },
            {
              key: "base",
              label: t("reports.table.base"),
              value: money(summary.totalBasePay),
            },
            {
              key: "extra",
              label: t("reports.table.extra"),
              value: money(summary.totalExtraPay),
            },
            {
              key: "deductions",
              label: t("reports.table.deductions"),
              value: money(summary.totalDeductions),
            },
            {
              key: "paid",
              label: t("reports.table.paid"),
              value: money(summary.totalPaid),
            },
            {
              key: "unpaid",
              label: t("reports.table.unpaid"),
              value: money(summary.totalUnpaid),
            },
            {
              key: "net",
              label: t("reports.table.net"),
              value: money(summary.totalNet),
            },
          ]
        : [],
    [summary, t, money, count]
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
              <span className="tabular-nums font-medium text-foreground" dir="ltr">
                {item.value}
              </span>
            </span>
          ))}
        </div>
      ) : undefined,
    [footerItems, t]
  )

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
        exportRowCount={payload?.total}
        meta={
          payload
            ? [
                period,
                groupingLabel,
                t("reports.state.records", { count: payload.total }),
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

            <SelectField
              id="reports-payroll-employee-type"
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
              id="reports-payroll-employee"
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
              id="reports-payroll-search"
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
              <PayrollChartCard
                title={t("reports.employeePayments.charts.paymentTimeline")}
                caption={t("reports.payrollReports.charts.timelineCaption", {
                  grouping: groupingLabel,
                })}
              >
                <PaymentTimelineChart
                  data={payload.charts.timeline}
                  labels={chartLabels}
                  locale={locale}
                />
              </PayrollChartCard>

              <PayrollChartCard
                title={t("reports.employeePayments.charts.paymentTypeDistribution")}
                caption={t("reports.payrollReports.charts.typeCaption")}
              >
                <PaymentTypeChart
                  data={payload.charts.byType}
                  labels={chartLabels}
                  locale={locale}
                  labelFor={paymentTypeLabel}
                />
              </PayrollChartCard>
            </div>

            <DataTable
              data={payload.data}
              columns={columns}
              loading={query.loading || query.refreshing}
              getRowId={getEmployeePaymentRowId}
              onRowClick={handleViewEmployeePayment}
              sort={paging.sort}
              onSortToggle={handleSortToggle}
              pagination={pagination}
              emptyTitle={t("reports.emptyState.noEmployeePaymentsTitle")}
              emptyDescription={t(
                "reports.emptyState.noEmployeePaymentsDescription"
              )}
              ariaLabel={t("reports.tabs.employeePayments")}
              footer={footer}
            />
          </>
        )}
      </ReportShell>

      <EmployeePaymentDetailDialog
        open={detailEmployeeId !== null}
        employeeId={detailEmployeeId}
        range={range}
        onClose={() => setDetailEmployeeId(null)}
      />

      <ChartSnapshotSurface
        active={snapshotPayload !== null}
        height={2 * 300}
      >
        {snapshotPayload ? (
          <PayrollSnapshotCharts payload={snapshotPayload} />
        ) : null}
      </ChartSnapshotSurface>
    </>
  )
}
