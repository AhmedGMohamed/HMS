"use client"

/**
 * Payroll table columns — Phase 6.11.5.
 *
 * Sortable column ids are the keys of `EMPLOYEE_PAYMENT_SORT_COLUMNS`; `paid`
 * and `unpaid` are derived in the same SQL row but are not in the server's
 * whitelist, so their headers omit `sortable` rather than firing a request the
 * API would reject with a 400.
 *
 * Every money column is EGP and `dir="ltr"`: currency must not mirror in an
 * Arabic (RTL) table, and a mirrored minus sign would change the number.
 */

import type { TFunction } from "i18next"
import { EyeIcon } from "lucide-react"

import type { ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import { formatDate, resolveLocale } from "@/lib/utils"
import { EmployeeTypeBadge } from "@/pages/Reports/components/StatusBadges"
import type { EmployeePaymentRow } from "@/pages/Reports/types/employeePaymentReport"

export interface EmployeePaymentColumnDeps {
  t: TFunction
  language: "en" | "ar"
  onView: (row: EmployeePaymentRow) => void
}

export function buildEmployeePaymentColumns({
  t,
  language,
  onView,
}: EmployeePaymentColumnDeps): ColumnDef<EmployeePaymentRow>[] {
  const locale = resolveLocale(language)
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 0,
    }).format(value)
  const date = (value: string | null) =>
    value ? formatDate(new Date(`${value}T00:00:00`), language) : "—"

  const moneyCell = (value: number, emphasis = false) => (
    <span
      className={emphasis ? "tabular-nums font-semibold" : "tabular-nums"}
      dir="ltr"
    >
      {money(value)}
    </span>
  )

  return [
    {
      id: "name",
      header: t("reports.table.employee"),
      sortable: true,
      width: "w-[16rem]",
      cell: (row) => (
        <span
          className="block w-[14rem] truncate font-medium text-foreground"
          dir="auto"
          title={row.employeeName}
        >
          {row.employeeName}
        </span>
      ),
    },
    {
      id: "type",
      header: t("reports.table.type"),
      width: "w-28",
      cell: (row) => <EmployeeTypeBadge value={row.employeeType} />,
    },
    {
      id: "hireDate",
      header: t("reports.table.hireDate"),
      width: "w-32",
      cell: (row) => (
        <span className="whitespace-nowrap">{date(row.hireDate)}</span>
      ),
    },
    {
      id: "payments",
      header: t("reports.table.payments"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) => <span className="tabular-nums">{row.paymentCount}</span>,
    },
    {
      id: "base",
      header: t("reports.table.base"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => moneyCell(row.totalBasePay),
    },
    {
      id: "extra",
      header: t("reports.table.extra"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => moneyCell(row.totalExtraPay),
    },
    {
      id: "deductions",
      header: t("reports.table.deductions"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => moneyCell(row.totalDeductions),
    },
    {
      id: "paid",
      header: t("reports.table.paid"),
      numeric: true,
      width: "w-32",
      cell: (row) => moneyCell(row.totalPaid),
    },
    {
      id: "unpaid",
      header: t("reports.table.unpaid"),
      numeric: true,
      width: "w-32",
      cell: (row) => moneyCell(row.totalUnpaid),
    },
    {
      id: "net",
      header: t("reports.table.net"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => moneyCell(row.netPayment, true),
    },
    {
      id: "actions",
      header: "",
      align: "end",
      width: "w-20",
      className: "whitespace-nowrap",
      cell: (row) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("reports.actions.viewDetails")}
          onClick={(event) => {
            event.stopPropagation()
            onView(row)
          }}
        >
          <EyeIcon aria-hidden />
        </Button>
      ),
    },
  ]
}
