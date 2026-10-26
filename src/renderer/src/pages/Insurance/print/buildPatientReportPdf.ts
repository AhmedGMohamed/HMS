/**
 * Per-patient insurance report PDF — Phase 6.10 plan §4 Step 11.
 *
 * Port of the legacy `InsuranceManager.printPatientReport` onto the shared
 * `lib/pdfShell`. Layout:
 *
 *   1. Report period line.
 *   2. Patient information table (one four-column label/value grid).
 *   3. Report summary table.
 *   4. One section per admission: heading + bill/diagnosis line + item
 *      table with its financial totals rows.
 *
 * A page break separates admissions. Labels are English and dates `en-GB`
 * (exports are not localized — legacy parity).
 *
 * `patientReportDocContent` is pure so the layout can be exercised
 * headlessly; `buildPatientReportPdf` pipes it into the shared shell.
 */
import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import { calculateFinancials } from "@/pages/Insurance/report/financials"
import { formatEnGbDate, formatMoneyEn } from "@/pages/Insurance/report/format"
import {
  ITEM_COLUMNS,
  formatExportCell,
} from "@/pages/Insurance/report/itemColumns"
import {
  ITEM_TABLE_WIDTHS,
  PDF_COLORS,
  SUMMARY_TABLE_WIDTHS,
  bodyCell,
  headerCell,
  plural,
  reportTableLayout,
  sectionHeading,
  sectionMeta,
  summaryRow,
  totalRow,
  type PdfNode,
  type TotalDescriptor,
} from "@/pages/Insurance/print/pdfTheme"
import type {
  BillFinancials,
  PatientReportAdmission,
  PatientReportSummary,
} from "@/pages/Insurance/types/insurance"

export interface PatientReportContentInputs {
  report: PatientReportSummary
  financials: BillFinancials
}

export interface BuildPatientReportPdfInputs
  extends PatientReportContentInputs {
  t: TFunction
  language: "en" | "ar"
}

function money(value: number): string {
  return formatMoneyEn(value)
}

/**
 * Patient information block — a single four-column table
 * (label | value | label | value) rather than two side-by-side tables.
 *
 * One table means one continuous border grid and one shared column rhythm;
 * the two independent tables previously left a visible seam (and their
 * fixed widths overflowed the content box). `["auto", "*", "auto", "*"]`
 * lets pdfmake size the label columns to their content and split the
 * remaining width between the two value columns.
 *
 * Values are left-aligned (this is a key/value block, not a numeric
 * summary). When the two halves differ in length the shorter side is
 * padded with empty pairs so the grid stays rectangular.
 */
function patientInfoTable(report: PatientReportSummary): PdfNode {
  const info = report.patientInfo

  const blankPair = (): PdfNode[] => [
    { text: "", fontSize: 8, fillColor: PDF_COLORS.surface },
    { text: "", fontSize: 8, fillColor: PDF_COLORS.surface },
  ]

  const left: Array<[label: string, value: string]> = [
    ["Patient Name", report.patientName],
    ["Gender", info.gender ? info.gender.toUpperCase() : "-"],
    ["Insurance", report.insuranceName],
  ]
  if (info.nationalId) left.push(["National ID", info.nationalId])
  if (info.phone) left.push(["Phone", info.phone])

  const right: Array<[label: string, value: string]> = [
    ["Registration", formatEnGbDate(info.registrationDate)],
    ["Insurance Card ID", info.insuranceCardId ?? "-"],
    ["Insurance Form ID", info.insuranceFormId ?? "-"],
  ]

  const rowCount = Math.max(left.length, right.length)
  const body: PdfNode[][] = []

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
    margin: [0, 0, 0, 16],
  }
}

function summaryTable(
  report: PatientReportSummary,
  financials: BillFinancials
): PdfNode {
  const outstanding = financials.netTotal - report.totalPatientPayments

  const body: PdfNode[][] = [
    [
      {
        text: "Report Summary",
        bold: true,
        fontSize: 8,
        color: PDF_COLORS.headerText,
        fillColor: PDF_COLORS.primary,
      },
      {
        text: plural(report.admissions.length, "admission"),
        fontSize: 8,
        color: PDF_COLORS.headerText,
        alignment: "right",
        fillColor: PDF_COLORS.primary,
      },
    ],
    summaryRow("Gross Total (Services + Drugs + Supplies + Tests)", money(financials.grossTotal)),
    summaryRow("Discount", `-${money(financials.discountAmount)}`, { tone: "danger" }),
    summaryRow("Administrative Expenses", money(financials.adminExpenses)),
    summaryRow("VAT", money(financials.vatAmount)),
    summaryRow("Net Total", money(financials.netTotal), { emphasis: true }),
    summaryRow("Patient Payments", money(report.totalPatientPayments)),
    summaryRow("Outstanding", money(outstanding), {
      tone: outstanding > 0 ? "warning" : "success",
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 18],
  }
}

/** Totals rows for one admission (mirrors the on-screen `<tfoot>`). */
function admissionTotals(
  admission: PatientReportAdmission,
  itemsTotal: number
): TotalDescriptor[] {
  const financials = calculateFinancials(admission.items)

  const rows: TotalDescriptor[] = [
    { label: "Admission Total:", value: money(itemsTotal) },
    { label: "Medical Tests:", value: money(financials.medicalTestsTotal) },
  ]

  if (financials.discountAmount > 0) {
    const scope = (admission.discountScope ?? []).join("/")
    const percent =
      admission.discountType === "percentage"
        ? `${admission.discount}% `
        : ""
    rows.push({
      label: `${percent}Discount${scope ? ` (${scope})` : ""}:`,
      value: `-${money(financials.discountAmount)}`,
      tone: "danger",
    })
  }

  if (financials.adminExpenses > 0) {
    rows.push({
      label: "Administrative Expenses:",
      value: money(financials.adminExpenses),
    })
  }

  if (financials.vatAmount > 0) {
    const scope = (admission.vatScopeCustom ?? []).join("/")
    rows.push({
      label: `${admission.vatPercentage}% VAT${scope ? ` (${scope})` : ""}:`,
      value: money(financials.vatAmount),
    })
  }

  rows.push({
    label: "Net Total:",
    value: money(financials.netTotal),
    emphasis: true,
  })
  rows.push({
    label: "Patient Paid:",
    value: money(admission.paidAmount),
    tone: "success",
  })
  rows.push({
    label: "Outstanding:",
    value: money(admission.outstandingAmount),
    tone: admission.outstandingAmount > 0 ? "warning" : "success",
  })

  return rows
}

/** Builds the shell `content` array (no pdfmake side effects). */
export function patientReportDocContent({
  report,
  financials,
}: PatientReportContentInputs): PdfNode[] {
  const period = `${formatEnGbDate(report.reportPeriod.startDate)} - ${formatEnGbDate(report.reportPeriod.endDate)}`

  const content: PdfNode[] = [
    {
      text: `Report Period: ${period}`,
      alignment: "center",
      fontSize: 9,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 12],
    },
    patientInfoTable(report),
    summaryTable(report, financials),
  ]

  if (report.admissions.length === 0) {
    content.push({
      text: "No data available for the selected period.",
      alignment: "center",
      italics: true,
      color: PDF_COLORS.muted,
      margin: [0, 24, 0, 0],
    })
    return content
  }

  report.admissions.forEach((admission, index) => {
    if (index > 0) {
      content.push({ text: "", pageBreak: "before" })
    }

    const itemsTotal = admission.items.reduce(
      (sum, item) => sum + (Number(item.totalCost) || 0),
      0
    )

    content.push(
      sectionHeading(
        `${index + 1}. Admission ${formatEnGbDate(admission.admissionTime)}`
      )
    )

    const metaParts = [`Bill ID: ${admission.billId}`]
    if (admission.diagnosis) metaParts.push(`Diagnosis: ${admission.diagnosis}`)
    metaParts.push(
      admission.dischargeTime
        ? `Discharged: ${formatEnGbDate(admission.dischargeTime)}`
        : "Currently admitted"
    )
    content.push(sectionMeta(metaParts.join("     •     ")))

    if (admission.items.length === 0) {
      content.push({
        text: "No items for this admission.",
        fontSize: 9,
        italics: true,
        color: PDF_COLORS.muted,
        margin: [0, 4, 0, 8],
      })
      return
    }

    const body: PdfNode[][] = [
      ITEM_COLUMNS.map((column) => headerCell(column.labelEn, column.align)),
      ...admission.items.map((item, itemIndex) =>
        ITEM_COLUMNS.map((column) =>
          bodyCell(formatExportCell(column, item), {
            align: column.align,
            zebra: itemIndex % 2 === 1,
          })
        )
      ),
      ...admissionTotals(admission, itemsTotal).map((descriptor) =>
        totalRow(descriptor)
      ),
    ]

    content.push({
      table: {
        headerRows: 1,
        widths: ITEM_TABLE_WIDTHS,
        body,
      },
      layout: reportTableLayout(),
      margin: [0, 0, 0, 8],
    })
  })

  return content
}


export async function buildPatientReportPdf({
  report,
  financials,
  t,
  language,
}: BuildPatientReportPdfInputs): Promise<void> {
  await openPdfShellDoc(
    {
      title: `${report.patientName} - Patient Report`,
      content: patientReportDocContent({ report, financials }),
    },
    { t, language }
  )
}
