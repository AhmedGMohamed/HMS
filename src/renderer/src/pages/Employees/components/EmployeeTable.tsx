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
} from "@/pages/Employees/components/EmployeeDisplay"
import {
  useEmployeeLocale,
  useExtraPaymentSummary,
} from "@/pages/Employees/hooks/useEmployeeDisplay"
import type { Employee } from "@/pages/Employees/types/employee"

export interface EmployeeTableProps {
  employees: Employee[]
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
  onView: (employee: Employee) => void
  onEdit: (employee: Employee) => void
  onDelete: (employee: Employee) => void
  onCreatePayment: (employee: Employee) => void
}

/**
 * Staff table for the Employees (type=other) and Nurses tabs
 * (Phase 6.7). Columns are legacy parity; presentation follows the
 * UX package (badges, icon actions with tooltips, tabular money).
 */
export function EmployeeTable({
  employees,
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
}: EmployeeTableProps) {
  const { t } = useTranslation()
  const locale = useEmployeeLocale()
  const extraPaymentSummary = useExtraPaymentSummary()

  const sorted = useMemo(() => {
    if (!sort) return employees
    const direction = sort.direction === "asc" ? 1 : -1
    return [...employees].sort((a, b) => {
      switch (sort.columnId) {
        case "hireDate":
          return (
            (new Date(a.hireDate).getTime() - new Date(b.hireDate).getTime()) *
            direction
          )
        case "basePay":
          return ((Number(a.basePay) || 0) - (Number(b.basePay) || 0)) * direction
        case "shiftType":
          return (a.shiftType ?? "").localeCompare(b.shiftType ?? "") * direction
        default:
          return a.name.localeCompare(b.name) * direction
      }
    })
  }, [employees, sort])

  const columns: ColumnDef<Employee>[] = [
    {
      id: "name",
      header: t("employees.table.name"),
      sortable: true,
      cell: (employee) => <span className="font-medium">{employee.name}</span>,
    },
    {
      id: "type",
      header: t("employees.table.type"),
      cell: (employee) => (
        <Badge variant="secondary">
          {t(`employees.types.${employee.employeeType}`)}
        </Badge>
      ),
    },
    {
      id: "hireDate",
      header: t("employees.table.hireDate"),
      sortable: true,
      cell: (employee) => (
        <span className="tabular-nums">
          {formatDate(new Date(employee.hireDate), locale)}
        </span>
      ),
    },
    {
      id: "basePay",
      header: t("employees.table.basePay"),
      align: "end",
      cell: (employee) => (
        <GatedCurrency
          value={employee.basePay}
          canView={canViewPayments}
          locale={locale}
        />
      ),
    },
    {
      id: "shiftType",
      header: t("employees.table.shiftType"),
      sortable: true,
      cell: (employee) =>
        employee.shiftType ? (
          t(`employees.shiftTypes.${employee.shiftType}`)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "extraPayment",
      header: t("employees.table.extraPayment"),
      cell: (employee) => (
        <span className="text-sm">{extraPaymentSummary(employee)}</span>
      ),
    },
    {
      id: "active",
      header: t("employees.table.active"),
      cell: (employee) => <ActiveBadge active={employee.isActive} />,
    },
    {
      id: "actions",
      header: "",
      align: "end",
      className: "w-36",
      cell: (employee) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("employees.buttons.viewDetails")}
            title={t("employees.buttons.viewDetails")}
            onClick={(e) => {
              e.stopPropagation()
              onView(employee)
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
                  onEdit(employee)
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
                  onDelete(employee)
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
                onCreatePayment(employee)
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
    <DataTable<Employee>
      data={sorted}
      columns={columns}
      loading={loading}
      search={{ value: search.value, onChange: search.onChange }}
      toolbar={toolbar}
      getRowId={(employee) => employee.employeeId}
      sort={sort}
      onSortToggle={onSortToggle}
      onRowClick={onView}
      emptyTitle={emptyTitle ?? t("common.noData")}
      emptyAction={emptyAction}
      ariaLabel={t("employees.title")}
    />
  )
}

