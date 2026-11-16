"use client"

/**
 * Nurse report table columns — Phase 6.11.3.
 *
 * Two builders, one module: the nurse list (all-report mode) and the patient
 * table (specific mode + detail dialog). Keeping them together means both
 * patient tables this tab renders are byte-identical, and the tab file stays a
 * composition root (`react-refresh` friendly: only functions here).
 *
 * Sortable column ids are keys of `NURSE_SORT_COLUMNS` /
 * `NURSE_PATIENT_SORT_COLUMNS`; a column without a server-side sort key omits
 * `sortable`, so a header can never fire a request the API would reject.
 *
 * The last-admission cell pairs admission and discharge (or the active badge)
 * the same way the doctor table does: the two values describe the same stay
 * and eleven separate columns would force horizontal scrolling.
 */

import type { TFunction } from "i18next"
import { EyeIcon } from "lucide-react"

import type { ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import { formatDate, resolveLocale } from "@/lib/utils"
import {
  AdmissionStatusBadge,
  PaymentTypeBadge,
} from "@/pages/Reports/components/StatusBadges"
import type {
  NursePatientRow,
  NurseReportRow,
} from "@/pages/Reports/types/nurseReport"

export interface NurseColumnDeps {
  t: TFunction
  language: "en" | "ar"
  onView: (row: NurseReportRow) => void
}

export interface NursePatientColumnDeps {
  t: TFunction
  language: "en" | "ar"
  onView: (row: NursePatientRow) => void
}

/* ------------------------------------------------------------------ */
/* Nurse list                                                          */
/* ------------------------------------------------------------------ */

export function buildNurseColumns({
  t,
  language,
  onView,
}: NurseColumnDeps): ColumnDef<NurseReportRow>[] {
  const locale = resolveLocale(language)
  const date = (value: string | null) =>
    value ? formatDate(new Date(`${value}T00:00:00`), language) : "—"
  const hours = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)

  return [
    {
      id: "name",
      header: t("reports.table.nurse"),
      sortable: true,
      width: "w-[18rem]",
      cell: (row) => (
        <span
          className="block w-[16rem] truncate font-medium text-foreground"
          dir="auto"
          title={row.nurseName}
        >
          {row.nurseName}
        </span>
      ),
    },
    {
      id: "patients",
      header: t("reports.table.patients"),
      sortable: true,
      numeric: true,
      width: "w-28",
      cell: (row) => <span className="tabular-nums">{row.patientsCount}</span>,
    },
    {
      id: "days",
      header: t("reports.table.days"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) => <span className="tabular-nums">{row.daysWorked}</span>,
    },
    {
      id: "hours",
      header: t("reports.table.hours"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {hours(row.totalHours)}
        </span>
      ),
    },
    {
      id: "lastWork",
      header: t("reports.table.lastWorkDate"),
      sortable: true,
      width: "w-36",
      cell: (row) => <span className="whitespace-nowrap">{date(row.lastWorkDate)}</span>,
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

/* ------------------------------------------------------------------ */
/* Nurse → patient list                                                */
/* ------------------------------------------------------------------ */

export function buildNursePatientColumns({
  t,
  language,
  onView,
}: NursePatientColumnDeps): ColumnDef<NursePatientRow>[] {
  const locale = resolveLocale(language)
  const date = (value: string | null) =>
    value ? formatDate(new Date(value), language) : "—"
  const hours = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)

  return [
    {
      id: "name",
      header: t("reports.table.patientName"),
      sortable: true,
      width: "w-[16rem]",
      cell: (row) => (
        <span
          className="block w-[14rem] truncate font-medium text-foreground"
          dir="auto"
          title={row.patientName}
        >
          {row.patientName}
        </span>
      ),
    },
    {
      id: "paymentType",
      header: t("reports.table.paymentType"),
      width: "w-28",
      cell: (row) => <PaymentTypeBadge value={row.paymentType} />,
    },
    {
      id: "lastAdmission",
      header: t("reports.table.lastAdmission"),
      sortable: true,
      width: "w-36",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap">
            {date(row.lastAdmissionTime)}
          </span>
          {row.lastAdmissionTime ? (
            row.lastDischargeTime ? (
              <span
                className="truncate text-xs text-muted-foreground"
                title={row.lastDischargeTime}
              >
                {t("reports.table.lastDischarge")}: {date(row.lastDischargeTime)}
              </span>
            ) : (
              <span className="mt-0.5">
                <AdmissionStatusBadge active />
              </span>
            )
          ) : null}
        </div>
      ),
    },
    {
      id: "diagnosis",
      header: t("reports.table.diagnosis"),
      width: "w-40",
      cell: (row) => (
        <span
          className="block w-[9rem] truncate"
          dir="auto"
          title={row.diagnosis ?? undefined}
        >
          {row.diagnosis || "—"}
        </span>
      ),
    },
    {
      id: "days",
      header: t("reports.table.daysAssigned"),
      sortable: true,
      numeric: true,
      width: "w-28",
      cell: (row) => <span className="tabular-nums">{row.daysAssigned}</span>,
    },
    {
      id: "hours",
      header: t("reports.table.hoursWorked"),
      sortable: true,
      numeric: true,
      width: "w-28",
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {hours(row.hoursWorked)}
        </span>
      ),
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
