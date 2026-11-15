/**
 * Company insurance report PDF — Phase 6.10 plan §4 Step 11.
 *
 * Port of the legacy `InsuranceManager.printReport` onto the shared
 * `lib/pdfShell` (brand header, page numbering, A4 portrait, margins).
 * Layout:
 *
 *   1. Report period line.
 *   2. Report summary table (gross → outstanding).
 *   3. One section per patient: heading + policy/admission line + the
 *      item table with its financial totals rows.
 *
 * A page break separates patient sections so each patient's ledger starts
 * on a fresh page — legacy parity. Labels stay English and dates use
 * `en-GB` (exports are not localized).
 *
 * `companyReportDocContent` is pure (no pdfmake, no DOM) so the layout can
 * be exercised headlessly; `buildCompanyReportPdf` is the browser entry
 * that pipes it into the shared shell.
 */
import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import { calculateFinancials } from "@/pages/Insurance/report/financials"
import {
  formatEnGbDate,
  formatMoneyEn,
} from "@/pages/Insurance/report/format"
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
  InsuranceReportSummary,
  PatientItemGroup,
} from "@/pages/Insurance/types/insurance"

export interface CompanyReportContentInputs {
  report: InsuranceReportSummary
  groups: Record<string, PatientItemGroup>
  financials: BillFinancials
}

export interface BuildCompanyReportPdfInputs
  extends CompanyReportContentInputs {
  t: TFunction
  language: "en" | "ar"
}

function money(value: number): string {
  return formatMoneyEn(value)
}

function summaryTable(
  report: InsuranceReportSummary,
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
        text: plural(report.patientCount, "patient"),
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
    summaryRow("Services / Drugs", `${money(report.totalServicesCost)} / ${money(report.totalDrugsCost)}`),
    summaryRow(
      "Supplies / Medical Tests",
      `${money(report.totalSuppliesCost)} / ${money(report.totalMedicalTestsCost)}`
    ),
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

/** Totals rows for one patient group (mirrors the on-screen `<tfoot>`). */
function groupTotals(group: PatientItemGroup): TotalDescriptor[] {
  const financials = calculateFinancials(group.items)
  const sample = group.items[0]

  const rows: TotalDescriptor[] = [
    { label: "Medical Tests:", value: money(financials.medicalTestsTotal) },
  ]

  if (financials.discountAmount > 0) {
    const scope = (sample?.discountScope ?? []).join("/")
    const percent =
      sample?.discountType === "percentage" ? `${sample?.discount}% ` : ""
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
    const scope = (sample?.vatScopeCustom ?? []).join("/")
    rows.push({
      label: `${sample?.vatPercentage ?? 0}% VAT${scope ? ` (${scope})` : ""}:`,
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
    value: money(group.patientPaid),
    tone: "success",
  })

  const outstanding = financials.netTotal - group.patientPaid
  rows.push({
    label: "Outstanding:",
    value: money(outstanding),
    tone: outstanding > 0 ? "warning" : "success",
  })

  return rows
}

/** Builds the shell `content` array (no pdfmake side effects). */
export function companyReportDocContent({
  report,
  groups,
  financials,
}: CompanyReportContentInputs): PdfNode[] {
  const patientKeys = Object.keys(groups)
  const period = `${formatEnGbDate(report.reportPeriod.startDate)} - ${formatEnGbDate(report.reportPeriod.endDate)}`

  const content: PdfNode[] = [
    {
      text: `Report Period: ${period}`,
      alignment: "center",
      fontSize: 9,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 12],
    },
    summaryTable(report, financials),
  ]

  if (patientKeys.length === 0) {
    content.push({
      text: "No data available for the selected period.",
      alignment: "center",
      italics: true,
      color: PDF_COLORS.muted,
      margin: [0, 24, 0, 0],
    })
    return content
  }

  patientKeys.forEach((patientKey, index) => {
    const group = groups[patientKey]
    const sample = group.items[0]

    if (index > 0) {
      content.push({ text: "", pageBreak: "before" })
    }

    const metaParts: string[] = []
    if (sample?.insuranceCardId) metaParts.push(`Card ID: ${sample.insuranceCardId}`)
    if (sample?.insuranceFormId) metaParts.push(`Form ID: ${sample.insuranceFormId}`)
    metaParts.push(`Admission: ${formatEnGbDate(sample?.admissionTime)}`)
    metaParts.push(
      sample?.dischargeTime
        ? `Discharged: ${formatEnGbDate(sample.dischargeTime)}`
        : "Currently admitted"
    )

    content.push(sectionHeading(`${index + 1}. ${group.patientName}`))
    content.push(sectionMeta(metaParts.join("     •     ")))

    const body: PdfNode[][] = [
      ITEM_COLUMNS.map((column) => headerCell(column.labelEn, column.align)),
      ...group.items.map((item, itemIndex) =>
        ITEM_COLUMNS.map((column) =>
          bodyCell(formatExportCell(column, item), {
            align: column.align,
            zebra: itemIndex % 2 === 1,
          })
        )
      ),
      ...groupTotals(group).map((descriptor) => totalRow(descriptor)),
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

export async function buildCompanyReportPdf({
  report,
  groups,
  financials,
  t,
  language,
}: BuildCompanyReportPdfInputs): Promise<void> {
  await openPdfShellDoc(
    {
      title: `${report.insuranceName} - Insurance Report`,
      content: companyReportDocContent({ report, groups, financials }),
    },
    { t, language }
  )
}
