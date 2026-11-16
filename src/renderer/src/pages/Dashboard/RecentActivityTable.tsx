"use client"

import { useTranslation } from "react-i18next"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { formatDateTime } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { AuditLogRecord } from "@/types"

export interface RecentActivityTableProps {
  logs: AuditLogRecord[]
  loading?: boolean
  /** Render in compact density (admin's bottom row); default false. */
  density?: "default" | "compact"
}

/**
 * Compact audit log feed used by the Admin Dashboard.
 *
 * Renders at most 10 rows (no pagination/search — see Phase 6.1 spec).
 * `density="compact"` matches the dashboard's stacking density.
 *
 * Timestamps use the shared `formatDateTime(date, language)` helper so the
 * digits/format follow the active UI language (AR ↔ EN) instead of a
 * hardcoded `en-US` formatter.
 */
export function RecentActivityTable({
  logs,
  loading = false,
  density = "compact",
}: RecentActivityTableProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"

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
      cell: (row) => {
        const text = row.details?.description ?? row.details?.url ?? "—"
        return (
          <span className="block max-w-[28rem] truncate" title={text}>
            {text}
          </span>
        )
      },
    },
    {
      id: "timestamp",
      header: t("common.time"),
      numeric: true,
      cell: (row) => {
        /* A malformed/absent timestamp must not throw inside Intl. */
        const date = new Date(row.timestamp)
        return Number.isNaN(date.getTime())
          ? "—"
          : formatDateTime(date, language)
      },
    },
  ]

  return (
    <DataTable<AuditLogRecord>
      ariaLabel={t("dashboard.recentActivity")}
      data={logs}
      columns={columns}
      loading={loading}
      density={density}
    />
  )
}
