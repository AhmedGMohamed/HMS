/**
 * Employee payments (payroll) CSV — Phase 6.11.5.
 *
 * One sectioned file, because the payroll report is five tables of different
 * shapes and a single flat sheet would need columns that are empty for most
 * rows:
 *
 *   Summary · Employees · Payments · Patient Work · Period Deductions ·
 *   Payment Timeline · Payment Types
 *
 * Two rules from the report contract shape the columns:
 *
 *   - **Deductions are a period total, once per employee** (plan D15), so they
 *     appear as an employee column and as their own section — never as a
 *     per-payment column, which is exactly the legacy bug.
 *   - **Paid / unpaid are gross** (`base + extra`); only `Net` subtracts
 *     deductions, so a reader can reconcile the columns arithmetically.
 *
 * Numbers are raw (no currency symbol, no thousands separators) so a
 * spreadsheet can sum them; dates are `DD/MM/YYYY`. The PDF is the
 * human-readable artifact. Sections with no rows are omitted rather than
 * written as a header with no body.
 */

import { downloadCsv, toSectionedCsv, type CsvSection } from "@/lib/csv"
import { formatEnGbDate, formatEnGbDateTime } from "@/lib/pdf/format"
import type { EmployeePaymentExportPayload } from "@/pages/Reports/types/employeePaymentReport"

const SUMMARY_HEADERS = ["Metric", "Value"]

const EMPLOYEE_HEADERS = [
  "Employee ID",
  "Employee Name",
  "Type",
  "Hire Date",
  "Payments",
  "Base Pay",
  "Extra Pay",
  "Deductions",
  "Paid",
  "Unpaid",
  "Net",
]

const PAYMENT_HEADERS = [
  "Employee ID",
  "Employee Name",
  "Payment ID",
  "Payment Date",
  "Payment Type",
  "Percentage Scope",
  "Base Amount",
  "Extra Amount",
  "Gross Amount",
  "Status",
  "Paid On",
  "Patients",
]

const ASSOCIATION_HEADERS = [
  "Employee ID",
  "Employee Name",
  "Payment ID",
  "Patient",
  "Work Date",
  "Hours",
  "Amount",
  "Payment Type",
  "Admitted",
  "Discharged",
  "Diagnosis",
]

const DEDUCTION_HEADERS = [
  "Employee ID",
  "Employee Name",
  "Clock In",
  "Clock Out",
  "Hours",
  "Deduction",
  "Status",
]

const TIMELINE_HEADERS = ["Period", "Gross Pay"]

const TYPE_HEADERS = ["Payment Type", "Gross Pay"]

/** Builds the sectioned CSV document (pure; the download wrapper is below). */
export function employeePaymentsReportCsv(
  payload: EmployeePaymentExportPayload
): string {
  const summary = payload.summary

  const sections: CsvSection[] = [
    {
      title: "Summary",
      headers: SUMMARY_HEADERS,
      rows: [
        ["Employees", summary.totalEmployees],
        ["Payments", summary.totalPayments],
        ["Base Pay", summary.totalBasePay],
        ["Extra Pay", summary.totalExtraPay],
        ["Deductions", summary.totalDeductions],
        ["Paid (gross)", summary.totalPaid],
        ["Unpaid (gross)", summary.totalUnpaid],
        ["Net Pay", summary.totalNet],
      ],
    },
    {
      title: "Employees",
      headers: EMPLOYEE_HEADERS,
      rows: [
        ...payload.data.map((row) => [
          row.employeeId,
          row.employeeName,
          row.employeeType,
          formatEnGbDate(row.hireDate),
          row.totals.payments,
          row.totals.basePay,
          row.totals.extraPay,
          row.totals.deductions,
          row.totals.paid,
          row.totals.unpaid,
          row.totals.net,
        ]),
        // The TOTALS row is the envelope summary, not a re-sum of the column:
        // the server's whole-set figures are the ones the KPI strip shows.
        [
          "TOTALS",
          "",
          "",
          "",
          summary.totalPayments,
          summary.totalBasePay,
          summary.totalExtraPay,
          summary.totalDeductions,
          summary.totalPaid,
          summary.totalUnpaid,
          summary.totalNet,
        ],
      ],
    },
  ]

  const paymentRows = payload.data.flatMap((employee) =>
    employee.payments.map((payment) => [
      employee.employeeId,
      employee.employeeName,
      payment.paymentId,
      formatEnGbDate(payment.paymentDate),
      payment.paymentType,
      payment.percentageScope ?? "",
      payment.paymentAmount,
      payment.extraAmount,
      payment.paymentAmount + payment.extraAmount,
      payment.isPaid ? "Paid" : "Unpaid",
      payment.isPaid ? formatEnGbDateTime(payment.paidTimestamp) : "",
      payment.patientCount,
    ])
  )

  if (paymentRows.length > 0) {
    sections.push({
      title: "Payments",
      headers: PAYMENT_HEADERS,
      rows: paymentRows,
    })
  }

  const associationRows = payload.data.flatMap((employee) =>
    employee.payments.flatMap((payment) =>
      payment.associations.map((association) => [
        employee.employeeId,
        employee.employeeName,
        payment.paymentId,
        association.patientName,
        formatEnGbDate(association.workDate),
        association.hoursWorked,
        association.paymentAmount,
        association.paymentType,
        formatEnGbDate(association.admissionTime),
        formatEnGbDate(association.dischargeTime),
        association.diagnosis ?? "",
      ])
    )
  )

  if (associationRows.length > 0) {
    sections.push({
      title: "Patient Work",
      headers: ASSOCIATION_HEADERS,
      rows: associationRows,
    })
  }

  const deductionRows = payload.data.flatMap((employee) =>
    employee.periodDeductions.map((deduction) => [
      employee.employeeId,
      employee.employeeName,
      formatEnGbDateTime(deduction.clockIn),
      deduction.clockOut ? formatEnGbDateTime(deduction.clockOut) : "",
      deduction.hoursWorked,
      deduction.payDeduction,
      deduction.status,
    ])
  )

  if (deductionRows.length > 0) {
    sections.push({
      title: "Period Deductions",
      headers: DEDUCTION_HEADERS,
      rows: deductionRows,
    })
  }

  if (payload.charts.timeline.length > 0) {
    sections.push({
      title: "Payment Timeline",
      headers: TIMELINE_HEADERS,
      rows: payload.charts.timeline.map((point) => [point.period, point.total]),
    })
  }

  if (payload.charts.byType.length > 0) {
    sections.push({
      title: "Payment Types",
      headers: TYPE_HEADERS,
      rows: payload.charts.byType.map((entry) => [
        entry.paymentType,
        entry.total,
      ]),
    })
  }

  return toSectionedCsv(sections)
}

/** Triggers the download of the payroll CSV. */
export function exportEmployeePaymentsCsv({
  payload,
}: {
  payload: EmployeePaymentExportPayload
}): void {
  const from = payload.range.startDate.slice(0, 10)
  const to = payload.range.endDate.slice(0, 10)
  downloadCsv(
    `employee-payments-report_${from}_${to}.csv`,
    employeePaymentsReportCsv(payload)
  )
}
