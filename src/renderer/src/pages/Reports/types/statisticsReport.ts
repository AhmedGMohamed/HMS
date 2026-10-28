/**
 * Statistics report types — Phase 6.11.4.
 *
 * camelCase mirrors of the statistics slice of
 * `src/app/utils/types/reportV2.d.ts` (the model emits snake_case; `lib/api.ts`
 * normalizes at the boundary).
 *
 * The payload is one document rather than a page, because every series covers
 * the whole range: the export is the same document plus `generatedAt`, so a
 * download can never disagree with the screen.
 *
 * ## `distribution` is two series, not a filter
 *
 * The server returns both the payment-type and the gender split in one
 * response, so toggling the donut is pure view state — no request, no
 * regeneration. That is why `distributionMode` lives in the URL (`dist`) but
 * not in the query.
 */

import type {
  DistributionMode,
  ReportGrouping,
  ReportRange,
} from "@/pages/Reports/types/reports"

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

/** The server echoes its own bounds and the grouping it applied. */
export interface StatisticsReportRange {
  startDate: string
  endDate: string
  grouping: ReportGrouping
}

export interface StatisticsDistributionEntry {
  key: string
  count: number
}

export interface StatisticsReportPayload {
  range: StatisticsReportRange
  kpis: StatisticsKpis
  patientCensus: PatientCensusPoint[]
  distribution: {
    paymentType: StatisticsDistributionEntry[]
    gender: StatisticsDistributionEntry[]
  }
  averageStay: AverageStayPoint[]
  revenueTrends: RevenueTrendPoint[]
  admissionDischarge: AdmissionDischargePoint[]
  topServices: TopServiceRow[]
  topDrugs: TopDrugRow[]
  staffUtilization: StaffUtilizationRow[]
}

export interface StatisticsReportExportPayload extends StatisticsReportPayload {
  generatedAt: string
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

/**
 * `totalOutstanding` is derived (`billed - collected`), never a third sum:
 * two totals of the same rows cannot disagree, and a separate
 * `SUM(total - paid)` would round differently.
 */
export interface StatisticsKpis {
  totalPatients: number
  totalAdmissions: number
  totalDischarges: number
  /** Average of admissions **discharged** inside the range. */
  avgStayDays: number
  totalBilled: number
  totalCollected: number
  totalOutstanding: number
}

/* ------------------------------------------------------------------ */
/* Series                                                              */
/* ------------------------------------------------------------------ */

/** Identity columns every series point carries. */
export interface StatisticsPeriodPoint {
  /** `YYYY-MM-DD` (day), `YYYY-MM` (month) or `YYYY` (year). */
  period: string
  year: number
  month: number
  day: number
}

export interface PatientCensusPoint extends StatisticsPeriodPoint {
  /** Patients **present** in the bucket (not only new admissions). */
  census: number
  admissions: number
}

export interface AverageStayPoint extends StatisticsPeriodPoint {
  discharges: number
  avgStayDays: number
}

export interface RevenueTrendPoint extends StatisticsPeriodPoint {
  billed: number
  collected: number
  outstanding: number
  billCount: number
  avgBillAmount: number
}

export interface AdmissionDischargePoint extends StatisticsPeriodPoint {
  admissions: number
  discharges: number
  /** `admissions - discharges`, computed server-side. */
  netChange: number
}

/* ------------------------------------------------------------------ */
/* Top N                                                               */
/* ------------------------------------------------------------------ */

export interface TopServiceRow {
  serviceId: number
  serviceName: string
  serviceType: string | null
  usageCount: number
  totalQuantity: number
  totalRevenue: number
}

export interface TopDrugRow {
  drugId: number
  drugName: string
  manufacturer: string | null
  usageCount: number
  totalQuantity: number
  totalRevenue: number
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export interface StaffUtilizationRow {
  employeeType: string
  staffCount: number
  patientsServed: number
  avgHoursPerAssignment: number
  totalHoursWorked: number
  avgPatientsPerStaff: number
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

export interface StatisticsQueryFilters {
  range: ReportRange
  grouping: ReportGrouping
}

/** Which split the donut draws; the data for both is always present. */
export type StatisticsDistributionMode = DistributionMode
