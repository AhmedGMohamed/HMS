"use client"

/**
 * Patient table columns — Phase 6.11.1.
 *
 * Kept out of `PatientReportTab` so the tab file stays a composition root.
 * The module exports **only** a builder function (no components), which is
 * what keeps `react-refresh` happy for the tab module.
 *
 * Sortable column ids are the keys of `PATIENT_SORT_COLUMNS`; a column that
 * has no server-side sort key simply omits `sortable`, so the header can
 * never fire a request the API would reject.
 *
 * ## Width discipline
 *
 * Ten columns at `table-layout: auto` let the browser hand each column its
 * max-content width, which pushed the trailing actions column past the card
 * edge (the eye icon was clipped). The free-text columns are therefore given
 * a definite preferred width and truncate their own content, so the table
 * stays inside the card and the row actions stay visible. Truncated text
 * carries `title` so the full value is still reachable on hover, and the
 * untruncated version is always available in the detail dialog.
 */

import type { TFunction } from "i18next"
import { EyeIcon, PrinterIcon } from "lucide-react"

import type { ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import {
  AdmissionStatusBadge,
  GenderBadge,
  PaymentTypeBadge,
} from "@/pages/Reports/components/StatusBadges"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import type { PatientReportRow } from "@/pages/Reports/types/patientReport"

export interface PatientColumnDeps {
  t: TFunction
  language: "en" | "ar"
  onView: (row: PatientReportRow) => void
  /** Omitted when the user cannot export (`manage_reports`). */
  onPrint?: (row: PatientReportRow) => void
  /** Patient whose print is currently being prepared. */
  printingPatientId?: number | null
}

export function buildPatientColumns({
  t,
  language,
  onView,
  onPrint,
  printingPatientId = null,
}: PatientColumnDeps): ColumnDef<PatientReportRow>[] {
  const locale = resolveLocale(language)
  const money = (value: number) => formatCurrency(value, locale)
  const date = (value: string | null) =>
    value ? formatDate(new Date(value), language) : "—"

  const columns: ColumnDef<PatientReportRow>[] = [
    {
      id: "name",
      header: t("reports.table.patientName"),
      sortable: true,
      width: "w-[14rem]",
      cell: (row) => (
        <div className="flex w-[12rem] flex-col">
          <span
            className="truncate font-medium text-foreground"
            dir="auto"
            title={row.patientName}
          >
            {row.patientName}
          </span>
          {row.nationalId ? (
            <span
              className="truncate text-xs text-muted-foreground"
              dir="ltr"
              title={row.nationalId}
            >
              {row.nationalId}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "demographics",
      header: `${t("reports.table.age")} / ${t("reports.table.gender")}`,
      width: "w-24",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="tabular-nums" dir="ltr">
            {row.age ?? "—"}
          </span>
          <GenderBadge value={row.gender} />
        </div>
      ),
    },
    {
      id: "paymentType",
      header: t("reports.table.paymentType"),
      width: "w-28",
      cell: (row) => (
        <div className="flex w-full flex-col items-start gap-1">
          <PaymentTypeBadge value={row.paymentType} />
          {row.insuranceCompany ? (
            <span
              className="w-full truncate text-xs text-muted-foreground"
              dir="auto"
              title={row.insuranceCompany}
            >
              {row.insuranceCompany}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "referringDoctor",
      header: t("reports.table.referringDoctor"),
      width: "w-28",
      cell: (row) => (
        <span
          className="block truncate"
          dir="auto"
          title={row.referringDoctorName || undefined}
        >
          {row.referringDoctorName || "—"}
        </span>
      ),
    },
    {
      id: "admissions",
      header: t("reports.table.admissions"),
      sortable: true,
      numeric: true,
      width: "w-28",
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <span className="tabular-nums">{row.admissionsCount}</span>
          {row.hasActiveAdmission ? <AdmissionStatusBadge active /> : null}
        </div>
      ),
    },
    {
      id: "lastAdmission",
      header: t("reports.table.lastAdmission"),
      sortable: true,
      width: "w-28",
      cell: (row) => (
        <span className="whitespace-nowrap">{date(row.lastAdmission)}</span>
      ),
    },
    {
      id: "totalBilled",
      header: t("reports.table.totalBilled"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => money(row.totalBilled),
    },
    {
      id: "totalPaid",
      header: t("reports.table.totalPaid"),
      sortable: true,
      numeric: true,
      width: "w-28",
      cell: (row) => money(row.totalPaid),
    },
    {
      id: "outstanding",
      header: t("reports.table.outstanding"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => (
        <span
          className={
            row.totalOutstanding > 0
              ? "font-medium text-warning"
              : "text-success-dark"
          }
        >
          {money(row.totalOutstanding)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "end",
      width: "w-24",
      className: "whitespace-nowrap",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          {onPrint ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("reports.actions.printPatient")}
              disabled={printingPatientId === row.patientId}
              onClick={(event) => {
                event.stopPropagation()
                onPrint(row)
              }}
            >
              <PrinterIcon aria-hidden />
            </Button>
          ) : null}
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
        </div>
      ),
    },
  ]

  return columns
}
