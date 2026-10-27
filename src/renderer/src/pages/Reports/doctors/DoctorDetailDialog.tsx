"use client"

/**
 * One doctor's patients, in a dialog — Phase 6.11.2.
 *
 * All-report mode shows one row per doctor; the numbers behind a row (which
 * patients, their admissions, last stay, diagnosis) only exist on the detail
 * endpoint, so this dialog fetches its own page instead of carrying every
 * patient in the list payload.
 *
 * Behaviour mirrors `PatientDetailDialog` (6.11.1):
 *   - request identity is `<doctor>|<from>|<to>|<relationship>|<search>`; the
 *     dialog keeps its payload for the same identity, so reopening the same
 *     doctor in the same period is free,
 *   - paging and sort are local and keyed by that identity, so a new doctor or
 *     a new search always starts on page 1 without a reset effect,
 *   - a row click hands the patient id to the tab, which opens the shared
 *     `PatientDetailDialog` for admission-level data (the drill-down must not
 *     be duplicated here).
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircleIcon, StethoscopeIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { SearchField } from "@/pages/Reports/components/SearchField"
import { DoctorTypeBadge } from "@/pages/Reports/components/StatusBadges"
import { DoctorPatientTable } from "@/pages/Reports/doctors/DoctorPatientTable"
import { DoctorTotalsBand } from "@/pages/Reports/doctors/DoctorTotalsBand"
import { useDoctorDetail } from "@/pages/Reports/hooks/useDoctorDetail"
import type {
  DoctorPatientRow,
  DoctorQueryFilters,
  DoctorQueryPaging,
} from "@/pages/Reports/types/doctorReport"
import type {
  DoctorRelationship,
  ReportRange,
} from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface DoctorDetailDialogProps {
  open: boolean
  doctorId: number | null
  /** Generated report type (never the draft). */
  relationship: DoctorRelationship
  /** Generated range (never the draft). */
  range: ReportRange
  onClose: () => void
  /** Opens the shared patient detail dialog for admission-level data. */
  onViewPatient: (patientId: number) => void
}

const INITIAL_PAGING: DoctorQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "name", direction: "asc" },
}

interface PagingState {
  /** Report identity the value belongs to. */
  key: string | null
  value: DoctorQueryPaging
}

export function DoctorDetailDialog({
  open,
  doctorId,
  relationship,
  range,
  onClose,
  onViewPatient,
}: DoctorDetailDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const money = (value: number) => formatCurrency(value, resolveLocale(language))

  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput, { delay: 300 })

  /**
   * Report identity: a new doctor, period, report type or search describes a
   * different population, so its paging must not leak into the next one.
   */
  const scopeKey = [
    doctorId ?? "",
    range.from,
    range.to,
    relationship,
    search.trim(),
  ].join("|")

  const [pagingState, setPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PAGING,
  })
  const paging = pagingState.key === scopeKey ? pagingState.value : INITIAL_PAGING

  const setPaging = (patch: Partial<DoctorQueryPaging>) => {
    setPagingState({ key: scopeKey, value: { ...paging, ...patch } })
  }

  const filters: DoctorQueryFilters | null =
    doctorId === null
      ? null
      : { range, relationship, doctorId, search }

  const query = useDoctorDetail({
    doctorId,
    filters,
    paging,
    enabled: open,
  })

  const payload = query.payload
  const summary = payload?.summary ?? null
  const doctor = payload?.doctor ?? null

  const handleClose = () => {
    // The next open starts from a clean slate: no stale search, page 1. Done
    // in the event handler (not an effect) so no state is set during render.
    setSearchInput("")
    setPagingState({ key: null, value: INITIAL_PAGING })
    onClose()
  }

  const period = t("reports.state.range", {
    from: formatDate(new Date(`${range.from}T00:00:00`), language),
    to: formatDate(new Date(`${range.to}T00:00:00`), language),
  })

  const kpiItems = summary
    ? [
        {
          key: "patients",
          label: t("reports.table.patients"),
          value: String(summary.patients),
        },
        {
          key: "admissions",
          label: t("reports.summary.admissions"),
          value: String(summary.admissions),
        },
        {
          key: "billed",
          label: t("reports.summary.totalBill"),
          value: money(summary.billed),
        },
        {
          key: "paid",
          label: t("reports.summary.totalPaid"),
          value: money(summary.paid),
        },
      ]
    : []

  const showSkeleton = query.loading && payload === undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {doctor ? doctor.doctorName : t("reports.doctorDetail.title")}
          </DialogTitle>
          <DialogDescription>{period}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto pe-1">
          {doctor ? (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <StethoscopeIcon aria-hidden className="size-4 text-primary" />
                  {doctor.doctorName}
                </span>
                <DoctorTypeBadge value={doctor.doctorType} />
                <span className="text-xs text-muted-foreground" dir="ltr">
                  #{doctor.doctorId}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`reports.enums.relationship.${relationship}`)}
                </span>
              </CardContent>
            </Card>
          ) : null}

          {showSkeleton ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <>
              {query.error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon aria-hidden />
                  <AlertDescription className="flex flex-wrap items-center gap-3">
                    <span>{t("reports.state.detailError")}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={query.reload}
                    >
                      {t("reports.actions.retry")}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {payload ? (
                <>
                  <ReportKpiStrip items={kpiItems} />

                  <SearchField
                    id="reports-doctor-detail-search"
                    label={t("reports.filters.searchPatient")}
                    placeholder={t("reports.detail.searchPlaceholder")}
                    value={searchInput}
                    onChange={setSearchInput}
                  />

                  <DoctorPatientTable
                    data={payload.data}
                    loading={query.loading || query.refreshing}
                    total={payload.total}
                    page={payload.page}
                    pageSize={payload.pageSize}
                    sort={paging.sort}
                    onSortToggle={(_columnId, next) =>
                      setPaging({ sort: next, page: 1 })
                    }
                    onPageChange={(page) => setPaging({ page })}
                    onPageSizeChange={(pageSize) =>
                      setPaging({ page: 1, pageSize })
                    }
                    onRowClick={(row: DoctorPatientRow) =>
                      onViewPatient(row.patientId)
                    }
                    ariaLabel={t("reports.doctorDetail.patients")}
                    emptyTitle={t("reports.emptyState.noPatientsForDoctor")}
                    emptyDescription={t(
                      "reports.emptyState.noPatientsDescription"
                    )}
                    footer={
                      summary ? (
                        <DoctorTotalsBand
                          label={t("reports.table.totals")}
                          patients={summary.patients}
                          admissions={summary.admissions}
                          billed={money(summary.billed)}
                          paid={money(summary.paid)}
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
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t("reports.actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
