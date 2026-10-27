"use client"

/**
 * Doctor report table columns — Phase 6.11.2.
 *
 * Two builders, one module: the doctor list (all-report mode) and the patient
 * table (specific mode + detail dialog). Keeping them together means the two
 * patient tables rendered by this tab are byte-identical, and the tab file
 * stays a composition root (`react-refresh` friendly: only functions here).
 *
 * Sortable column ids are keys of `DOCTOR_SORT_COLUMNS` /
 * `DOCTOR_PATIENT_SORT_COLUMNS`; a column without a server-side sort key omits
 * `sortable`, so a header can never fire a request the API would reject.
 *
 * Width discipline follows 6.11.1 §8.4: free-text columns get a definite
 * preferred width and truncate with `title`, so the trailing actions column is
 * never pushed out of the card. Below the card width the table scrolls inside
 * its own region, which is the intended fallback.
 */

import type { TFunction } from "i18next"
import { EyeIcon } from "lucide-react"

import type { ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import {
  AdmissionStatusBadge,
  DoctorTypeBadge,
  GenderBadge,
  PaymentTypeBadge,
} from "@/pages/Reports/components/StatusBadges"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import type {
  DoctorPatientRow,
  DoctorReportRow,
} from "@/pages/Reports/types/doctorReport"

export interface DoctorColumnDeps {
  t: TFunction
  language: "en" | "ar"
  onView: (row: DoctorReportRow) => void
}

export interface DoctorPatientColumnDeps {
  t: TFunction
  language: "en" | "ar"
  onView: (row: DoctorPatientRow) => void
}

/* ------------------------------------------------------------------ */
/* Doctor list                                                         */
/* ------------------------------------------------------------------ */

export function buildDoctorColumns({
  t,
  language,
  onView,
}: DoctorColumnDeps): ColumnDef<DoctorReportRow>[] {
  const locale = resolveLocale(language)
  const money = (value: number) => formatCurrency(value, locale)

  return [
    {
      id: "name",
      header: t("reports.table.doctor"),
      sortable: true,
      width: "w-[18rem]",
      cell: (row) => (
        <span
          className="block w-[16rem] truncate font-medium text-foreground"
          dir="auto"
          title={row.doctorName}
        >
          {row.doctorName}
        </span>
      ),
    },
    {
      id: "doctorType",
      header: t("reports.table.doctorType"),
      width: "w-32",
      cell: (row) => <DoctorTypeBadge value={row.doctorType} />,
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
      id: "admissions",
      header: t("reports.table.admissions"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => <span className="tabular-nums">{row.admissionsCount}</span>,
    },
    {
      id: "billed",
      header: t("reports.table.totalBilled"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => money(row.totalBilled),
    },
    {
      id: "paid",
      header: t("reports.table.totalPaid"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => money(row.totalPaid),
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
/* Doctor → patient list                                               */
/* ------------------------------------------------------------------ */

/**
 * The patient table under one doctor.
 *
 * `lastDischargeTime` shares the "last admission" cell: the start date on the
 * first line, the discharge (or the active badge) underneath. Eleven columns
 * at 8pt would force horizontal scrolling in the dialog for two values that
 * describe the same stay; pairing them keeps every column inside the card and
 * loses nothing the plan asks for.
 */
export function buildDoctorPatientColumns({
  t,
  language,
  onView,
}: DoctorPatientColumnDeps): ColumnDef<DoctorPatientRow>[] {
  const locale = resolveLocale(language)
  const money = (value: number) => formatCurrency(value, locale)
  const date = (value: string | null) =>
    value ? formatDate(new Date(value), language) : "—"

  return [
    {
      id: "name",
      header: t("reports.table.patientName"),
      sortable: true,
      width: "w-[15rem]",
      cell: (row) => (
        <div className="flex w-[13rem] flex-col">
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
      id: "admissions",
      header: t("reports.table.admissions"),
      sortable: true,
      numeric: true,
      width: "w-28",
      cell: (row) => <span className="tabular-nums">{row.admissionsCount}</span>,
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
          title={row.lastDiagnosis ?? undefined}
        >
          {row.lastDiagnosis || "—"}
        </span>
      ),
    },
    {
      id: "billed",
      header: t("reports.table.totalBilled"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => money(row.totalBilled),
    },
    {
      id: "paid",
      header: t("reports.table.totalPaid"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => money(row.totalPaid),
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
