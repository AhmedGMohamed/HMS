"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  CalendarIcon,
  CircleDollarSignIcon,
  MoreHorizontalIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDate, formatDateTime } from "@/lib/utils"
import { PaymentStatusBadge } from "@/pages/Employees/components/EmployeeDisplay"
import {
  useEmployeeLocale,
  usePaymentAmount,
} from "@/pages/Employees/hooks/useEmployeeDisplay"
import type { EmployeePayment } from "@/pages/Employees/types/employee"

export interface PaymentGroup {
  employeeId: number
  payments: EmployeePayment[]
}

export interface DateRange {
  /** ISO date strings (`yyyy-mm-dd`) — "" = open ended. */
  from: string
  to: string
}

export interface PaymentsTableProps {
  groups: PaymentGroup[]
  employeeNames: Map<number, string>
  loading: boolean
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  onMarkPaid: (payment: EmployeePayment) => void
  onVoid: (payment: EmployeePayment) => void
  onMarkAllPaid: (employeeId: number) => void
  onVoidAll: (employeeId: number) => void
}

function issuedTime(payment: EmployeePayment): number {
  return new Date(payment.issuedTimestamp).getTime()
}

/**
 * Payments work queue (Phase 6.7 UX package) — pending
 * system-generated payments grouped by employee, oldest first.
 * Replaces the legacy flat "Pending Payments" table: Popover date
 * range instead of raw date inputs, tabular-nums totals, status
 * badges, and bulk actions grouped in a dropdown menu.
 */
export function PaymentsTable({
  groups,
  employeeNames,
  loading,
  dateRange,
  onDateRangeChange,
  onMarkPaid,
  onVoid,
  onMarkAllPaid,
  onVoidAll,
}: PaymentsTableProps) {
  const { t } = useTranslation()
  const locale = useEmployeeLocale()
  const paymentAmount = usePaymentAmount()
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(
    new Set()
  )

  const toggleExpanded = (id: string | number, expanded: boolean) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev)
      if (expanded) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const columns: ColumnDef<PaymentGroup>[] = [
    {
      id: "employeeName",
      header: t("employees.table.employeeName"),
      cell: (group) => (
        <span className="font-medium">
          {employeeNames.get(group.employeeId) ?? `#${group.employeeId}`}
        </span>
      ),
    },
    {
      id: "totalAmount",
      header: t("employees.table.totalAmount"),
      align: "end",
      cell: (group) => {
        const total = group.payments.reduce(
          (sum, p) => sum + Number(p.paymentAmount) + Number(p.extraAmount || 0),
          0
        )
        return (
          <span className="font-medium tabular-nums">
            {new Intl.NumberFormat(locale, {
              style: "currency",
              currency: "EGP",
            }).format(total)}
          </span>
        )
      },
    },
    {
      id: "type",
      header: t("employees.table.type"),
      cell: (group) => {
        const first = group.payments[0]
        return first?.extraPaymentType && first.extraPaymentType !== "none"
          ? t(`employees.paymentTypes.${first.extraPaymentType}`)
          : t("employees.paymentTypes.none")
      },
    },
    {
      id: "dateRange",
      header: t("employees.table.dateRange"),
      cell: (group) => {
        const times = group.payments.map(issuedTime)
        const min = new Date(Math.min(...times))
        const max = new Date(Math.max(...times))
        return (
          <span className="tabular-nums text-sm">
            {formatDate(min, locale)} – {formatDate(max, locale)}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      align: "end",
      className: "w-16",
      cell: (group) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.actions")}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontalIcon aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onMarkAllPaid(group.employeeId)
              }}
            >
              <CircleDollarSignIcon aria-hidden className="me-2 size-4" />
              {t("employees.buttons.markAllPaid")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                onVoidAll(group.employeeId)
              }}
            >
              <XCircleIcon aria-hidden className="me-2 size-4" />
              {t("employees.buttons.voidAll")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const dateFilterActive = dateRange.from !== "" || dateRange.to !== ""

  /* Stable ids for expansion state. */
  const rows = useMemo(
    () => groups.map((group) => ({ ...group, key: String(group.employeeId) })),
    [groups]
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <CalendarIcon aria-hidden className="me-2 size-4" />
              {t("employees.filterPaymentsByDate")}
              {dateFilterActive ? (
                <Badge variant="secondary" className="ms-2 h-4 px-1.5 text-[10px]">
                  1
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="payments-date-from"
                  className="text-xs text-muted-foreground"
                >
                  {t("common.startDate")}
                </label>
                <Input
                  id="payments-date-from"
                  type="date"
                  value={dateRange.from}
                  onChange={(e) =>
                    onDateRangeChange({ ...dateRange, from: e.currentTarget.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="payments-date-to"
                  className="text-xs text-muted-foreground"
                >
                  {t("common.endDate")}
                </label>
                <Input
                  id="payments-date-to"
                  type="date"
                  value={dateRange.to}
                  onChange={(e) =>
                    onDateRangeChange({ ...dateRange, to: e.currentTarget.value })
                  }
                />
              </div>
              {dateFilterActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDateRangeChange({ from: "", to: "" })}
                >
                  <XIcon aria-hidden className="me-1.5 size-4" />
                  {t("common.clear")}
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
        <p className="text-sm text-muted-foreground">
          {t("employees.messages.pendingPaymentsCount", {
            count: groups.reduce((sum, g) => sum + g.payments.length, 0),
          })}
        </p>
      </div>

      <DataTable<PaymentGroup>
        data={rows}
        columns={columns}
        loading={loading}
        getRowId={(row) => row.key}
        expandedRowIds={expandedRowIds}
        onExpandedChange={toggleExpanded}
        isRowExpandable={() => true}
        renderExpanded={(group) => (
          <div className="flex flex-col gap-2 p-2">
            {group.payments.map((payment) => {
              const { total, breakdown } = paymentAmount(payment)
              return (
                <div
                  key={payment.paymentId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      #{payment.paymentId}
                    </span>
                    <span className="font-medium tabular-nums">{total}</span>
                    <span className="text-xs text-muted-foreground">
                      {breakdown}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(new Date(payment.issuedTimestamp), locale)}
                    </span>
                    <PaymentStatusBadge payment={payment} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!payment.isPaid && !payment.isVoid ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onMarkPaid(payment)}
                      >
                        {t("employees.buttons.markPaid")}
                      </Button>
                    ) : null}
                    {!payment.isVoid ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => onVoid(payment)}
                      >
                        {t("employees.buttons.void")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        emptyTitle={t("employees.messages.noPendingPayments")}
        ariaLabel={t("employees.tabs.payments")}
      />
    </div>
  )
}

