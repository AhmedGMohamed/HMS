"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  CircleDollarSignIcon,
  MoreHorizontalIcon,
  XCircleIcon,
  XIcon,
  CalendarIcon,
} from "lucide-react"

import {
  DataTable,
  type ColumnDef,
  type DataTablePaginationSlot,
} from "@/components/common/DataTable"
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
import { formatDate } from "@/lib/utils"
import type { PendingPaymentGroup } from "@/pages/Employees/api"
import { PaymentGroupDetails } from "@/pages/Employees/components/PaymentGroupDetails"
import { useEmployeeLocale } from "@/pages/Employees/hooks/useEmployeeDisplay"
import type { EmployeePayment } from "@/pages/Employees/types/employee"

export interface DateRange {
  /** ISO date strings (`yyyy-mm-dd`) — "" = open ended. */
  from: string
  to: string
}

export interface PaymentsTableProps {
  /** One row per employee — aggregates only, no embedded payments. */
  groups: PendingPaymentGroup[]
  loading: boolean
  pagination: DataTablePaginationSlot
  search: { value: string; onChange: (value: string) => void; placeholder?: string }
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  sort: { columnId: string; direction: "asc" | "desc" } | null
  onSortToggle: (
    id: string,
    next: { columnId: string; direction: "asc" | "desc" }
  ) => void
  /** Pending payments across the whole filtered queue. */
  pendingCount: number
  /** Override the default "no pending payments" empty copy when filters hide everything. */
  emptyTitle?: string
  emptyDescription?: string
  onMarkPaid: (payment: EmployeePayment) => void
  onVoid: (payment: EmployeePayment) => void
  onMarkAllPaid: (employeeId: number) => void
  onVoidAll: (employeeId: number) => void
}

/**
 * Payments work queue (Phase 6.7 UX package) — pending
 * system-generated payments grouped by employee.
 *
 * The server sends one aggregate row per employee (count, oldest /
 * newest issue date, total); expanding a row mounts
 * `PaymentGroupDetails`, which fetches only that employee's payments
 * with the same date filter. Sorting and paging are server-side.
 */
export function PaymentsTable({
  groups,
  loading,
  pagination,
  search,
  dateRange,
  onDateRangeChange,
  sort,
  onSortToggle,
  pendingCount,
  emptyTitle,
  emptyDescription,
  onMarkPaid,
  onVoid,
  onMarkAllPaid,
  onVoidAll,
}: PaymentsTableProps) {
  const { t } = useTranslation()
  const locale = useEmployeeLocale()
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

  const columns: ColumnDef<PendingPaymentGroup>[] = [
    {
      id: "employeeName",
      header: t("employees.table.employeeName"),
      sortable: true,
      cell: (group) => (
        <span className="font-medium">{group.employeeName}</span>
      ),
    },
    {
      id: "totalAmount",
      header: t("employees.table.totalAmount"),
      align: "end",
      sortable: true,
      cell: (group) => (
        <span className="font-medium tabular-nums">
          {new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "EGP",
          }).format(Number(group.totalAmount))}
        </span>
      ),
    },
    {
      id: "paymentCount",
      header: t("employees.table.paymentCount"),
      align: "end",
      cell: (group) => (
        <span className="tabular-nums text-sm">{group.paymentCount}</span>
      ),
    },
    {
      id: "dateRange",
      header: t("employees.table.dateRange"),
      sortable: true,
      cell: (group) => (
        <span className="tabular-nums text-sm">
          {formatDate(new Date(group.oldestIssuedAt), locale)} –{" "}
          {formatDate(new Date(group.newestIssuedAt), locale)}
        </span>
      ),
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
          {t("employees.messages.pendingPaymentsCount", { count: pendingCount })}
        </p>
      </div>

      <DataTable<PendingPaymentGroup>
        data={groups}
        columns={columns}
        loading={loading}
        search={search}
        pagination={pagination}
        sort={sort}
        onSortToggle={onSortToggle}
        getRowId={(row) => row.employeeId}
        expandedRowIds={expandedRowIds}
        onExpandedChange={toggleExpanded}
        isRowExpandable={() => true}
        renderExpanded={(group) => (
          <PaymentGroupDetails
            employeeId={group.employeeId}
            from={dateRange.from}
            to={dateRange.to}
            onMarkPaid={onMarkPaid}
            onVoid={onVoid}
          />
        )}
        emptyTitle={emptyTitle ?? t("employees.messages.noPendingPayments")}
        emptyDescription={emptyDescription}
        ariaLabel={t("employees.tabs.payments")}
      />
    </div>
  )
}
