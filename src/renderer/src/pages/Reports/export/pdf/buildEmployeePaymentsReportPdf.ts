/**
 * Employee payments (payroll) PDF — Phase 6.11.5.
 *
 * Document order mirrors the other report exports (patient 6.11.1, doctor
 * 6.11.2, nurse 6.11.3) so every printed report reads the same way:
 *
 *   1. Report period + whole-set summary.
 *   2. The two optional chart bitmaps (timeline, payment-type distribution),
 *      captured from the English off-screen surface. When the timeline capture
 *      failed the bucket table is printed instead, so the numbers are never
 *      lost with the image.
 *   3. Employee index — one row per employee, the scannable overview, closed by
 *      a TOTALS row taken from the envelope summary.
 *   4. Per employee, on a new page: pay configuration, totals, every payment,
 *      the patient work behind each payment and the period deductions.
 *
 * ## Money semantics the document must not blur
 *
 *   - **Deductions are a period total, once per employee** (plan D15). They are
 *     printed in their own table, never as a per-payment column.
 *   - **Paid / unpaid are gross** (`base + extra`); only Net subtracts
 *     deductions. The totals table states both so the arithmetic reconciles.
 *   - Every table's `widths` length equals its row cell count (contract 47) —
 *     a mismatch silently clips the last column off the page.
 *
 * English-only labels, `DD/MM/YYYY` dates, two-decimal amounts with no
 * thousands separator surprises (exports are stable, the screen is localized).
 */

import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import {
  formatEnGbDate,
  formatEnGbDateTime,
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
import type {
  EmployeePaymentExportPayload,
  EmployeePaymentExportPayment,
  EmployeePaymentExportRow,
  PeriodDeductionRow,
} from "@/pages/Reports/types/employeePaymentReport"
import { PAYROLL_SNAPSHOT_KEYS } from "@/pages/Reports/employeePayments/payrollChartSnapshot"

export interface BuildEmployeePaymentsReportPdfInputs {
  payload: EmployeePaymentExportPayload
  t: TFunction
  language: "en" | "ar"
  /** PNG data URLs keyed by `PAYROLL_SNAPSHOT_KEYS` (`payroll-timeline`, `payroll-type`). */
  images?: Record<string, string>
}

/** Index: employee name (`*`), then content-sized numeric columns. */
const INDEX_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto", "auto"]

const INDEX_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Employee" },
  { label: "Type" },
  { label: "Payments", align: "end" },
  { label: "Base Pay", align: "end" },
  { label: "Extra Pay", align: "end" },
  { label: "Deductions", align: "end" },
  { label: "Net Pay", align: "end" },
]

/** Payment rows: eight columns. */
const PAYMENT_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"]

const PAYMENT_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Payment ID" },
  { label: "Date" },
  { label: "Type" },
  { label: "Base", align: "end" },
  { label: "Extra", align: "end" },
  { label: "Gross", align: "end" },
  { label: "Status" },
  { label: "Paid On" },
]

/** Patient work behind one payment: seven columns. */
const WORK_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto", "auto"]

const WORK_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Patient" },
  { label: "Work Date" },
  { label: "Hours", align: "end" },
  { label: "Amount", align: "end" },
  { label: "Type" },
  { label: "Admitted" },
  { label: "Discharged" },
]

/** Period deductions: five columns. */
const DEDUCTION_WIDTHS = ["*", "auto", "auto", "auto", "auto"]

const DEDUCTION_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Clock In" },
  { label: "Clock Out" },
  { label: "Hours", align: "end" },
  { label: "Deduction", align: "end" },
  { label: "Status" },
]

const TIMELINE_WIDTHS = ["*", "auto"]

const TIMELINE_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Period" },
  { label: "Gross Pay", align: "end" },
]

const TYPE_WIDTHS = ["*", "auto"]

const TYPE_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Payment Type" },
  { label: "Gross Pay", align: "end" },
]

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

function summaryTable(payload: EmployeePaymentExportPayload): PdfNode {
  const { summary } = payload

  const body: PdfNode[][] = [
    summaryRow("Employees", String(summary.totalEmployees)),
    summaryRow("Payments", String(summary.totalPayments)),
    summaryRow("Base Pay", formatMoneyEn(summary.totalBasePay)),
    summaryRow("Extra Pay", formatMoneyEn(summary.totalExtraPay)),
    summaryRow("Deductions", formatMoneyEn(summary.totalDeductions), {
      tone: summary.totalDeductions > 0 ? "warning" : undefined,
    }),
    summaryRow("Paid (gross)", formatMoneyEn(summary.totalPaid)),
    summaryRow("Unpaid (gross)", formatMoneyEn(summary.totalUnpaid), {
      tone: summary.totalUnpaid > 0 ? "warning" : undefined,
    }),
    summaryRow("Net Pay", formatMoneyEn(summary.totalNet), { emphasis: true }),
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
    fit: [500, 250],
    alignment: "center",
    margin: [0, 0, 0, 10],
  }
}

function timelineTable(payload: EmployeePaymentExportPayload): PdfNode {
  const body: PdfNode[][] = [
    TIMELINE_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...payload.charts.timeline.map((point, index) =>
      [
        bodyCell(point.period, { zebra: index % 2 === 1 }),
        bodyCell(formatMoneyEn(point.total), {
          align: "end",
          zebra: index % 2 === 1,
        }),
      ] as PdfNode[]
    ),
  ]

  return {
    table: { headerRows: 1, widths: TIMELINE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 12],
  }
}

function typeTable(payload: EmployeePaymentExportPayload): PdfNode {
  const body: PdfNode[][] = [
    TYPE_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...payload.charts.byType.map((entry, index) =>
      [
        bodyCell(entry.paymentType.replace(/_/g, " ").toUpperCase(), {
          zebra: index % 2 === 1,
        }),
        bodyCell(formatMoneyEn(entry.total), {
          align: "end",
          zebra: index % 2 === 1,
        }),
      ] as PdfNode[]
    ),
  ]

  return {
    table: { headerRows: 1, widths: TYPE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 12],
  }
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

function indexRow(employee: EmployeePaymentExportRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(employee.employeeName, { zebra }),
    bodyCell(employee.employeeType.toUpperCase(), { zebra }),
    bodyCell(String(employee.totals.payments), { align: "end", zebra }),
    bodyCell(formatMoneyEn(employee.totals.basePay), { align: "end", zebra }),
    bodyCell(formatMoneyEn(employee.totals.extraPay), { align: "end", zebra }),
    bodyCell(formatMoneyEn(employee.totals.deductions), {
      align: "end",
      zebra,
    }),
    bodyCell(formatMoneyEn(employee.totals.net), { align: "end", zebra }),
  ]
}

/** Totals strip across the seven index columns. */
function indexTotalsRow(payload: EmployeePaymentExportPayload): PdfNode[] {
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
    cell(String(summary.totalPayments), "end"),
    cell(formatMoneyEn(summary.totalBasePay), "end"),
    cell(formatMoneyEn(summary.totalExtraPay), "end"),
    cell(formatMoneyEn(summary.totalDeductions), "end"),
    cell(formatMoneyEn(summary.totalNet), "end"),
  ]
}

/* ------------------------------------------------------------------ */
/* Per-employee sections                                               */
/* ------------------------------------------------------------------ */

function configTable(employee: EmployeePaymentExportRow): PdfNode {
  const { breakdown } = employee
  const shift =
    breakdown.shiftStartTime || breakdown.shiftEndTime
      ? `${breakdown.shiftStartTime?.slice(0, 5) ?? "-"} - ${
          breakdown.shiftEndTime?.slice(0, 5) ?? "-"
        }`
      : "-"

  const body: PdfNode[][] = [
    summaryRow("Base Pay", formatMoneyEn(breakdown.basePay)),
    summaryRow(
      "Base Extra Amount",
      breakdown.baseExtraPaymentType
        ? `${formatMoneyEn(breakdown.baseExtraAmount)} (${breakdown.baseExtraPaymentType})`
        : formatMoneyEn(breakdown.baseExtraAmount)
    ),
    summaryRow(
      "Per Patient Type",
      breakdown.perPatientPaymentType ?? "-",
      { valueAlign: "left" }
    ),
    summaryRow("Percentage Scope", breakdown.percentageScope ?? "-", {
      valueAlign: "left",
    }),
    summaryRow("Shift", shift, { valueAlign: "left" }),
    summaryRow("Requires Clock-In", breakdown.needClockIn ? "Yes" : "No", {
      valueAlign: "left",
    }),
    summaryRow("Work Days", String(breakdown.totalWorkDays)),
    summaryRow("Patients Served", String(breakdown.totalPatientsServed)),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

function totalsTable(employee: EmployeePaymentExportRow): PdfNode {
  const { totals } = employee

  const body: PdfNode[][] = [
    summaryRow("Payments", String(totals.payments)),
    summaryRow("Base Pay", formatMoneyEn(totals.basePay)),
    summaryRow("Extra Pay", formatMoneyEn(totals.extraPay)),
    summaryRow("Deductions", formatMoneyEn(totals.deductions), {
      tone: totals.deductions > 0 ? "warning" : undefined,
    }),
    summaryRow("Paid (gross)", formatMoneyEn(totals.paid)),
    summaryRow("Unpaid (gross)", formatMoneyEn(totals.unpaid), {
      tone: totals.unpaid > 0 ? "warning" : undefined,
    }),
    summaryRow("Net Pay", formatMoneyEn(totals.net), { emphasis: true }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

function paymentRow(
  payment: EmployeePaymentExportPayment,
  index: number
): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(`#${payment.paymentId}`, { zebra }),
    bodyCell(formatEnGbDate(payment.paymentDate), { zebra }),
    bodyCell(payment.paymentType.toUpperCase(), { zebra }),
    bodyCell(formatMoneyEn(payment.paymentAmount), { align: "end", zebra }),
    bodyCell(formatMoneyEn(payment.extraAmount), { align: "end", zebra }),
    bodyCell(formatMoneyEn(payment.paymentAmount + payment.extraAmount), {
      align: "end",
      zebra,
    }),
    bodyCell(payment.isPaid ? "Paid" : "Unpaid", { zebra }),
    bodyCell(
      payment.isPaid ? formatEnGbDate(payment.paidTimestamp) : "-",
      { zebra }
    ),
  ]
}

function paymentsTable(employee: EmployeePaymentExportRow): PdfNode {
  const body: PdfNode[][] = [
    PAYMENT_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...employee.payments.map((payment, index) => paymentRow(payment, index)),
  ]

  return {
    table: { headerRows: 1, widths: PAYMENT_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

/** The patient work behind every payment, one table per employee. */
function workTable(employee: EmployeePaymentExportRow): PdfNode {
  const body: PdfNode[][] = [
    WORK_HEADERS.map((column) => headerCell(column.label, column.align)),
  ]

  employee.payments.forEach((payment) => {
    payment.associations.forEach((association, index) => {
      const zebra = index % 2 === 1
      body.push([
        bodyCell(association.patientName, { zebra }),
        bodyCell(formatEnGbDate(association.workDate), { zebra }),
        bodyCell(formatNumberEn(association.hoursWorked), {
          align: "end",
          zebra,
        }),
        bodyCell(formatMoneyEn(association.paymentAmount), {
          align: "end",
          zebra,
        }),
        bodyCell(association.paymentType.toUpperCase(), { zebra }),
        bodyCell(formatEnGbDate(association.admissionTime), { zebra }),
        bodyCell(formatEnGbDate(association.dischargeTime), { zebra }),
      ])
    })
  })

  return {
    table: { headerRows: 1, widths: WORK_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

function deductionRow(
  deduction: PeriodDeductionRow,
  index: number
): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(formatEnGbDateTime(deduction.clockIn), { zebra }),
    bodyCell(
      deduction.clockOut ? formatEnGbDateTime(deduction.clockOut) : "-",
      { zebra }
    ),
    bodyCell(formatNumberEn(deduction.hoursWorked), { align: "end", zebra }),
    bodyCell(formatMoneyEn(deduction.payDeduction), { align: "end", zebra }),
    bodyCell(deduction.status.replace(/_/g, " "), { zebra }),
  ]
}

function deductionsTable(employee: EmployeePaymentExportRow): PdfNode {
  const body: PdfNode[][] = [
    DEDUCTION_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...employee.periodDeductions.map((deduction, index) =>
      deductionRow(deduction, index)
    ),
  ]

  return {
    table: { headerRows: 1, widths: DEDUCTION_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 4],
  }
}

/** One employee's section: configuration, totals, payments, work, deductions. */
function employeeSection(
  employee: EmployeePaymentExportRow,
  index: number
): PdfNode[] {
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
        plural(employee.totals.payments, "payment"),
      ].join("     •     ")
    ),
    configTable(employee),
    totalsTable(employee),
  ]

  content.push({
    text: "Payments",
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 4, 0, 4],
  })

  if (employee.payments.length > 0) {
    content.push(paymentsTable(employee))
  } else {
    content.push({
      text: "No payments in this period.",
      fontSize: 8,
      italics: true,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 8],
    })
  }

  content.push({
    text: "Patient Work",
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 4, 0, 4],
  })

  const hasWork = employee.payments.some(
    (payment) => payment.associations.length > 0
  )

  if (hasWork) {
    content.push(workTable(employee))
  } else {
    content.push({
      text: "No patient work recorded for these payments.",
      fontSize: 8,
      italics: true,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 8],
    })
  }

  content.push({
    text: "Clock-In Deductions",
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 4, 0, 2],
  })

  content.push({
    text: "Counted once for the period, not once per payment.",
    fontSize: 7,
    italics: true,
    color: PDF_COLORS.muted,
    margin: [0, 0, 0, 4],
  })

  if (employee.periodDeductions.length > 0) {
    content.push(deductionsTable(employee))
  } else {
    content.push({
      text: "No clock-in deductions in this period.",
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
export function employeePaymentsReportDocContent(
  payload: EmployeePaymentExportPayload,
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
      text: "Amounts in EGP.",
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

  const timelineImage = images[PAYROLL_SNAPSHOT_KEYS.timeline]
  const typeImage = images[PAYROLL_SNAPSHOT_KEYS.typeDistribution]

  if (timelineImage || payload.charts.timeline.length > 0) {
    content.push(sectionHeading("Payment Timeline"))
    content.push(
      sectionMeta(
        `Gross pay per ${payload.grouping} bucket across the selected period.`
      )
    )
    // The bitmap is the readable form; the table is the fallback that keeps
    // the numbers when the capture failed.
    content.push(
      timelineImage ? chartImage(timelineImage) : timelineTable(payload)
    )
  }

  if (typeImage || payload.charts.byType.length > 0) {
    content.push(sectionHeading("Payment Type Distribution"))
    content.push(sectionMeta("Gross pay by payment type."))
    content.push(typeImage ? chartImage(typeImage) : typeTable(payload))
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

export async function buildEmployeePaymentsReportPdf({
  payload,
  t,
  language,
  images = {},
}: BuildEmployeePaymentsReportPdfInputs): Promise<void> {
  await openPdfShellDoc(
    {
      title: "Employee Payments Report",
      content: employeePaymentsReportDocContent(payload, images),
    },
    { t, language }
  )
}
