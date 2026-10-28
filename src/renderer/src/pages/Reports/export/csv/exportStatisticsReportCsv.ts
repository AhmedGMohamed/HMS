/**
 * Statistics report CSV — Phase 6.11.4.
 *
 * One sectioned file, because the tab is eight tables of different shapes and a
 * single flat sheet would need columns that are empty for most rows:
 *
 *   Summary · Patient Census · Revenue Trends · Admissions & Discharges ·
 *   Average Stay · Top Services · Top Drugs · Staff Utilization
 *
 * Numbers are raw (no currency symbol, no thousands separators) so a
 * spreadsheet can sum them; the PDF is the human-readable artifact. Dates are
 * `DD/MM/YYYY` where a cell is a date, and the period label is passed through
 * as the server produced it (`2026-02`, `2026`, `2026-02-17`).
 *
 * Periods with no activity are included (they are real zero rows the charts
 * draw), but top-N lists are omitted when empty rather than written as a
 * header with no body.
 */

import { downloadCsv, toSectionedCsv, type CsvSection } from "@/lib/csv"
import type { StatisticsReportExportPayload } from "@/pages/Reports/types/statisticsReport"

const SUMMARY_HEADERS = ["Metric", "Value"]

const CENSUS_HEADERS = ["Period", "Census", "Admissions"]
const REVENUE_HEADERS = [
  "Period",
  "Billed",
  "Collected",
  "Outstanding",
  "Bills",
  "Avg Bill",
]
const FLOW_HEADERS = ["Period", "Admissions", "Discharges", "Net Change"]
const STAY_HEADERS = ["Period", "Discharges", "Avg Stay Days"]

const TOP_SERVICE_HEADERS = [
  "Service ID",
  "Service",
  "Type",
  "Usage",
  "Quantity",
  "Revenue",
]
const TOP_DRUG_HEADERS = [
  "Drug ID",
  "Drug",
  "Manufacturer",
  "Usage",
  "Quantity",
  "Revenue",
]
const STAFF_HEADERS = [
  "Employee Type",
  "Staff",
  "Patients Served",
  "Total Hours",
  "Avg Hours per Assignment",
  "Avg Patients per Staff",
]

export interface ExportStatisticsReportCsvInputs {
  payload: StatisticsReportExportPayload
}

/** Builds the CSV text (no side effects) so it can be unit-tested. */
export function statisticsReportCsv(
  payload: StatisticsReportExportPayload
): string {
  const { kpis, range } = payload

  const summaryRows: unknown[][] = [
    ["From", range.startDate],
    ["To", range.endDate],
    ["Grouping", range.grouping],
    ["Total Patients", kpis.totalPatients],
    ["Admissions", kpis.totalAdmissions],
    ["Discharges", kpis.totalDischarges],
    ["Avg Stay (Days)", kpis.avgStayDays],
    ["Billed", kpis.totalBilled],
    ["Collected", kpis.totalCollected],
    ["Outstanding", kpis.totalOutstanding],
  ]

  const sections: CsvSection[] = [
    // Title-less so the first header row stays row 1 of the file.
    { headers: SUMMARY_HEADERS, rows: summaryRows },
    {
      title: "Patient Census",
      headers: CENSUS_HEADERS,
      rows: payload.patientCensus.map((point) => [
        point.period,
        point.census,
        point.admissions,
      ]),
    },
    {
      title: "Revenue Trends",
      headers: REVENUE_HEADERS,
      rows: payload.revenueTrends.map((point) => [
        point.period,
        point.billed,
        point.collected,
        point.outstanding,
        point.billCount,
        point.avgBillAmount,
      ]),
    },
    {
      title: "Admissions vs Discharges",
      headers: FLOW_HEADERS,
      rows: payload.admissionDischarge.map((point) => [
        point.period,
        point.admissions,
        point.discharges,
        point.netChange,
      ]),
    },
    {
      title: "Average Stay",
      headers: STAY_HEADERS,
      rows: payload.averageStay.map((point) => [
        point.period,
        point.discharges,
        point.avgStayDays,
      ]),
    },
  ]

  if (payload.topServices.length > 0) {
    sections.push({
      title: "Top Services",
      headers: TOP_SERVICE_HEADERS,
      rows: payload.topServices.map((row) => [
        row.serviceId,
        row.serviceName,
        row.serviceType ?? "",
        row.usageCount,
        row.totalQuantity,
        row.totalRevenue,
      ]),
    })
  }

  if (payload.topDrugs.length > 0) {
    sections.push({
      title: "Top Drugs",
      headers: TOP_DRUG_HEADERS,
      rows: payload.topDrugs.map((row) => [
        row.drugId,
        row.drugName,
        row.manufacturer ?? "",
        row.usageCount,
        row.totalQuantity,
        row.totalRevenue,
      ]),
    })
  }

  if (payload.staffUtilization.length > 0) {
    sections.push({
      title: "Staff Utilization",
      headers: STAFF_HEADERS,
      rows: payload.staffUtilization.map((row) => [
        row.employeeType,
        row.staffCount,
        row.patientsServed,
        row.totalHoursWorked,
        row.avgHoursPerAssignment,
        row.avgPatientsPerStaff,
      ]),
    })
  }

  return toSectionedCsv(sections)
}

/** Triggers the download of the statistics CSV. */
export function exportStatisticsReportCsv({
  payload,
}: ExportStatisticsReportCsvInputs): void {
  const from = payload.range.startDate.slice(0, 10)
  const to = payload.range.endDate.slice(0, 10)
  downloadCsv(`statistics-report_${from}_${to}.csv`, statisticsReportCsv(payload))
}
