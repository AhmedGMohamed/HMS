/**
 * Doctor report CSV — Phase 6.11.2.
 *
 * One row per (doctor, patient), which is the flat shape a spreadsheet wants:
 * the doctor's totals are repeated on each of their rows, so `SUM` over the
 * table equals the additive assignment figure rather than the deduplicated
 * patient count. A header row per doctor would break sorting and filtering,
 * so the doctor identity is carried as columns instead.
 *
 * A second section lists the admissions, but only when the export included
 * them (single-doctor document) — an all-doctors CSV must not imply that
 * admission data was left out.
 *
 * Money is a raw number (no symbol) so the columns can be summed; the PDF is
 * the human-readable artifact. Dates are `DD/MM/YYYY`.
 */

import { downloadCsv, toSectionedCsv, type CsvSection } from "@/lib/csv"
import { formatEnGbDate } from "@/lib/pdf/format"
import type {
  DoctorReportExportPayload,
} from "@/pages/Reports/types/doctorReport"

const DOCTOR_PATIENT_HEADERS = [
  "Doctor ID",
  "Doctor Name",
  "Doctor Type",
  "Doctor Patients",
  "Doctor Admissions",
  "Doctor Total Billed",
  "Doctor Total Paid",
  "Patient ID",
  "Patient Name",
  "National ID",
  "Gender",
  "Age",
  "Payment Type",
  "Insurance Company",
  "Patient Admissions",
  "Last Admission",
  "Last Discharge",
  "Last Diagnosis",
  "Patient Total Billed",
  "Patient Total Paid",
]

const ADMISSION_HEADERS = [
  "Doctor ID",
  "Doctor Name",
  "Patient ID",
  "Patient Name",
  "Admission #",
  "Admission Date",
  "Discharge Date",
  "Bill ID",
  "Diagnosis",
  "Net Total",
  "Paid",
  "Outstanding",
]

export interface ExportDoctorReportCsvInputs {
  payload: DoctorReportExportPayload
}

/** `2014-02-17T10:00:00.000Z` → `17/02/2014` (empty for null). */
function dateCell(value: string | null): string {
  return value ? formatEnGbDate(value) : ""
}

/** Builds the CSV text (no side effects) so it can be unit-tested. */
export function doctorReportCsv(payload: DoctorReportExportPayload): string {
  const patientRows: unknown[][] = []
  const admissionRows: unknown[][] = []

  for (const doctor of payload.data) {
    for (const patient of doctor.patients) {
      patientRows.push([
        doctor.doctorId,
        doctor.doctorName,
        doctor.doctorType ?? "",
        doctor.totals.patients,
        doctor.totals.admissions,
        doctor.totals.billed,
        doctor.totals.paid,
        patient.patientId,
        patient.patientName,
        patient.nationalId ?? "",
        patient.gender ?? "",
        patient.age ?? "",
        patient.paymentType,
        patient.insuranceCompany ?? "",
        patient.admissionsCount,
        dateCell(patient.lastAdmissionTime),
        dateCell(patient.lastDischargeTime),
        patient.lastDiagnosis ?? "",
        patient.totalBilled,
        patient.totalPaid,
      ])

      const admissions = patient.admissions ?? []
      admissions.forEach((admission, index) => {
        admissionRows.push([
          doctor.doctorId,
          doctor.doctorName,
          patient.patientId,
          patient.patientName,
          index + 1,
          dateCell(admission.admissionTime),
          dateCell(admission.dischargeTime),
          admission.billId ?? "",
          admission.diagnosis ?? "",
          admission.finalTotal,
          admission.paidAmount,
          admission.outstandingAmount,
        ])
      })
    }
  }

  const sections: CsvSection[] = [
    // Title-less so the first header row stays row 1 of the file.
    { headers: DOCTOR_PATIENT_HEADERS, rows: patientRows },
  ]

  // A header-only table would suggest the section was meant to have content.
  if (admissionRows.length > 0) {
    sections.push({
      title: "Admissions",
      headers: ADMISSION_HEADERS,
      rows: admissionRows,
    })
  }

  return toSectionedCsv(sections)
}

/** Triggers the download of the doctor report CSV. */
export function exportDoctorReportCsv({
  payload,
}: ExportDoctorReportCsvInputs): void {
  const from = payload.range.startDate.slice(0, 10)
  const to = payload.range.endDate.slice(0, 10)
  downloadCsv(`doctor-report_${from}_${to}.csv`, doctorReportCsv(payload))
}
