"use client"

/**
 * One employee's payroll detail — Phase 6.11.5.
 *
 * The list shows one row per employee; the payments, the patient work behind
 * them and the clock-in deductions only exist on the detail endpoint, so this
 * dialog fetches its own page instead of carrying them in the list payload.
 *
 * ## What the dialog is careful to say
 *
 *   - **Deductions are a period total, once per employee.** The deductions
 *     table sits beside the payments table, never inside it, and the note above
 *     it says so — the legacy page subtracted the same clock-ins from every
 *     payment in a rolling 30-day window (plan D15).
 *   - **Paid/unpaid are gross.** The payment row's gross column is
 *     `payment_amount + extra_amount`; the summary's net is the only figure
 *     that subtracts deductions.
 *   - **The patient-work panel belongs to the payment.** Expanding a row asks
 *     for that payment's associations with no range, so work done outside the
 *     report window is still shown (it is part of the payment).
 *
 * Request identity is `<employee>|<from>|<to>`: reopening the same employee in
 * the same period is free, and a new period always starts on page 1.
 */

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircleIcon, UserRoundIcon } from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  AttendanceStatusBadge,
  EmployeeTypeBadge,
  PayrollPaymentTypeBadge,
} from "@/pages/Reports/components/StatusBadges"
import { getPaymentAssociations } from "@/pages/Reports/api"
import { useEmployeePaymentDetail } from "@/pages/Reports/hooks/useEmployeePaymentDetail"
import type {
  EmployeePaymentAssociationsPayload,
  EmployeePaymentDetailRow,
  EmployeePaymentQueryFilters,
  EmployeePaymentQueryPaging,
  PaymentAssociationRow,
  PeriodDeductionRow,
} from "@/pages/Reports/types/employeePaymentReport"
import type { ReportRange } from "@/pages/Reports/types/reports"
import { useUIStore } from "@/store/uiStore"

export interface EmployeePaymentDetailDialogProps {
  open: boolean
  employeeId: number | null
  /** Generated range (never the draft). */
  range: ReportRange
  onClose: () => void
}

const INITIAL_PAGING: EmployeePaymentQueryPaging = {
  page: 1,
  pageSize: 10,
  // The detail endpoint always returns newest first; there is no sort control.
  sort: null,
}

interface PagingState {
  /** Report identity the value belongs to. */
  key: string | null
  value: EmployeePaymentQueryPaging
}

/** `08:00:00` → `08:00` (Postgres `TIME` carries seconds we never display). */
function shortTime(value: string | null): string {
  if (!value) return "—"
  return value.slice(0, 5)
}

/* ------------------------------------------------------------------ */
/* Patient work behind one payment                                     */
/* ------------------------------------------------------------------ */

interface PaymentWorkPanelProps {
  employeeId: number
  paymentId: number
  cached: EmployeePaymentAssociationsPayload | undefined
  onLoaded: (payload: EmployeePaymentAssociationsPayload) => void
}

/**
 * The expansion of one payment row.
 *
 * A separate component because `DataTable` mounts `renderExpanded` only while
 * the row is open — which is exactly the lazy behaviour we want, and it keeps
 * the request out of the parent's render path.
 */
function PaymentWorkPanel({
  employeeId,
  paymentId,
  cached,
  onLoaded,
}: PaymentWorkPanelProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = resolveLocale(language)

  const [state, setState] = useState<{
    paymentId: number
    payload: EmployeePaymentAssociationsPayload | null
    error: boolean
  } | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (cached) return

    let cancelled = false
    getPaymentAssociations(employeeId, paymentId)
      .then((payload) => {
        if (cancelled) return
        onLoaded(payload)
        setState({ paymentId, payload, error: false })
      })
      .catch(() => {
        if (cancelled) return
        setState({ paymentId, payload: null, error: true })
      })

    return () => {
      cancelled = true
    }
    // `cached` is intentionally not a dependency: a cache hit skips the
    // request, and re-running on every parent render would defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, paymentId, nonce])

  const payload = cached ?? (state?.paymentId === paymentId ? state.payload : null)
  const failed = !payload && state?.paymentId === paymentId && state.error

  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 2,
    }).format(value)
  const date = (value: string | null) =>
    value ? formatDate(new Date(value), language) : "—"

  const columns: ColumnDef<PaymentAssociationRow>[] = [
    {
      id: "patient",
      header: t("reports.table.patientName"),
      width: "w-48",
      cell: (row) => (
        <span className="block w-44 truncate font-medium" dir="auto" title={row.patientName}>
          {row.patientName}
        </span>
      ),
    },
    {
      id: "workDate",
      header: t("reports.table.workDate"),
      width: "w-32",
      cell: (row) => (
        <span className="whitespace-nowrap">
          {formatDate(new Date(`${row.workDate}T00:00:00`), language)}
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
      id: "amount",
      header: t("reports.table.amount"),
      numeric: true,
      width: "w-32",
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {money(row.paymentAmount)}
        </span>
      ),
    },
    {
      id: "type",
      header: t("reports.table.type"),
      width: "w-40",
      cell: (row) => <PayrollPaymentTypeBadge value={row.paymentType} />,
    },
    {
      id: "admission",
      header: t("reports.table.lastAdmission"),
      width: "w-36",
      cell: (row) => <span className="whitespace-nowrap">{date(row.admissionTime)}</span>,
    },
    {
      id: "discharge",
      header: t("reports.table.lastDischarge"),
      width: "w-36",
      cell: (row) => <span className="whitespace-nowrap">{date(row.dischargeTime)}</span>,
    },
    {
      id: "diagnosis",
      header: t("reports.table.diagnosis"),
      width: "w-40",
      cell: (row) => (
        <span className="block w-32 truncate" dir="auto" title={row.diagnosis ?? undefined}>
          {row.diagnosis || "—"}
        </span>
      ),
    },
  ]

  if (failed) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{t("reports.state.detailError")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNonce((value) => value + 1)}
          >
            {t("reports.actions.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!payload) {
    return <Skeleton className="h-24 w-full" />
  }

  return (
    <div className="space-y-2 py-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("reports.payrollReports.detail.patientWork")}
      </p>
      <DataTable
        data={payload.associations}
        columns={columns}
        getRowId={(row) => row.paymentPatientId}
        ariaLabel={t("reports.payrollReports.detail.patientWork")}
        emptyTitle={t("reports.payrollReports.detail.noPatientWork")}
        emptyDescription={t("reports.payrollReports.detail.noPatientWorkDescription")}
        density="compact"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function EmployeePaymentDetailDialog({
  open,
  employeeId,
  range,
  onClose,
}: EmployeePaymentDetailDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = resolveLocale(language)

  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 2,
    }).format(value)
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const date = (value: string | null) =>
    value ? formatDate(new Date(value), language) : "—"
  const dateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(value))
      : "—"

  const scopeKey = [employeeId ?? "", range.from, range.to].join("|")

  const [pagingState, setPagingState] = useState<PagingState>({
    key: null,
    value: INITIAL_PAGING,
  })
  const paging = pagingState.key === scopeKey ? pagingState.value : INITIAL_PAGING

  const setPaging = (patch: Partial<EmployeePaymentQueryPaging>) => {
    setPagingState({ key: scopeKey, value: { ...paging, ...patch } })
  }

  /** Expanded payment rows; cleared whenever the employee/period changes. */
  const [expanded, setExpanded] = useState<{
    key: string
    ids: Set<number>
  }>({ key: scopeKey, ids: new Set() })
  const expandedIds = expanded.key === scopeKey ? expanded.ids : new Set<number>()

  const toggleExpanded = (paymentId: number, next: boolean) => {
    const ids = new Set(expandedIds)
    if (next) ids.add(paymentId)
    else ids.delete(paymentId)
    setExpanded({ key: scopeKey, ids })
  }

  /** Associations already fetched, so re-expanding a row is free. */
  const associations = useRef(
    new Map<number, EmployeePaymentAssociationsPayload>()
  )

  const filters: EmployeePaymentQueryFilters | null =
    employeeId === null
      ? null
      : {
          range,
          employeeType: "all",
          employeeId,
          search: "",
          grouping: "month",
        }

  const query = useEmployeePaymentDetail({
    employeeId,
    filters,
    paging,
    enabled: open,
  })

  const payload = query.payload
  const employee = payload?.employee ?? null
  const summary = payload?.summary ?? null
  const breakdown = payload?.breakdown ?? null

  const handleClose = () => {
    // The next open starts from a clean slate: no expanded rows, page 1. Done
    // in the event handler (not an effect) so no state is set during render.
    setExpanded({ key: "", ids: new Set() })
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
          key: "payments",
          label: t("reports.table.payments"),
          value: String(summary.totalPayments),
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
          tone: summary.totalDeductions > 0 ? ("warning" as const) : ("neutral" as const),
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
          value: money(summary.netPayment),
          tone: "primary" as const,
        },
      ]
    : []

  const paymentColumns: ColumnDef<EmployeePaymentDetailRow>[] = [
    {
      id: "paymentDate",
      header: t("reports.table.paymentDate"),
      width: "w-32",
      cell: (row) => (
        <span className="whitespace-nowrap">{date(row.paymentDate)}</span>
      ),
    },
    {
      id: "type",
      header: t("reports.table.type"),
      width: "w-32",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <PayrollPaymentTypeBadge value={row.paymentType} />
          {row.percentageScope ? (
            <span className="text-xs text-muted-foreground">
              {t(`reports.payrollReports.paymentTypes.${row.percentageScope}`, {
                defaultValue: row.percentageScope,
              })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "base",
      header: t("reports.table.base"),
      numeric: true,
      width: "w-32",
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {money(row.paymentAmount)}
        </span>
      ),
    },
    {
      id: "extra",
      header: t("reports.table.extra"),
      numeric: true,
      width: "w-32",
      cell: (row) => (
        <span
          className="tabular-nums"
          dir="ltr"
          title={row.extraPaymentType ?? undefined}
        >
          {money(row.extraAmount)}
        </span>
      ),
    },
    {
      id: "gross",
      header: t("reports.table.gross"),
      numeric: true,
      width: "w-32",
      cell: (row) => (
        <span className="tabular-nums font-semibold" dir="ltr">
          {money(row.paymentAmount + row.extraAmount)}
        </span>
      ),
    },
    {
      id: "status",
      header: t("reports.table.status"),
      width: "w-28",
      cell: (row) =>
        row.isPaid ? (
          <Badge
            variant="outline"
            className="border-success/40 bg-success-light font-medium text-success-dark"
          >
            {t("reports.payrollReports.paymentStatus.paid")}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-warning/40 bg-warning-light font-medium text-text-primary"
          >
            {t("reports.payrollReports.paymentStatus.pending")}
          </Badge>
        ),
    },
    {
      id: "paidOn",
      header: t("reports.table.paidOn"),
      width: "w-40",
      cell: (row) =>
        row.isPaid ? (
          <div className="flex flex-col">
            <span className="whitespace-nowrap text-xs">
              {date(row.paidTimestamp)}
            </span>
            {row.paidBy ? (
              <span className="truncate text-xs text-muted-foreground">
                {t("reports.paymentDetail.by")} {row.paidBy}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "patients",
      header: t("reports.table.patientCount"),
      numeric: true,
      width: "w-24",
      cell: (row) => <span className="tabular-nums">{row.patientCount}</span>,
    },
  ]

  const deductionColumns: ColumnDef<PeriodDeductionRow>[] = [
    {
      id: "clockIn",
      header: t("reports.table.clockIn"),
      width: "w-40",
      cell: (row) => (
        <span className="whitespace-nowrap">{dateTime(row.clockIn)}</span>
      ),
    },
    {
      id: "clockOut",
      header: t("reports.table.clockOut"),
      width: "w-40",
      cell: (row) => (
        <span className="whitespace-nowrap">
          {row.clockOut ? dateTime(row.clockOut) : "—"}
        </span>
      ),
    },
    {
      id: "hours",
      header: t("reports.table.hoursWorked"),
      numeric: true,
      width: "w-28",
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {number(row.hoursWorked)}
        </span>
      ),
    },
    {
      id: "deduction",
      header: t("reports.table.deduction"),
      numeric: true,
      width: "w-32",
      cell: (row) => (
        <span className="tabular-nums font-medium" dir="ltr">
          {money(row.payDeduction)}
        </span>
      ),
    },
    {
      id: "status",
      header: t("reports.table.status"),
      width: "w-32",
      cell: (row) => <AttendanceStatusBadge value={row.status} />,
    },
  ]

  const showSkeleton = query.loading && payload === undefined

  const configItems: Array<{ label: string; value: React.ReactNode }> = breakdown
    ? [
        { label: t("reports.paymentCard.basePay"), value: money(breakdown.basePay) },
        {
          label: t("reports.paymentCard.baseExtraAmount"),
          value:
            breakdown.baseExtraPaymentType !== null
              ? `${money(breakdown.baseExtraAmount)} · ${t(
                  `reports.payrollReports.paymentTypes.${breakdown.baseExtraPaymentType}`,
                  { defaultValue: breakdown.baseExtraPaymentType }
                )}`
              : money(breakdown.baseExtraAmount),
        },
        {
          label: t("reports.paymentCard.perPatientType"),
          value: breakdown.perPatientPaymentType
            ? t(
                `reports.payrollReports.paymentTypes.${breakdown.perPatientPaymentType}`,
                { defaultValue: breakdown.perPatientPaymentType }
              )
            : "—",
        },
        {
          label: t("reports.paymentCard.percentageScope"),
          value: breakdown.percentageScope
            ? t(
                `reports.payrollReports.paymentTypes.${breakdown.percentageScope}`,
                { defaultValue: breakdown.percentageScope }
              )
            : "—",
        },
        {
          label: t("reports.paymentCard.shift"),
          value:
            breakdown.shiftStartTime || breakdown.shiftEndTime
              ? `${shortTime(breakdown.shiftStartTime)} – ${shortTime(
                  breakdown.shiftEndTime
                )}`
              : t("reports.payrollReports.detail.noShift"),
        },
        {
          label: t("reports.payrollReports.detail.needClockIn"),
          value: breakdown.needClockIn
            ? t("reports.payrollReports.detail.yes")
            : t("reports.payrollReports.detail.no"),
        },
        {
          label: t("reports.payrollReports.detail.workDays"),
          value: String(breakdown.totalWorkDays),
        },
        {
          label: t("reports.payrollReports.detail.patientsServed"),
          value: String(breakdown.totalPatientsServed),
        },
      ]
    : []

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {employee ? employee.employeeName : t("reports.employeePayments.title")}
          </DialogTitle>
          <DialogDescription>{period}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto pe-1">
          {employee ? (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <UserRoundIcon aria-hidden className="size-4 text-primary" />
                  {employee.employeeName}
                </span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  #{employee.employeeId}
                </span>
                <EmployeeTypeBadge value={employee.employeeType} />
                {employee.hireDate ? (
                  <span className="text-xs text-muted-foreground">
                    {t("reports.table.hireDate")}: {date(employee.hireDate)}
                  </span>
                ) : null}
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
                  {configItems.length > 0 ? (
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="mb-3 text-sm font-medium text-foreground">
                          {t("reports.paymentCard.configuration")}
                        </h3>
                        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {configItems.map((item) => (
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

                  <ReportKpiStrip
                    items={kpiItems}
                    className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4"
                  />

                  <section className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {t("reports.payrollReports.detail.payments")}
                    </h3>
                    <DataTable
                      data={payload.payments}
                      columns={paymentColumns}
                      loading={query.loading || query.refreshing}
                      getRowId={(row) => row.paymentId}
                      expandedRowIds={expandedIds}
                      onExpandedChange={(id, next) =>
                        toggleExpanded(Number(id), next)
                      }
                      renderExpanded={(row) => (
                        <PaymentWorkPanel
                          employeeId={payload.employee.employeeId}
                          paymentId={row.paymentId}
                          cached={associations.current.get(row.paymentId)}
                          onLoaded={(result) =>
                            associations.current.set(row.paymentId, result)
                          }
                        />
                      )}
                      pagination={{
                        page: payload.page,
                        pageSize: payload.pageSize,
                        total: payload.total,
                        onPageChange: (page) => setPaging({ page }),
                        onPageSizeChange: (pageSize) =>
                          setPaging({ page: 1, pageSize }),
                      }}
                      emptyTitle={t("reports.payrollReports.detail.noPayments")}
                      emptyDescription={t(
                        "reports.payrollReports.detail.noPaymentsDescription"
                      )}
                      ariaLabel={t("reports.payrollReports.detail.payments")}
                    />
                  </section>

                  <section className="space-y-2">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-medium text-foreground">
                        {t("reports.paymentDetail.clockInDeductions")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("reports.payrollReports.detail.deductionNote")}
                      </p>
                    </div>
                    <DataTable
                      data={payload.periodDeductions}
                      columns={deductionColumns}
                      getRowId={(row) => row.clockId}
                      emptyTitle={t("reports.payrollReports.detail.noDeductions")}
                      emptyDescription={t(
                        "reports.payrollReports.detail.noDeductionsDescription"
                      )}
                      ariaLabel={t("reports.paymentDetail.clockInDeductions")}
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
