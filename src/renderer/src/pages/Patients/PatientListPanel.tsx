"use client"

import { useMemo } from "react"
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
}

type SortState = { columnId: string; direction: "asc" | "desc" }

/**
 * /patients list panel.
 *
 * Server-driven DataTable (Phase 4) bound to `useListData`'s view
 * state. Search is server-driven (`?q=`) and sort is now **server-
 * driven** (`?sort=<key>&order=<asc|desc>`) so the order reflects the
 * full result set, not just the loaded page. The `useListData.sort`
 * value keeps **renderer** column ids (e.g. `patientId`, `nationalId`)
 * so the table's header toggle can match on `column.id`; the snake_case
 * wire key is resolved inside `listPatients` (see `api.ts`).
 *
 * Clicking any row navigates to `/patients/:id` (T4 owns detail).
 * The Create-button handler is forwarded from the parent via the
 * `useCreatePatientWizard` store; the wizard lands in T3.
 */
export function PatientListPanel({
  list,
}: PatientListPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const sort: SortState = useMemo(
    () =>
      list.sort
        ? { columnId: list.sort.columnId, direction: list.sort.direction }
        : { columnId: "name", direction: "asc" },
    [list.sort]
  )

  function handleRowClick(patient: Patient) {
    navigate(`/patients/${patient.patientId}`)
  }

  const columns: ColumnDef<Patient>[] = useMemo(
    () => [
      {
        id: "patientId",
        header: t("patients.table.id"),
        width: "w-12",
        sortable: true,
      },
      {
        id: "name",
        header: t("patients.table.name"),
        sortable: true,
        width: "w-64",
      },
      {
        id: "nationalId",
        header: t("patients.table.nationalId"),
        sortable: true,
        width: "w-64",
      },
      {
        id: "insuranceCompanyName",
        header: t("patients.fields.insuranceCompany"),
        sortable: true,
        cell: (row) => row.insuranceCompanyName ?? "—",
      },
      {
        id: "paymentType",
        header: t("patients.fields.paymentType"),
        sortable: true,
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
        sortable: true,
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
    ],
    [t]
  )

  return (
    <DataTable<Patient>
      ariaLabel={t("patients.allPatients")}
      data={list.data}
      columns={columns}
      loading={list.loading}
      sort={sort}
      onSortToggle={(_columnId, next) => {
        list.setSort({ columnId: next.columnId, direction: next.direction })
      }}
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
