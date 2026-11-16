/**
 * Nurse report CSV — Phase 6.11.3.
 *
 * Two flat tables, because the report answers two questions:
 *
 *   1. **Patients** — one row per (nurse, patient), with the nurse's totals
 *      repeated, so `SUM` over the nurse-hours column equals the additive
 *      figure rather than the deduplicated patient count.
 *   2. **Daily Assignments** — one row per (nurse, work date, patient), with
 *      the day's totals repeated, so a pivot by date sums correctly.
 *
 * A header row per nurse would break sorting and filtering in a spreadsheet, so
 * the nurse identity is carried as columns instead (same rule as 6.11.2).
 *
 * Hours are raw numbers (no suffix) so columns can be summed; dates are
 * `DD/MM/YYYY`. The PDF is the human-readable artifact.
 */

import { downloadCsv, toSectionedCsv, type CsvSection } from "@/lib/csv"
import { formatEnGbDate } from "@/lib/pdf/format"
import type { NurseReportExportPayload } from "@/pages/Reports/types/nurseReport"

const PATIENT_HEADERS = [
  "Nurse ID",
  "Nurse Name",
  "Nurse Patients",
  "Nurse Days",
  "Nurse Hours",
  "Patient ID",
  "Patient Name",
  "Payment Type",
  "Last Admission",
  "Last Discharge",
  "Diagnosis",
  "Days Assigned",
  "Hours Worked",
]

const DAILY_HEADERS = [
  "Nurse ID",
  "Nurse Name",
  "Work Date",
  "Day Patients",
  "Day Hours",
  "Patient ID",
  "Patient Name",
  "Payment Type",
  "Diagnosis",
  "Hours Worked",
]

export interface ExportNurseReportCsvInputs {
  payload: NurseReportExportPayload
}

/** `2014-02-17T10:00:00.000Z` → `17/02/2014` (empty for null). */
function dateCell(value: string | null): string {
  return value ? formatEnGbDate(value) : ""
}

/** Builds the CSV text (no side effects) so it can be unit-tested. */
export function nurseReportCsv(payload: NurseReportExportPayload): string {
  const patientRows: unknown[][] = []
  const dailyRows: unknown[][] = []

  for (const nurse of payload.data) {
    for (const patient of nurse.patients) {
      patientRows.push([
        nurse.nurseId,
        nurse.nurseName,
        nurse.totals.patients,
        nurse.totals.days,
        nurse.totals.hours,
        patient.patientId,
        patient.patientName,
        patient.paymentType,
        dateCell(patient.lastAdmissionTime),
        dateCell(patient.lastDischargeTime),
        patient.diagnosis ?? "",
        patient.daysAssigned,
        patient.hoursWorked,
      ])
    }

    for (const day of nurse.dailyAssignments) {
      for (const patient of day.patients) {
        dailyRows.push([
          nurse.nurseId,
          nurse.nurseName,
          formatEnGbDate(`${day.workDate}T00:00:00`),
          day.patientCount,
          day.totalHours,
          patient.patientId,
          patient.patientName,
          patient.paymentType,
          patient.diagnosis ?? "",
          patient.hoursWorked,
        ])
      }
    }
  }

  const sections: CsvSection[] = [
    // Title-less so the first header row stays row 1 of the file.
    { headers: PATIENT_HEADERS, rows: patientRows },
  ]

  // A header-only table would suggest the section was meant to have content.
  if (dailyRows.length > 0) {
    sections.push({
      title: "Daily Assignments",
      headers: DAILY_HEADERS,
      rows: dailyRows,
    })
  }

  return toSectionedCsv(sections)
}

/** Triggers the download of the nurse report CSV. */
export function exportNurseReportCsv({
  payload,
}: ExportNurseReportCsvInputs): void {
  const from = payload.range.startDate.slice(0, 10)
  const to = payload.range.endDate.slice(0, 10)
  downloadCsv(`nurse-report_${from}_${to}.csv`, nurseReportCsv(payload))
}
