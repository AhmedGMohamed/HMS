"use client"

/**
 * Clock-in table columns — Phase 6.11.6.
 *
 * Sortable column ids are the keys of `CLOCK_IN_SORT_COLUMNS`; `type` and
 * `shift` are not in the server's whitelist, so their headers omit `sortable`
 * rather than firing a request the API would reject with a 400.
 *
 * ## Days are not sessions
 *
 * `Days` is `attendanceSummary.workedDays` (distinct dates) while `Clock-Ins` is
 * `clockInCount` (sessions). A double shift reads `1` and `2`, and `Avg / Day`
 * divides hours by the former — the legacy report divided by sessions and
 * understated the average.
 *
 * ## Missing days are a count, not a status
 *
 * `Missing` is the synthesized absence count, and `Punctuality` deliberately
 * excludes those days from its denominator (an absence is not an unpunctual
 * arrival). Every numeric cell is `dir="ltr"`: digits and percent signs must not
 * mirror in an Arabic (RTL) table.
 */

import type { TFunction } from "i18next"
import { EyeIcon } from "lucide-react"

import type { ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import { resolveLocale } from "@/lib/utils"
import { EmployeeTypeBadge } from "@/pages/Reports/components/StatusBadges"
import type { ClockInReportRow } from "@/pages/Reports/types/clockInReport"

export interface ClockInColumnDeps {
  t: TFunction
  language: "en" | "ar"
  onView: (row: ClockInReportRow) => void
}

/** `08:00:00` → `08:00`; a null shift reads as an em dash. */
function shortTime(value: string | null): string | null {
  if (!value) return null
  return value.slice(0, 5)
}

export function buildClockInColumns({
  t,
  language,
  onView,
}: ClockInColumnDeps): ColumnDef<ClockInReportRow>[] {
  const locale = resolveLocale(language)
  const hours = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const count = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
  const percent = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(value / 100)
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 0,
    }).format(value)

  const numeric = (value: string) => (
    <span className="tabular-nums" dir="ltr">
      {value}
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
      width: "w-24",
      cell: (row) => <EmployeeTypeBadge value={row.employeeType} />,
    },
    {
      id: "shift",
      header: t("reports.table.shift"),
      width: "w-32",
      cell: (row) => {
        const start = shortTime(row.shiftStartTime)
        const end = shortTime(row.shiftEndTime)
        if (!row.shiftType && !start) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <div className="flex flex-col gap-0.5">
            {row.shiftType ? (
              <span className="text-xs font-medium text-foreground">
                {t(`reports.enums.shiftType.${row.shiftType}`, {
                  defaultValue: row.shiftType,
                })}
              </span>
            ) : null}
            {start && end ? (
              <span
                className="text-xs tabular-nums text-muted-foreground"
                dir="ltr"
              >
                {start} – {end}
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "days",
      header: t("reports.table.days"),
      sortable: true,
      numeric: true,
      width: "w-20",
      cell: (row) => numeric(count(row.attendanceSummary.workedDays)),
    },
    {
      id: "clockIns",
      header: t("reports.table.clockIns"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) => numeric(count(row.clockInCount)),
    },
    {
      id: "hours",
      header: t("reports.table.hours"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) => numeric(hours(row.totalHours)),
    },
    {
      id: "avgPerDay",
      header: t("reports.table.avgPerDay"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) => numeric(hours(row.avgHoursPerDay)),
    },
    {
      id: "onTime",
      header: t("reports.enums.attendance.on_time"),
      sortable: true,
      numeric: true,
      width: "w-20",
      cell: (row) => numeric(count(row.attendanceSummary.onTimeDays)),
    },
    {
      id: "late",
      header: t("reports.enums.attendance.late"),
      sortable: true,
      numeric: true,
      width: "w-20",
      cell: (row) => numeric(count(row.attendanceSummary.lateDays)),
    },
    {
      id: "early",
      header: t("reports.enums.attendance.early"),
      sortable: true,
      numeric: true,
      width: "w-20",
      cell: (row) => numeric(count(row.attendanceSummary.earlyDays)),
    },
    {
      id: "incomplete",
      header: t("reports.enums.attendance.incomplete"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) => numeric(count(row.attendanceSummary.incompleteDays)),
    },
    {
      id: "missing",
      header: t("reports.enums.attendance.missing"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) =>
        row.attendanceSummary.missingDays > 0 ? (
          <span className="tabular-nums font-medium text-destructive" dir="ltr">
            {count(row.attendanceSummary.missingDays)}
          </span>
        ) : (
          numeric(count(0))
        ),
    },
    {
      id: "punctuality",
      header: t("reports.table.punctuality"),
      sortable: true,
      numeric: true,
      width: "w-24",
      cell: (row) =>
        row.attendanceSummary.workedDays === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          numeric(percent(row.attendanceSummary.punctualityRate))
        ),
    },
    {
      id: "deductions",
      header: t("reports.table.deductions"),
      sortable: true,
      numeric: true,
      width: "w-32",
      cell: (row) => (
        <span
          className={
            row.totalDeductions > 0
              ? "tabular-nums font-medium text-warning"
              : "tabular-nums"
          }
          dir="ltr"
        >
          {money(row.totalDeductions)}
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
