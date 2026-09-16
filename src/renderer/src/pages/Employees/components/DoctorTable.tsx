"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  CircleDollarSignIcon,
  EyeIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"
import {
  ActiveBadge,
  GatedCurrency,
  GatedMoney,
} from "@/pages/Employees/components/EmployeeDisplay"
import {
  useEmployeeLocale,
  formatPerPatientPay,
} from "@/pages/Employees/hooks/useEmployeeDisplay"
import type { Doctor } from "@/pages/Employees/types/employee"

export interface DoctorTableProps {
  doctors: Doctor[]
  loading: boolean
  canViewPayments: boolean
  isAdmin: boolean
  search: { value: string; onChange: (value: string) => void }
  toolbar: React.ReactNode
  sort: { columnId: string; direction: "asc" | "desc" } | null
  onSortToggle: (
    id: string,
    next: { columnId: string; direction: "asc" | "desc" }
  ) => void
  emptyTitle?: string
  emptyAction?: React.ReactNode
  onView: (doctor: Doctor) => void
  onEdit: (doctor: Doctor) => void
  onDelete: (doctor: Doctor) => void
  onCreatePayment: (doctor: Doctor) => void
}

/**
 * Doctors tab table (Phase 6.7): legacy columns (doctor type, hire
 * date, daily pay, per-patient pay, shift, active) with the UX
 * package applied — badges, icon-only actions, tabular money.
 */
export function DoctorTable({
  doctors,
  loading,
  canViewPayments,
  isAdmin,
  search,
  toolbar,
  sort,
  onSortToggle,
  emptyTitle,
  emptyAction,
  onView,
  onEdit,
  onDelete,
  onCreatePayment,
}: DoctorTableProps) {
  const { t } = useTranslation()
  const locale = useEmployeeLocale()

  const sorted = useMemo(() => {
    if (!sort) return doctors
    const direction = sort.direction === "asc" ? 1 : -1
    return [...doctors].sort((a, b) => {
      switch (sort.columnId) {
        case "doctorType":
          return a.doctorType.localeCompare(b.doctorType) * direction
        case "hireDate":
          return (
            (new Date(a.hireDate).getTime() - new Date(b.hireDate).getTime()) *
            direction
          )
        case "dailyPay":
          return ((Number(a.dailyPay) || 0) - (Number(b.dailyPay) || 0)) * direction
        case "perPatientPay":
          return (
            ((Number(a.perPatientPay) || 0) - (Number(b.perPatientPay) || 0)) *
            direction
          )
        case "shiftType":
          return (a.shiftType ?? "").localeCompare(b.shiftType ?? "") * direction
        default:
          return a.name.localeCompare(b.name) * direction
      }
    })
  }, [doctors, sort])

  const columns: ColumnDef<Doctor>[] = [
    {
      id: "name",
      header: t("employees.table.name"),
      sortable: true,
      cell: (doctor) => <span className="font-medium">{doctor.name}</span>,
    },
    {
      id: "doctorType",
      header: t("employees.table.type"),
      sortable: true,
      cell: (doctor) => (
        <Badge variant="secondary">
          {t(`employees.doctorTypes.${doctor.doctorType}`)}
        </Badge>
      ),
    },
    {
      id: "hireDate",
      header: t("employees.table.hireDate"),
      sortable: true,
      cell: (doctor) => (
        <span className="tabular-nums">
          {formatDate(new Date(doctor.hireDate), locale)}
        </span>
      ),
    },
    {
      id: "dailyPay",
      header: t("employees.table.dailyPay"),
      align: "end",
      cell: (doctor) => (
        <GatedCurrency
          value={doctor.dailyPay}
          canView={canViewPayments}
          locale={locale}
        />
      ),
    },
    {
      id: "perPatientPay",
      header: t("employees.table.perPatientPay"),
      align: "end",
      cell: (doctor) => (
        <GatedMoney
          value={doctor.perPatientPay}
          canView={canViewPayments}
          format={() =>
            formatPerPatientPay(
              doctor.perPatientPay,
              doctor.perPatientPaymentType,
              locale
            )
          }
        />
      ),
    },
    {
      id: "shiftType",
      header: t("employees.table.shiftType"),
      sortable: true,
      cell: (doctor) =>
        doctor.shiftType ? (
          t(`employees.shiftTypes.${doctor.shiftType}`)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "active",
      header: t("employees.table.active"),
      cell: (doctor) => <ActiveBadge active={doctor.isActive} />,
    },
    {
      id: "actions",
      header: "",
      align: "end",
      className: "w-36",
      cell: (doctor) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("employees.buttons.viewDetails")}
            title={t("employees.buttons.viewDetails")}
            onClick={(e) => {
              e.stopPropagation()
              onView(doctor)
            }}
          >
            <EyeIcon aria-hidden className="size-4" />
          </Button>
          {isAdmin ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("employees.buttons.edit")}
                title={t("employees.buttons.edit")}
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(doctor)
                }}
              >
                <PencilIcon aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("employees.buttons.delete")}
                title={t("employees.buttons.delete")}
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(doctor)
                }}
              >
                <Trash2Icon aria-hidden className="size-4" />
              </Button>
            </>
          ) : null}
          {canViewPayments ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("employees.buttons.createPayment")}
              title={t("employees.buttons.createPayment")}
              onClick={(e) => {
                e.stopPropagation()
                onCreatePayment(doctor)
              }}
            >
              <CircleDollarSignIcon aria-hidden className="size-4" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <DataTable<Doctor>
      data={sorted}
      columns={columns}
      loading={loading}
      search={{ value: search.value, onChange: search.onChange }}
      toolbar={toolbar}
      getRowId={(doctor) => doctor.employeeId}
      sort={sort}
      onSortToggle={onSortToggle}
      onRowClick={onView}
      emptyTitle={emptyTitle ?? t("common.noData")}
      emptyAction={emptyAction}
      ariaLabel={t("employees.doctorList")}
    />
  )
}

