"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import {
  DataTable,
  type ColumnDef,
} from "@/components/common/DataTable"
import type { UseListDataResult } from "@/hooks/useListData"
import type { Patient } from "@/pages/Patients/types/patient"

interface PatientListPanelProps {
  list: UseListDataResult<Patient>
  onAddPatient?: () => void
}

type SortState = { columnId: string; direction: "asc" | "desc" }

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}

/**
 * /patients list panel.
 *
 * Server-driven DataTable (Phase 4) bound to `useListData`'s view
 * state. Sort is **client-driven** because the legacy controller's
 * `?sort=` parameter isn't implemented upstream. Search is
 * server-driven (`?q=`), filter runs only on the loaded page.
 *
 * Clicking any row navigates to `/patients/:id` (T4 owns detail).
 * The Create-button click handler is forwarded from the parent;
 * the wizard lands in T3.
 */
export function PatientListPanel({
  list,
}: PatientListPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [sort, setSort] = useState<SortState>({
    columnId: "name",
    direction: "asc",
  })

  const sorted = useMemo<Patient[]>(() => {
    if (!sort.columnId) return list.data
    const copy = [...list.data]
    copy.sort((a, b) => {
      const left = (a as unknown as Record<string, unknown>)[sort.columnId]
      const right = (b as unknown as Record<string, unknown>)[sort.columnId]
      const cmp = compare(left, right)
      return sort.direction === "asc" ? cmp : -cmp
    })
    return copy
  }, [list.data, sort])

  function handleRowClick(patient: Patient) {
    navigate(`/patients/${patient.patientId}`)
  }

  const columns: ColumnDef<Patient>[] = [
    {
      id: "patientId",
      header: t("patients.table.id"),
      numeric: true,
      width: "w-12"
    },
    {
      id: "name",
      header: t("patients.table.name"),
      sortable: true,
      width: "w-64"
    },
    {
      id: "nationalId",
      header: t("patients.table.nationalId"),
      width: "w-64"
    },
    {
      id: "insuranceCompanyName",
      header: t("patients.fields.insuranceCompany"),
      cell: (row) => row.insuranceCompanyName ?? "—",
    },
    {
      id: "paymentType",
      header: t("patients.fields.paymentType"),
      cell: (row) =>
        t(
          `patients.paymentTypes.${row.paymentType}` as
            | "patients.paymentTypes.cash"
            | "patients.paymentTypes.credit"
            | "patients.paymentTypes.insurance"
        ),
    },
    {
      id: "registrationDate",
      header: t("patients.fields.registrationDate"),
      cell: (row) =>
        row.registrationDate
          ? new Date(row.registrationDate).toLocaleDateString()
          : "—",
    },
    {
      id: "isActive",
      header: t("patients.status.active"),
      cell: (row) =>
        row.isActive
          ? t("patients.status.admitted")
          : t("patients.status.notAdmitted"),
    },
  ]

  return (
    <DataTable<Patient>
      ariaLabel={t("patients.allPatients")}
      data={sorted}
      columns={columns}
      loading={list.loading}
      initialSort={sort}
      onSortToggle={(_columnId, next) => setSort(next)}
      search={{
        value: list.search,
        onChange: list.setSearch,
        placeholder: t("patients.searchPlaceholder"),
      }}
      pagination={{
        page: list.page,
        pageSize: list.pageSize,
        total: list.total,
        onPageChange: (page) => list.setPage(page),
        onPageSizeChange: (size) => list.setPageSize(size),
      }}
      emptyTitle={t("patients.noPatients")}
      emptyDescription={t("patients.emptyTableSearchDesc")}
      onRowClick={handleRowClick}
    />
  )
}
