/**
 * Patient report PDF (all patients) — Phase 6.11.1.
 *
 * The export counterpart of the patient tab: every matching patient for the
 * generated range, plus the whole-set summary — **and**, after the index, one
 * full section per patient carrying every admission in range (identity,
 * per-patient totals, then each admission with its billed items, financial
 * breakdown and daily staff).
 *
 * Document order (user-chosen layout):
 *
 *   1. Report period + whole-set summary KPIs.
 *   2. Index table — one row per patient, the scannable overview.
 *   3. Per patient, **on a new page**: heading, identity block, totals, then
 *      one block per admission (page-broken from each other).
 *
 * `patientReportDocContent` is pure so the layout can be exercised headlessly;
 * `buildPatientReportPdf` pipes it into the shared shell.
 *
 * The patient/admission blocks come from `patientReportSections`, which the
 * single-patient print also uses.
 *
 * Money in table cells is `1,234.50` (compact, keeps eight columns inside the
 * portrait content box); summary rows carry the `EGP` prefix so the currency
 * is never ambiguous.
 */

import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import {
  formatCurrencyEn,
  formatEnGbDate,
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
} from "@/lib/pdf/pdfTheme"
import {
  admissionSection,
  patientInfoTable,
  patientTotalsTable,
} from "@/pages/Reports/export/pdf/patientReportSections"
import type {
  PatientReportExportPayload,
  PatientReportExportRow,
} from "@/pages/Reports/types/patientReport"

export interface BuildPatientReportPdfInputs {
  payload: PatientReportExportPayload
  t: TFunction
  language: "en" | "ar"
}

/** Eight portrait columns; `*` absorbs the remaining width (never overflows). */
const LIST_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"]

const LIST_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Patient" },
  { label: "National ID" },
  { label: "Payment" },
  { label: "Admissions", align: "end" },
  { label: "Last Admission" },
  { label: "Billed (EGP)", align: "end" },
  { label: "Paid (EGP)", align: "end" },
  { label: "Outstanding (EGP)", align: "end" },
]

function summaryTable(payload: PatientReportExportPayload): PdfNode {
  const { summary } = payload

  const body: PdfNode[][] = [
    summaryRow("Patients", String(summary.totalPatients)),
    summaryRow("Admissions", String(summary.totalAdmissions)),
    summaryRow("Total Billed", formatCurrencyEn(summary.totalBilled)),
    summaryRow("Total Paid", formatCurrencyEn(summary.totalPaid)),
    summaryRow("Total Outstanding", formatCurrencyEn(summary.totalOutstanding), {
      tone: summary.totalOutstanding > 0 ? "warning" : "success",
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 16],
  }
}

/** Totals band across the eight list columns (no `colSpan`, see pdfTheme). */
function totalsBand(payload: PatientReportExportPayload): PdfNode[] {
  const { summary } = payload
  const blank = (): PdfNode => ({
    text: "",
    fontSize: 8,
    fillColor: PDF_COLORS.bandStrong,
  })

  return [
    {
      text: "TOTALS",
      bold: true,
      fontSize: 8,
      fillColor: PDF_COLORS.bandStrong,
    },
    blank(),
    blank(),
    blank(),
    blank(),
    {
      text: formatMoneyEn(summary.totalBilled),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    {
      text: formatMoneyEn(summary.totalPaid),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    {
      text: formatMoneyEn(summary.totalOutstanding),
      bold: true,
      fontSize: 8,
      alignment: "right",
      color:
        summary.totalOutstanding > 0 ? PDF_COLORS.warning : PDF_COLORS.success,
      fillColor: PDF_COLORS.bandStrong,
    },
  ]
}

/** Index row, one per patient. */
function indexRow(row: PatientReportExportRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(row.patientName, { zebra }),
    bodyCell(row.nationalId ?? "-", { zebra }),
    bodyCell(row.paymentType.toUpperCase(), { zebra }),
    bodyCell(String(row.admissionsCount), { align: "end", zebra }),
    bodyCell(formatEnGbDate(row.lastAdmission), { zebra }),
    bodyCell(formatMoneyEn(row.totalBilled), { align: "end", zebra }),
    bodyCell(formatMoneyEn(row.totalPaid), { align: "end", zebra }),
    {
      ...bodyCell(formatMoneyEn(row.totalOutstanding), { align: "end", zebra }),
      color:
        row.totalOutstanding > 0 ? PDF_COLORS.warning : PDF_COLORS.success,
    },
  ]
}

/**
 * One patient's full section: identity, totals, then every admission.
 *
 * Totals come from the row's SQL aggregate (authoritative, same numbers as the
 * index) rather than being re-summed from the attached admissions.
 */
function patientSection(row: PatientReportExportRow, index: number): PdfNode[] {
  const content: PdfNode[] = [
    sectionHeading(`${index + 1}. ${row.patientName}`),
    sectionMeta(
      `${plural(row.admissionsCount, "admission")} in the selected period`
    ),
    patientInfoTable(row),
    patientTotalsTable({
      admissions: row.admissionsCount,
      billed: row.totalBilled,
      paid: row.totalPaid,
      outstanding: row.totalOutstanding,
    }),
  ]

  if (row.admissions.length === 0) {
    content.push({
      text: "No admissions for this patient in the selected period.",
      italics: true,
      fontSize: 8,
      color: PDF_COLORS.muted,
      margin: [0, 8, 0, 0],
    })
    return content
  }

  row.admissions.forEach((admission, admissionIndex) => {
    if (admissionIndex > 0) content.push({ text: "", pageBreak: "before" })
    content.push(...admissionSection(admission, admissionIndex))
  })

  return content
}

/** Builds the shell `content` array (no pdfmake side effects). */
export function patientReportDocContent(
  payload: PatientReportExportPayload
): PdfNode[] {
  const period = `${formatEnGbDate(payload.range.startDate)} - ${formatEnGbDate(
    payload.range.endDate
  )}`

  const body: PdfNode[][] = [
    LIST_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...payload.data.map((row, index) => indexRow(row, index)),
    totalsBand(payload),
  ]

  const content: PdfNode[] = [
    {
      text: `Report Period: ${period}`,
      alignment: "center",
      fontSize: 9,
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

  content.push({
    text: plural(payload.summary.totalPatients, "patient"),
    fontSize: 9,
    color: PDF_COLORS.muted,
    margin: [0, 0, 0, 6],
  })

  content.push({
    table: { headerRows: 1, widths: LIST_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 8],
  })

  // Patient detail starts on a fresh page: the index stays a single, whole
  // overview and each patient's pages can be handed out on their own.
  payload.data.forEach((row, index) => {
    content.push({ text: "", pageBreak: "before" })
    content.push(...patientSection(row, index))
  })

  return content
}

export async function buildPatientReportPdf({
  payload,
  t,
  language,
}: BuildPatientReportPdfInputs): Promise<void> {
  await openPdfShellDoc(
    {
      title: "Patient Report",
      content: patientReportDocContent(payload),
    },
    { t, language }
  )
}
