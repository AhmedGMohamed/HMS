/**
 * Patient report CSV — Phase 6.11.1.
 *
 * Four sections in one file, mirroring the PDF document order:
 *
 *   1. **Patients** — one row per patient (the old flat export, unchanged
 *      columns, so anything already parsing this file keeps working: the
 *      section is title-less, so the header row is still row 1).
 *   2. **Admissions** — one row per admission in the range.
 *   3. **Billed Items** — one row per line item, with the service date as a
 *      **column** (not a date-heading row), matching the PDF item table.
 *   4. **Daily Staff** — one row per (admission, work date, employee).
 *
 * `toSectionedCsv` puts a blank line between sections; Excel reads that as one
 * file with four tables, and a human can still sum a column per section.
 *
 * Money is exported as a raw number (no currency symbol) so the column can be
 * summed; the PDF is the human-readable artifact. Dates are `DD/MM/YYYY`.
 */

import { downloadCsv, toSectionedCsv, type CsvSection } from "@/lib/csv"
import { formatEnGbDate } from "@/lib/pdf/format"
import type { PatientReportExportPayload } from "@/pages/Reports/types/patientReport"

/** The pre-6.11.1 flat patient sheet — kept byte-identical. */
const PATIENT_HEADERS = [
  "Patient ID",
  "Patient Name",
  "National ID",
  "Gender",
  "Age",
  "Birth Date",
  "Phone",
  "Address",
  "Payment Type",
  "Insurance Company",
  "Insurance Card ID",
  "Insurance Form ID",
  "Referring Doctor",
  "Admissions",
  "Active Admission",
  "First Admission",
  "Last Admission",
  "Total Billed",
  "Total Paid",
  "Outstanding",
]

const ADMISSION_HEADERS = [
  "Patient ID",
  "Patient Name",
  "Admission #",
  "Admission Date",
  "Discharge Date",
  "Length of Stay (Days)",
  "Bill ID",
  "Diagnosis",
  "Leave Reason",
  "Base Total",
  "Discount",
  "Administrative Expenses",
  "VAT",
  "Net Total",
  "Paid",
  "Outstanding",
]

const ITEM_HEADERS = [
  "Patient ID",
  "Patient Name",
  "Admission #",
  "Date",
  "Item",
  "Type",
  "Quantity",
  "Unit Price",
  "Total",
]

const STAFF_HEADERS = [
  "Patient ID",
  "Patient Name",
  "Admission #",
  "Date",
  "Role",
  "Name",
  "Hours",
]

export interface ExportPatientReportCsvInputs {
  payload: PatientReportExportPayload
}

/** `2014-02-17T10:00:00.000Z` → `17/02/2014` (empty for null). */
function dateCell(value: string | null): string {
  return value ? formatEnGbDate(value) : ""
}

/** Builds the CSV text (no side effects) so it can be unit-tested. */
export function patientReportCsv(payload: PatientReportExportPayload): string {
  const patientRows = payload.data.map((row) => [
    row.patientId,
    row.patientName,
    row.nationalId ?? "",
    row.gender ?? "",
    row.age ?? "",
    dateCell(row.birthDate),
    row.phone ?? "",
    row.address ?? "",
    row.paymentType,
    row.insuranceCompany ?? "",
    row.insuranceCardId ?? "",
    row.insuranceFormId ?? "",
    row.referringDoctorName ?? "",
    row.admissionsCount,
    row.hasActiveAdmission ? "Yes" : "No",
    dateCell(row.firstAdmission),
    dateCell(row.lastAdmission),
    row.totalBilled,
    row.totalPaid,
    row.totalOutstanding,
  ])

  const admissionRows: unknown[][] = []
  const itemRows: unknown[][] = []
  const staffRows: unknown[][] = []

  for (const patient of payload.data) {
    patient.admissions.forEach((admission, index) => {
      // 1-based and per patient, matching the PDF's `n. Admission` headings.
      const ordinal = index + 1

      admissionRows.push([
        patient.patientId,
        patient.patientName,
        ordinal,
        dateCell(admission.admissionTime),
        dateCell(admission.dischargeTime),
        admission.lengthOfStayDays,
        admission.billId ?? "",
        admission.diagnosis ?? "",
        admission.leaveReason ?? "",
        admission.baseTotal,
        admission.calculatedDiscount,
        admission.administrativeExpenses,
        admission.calculatedVat,
        admission.finalTotal,
        admission.paidAmount,
        admission.outstandingAmount,
      ])

      for (const group of admission.itemsByDate) {
        for (const item of group.items) {
          itemRows.push([
            patient.patientId,
            patient.patientName,
            ordinal,
            dateCell(group.serviceDate),
            item.itemName,
            item.itemType,
            item.quantity,
            item.unitPrice,
            item.totalPrice,
          ])
        }
      }

      for (const day of admission.dailyStaff) {
        const members = [
          ...day.doctors.map((member) => ({ ...member, role: "Doctor" })),
          ...day.nurses.map((member) => ({ ...member, role: "Nurse" })),
        ]
        for (const member of members) {
          staffRows.push([
            patient.patientId,
            patient.patientName,
            ordinal,
            dateCell(day.workDate),
            member.role,
            member.name,
            member.hoursWorked,
          ])
        }
      }
    })
  }

  const sections: CsvSection[] = [
    // Title-less so the patient header row stays the first line of the file.
    { headers: PATIENT_HEADERS, rows: patientRows },
  ]

  // Empty detail sections are omitted: a period with no bills should not
  // leave a header-only table behind.
  if (admissionRows.length > 0) {
    sections.push({
      title: "Admissions",
      headers: ADMISSION_HEADERS,
      rows: admissionRows,
    })
  }
  if (itemRows.length > 0) {
    sections.push({
      title: "Billed Items",
      headers: ITEM_HEADERS,
      rows: itemRows,
    })
  }
  if (staffRows.length > 0) {
    sections.push({
      title: "Daily Staff",
      headers: STAFF_HEADERS,
      rows: staffRows,
    })
  }

  return toSectionedCsv(sections)
}

/** Triggers the download of the patient report CSV. */
export function exportPatientReportCsv({
  payload,
}: ExportPatientReportCsvInputs): void {
  const from = payload.range.startDate.slice(0, 10)
  const to = payload.range.endDate.slice(0, 10)
  downloadCsv(`patient-report_${from}_${to}.csv`, patientReportCsv(payload))
}
