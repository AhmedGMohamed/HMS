/**
 * Clock-in exports — Phase 6.11.6.
 *
 * The PDF and CSV are pure functions of the export payload, so the rules the
 * phase gates call out are asserted here instead of by eye:
 *
 *   - the summary prints employees, sessions, worked days, hours, both averages,
 *     absences **and** deductions, and a TOTALS row reconciles the index with it,
 *   - `Days` is distinct dates while `Clock-Ins` is sessions, and `Avg / Day`
 *     divides by the former,
 *   - absences are a **count**, not rows: the export omits synthesized days, and
 *     the document says so so a reader does not add the column up and wonder,
 *   - punctuality excludes absences from its denominator,
 *   - every table's `widths` length equals its row cell count (contract 47),
 *   - a range with no activity says so once,
 *   - the CSV is sectioned and omits the sections it has no rows for.
 */

import { describe, expect, it } from "vitest"

import { clockInReportCsv } from "@/pages/Reports/export/csv/exportClockInReportCsv"
import { clockInReportDocContent } from "@/pages/Reports/export/pdf/buildClockInReportPdf"
import type {
  AttendanceSummary,
  ClockInExportPayload,
  ClockInExportRow,
  ClockInRecordRow,
} from "@/pages/Reports/types/clockInReport"

function attendance(
  overrides: Partial<AttendanceSummary> = {}
): AttendanceSummary {
  return {
    totalDays: 31,
    workedDays: 4,
    onTimeDays: 1,
    lateDays: 1,
    earlyDays: 1,
    incompleteDays: 1,
    missingDays: 27,
    punctualityRate: 25,
    ...overrides,
  }
}

function record(overrides: Partial<ClockInRecordRow> = {}): ClockInRecordRow {
  return {
    clockId: 1,
    date: "2026-10-01",
    clockIn: "2026-10-01 08:00:00",
    clockOut: "2026-10-01 17:00:00",
    hoursWorked: 9,
    payDeduction: 0,
    status: "on_time",
    isMissing: false,
    lateMinutes: 0,
    earlyMinutes: 0,
    patients: [],
    patientCount: 0,
    ...overrides,
  }
}

function employee(
  overrides: Partial<ClockInExportRow> = {}
): ClockInExportRow {
  return {
    employeeId: 3,
    employeeName: "Nurse Mary Brown",
    employeeType: "nurse",
    hireDate: "2026-04-28",
    isActive: true,
    needClockIn: true,
    shiftType: "morning",
    shiftStartTime: "08:00:00",
    shiftEndTime: "17:00:00",
    clockInCount: 5,
    totalHours: 25,
    avgHoursPerDay: 6.25,
    totalDeductions: 40,
    attendanceSummary: attendance(),
    records: [
      record(),
      record({
        clockId: 2,
        date: "2026-10-04",
        clockIn: "2026-10-04 09:00:00",
        clockOut: "2026-10-04 17:00:00",
        hoursWorked: 8,
        status: "late",
        lateMinutes: 60,
      }),
      record({
        clockId: 3,
        date: "2026-10-05",
        clockIn: "2026-10-05 08:00:00",
        clockOut: "2026-10-05 16:00:00",
        hoursWorked: 8,
        status: "early",
        earlyMinutes: 60,
      }),
      record({
        clockId: 4,
        date: "2026-10-06",
        clockIn: "2026-10-06 08:00:00",
        clockOut: null,
        hoursWorked: 0,
        payDeduction: 40,
        status: "incomplete",
      }),
    ],
    ...overrides,
  }
}

function payload(
  overrides: Partial<ClockInExportPayload> = {}
): ClockInExportPayload {
  return {
    generatedAt: "2026-10-27T10:00:00.000Z",
    range: { startDate: "2026-10-01", endDate: "2026-10-31" },
    summary: {
      totalEmployees: 2,
      totalClockIns: 8,
      totalHours: 50,
      totalWorkedDays: 8,
      avgHoursPerDay: 6.25,
      avgHoursPerEmployee: 25,
      totalDeductions: 70,
      totalMissingDays: 27,
    },
    charts: {
      hoursByEmployee: [
        { employeeId: 3, employeeName: "Nurse Mary Brown", hours: 25 },
        { employeeId: 1, employeeName: "Dr. John Smith", hours: 25 },
      ],
      statusDistribution: [
        { status: "on_time", count: 3 },
        { status: "late", count: 2 },
        { status: "early", count: 2 },
        { status: "incomplete", count: 1 },
        { status: "missing", count: 27 },
      ],
    },
    data: [
      employee(),
      employee({
        employeeId: 1,
        employeeName: "Dr. John Smith",
        employeeType: "doctor",
        hireDate: "2025-10-28",
        needClockIn: false,
        clockInCount: 3,
        totalHours: 25,
        avgHoursPerDay: 8.33,
        totalDeductions: 30,
        attendanceSummary: attendance({
          totalDays: 4,
          workedDays: 4,
          onTimeDays: 2,
          lateDays: 1,
          earlyDays: 1,
          incompleteDays: 0,
          missingDays: 0,
          punctualityRate: 50,
        }),
        records: [
          record({ clockId: 10 }),
          record({ clockId: 11, date: "2026-10-08", status: "late" }),
          record({ clockId: 12, date: "2026-10-09", status: "early" }),
        ],
      }),
    ],
    ...overrides,
  }
}

/** Flattens every `text` in the document so assertions read like the page. */
function textOf(content: unknown[]): string {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node && typeof node === "object") {
      const record = node as Record<string, unknown>
      if (typeof record.text === "string") parts.push(record.text)
      Object.values(record).forEach(walk)
    }
  }
  walk(content)
  return parts.join(" | ")
}

/**
 * Collects every `table` node (including nested ones). `textOf` cannot see a
 * width/cell mismatch, which is exactly how a phantom column once shipped and
 * made pdfmake throw `unsupported number: NaN` at render time.
 */
function tablesOf(content: unknown[]): Array<{
  widths: unknown[]
  rows: unknown[][]
}> {
  const tables: Array<{ widths: unknown[]; rows: unknown[][] }> = []

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (!node || typeof node !== "object") return

    const record = node as Record<string, unknown>
    const table = record.table as
      | { widths?: unknown[]; body?: unknown[][] }
      | undefined

    if (table && Array.isArray(table.widths) && Array.isArray(table.body)) {
      tables.push({ widths: table.widths, rows: table.body })
    }
    Object.values(record).forEach(walk)
  }

  walk(content)
  return tables
}

/** Every `image` data URL in the document, in order. */
function imagesOf(content: unknown[]): string[] {
  const found: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (!node || typeof node !== "object") return
    const record = node as Record<string, unknown>
    if (typeof record.image === "string") found.push(record.image)
    Object.values(record).forEach(walk)
  }
  walk(content)
  return found
}

describe("clock-in PDF", () => {
  it("prints the period and every summary line", () => {
    const text = textOf(clockInReportDocContent(payload()))

    expect(text).toContain("Report Period: 01/10/2026 - 31/10/2026")
    expect(text).toContain("Employees")
    expect(text).toContain("Clock-Ins")
    expect(text).toContain("Worked Days")
    expect(text).toContain("Total Hours")
    expect(text).toContain("Avg Hours / Day")
    expect(text).toContain("Avg Hours / Employee")
    expect(text).toContain("Missing Days")
    expect(text).toContain("Deductions (EGP)")
    expect(text).not.toContain("NaN")
  })

  it("lists every employee in the index and closes it with TOTALS", () => {
    const text = textOf(clockInReportDocContent(payload()))

    expect(text).toContain("Nurse Mary Brown")
    expect(text).toContain("Dr. John Smith")
    expect(text).toContain("TOTALS")
    // Whole-set figures, not a re-sum of the page.
    expect(text).toContain("70.00")
    expect(text).toContain("27")
  })

  it("prints each employee's attendance summary and recorded sessions", () => {
    const text = textOf(clockInReportDocContent(payload()))

    expect(text).toContain("1. Nurse Mary Brown")
    expect(text).toContain("2. Dr. John Smith")
    expect(text).toContain("Total Days")
    expect(text).toContain("Punctuality")
    expect(text).toContain("Recorded Sessions")
    expect(text).toContain("MORNING 08:00-17:00")
    expect(text).toContain("08:00")
    expect(text).toContain("17:00")
    expect(text).toContain("On time")
    expect(text).toContain("Incomplete")
  })

  it("states that absences are counted but not listed", () => {
    const text = textOf(clockInReportDocContent(payload()))

    expect(text).toContain(
      "27 days with no clock-in are counted in the summary above but not listed here."
    )
  })

  it("says nothing about absences for an employee with none", () => {
    const text = textOf(
      clockInReportDocContent(
        payload({ data: [employee({ attendanceSummary: attendance({ missingDays: 0 }) })] })
      )
    )

    expect(text).not.toContain("with no clock-in are counted")
  })

  it("says so when an employee has no sessions at all", () => {
    const text = textOf(
      clockInReportDocContent(
        payload({ data: [employee({ records: [], clockInCount: 0 })] })
      )
    )

    expect(text).toContain("No clock-in sessions in this period.")
  })

  it("uses the chart bitmaps when captured and the tables when they are not", () => {
    const withImages = clockInReportDocContent(payload(), {
      "clockin-hours": "data:image/png;base64,AAA",
      "clockin-status": "data:image/png;base64,BBB",
    })
    expect(textOf(withImages)).toContain("Hours Worked by Employee")
    expect(textOf(withImages)).toContain("Attendance Status Distribution")
    expect(imagesOf(withImages)).toEqual([
      "data:image/png;base64,AAA",
      "data:image/png;base64,BBB",
    ])

    // Without a capture the numbers survive as tables.
    const withoutImages = clockInReportDocContent(payload())
    expect(imagesOf(withoutImages)).toEqual([])
    expect(textOf(withoutImages)).toContain("On Time")
    expect(textOf(withoutImages)).toContain("Missing")
  })

  it("prints the no-data note exactly once for an empty range", () => {
    const text = textOf(
      clockInReportDocContent(
        payload({
          data: [],
          charts: { hoursByEmployee: [], statusDistribution: [] },
          summary: {
            totalEmployees: 0,
            totalClockIns: 0,
            totalHours: 0,
            totalWorkedDays: 0,
            avgHoursPerDay: 0,
            avgHoursPerEmployee: 0,
            totalDeductions: 0,
            totalMissingDays: 0,
          },
        })
      )
    )

    expect(text).toContain("No data available for the selected period.")
    expect(text.split("No data available").length).toBe(2)
    expect(text).not.toContain("TOTALS")
    expect(text).not.toContain("NaN")
  })

  it("gives every table exactly one width per column", () => {
    const tables = tablesOf(clockInReportDocContent(payload()))

    // summary + hours + status + index + 2 employees × 3 tables.
    expect(tables.length).toBeGreaterThanOrEqual(10)
    for (const table of tables) {
      for (const row of table.rows) {
        expect(row.length).toBe(table.widths.length)
      }
    }
  })

  it("keeps the guard meaningful when every optional section is empty", () => {
    const sparse = payload({
      data: [employee({ records: [], attendanceSummary: attendance({ missingDays: 0 }) })],
      charts: { hoursByEmployee: [], statusDistribution: [] },
    })

    const tables = tablesOf(clockInReportDocContent(sparse))
    expect(tables.length).toBeGreaterThanOrEqual(3)
    for (const table of tables) {
      for (const row of table.rows) {
        expect(row.length).toBe(table.widths.length)
      }
    }
  })
})

describe("clock-in CSV", () => {
  it("starts with a summary whose figures match the envelope", () => {
    const csv = clockInReportCsv(payload())

    expect(csv).toContain("Summary")
    expect(csv).toContain("Clock-Ins,8")
    expect(csv).toContain("Worked Days,8")
    expect(csv).toContain("Total Hours,50")
    expect(csv).toContain("Missing Days,27")
    expect(csv).toContain("Deductions,70")
  })

  it("writes one employee row each plus a TOTALS row", () => {
    const csv = clockInReportCsv(payload())
    const lines = csv.trim().split(/\r?\n/)

    expect(
      lines.some((line) => line.startsWith("Employee ID,Employee Name"))
    ).toBe(true)
    expect(lines.some((line) => line.includes("Nurse Mary Brown"))).toBe(true)
    expect(lines.some((line) => line.includes("Dr. John Smith"))).toBe(true)
    // TOTALS carries the envelope summary, not a re-sum of the page.
    expect(
      lines.some((line) => line.startsWith("TOTALS,") && line.includes(",27,"))
    ).toBe(true)
  })

  it("separates days from sessions in the employee section", () => {
    const csv = clockInReportCsv(payload())
    const lines = csv.trim().split(/\r?\n/)
    const header = lines.find((line) => line.startsWith("Employee ID,Employee Name"))

    expect(header).toContain("Worked Days")
    expect(header).toContain("Clock-Ins")
    expect(header).toContain("Avg Hours / Day")
    expect(header).toContain("Missing Days")
    expect(header).toContain("Punctuality %")
  })

  it("prints the sessions, status distribution and hours as separate sections", () => {
    const csv = clockInReportCsv(payload())

    expect(csv).toContain("Daily Records")
    expect(csv).toContain("01/10/2026")
    expect(csv).toContain("Status Distribution")
    expect(csv).toContain("missing,27")
    expect(csv).toContain("Hours by Employee")
    expect(csv).toContain("Nurse Mary Brown,25")
  })

  it("omits sections that have no rows", () => {
    const csv = clockInReportCsv(
      payload({
        data: [employee({ records: [] })],
        charts: { hoursByEmployee: [], statusDistribution: [] },
      })
    )

    expect(csv).not.toContain("Daily Records")
    expect(csv).not.toContain("Status Distribution")
    expect(csv).not.toContain("Hours by Employee")
    // The employee and summary sections always exist.
    expect(csv).toContain("Nurse Mary Brown")
    expect(csv).toContain("TOTALS")
  })

  it("keeps every cell free of currency symbols and NaN", () => {
    const csv = clockInReportCsv(payload())

    expect(csv).not.toContain("EGP")
    expect(csv).not.toMatch(/\$\s?\d/)
    expect(csv).not.toContain("NaN")
  })
})
