"use client"

import { useTranslation } from "react-i18next"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import type { AuditLogRecord } from "@/types"

export interface RecentActivityTableProps {
  logs: AuditLogRecord[]
  loading?: boolean
  /** Render in compact density (admin's bottom row); default false. */
  density?: "default" | "compact"
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "short",
})

/**
 * Compact audit log feed used by the Admin Dashboard.
 *
 * Renders at most 10 rows (no pagination/search — see Phase 6.1 spec).
 * `density="compact"` matches the dashboard's stacking density.
 */
export function RecentActivityTable({
  logs,
  loading = false,
  density = "compact",
}: RecentActivityTableProps) {
  const { t } = useTranslation()

  const columns: ColumnDef<AuditLogRecord>[] = [
    {
      id: "actionType",
      header: t("dashboard.table.action"),
      width: "w-32",
    },
    {
      id: "user",
      header: t("dashboard.table.user"),
      cell: (row) => row.username ?? `#${row.userId}`,
    },
    {
      id: "details",
      header: t("dashboard.table.details"),
      cell: (row) => row.details?.description ?? row.details?.url ?? "—",
    },
    {
      id: "timestamp",
      header: t("common.time"),
      numeric: true,
      cell: (row) => DATE_FORMATTER.format(new Date(row.timestamp)),
    },
  ]

  return (
    <DataTable<AuditLogRecord>
      ariaLabel="Recent activity"
      data={logs}
      columns={columns}
      loading={loading}
      density={density}
    />
  )
}
