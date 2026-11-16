/**
 * Nurse report exports — Phase 6.11.3.
 *
 * The PDF and CSV are pure functions of the export payload, so the layout rules
 * the phase gates call out are asserted here instead of by eye:
 *
 *   - the summary prints the deduplicated patient count **and** the additive
 *     assignment count, so the index column sum can be reconciled,
 *   - the distribution table covers **every** nurse with a share of total hours
 *     that can never render `NaN%` (a zero denominator is an empty report),
 *   - a single-nurse document skips the distribution section,
 *   - the daily assignment table is the paper form of the screen accordion,
 *   - the CSV has one row per nurse-patient plus one row per daily assignment.
 */

import { describe, expect, it } from "vitest"

import { nurseReportCsv } from "@/pages/Reports/export/csv/exportNurseReportCsv"
import { nurseReportDocContent } from "@/pages/Reports/export/pdf/buildNurseReportPdf"
import { sharePercent } from "@/pages/Reports/export/pdf/buildDoctorReportPdf"
import type {
  NurseDailyAssignment,
  NurseExportRow,
  NursePatientRow,
  NurseReportExportPayload,
} from "@/pages/Reports/types/nurseReport"

function patient(overrides: Partial<NursePatientRow> = {}): NursePatientRow {
  return {
    patientId: 1,
    patientName: "John Doe",
    paymentType: "cash",
    lastAdmissionTime: "2026-10-02T09:00:00.000Z",
    lastDischargeTime: null,
    diagnosis: "Flu",
    daysAssigned: 3,
    hoursWorked: 9,
    ...overrides,
  }
}

function day(overrides: Partial<NurseDailyAssignment> = {}): NurseDailyAssignment {
  return {
    workDate: "2026-10-20",
    patientCount: 1,
    totalHours: 2,
    patients: [
      {
        patientId: 1,
        patientName: "John Doe",
        paymentType: "cash",
        diagnosis: "Flu",
        hoursWorked: 2,
      },
    ],
    ...overrides,
  }
}

function nurse(overrides: Partial<NurseExportRow> = {}): NurseExportRow {
  return {
    nurseId: 12,
    nurseName: "Nurse Mary Brown",
    totals: { patients: 1, days: 2, hours: 9 },
    patients: [patient()],
    dailyAssignments: [day()],
    ...overrides,
  }
}

function payload(
  overrides: Partial<NurseReportExportPayload> = {}
): NurseReportExportPayload {
  return {
    generatedAt: "2026-10-27T10:00:00.000Z",
    range: { startDate: "2026-10-01", endDate: "2026-10-27" },
    summary: {
      totalNurses: 2,
      totalPatients: 2,
      totalPatientAssignments: 3,
      totalDays: 5,
      totalHours: 20,
    },
    data: [
      nurse(),
      nurse({
        nurseId: 13,
        nurseName: "Nurse James Wilson",
        totals: { patients: 2, days: 3, hours: 11 },
        patients: [patient({ patientId: 2, patientName: "Jane Roe" })],
        dailyAssignments: [
          day({ workDate: "2026-10-21", totalHours: 3 }),
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

describe("nurse report share", () => {
  it("never renders NaN for a zero hour denominator", () => {
    expect(sharePercent(0, 0)).toBe("-")
    expect(sharePercent(5, 0)).toBe("-")
    expect(sharePercent(5, 20)).toBe("25.0%")
  })
})

describe("nurse report PDF", () => {
  it("prints the unique count, the additive assignments, days and hours", () => {
    const text = textOf(nurseReportDocContent(payload()))

    expect(text).toContain("Unique Patients")
    expect(text).toContain("Patient-Nurse Assignments")
    expect(text).toContain("Total Days")
    expect(text).toContain("Total Hours")
    expect(text).toContain("Report Period: 01/10/2026 - 27/10/2026")
    expect(text).toContain("TOTALS")
    expect(text).not.toContain("NaN%")
  })

  it("covers every nurse in the distribution table with an hours share", () => {
    const text = textOf(nurseReportDocContent(payload()))

    expect(text).toContain("Hours Distribution")
    expect(text).toContain("Nurse Mary Brown")
    expect(text).toContain("Nurse James Wilson")
    expect(text).toContain("45.0%")
    expect(text).toContain("55.0%")
  })

  it("skips the distribution section for a single-nurse document", () => {
    const text = textOf(nurseReportDocContent(payload({ data: [nurse()] })))

    expect(text).not.toContain("Hours Distribution")
    expect(text).toContain("Nurse Mary Brown")
  })

  it("prints the daily assignment table as the paper accordion", () => {
    const text = textOf(nurseReportDocContent(payload()))

    expect(text).toContain("Daily Assignments")
    expect(text).toContain("Work Date")
    expect(text).toContain("20/10/2026")
    expect(text).toContain("21/10/2026")
  })

  it("shows the no-assignments note for a nurse with only patient rows", () => {
    const text = textOf(
      nurseReportDocContent(
        payload({ data: [nurse({ dailyAssignments: [] })] })
      )
    )

    expect(text).toContain("No daily assignments in this period.")
  })
})

describe("nurse report CSV", () => {
  it("writes one row per nurse-patient with the nurse totals repeated", () => {
    const csv = nurseReportCsv(payload())
    const lines = csv.trim().split(/\r?\n/)

    // header + 1 patient for nurse 12 + 1 patient for nurse 13, plus the
    // daily section title/header/rows.
    expect(lines[0]).toContain("Nurse Name")
    expect(lines[0]).toContain("Patient Name")
    expect(lines[0]).toContain("Nurse Hours")
    expect(csv).toContain("Nurse Mary Brown")
    expect(csv).toContain("John Doe")
    expect(csv).toContain("Jane Roe")
  })

  it("adds a daily assignment section with day totals repeated", () => {
    const csv = nurseReportCsv(payload())

    expect(csv).toContain("Daily Assignments")
    expect(csv).toContain("Work Date")
    expect(csv).toContain("Day Hours")
    expect(csv).toContain("20/10/2026")
    expect(csv).toContain("21/10/2026")
  })
})
