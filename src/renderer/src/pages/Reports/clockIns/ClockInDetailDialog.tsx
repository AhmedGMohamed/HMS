"use client"

/**
 * One employee's clock-in detail — Phase 6.11.6.
 *
 * The list shows one row per employee; the sessions behind the numbers only
 * exist on the detail endpoint, so this dialog fetches its own page instead of
 * carrying them in the list payload.
 *
 * ## What the dialog is careful to say
 *
 *   - **Missing days are synthesized.** They have no clock-in row, no hours and
 *     no deduction; the alert above the table says where they come from
 *     (`max(range start, hire date)` → `min(range end, today)`) so an absence is
 *     never read as a zero-hour shift. They are only produced for employees who
 *     are **active and expected to clock in** — a salaried doctor who does not
 *     clock in has no absences, and the identity card says so.
 *   - **The summary describes the whole range.** Switching the status filter
 *     narrows the table, never the KPI strip: `attendance_summary` is computed
 *     before the filter (the server returns it regardless of `status`).
 *   - **Days are not sessions.** `Total days` counts distinct dates; two
 *     sessions on one day are one row each in the table but one day in the
 *     summary.
 *
 * Requests are keyed by employee + range + status + page, so a page click keeps
 * the previous page visible (`refreshing`) instead of unmounting the table.
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertCircleIcon,
  CalendarOffIcon,
  ClipboardListIcon,
  UserRoundIcon,
} from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
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
import { formatDate, resolveLocale } from "@/lib/utils"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { SelectField } from "@/pages/Reports/components/SelectField"
import {
  AttendanceStatusBadge,
  EmployeeTypeBadge,
} from "@/pages/Reports/components/StatusBadges"
import { useClockInEmployee } from "@/pages/Reports/hooks/useClockInEmployee"
import {
  CLOCK_IN_STATUS_FILTERS,
  type ClockInDetailPaging,
  type ClockInPatientRow,
  type ClockInQueryFilters,
  type ClockInRecordRow,
  type ClockInStatusFilter,
} from "@/pages/Reports/types/clockInReport"
import type { ReportRange } from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface ClockInDetailDialogProps {
  open: boolean
  employeeId: number | null
  /** Generated range (never the draft). */
  range: ReportRange
  onClose: () => void
}

/**
 * `pageSize` must be one of the server's allowed sizes (10 / 25 / 50 / 100) —
 * `parsePaging` rejects anything else with a 400, which is exactly how the
 * dialog used to fail on open.
 */
const INITIAL_PAGING: ClockInDetailPaging = { page: 1, pageSize: 10 }

interface PagingState {
  /** Report identity the value belongs to. */
  key: string | null
  value: ClockInDetailPaging
}

/** `08:00:00` → `08:00` (Postgres `TIME` carries seconds we never display). */
function shortTime(value: string | null): string {
  if (!value) return "—"
  return value.slice(0, 5)
}

/** `2026-10-01 08:00:00` → `08:00`; the date has its own column. */
function clockTime(value: string | null): string {
  if (!value) return "—"
  const time = value.includes("T")
    ? value.slice(value.indexOf("T") + 1)
    : value.slice(value.indexOf(" ") + 1)
  return time ? time.slice(0, 5) : "—"
}

/* ------------------------------------------------------------------ */
/* Patient assignments behind one record                               */
/* ------------------------------------------------------------------ */

function RecordPatients({ patients }: { patients: ClockInPatientRow[] }) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = resolveLocale(language)

  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const date = (value: string | null) =>
    value ? formatDate(new Date(value), language) : "—"

  const columns: ColumnDef<ClockInPatientRow>[] = [
    {
      id: "patient",
      header: t("reports.table.patientName"),
      width: "w-48",
      cell: (row) => (
        <span
          className="block w-44 truncate font-medium"
          dir="auto"
          title={row.patientName}
        >
          {row.patientName}
        </span>
      ),
    },
    {
      id: "paymentType",
      header: t("reports.table.paymentType"),
      width: "w-28",
      cell: (row) => (
        <span className="whitespace-nowrap">
          {t(`reports.paymentTypes.${row.paymentType}`, {
            defaultValue: row.paymentType,
          })}
        </span>
      ),
    },
    {
      id: "diagnosis",
      header: t("reports.table.diagnosis"),
      width: "w-40",
      cell: (row) => (
        <span
          className="block w-32 truncate"
          dir="auto"
          title={row.diagnosis ?? undefined}
        >
          {row.diagnosis || "—"}
        </span>
      ),
    },
    {
      id: "hours",
      header: t("reports.table.hoursWorked"),
      numeric: true,
      width: "w-24",
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {number(row.hoursWorked)}
        </span>
      ),
    },
    {
      id: "admission",
      header: t("reports.table.lastAdmission"),
      width: "w-36",
      cell: (row) => (
        <span className="whitespace-nowrap">{date(row.admissionTime)}</span>
      ),
    },
    {
      id: "discharge",
      header: t("reports.table.lastDischarge"),
      width: "w-36",
      cell: (row) => (
        <span className="whitespace-nowrap">{date(row.dischargeTime)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-2 py-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("reports.clockInReports.detail.patients")}
      </p>
      <DataTable
        data={patients}
        columns={columns}
        getRowId={(row) => row.patientId}
        ariaLabel={t("reports.clockInReports.detail.patients")}
        emptyTitle={t("reports.clockInReports.detail.noPatients")}
        emptyDescription={t("reports.clockInReports.detail.noPatients")}
        density="compact"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function ClockInDetailDialog({
  open,
  employeeId,
  range,
  onClose,
}: ClockInDetailDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = resolveLocale(language)

  const count = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
  const hours = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 2,
    }).format(value)
  const percent = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(value / 100)
  const date = (value: string | null) =>
    value ? formatDate(new Date(`${value.slice(0, 10)}T00:00:00`), language) : "—"

  const scopeKey = [employeeId ?? "", range.from, range.to].join("|")

  /* ---------------------------------------------------------------- */
  /* Paging + status (per employee/period)                             */
  /* ---------------------------------------------------------------- */

  const [pagingState, setPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PAGING,
  })
  const paging = pagingState.key === scopeKey ? pagingState.value : INITIAL_PAGING

  const setPaging = (patch: Partial<ClockInDetailPaging>) => {
    setPagingState({ key: scopeKey, value: { ...paging, ...patch } })
  }

  const [statusState, setStatusState] = useState<{
    key: string | null
    value: ClockInStatusFilter
  }>({ key: null, value: "all" })
  const status =
    statusState.key === scopeKey ? statusState.value : ("all" as const)

  const setStatus = (next: ClockInStatusFilter) => {
    setStatusState({ key: scopeKey, value: next })
    // A different status is a different document; page 1 is the only page that
    // can be guaranteed to exist.
    setPagingState({ key: scopeKey, value: { ...paging, page: 1 } })
  }

  /** Expanded record rows; cleared whenever the employee/period changes. */
  const [expanded, setExpanded] = useState<{
    key: string
    ids: Set<string>
  }>({ key: scopeKey, ids: new Set() })
  const expandedIds = expanded.key === scopeKey ? expanded.ids : new Set<string>()

  const toggleExpanded = (id: string, next: boolean) => {
    const ids = new Set(expandedIds)
    if (next) ids.add(id)
    else ids.delete(id)
    setExpanded({ key: scopeKey, ids })
  }

  /* ---------------------------------------------------------------- */
  /* Query                                                             */
  /* ---------------------------------------------------------------- */

  const filters: ClockInQueryFilters | null =
    employeeId === null
      ? null
      : {
          range,
          employeeType: "all",
          employeeId,
          search: "",
        }

  const query = useClockInEmployee({
    employeeId,
    filters,
    status,
    paging,
    enabled: open,
  })

  const payload = query.payload
  const employee = payload?.employee ?? null
  const attendance = payload?.attendanceSummary ?? null

  const handleClose = () => {
    // The next open starts from a clean slate: no expanded rows, page 1, every
    // status. Done in the event handler (not an effect) so no state is set
    // during render.
    setExpanded({ key: "", ids: new Set() })
    setPagingState({ key: null, value: INITIAL_PAGING })
    setStatusState({ key: null, value: "all" })
    onClose()
  }

  const period = t("reports.state.range", {
    from: formatDate(new Date(`${range.from}T00:00:00`), language),
    to: formatDate(new Date(`${range.to}T00:00:00`), language),
  })

  /* ---------------------------------------------------------------- */
  /* KPI strip — the whole range, never the filtered page              */
  /* ---------------------------------------------------------------- */

  const kpiItems = attendance
    ? [
        {
          key: "totalDays",
          label: t("reports.clockInReports.detail.totalDays"),
          value: count(attendance.totalDays),
        },
        {
          key: "workedDays",
          label: t("reports.clockInReports.detail.workedDays"),
          value: count(attendance.workedDays),
        },
        {
          key: "onTime",
          label: t("reports.enums.attendance.on_time"),
          value: count(attendance.onTimeDays),
        },
        {
          key: "late",
          label: t("reports.enums.attendance.late"),
          value: count(attendance.lateDays),
          tone: attendance.lateDays > 0 ? ("warning" as const) : ("neutral" as const),
        },
        {
          key: "early",
          label: t("reports.enums.attendance.early"),
          value: count(attendance.earlyDays),
        },
        {
          key: "incomplete",
          label: t("reports.enums.attendance.incomplete"),
          value: count(attendance.incompleteDays),
          tone:
            attendance.incompleteDays > 0
              ? ("warning" as const)
              : ("neutral" as const),
        },
        {
          key: "missing",
          label: t("reports.enums.attendance.missing"),
          value: count(attendance.missingDays),
          tone:
            attendance.missingDays > 0
              ? ("danger" as const)
              : ("neutral" as const),
        },
        {
          key: "punctuality",
          label: t("reports.clockInReports.detail.punctuality"),
          value: percent(attendance.punctualityRate),
          tone: "primary" as const,
        },
      ]
    : []

  /* ---------------------------------------------------------------- */
  /* Records table                                                     */
  /* ---------------------------------------------------------------- */

  const recordColumns: ColumnDef<ClockInRecordRow>[] = [
    {
      id: "date",
      header: t("reports.table.serviceDate"),
      width: "w-32",
      cell: (row) => (
        <span className="whitespace-nowrap font-medium">{date(row.date)}</span>
      ),
    },
    {
      id: "clockIn",
      header: t("reports.table.clockIn"),
      width: "w-24",
      cell: (row) =>
        row.isMissing ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums" dir="ltr">
            {clockTime(row.clockIn)}
          </span>
        ),
    },
    {
      id: "clockOut",
      header: t("reports.table.clockOut"),
      width: "w-24",
      cell: (row) =>
        row.isMissing || !row.clockOut ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums" dir="ltr">
            {clockTime(row.clockOut)}
          </span>
        ),
    },
    {
      id: "hours",
      header: t("reports.table.hoursWorked"),
      numeric: true,
      width: "w-24",
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {hours(row.hoursWorked)}
        </span>
      ),
    },
    {
      id: "lateMinutes",
      header: t("reports.clockInReports.detail.lateMinutes"),
      numeric: true,
      width: "w-24",
      cell: (row) =>
        row.lateMinutes > 0 ? (
          <span className="tabular-nums font-medium text-warning" dir="ltr">
            {count(row.lateMinutes)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "earlyMinutes",
      header: t("reports.clockInReports.detail.earlyMinutes"),
      numeric: true,
      width: "w-24",
      cell: (row) =>
        row.earlyMinutes > 0 ? (
          <span className="tabular-nums" dir="ltr">
            {count(row.earlyMinutes)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "deduction",
      header: t("reports.table.deduction"),
      numeric: true,
      width: "w-28",
      cell: (row) =>
        row.payDeduction > 0 ? (
          <span className="tabular-nums font-medium text-warning" dir="ltr">
            {money(row.payDeduction)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: t("reports.table.status"),
      width: "w-28",
      cell: (row) => <AttendanceStatusBadge value={row.status} />,
    },
    {
      id: "patients",
      header: t("reports.table.patientCount"),
      numeric: true,
      width: "w-24",
      cell: (row) =>
        row.patientCount > 0 ? (
          <span className="tabular-nums">{count(row.patientCount)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ]

  const showSkeleton = query.loading && payload === undefined

  const shiftLabel = employee
    ? employee.shiftType
      ? `${t(`reports.enums.shiftType.${employee.shiftType}`, {
          defaultValue: employee.shiftType,
        })} · ${shortTime(employee.shiftStartTime)} – ${shortTime(
          employee.shiftEndTime
        )}`
      : employee.shiftStartTime || employee.shiftEndTime
        ? `${shortTime(employee.shiftStartTime)} – ${shortTime(
            employee.shiftEndTime
          )}`
        : t("reports.clockInReports.detail.noShift")
    : ""

  const identityItems: Array<{ label: string; value: React.ReactNode }> = employee
    ? [
        {
          label: t("reports.table.hireDate"),
          value: date(employee.hireDate),
        },
        { label: t("reports.table.shift"), value: shiftLabel },
        {
          label: t("reports.clockInReports.detail.clockInRequirement"),
          value: employee.needClockIn
            ? t("reports.clockInReports.detail.required")
            : t("reports.clockInReports.detail.notRequired"),
        },
        {
          label: t("reports.clockInReports.detail.employmentStatus"),
          value: employee.isActive
            ? t("reports.clockInReports.detail.active")
            : t("reports.clockInReports.detail.inactive"),
        },
      ]
    : []

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {employee
              ? employee.employeeName
              : t("reports.clockInReports.title")}
          </DialogTitle>
          <DialogDescription>{period}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto pe-1">
          {employee ? (
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <UserRoundIcon aria-hidden className="size-4 text-primary" />
                    {employee.employeeName}
                  </span>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    #{employee.employeeId}
                  </span>
                  <EmployeeTypeBadge value={employee.employeeType} />
                  {!employee.isActive ? (
                    <span className="text-xs font-medium text-destructive">
                      {t("reports.clockInReports.detail.inactive")}
                    </span>
                  ) : null}
                </div>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {identityItems.map((item) => (
                    <div key={item.label} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">
                        {item.label}
                      </dt>
                      <dd className="text-sm font-medium text-foreground">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
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

              {payload && attendance ? (
                <>
                  <ReportKpiStrip
                    items={kpiItems}
                    className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4"
                  />

                  {attendance.missingDays > 0 ? (
                    <Alert>
                      <CalendarOffIcon aria-hidden />
                      <AlertDescription>
                        {t("reports.clockInReports.detail.missingNote", {
                          count: attendance.missingDays,
                        })}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <section className="space-y-2">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <ClipboardListIcon
                            aria-hidden
                            className="size-4 text-primary"
                          />
                          {t("reports.clockInReports.detail.records")}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {t("reports.clockInReports.detail.recordsCaption")}
                        </p>
                      </div>

                      <div className="w-44">
                        <SelectField
                          id="reports-clock-in-status"
                          label={t("reports.clockInReports.detail.statusFilter")}
                          value={status}
                          options={CLOCK_IN_STATUS_FILTERS.map((value) => ({
                            value,
                            label:
                              value === "all"
                                ? t("reports.clockInReports.detail.allStatuses")
                                : t(`reports.enums.attendance.${value}`),
                          }))}
                          onChange={(value) =>
                            setStatus(value as ClockInStatusFilter)
                          }
                        />
                      </div>
                    </div>

                    <DataTable
                      data={payload.records}
                      columns={recordColumns}
                      loading={query.loading || query.refreshing}
                      getRowId={(row) =>
                        row.clockId === null
                          ? `missing-${row.date}`
                          : `clock-${row.clockId}`
                      }
                      expandedRowIds={expandedIds}
                      onExpandedChange={(id, next) =>
                        toggleExpanded(String(id), next)
                      }
                      isRowExpandable={(row) => row.patientCount > 0}
                      renderExpanded={(row) => (
                        <RecordPatients patients={row.patients} />
                      )}
                      pagination={{
                        page: payload.page,
                        pageSize: payload.pageSize,
                        total: payload.total,
                        onPageChange: (page) => setPaging({ page }),
                        onPageSizeChange: (pageSize) =>
                          setPaging({ page: 1, pageSize }),
                      }}
                      emptyTitle={t("reports.clockInReports.detail.noRecords")}
                      emptyDescription={
                        status === "all"
                          ? t("reports.clockInReports.detail.noRecordsDescription")
                          : t(
                              "reports.clockInReports.detail.noRecordsForStatus"
                            )
                      }
                      ariaLabel={t("reports.clockInReports.detail.records")}
                      density="compact"
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
