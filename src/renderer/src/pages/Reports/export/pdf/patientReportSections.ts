/**
 * Shared PDF sections for the patient report family — Phase 6.11.1.
 *
 * Two documents render the same three blocks: the multi-patient export
 * (`buildPatientReportPdf`) and the single-patient / single-admission print
 * (`buildPatientDetailPdf`). They live here so the two can never drift.
 *
 * ## Items carry their own date
 *
 * The first 6.11.1 draft grouped items by service date with a band row that
 * applied to every following row ("1/3/2026 … items"). The date is now a
 * column instead: a flat table survives a page break (pdfmake repeats the
 * header row), scans and sorts by date on paper, and matches the CSV export
 * one-to-one. The per-date total is still printed as a subtotal row, but only
 * for dates with more than one line (a single line's subtotal is the line
 * itself).
 *
 * Labels are English and dates `en-GB` (exports are never localized).
 */

import {
  formatCurrencyEn,
  formatEnGbDate,
  formatEnGbDateTime,
  formatMoneyEn,
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
  type TotalTone,
} from "@/lib/pdf/pdfTheme"
import type {
  PatientReportAdmission,
  PatientReportRow,
} from "@/pages/Reports/types/patientReport"

/* ------------------------------------------------------------------ */
/* Item table                                                          */
/* ------------------------------------------------------------------ */

/**
 * Date (auto) · Item (star) · Type · Qty · Unit price · Total.
 *
 * `"*"` only on the item name: pdfmake distributes the star over whatever
 * remains after the content-sized columns, so the table can never exceed the
 * content box and push the totals column off-page.
 */
export const ITEM_WIDTHS = ["auto", "*", "auto", "auto", "auto", "auto"]

export const ITEM_HEADERS: Array<{
  label: string
  align?: "start" | "center" | "end"
}> = [
  { label: "Date" },
  { label: "Item" },
  { label: "Type" },
  { label: "Qty", align: "center" },
  { label: "Unit Price", align: "end" },
  { label: "Total", align: "end" },
]

/** Band cell shared by the subtotal and financial rows. */
function bandCell(
  text: string,
  options: {
    align?: "start" | "end"
    bold?: boolean
    tone?: TotalTone
    strong?: boolean
  } = {}
): PdfNode {
  const fill = options.strong ? PDF_COLORS.bandStrong : PDF_COLORS.band
  const color =
    options.tone === "danger"
      ? PDF_COLORS.danger
      : options.tone === "success"
        ? PDF_COLORS.success
        : options.tone === "warning"
          ? PDF_COLORS.warning
          : PDF_COLORS.text

  return {
    text,
    fontSize: 8,
    bold: options.bold ?? true,
    color,
    fillColor: fill,
    alignment: options.align === "end" ? "right" : "left",
  }
}

/** `Date total` subtotal row: date in column 1, label in column 2, sum last. */
function dateTotalRow(serviceDate: string, total: number): PdfNode[] {
  return [
    bandCell(formatEnGbDate(serviceDate), { bold: false }),
    bandCell("Date total"),
    bandCell("", { bold: false }),
    bandCell("", { bold: false }),
    bandCell("", { bold: false }),
    bandCell(formatMoneyEn(total), { align: "end" }),
  ]
}

/** Financial breakdown row: label spans the text columns, value in the last. */
function totalRow(
  label: string,
  value: string,
  tone?: TotalTone,
  strong = false
): PdfNode[] {
  return [
    bandCell(label, { tone, strong }),
    bandCell("", { tone, strong }),
    bandCell("", { tone, strong }),
    bandCell("", { tone, strong }),
    bandCell("", { tone, strong }),
    bandCell(value, { align: "end", tone, strong }),
  ]
}

/* ------------------------------------------------------------------ */
/* Patient blocks                                                      */
/* ------------------------------------------------------------------ */

/** Two-column label/value grid describing the patient. */
export function patientInfoTable(patient: PatientReportRow): PdfNode {
  const left: Array<[string, string]> = [
    ["Patient Name", patient.patientName],
    ["Patient ID", String(patient.patientId)],
    ["Gender", patient.gender ? patient.gender.toUpperCase() : "-"],
    ["Age", patient.age === null ? "-" : String(patient.age)],
    ["Birth Date", patient.birthDate ? formatEnGbDate(patient.birthDate) : "-"],
  ]

  const right: Array<[string, string]> = [
    ["National ID", patient.nationalId ?? "-"],
    ["Phone", patient.phone ?? "-"],
    ["Payment Type", patient.paymentType.toUpperCase()],
    ["Insurance", patient.insuranceCompany ?? "-"],
    ["Referring Doctor", patient.referringDoctorName ?? "-"],
  ]

  if (patient.insuranceCardId) {
    right.push(["Insurance Card ID", patient.insuranceCardId])
  }
  if (patient.insuranceFormId) {
    right.push(["Insurance Form ID", patient.insuranceFormId])
  }
  if (patient.address) left.push(["Address", patient.address])

  const blankPair = (): PdfNode[] => [
    { text: "", fontSize: 8, fillColor: PDF_COLORS.surface },
    { text: "", fontSize: 8, fillColor: PDF_COLORS.surface },
  ]

  const body: PdfNode[][] = []
  const rowCount = Math.max(left.length, right.length)
  for (let index = 0; index < rowCount; index += 1) {
    const leftPair = left[index]
    const rightPair = right[index]
    body.push([
      ...(leftPair
        ? summaryRow(leftPair[0], leftPair[1], { valueAlign: "left" })
        : blankPair()),
      ...(rightPair
        ? summaryRow(rightPair[0], rightPair[1], { valueAlign: "left" })
        : blankPair()),
    ])
  }

  return {
    table: { widths: ["auto", "*", "auto", "*"], body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 14],
  }
}

export interface PatientTotals {
  admissions: number
  billed: number
  paid: number
  outstanding: number
}

/** Report summary for one patient (or for the whole document). */
export function patientTotalsTable(totals: PatientTotals): PdfNode {
  const body: PdfNode[][] = [
    summaryRow("Admissions", String(totals.admissions)),
    summaryRow("Total Billed", formatCurrencyEn(totals.billed)),
    summaryRow("Total Paid", formatCurrencyEn(totals.paid)),
    summaryRow("Total Outstanding", formatCurrencyEn(totals.outstanding), {
      tone: totals.outstanding > 0 ? "warning" : "success",
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 16],
  }
}

/** Derives `PatientTotals` from a set of admissions (detail/print path). */
export function totalsFromAdmissions(
  admissions: PatientReportAdmission[]
): PatientTotals {
  const billed = admissions.reduce(
    (sum, admission) => sum + admission.finalTotal,
    0
  )
  const paid = admissions.reduce((sum, admission) => sum + admission.paidAmount, 0)
  return {
    admissions: admissions.length,
    billed,
    paid,
    outstanding: billed - paid,
  }
}

/* ------------------------------------------------------------------ */
/* Admission                                                           */
/* ------------------------------------------------------------------ */

/** Heading + meta + item table + financials + staff for one admission. */
export function admissionSection(
  admission: PatientReportAdmission,
  index: number
): PdfNode[] {
  const content: PdfNode[] = []

  content.push(
    sectionHeading(
      `${index + 1}. Admission ${formatEnGbDate(admission.admissionTime)}`
    )
  )

  const meta = [
    admission.billId ? `Bill ID: ${admission.billId}` : "No bill",
    admission.dischargeTime
      ? `Discharged: ${formatEnGbDateTime(admission.dischargeTime)}`
      : "Currently admitted",
    admission.diagnosis ? `Diagnosis: ${admission.diagnosis}` : null,
    admission.leaveReason ? `Leave reason: ${admission.leaveReason}` : null,
  ].filter(Boolean) as string[]
  content.push(sectionMeta(meta.join("     •     ")))

  const itemBody: PdfNode[][] = [
    ITEM_HEADERS.map((column) => headerCell(column.label, column.align)),
  ]
  let rowIndex = 0
  let itemRowCount = 0

  for (const group of admission.itemsByDate) {
    for (const item of group.items) {
      itemRowCount += 1
      itemBody.push([
        bodyCell(formatEnGbDate(group.serviceDate), {
          zebra: rowIndex % 2 === 1,
        }),
        bodyCell(item.itemName, { zebra: rowIndex % 2 === 1 }),
        bodyCell(item.itemType.toUpperCase(), { zebra: rowIndex % 2 === 1 }),
        bodyCell(String(item.quantity), {
          align: "center",
          zebra: rowIndex % 2 === 1,
        }),
        bodyCell(formatMoneyEn(item.unitPrice), {
          align: "end",
          zebra: rowIndex % 2 === 1,
        }),
        bodyCell(formatMoneyEn(item.totalPrice), {
          align: "end",
          zebra: rowIndex % 2 === 1,
        }),
      ])
      rowIndex += 1
    }

    // A one-line day needs no subtotal: the line already says it.
    if (group.items.length > 1) {
      itemBody.push(dateTotalRow(group.serviceDate, group.dateTotal))
    }
  }

  // An admission can exist without a bill (or with a bill that has no lines).
  // Say so instead of printing a bare header row above "Base Total 0.00".
  if (itemRowCount === 0) {
    itemBody.push([
      bodyCell("No billed items"),
      bodyCell(""),
      bodyCell(""),
      bodyCell(""),
      bodyCell(""),
      bodyCell(""),
    ])
  }

  itemBody.push(totalRow("Base Total", formatMoneyEn(admission.baseTotal)))

  if (admission.calculatedDiscount > 0) {
    const scope = admission.discountScope.join("/")
    const percent =
      admission.discountType === "percentage" ? `${admission.discount}% ` : ""
    itemBody.push(
      totalRow(
        `${percent}Discount${scope ? ` (${scope})` : ""}`,
        `-${formatMoneyEn(admission.calculatedDiscount)}`,
        "danger"
      )
    )
  }

  if (admission.administrativeExpenses > 0) {
    itemBody.push(
      totalRow(
        "Administrative Expenses",
        formatMoneyEn(admission.administrativeExpenses)
      )
    )
  }

  if (admission.calculatedVat > 0) {
    const scope = admission.vatScopeCustom.join("/")
    itemBody.push(
      totalRow(
        `${admission.vatPercentage}% VAT${scope ? ` (${scope})` : ""}`,
        formatMoneyEn(admission.calculatedVat)
      )
    )
  }

  itemBody.push(
    totalRow("Net Total", formatMoneyEn(admission.finalTotal), "warning", true)
  )
  itemBody.push(
    totalRow("Paid", formatMoneyEn(admission.paidAmount), "success")
  )
  itemBody.push(
    totalRow(
      "Outstanding",
      formatMoneyEn(admission.outstandingAmount),
      admission.outstandingAmount > 0 ? "warning" : "success"
    )
  )

  content.push({
    table: { headerRows: 1, widths: ITEM_WIDTHS, body: itemBody },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  })

  content.push(
    sectionMeta(`Length of stay: ${plural(admission.lengthOfStayDays, "day")}`)
  )

  if (admission.dailyStaff.length > 0) {
    content.push(sectionHeading("Daily Staff Assignments"))

    const staffBody: PdfNode[][] = [
      ["Date", "Role", "Name", "Hours"].map((label, columnIndex) =>
        headerCell(label, columnIndex === 3 ? "end" : "start")
      ),
    ]

    for (const day of admission.dailyStaff) {
      const members = [
        ...day.doctors.map((member) => ({ ...member, role: "Doctor" })),
        ...day.nurses.map((member) => ({ ...member, role: "Nurse" })),
      ]
      for (const member of members) {
        staffBody.push([
          bodyCell(formatEnGbDate(day.workDate)),
          bodyCell(member.role),
          bodyCell(member.name),
          bodyCell(formatMoneyEn(member.hoursWorked), { align: "end" }),
        ])
      }
    }

    content.push({
      table: { headerRows: 1, widths: ["auto", "auto", "*", "auto"], body: staffBody },
      layout: reportTableLayout(),
      margin: [0, 0, 0, 8],
    })
  }

  return content
}
