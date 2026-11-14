"use client"

/**
 * Patient report tab — Phase 6.11.1.
 *
 * Owns everything below `ReportsPage` for the patient report: filters, KPI
 * strip, table, detail dialog and the export paths.
 *
 * State discipline (plan §4.2/§4.3):
 *   - filter edits live in `draft` (page state) and change nothing until the
 *     user presses Generate,
 *   - the query is built from `generated` (the URL) only,
 *   - page/size/sort are local, but they are part of the cache key and are
 *     discarded whenever the generated parameters change (a new report always
 *     starts on page 1 with the default sort),
 *   - exports re-fetch `/patients/export` with the **generated** filters and
 *     the current sort, so a download always matches the report on screen.
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { DataTable } from "@/components/common/DataTable"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import { DateRangeField } from "@/pages/Reports/components/DateRangeField"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { ReportShell } from "@/pages/Reports/components/ReportShell"
import { ReportState } from "@/pages/Reports/components/ReportState"
import { SearchField } from "@/pages/Reports/components/SearchField"
import { SelectField } from "@/pages/Reports/components/SelectField"
import { exportPatientReportCsv } from "@/pages/Reports/export/csv/exportPatientReportCsv"
import { buildPatientDetailPdf } from "@/pages/Reports/export/pdf/buildPatientDetailPdf"
import { buildPatientReportPdf } from "@/pages/Reports/export/pdf/buildPatientReportPdf"
import { usePatientReport } from "@/pages/Reports/hooks/usePatientReport"
import { PatientDetailDialog } from "@/pages/Reports/patients/PatientDetailDialog"
import { buildPatientColumns } from "@/pages/Reports/patients/patientColumns"
import { exportPatients, getPatientDetail } from "@/pages/Reports/api"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  PatientQueryFilters,
  PatientQueryPaging,
  PatientReportAdmission,
  PatientReportDetail,
  PatientReportRow,
} from "@/pages/Reports/types/patientReport"
import type {
  PaymentTypeFilter,
  ReportDraft,
  ReportOption,
} from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface PatientReportTabProps {
  title: string
  description: string
  /** Editable form state (page-owned). */
  draft: ReportDraft
  onDraftChange: (patch: Partial<ReportDraft>) => void
  /** Parameters that produced the visible report (`null` until Generate). */
  generated: ReportDraft | null
  /** Stable token for `generated` — resets paging when the report changes. */
  generatedKey: string | null
  isGenerated: boolean
  isStale: boolean
  onGenerate: () => void
  validationError: string | null
  insuranceCompanies: ReportOption[]
  session: ReportSessionResult
  /** `manage_reports` — gates exports and the per-row print action. */
  canExport: boolean
}

const PAYMENT_TYPES: PaymentTypeFilter[] = ["all", "cash", "credit", "insurance"]

/** Default paging: name ascending, which is also the server's own default. */
const INITIAL_PAGING: PatientQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "name", direction: "asc" },
}

/**
 * Paging state remembers which generated report it belongs to, so a new report
 * (new dates, new filters) starts from `INITIAL_PAGING` without an effect to
 * reset it — the stale value is simply never read.
 */
interface PagingState {
  key: string | null
  value: PatientQueryPaging
}

export function PatientReportTab({
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
  insuranceCompanies,
  session,
  canExport,
}: PatientReportTabProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const money = (value: number) => formatCurrency(value, resolveLocale(language))

  const [pagingState, setPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PAGING,
  })
  const paging = pagingState.key === generatedKey ? pagingState.value : INITIAL_PAGING

  const setPaging = (patch: Partial<PatientQueryPaging>) => {
    setPagingState({ key: generatedKey, value: { ...paging, ...patch } })
  }

  const filters: PatientQueryFilters | null = generated
    ? {
        range: generated.range,
        paymentType: generated.paymentType,
        insuranceId: generated.insuranceId,
        search: generated.search,
      }
    : null

  const query = usePatientReport({
    filters,
    paging,
    session,
    enabled: isGenerated,
  })

  const [detailPatientId, setDetailPatientId] = useState<number | null>(null)
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null)
  const [printingPatientId, setPrintingPatientId] = useState<number | null>(null)

  /** Detail/print always describe the generated period, never the draft. */
  const range = generated?.range ?? draft.range

  /* ---------------------------------------------------------------- */
  /* Exports (always the generated filters)                            */
  /* ---------------------------------------------------------------- */

  const handleExportPdf = async () => {
    if (!filters) return
    setExporting("pdf")
    try {
      const payload = await exportPatients(filters, paging)
      await buildPatientReportPdf({ payload, t, language })
    } catch {
      toast.error(t("reports.messages.exportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setExporting(null)
    }
  }

  const handleExportCsv = async () => {
    if (!filters) return
    setExporting("csv")
    try {
      const payload = await exportPatients(filters, paging)
      exportPatientReportCsv({ payload })
    } catch {
      toast.error(t("reports.messages.exportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setExporting(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Print — the detail is fetched on demand, never per list row       */
  /* ---------------------------------------------------------------- */

  const printDetail = async (
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

  const handlePrintPatient = async (row: PatientReportRow) => {
    if (!filters) return
    setPrintingPatientId(row.patientId)
    try {
      const detail = await getPatientDetail(row.patientId, filters.range)
      await printDetail(detail)
    } catch {
      toast.error(t("reports.messages.printError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setPrintingPatientId(null)
    }
  }

  const handlePrintAdmission = async (
    detail: PatientReportDetail,
    admission: PatientReportAdmission
  ) => {
    await printDetail(detail, admission.patientHistoryId)
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const payload = query.payload
  const summary = payload?.summary ?? null

  const kpiItems = summary
    ? [
        {
          key: "patients",
          label: t("reports.summary.totalPatients"),
          value: String(summary.totalPatients),
        },
        {
          key: "admissions",
          label: t("reports.summary.admissions"),
          value: String(summary.totalAdmissions),
        },
        {
          key: "billed",
          label: t("reports.summary.totalBill"),
          value: money(summary.totalBilled),
        },
        {
          key: "paid",
          label: t("reports.summary.totalPaid"),
          value: money(summary.totalPaid),
        },
        {
          key: "outstanding",
          label: t("reports.summary.totalOutstanding"),
          value: money(summary.totalOutstanding),
          tone:
            summary.totalOutstanding > 0
              ? ("warning" as const)
              : ("neutral" as const),
        },
      ]
    : []

  const columns = buildPatientColumns({
    t,
    language,
    onView: (row) => setDetailPatientId(row.patientId),
    onPrint: canExport ? handlePrintPatient : undefined,
    printingPatientId,
  })

  const exportDisabled = !canExport || !payload
  const exportDisabledReason = !canExport
    ? t("reports.state.exportForbidden")
    : t("reports.state.notGeneratedDescription")

  return (
    <>
      <ReportShell
        title={title}
        description={description}
        onGenerate={onGenerate}
        generating={query.loading && payload === undefined}
        stale={isStale}
        validationError={validationError}
        onExportPdf={handleExportPdf}
        onExportCsv={handleExportCsv}
        exportDisabled={exportDisabled}
        exportDisabledReason={exportDisabled ? exportDisabledReason : undefined}
        exporting={exporting}
        exportRowCount={payload?.total}
        meta={
          payload
            ? [
                t("reports.state.range", {
                  from: formatDate(new Date(`${range.from}T00:00:00`), language),
                  to: formatDate(new Date(`${range.to}T00:00:00`), language),
                }),
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

            <SelectField
              id="reports-patient-payment-type"
              label={t("reports.filters.paymentType")}
              value={draft.paymentType}
              options={PAYMENT_TYPES.map((value) => ({
                value,
                label:
                  value === "all"
                    ? t("reports.filters.allPaymentTypes")
                    : t(`reports.paymentTypes.${value}`),
              }))}
              onChange={(value) =>
                onDraftChange({
                  paymentType: value as PaymentTypeFilter,
                  // A company only narrows an insurance report; clearing it
                  // keeps the draft (and the URL) free of a filter the server
                  // would ignore.
                  insuranceId: value === "insurance" ? draft.insuranceId : null,
                })
              }
            />

            {draft.paymentType === "insurance" ? (
              <SelectField
                id="reports-patient-insurance"
                label={t("reports.filters.insuranceCompany")}
                value={draft.insuranceId ? String(draft.insuranceId) : ""}
                options={[
                  { value: "", label: t("reports.filters.allCompanies") },
                  ...insuranceCompanies.map((company) => ({
                    value: String(company.id),
                    label: company.name,
                  })),
                ]}
                onChange={(value) =>
                  onDraftChange({
                    insuranceId: value ? Number.parseInt(value, 10) : null,
                  })
                }
              />
            ) : null}

            <SearchField
              id="reports-patient-search"
              label={t("reports.filters.searchPatient")}
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
            <ReportKpiStrip items={kpiItems} />
            <DataTable
              data={payload.data}
              columns={columns}
              loading={query.loading || query.refreshing}
              getRowId={(row) => row.patientId}
              onRowClick={(row) => setDetailPatientId(row.patientId)}
              sort={paging.sort}
              onSortToggle={(_columnId, next) => setPaging({ sort: next, page: 1 })}
              pagination={{
                page: payload.page,
                pageSize: payload.pageSize,
                total: payload.total,
                onPageChange: (page) => setPaging({ page }),
                onPageSizeChange: (pageSize) => setPaging({ page: 1, pageSize }),
              }}
              emptyTitle={t("reports.emptyState.noPatientsFound")}
              emptyDescription={t("reports.emptyState.noPatientsDescription")}
              ariaLabel={t("reports.tabs.patientReports")}
            />
          </>
        )}
      </ReportShell>

      <PatientDetailDialog
        open={detailPatientId !== null}
        patientId={detailPatientId}
        range={range}
        onClose={() => setDetailPatientId(null)}
        canExport={canExport}
        onPrintPatient={async (detail) => printDetail(detail)}
        onPrintAdmission={handlePrintAdmission}
      />
    </>
  )
}
