/**
 * Employee payments (payroll) exports — Phase 6.11.5.
 *
 * The PDF and CSV are pure functions of the export payload, so the rules the
 * phase gates call out are asserted here instead of by eye:
 *
 *   - the summary prints base, extra, deductions, paid, unpaid **and** net, and
 *     a TOTALS row reconciles the employee index with it,
 *   - deductions appear as a **period** table, never as a per-payment column
 *     (plan D15 — the legacy bug),
 *   - paid/unpaid are gross while only Net subtracts deductions,
 *   - every table's `widths` length equals its row cell count (contract 47),
 *   - a range with no activity says so once,
 *   - the CSV is sectioned and omits the sections it has no rows for.
 */

import { describe, expect, it } from "vitest"

import { employeePaymentsReportCsv } from "@/pages/Reports/export/csv/exportEmployeePaymentsCsv"
import { employeePaymentsReportDocContent } from "@/pages/Reports/export/pdf/buildEmployeePaymentsReportPdf"
import type {
  EmployeePaymentExportPayload,
  EmployeePaymentExportPayment,
  EmployeePaymentExportRow,
  PaymentAssociationRow,
  PeriodDeductionRow,
} from "@/pages/Reports/types/employeePaymentReport"

function association(
  overrides: Partial<PaymentAssociationRow> = {}
): PaymentAssociationRow {
  return {
    paymentPatientId: 1,
    patientId: 10,
    patientName: "John Doe",
    patientHistoryId: 5,
    admissionTime: "2026-10-01T09:00:00.000Z",
    dischargeTime: "2026-10-04T11:00:00.000Z",
    diagnosis: "Flu",
    workDate: "2026-10-05",
    hoursWorked: 8,
    paymentAmount: 200,
    paymentType: "per_patient",
    ...overrides,
  }
}

function payment(
  overrides: Partial<EmployeePaymentExportPayment> = {}
): EmployeePaymentExportPayment {
  return {
    paymentId: 101,
    paymentDate: "2026-10-10T10:00:00.000Z",
    paymentAmount: 1000,
    extraAmount: 250,
    extraPaymentType: null,
    paymentType: "salary",
    percentageScope: null,
    isPaid: true,
    paidTimestamp: "2026-10-11T12:00:00.000Z",
    paidBy: "Admin",
    patientCount: 1,
    associations: [association()],
    ...overrides,
  }
}

function deduction(
  overrides: Partial<PeriodDeductionRow> = {}
): PeriodDeductionRow {
  return {
    clockId: 1,
    clockIn: "2026-10-02T08:20:00.000Z",
    clockOut: "2026-10-02T16:00:00.000Z",
    hoursWorked: 7.5,
    payDeduction: 75,
    status: "late",
    ...overrides,
  }
}

function employee(
  overrides: Partial<EmployeePaymentExportRow> = {}
): EmployeePaymentExportRow {
  return {
    employeeId: 1,
    employeeName: "Dr. Sarah Ahmed",
    employeeType: "doctor",
    hireDate: "2020-01-15",
    totals: {
      payments: 2,
      basePay: 2000,
      extraPay: 500,
      deductions: 75,
      paid: 2500,
      unpaid: 0,
      net: 2425,
    },
    breakdown: {
      basePay: 1000,
      baseExtraAmount: 0,
      baseExtraPaymentType: null,
      perPatientPaymentType: "fixed",
      percentageScope: null,
      needClockIn: true,
      shiftType: "morning",
      shiftStartTime: "08:00:00",
      shiftEndTime: "16:00:00",
      totalWorkDays: 20,
      totalPatientsServed: 15,
    },
    payments: [
      payment(),
      payment({
        paymentId: 102,
        paymentDate: "2026-10-20T10:00:00.000Z",
        paymentAmount: 1000,
        extraAmount: 250,
        isPaid: false,
        paidTimestamp: null,
        paidBy: null,
        patientCount: 0,
        associations: [],
      }),
    ],
    periodDeductions: [deduction()],
    ...overrides,
  }
}

function payload(
  overrides: Partial<EmployeePaymentExportPayload> = {}
): EmployeePaymentExportPayload {
  return {
    generatedAt: "2026-10-27T10:00:00.000Z",
    range: { startDate: "2026-10-01", endDate: "2026-10-31" },
    grouping: "month",
    summary: {
      totalEmployees: 2,
      totalPayments: 3,
      totalBasePay: 3000,
      totalExtraPay: 1000,
      totalDeductions: 105,
      totalPaid: 2500,
      totalUnpaid: 1500,
      totalNet: 3895,
    },
    charts: {
      timeline: [{ period: "2026-10", total: 4000 }],
      byType: [
        { paymentType: "salary", total: 2500 },
        { paymentType: "bonus", total: 1500 },
      ],
    },
    data: [
      employee(),
      employee({
        employeeId: 2,
        employeeName: "Nurse Mona Ali",
        employeeType: "nurse",
        hireDate: "2022-05-01",
        totals: {
          payments: 1,
          basePay: 1000,
          extraPay: 500,
          deductions: 30,
          paid: 0,
          unpaid: 1500,
          net: 1470,
        },
        breakdown: {
          basePay: 1000,
          baseExtraAmount: 500,
          baseExtraPaymentType: "income",
          perPatientPaymentType: null,
          percentageScope: null,
          needClockIn: false,
          shiftType: null,
          shiftStartTime: null,
          shiftEndTime: null,
          totalWorkDays: 10,
          totalPatientsServed: 4,
        },
        payments: [
          payment({
            paymentId: 201,
            paymentAmount: 1000,
            extraAmount: 500,
            isPaid: false,
            paidTimestamp: null,
            paidBy: null,
            patientCount: 0,
            associations: [],
          }),
        ],
        periodDeductions: [],
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

describe("employee payments PDF", () => {
  it("prints the period and every money line of the summary", () => {
    const text = textOf(employeePaymentsReportDocContent(payload()))

    expect(text).toContain("Report Period: 01/10/2026 - 31/10/2026")
    expect(text).toContain("Employees")
    expect(text).toContain("Base Pay")
    expect(text).toContain("Extra Pay")
    expect(text).toContain("Deductions")
    expect(text).toContain("Paid (gross)")
    expect(text).toContain("Unpaid (gross)")
    expect(text).toContain("Net Pay")
    expect(text).not.toContain("NaN")
  })

  it("lists every employee in the index and closes it with TOTALS", () => {
    const text = textOf(employeePaymentsReportDocContent(payload()))

    expect(text).toContain("Dr. Sarah Ahmed")
    expect(text).toContain("Nurse Mona Ali")
    expect(text).toContain("TOTALS")
    // Summary net 3,895 appears in the summary table and in the TOTALS row.
    expect(text.match(/3,895\.00/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it("prints each employee's configuration, payments, work and deductions", () => {
    const text = textOf(employeePaymentsReportDocContent(payload()))

    expect(text).toContain("1. Dr. Sarah Ahmed")
    expect(text).toContain("2. Nurse Mona Ali")
    expect(text).toContain("Requires Clock-In")
    expect(text).toContain("Patient Work")
    expect(text).toContain("Clock-In Deductions")
    expect(text).toContain("Counted once for the period, not once per payment.")
    expect(text).toContain("John Doe")
    expect(text).toContain("10/10/2026")
  })

  it("states gross paid/unpaid while only net subtracts deductions", () => {
    const text = textOf(employeePaymentsReportDocContent(payload()))

    // Employee 1: base 2,000 + extra 500 = gross 2,500 paid, net 2,425.
    expect(text).toContain("2,500.00")
    expect(text).toContain("2,425.00")
    // Employee 2: gross 1,500 unpaid, net 1,470.
    expect(text).toContain("1,500.00")
    expect(text).toContain("1,470.00")
  })

  it("says so when an employee has no payments or deductions", () => {
    const text = textOf(
      employeePaymentsReportDocContent(
        payload({ data: [employee({ payments: [], periodDeductions: [] })] })
      )
    )

    expect(text).toContain("No payments in this period.")
    expect(text).toContain("No clock-in deductions in this period.")
  })

  it("uses the timeline bitmap when captured and the table when it is not", () => {
    const withImage = textOf(
      employeePaymentsReportDocContent(payload(), {
        "payroll-timeline": "data:image/png;base64,AAA",
        "payroll-type": "data:image/png;base64,BBB",
      })
    )
    // The bitmap replaces the bucket table, so its header disappears.
    expect(withImage).toContain("Payment Timeline")
    expect(withImage).not.toContain("Gross Pay")

    const withoutImage = textOf(employeePaymentsReportDocContent(payload()))
    expect(withoutImage).toContain("Gross Pay")
    expect(withoutImage).toContain("2026-10")
  })

  it("prints the no-data note exactly once for an empty range", () => {
    const text = textOf(
      employeePaymentsReportDocContent(
        payload({
          data: [],
          charts: { timeline: [], byType: [] },
          summary: {
            totalEmployees: 0,
            totalPayments: 0,
            totalBasePay: 0,
            totalExtraPay: 0,
            totalDeductions: 0,
            totalPaid: 0,
            totalUnpaid: 0,
            totalNet: 0,
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
    const tables = tablesOf(employeePaymentsReportDocContent(payload()))

    // summary + timeline + type + index + 2 employees × 4 tables.
    expect(tables.length).toBeGreaterThanOrEqual(10)
    for (const table of tables) {
      for (const row of table.rows) {
        expect(row.length).toBe(table.widths.length)
      }
    }
  })

  it("keeps the guard meaningful when every optional section is empty", () => {
    const sparse = payload({
      data: [employee({ payments: [], periodDeductions: [] })],
      charts: { timeline: [], byType: [] },
    })

    const tables = tablesOf(employeePaymentsReportDocContent(sparse))
    expect(tables.length).toBeGreaterThanOrEqual(3)
    for (const table of tables) {
      for (const row of table.rows) {
        expect(row.length).toBe(table.widths.length)
      }
    }
  })
})

describe("employee payments CSV", () => {
  it("starts with a summary whose net matches the envelope", () => {
    const csv = employeePaymentsReportCsv(payload())

    expect(csv).toContain("Summary")
    expect(csv).toContain("Net Pay,3895")
    expect(csv).toContain("Paid (gross),2500")
    expect(csv).toContain("Unpaid (gross),1500")
  })

  it("writes one employee row each plus a TOTALS row", () => {
    const csv = employeePaymentsReportCsv(payload())
    const lines = csv.trim().split(/\r?\n/)

    expect(lines.some((line) => line.startsWith("Employee ID,Employee Name"))).toBe(
      true
    )
    expect(lines.some((line) => line.includes("Dr. Sarah Ahmed"))).toBe(true)
    expect(lines.some((line) => line.includes("Nurse Mona Ali"))).toBe(true)
    // TOTALS carries the envelope summary, not a re-sum of the page.
    expect(lines.some((line) => line.startsWith("TOTALS,,,,") && line.includes("3895"))).toBe(
      true
    )
  })

  it("prints payments, patient work and deductions as separate sections", () => {
    const csv = employeePaymentsReportCsv(payload())

    expect(csv).toContain("Payments")
    expect(csv).toContain("Patient Work")
    expect(csv).toContain("Period Deductions")
    expect(csv).toContain("John Doe")
    expect(csv).toContain("05/10/2026")
    // Deductions are a period column, never repeated per payment.
    expect(csv).toContain("late")
  })

  it("writes the chart series as their own sections", () => {
    const csv = employeePaymentsReportCsv(payload())

    expect(csv).toContain("Payment Timeline")
    expect(csv).toContain("2026-10,4000")
    expect(csv).toContain("Payment Types")
    expect(csv).toContain("salary,2500")
  })

  it("omits sections that have no rows", () => {
    const csv = employeePaymentsReportCsv(
      payload({
        data: [employee({ payments: [], periodDeductions: [] })],
        charts: { timeline: [], byType: [] },
      })
    )

    expect(csv).not.toContain("Patient Work")
    expect(csv).not.toContain("Period Deductions")
    expect(csv).not.toContain("Payment Timeline")
    expect(csv).not.toContain("Payment Types")
    // The employee and summary sections always exist.
    expect(csv).toContain("Dr. Sarah Ahmed")
    expect(csv).toContain("TOTALS")
  })

  it("keeps every cell free of currency symbols and NaN", () => {
    const csv = employeePaymentsReportCsv(payload())

    expect(csv).not.toContain("EGP")
    expect(csv).not.toContain("$")
    expect(csv).not.toContain("NaN")
  })
})
