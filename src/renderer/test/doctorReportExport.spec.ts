/**
 * Doctor report exports — Phase 6.11.2.
 *
 * The PDF and CSV are pure functions of the export payload, so the layout
 * rules the phase gates call out are asserted here instead of by eye:
 *
 *   - the distribution table covers **every** doctor with a share that can
 *     never render `NaN%` (a zero denominator is a legitimate empty report),
 *   - the doctor index and the per-doctor sections carry the whole-set totals,
 *   - admission detail is printed only when the payload attached it, which is
 *     the single-doctor document,
 *   - the CSV is one row per doctor-patient (additive), not one row per doctor.
 */

import { describe, expect, it } from "vitest"

import { doctorReportCsv } from "@/pages/Reports/export/csv/exportDoctorReportCsv"
import {
  doctorReportDocContent,
  sharePercent,
} from "@/pages/Reports/export/pdf/buildDoctorReportPdf"
import type {
  DoctorExportRow,
  DoctorPatientRow,
  DoctorReportExportPayload,
} from "@/pages/Reports/types/doctorReport"
import type { PatientReportAdmission } from "@/pages/Reports/types/patientReport"

function patient(overrides: Partial<DoctorPatientRow> = {}): DoctorPatientRow {
  return {
    patientId: 1,
    patientName: "John Doe",
    nationalId: "29001011234567",
    gender: "male",
    age: 36,
    paymentType: "cash",
    insuranceCompany: null,
    insuranceCardId: null,
    insuranceFormId: null,
    admissionsCount: 2,
    totalBilled: 500,
    totalPaid: 100,
    lastAdmissionTime: "2026-10-02T09:00:00.000Z",
    lastDischargeTime: null,
    lastDiagnosis: "Flu",
    ...overrides,
  }
}

function admission(overrides: Partial<PatientReportAdmission> = {}): PatientReportAdmission {
  return {
    patientHistoryId: 11,
    patientId: 1,
    admissionTime: "2026-10-02T09:00:00.000Z",
    dischargeTime: null,
    lengthOfStay: null,
    billId: 5,
    diagnosis: "Flu",
    leaveReason: null,
    baseTotal: 500,
    discount: 0,
    discountScope: [],
    calculatedDiscount: 0,
    vatPercentage: 0,
    vatScopeCustom: [],
    calculatedVat: 0,
    administrativeExpenses: 0,
    finalTotal: 500,
    paidAmount: 100,
    outstandingAmount: 400,
    itemsByDate: [],
    dailyStaff: [],
    ...overrides,
  }
}

function doctor(overrides: Partial<DoctorExportRow> = {}): DoctorExportRow {
  return {
    doctorId: 7,
    doctorName: "Dr. Sarah Johnson",
    doctorType: "referring",
    totals: { patients: 1, admissions: 2, billed: 500, paid: 100 },
    patients: [patient()],
    ...overrides,
  }
}

function payload(
  overrides: Partial<DoctorReportExportPayload> = {}
): DoctorReportExportPayload {
  return {
    generatedAt: "2026-10-27T10:00:00.000Z",
    range: { startDate: "2026-10-01", endDate: "2026-10-27" },
    summary: {
      relationship: "referred",
      totalDoctors: 2,
      totalPatients: 3,
      totalPatientAssignments: 4,
      totalAdmissions: 5,
      totalBilled: 1500,
      totalPaid: 500,
    },
    data: [
      doctor(),
      doctor({
        doctorId: 8,
        doctorName: "Dr. Adam Referrer",
        totals: { patients: 3, admissions: 3, billed: 1000, paid: 400 },
        patients: [patient({ patientId: 2, patientName: "Jane Roe" })],
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

describe("doctor report share", () => {
  it("never renders NaN for a zero denominator", () => {
    expect(sharePercent(0, 0)).toBe("-")
    expect(sharePercent(5, 0)).toBe("-")
    expect(sharePercent(1, 4)).toBe("25.0%")
  })
})

describe("doctor report PDF", () => {
  it("prints the unique count, the additive assignments and the totals strip", () => {
    const text = textOf(doctorReportDocContent(payload()))

    expect(text).toContain("Unique Patients")
    expect(text).toContain("Patient-Doctor Assignments")
    expect(text).toContain("Report Period: 01/10/2026 - 27/10/2026")
    // Totals row of the index: additive patients, not the deduplicated count.
    expect(text).toContain("TOTALS")
    expect(text).not.toContain("NaN%")
  })

  it("covers every doctor in the distribution table, not just the first page", () => {
    const text = textOf(doctorReportDocContent(payload()))

    expect(text).toContain("Patient Distribution")
    expect(text).toContain("Dr. Sarah Johnson")
    expect(text).toContain("Dr. Adam Referrer")
    expect(text).toContain("25.0%")
    expect(text).toContain("75.0%")
  })

  it("skips the distribution section for a single-doctor document", () => {
    const single = payload({ data: [doctor()] })
    const text = textOf(doctorReportDocContent(single))

    expect(text).not.toContain("Patient Distribution")
    expect(text).toContain("Dr. Sarah Johnson")
  })

  it("prints admission detail only when the payload attached it", () => {
    const withoutAdmissions = textOf(doctorReportDocContent(payload()))
    expect(withoutAdmissions).not.toContain("Admission Detail")

    const withAdmissions = textOf(
      doctorReportDocContent(
        payload({
          data: [
            doctor({
              patients: [
                patient({ admissions: [admission(), admission({ patientHistoryId: 12 })] }),
              ],
            }),
          ],
        })
      )
    )

    expect(withAdmissions).toContain("Admission Detail")
    expect(withAdmissions).toContain("Admission 02/10/2026")
    expect(withAdmissions).toContain("Bill ID: 5")
  })
})

describe("doctor report CSV", () => {
  it("writes one row per doctor-patient, with the doctor totals repeated", () => {
    const csv = doctorReportCsv(payload())
    const lines = csv.trim().split(/\r?\n/)

    // header + (1 patient for doctor 7) + (1 patient for doctor 8)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain("Doctor Name")
    expect(lines[0]).toContain("Patient Name")
    expect(lines[1]).toContain("Dr. Sarah Johnson")
    expect(lines[1]).toContain("John Doe")
    expect(lines[2]).toContain("Jane Roe")
    // No admissions were attached, so no second section is implied.
    expect(csv).not.toContain("Admission #")
  })

  it("adds an admissions section when the export carried them", () => {
    const csv = doctorReportCsv(
      payload({
        data: [
          doctor({
            patients: [patient({ admissions: [admission()] })],
          }),
        ],
      })
    )

    expect(csv).toContain("Admission #")
    expect(csv).toContain("Admissions")
    expect(csv.trim().split(/\r?\n/).length).toBeGreaterThan(3)
  })
})
