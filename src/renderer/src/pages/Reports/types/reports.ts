/**
 * Reports page types — Phase 6.11.
 *
 * Wire types mirror `src/app/utils/types/reports.d.ts` but are written in
 * camelCase because `lib/api.ts` normalizes keys at the boundary. Nothing in
 * this file should contain snake_case field names.
 */

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export const REPORT_TABS = [
  "patients",
  "doctors",
  "nurses",
  "statistics",
  "payments",
  "clock-ins",
] as const

export type ReportTab = (typeof REPORT_TABS)[number]

export const DEFAULT_REPORT_TAB: ReportTab = "patients"

export function isReportTab(value: string | null | undefined): value is ReportTab {
  return !!value && (REPORT_TABS as readonly string[]).includes(value)
}

/* ------------------------------------------------------------------ */
/* Shared enums                                                        */
/* ------------------------------------------------------------------ */

export const REPORT_GROUPINGS = ["day", "month", "year"] as const
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number]

export const DOCTOR_RELATIONSHIPS = ["referred", "attended", "supervised"] as const
export type DoctorRelationship = (typeof DOCTOR_RELATIONSHIPS)[number]

export type EmployeeTypeFilter = "all" | "doctor" | "nurse" | "other"

export type ReportScope = "all" | "specific"

export type PaymentTypeFilter = "all" | "cash" | "credit" | "insurance"

/** Statistics distribution toggle. */
export type DistributionMode = "payment" | "gender"

/* ------------------------------------------------------------------ */
/* Options (filters)                                                   */
/* ------------------------------------------------------------------ */

export interface ReportOption {
  id: number
  name: string
  doctorType?: string | null
  isActive?: boolean
  employeeType?: string | null
}

export interface ReportOptions {
  insuranceCompanies: ReportOption[]
  doctors: ReportOption[]
  nurses: ReportOption[]
  payrollEmployees: ReportOption[]
  clockInEmployees: ReportOption[]
}

export const EMPTY_REPORT_OPTIONS: ReportOptions = {
  insuranceCompanies: [],
  doctors: [],
  nurses: [],
  payrollEmployees: [],
  clockInEmployees: [],
}

/* ------------------------------------------------------------------ */
/* Date range                                                          */
/* ------------------------------------------------------------------ */

/** Local calendar dates as `YYYY-MM-DD` (never ISO timestamps). */
export interface ReportRange {
  from: string
  to: string
}

/* ------------------------------------------------------------------ */
/* Draft / generated parameters                                        */
/* ------------------------------------------------------------------ */

/**
 * The report form state.
 *
 * One flat object for every tab: the UI only renders (and the URL only
 * carries) the fields relevant to the active tab, so a shared shape keeps
 * `useReportUrlState` simple and makes "is this stale?" a single comparison.
 */
export interface ReportDraft {
  range: ReportRange
  grouping: ReportGrouping
  /** Patient tab. */
  paymentType: PaymentTypeFilter
  insuranceId: number | null
  /** Patient / doctor / nurse / payroll / clock-in name search. */
  search: string
  /** Doctor tab. */
  relationship: DoctorRelationship
  /** Doctor/nurse "all vs specific" scope. */
  scope: ReportScope
  doctorId: number | null
  nurseId: number | null
  /** Payroll + clock-in tabs. */
  employeeType: EmployeeTypeFilter
  employeeId: number | null
  /** Statistics distribution toggle. */
  distribution: DistributionMode
}

/** Alias used by tab components: the parameters frozen at Generate time. */
export type GeneratedParams = ReportDraft

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export const REPORT_PAGE_SIZES = [10, 25, 50, 100] as const
export type ReportPageSize = (typeof REPORT_PAGE_SIZES)[number]

export interface ReportPagingState {
  page: number
  pageSize: ReportPageSize
  sort: { columnId: string; direction: "asc" | "desc" } | null
}

export const DEFAULT_REPORT_PAGING: ReportPagingState = {
  page: 1,
  pageSize: 10,
  sort: null,
}

/* ------------------------------------------------------------------ */
/* KPI strip                                                           */
/* ------------------------------------------------------------------ */

export type ReportKpiTone = "neutral" | "primary" | "warning" | "danger"

export interface ReportKpi {
  key: string
  label: string
  /** Pre-formatted value (already localized/currency-formatted). */
  value: string
  hint?: string
  tone?: ReportKpiTone
}

/* ------------------------------------------------------------------ */
/* Session cache                                                       */
/* ------------------------------------------------------------------ */

export interface ReportSessionEntry<T = unknown> {
  /** Serialized generated params the payload belongs to. */
  key: string
  /** ISO timestamp of the successful load. */
  generatedAt: string
  payload: T
}
