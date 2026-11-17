"use client"

/**
 * The patient table for one nurse — Phase 6.11.3.
 *
 * Shared by the specific-report body and the all-report detail dialog so the
 * two surfaces present the same columns, sort keys and pagination behaviour.
 * A thin `DataTable` wrapper: it owns no fetching, so the caller decides
 * whether the rows come from `useNurseDetail` (report body) or the dialog's own
 * hook instance.
 */

import type { ReactNode } from "react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { DataTable } from "@/components/common/DataTable"
import { buildNursePatientColumns } from "@/pages/Reports/nurses/nurseColumns"
import type {
  NursePatientRow,
  NurseQueryPaging,
} from "@/pages/Reports/types/nurseReport"
import { useUIStore } from "@/store/uiStore"

export interface NursePatientTableProps {
  data: NursePatientRow[]
  loading?: boolean
  total: number
  page: number
  pageSize: number
  sort: NurseQueryPaging["sort"]
  onSortToggle: (
    columnId: string,
    next: { columnId: string; direction: "asc" | "desc" }
  ) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onRowClick: (row: NursePatientRow) => void
  ariaLabel: string
  emptyTitle: string
  emptyDescription: string
  /** Totals row (see `NurseTotalsBand`). */
  footer?: ReactNode
}

/** Module-scope so `DataTable`'s memo sees a stable `getRowId`. */
const getPatientRowId = (row: NursePatientRow) => row.patientId

export function NursePatientTable({
  data,
  loading = false,
  total,
  page,
  pageSize,
  sort,
  onSortToggle,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  ariaLabel,
  emptyTitle,
  emptyDescription,
  footer,
}: NursePatientTableProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"

  const columns = useMemo(
    () =>
      buildNursePatientColumns({
        t,
        language,
        onView: onRowClick,
      }),
    [t, language, onRowClick]
  )

  const pagination = useMemo(
    () => ({ page, pageSize, total, onPageChange, onPageSizeChange }),
    [page, pageSize, total, onPageChange, onPageSizeChange]
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      getRowId={getPatientRowId}
      onRowClick={onRowClick}
      sort={sort}
      onSortToggle={onSortToggle}
      pagination={pagination}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      ariaLabel={ariaLabel}
      footer={footer}
    />
  )
}
