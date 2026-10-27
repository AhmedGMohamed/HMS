/**
 * Doctor report types — Phase 6.11.2.
 *
 * camelCase mirrors of the doctor slice of `src/app/utils/types/reportV2.d.ts`
 * (the models emit snake_case; `lib/api.ts` normalizes at the boundary).
 *
 * Two envelopes are deliberately different shapes:
 *   - the **list** is one row per doctor with aggregate counts,
 *   - the **detail** is one doctor plus one page of their patients, carrying
 *     the `last_*` fields the list does not need.
 *
 * Only the export carries admissions, and only for a single-doctor document
 * (server contract: `include_admissions` is honoured with `doctor_id` only).
 */

import type { PatientReportAdmission } from "@/pages/Reports/types/patientReport"
import type { DoctorRelationship, ReportRange } from "@/pages/Reports/types/reports"

/* ------------------------------------------------------------------ */
/* Envelopes                                                           */
/* ------------------------------------------------------------------ */

/**
 * Whole-set summary.
 *
 * `totalPatients` / `totalAdmissions` / billed / paid are **deduplicated**
 * across doctors; `totalPatientAssignments` is the additive sum of the
 * per-doctor patient counts. The tab shows both so the "unique patients" KPI
 * and the doctor table can never look like they disagree.
 */
export interface DoctorReportSummary {
  relationship: DoctorRelationship
  totalDoctors: number
  totalPatients: number
  totalPatientAssignments: number
  totalAdmissions: number
  totalBilled: number
  totalPaid: number
}

export interface DoctorReportListPayload {
  summary: DoctorReportSummary
  data: DoctorReportRow[]
  total: number
  page: number
  pageSize: number
}

/** The export envelope echoes the server's own range, not `from`/`to`. */
export interface DoctorReportExportRange {
  startDate: string
  endDate: string
}

export interface DoctorReportExportPayload {
  generatedAt: string
  range: DoctorReportExportRange
  summary: DoctorReportSummary
  /** Every matching doctor, each with every patient in the period. */
  data: DoctorExportRow[]
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface DoctorReportRow {
  doctorId: number
  doctorName: string
  doctorType: string | null
  patientsCount: number
  admissionsCount: number
  totalBilled: number
  totalPaid: number
}

export interface DoctorPatientRow {
  patientId: number
  patientName: string
  nationalId: string | null
  gender: string | null
  /** Derived from the national ID against the report end date. */
  age: number | null
  paymentType: string
  insuranceCompany: string | null
  insuranceCardId: string | null
  insuranceFormId: string | null
  admissionsCount: number
  totalBilled: number
  totalPaid: number
  lastAdmissionTime: string | null
  lastDischargeTime: string | null
  lastDiagnosis: string | null
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export interface DoctorDetailSummary {
  patients: number
  admissions: number
  billed: number
  paid: number
}

export interface DoctorDetailHeader {
  doctorId: number
  doctorName: string
  doctorType: string | null
}

export interface DoctorReportDetailPayload {
  doctor: DoctorDetailHeader
  /** Scoped to the **generated** filters and the patient search. */
  summary: DoctorDetailSummary
  data: DoctorPatientRow[]
  total: number
  page: number
  pageSize: number
}

/** Export row: the doctor plus the patient rows the document prints. */
export interface DoctorExportRow {
  doctorId: number
  doctorName: string
  doctorType: string | null
  /** The doctor-level aggregates (authoritative, equal to the index row). */
  totals: DoctorDetailSummary
  patients: Array<DoctorPatientRow & { admissions?: PatientReportAdmission[] }>
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

/** Doctor-list sort keys (`?sort=`). Keys are snake_case by contract. */
export const DOCTOR_SORT_COLUMNS = {
  name: "name",
  patients: "patients",
  admissions: "admissions",
  billed: "billed",
  paid: "paid",
} as const

export type DoctorSortColumn = keyof typeof DOCTOR_SORT_COLUMNS

export function isDoctorSortColumn(value: string): value is DoctorSortColumn {
  return Object.prototype.hasOwnProperty.call(DOCTOR_SORT_COLUMNS, value)
}

/** Per-doctor patient table sort keys; `last_admission` is server-only. */
export const DOCTOR_PATIENT_SORT_COLUMNS = {
  name: "name",
  admissions: "admissions",
  billed: "billed",
  paid: "paid",
  lastAdmission: "last_admission",
} as const

export type DoctorPatientSortColumn = keyof typeof DOCTOR_PATIENT_SORT_COLUMNS

export function isDoctorPatientSortColumn(
  value: string
): value is DoctorPatientSortColumn {
  return Object.prototype.hasOwnProperty.call(
    DOCTOR_PATIENT_SORT_COLUMNS,
    value
  )
}

export interface DoctorQueryFilters {
  range: ReportRange
  relationship: DoctorRelationship
  /** `null` = the whole relationship (all-report mode). */
  doctorId: number | null
  /**
   * All mode: doctor-name search. Specific mode: patient-name search. The
   * field means one thing per mode, which is why the tab clears it when the
   * report type changes.
   */
  search: string
}

export interface DoctorQueryPaging {
  page: number
  pageSize: number
  sort: { columnId: string; direction: "asc" | "desc" } | null
}
