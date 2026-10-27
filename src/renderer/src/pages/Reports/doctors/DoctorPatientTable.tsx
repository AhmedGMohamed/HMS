"use client"

/**
 * The patient table for one doctor — Phase 6.11.2.
 *
 * Shared by the specific-report body and the all-report detail dialog so the
 * two surfaces present the same columns, sort keys and pagination behaviour.
 * The component is a thin `DataTable` wrapper: it owns no fetching, so the
 * caller decides whether the rows come from `useDoctorDetail` (report body) or
 * the dialog's own hook instance.
 */

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { DataTable } from "@/components/common/DataTable"
import { buildDoctorPatientColumns } from "@/pages/Reports/doctors/doctorColumns"
import type {
  DoctorPatientRow,
  DoctorQueryPaging,
} from "@/pages/Reports/types/doctorReport"
import { useUIStore } from "@/store/uiStore"

export interface DoctorPatientTableProps {
  data: DoctorPatientRow[]
  loading?: boolean
  total: number
  page: number
  pageSize: number
  sort: DoctorQueryPaging["sort"]
  onSortToggle: (
    columnId: string,
    next: { columnId: string; direction: "asc" | "desc" }
  ) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onRowClick: (row: DoctorPatientRow) => void
  ariaLabel: string
  emptyTitle: string
  emptyDescription: string
  /** Totals row (see `DoctorTotalsBand`). */
  footer?: ReactNode
}

export function DoctorPatientTable({
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
}: DoctorPatientTableProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"

  const columns = buildDoctorPatientColumns({
    t,
    language,
    onView: onRowClick,
  })

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      getRowId={(row) => row.patientId}
      onRowClick={onRowClick}
      sort={sort}
      onSortToggle={onSortToggle}
      pagination={{ page, pageSize, total, onPageChange, onPageSizeChange }}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      ariaLabel={ariaLabel}
      footer={footer}
    />
  )
}
