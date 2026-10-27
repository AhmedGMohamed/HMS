"use client"

/**
 * Doctor report tab — Phase 6.11.2.
 *
 * Two report shapes behind one tab, chosen by the report-type select:
 *
 *   - **All doctors** (`scope=all`): one row per doctor, plus a distribution
 *     chart and a totals strip. This is the only mode that queries the list
 *     endpoint.
 *   - **Specific doctor** (`scope=specific`): one doctor and their patients,
 *     with admission-level detail available from the PDF export.
 *
 * State discipline is the 6.11.1 contract (§8.2): filter edits live in the
 * page-owned `draft`, the query is built from `generated` only, paging/sort are
 * local but keyed by the generated token, and exports re-fetch with the
 * generated filters so a download always matches the screen.
 *
 * ## `search` means one thing per mode
 *
 * All-doctors mode searches **doctor names**; specific mode searches
 * **patients**. A single `search` field cannot mean both, so changing the
 * report type clears it, and the picker keeps the selected doctor only when
 * that doctor is still eligible for the new relationship (a referring doctor
 * has no place in an "attended" report).
 *
 * ## The chart's denominator differs on paper
 *
 * The on-screen chart draws the current page (that is what the table shows),
 * while the PDF prints a distribution table for every doctor. Both are stated
 * in their captions so the two numbers never look contradictory.
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { StethoscopeIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/common/DataTable"
import {
  ChartSnapshotSlot,
  ChartSnapshotSurface,
} from "@/components/charts"
import { Card, CardContent } from "@/components/ui/card"
import { captureChartSnapshots } from "@/lib/chartSnapshot"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import { exportDoctors } from "@/pages/Reports/api"
import { DateRangeField } from "@/pages/Reports/components/DateRangeField"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { ReportShell } from "@/pages/Reports/components/ReportShell"
import { ReportState } from "@/pages/Reports/components/ReportState"
import { SearchField } from "@/pages/Reports/components/SearchField"
import { SelectField } from "@/pages/Reports/components/SelectField"
import { DoctorTypeBadge } from "@/pages/Reports/components/StatusBadges"
import { DoctorDetailDialog } from "@/pages/Reports/doctors/DoctorDetailDialog"
import { SNAPSHOT_LABELS } from "@/pages/Reports/doctors/doctorChartSnapshot"
import {
  DoctorDistributionChart,
  DoctorDistributionSection,
  type DoctorDistributionPoint,
} from "@/pages/Reports/doctors/DoctorDistributionChart"
import { DoctorPatientTable } from "@/pages/Reports/doctors/DoctorPatientTable"
import { DoctorTotalsBand } from "@/pages/Reports/doctors/DoctorTotalsBand"
import { buildDoctorColumns } from "@/pages/Reports/doctors/doctorColumns"
import { exportDoctorReportCsv } from "@/pages/Reports/export/csv/exportDoctorReportCsv"
import { buildDoctorReportPdf } from "@/pages/Reports/export/pdf/buildDoctorReportPdf"
import { buildPatientDetailPdf } from "@/pages/Reports/export/pdf/buildPatientDetailPdf"
import { useDoctorDetail } from "@/pages/Reports/hooks/useDoctorDetail"
import { useDoctorReport } from "@/pages/Reports/hooks/useDoctorReport"
import { PatientDetailDialog } from "@/pages/Reports/patients/PatientDetailDialog"
import { doctorsForRelationship } from "@/pages/Reports/state/reportParams"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  DoctorQueryFilters,
  DoctorQueryPaging,
  DoctorReportRow,
} from "@/pages/Reports/types/doctorReport"
import type {
  PatientReportAdmission,
  PatientReportDetail,
} from "@/pages/Reports/types/patientReport"
import type {
  DoctorRelationship,
  ReportDraft,
  ReportOption,
  ReportScope,
} from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface DoctorReportTabProps {
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
  doctors: ReportOption[]
  session: ReportSessionResult
  canExport: boolean
}

/** Server defaults: doctor list and patient table are both name-ascending. */
const INITIAL_LIST_PAGING: DoctorQueryPaging = {
  page: 1,
  pageSize: 25,
  sort: { columnId: "name", direction: "asc" },
}

const INITIAL_PATIENT_PAGING: DoctorQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "name", direction: "asc" },
}

/** Report-type values encode both halves of the choice in one select. */
const REPORT_TYPE_OPTIONS = [
  { value: "all-referred", scope: "all", relationship: "referred", labelKey: "allReferring" },
  { value: "specific-referred", scope: "specific", relationship: "referred", labelKey: "specificReferring" },
  { value: "all-attended", scope: "all", relationship: "attended", labelKey: "allAttending" },
  { value: "specific-attended", scope: "specific", relationship: "attended", labelKey: "specificAttending" },
  { value: "all-supervised", scope: "all", relationship: "supervised", labelKey: "allSupervised" },
  { value: "specific-supervised", scope: "specific", relationship: "supervised", labelKey: "specificSupervising" },
] as const satisfies ReadonlyArray<{
  value: string
  scope: ReportScope
  relationship: DoctorRelationship
  labelKey: string
}>

interface PagingState {
  key: string | null
  value: DoctorQueryPaging
}

/**
 * Waits until the export snapshot surface is mounted and measurable.
 *
 * `html-to-image` captures a bitmap of a rendered DOM node, so the surface has
 * to be committed by React first. Polling the DOM (instead of a fixed timeout)
 * keeps the export fast when the browser is idle and reliable when it is not;
 * the timeout bounds the wait so a stuck render can never hang a download.
 */
async function waitForSnapshotRoot(
  timeoutMs = 900
): Promise<HTMLElement | null> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const root = document.querySelector<HTMLElement>(
      "[data-chart-snapshot-surface]"
    )
    const slot = root?.querySelector("[data-chart-snapshot-key]")
    if (root && slot) return root
    await new Promise((resolve) => window.setTimeout(resolve, 40))
  }

  return null
}

export function DoctorReportTab({
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
  doctors,
  session,
  canExport,
}: DoctorReportTabProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const money = (value: number) => formatCurrency(value, resolveLocale(language))

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

  const setListPaging = (patch: Partial<DoctorQueryPaging>) => {
    setListPagingState({ key: generatedKey, value: { ...listPaging, ...patch } })
  }

  const [patientPagingState, setPatientPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PATIENT_PAGING,
  })
  const patientPaging =
    patientPagingState.key === generatedKey
      ? patientPagingState.value
      : INITIAL_PATIENT_PAGING

  const setPatientPaging = (patch: Partial<DoctorQueryPaging>) => {
    setPatientPagingState({
      key: generatedKey,
      value: { ...patientPaging, ...patch },
    })
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  const allMode = generated?.scope === "all"
  const specificMode = generated?.scope === "specific"
  const generatedDoctorId = generated?.doctorId ?? null

  const listFilters: DoctorQueryFilters | null = generated && allMode
    ? {
        range: generated.range,
        relationship: generated.relationship,
        doctorId: null,
        search: generated.search,
      }
    : null

  const detailFilters: DoctorQueryFilters | null =
    generated && specificMode && generatedDoctorId !== null
      ? {
          range: generated.range,
          relationship: generated.relationship,
          doctorId: generatedDoctorId,
          search: generated.search,
        }
      : null

  const listQuery = useDoctorReport({
    filters: listFilters,
    paging: listPaging,
    session,
    enabled: isGenerated && allMode,
  })

  const detailQuery = useDoctorDetail({
    doctorId: generatedDoctorId,
    filters: detailFilters,
    paging: patientPaging,
    enabled: isGenerated && specificMode,
  })

  const query = allMode ? listQuery : detailQuery
  const payload = allMode ? listQuery.payload : detailQuery.payload

  /* ---------------------------------------------------------------- */
  /* Dialogs + export state                                            */
  /* ---------------------------------------------------------------- */

  const [detailDoctorId, setDetailDoctorId] = useState<number | null>(null)
  const [detailPatientId, setDetailPatientId] = useState<number | null>(null)
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null)
  const [snapshotPoints, setSnapshotPoints] =
    useState<DoctorDistributionPoint[] | null>(null)

  /** Detail/drill-down always describe the generated period, never the draft. */
  const range = generated?.range ?? draft.range

  /* ---------------------------------------------------------------- */
  /* Filters                                                           */
  /* ---------------------------------------------------------------- */

  const reportTypeValue = `${draft.scope}-${draft.relationship}`

  const handleReportTypeChange = (value: string) => {
    const option = REPORT_TYPE_OPTIONS.find((entry) => entry.value === value)
    if (!option) return

    // A doctor that cannot appear in the new relationship must not stay
    // selected: the server would answer with an empty (or 400) report.
    const eligible = doctorsForRelationship(doctors, option.relationship)
    const doctorStillValid =
      draft.doctorId !== null &&
      eligible.some((doctor) => doctor.id === draft.doctorId)

    onDraftChange({
      scope: option.scope,
      relationship: option.relationship,
      doctorId: doctorStillValid ? draft.doctorId : null,
      // `search` changes meaning with the scope (doctor vs patient name).
      search: "",
    })
  }

  /* ---------------------------------------------------------------- */
  /* Exports — always the generated filters                            */
  /* ---------------------------------------------------------------- */

  /**
   * Mounts the off-screen English chart, captures it, and unmounts.
   *
   * Best-effort by design: a failed capture only costs the image, and the PDF
   * still prints the distribution table (`buildDoctorReportPdf` branches on the
   * data URL).
   */
  const captureDistribution = async (
    points: DoctorDistributionPoint[]
  ): Promise<string | undefined> => {
    if (points.length === 0) return undefined

    setSnapshotPoints(points)
    try {
      const root = await waitForSnapshotRoot()
      if (!root) return undefined
      const snapshots = await captureChartSnapshots(root)
      return snapshots["doctor-distribution"]
    } finally {
      setSnapshotPoints(null)
    }
  }

  const handleExportPdf = async () => {
    if (!generated) return
    setExporting("pdf")
    try {
      const exportPayload = await exportDoctors(
        allMode
          ? {
              range: generated.range,
              relationship: generated.relationship,
              doctorId: null,
              search: generated.search,
            }
          : {
              range: generated.range,
              relationship: generated.relationship,
              doctorId: generatedDoctorId,
              search: generated.search,
            },
        listPaging,
        // Admission detail is only meaningful for a single-doctor document.
        specificMode
      )

      const distributionImage =
        allMode && exportPayload.data.length > 1
          ? await captureDistribution(
              exportPayload.data.map((doctor) => ({
                doctor: doctor.doctorName,
                patients: doctor.totals.patients,
              }))
            )
          : undefined

      await buildDoctorReportPdf({
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
    if (!generated) return
    setExporting("csv")
    try {
      const exportPayload = await exportDoctors(
        {
          range: generated.range,
          relationship: generated.relationship,
          doctorId: allMode ? null : generatedDoctorId,
          search: generated.search,
        },
        listPaging,
        specificMode
      )
      exportDoctorReportCsv({ payload: exportPayload })
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
   * The drill-down reuses the patient tab's dialog and print path, so a doctor
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
  const detailDoctor = specificMode
    ? (detailQuery.payload?.doctor ?? null)
    : null
  const detailSummary = specificMode
    ? (detailQuery.payload?.summary ?? null)
    : null

  const kpiItems = allMode
    ? listSummary
      ? [
          {
            key: "doctors",
            label: t("reports.summary.totalDoctors"),
            value: String(listSummary.totalDoctors),
          },
          {
            key: "patients",
            label: t("reports.summary.uniquePatients"),
            value: String(listSummary.totalPatients),
            hint: t("reports.doctorReports.assignmentsHint", {
              count: listSummary.totalPatientAssignments,
            }),
          },
          {
            key: "admissions",
            label: t("reports.summary.admissions"),
            value: String(listSummary.totalAdmissions),
          },
          {
            key: "billed",
            label: t("reports.summary.totalBill"),
            value: money(listSummary.totalBilled),
          },
          {
            key: "paid",
            label: t("reports.summary.totalPaid"),
            value: money(listSummary.totalPaid),
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
            key: "admissions",
            label: t("reports.summary.admissions"),
            value: String(detailSummary.admissions),
          },
          {
            key: "billed",
            label: t("reports.summary.totalBill"),
            value: money(detailSummary.billed),
          },
          {
            key: "paid",
            label: t("reports.summary.totalPaid"),
            value: money(detailSummary.paid),
          },
        ]
      : []

  const doctorColumns = buildDoctorColumns({
    t,
    language,
    onView: (row: DoctorReportRow) => setDetailDoctorId(row.doctorId),
  })

  /** The chart shows the rows the table shows; the export shows them all. */
  const chartPoints: DoctorDistributionPoint[] =
    allMode && listQuery.payload
      ? listQuery.payload.data.map((row) => ({
          doctor: row.doctorName,
          patients: row.patientsCount,
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
              id="reports-doctor-report-type"
              label={t("reports.filters.relationship")}
              value={reportTypeValue}
              options={REPORT_TYPE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(`reports.doctorReports.types.${option.labelKey}`),
              }))}
              onChange={handleReportTypeChange}
            />

            {draft.scope === "specific" ? (
              <SelectField
                id="reports-doctor-picker"
                label={t("reports.filters.doctor")}
                value={draft.doctorId ? String(draft.doctorId) : ""}
                options={[
                  { value: "", label: t("reports.doctorReports.selectDoctorPlaceholder") },
                  ...doctorsForRelationship(doctors, draft.relationship).map(
                    (doctor) => ({
                      value: String(doctor.id),
                      label: doctor.name,
                    })
                  ),
                ]}
                onChange={(value) =>
                  onDraftChange({
                    doctorId: value ? Number.parseInt(value, 10) : null,
                  })
                }
              />
            ) : null}

            <SearchField
              id="reports-doctor-search"
              label={
                draft.scope === "all"
                  ? t("reports.filters.searchDoctor")
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

            <DoctorDistributionSection
              data={chartPoints}
              caption={t("reports.doctorReports.chartCaption")}
            />

            <DataTable
              data={listQuery.payload.data}
              columns={doctorColumns}
              loading={listQuery.loading || listQuery.refreshing}
              getRowId={(row) => row.doctorId}
              onRowClick={(row) => setDetailDoctorId(row.doctorId)}
              sort={listPaging.sort}
              onSortToggle={(_columnId, next) =>
                setListPaging({ sort: next, page: 1 })
              }
              pagination={{
                page: listQuery.payload.page,
                pageSize: listQuery.payload.pageSize,
                total: listQuery.payload.total,
                onPageChange: (page) => setListPaging({ page }),
                onPageSizeChange: (pageSize) =>
                  setListPaging({ page: 1, pageSize }),
              }}
              emptyTitle={t("reports.emptyState.noDoctorsFound")}
              emptyDescription={t("reports.emptyState.noDoctorsDescription")}
              ariaLabel={t("reports.tabs.doctorReports")}
              footer={
                listSummary ? (
                  <DoctorTotalsBand
                    label={t("reports.table.totals")}
                    patients={listSummary.totalPatientAssignments}
                    admissions={listSummary.totalAdmissions}
                    billed={money(listSummary.totalBilled)}
                    paid={money(listSummary.totalPaid)}
                    labels={{
                      patients: t("reports.table.patients"),
                      admissions: t("reports.summary.admissions"),
                      billed: t("reports.summary.totalBill"),
                      paid: t("reports.summary.totalPaid"),
                    }}
                    note={t("reports.doctorReports.dedupeNote", {
                      count: listSummary.totalPatients,
                    })}
                  />
                ) : undefined
              }
            />
          </>
        ) : detailQuery.payload ? (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <StethoscopeIcon aria-hidden className="size-4 text-primary" />
                  {detailDoctor ? detailDoctor.doctorName : "—"}
                </span>
                {detailDoctor ? (
                  <DoctorTypeBadge value={detailDoctor.doctorType} />
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {t(`reports.enums.relationship.${generated?.relationship ?? draft.relationship}`)}
                </span>
              </CardContent>
            </Card>

            <ReportKpiStrip items={kpiItems} />

            <DoctorPatientTable
              data={detailQuery.payload.data}
              loading={detailQuery.loading || detailQuery.refreshing}
              total={detailQuery.payload.total}
              page={detailQuery.payload.page}
              pageSize={detailQuery.payload.pageSize}
              sort={patientPaging.sort}
              onSortToggle={(_columnId, next) =>
                setPatientPaging({ sort: next, page: 1 })
              }
              onPageChange={(page) => setPatientPaging({ page })}
              onPageSizeChange={(pageSize) =>
                setPatientPaging({ page: 1, pageSize })
              }
              onRowClick={(row) => setDetailPatientId(row.patientId)}
              ariaLabel={t("reports.doctorDetail.patients")}
              emptyTitle={t("reports.emptyState.noPatientsForDoctor")}
              emptyDescription={t("reports.emptyState.noPatientsDescription")}
              footer={
                detailSummary ? (
                  <DoctorTotalsBand
                    label={t("reports.table.totals")}
                    patients={detailSummary.patients}
                    admissions={detailSummary.admissions}
                    billed={money(detailSummary.billed)}
                    paid={money(detailSummary.paid)}
                    labels={{
                      patients: t("reports.table.patients"),
                      admissions: t("reports.summary.admissions"),
                      billed: t("reports.summary.totalBill"),
                      paid: t("reports.summary.totalPaid"),
                    }}
                  />
                ) : undefined
              }
            />
          </>
        ) : (
          <ReportState kind="loading" />
        )}
      </ReportShell>

      <DoctorDetailDialog
        open={detailDoctorId !== null}
        doctorId={detailDoctorId}
        relationship={generated?.relationship ?? draft.relationship}
        range={range}
        onClose={() => setDetailDoctorId(null)}
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
          <ChartSnapshotSlot name="doctor-distribution">
            <DoctorDistributionChart
              data={snapshotPoints}
              locale="en-US"
              patientLabel={SNAPSHOT_LABELS.patientLabel}
              srCaption={SNAPSHOT_LABELS.srCaption}
              xHeader={SNAPSHOT_LABELS.xHeader}
              emptyTitle={SNAPSHOT_LABELS.emptyTitle}
              height={380}
            />
          </ChartSnapshotSlot>
        ) : null}
      </ChartSnapshotSurface>
    </>
  )
}
