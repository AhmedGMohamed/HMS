/**
 * Clock-in report PDF — Phase 6.11.6.
 *
 * Document order mirrors the other report exports (patient 6.11.1, doctor
 * 6.11.2, nurse 6.11.3, payroll 6.11.5) so every printed report reads the same
 * way:
 *
 *   1. Report period + whole-set summary.
 *   2. The two optional chart bitmaps (hours by employee, status distribution),
 *      captured from the English off-screen surface. When a capture failed its
 *      table is printed instead, so the numbers are never lost with the image.
 *   3. Employee index — one row per employee, the scannable overview, closed by
 *      a TOTALS row taken from the envelope summary.
 *   4. Per employee, on a new page: shift/identity, the attendance summary and
 *      every recorded session.
 *
 * ## Landscape
 *
 * The index carries fourteen columns (days, sessions, hours, four status
 * counts, absences, punctuality, deductions) and the records table nine, so the
 * page is landscape. Portrait would clip the last columns rather than wrap them.
 *
 * ## Missing days are a count, not rows
 *
 * The export deliberately does not materialize synthesized absences
 * (`synthesizeMissing: false` server-side): an employee's `records` holds real
 * sessions only, and `attendanceSummary.missingDays` states the absence count.
 * The document says so above the records table so a reader does not add the
 * column up and wonder why it is short.
 *
 * ## Days are not sessions
 *
 * `Days` is distinct worked dates, `Clock-Ins` is the session count and
 * `Avg / Day` divides hours by the former. Every table's `widths` length equals
 * its row cell count (contract 47) — a mismatch silently clips the last column
 * off the page.
 *
 * English-only labels, `DD/MM/YYYY` dates, two-decimal hours.
 */

import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import {
  formatEnGbDate,
  formatEnGbTime,
  formatMoneyEn,
  formatNumberEn,
} from "@/lib/pdf/format"
import {
  PDF_COLORS,
  SUMMARY_TABLE_WIDTHS,
  bodyCell,
  headerCell,
  plural,
  reportTableLayout,
  sectionHeading,
  sectionMeta,
  summaryRow,
  type PdfNode,
} from "@/lib/pdf/pdfTheme"
import { CLOCK_IN_SNAPSHOT_KEYS } from "@/pages/Reports/clockIns/clockInChartSnapshot"
import type {
  ClockInExportPayload,
  ClockInExportRow,
  ClockInRecordRow,
} from "@/pages/Reports/types/clockInReport"

export interface BuildClockInReportPdfInputs {
  payload: ClockInExportPayload
  t: TFunction
  language: "en" | "ar"
  /** PNG data URLs keyed by `CLOCK_IN_SNAPSHOT_KEYS` (`clockin-hours`, `clockin-status`). */
  images?: Record<string, string>
}

/** Index: employee name (`*`), then content-sized columns. */
const INDEX_WIDTHS = [
  "*",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
]

const INDEX_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Employee" },
  { label: "Type" },
  { label: "Shift" },
  { label: "Days", align: "end" },
  { label: "Clock-Ins", align: "end" },
  { label: "Hours", align: "end" },
  { label: "Avg / Day", align: "end" },
  { label: "On Time", align: "end" },
  { label: "Late", align: "end" },
  { label: "Early", align: "end" },
  { label: "Incomplete", align: "end" },
  { label: "Missing", align: "end" },
  { label: "Punctuality", align: "end" },
  { label: "Deductions", align: "end" },
]

/** Records: nine columns. */
const RECORD_WIDTHS = [
  "*",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
]

const RECORD_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Date" },
  { label: "Clock In" },
  { label: "Clock Out" },
  { label: "Hours", align: "end" },
  { label: "Late (min)", align: "end" },
  { label: "Early (min)", align: "end" },
  { label: "Deduction", align: "end" },
  { label: "Status" },
  { label: "Patients", align: "end" },
]

const HOURS_WIDTHS = ["*", "auto"]

const HOURS_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Employee" },
  { label: "Hours", align: "end" },
]

const STATUS_WIDTHS = ["*", "auto"]

const STATUS_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Status" },
  { label: "Days", align: "end" },
]

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** `08:00:00` → `08:00`; `-` when the shift is not configured. */
function shiftLabel(employee: ClockInExportRow): string {
  const start = employee.shiftStartTime?.slice(0, 5)
  const end = employee.shiftEndTime?.slice(0, 5)
  const type = employee.shiftType ? employee.shiftType.toUpperCase() : null
  if (type && start && end) return `${type} ${start}-${end}`
  if (start && end) return `${start}-${end}`
  return type ?? "-"
}

/** `on_time` → `On time`; statuses are the only snake_case labels in the doc. */
function statusLabel(status: string): string {
  const spaced = status.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

function summaryTable(payload: ClockInExportPayload): PdfNode {
  const { summary } = payload

  const body: PdfNode[][] = [
    summaryRow("Employees", String(summary.totalEmployees)),
    summaryRow("Clock-Ins", String(summary.totalClockIns)),
    summaryRow("Worked Days", String(summary.totalWorkedDays)),
    summaryRow("Total Hours", formatNumberEn(summary.totalHours)),
    summaryRow("Avg Hours / Day", formatNumberEn(summary.avgHoursPerDay)),
    summaryRow(
      "Avg Hours / Employee",
      formatNumberEn(summary.avgHoursPerEmployee)
    ),
    summaryRow("Missing Days", String(summary.totalMissingDays), {
      tone: summary.totalMissingDays > 0 ? "danger" : undefined,
    }),
    summaryRow("Deductions (EGP)", formatMoneyEn(summary.totalDeductions), {
      tone: summary.totalDeductions > 0 ? "warning" : undefined,
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 14],
  }
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

/** Optional chart bitmap; omitted when the capture failed. */
function chartImage(image: string): PdfNode {
  return {
    image,
    fit: [720, 260],
    alignment: "center",
    margin: [0, 0, 0, 10],
  }
}

function hoursTable(payload: ClockInExportPayload): PdfNode {
  const body: PdfNode[][] = [
    HOURS_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...payload.charts.hoursByEmployee.map((entry, index) =>
      [
        bodyCell(entry.employeeName, { zebra: index % 2 === 1 }),
        bodyCell(formatNumberEn(entry.hours), {
          align: "end",
          zebra: index % 2 === 1,
        }),
      ] as PdfNode[]
    ),
  ]

  return {
    table: { headerRows: 1, widths: HOURS_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 12],
  }
}

function statusTable(payload: ClockInExportPayload): PdfNode {
  const body: PdfNode[][] = [
    STATUS_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...payload.charts.statusDistribution.map((entry, index) =>
      [
        bodyCell(statusLabel(entry.status), { zebra: index % 2 === 1 }),
        bodyCell(String(entry.count), { align: "end", zebra: index % 2 === 1 }),
      ] as PdfNode[]
    ),
  ]

  return {
    table: { headerRows: 1, widths: STATUS_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 12],
  }
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

function indexRow(employee: ClockInExportRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1
  const summary = employee.attendanceSummary

  return [
    bodyCell(employee.employeeName, { zebra }),
    bodyCell(employee.employeeType.toUpperCase(), { zebra }),
    bodyCell(shiftLabel(employee), { zebra }),
    bodyCell(String(summary.workedDays), { align: "end", zebra }),
    bodyCell(String(employee.clockInCount), { align: "end", zebra }),
    bodyCell(formatNumberEn(employee.totalHours), { align: "end", zebra }),
    bodyCell(formatNumberEn(employee.avgHoursPerDay), { align: "end", zebra }),
    bodyCell(String(summary.onTimeDays), { align: "end", zebra }),
    bodyCell(String(summary.lateDays), { align: "end", zebra }),
    bodyCell(String(summary.earlyDays), { align: "end", zebra }),
    bodyCell(String(summary.incompleteDays), { align: "end", zebra }),
    bodyCell(String(summary.missingDays), { align: "end", zebra }),
    bodyCell(`${formatNumberEn(summary.punctualityRate, 0)}%`, {
      align: "end",
      zebra,
    }),
    bodyCell(formatMoneyEn(employee.totalDeductions), { align: "end", zebra }),
  ]
}

/** Totals strip across the fourteen index columns. */
function indexTotalsRow(payload: ClockInExportPayload): PdfNode[] {
  const { summary } = payload
  const cell = (text: string, align?: "start" | "end"): PdfNode => ({
    text,
    bold: true,
    fontSize: 8,
    alignment: align === "end" ? "right" : "left",
    fillColor: PDF_COLORS.bandStrong,
  })

  return [
    cell("TOTALS"),
    cell(""),
    cell(""),
    cell(String(summary.totalWorkedDays), "end"),
    cell(String(summary.totalClockIns), "end"),
    cell(formatNumberEn(summary.totalHours), "end"),
    cell(formatNumberEn(summary.avgHoursPerDay), "end"),
    cell(""),
    cell(""),
    cell(""),
    cell(""),
    cell(String(summary.totalMissingDays), "end"),
    cell(""),
    cell(formatMoneyEn(summary.totalDeductions), "end"),
  ]
}

/* ------------------------------------------------------------------ */
/* Per-employee sections                                               */
/* ------------------------------------------------------------------ */

function attendanceTable(employee: ClockInExportRow): PdfNode {
  const summary = employee.attendanceSummary

  const body: PdfNode[][] = [
    summaryRow("Total Days", String(summary.totalDays)),
    summaryRow("Worked Days", String(summary.workedDays)),
    summaryRow("On Time", String(summary.onTimeDays)),
    summaryRow("Late", String(summary.lateDays), {
      tone: summary.lateDays > 0 ? "warning" : undefined,
    }),
    summaryRow("Early", String(summary.earlyDays)),
    summaryRow("Incomplete", String(summary.incompleteDays), {
      tone: summary.incompleteDays > 0 ? "warning" : undefined,
    }),
    summaryRow("Missing", String(summary.missingDays), {
      tone: summary.missingDays > 0 ? "danger" : undefined,
    }),
    summaryRow("Punctuality", `${formatNumberEn(summary.punctualityRate, 0)}%`, {
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

function totalsTable(employee: ClockInExportRow): PdfNode {
  const body: PdfNode[][] = [
    summaryRow("Clock-Ins", String(employee.clockInCount)),
    summaryRow("Hours", formatNumberEn(employee.totalHours)),
    summaryRow("Avg Hours / Day", formatNumberEn(employee.avgHoursPerDay)),
    summaryRow("Deductions (EGP)", formatMoneyEn(employee.totalDeductions), {
      tone: employee.totalDeductions > 0 ? "warning" : undefined,
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

function recordRow(record: ClockInRecordRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(formatEnGbDate(record.date), { zebra }),
    bodyCell(record.isMissing ? "-" : formatEnGbTime(record.clockIn), { zebra }),
    bodyCell(
      record.isMissing || !record.clockOut
        ? "-"
        : formatEnGbTime(record.clockOut),
      { zebra }
    ),
    bodyCell(formatNumberEn(record.hoursWorked), { align: "end", zebra }),
    bodyCell(record.lateMinutes > 0 ? String(record.lateMinutes) : "-", {
      align: "end",
      zebra,
    }),
    bodyCell(record.earlyMinutes > 0 ? String(record.earlyMinutes) : "-", {
      align: "end",
      zebra,
    }),
    bodyCell(
      record.payDeduction > 0 ? formatMoneyEn(record.payDeduction) : "-",
      { align: "end", zebra }
    ),
    bodyCell(statusLabel(record.status), { zebra }),
    bodyCell(record.patientCount > 0 ? String(record.patientCount) : "-", {
      align: "end",
      zebra,
    }),
  ]
}

function recordsTable(employee: ClockInExportRow): PdfNode {
  const body: PdfNode[][] = [
    RECORD_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...employee.records.map((record, index) => recordRow(record, index)),
  ]

  return {
    table: { headerRows: 1, widths: RECORD_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 4],
  }
}

/** One employee's section: identity, attendance summary, totals, sessions. */
function employeeSection(employee: ClockInExportRow, index: number): PdfNode[] {
  const heading = `${index + 1}. ${employee.employeeName}`

  const content: PdfNode[] = [
    sectionHeading(heading),
    sectionMeta(
      [
        employee.employeeType.toUpperCase(),
        `Employee ID: ${employee.employeeId}`,
        employee.hireDate
          ? `Hired ${formatEnGbDate(employee.hireDate)}`
          : "Hire date not recorded",
        `Shift: ${shiftLabel(employee)}`,
        employee.needClockIn ? "Requires clock-in" : "Clock-in not required",
        employee.isActive ? "Active" : "Inactive",
        plural(employee.clockInCount, "session"),
      ].join("     •     ")
    ),
    attendanceTable(employee),
    totalsTable(employee),
  ]

  content.push({
    text: "Recorded Sessions",
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 4, 0, 2],
  })

  if (employee.attendanceSummary.missingDays > 0) {
    content.push({
      text: `${plural(
        employee.attendanceSummary.missingDays,
        "day"
      )} with no clock-in are counted in the summary above but not listed here.`,
      fontSize: 7,
      italics: true,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 4],
    })
  }

  if (employee.records.length > 0) {
    content.push(recordsTable(employee))
  } else {
    content.push({
      text: "No clock-in sessions in this period.",
      fontSize: 8,
      italics: true,
      color: PDF_COLORS.muted,
    })
  }

  return content
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

/** Builds the shell `content` array (no pdfmake side effects). */
export function clockInReportDocContent(
  payload: ClockInExportPayload,
  images: Record<string, string> = {}
): PdfNode[] {
  const period = `${formatEnGbDate(payload.range.startDate)} - ${formatEnGbDate(
    payload.range.endDate
  )}`

  const content: PdfNode[] = [
    {
      text: `Report Period: ${period}`,
      alignment: "center",
      fontSize: 9,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 4],
    },
    {
      text: "Hours are decimal. Amounts in EGP.",
      alignment: "center",
      fontSize: 8,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 12],
    },
    summaryTable(payload),
  ]

  if (payload.data.length === 0) {
    content.push({
      text: "No data available for the selected period.",
      alignment: "center",
      italics: true,
      color: PDF_COLORS.muted,
      margin: [0, 24, 0, 0],
    })
    return content
  }

  const hoursImage = images[CLOCK_IN_SNAPSHOT_KEYS.hours]
  const statusImage = images[CLOCK_IN_SNAPSHOT_KEYS.status]

  if (hoursImage || payload.charts.hoursByEmployee.length > 0) {
    content.push(sectionHeading("Hours Worked by Employee"))
    content.push(
      sectionMeta("Top employees by hours worked (up to twelve).")
    )
    // The bitmap is the readable form; the table is the fallback that keeps
    // the numbers when the capture failed.
    content.push(hoursImage ? chartImage(hoursImage) : hoursTable(payload))
  }

  if (statusImage || payload.charts.statusDistribution.length > 0) {
    content.push(sectionHeading("Attendance Status Distribution"))
    content.push(
      sectionMeta("One classification per day, including days with no clock-in.")
    )
    content.push(statusImage ? chartImage(statusImage) : statusTable(payload))
  }

  content.push({
    text: plural(payload.summary.totalEmployees, "employee"),
    fontSize: 9,
    color: PDF_COLORS.muted,
    margin: [0, 0, 0, 6],
  })

  content.push({
    table: {
      headerRows: 1,
      widths: INDEX_WIDTHS,
      body: [
        INDEX_HEADERS.map((column) => headerCell(column.label, column.align)),
        ...payload.data.map((employee, index) => indexRow(employee, index)),
        indexTotalsRow(payload),
      ],
    },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 8],
  })

  // Each employee starts on a fresh page so a section can be handed out alone.
  payload.data.forEach((employee, index) => {
    content.push({ text: "", pageBreak: "before" })
    content.push(...employeeSection(employee, index))
  })

  return content
}

export async function buildClockInReportPdf({
  payload,
  t,
  language,
  images = {},
}: BuildClockInReportPdfInputs): Promise<void> {
  await openPdfShellDoc(
    {
      title: "Clock-In Report",
      content: clockInReportDocContent(payload, images),
    },
    { t, language, pageOrientation: "landscape" }
  )
}
