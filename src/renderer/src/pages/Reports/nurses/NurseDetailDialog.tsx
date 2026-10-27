"use client"

/**
 * One nurse's patients and daily assignments, in a dialog — Phase 6.11.3.
 *
 * All-report mode shows one row per nurse; the numbers behind a row (which
 * patients, which days, how many hours) only exist on the detail endpoint, so
 * this dialog fetches its own page instead of carrying every patient in the
 * list payload.
 *
 * Behaviour mirrors `DoctorDetailDialog` (6.11.2):
 *   - request identity is `<nurse>|<from>|<to>|<search>`; the dialog keeps its
 *     payload for the same identity, so reopening the same nurse in the same
 *     period is free,
 *   - paging and sort are local and keyed by that identity, so a new nurse or a
 *     new search always starts on page 1 without a reset effect,
 *   - the accordion follows the same patient search, so it never lists a
 *     patient the table above it does not,
 *   - a row click hands the patient id to the tab, which opens the shared
 *     `PatientDetailDialog` for admission-level data.
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircleIcon, UserRoundIcon } from "lucide-react"

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
import { formatDate, resolveLocale } from "@/lib/utils"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { SearchField } from "@/pages/Reports/components/SearchField"
import { DailyAssignmentAccordion } from "@/pages/Reports/nurses/DailyAssignmentAccordion"
import { NursePatientTable } from "@/pages/Reports/nurses/NursePatientTable"
import { NurseTotalsBand } from "@/pages/Reports/nurses/NurseTotalsBand"
import { useNurseDetail } from "@/pages/Reports/hooks/useNurseDetail"
import type {
  NursePatientRow,
  NurseQueryFilters,
  NurseQueryPaging,
} from "@/pages/Reports/types/nurseReport"
import type { ReportRange } from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface NurseDetailDialogProps {
  open: boolean
  nurseId: number | null
  /** Generated range (never the draft). */
  range: ReportRange
  onClose: () => void
  /** Opens the shared patient detail dialog for admission-level data. */
  onViewPatient: (patientId: number) => void
}

const INITIAL_PAGING: NurseQueryPaging = {
  page: 1,
  pageSize: 10,
  sort: { columnId: "name", direction: "asc" },
}

interface PagingState {
  /** Report identity the value belongs to. */
  key: string | null
  value: NurseQueryPaging
}

export function NurseDetailDialog({
  open,
  nurseId,
  range,
  onClose,
  onViewPatient,
}: NurseDetailDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = resolveLocale(language)
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)

  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput, { delay: 300 })

  /**
   * Report identity: a new nurse, period or search describes a different
   * population, so its paging must not leak into the next one.
   */
  const scopeKey = [nurseId ?? "", range.from, range.to, search.trim()].join("|")

  const [pagingState, setPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PAGING,
  })
  const paging = pagingState.key === scopeKey ? pagingState.value : INITIAL_PAGING

  const setPaging = (patch: Partial<NurseQueryPaging>) => {
    setPagingState({ key: scopeKey, value: { ...paging, ...patch } })
  }

  const filters: NurseQueryFilters | null =
    nurseId === null ? null : { range, nurseId, search }

  const query = useNurseDetail({
    nurseId,
    filters,
    paging,
    enabled: open,
  })

  const payload = query.payload
  const summary = payload?.summary ?? null
  const nurse = payload?.nurse ?? null

  const handleClose = () => {
    // The next open starts from a clean slate: no stale search, page 1. Done in
    // the event handler (not an effect) so no state is set during render.
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
          key: "days",
          label: t("reports.table.totalDays"),
          value: String(summary.days),
        },
        {
          key: "hours",
          label: t("reports.table.hours"),
          value: number(summary.hours),
        },
      ]
    : []

  const showSkeleton = query.loading && payload === undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {nurse ? nurse.nurseName : t("reports.nurseDetail.title")}
          </DialogTitle>
          <DialogDescription>{period}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto pe-1">
          {nurse ? (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <UserRoundIcon aria-hidden className="size-4 text-primary" />
                  {nurse.nurseName}
                </span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  #{nurse.nurseId}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("reports.enums.employeeType.nurse")}
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
                    id="reports-nurse-detail-search"
                    label={t("reports.filters.searchPatient")}
                    placeholder={t("reports.detail.searchPlaceholder")}
                    value={searchInput}
                    onChange={setSearchInput}
                  />

                  <NursePatientTable
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
                    onRowClick={(row: NursePatientRow) =>
                      onViewPatient(row.patientId)
                    }
                    ariaLabel={t("reports.nurseDetail.patients")}
                    emptyTitle={t("reports.emptyState.noPatientsForNurse")}
                    emptyDescription={t(
                      "reports.emptyState.noPatientsDescription"
                    )}
                    footer={
                      summary ? (
                        <NurseTotalsBand
                          label={t("reports.table.totals")}
                          patients={summary.patients}
                          days={summary.days}
                          hours={number(summary.hours)}
                          labels={{
                            patients: t("reports.table.patients"),
                            days: t("reports.table.totalDays"),
                            hours: t("reports.table.hours"),
                          }}
                        />
                      ) : undefined
                    }
                  />

                  <section className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {t("reports.nurseDetail.dailyAssignments")}
                    </h3>
                    <DailyAssignmentAccordion
                      days={payload.dailyAssignments}
                      emptyLabel={t("reports.nurseDetail.noAssignments")}
                    />
                  </section>
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
