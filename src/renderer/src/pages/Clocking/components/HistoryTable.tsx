"use client"

import { useTranslation } from "react-i18next"
import { PencilIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DataTable,
  DataTablePaginationSlot,
  type ColumnDef,
  type DataTableSearch,
} from "@/components/common/DataTable"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { EmployeeCell } from "@/pages/Clocking/components/EmployeeCell"
import { LiveDuration } from "@/pages/Clocking/components/LiveDuration"
import type { ClockIn, EligibleEmployee } from "@/pages/Clocking/types/clocking"

interface HistoryTableProps {
  /** Already filtered (search + range), sorted, and paged by the page. */
  rows: ClockIn[]
  loading?: boolean
  now: Date
  employeeMap: Map<number, EligibleEmployee>
  locale: string
  sort: { columnId: string; direction: "asc" | "desc" } | null
  onSortToggle: (
    id: string,
    next: { columnId: string; direction: "asc" | "desc" },
  ) => void
  pagination: DataTablePaginationSlot
  /** Rendered in the DataTable toolbar slot (left of search). */
  toolbar?: React.ReactNode
  search?: DataTableSearch
  onEdit: (row: ClockIn) => void
  onDelete: (row: ClockIn) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

/**
 * History table (§B6 of `phase_6.8_ux_research.md`).
 *
 * Columns: Employee · Clock-In · Clock-Out · Duration (static) ·
 * Pay Deduction · Actions (edit / delete, `w-20`). Default sort
 * `clockIn` descending, client pagination 10/25/50/100 (default 25)
 * — both owned by the page.
 *
 * Pay deduction is deliberately low-emphasis: always visible,
 * `tabular-nums`, `text-muted-foreground` (#475569 ≈7.5:1), zero
 * renders as "—" — supervisors auditing payroll need it in the
 * periphery, never color-coded or hover-gated.
 */
export function HistoryTable({
  rows,
  loading = false,
  now,
  employeeMap,
  locale,
  sort,
  onSortToggle,
  pagination,
  toolbar,
  search,
  onEdit,
  onDelete,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: HistoryTableProps) {
  const { t } = useTranslation()

  const columns: ColumnDef<ClockIn>[] = [
    {
      id: "employee",
      header: t("clocking.table.employeeName"),
      sortable: true,
      sortKey: (row) =>
        employeeMap.get(row.employeeId)?.name ?? "",
      cell: (row) => (
        <EmployeeCell
          name={employeeMap.get(row.employeeId)?.name}
          employeeType={employeeMap.get(row.employeeId)?.employeeType}
        />
      ),
    },
    {
      id: "clockIn",
      header: t("clocking.table.clockInTime"),
      sortable: true,
      sortKey: (row) => new Date(row.clockIn).getTime(),
      className: "tabular-nums",
      cell: (row) => formatDateTime(new Date(row.clockIn), locale),
    },
    {
      id: "clockOut",
      header: t("clocking.table.clockOutTime"),
      sortable: true,
      sortKey: (row) => (row.clockOut ? new Date(row.clockOut).getTime() : 0),
      className: "tabular-nums",
      cell: (row) =>
        row.clockOut ? (
          formatDateTime(new Date(row.clockOut), locale)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "duration",
      header: t("clocking.table.duration"),
      sortable: true,
      sortKey: (row) => {
        const end = row.clockOut ? new Date(row.clockOut).getTime() : now.getTime()
        return end - new Date(row.clockIn).getTime()
      },
      cell: (row) => (
        <LiveDuration
          clockIn={row.clockIn}
          clockOut={row.clockOut}
          now={now}
          className="text-muted-foreground"
        />
      ),
    },
    {
      id: "payDeduction",
      header: t("clocking.table.payDeduction"),
      numeric: true,
      sortable: true,
      sortKey: (row) => row.payDeduction,
      className: "text-muted-foreground",
      cell: (row) =>
        row.payDeduction === 0 ? (
          "—"
        ) : (
          formatCurrency(row.payDeduction, locale)
        ),
    },
    {
      id: "actions",
      header: "",
      align: "end",
      className: "w-20",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.edit")}
            onClick={(e) => {
              e.stopPropagation()
              onEdit(row)
            }}
          >
            <PencilIcon aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.delete")}
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(row)
            }}
          >
            <Trash2Icon aria-hidden className="size-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <DataTable<ClockIn>
      data={rows}
      columns={columns}
      loading={loading}
      getRowId={(row) => row.clockId}
      sort={sort}
      onSortToggle={onSortToggle}
      pagination={pagination}
      toolbar={toolbar}
      search={search}
      stickyHeader
      ariaLabel={t("clocking.table.historyCaption")}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
    />
  )
}
