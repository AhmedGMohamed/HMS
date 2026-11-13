/**
 * Patient report types — Phase 6.11.1.
 *
 * camelCase mirrors of `src/app/utils/types/reports.d.ts` (the models emit
 * snake_case; `lib/api.ts` normalizes at the boundary). Nothing here may use
 * a snake_case field name.
 */

import type { ReportRange } from "@/pages/Reports/types/reports"

/* ------------------------------------------------------------------ */
/* Envelopes                                                           */
/* ------------------------------------------------------------------ */

export interface PatientReportSummary {
  totalPatients: number
  totalAdmissions: number
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
}

export interface PatientReportListPayload {
  summary: PatientReportSummary
  data: PatientReportRow[]
  total: number
  page: number
  pageSize: number
}

/** The export envelope carries the server's own range echo, not `from`/`to`. */
export interface PatientReportExportRange {
  startDate: string
  endDate: string
}

export interface PatientReportExportPayload {
  generatedAt: string
  range: PatientReportExportRange
  summary: PatientReportSummary
  /** Every patient **with every admission in range** (items + staff). */
  data: PatientReportExportRow[]
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface PatientReportRow {
  patientId: number
  patientName: string
  nationalId: string | null
  gender: string | null
  /** Derived from the national ID server-side; `null` when unknown. */
  age: number | null
  birthDate: string | null
  phone: string | null
  address: string | null
  paymentType: string
  insuranceCompany: string | null
  insuranceFormId: string | null
  insuranceCardId: string | null
  referringDoctorName: string | null
  admissionsCount: number
  firstAdmission: string | null
  lastAdmission: string | null
  hasActiveAdmission: boolean
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export interface PatientReportItem {
  itemType: string
  itemName: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface PatientReportItemGroup {
  serviceDate: string
  dateTotal: number
  items: PatientReportItem[]
}

export interface PatientReportStaffMember {
  employeeId: number
  name: string
  hoursWorked: number
}

export interface PatientReportStaffDay {
  workDate: string
  doctors: PatientReportStaffMember[]
  nurses: PatientReportStaffMember[]
}

export interface PatientReportAdmission {
  patientHistoryId: number
  billId: number | null
  admissionTime: string | null
  dischargeTime: string | null
  diagnosis: string | null
  leaveReason: string | null
  lengthOfStayDays: number
  /** Item subtotal including the bill's medical tests. */
  baseTotal: number
  medicalTestsAmount: number
  discountType: string | null
  discount: number
  discountScope: string[]
  calculatedDiscount: number
  vatPercentage: number
  vatScopeCustom: string[]
  calculatedVat: number
  administrativeExpenses: number
  /** `Bill.total_amount` (authoritative); the computed total is only used
   *  when the admission has no bill at all. */
  finalTotal: number
  paidAmount: number
  outstandingAmount: number
  itemsByDate: PatientReportItemGroup[]
  dailyStaff: PatientReportStaffDay[]
}

export interface PatientReportDetail {
  patient: PatientReportRow
  admissions: PatientReportAdmission[]
}

/**
 * Export row — the list row plus every admission in the range.
 *
 * The paginated list deliberately omits `admissions`: only the export
 * document renders them, and attaching them to the table payload would
 * multiply the response by the admission count.
 */
export interface PatientReportExportRow extends PatientReportRow {
  admissions: PatientReportAdmission[]
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

/** Server-side sort keys (`?sort=`). Keys are snake_case by contract. */
export const PATIENT_SORT_COLUMNS = {
  name: "name",
  admissions: "admissions",
  lastAdmission: "last_admission",
  totalBilled: "total_billed",
  totalPaid: "total_paid",
  outstanding: "outstanding",
} as const

export type PatientSortColumn = keyof typeof PATIENT_SORT_COLUMNS

export function isPatientSortColumn(value: string): value is PatientSortColumn {
  return Object.prototype.hasOwnProperty.call(PATIENT_SORT_COLUMNS, value)
}

export interface PatientQueryFilters {
  range: ReportRange
  /** `all` is dropped from the request (the server treats absence as all). */
  paymentType: string
  insuranceId: number | null
  search: string
}

export interface PatientQueryPaging {
  page: number
  pageSize: number
  sort: { columnId: string; direction: "asc" | "desc" } | null
}
