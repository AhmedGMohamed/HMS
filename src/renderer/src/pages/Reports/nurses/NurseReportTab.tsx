"use client"

/**
 * Nurse report tab — Phase 6.11.3.
 *
 * Two report shapes behind one tab, chosen by the report-type select:
 *
 *   - **All nurses** (`scope=all`): one row per nurse with in-range patients,
 *     days and hours, a distribution chart and a totals strip.
 *   - **Specific nurse** (`scope=specific`): one nurse, their patients and the
 *     daily-assignment accordion, which is the only mode that prints it inline.
 *
 * State discipline is the 6.11.1 contract (§8.2): filter edits live in the
 * page-owned `draft`, the query is built from `generated` only, paging/sort are
 * local but keyed by the generated token, and exports re-fetch with the
 * generated filters so a download always matches the screen.
 *
 * ## `search` means one thing per mode
 *
 * All-nurses mode searches **nurse names**; specific mode searches **patients**.
 * A single `search` field cannot mean both, so changing the report type clears
 * it. There is no relationship select here: a nurse is in the report when they
 * have at least one assignment in the range.
 *
 * ## The chart's denominator differs on paper
 *
 * The on-screen chart draws the current page (that is what the table shows),
 * while the PDF prints a distribution table over every nurse with each one's
 * share of **total hours**. Both are stated in their captions.
 */

import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { UserRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/common/DataTable"
import {
  ChartSnapshotSlot,
  ChartSnapshotSurface,
} from "@/components/charts"
import { Card, CardContent } from "@/components/ui/card"
import { captureChartSnapshots, waitForSnapshotRoot } from "@/lib/chartSnapshot"
import { formatDate, resolveLocale } from "@/lib/utils"
import { exportNurses } from "@/pages/Reports/api"
import { DateRangeField } from "@/pages/Reports/components/DateRangeField"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { ReportShell } from "@/pages/Reports/components/ReportShell"
import { ReportState } from "@/pages/Reports/components/ReportState"
import { SearchField } from "@/pages/Reports/components/SearchField"
import { SelectField } from "@/pages/Reports/components/SelectField"
import { exportNurseReportCsv } from "@/pages/Reports/export/csv/exportNurseReportCsv"
import { buildNurseReportPdf } from "@/pages/Reports/export/pdf/buildNurseReportPdf"
import { buildPatientDetailPdf } from "@/pages/Reports/export/pdf/buildPatientDetailPdf"
import { useNurseDetail } from "@/pages/Reports/hooks/useNurseDetail"
import { useNurseReport } from "@/pages/Reports/hooks/useNurseReport"
import { DailyAssignmentAccordion } from "@/pages/Reports/nurses/DailyAssignmentAccordion"
import { NurseDetailDialog } from "@/pages/Reports/nurses/NurseDetailDialog"
import { NursePatientTable } from "@/pages/Reports/nurses/NursePatientTable"
import { NurseTotalsBand } from "@/pages/Reports/nurses/NurseTotalsBand"
import { NURSE_SNAPSHOT_LABELS } from "@/pages/Reports/nurses/nurseChartSnapshot"
import {
  NurseDistributionChart,
  NurseDistributionSection,
  type NurseDistributionPoint,
} from "@/pages/Reports/nurses/NurseDistributionChart"
import { buildNurseColumns } from "@/pages/Reports/nurses/nurseColumns"
import { PatientDetailDialog } from "@/pages/Reports/patients/PatientDetailDialog"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  NursePatientRow,
  NurseQueryFilters,
  NurseQueryPaging,
  NurseReportRow,
} from "@/pages/Reports/types/nurseReport"
import type {
  PatientReportAdmission,
  PatientReportDetail,
} from "@/pages/Reports/types/patientReport"
import type {
  ReportDraft,
  ReportOption,
  ReportScope,
} from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface NurseReportTabProps {
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
  nurses: ReportOption[]
  session: ReportSessionResult
  canExport: boolean
}

/** Server defaults: nurse list and patient table are both name-ascending. */
/** Module-scope so `DataTable`'s memo sees a stable `getRowId`. */
const getNurseRowId = (row: NurseReportRow) => row.nurseId

const INITIAL_LIST_PAGING: NurseQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "name", direction: "asc" },
}

const INITIAL_PATIENT_PAGING: NurseQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "name", direction: "asc" },
}

/**
 * Report-type values encode the scope; there is no relationship dimension.
 * `labelKey` holds the full key — see the same note in `DoctorReportTab`.
 */
const REPORT_TYPE_OPTIONS = [
  { value: "all-nurses", scope: "all", labelKey: "reports.nurseReports.types.allNurses" },
  { value: "specific-nurse", scope: "specific", labelKey: "reports.nurseReports.types.specificNurse" },
] as const satisfies ReadonlyArray<{
  value: string
  scope: ReportScope
  labelKey: string
}>

interface PagingState {
  key: string | null
  value: NurseQueryPaging
}

export function NurseReportTab({
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
  nurses,
  session,
  canExport,
}: NurseReportTabProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = resolveLocale(language)
  /** Hours are decimals (`22.8`), so two fraction digits at most. */
  const hours = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value),
    [locale]
  )

  /* ---------------------------------------------------------------- */
  /* Paging (per generated report)                                     */
  /* ---------------------------------------------------------------- */

  const [listPagingState, setListPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_LIST_PAGING,
  })
  const listPaging =
    listPagingState.key === generatedKey
      ? listPagingState.value
      : INITIAL_LIST_PAGING

  const setListPaging = useCallback(
    (patch: Partial<NurseQueryPaging>) => {
      setListPagingState((prev) => {
        const current =
          prev.key === generatedKey ? prev.value : INITIAL_LIST_PAGING
        return { key: generatedKey, value: { ...current, ...patch } }
      })
    },
    [generatedKey]
  )

  const [patientPagingState, setPatientPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PATIENT_PAGING,
  })
  const patientPaging =
    patientPagingState.key === generatedKey
      ? patientPagingState.value
      : INITIAL_PATIENT_PAGING

  const setPatientPaging = useCallback(
    (patch: Partial<NurseQueryPaging>) => {
      setPatientPagingState((prev) => {
        const current =
          prev.key === generatedKey ? prev.value : INITIAL_PATIENT_PAGING
        return { key: generatedKey, value: { ...current, ...patch } }
      })
    },
    [generatedKey]
  )

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  const allMode = generated?.scope === "all"
  const specificMode = generated?.scope === "specific"
  const generatedNurseId = generated?.nurseId ?? null

  const listFilters: NurseQueryFilters | null =
    generated && allMode
      ? {
          range: generated.range,
          nurseId: null,
          search: generated.search,
        }
      : null

  const detailFilters: NurseQueryFilters | null =
    generated && specificMode && generatedNurseId !== null
      ? {
          range: generated.range,
          nurseId: generatedNurseId,
          search: generated.search,
        }
      : null

  const listQuery = useNurseReport({
    filters: listFilters,
    paging: listPaging,
    session,
    enabled: isGenerated && allMode,
  })

  const detailQuery = useNurseDetail({
    nurseId: generatedNurseId,
    filters: detailFilters,
    paging: patientPaging,
    enabled: isGenerated && specificMode,
  })

  const query = allMode ? listQuery : detailQuery
  const payload = allMode ? listQuery.payload : detailQuery.payload

  /* ---------------------------------------------------------------- */
  /* Dialogs + export state                                            */
  /* ---------------------------------------------------------------- */

  const [detailNurseId, setDetailNurseId] = useState<number | null>(null)
  const [detailPatientId, setDetailPatientId] = useState<number | null>(null)
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null)
  const [snapshotPoints, setSnapshotPoints] =
    useState<NurseDistributionPoint[] | null>(null)

  /** Detail/drill-down always describe the generated period, never the draft. */
  const range = generated?.range ?? draft.range

  /* ---------------------------------------------------------------- */
  /* Filters                                                           */
  /* ---------------------------------------------------------------- */

  const reportTypeValue =
    draft.scope === "specific" ? "specific-nurse" : "all-nurses"

  const handleReportTypeChange = (value: string) => {
    const option = REPORT_TYPE_OPTIONS.find((entry) => entry.value === value)
    if (!option) return

    onDraftChange({
      scope: option.scope,
      // `search` changes meaning with the scope (nurse vs patient name).
      search: "",
      // A nurse stays eligible in both modes, so the picker value survives;
      // the explicit `null` only matters when the select is on "all".
      nurseId: option.scope === "all" ? null : draft.nurseId,
    })
  }

  /* ---------------------------------------------------------------- */
  /* Exports — always the generated filters                            */
  /* ---------------------------------------------------------------- */

  /**
   * Mounts the off-screen English chart, captures it, and unmounts.
   *
   * Best-effort by design: a failed capture only costs the image, and the PDF
   * still prints the distribution table (`buildNurseReportPdf` branches on the
   * data URL).
   */
  const captureDistribution = async (
    points: NurseDistributionPoint[]
  ): Promise<string | undefined> => {
    if (points.length === 0) return undefined

    setSnapshotPoints(points)
    try {
      const root = await waitForSnapshotRoot()
      if (!root) return undefined
      const snapshots = await captureChartSnapshots(root)
      return snapshots["nurse-distribution"]
    } finally {
      setSnapshotPoints(null)
    }
  }

  const exportFilters: NurseQueryFilters | null = generated
    ? {
        range: generated.range,
        nurseId: allMode ? null : generatedNurseId,
        search: generated.search,
      }
    : null

  const handleExportPdf = async () => {
    if (!exportFilters) return
    setExporting("pdf")
    try {
      const exportPayload = await exportNurses(exportFilters, listPaging)

      const distributionImage =
        allMode && exportPayload.data.length > 1
          ? await captureDistribution(
              exportPayload.data.map((nurse) => ({
                nurse: nurse.nurseName,
                hours: nurse.totals.hours,
              }))
            )
          : undefined

      await buildNurseReportPdf({
        payload: exportPayload,
        t,
        language,
        distributionImage,
      })
    } catch {
      toast.error(t("reports.messages.exportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setSnapshotPoints(null)
      setExporting(null)
    }
  }

  const handleExportCsv = async () => {
    if (!exportFilters) return
    setExporting("csv")
    try {
      const exportPayload = await exportNurses(exportFilters, listPaging)
      exportNurseReportCsv({ payload: exportPayload })
    } catch {
      toast.error(t("reports.messages.exportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setExporting(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Patient drill-down (shared dialog, generated range)               */
  /* ---------------------------------------------------------------- */

  /**
   * The drill-down reuses the patient tab's dialog and print path, so a nurse
   * report never grows a second, slightly different patient document.
   */
  const printPatientDetail = async (
    detail: PatientReportDetail,
    admissionId?: number
  ) => {
    try {
      await buildPatientDetailPdf({ detail, range, t, language, admissionId })
    } catch {
      toast.error(t("reports.messages.printError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const listSummary = listQuery.payload?.summary ?? null
  const detailNurse = specificMode
    ? (detailQuery.payload?.nurse ?? null)
    : null
  const detailSummary = specificMode
    ? (detailQuery.payload?.summary ?? null)
    : null

  const kpiItems = allMode
    ? listSummary
      ? [
          {
            key: "nurses",
            label: t("reports.summary.totalNurses"),
            value: String(listSummary.totalNurses),
          },
          {
            key: "patients",
            label: t("reports.summary.uniquePatients"),
            value: String(listSummary.totalPatients),
            hint: t("reports.nurseReports.assignmentsHint", {
              count: listSummary.totalPatientAssignments,
            }),
          },
          {
            key: "days",
            label: t("reports.summary.totalDays"),
            value: String(listSummary.totalDays),
          },
          {
            key: "hours",
            label: t("reports.summary.totalHours"),
            value: hours(listSummary.totalHours),
          },
        ]
      : []
    : detailSummary
      ? [
          {
            key: "patients",
            label: t("reports.table.patients"),
            value: String(detailSummary.patients),
          },
          {
            key: "days",
            label: t("reports.summary.totalDays"),
            value: String(detailSummary.days),
          },
          {
            key: "hours",
            label: t("reports.summary.totalHours"),
            value: hours(detailSummary.hours),
          },
        ]
      : []

  const handleViewNurse = useCallback(
    (row: NurseReportRow) => setDetailNurseId(row.nurseId),
    []
  )

  const nurseColumns = useMemo(
    () =>
      buildNurseColumns({
        t,
        language,
        onView: handleViewNurse,
      }),
    [t, language, handleViewNurse]
  )

  /** The chart shows the rows the table shows; the export shows them all. */
  const chartPoints: NurseDistributionPoint[] =
    allMode && listQuery.payload
      ? listQuery.payload.data.map((row) => ({
          nurse: row.nurseName,
          hours: row.totalHours,
        }))
      : []

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
  const handleListSortToggle = useCallback(
    (
      _columnId: string,
      next: { columnId: string; direction: "asc" | "desc" }
    ) => setListPaging({ sort: next, page: 1 }),
    [setListPaging]
  )
  const handleListPageChange = useCallback(
    (page: number) => setListPaging({ page }),
    [setListPaging]
  )
  const handleListPageSizeChange = useCallback(
    (pageSize: number) => setListPaging({ page: 1, pageSize }),
    [setListPaging]
  )
  const listPagination = useMemo(
    () =>
      listQuery.payload
        ? {
            page: listQuery.payload.page,
            pageSize: listQuery.payload.pageSize,
            total: listQuery.payload.total,
            onPageChange: handleListPageChange,
            onPageSizeChange: handleListPageSizeChange,
          }
        : undefined,
    [listQuery.payload, handleListPageChange, handleListPageSizeChange]
  )
  const listFooter = useMemo(
    () =>
      listSummary ? (
        <NurseTotalsBand
          label={t("reports.table.totals")}
          patients={listSummary.totalPatientAssignments}
          days={listSummary.totalDays}
          hours={hours(listSummary.totalHours)}
          labels={{
            patients: t("reports.table.patients"),
            days: t("reports.table.totalDays"),
            hours: t("reports.table.hours"),
          }}
          note={t("reports.nurseReports.dedupeNote", {
            count: listSummary.totalPatients,
          })}
        />
      ) : undefined,
    [listSummary, t, hours]
  )

  const handlePatientRowClick = useCallback(
    (row: NursePatientRow) => setDetailPatientId(row.patientId),
    []
  )
  const handlePatientSortToggle = useCallback(
    (
      _columnId: string,
      next: { columnId: string; direction: "asc" | "desc" }
    ) => setPatientPaging({ sort: next, page: 1 }),
    [setPatientPaging]
  )
  const handlePatientPageChange = useCallback(
    (page: number) => setPatientPaging({ page }),
    [setPatientPaging]
  )
  const handlePatientPageSizeChange = useCallback(
    (pageSize: number) => setPatientPaging({ page: 1, pageSize }),
    [setPatientPaging]
  )
  const detailFooter = useMemo(
    () =>
      detailSummary ? (
        <NurseTotalsBand
          label={t("reports.table.totals")}
          patients={detailSummary.patients}
          days={detailSummary.days}
          hours={hours(detailSummary.hours)}
          labels={{
            patients: t("reports.table.patients"),
            days: t("reports.table.totalDays"),
            hours: t("reports.table.hours"),
          }}
        />
      ) : undefined,
    [detailSummary, t, hours]
  )

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
              id="reports-nurse-report-type"
              label={t("reports.filters.relationship")}
              value={reportTypeValue}
              options={REPORT_TYPE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              onChange={handleReportTypeChange}
            />

            {draft.scope === "specific" ? (
              <SelectField
                id="reports-nurse-picker"
                label={t("reports.filters.nurse")}
                value={draft.nurseId ? String(draft.nurseId) : ""}
                options={[
                  { value: "", label: t("reports.nurseReports.selectNursePlaceholder") },
                  ...nurses.map((nurse) => ({
                    value: String(nurse.id),
                    label: nurse.name,
                  })),
                ]}
                onChange={(value) =>
                  onDraftChange({
                    nurseId: value ? Number.parseInt(value, 10) : null,
                  })
                }
              />
            ) : null}

            <SearchField
              id="reports-nurse-search"
              label={
                draft.scope === "all"
                  ? t("reports.filters.searchNurse")
                  : t("reports.filters.searchPatient")
              }
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
        ) : allMode && listQuery.payload ? (
          <>
            <ReportKpiStrip items={kpiItems} />

            <NurseDistributionSection
              data={chartPoints}
              caption={t("reports.nurseReports.chartCaption")}
            />

            <DataTable
              data={listQuery.payload.data}
              columns={nurseColumns}
              loading={listQuery.loading || listQuery.refreshing}
              getRowId={getNurseRowId}
              onRowClick={handleViewNurse}
              sort={listPaging.sort}
              onSortToggle={handleListSortToggle}
              pagination={listPagination}
              emptyTitle={t("reports.emptyState.noNursesFound")}
              emptyDescription={t("reports.emptyState.noNursesDescription")}
              ariaLabel={t("reports.tabs.nurseReports")}
              footer={listFooter}
            />
          </>
        ) : detailQuery.payload ? (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <UserRoundIcon aria-hidden className="size-4 text-primary" />
                  {detailNurse ? detailNurse.nurseName : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("reports.enums.employeeType.nurse")}
                </span>
              </CardContent>
            </Card>

            <ReportKpiStrip items={kpiItems} />

            <NursePatientTable
              data={detailQuery.payload.data}
              loading={detailQuery.loading || detailQuery.refreshing}
              total={detailQuery.payload.total}
              page={detailQuery.payload.page}
              pageSize={detailQuery.payload.pageSize}
              sort={patientPaging.sort}
              onSortToggle={handlePatientSortToggle}
              onPageChange={handlePatientPageChange}
              onPageSizeChange={handlePatientPageSizeChange}
              onRowClick={handlePatientRowClick}
              ariaLabel={t("reports.nurseDetail.patients")}
              emptyTitle={t("reports.emptyState.noPatientsForNurse")}
              emptyDescription={t("reports.emptyState.noPatientsDescription")}
              footer={detailFooter}
            />

            <section className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                {t("reports.nurseDetail.dailyAssignments")}
              </h3>
              <DailyAssignmentAccordion
                days={detailQuery.payload.dailyAssignments}
                emptyLabel={t("reports.nurseDetail.noAssignments")}
              />
            </section>
          </>
        ) : (
          <ReportState kind="loading" />
        )}
      </ReportShell>

      <NurseDetailDialog
        open={detailNurseId !== null}
        nurseId={detailNurseId}
        range={range}
        onClose={() => setDetailNurseId(null)}
        onViewPatient={(patientId) => setDetailPatientId(patientId)}
      />

      <PatientDetailDialog
        open={detailPatientId !== null}
        patientId={detailPatientId}
        range={range}
        canExport={canExport}
        onClose={() => setDetailPatientId(null)}
        onPrintPatient={(detail) => printPatientDetail(detail)}
        onPrintAdmission={(detail, admission: PatientReportAdmission) =>
          printPatientDetail(detail, admission.patientHistoryId)
        }
      />

      <ChartSnapshotSurface active={snapshotPoints !== null} height={420}>
        {snapshotPoints ? (
          <ChartSnapshotSlot name="nurse-distribution">
            <NurseDistributionChart
              data={snapshotPoints}
              locale="en-US"
              hoursLabel={NURSE_SNAPSHOT_LABELS.hoursLabel}
              srCaption={NURSE_SNAPSHOT_LABELS.srCaption}
              xHeader={NURSE_SNAPSHOT_LABELS.xHeader}
              emptyTitle={NURSE_SNAPSHOT_LABELS.emptyTitle}
              height={380}
            />
          </ChartSnapshotSlot>
        ) : null}
      </ChartSnapshotSurface>
    </>
  )
}
