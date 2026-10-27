/**
 * Nurse report types — Phase 6.11.3.
 *
 * camelCase mirrors of the nurse slice of `src/app/utils/types/reportV2.d.ts`
 * (the models emit snake_case; `lib/api.ts` normalizes at the boundary).
 *
 * Three shapes:
 *   - the **list** is one row per nurse with in-range aggregates,
 *   - the **detail** is one nurse, one page of their patients and the whole
 *     daily-assignment accordion (one query, not one per day),
 *   - the **export** carries every nurse with every patient and every day.
 *
 * ## Unique vs additive
 *
 * `totalPatients` is deduplicated across nurses; `totalPatientAssignments` and
 * `totalDays` are the additive per-nurse sums. The KPI card shows the unique
 * count, the table footer sums the column — both are correct, they answer
 * different questions (see 6.11.2 contract 18).
 */

import type { ReportRange } from "@/pages/Reports/types/reports"

/* ------------------------------------------------------------------ */
/* Envelopes                                                           */
/* ------------------------------------------------------------------ */

export interface NurseReportSummary {
  totalNurses: number
  totalPatients: number
  totalPatientAssignments: number
  totalDays: number
  totalHours: number
}

export interface NurseReportListPayload {
  summary: NurseReportSummary
  data: NurseReportRow[]
  total: number
  page: number
  pageSize: number
}

/** The export envelope echoes the server's own range, not `from`/`to`. */
export interface NurseReportExportRange {
  startDate: string
  endDate: string
}

export interface NurseReportExportPayload {
  generatedAt: string
  range: NurseReportExportRange
  summary: NurseReportSummary
  /** Every matching nurse, each with every patient and every day. */
  data: NurseExportRow[]
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface NurseReportRow {
  nurseId: number
  nurseName: string
  patientsCount: number
  /** Distinct `work_date`s inside the range. */
  daysWorked: number
  totalHours: number
  lastWorkDate: string | null
}

export interface NursePatientRow {
  patientId: number
  patientName: string
  paymentType: string
  /** Latest admission **overlapping** the range (may predate it). */
  lastAdmissionTime: string | null
  lastDischargeTime: string | null
  diagnosis: string | null
  daysAssigned: number
  hoursWorked: number
}

export interface NurseDailyAssignmentPatient {
  patientId: number
  patientName: string
  paymentType: string
  diagnosis: string | null
  hoursWorked: number
}

/** One accordion row: a work date, its patients and its totals. */
export interface NurseDailyAssignment {
  workDate: string
  patientCount: number
  totalHours: number
  patients: NurseDailyAssignmentPatient[]
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export interface NurseDetailSummary {
  patients: number
  days: number
  hours: number
}

export interface NurseDetailHeader {
  nurseId: number
  nurseName: string
}

export interface NurseReportDetailPayload {
  nurse: NurseDetailHeader
  /** Scoped to the **generated** filters and the patient search. */
  summary: NurseDetailSummary
  data: NursePatientRow[]
  /** Whole accordion, newest day first; follows `search` too. */
  dailyAssignments: NurseDailyAssignment[]
  total: number
  page: number
  pageSize: number
}

/** Export row: the nurse plus the patient and day rows the document prints. */
export interface NurseExportRow {
  nurseId: number
  nurseName: string
  /** The nurse-level aggregates (authoritative, equal to the index row). */
  totals: NurseDetailSummary
  patients: NursePatientRow[]
  dailyAssignments: NurseDailyAssignment[]
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

/** Nurse-list sort keys (`?sort=`). */
export const NURSE_SORT_COLUMNS = {
  name: "name",
  patients: "patients",
  days: "days",
  hours: "hours",
  lastWork: "last_work",
} as const

export type NurseSortColumn = keyof typeof NURSE_SORT_COLUMNS

export function isNurseSortColumn(value: string): value is NurseSortColumn {
  return Object.prototype.hasOwnProperty.call(NURSE_SORT_COLUMNS, value)
}

/** Per-nurse patient table sort keys; `last_admission` is server-only. */
export const NURSE_PATIENT_SORT_COLUMNS = {
  name: "name",
  days: "days",
  hours: "hours",
  lastAdmission: "last_admission",
} as const

export type NursePatientSortColumn = keyof typeof NURSE_PATIENT_SORT_COLUMNS

export function isNursePatientSortColumn(
  value: string
): value is NursePatientSortColumn {
  return Object.prototype.hasOwnProperty.call(
    NURSE_PATIENT_SORT_COLUMNS,
    value
  )
}

export interface NurseQueryFilters {
  range: ReportRange
  /** `null` = every nurse with assignments in the range (all-report mode). */
  nurseId: number | null
  /**
   * All mode: nurse-name search. Specific mode: patient-name search. The
   * field means one thing per mode, which is why the tab clears it when the
   * report type changes.
   */
  search: string
}

export interface NurseQueryPaging {
  page: number
  pageSize: number
  sort: { columnId: string; direction: "asc" | "desc" } | null
}
