/**
 * Statistics report exports — Phase 6.11.4.
 *
 * The PDF and CSV are pure functions of the export payload, so the layout rules
 * the phase gates call out are asserted here instead of by eye:
 *
 *   - the KPI table carries billed **and** collected **and** outstanding (the
 *     legacy export only had billed),
 *   - there is no occupancy line anywhere,
 *   - every section prints the numbers behind its chart, including a revenue
 *     TOTALS row that reconciles with the KPI table,
 *   - a range with no activity says so once, instead of printing eight empty
 *     tables,
 *   - the CSV is sectioned (one table per series) and its summary matches.
 */

import { describe, expect, it } from "vitest"

import { statisticsReportCsv } from "@/pages/Reports/export/csv/exportStatisticsReportCsv"
import { statisticsReportDocContent } from "@/pages/Reports/export/pdf/buildStatisticsReportPdf"
import type { StatisticsReportExportPayload } from "@/pages/Reports/types/statisticsReport"

function payload(
  overrides: Partial<StatisticsReportExportPayload> = {}
): StatisticsReportExportPayload {
  return {
    generatedAt: "2026-10-27T10:00:00.000Z",
    range: { startDate: "2026-01-01", endDate: "2026-03-31", grouping: "month" },
    kpis: {
      totalPatients: 3,
      totalAdmissions: 3,
      totalDischarges: 1,
      avgStayDays: 10,
      totalBilled: 2300,
      totalCollected: 1800,
      totalOutstanding: 500,
    },
    patientCensus: [
      { period: "2026-01", year: 2026, month: 1, day: 1, census: 1, admissions: 1 },
      { period: "2026-02", year: 2026, month: 2, day: 1, census: 2, admissions: 1 },
      { period: "2026-03", year: 2026, month: 3, day: 1, census: 2, admissions: 1 },
    ],
    distribution: {
      paymentType: [
        { key: "cash", count: 2 },
        { key: "insurance", count: 1 },
      ],
      gender: [
        { key: "male", count: 2 },
        { key: "female", count: 1 },
      ],
    },
    averageStay: [
      { period: "2026-01", year: 2026, month: 1, day: 1, discharges: 0, avgStayDays: 0 },
      { period: "2026-02", year: 2026, month: 2, day: 1, discharges: 1, avgStayDays: 10 },
      { period: "2026-03", year: 2026, month: 3, day: 1, discharges: 0, avgStayDays: 0 },
    ],
    revenueTrends: [
      {
        period: "2026-01",
        year: 2026,
        month: 1,
        day: 1,
        billed: 0,
        collected: 0,
        outstanding: 0,
        billCount: 0,
        avgBillAmount: 0,
      },
      {
        period: "2026-02",
        year: 2026,
        month: 2,
        day: 1,
        billed: 2300,
        collected: 1800,
        outstanding: 500,
        billCount: 2,
        avgBillAmount: 1150,
      },
      {
        period: "2026-03",
        year: 2026,
        month: 3,
        day: 1,
        billed: 0,
        collected: 0,
        outstanding: 0,
        billCount: 0,
        avgBillAmount: 0,
      },
    ],
    admissionDischarge: [
      {
        period: "2026-01",
        year: 2026,
        month: 1,
        day: 1,
        admissions: 1,
        discharges: 0,
        netChange: 1,
      },
      {
        period: "2026-02",
        year: 2026,
        month: 2,
        day: 1,
        admissions: 1,
        discharges: 1,
        netChange: 0,
      },
    ],
    topServices: [
      {
        serviceId: 4,
        serviceName: "ICU Care",
        serviceType: "daily",
        usageCount: 1,
        totalQuantity: 1,
        totalRevenue: 1000,
      },
      {
        serviceId: 2,
        serviceName: "Medical Check",
        serviceType: "once",
        usageCount: 1,
        totalQuantity: 1,
        totalRevenue: 100,
      },
    ],
    topDrugs: [
      {
        drugId: 1,
        drugName: "Paracetamol",
        manufacturer: "PharmaCo",
        usageCount: 1,
        totalQuantity: 10,
        totalRevenue: 10,
      },
    ],
    staffUtilization: [
      {
        employeeType: "nurse",
        staffCount: 1,
        patientsServed: 1,
        avgHoursPerAssignment: 2.5,
        totalHoursWorked: 5,
        avgPatientsPerStaff: 1,
      },
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
 * Collects every `table` node (including ones nested in `stack`/`columns`).
 *
 * `textOf` only reads strings, so a table can be structurally broken and still
 * pass every text assertion — which is exactly how a width/cell mismatch once
 * shipped and made pdfmake throw `unsupported number: NaN` at render time.
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

describe("statistics report PDF", () => {
  it("prints the period, the grouping and every KPI", () => {
    const text = textOf(statisticsReportDocContent(payload()))

    expect(text).toContain("Report Period: 01/01/2026 - 31/03/2026")
    expect(text).toContain("Grouping: Month")
    expect(text).toContain("Total Patients")
    expect(text).toContain("Admissions")
    expect(text).toContain("Discharges")
    expect(text).toContain("Avg Stay (Days)")
    expect(text).toContain("Billed")
    expect(text).toContain("Collected")
    expect(text).toContain("Outstanding")
  })

  it("never mentions occupancy (the metric was removed, not faked)", () => {
    const text = textOf(statisticsReportDocContent(payload()))
    expect(text.toLowerCase()).not.toContain("occupancy")
  })

  it("prints a section and a data table per chart", () => {
    const text = textOf(statisticsReportDocContent(payload()))

    expect(text).toContain("Patient Census & Admissions")
    expect(text).toContain("Patient Distribution")
    expect(text).toContain("Average Stay Duration")
    expect(text).toContain("Revenue Trends")
    expect(text).toContain("Admissions vs Discharges")
    expect(text).toContain("Top 10 Services by Revenue")
    expect(text).toContain("Top 10 Drugs by Revenue")
    expect(text).toContain("Staff Utilization")
    expect(text).toContain("2026-02")
    expect(text).toContain("ICU Care")
    expect(text).toContain("Paracetamol")
    expect(text).toContain("NURSE")
  })

  it("reconciles the revenue totals row with the KPI table", () => {
    const text = textOf(statisticsReportDocContent(payload()))

    expect(text).toContain("TOTALS")
    // 2,300 billed / 1,800 collected / 500 outstanding, printed twice.
    expect(text.match(/2,300/g)?.length).toBeGreaterThanOrEqual(2)
    expect(text).not.toContain("NaN")
  })

  it("skips zero-discharge periods in the stay table", () => {
    const text = textOf(statisticsReportDocContent(payload()))
    const stays = text.split("Average Stay Duration")[1].split("Revenue Trends")[0]

    // February is the only month with a discharge.
    expect(stays).toContain("2026-02")
    expect(stays).not.toContain("2026-01")
  })

  it("prints the no-data note exactly once for an empty range", () => {
    const empty = payload({
      kpis: {
        totalPatients: 0,
        totalAdmissions: 0,
        totalDischarges: 0,
        avgStayDays: 0,
        totalBilled: 0,
        totalCollected: 0,
        totalOutstanding: 0,
      },
      patientCensus: [],
      distribution: { paymentType: [], gender: [] },
      averageStay: [],
      revenueTrends: [],
      admissionDischarge: [],
      topServices: [],
      topDrugs: [],
      staffUtilization: [],
    })

    const text = textOf(statisticsReportDocContent(empty))
    expect(text).toContain("No data available for the selected period.")
    expect(text.split("No data available").length).toBe(2)
    expect(text).not.toContain("NaN")
  })

  /**
   * The structural guard for pdfmake's `unsupported number: NaN`.
   *
   * A table whose `widths` array is longer than its rows makes pdfmake
   * distribute a phantom column, compute a negative remainder, and throw while
   * drawing cell backgrounds. Text assertions cannot see that, so every table
   * in the document — including the ones inside `stack` — is checked here.
   */
  it("gives every table exactly one width per column", () => {
    const tables = tablesOf(statisticsReportDocContent(payload()))

    expect(tables.length).toBeGreaterThanOrEqual(7)
    for (const table of tables) {
      for (const row of table.rows) {
        expect(row.length).toBe(table.widths.length)
      }
    }
  })

  it("keeps the guard meaningful for the sparse document too", () => {
    // No discharges and no bills: the stay and revenue tables are omitted, so
    // the check has to survive a document with only some of the sections.
    const sparse = payload({
      averageStay: [],
      revenueTrends: [],
      topServices: [],
      topDrugs: [],
      staffUtilization: [],
    })

    for (const table of tablesOf(statisticsReportDocContent(sparse))) {
      for (const row of table.rows) {
        expect(row.length).toBe(table.widths.length)
      }
    }
  })
})

describe("statistics report CSV", () => {
  it("writes the summary first, then one section per series", () => {
    const csv = statisticsReportCsv(payload())
    const lines = csv.trim().split(/\r?\n/)

    expect(lines[0]).toBe("Metric,Value")
    expect(csv).toContain("Grouping,month")
    expect(csv).toContain("Patient Census")
    expect(csv).toContain("Revenue Trends")
    expect(csv).toContain("Admissions vs Discharges")
    expect(csv).toContain("Average Stay")
    expect(csv).toContain("Top Services")
    expect(csv).toContain("Top Drugs")
    expect(csv).toContain("Staff Utilization")
  })

  it("keeps numbers raw so a spreadsheet can sum them", () => {
    const csv = statisticsReportCsv(payload())

    expect(csv).toContain("Billed,2300")
    expect(csv).toContain("Collected,1800")
    expect(csv).toContain("Outstanding,500")
    expect(csv).not.toContain("EGP")
    expect(csv).not.toContain("NaN")
  })

  it("omits an empty top-N section instead of writing a bare header", () => {
    const csv = statisticsReportCsv(
      payload({ topServices: [], topDrugs: [] })
    )

    expect(csv).not.toContain("Top Services")
    expect(csv).not.toContain("Top Drugs")
    expect(csv).toContain("Patient Census")
  })
})
