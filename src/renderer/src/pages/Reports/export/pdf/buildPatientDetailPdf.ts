/**
 * Single-patient report PDF — Phase 6.11.1.
 *
 * Print target for the detail dialog's two actions:
 *   - **Print patient report** — every admission in the generated range,
 *   - **Print admission** — one admission (`admissionId`).
 *
 * Layout is the 6.10 insurance patient report, adapted to the v2 payload:
 *
 *   1. Report period.
 *   2. Patient information (one four-column label/value grid).
 *   3. Report summary (admissions, billed, paid, outstanding).
 *   4. One section per admission: heading + meta line, the item table (service
 *      date as a column), then the financial breakdown and the daily staff
 *      table.
 *
 * The three blocks after the header come from `patientReportSections` — the
 * same code the multi-patient export renders, so a fix to the item table or
 * the financial rows can never land in only one of the two documents.
 *
 * A page break separates admissions so a long stay never starts mid-page.
 * Labels are English and dates `en-GB` (exports are never localized).
 */

import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import { formatEnGbDate } from "@/lib/pdf/format"
import { PDF_COLORS, type PdfNode } from "@/lib/pdf/pdfTheme"
import {
  admissionSection,
  patientInfoTable,
  patientTotalsTable,
  totalsFromAdmissions,
} from "@/pages/Reports/export/pdf/patientReportSections"
import type { PatientReportDetail } from "@/pages/Reports/types/patientReport"
import type { ReportRange } from "@/pages/Reports/types/reports"

export interface BuildPatientDetailPdfInputs {
  detail: PatientReportDetail
  range: ReportRange
  t: TFunction
  language: "en" | "ar"
  /** Restrict the document to a single admission (Print admission). */
  admissionId?: number
}

/** Builds the shell `content` array (no pdfmake side effects). */
export function patientDetailDocContent({
  detail,
  range,
  admissionId,
}: Pick<BuildPatientDetailPdfInputs, "detail" | "range" | "admissionId">): PdfNode[] {
  const admissions =
    admissionId === undefined
      ? detail.admissions
      : detail.admissions.filter(
          (admission) => admission.patientHistoryId === admissionId
        )

  const period = `${formatEnGbDate(range.from)} - ${formatEnGbDate(range.to)}`

  const content: PdfNode[] = [
    {
      text: `Report Period: ${period}`,
      alignment: "center",
      fontSize: 9,
      color: PDF_COLORS.muted,
      margin: [0, 0, 0, 12],
    },
    patientInfoTable(detail.patient),
    patientTotalsTable(totalsFromAdmissions(admissions)),
  ]

  if (admissions.length === 0) {
    content.push({
      text: "No admissions for this patient in the selected period.",
      alignment: "center",
      italics: true,
      color: PDF_COLORS.muted,
      margin: [0, 24, 0, 0],
    })
    return content
  }

  admissions.forEach((admission, index) => {
    if (index > 0) content.push({ text: "", pageBreak: "before" })
    content.push(...admissionSection(admission, index))
  })

  return content
}

export async function buildPatientDetailPdf({
  detail,
  range,
  t,
  language,
  admissionId,
}: BuildPatientDetailPdfInputs): Promise<void> {
  const admission =
    admissionId === undefined
      ? null
      : detail.admissions.find(
          (entry) => entry.patientHistoryId === admissionId
        ) ?? null

  const title = admission
    ? `${detail.patient.patientName} - Admission ${formatEnGbDate(admission.admissionTime)}`
    : `${detail.patient.patientName} - Patient Report`

  await openPdfShellDoc(
    {
      title,
      content: patientDetailDocContent({ detail, range, admissionId }),
    },
    { t, language }
  )
}
