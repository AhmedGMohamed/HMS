/**
 * Nurse report PDF — Phase 6.11.3.
 *
 * Document order mirrors the doctor report (6.11.2) so the exports read the
 * same way on paper:
 *
 *   1. Report period + whole-set summary (unique patients **and** the additive
 *      patient-nurse assignment count, see the note below).
 *   2. Distribution — the optional chart bitmap plus a table covering **every**
 *      nurse with their share of total hours. The on-screen chart draws the
 *      current page; a printed document must not.
 *   3. Index table — one row per nurse, the scannable overview.
 *   4. Per nurse, on a new page: heading, totals, the patient table and the
 *      daily-assignment table (the paper form of the screen accordion).
 *
 * ## Unique vs additive
 *
 * `totalPatients` is deduplicated across nurses while
 * `totalPatientAssignments` is the sum of the per-nurse counts. Both are
 * printed, labelled, so a reader can reconcile the index column sum with the
 * summary without assuming a bug.
 *
 * ## Share percentages are zero-safe
 *
 * `sharePercent` returns `-` (never `NaN%`) when the denominator is 0, which is
 * the gate the phase plan calls out explicitly. The denominator here is
 * **hours**, not patients: the chart is hours per nurse.
 *
 * Labels are English and dates `en-GB`: exports are never localized
 * (Vault 6.9 / Insurance 6.10 / Patient 6.11.1 / Doctor 6.11.2 parity).
 */

import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import { formatEnGbDate, formatNumberEn } from "@/lib/pdf/format"
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
import { sharePercent } from "@/pages/Reports/export/pdf/buildDoctorReportPdf"
import type {
  NurseExportRow,
  NursePatientRow,
  NurseReportExportPayload,
} from "@/pages/Reports/types/nurseReport"

export interface BuildNurseReportPdfInputs {
  payload: NurseReportExportPayload
  t: TFunction
  language: "en" | "ar"
  /** PNG data URL of the distribution chart, captured by the tab. */
  distributionImage?: string
}

/** Nurse index: name (`*`) then content-sized columns. */
const INDEX_WIDTHS = ["*", "auto", "auto", "auto", "auto"]

const INDEX_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Nurse" },
  { label: "Patients", align: "end" },
  { label: "Days", align: "end" },
  { label: "Hours", align: "end" },
  { label: "Last Work Date" },
]

/** Per-nurse patient table: seven portrait columns. */
const PATIENT_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto", "auto"]

const PATIENT_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Patient" },
  { label: "Payment" },
  { label: "Days", align: "end" },
  { label: "Hours", align: "end" },
  { label: "Last Admission" },
  { label: "Discharged" },
  { label: "Diagnosis" },
]

const DISTRIBUTION_WIDTHS = ["*", "auto", "auto"]

const DISTRIBUTION_HEADERS: Array<{
  label: string
  align?: "start" | "end"
}> = [
  { label: "Nurse" },
  { label: "Hours", align: "end" },
  { label: "Share", align: "end" },
]

const DAILY_WIDTHS = ["*", "auto", "auto"]

const DAILY_HEADERS: Array<{ label: string; align?: "start" | "end" }> = [
  { label: "Work Date" },
  { label: "Patients", align: "end" },
  { label: "Hours", align: "end" },
]

function summaryTable(payload: NurseReportExportPayload): PdfNode {
  const { summary } = payload

  const body: PdfNode[][] = [
    summaryRow("Nurses", String(summary.totalNurses)),
    summaryRow("Unique Patients", String(summary.totalPatients)),
    summaryRow(
      "Patient-Nurse Assignments",
      String(summary.totalPatientAssignments)
    ),
    summaryRow("Total Days", String(summary.totalDays)),
    summaryRow("Total Hours", formatNumberEn(summary.totalHours), {
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 14],
  }
}

/** Share table over every nurse in the document (never just one page). */
function distributionTable(payload: NurseReportExportPayload): PdfNode {
  const totalHours = payload.summary.totalHours

  const body: PdfNode[][] = [
    DISTRIBUTION_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...payload.data.map((nurse, index) =>
      [
        bodyCell(nurse.nurseName, { zebra: index % 2 === 1 }),
        bodyCell(formatNumberEn(nurse.totals.hours), {
          align: "end",
          zebra: index % 2 === 1,
        }),
        bodyCell(sharePercent(nurse.totals.hours, totalHours), {
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

function indexRow(nurse: NurseExportRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(nurse.nurseName, { zebra }),
    bodyCell(String(nurse.totals.patients), { align: "end", zebra }),
    bodyCell(String(nurse.totals.days), { align: "end", zebra }),
    bodyCell(formatNumberEn(nurse.totals.hours), { align: "end", zebra }),
    bodyCell(
      nurse.patients.length > 0
        ? latestWorkDateLabel(nurse)
        : "-",
      { zebra }
    ),
  ]
}

/**
 * The list endpoint returns `last_work_date`; the export rows do not repeat it,
 * so the document derives it from the daily assignments it already carries
 * (they arrive newest-first). Keeping the document free of a second query is
 * what holds the export at four queries.
 */
function latestWorkDateLabel(nurse: NurseExportRow): string {
  const newest = nurse.dailyAssignments[0]?.workDate
  return newest ? formatEnGbDate(`${newest}T00:00:00`) : "-"
}

/** Totals strip across the five index columns. */
function indexTotalsRow(payload: NurseReportExportPayload): PdfNode[] {
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
    {
      text: String(summary.totalPatientAssignments),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    {
      text: String(summary.totalDays),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    {
      text: formatNumberEn(summary.totalHours),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    blank(),
  ]
}

function nurseTotalsTable(nurse: NurseExportRow): PdfNode {
  const body: PdfNode[][] = [
    summaryRow("Patients", String(nurse.totals.patients)),
    summaryRow("Days", String(nurse.totals.days)),
    summaryRow("Hours", formatNumberEn(nurse.totals.hours), {
      emphasis: true,
    }),
  ]

  return {
    table: { widths: SUMMARY_TABLE_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 10],
  }
}

function patientRow(patient: NursePatientRow, index: number): PdfNode[] {
  const zebra = index % 2 === 1

  return [
    bodyCell(patient.patientName, { zebra }),
    bodyCell(patient.paymentType.toUpperCase(), { zebra }),
    bodyCell(String(patient.daysAssigned), { align: "end", zebra }),
    bodyCell(formatNumberEn(patient.hoursWorked), { align: "end", zebra }),
    bodyCell(formatEnGbDate(patient.lastAdmissionTime), { zebra }),
    bodyCell(
      patient.lastAdmissionTime
        ? patient.lastDischargeTime
          ? formatEnGbDate(patient.lastDischargeTime)
          : "Active"
        : "-",
      { zebra }
    ),
    bodyCell(patient.diagnosis ?? "-", { zebra }),
  ]
}

/** Totals strip across the seven patient columns. */
function patientTotalsRow(nurse: NurseExportRow): PdfNode[] {
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
      text: String(nurse.totals.days),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    {
      text: formatNumberEn(nurse.totals.hours),
      bold: true,
      fontSize: 8,
      alignment: "right",
      fillColor: PDF_COLORS.bandStrong,
    },
    blank(),
    blank(),
    blank(),
  ]
}

/** The paper form of the screen accordion: one row per work date. */
function dailyTable(nurse: NurseExportRow): PdfNode {
  const body: PdfNode[][] = [
    DAILY_HEADERS.map((column) => headerCell(column.label, column.align)),
    ...nurse.dailyAssignments.map((day, index) =>
      [
        bodyCell(formatEnGbDate(`${day.workDate}T00:00:00`), {
          zebra: index % 2 === 1,
        }),
        bodyCell(String(day.patientCount), {
          align: "end",
          zebra: index % 2 === 1,
        }),
        bodyCell(formatNumberEn(day.totalHours), {
          align: "end",
          zebra: index % 2 === 1,
        }),
      ] as PdfNode[]
    ),
    [
      {
        text: "TOTALS",
        bold: true,
        fontSize: 8,
        fillColor: PDF_COLORS.bandStrong,
      },
      {
        text: String(nurse.dailyAssignments.length),
        bold: true,
        fontSize: 8,
        alignment: "right",
        fillColor: PDF_COLORS.bandStrong,
      },
      {
        text: formatNumberEn(nurse.totals.hours),
        bold: true,
        fontSize: 8,
        alignment: "right",
        fillColor: PDF_COLORS.bandStrong,
      },
    ],
  ]

  return {
    table: { headerRows: 1, widths: DAILY_WIDTHS, body },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 4],
  }
}

/**
 * One nurse's section.
 *
 * Totals come from the nurse's SQL aggregate (authoritative, identical to the
 * index row), never re-summed from the patient/day rows — the same rule the
 * patient and doctor exports follow.
 */
function nurseSection(nurse: NurseExportRow, index: number): PdfNode[] {
  const heading = `${index + 1}. ${nurse.nurseName}`

  const content: PdfNode[] = [
    sectionHeading(heading),
    sectionMeta(
      [
        `${plural(nurse.totals.patients, "patient")}`,
        `${plural(nurse.totals.days, "day")}`,
        `Nurse ID: ${nurse.nurseId}`,
      ].join("     •     ")
    ),
    nurseTotalsTable(nurse),
  ]

  if (nurse.patients.length > 0) {
    const body: PdfNode[][] = [
      PATIENT_HEADERS.map((column) => headerCell(column.label, column.align)),
      ...nurse.patients.map((patient, patientIndex) =>
        patientRow(patient, patientIndex)
      ),
      patientTotalsRow(nurse),
    ]

    content.push({
      table: { headerRows: 1, widths: PATIENT_WIDTHS, body },
      layout: reportTableLayout(),
      margin: [0, 0, 0, 10],
    })
  }

  content.push({
    text: "Daily Assignments",
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 6, 0, 4],
  })

  if (nurse.dailyAssignments.length > 0) {
    content.push(dailyTable(nurse))
  } else {
    content.push({
      text: "No daily assignments in this period.",
      fontSize: 8,
      italics: true,
      color: PDF_COLORS.muted,
    })
  }

  return content
}

/** Builds the shell `content` array (no pdfmake side effects). */
export function nurseReportDocContent(
  payload: NurseReportExportPayload,
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

  // A single-nurse document (specific mode) is one row at 100%: the section
  // would say nothing the summary does not already say, so it is skipped.
  if (payload.data.length > 1) {
    if (distributionImageData) {
      content.push(distributionImage(distributionImageData))
    }

    content.push(
      sectionHeading("Hours Distribution"),
      sectionMeta(
        `Share of ${formatNumberEn(payload.summary.totalHours)} total hours`
      ),
      distributionTable(payload)
    )
  }

  content.push({
    text: plural(payload.summary.totalNurses, "nurse"),
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
        ...payload.data.map((nurse, index) => indexRow(nurse, index)),
        indexTotalsRow(payload),
      ],
    },
    layout: reportTableLayout(),
    margin: [0, 0, 0, 8],
  })

  // Each nurse starts on a fresh page so a section can be handed out alone.
  payload.data.forEach((nurse, index) => {
    content.push({ text: "", pageBreak: "before" })
    content.push(...nurseSection(nurse, index))
  })

  return content
}

export async function buildNurseReportPdf({
  payload,
  t,
  language,
  distributionImage: image,
}: BuildNurseReportPdfInputs): Promise<void> {
  await openPdfShellDoc(
    {
      title: "Nurse Report",
      content: nurseReportDocContent(payload, image),
    },
    { t, language }
  )
}
