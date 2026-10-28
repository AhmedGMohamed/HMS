/**
 * Clock-in report CSV — Phase 6.11.6.
 *
 * One sectioned file, because the clock-in report is four tables of different
 * shapes and a single flat sheet would need columns that are empty for most
 * rows:
 *
 *   Summary · Employees · Daily Records · Status Distribution ·
 *   Hours by Employee
 *
 * Three rules from the report contract shape the columns:
 *
 *   - **Days are not sessions.** `Worked Days` counts distinct dates while
 *     `Clock-Ins` counts sessions, and `Avg Hours / Day` divides by the former.
 *   - **Missing days are a count, not rows.** The export omits synthesized
 *     absences (they have no clock-in row), so `Missing Days` appears as an
 *     employee column and in the summary; the `Daily Records` section holds real
 *     sessions only.
 *   - **Punctuality excludes absences.** Its denominator is the classified
 *     worked days, so an absence never reads as an unpunctual arrival.
 *
 * Numbers are raw (no currency symbol, no thousands separators) so a
 * spreadsheet can sum them; dates are `DD/MM/YYYY`, clock times `HH:mm`. The PDF
 * is the human-readable artifact. Sections with no rows are omitted rather than
 * written as a header with no body.
 */

import { downloadCsv, toSectionedCsv, type CsvSection } from "@/lib/csv"
import { formatEnGbDate, formatEnGbTime } from "@/lib/pdf/format"
import type { ClockInExportPayload } from "@/pages/Reports/types/clockInReport"

const SUMMARY_HEADERS = ["Metric", "Value"]

const EMPLOYEE_HEADERS = [
  "Employee ID",
  "Employee Name",
  "Type",
  "Hire Date",
  "Active",
  "Requires Clock-In",
  "Shift",
  "Worked Days",
  "Clock-Ins",
  "Hours",
  "Avg Hours / Day",
  "On Time Days",
  "Late Days",
  "Early Days",
  "Incomplete Days",
  "Missing Days",
  "Punctuality %",
  "Deductions",
]

const RECORD_HEADERS = [
  "Employee ID",
  "Employee Name",
  "Date",
  "Clock In",
  "Clock Out",
  "Hours",
  "Late Minutes",
  "Early Minutes",
  "Deduction",
  "Status",
  "Patients",
]

const STATUS_HEADERS = ["Status", "Days"]

const HOURS_HEADERS = ["Employee ID", "Employee Name", "Hours"]

/** `morning` + `08:00`–`17:00` → `morning 08:00-17:00`; empty when unset. */
function shiftCell(
  shiftType: string | null,
  start: string | null,
  end: string | null
): string {
  const parts: string[] = []
  if (shiftType) parts.push(shiftType)
  const from = start?.slice(0, 5)
  const to = end?.slice(0, 5)
  if (from && to) parts.push(`${from}-${to}`)
  return parts.join(" ")
}

/** Builds the sectioned CSV document (pure; the download wrapper is below). */
export function clockInReportCsv(payload: ClockInExportPayload): string {
  const summary = payload.summary

  const sections: CsvSection[] = [
    {
      title: "Summary",
      headers: SUMMARY_HEADERS,
      rows: [
        ["Employees", summary.totalEmployees],
        ["Clock-Ins", summary.totalClockIns],
        ["Worked Days", summary.totalWorkedDays],
        ["Total Hours", summary.totalHours],
        ["Avg Hours / Day", summary.avgHoursPerDay],
        ["Avg Hours / Employee", summary.avgHoursPerEmployee],
        ["Missing Days", summary.totalMissingDays],
        ["Deductions", summary.totalDeductions],
      ],
    },
    {
      title: "Employees",
      headers: EMPLOYEE_HEADERS,
      rows: [
        ...payload.data.map((row) => [
          row.employeeId,
          row.employeeName,
          row.employeeType,
          formatEnGbDate(row.hireDate),
          row.isActive ? "Yes" : "No",
          row.needClockIn ? "Yes" : "No",
          shiftCell(row.shiftType, row.shiftStartTime, row.shiftEndTime),
          row.attendanceSummary.workedDays,
          row.clockInCount,
          row.totalHours,
          row.avgHoursPerDay,
          row.attendanceSummary.onTimeDays,
          row.attendanceSummary.lateDays,
          row.attendanceSummary.earlyDays,
          row.attendanceSummary.incompleteDays,
          row.attendanceSummary.missingDays,
          row.attendanceSummary.punctualityRate,
          row.totalDeductions,
        ]),
        // The TOTALS row is the envelope summary, not a re-sum of the column:
        // the server's whole-set figures are the ones the KPI strip shows.
        // Per-employee averages and rates have no whole-set equivalent here, so
        // they stay blank rather than pretending to be a sum.
        [
          "TOTALS",
          "",
          "",
          "",
          "",
          "",
          "",
          summary.totalWorkedDays,
          summary.totalClockIns,
          summary.totalHours,
          summary.avgHoursPerDay,
          "",
          "",
          "",
          "",
          summary.totalMissingDays,
          "",
          summary.totalDeductions,
        ],
      ],
    },
  ]

  const recordRows = payload.data.flatMap((employee) =>
    employee.records.map((record) => [
      employee.employeeId,
      employee.employeeName,
      formatEnGbDate(record.date),
      record.clockIn ? formatEnGbTime(record.clockIn) : "",
      record.clockOut ? formatEnGbTime(record.clockOut) : "",
      record.hoursWorked,
      record.lateMinutes,
      record.earlyMinutes,
      record.payDeduction,
      record.status,
      record.patientCount,
    ])
  )

  if (recordRows.length > 0) {
    sections.push({
      title: "Daily Records",
      headers: RECORD_HEADERS,
      rows: recordRows,
    })
  }

  if (payload.charts.statusDistribution.length > 0) {
    sections.push({
      title: "Status Distribution",
      headers: STATUS_HEADERS,
      rows: payload.charts.statusDistribution.map((entry) => [
        entry.status,
        entry.count,
      ]),
    })
  }

  if (payload.charts.hoursByEmployee.length > 0) {
    sections.push({
      title: "Hours by Employee",
      headers: HOURS_HEADERS,
      rows: payload.charts.hoursByEmployee.map((entry) => [
        entry.employeeId,
        entry.employeeName,
        entry.hours,
      ]),
    })
  }

  return toSectionedCsv(sections)
}

/** Triggers the download of the clock-in CSV. */
export function exportClockInReportCsv({
  payload,
}: {
  payload: ClockInExportPayload
}): void {
  const from = payload.range.startDate.slice(0, 10)
  const to = payload.range.endDate.slice(0, 10)
  downloadCsv(`clock-in-report_${from}_${to}.csv`, clockInReportCsv(payload))
}
