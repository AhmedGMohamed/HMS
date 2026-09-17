"use client"

import { useTranslation } from "react-i18next"
import { LogOutIcon, PencilIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DataTable,
  type ColumnDef,
} from "@/components/common/DataTable"
import { formatDateTime } from "@/lib/utils"
import { AnomalyBadge } from "@/pages/Clocking/components/AnomalyBadge"
import { deriveAnomalies } from "@/pages/Clocking/components/anomaly"
import { EmployeeCell } from "@/pages/Clocking/components/EmployeeCell"
import { LiveDuration } from "@/pages/Clocking/components/LiveDuration"
import type { ClockIn, EligibleEmployee } from "@/pages/Clocking/types/clocking"

interface ActiveClockInsTableProps {
  /** Already filtered (missingOnly) and sorted by the page. */
  rows: ClockIn[]
  loading?: boolean
  /** Shared 1s tick. */
  now: Date
  employeeMap: Map<number, EligibleEmployee>
  duplicateIds: ReadonlySet<number>
  locale: string
  sort: { columnId: string; direction: "asc" | "desc" } | null
  onSortToggle: (
    id: string,
    next: { columnId: string; direction: "asc" | "desc" },
  ) => void
  onClockOut: (row: ClockIn) => void
  onEdit: (row: ClockIn) => void
  onDelete: (row: ClockIn) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

/**
 * Active clock-ins table (§B6 of `phase_6.8_ux_research.md`).
 *
 * Columns: Employee (identity disc) · Clock-In (sortable,
 * tabular-nums) · Duration (live tick + anomaly badge) · Actions
 * (clock out / edit / delete, always visible, `w-28`). No search, no
 * pagination — the active list is by definition short. Default sort
 * `clockIn` ascending (longest-on-shift first) is owned by the page.
 */
export function ActiveClockInsTable({
  rows,
  loading = false,
  now,
  employeeMap,
  duplicateIds,
  locale,
  sort,
  onSortToggle,
  onClockOut,
  onEdit,
  onDelete,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: ActiveClockInsTableProps) {
  const { t } = useTranslation()

  const columns: ColumnDef<ClockIn>[] = [
    {
      id: "employee",
      header: t("clocking.table.employeeName"),
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
      id: "duration",
      header: t("clocking.table.duration"),
      sortable: true,
      sortKey: (row) => now.getTime() - new Date(row.clockIn).getTime(),
      className: "min-w-40",
      cell: (row) => {
        const anomalies = deriveAnomalies(row, now, duplicateIds)
        return (
          <div className="flex flex-col items-start gap-1">
            <LiveDuration
              clockIn={row.clockIn}
              clockOut={row.clockOut}
              now={now}
              live
            />
            {anomalies.map((anomaly) => (
              <AnomalyBadge key={anomaly.kind} anomaly={anomaly} />
            ))}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "",
      align: "end",
      className: "w-28",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("clocking.buttons.clockOut")}
            onClick={(e) => {
              e.stopPropagation()
              onClockOut(row)
            }}
          >
            <LogOutIcon aria-hidden className="size-4" />
          </Button>
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
      stickyHeader
      ariaLabel={t("clocking.table.activeCaption")}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
    />
  )
}
