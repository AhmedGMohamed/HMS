/**
 * Doctor report PDF — Phase 6.11.2.
 *
 * Document order mirrors the patient report (6.11.1) so the two exports read
 * the same way on paper:
 *
 *   1. Report period + whole-set summary (unique patients **and** the additive
 *      patient-doctor assignment count, see the note below).
 *   2. Distribution — the optional chart bitmap plus a table covering **every**
 *      doctor with their share of the assignments. The on-screen chart draws
 *      the current page; a printed document must not.
 *   3. Index table — one row per doctor, the scannable overview.
 *   4. Per doctor, on a new page: heading, totals, the patient table, and (for
 *      a single-doctor document) one section per admission.
 *
 * ## Unique vs additive
 *
 * `totalPatients` is deduplicated across doctors while
 * `totalPatientAssignments` is the sum of the per-doctor counts. Both are
 * printed, labelled, so a reader can reconcile the index column sum with the
 * summary without assuming a bug.
 *
 * ## Share percentages are zero-safe
 *
 * `sharePercent` returns `-` (never `NaN%`) when the denominator is 0, which
 * is the gate the phase plan calls out explicitly.
 *
 * Labels are English and dates `en-GB`: exports are never localized
 * (Vault 6.9 / Insurance 6.10 / Patient 6.11.1 parity).
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
import { admissionSection } from "@/pages/Reports/export/pdf/patientReportSections"
import type {
  DoctorExportRow,
  DoctorPatientRow,
  DoctorReportExportPayload,
} from "@/pages/Reports/types/doctorReport"

export interface BuildDoctorReportPdfInputs {
  payload: DoctorReportExportPayload
  t: TFunction
  language: "en" | "ar"
  /** PNG data URL of the distribution chart, captured by the tab. */
  distributionImage?: string
}

/** Doctor index: name (`*`) then content-sized columns. */
const INDEX_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto"]

const INDEX_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Doctor" },
  { label: "Type" },
  { label: "Patients", align: "end" },
  { label: "Admissions", align: "end" },
  { label: "Billed (EGP)", align: "end" },
  { label: "Paid (EGP)", align: "end" },
]

/** Per-doctor patient table: nine portrait columns. */
const PATIENT_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto"]

const PATIENT_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Patient" },
  { label: "National ID" },
  { label: "Payment" },
  { label: "Adm.", align: "end" },
  { label: "Last Admission" },
  { label: "Discharged" },
  { label: "Diagnosis" },
  { label: "Billed", align: "end" },
  { label: "Paid", align: "end" },
]

const DISTRIBUTION_WIDTHS = ["*", "auto", "auto"]

const DISTRIBUTION_HEADERS: Array<{
  label: string
  align?: "start" | "end"
}> = [
  { label: "Doctor" },
  { label: "Patients", align: "end" },
  { label: "Share", align: "end" },
]

/**
 * `part / whole` as `12.5%`, or `-` when the denominator is 0.
 *
 * Written as a helper (rather than inline) because the whole-set number of
 * assignments is legitimately 0 for an empty report and `Number(0/0)` would
 * print `NaN%` in the cell.
 */
export function sharePercent(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return "-"
  return `${((part / whole) * 100).toFixed(1)}%`
}

function summaryTable(payload: DoctorReportExportPayload): PdfNode {
  const { summary } = payload

  const body: PdfNode[][] = [
    summaryRow("Doctors", String(summary.totalDoctors)),
    summaryRow("Unique Patients", String(summary.totalPatients)),
    summaryRow(
      "Patient-Doctor Assignments",
      String(summary.totalPatientAssignments)
    ),
    summaryRow("Admissions", String(summary.totalAdmissions)),
    summaryRow("Total Billed", formatCurrencyEn(summary.totalBilled)),
    summaryRow("Total Paid", formatCurrencyEn(summary.totalPaid), {
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 14],
  }
}

/** Share table over every doctor in the document (never just one page). */
function distributionTable(payload: DoctorReportExportPayload): PdfNode {
  const assignments = payload.summary.totalPatientAssignments

  const body: PdfNode[][] = [
    DISTRIBUTION_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...payload.data.map((doctor, index) =>
      [
        bodyCell(doctor.doctorName, { zebra: index % 2 === 1 }),
        bodyCell(String(doctor.totals.patients), {
          align: "end",
          zebra: index % 2 === 1,
        }),
        bodyCell(sharePercent(doctor.totals.patients, assignments), {
          align: "end",
          zebra: index % 2 === 1,
        }),
      ] as PdfNode[]
    ),
  ]

  return {
    table: { headerRows: 1, widths: DISTRIBUTION_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 14],
  }
}

/** Optional chart bitmap; omitted when the capture failed. */
function distributionImage(image: string): PdfNode {
  return {
    image,
    fit: [500, 260],
    alignment: "center",
    margin: [0, 0, 0, 12],
  }
}

function indexRow(doctor: DoctorExportRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(doctor.doctorName, { zebra }),
    bodyCell(doctor.doctorType ? doctor.doctorType.toUpperCase() : "-", {
      zebra,
    }),
    bodyCell(String(doctor.totals.patients), { align: "end", zebra }),
    bodyCell(String(doctor.totals.admissions), { align: "end", zebra }),
    bodyCell(formatMoneyEn(doctor.totals.billed), { align: "end", zebra }),
    bodyCell(formatMoneyEn(doctor.totals.paid), { align: "end", zebra }),
  ]
}

/** Totals strip across the six index columns. */
function indexTotalsRow(payload: DoctorReportExportPayload): PdfNode[] {
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
    {
      text: String(summary.totalPatientAssignments),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    {
      text: String(summary.totalAdmissions),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
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
  ]
}

function doctorTotalsTable(doctor: DoctorExportRow): PdfNode {
  const body: PdfNode[][] = [
    summaryRow("Patients", String(doctor.totals.patients)),
    summaryRow("Admissions", String(doctor.totals.admissions)),
    summaryRow("Total Billed", formatCurrencyEn(doctor.totals.billed)),
    summaryRow("Total Paid", formatCurrencyEn(doctor.totals.paid), {
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

function patientRow(patient: DoctorPatientRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(patient.patientName, { zebra }),
    bodyCell(patient.nationalId ?? "-", { zebra }),
    bodyCell(patient.paymentType.toUpperCase(), { zebra }),
    bodyCell(String(patient.admissionsCount), { align: "end", zebra }),
    bodyCell(formatEnGbDate(patient.lastAdmissionTime), { zebra }),
    bodyCell(
      patient.lastAdmissionTime
        ? patient.lastDischargeTime
          ? formatEnGbDate(patient.lastDischargeTime)
          : "Active"
        : "-",
      { zebra }
    ),
    bodyCell(patient.lastDiagnosis ?? "-", { zebra }),
    bodyCell(formatMoneyEn(patient.totalBilled), { align: "end", zebra }),
    bodyCell(formatMoneyEn(patient.totalPaid), { align: "end", zebra }),
  ]
}

/** Totals strip across the nine patient columns. */
function patientTotalsRow(doctor: DoctorExportRow): PdfNode[] {
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
    {
      text: String(doctor.totals.admissions),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    blank(),
    blank(),
    blank(),
    {
      text: formatMoneyEn(doctor.totals.billed),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    {
      text: formatMoneyEn(doctor.totals.paid),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
  ]
}

/**
 * One doctor's section.
 *
 * Totals come from the doctor's SQL aggregate (authoritative, identical to the
 * index row), never re-summed from the patient rows — the same rule the
 * patient export follows for admissions.
 */
function doctorSection(doctor: DoctorExportRow, index: number): PdfNode[] {
  const heading = doctor.doctorType
    ? `${index + 1}. ${doctor.doctorName} (${doctor.doctorType})`
    : `${index + 1}. ${doctor.doctorName}`

  const body: PdfNode[][] = [
    PATIENT_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...doctor.patients.map((patient, patientIndex) =>
      patientRow(patient, patientIndex)
    ),
    patientTotalsRow(doctor),
  ]

  const content: PdfNode[] = [
    sectionHeading(heading),
    sectionMeta(
      [
        `${plural(doctor.totals.patients, "patient")}`,
        `${plural(doctor.totals.admissions, "admission")}`,
        `Doctor ID: ${doctor.doctorId}`,
      ].join("     •     ")
    ),
    doctorTotalsTable(doctor),
    {
      table: { headerRows: 1, widths: PATIENT_WIDTHS, body },
      layout: reportTableLayout(),
      margin: [0, 0, 0, 4],
    },
  ]

  // Admission detail is attached only for a single-doctor document; when it is
  // absent the patient table is the whole section.
  if (doctor.patients.some((patient) => (patient.admissions?.length ?? 0) > 0)) {
    content.push({
      text: "Admission Detail",
      fontSize: 9,
      bold: true,
      color: PDF_COLORS.text,
      margin: [0, 12, 0, 4],
    })

    for (const patient of doctor.patients) {
      const admissions = patient.admissions ?? []
      if (admissions.length === 0) continue

      content.push(
        sectionHeading(`${patient.patientName} — ${patient.patientId}`)
      )

      admissions.forEach((admission, admissionIndex) => {
        if (admissionIndex > 0) content.push({ text: "", pageBreak: "before" })
        content.push(...admissionSection(admission, admissionIndex))
      })
    }
  }

  return content
}

/** Builds the shell `content` array (no pdfmake side effects). */
export function doctorReportDocContent(
  payload: DoctorReportExportPayload,
  distributionImageData?: string
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

  // A single-doctor document (specific mode) is one row at 100%: the section
  // would say nothing the summary does not already say, so it is skipped.
  if (payload.data.length > 1) {
    if (distributionImageData) {
      content.push(distributionImage(distributionImageData))
    }

    content.push(
      sectionHeading("Patient Distribution"),
      sectionMeta(
        `Share of ${payload.summary.totalPatientAssignments} patient-doctor assignments`
      ),
      distributionTable(payload)
    )
  }

  content.push({
    text: plural(payload.summary.totalDoctors, "doctor"),
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
        ...payload.data.map((doctor, index) => indexRow(doctor, index)),
        indexTotalsRow(payload),
      ],
    },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 8],
  })

  // Each doctor starts on a fresh page so a section can be handed out alone.
  payload.data.forEach((doctor, index) => {
    content.push({ text: "", pageBreak: "before" })
    content.push(...doctorSection(doctor, index))
  })

  return content
}

export async function buildDoctorReportPdf({
  payload,
  t,
  language,
  distributionImage: image,
}: BuildDoctorReportPdfInputs): Promise<void> {
  await openPdfShellDoc(
    {
      title: "Doctor Report",
      content: doctorReportDocContent(payload, image),
    },
    { t, language }
  )
}
