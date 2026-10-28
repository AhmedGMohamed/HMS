/**
 * English labels and slot names for the statistics PDF snapshots — Phase 6.11.4.
 *
 * Kept out of `StatisticsCharts.tsx` because that module only exports
 * components (`react-refresh/only-export-components`), and the export surface
 * needs constants.
 *
 * Exports are English-only (Vault 6.9 / Insurance 6.10 / Patient 6.11.1 /
 * Doctor 6.11.2 / Nurse 6.11.3 parity), which is why these strings are
 * intentionally untranslated. The on-screen charts use the same label *slots*
 * filled from `reports.*`, so a label can never drift between the two
 * renderings.
 */

/** `data-chart-snapshot-key` values, one per chart slot. */
export const STATISTICS_SNAPSHOT_KEYS = {
  census: "statistics-census",
  distribution: "statistics-distribution",
  averageStay: "statistics-average-stay",
  revenue: "statistics-revenue",
  flow: "statistics-flow",
  topServices: "statistics-top-services",
  topDrugs: "statistics-top-drugs",
  staff: "statistics-staff",
} as const

export type StatisticsSnapshotKey =
  (typeof STATISTICS_SNAPSHOT_KEYS)[keyof typeof STATISTICS_SNAPSHOT_KEYS]

/** Every chart slot in capture order. */
export const STATISTICS_SNAPSHOT_ORDER: StatisticsSnapshotKey[] = [
  STATISTICS_SNAPSHOT_KEYS.census,
  STATISTICS_SNAPSHOT_KEYS.distribution,
  STATISTICS_SNAPSHOT_KEYS.averageStay,
  STATISTICS_SNAPSHOT_KEYS.revenue,
  STATISTICS_SNAPSHOT_KEYS.flow,
  STATISTICS_SNAPSHOT_KEYS.topServices,
  STATISTICS_SNAPSHOT_KEYS.topDrugs,
  STATISTICS_SNAPSHOT_KEYS.staff,
]

/**
 * Series and axis labels shared by the screen and the PDF.
 *
 * The tab fills this from `reports.statistics.series.*`; the snapshot uses
 * `EN_LABELS`, so adding a series means adding one key and one constant.
 */
export interface StatisticsChartLabels {
  // series
  census: string
  admissions: string
  discharges: string
  netChange: string
  billed: string
  collected: string
  outstanding: string
  avgStay: string
  staff: string
  patients: string
  hours: string
  revenue: string
  // axes / categories
  period: string
  employeeType: string
  service: string
  drug: string
  // card captions
  emptyTitle: string
  emptyDescription: string
}

export const EN_LABELS: StatisticsChartLabels = {
  census: "Census",
  admissions: "Admissions",
  discharges: "Discharges",
  netChange: "Net change",
  billed: "Billed",
  collected: "Collected",
  outstanding: "Outstanding",
  avgStay: "Avg stay (days)",
  staff: "Staff",
  patients: "Patients",
  hours: "Hours",
  revenue: "Revenue",
  period: "Period",
  employeeType: "Employee type",
  service: "Service",
  drug: "Drug",
  emptyTitle: "No data in this period",
  emptyDescription: "Nothing was recorded for the selected range.",
}
