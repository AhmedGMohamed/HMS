/**
 * Clock-in report types — Phase 6.11.6.
 *
 * camelCase mirrors of the clock-in slice of
 * `src/app/utils/types/reportV2.d.ts` (the model emits snake_case; `lib/api.ts`
 * normalizes keys at the boundary).
 *
 * Four shapes:
 *   - the **list** is one row per eligible employee with in-range attendance
 *     aggregates, plus the whole-set summary and both chart series,
 *   - the **detail** is one employee: identity, attendance summary over the
 *     whole range, and one page of records (synthesized missing days included),
 *   - the **export** carries every employee with every session behind it,
 *   - nothing else — a record's patient assignments travel inside the record.
 *
 * ## Days are not sessions
 *
 * `clockInCount` counts sessions; `attendanceSummary.workedDays` counts dates.
 * A double shift is one worked day and two sessions, and `avgHoursPerDay`
 * divides by the latter's sibling (`workedDays`), not by the session count —
 * the legacy report divided by sessions and understated the average.
 *
 * ## Missing days are computed, not stored
 *
 * The server synthesizes absent days for **active employees who are expected to
 * clock in**, from `max(range start, hire date)` to `min(range end, today)`. An
 * employee who does not clock in (a doctor paid a salary) has no absent days —
 * their absence is not a fact about attendance. The export deliberately does
 * not materialize them (`records` holds sessions only) and states the count in
 * `attendanceSummary.missingDays` instead.
 */

import type {
  EmployeeTypeFilter,
  ReportRange,
} from "@/pages/Reports/types/reports"

/* ------------------------------------------------------------------ */
/* Envelopes                                                           */
/* ------------------------------------------------------------------ */

export interface ClockInReportSummary {
  totalEmployees: number
  totalClockIns: number
  totalHours: number
  /** Distinct dates with at least one session. */
  totalWorkedDays: number
  /** `totalHours / totalWorkedDays` (0 when nothing was worked). */
  avgHoursPerDay: number
  avgHoursPerEmployee: number
  totalDeductions: number
  /** Synthesized absent days across the filtered population. */
  totalMissingDays: number
}

/** One classification per worked date; the worst session wins. */
export interface AttendanceSummary {
  totalDays: number
  workedDays: number
  onTimeDays: number
  lateDays: number
  earlyDays: number
  incompleteDays: number
  missingDays: number
  /**
   * `onTime / (onTime + late + early + incomplete)`, in percent. Missing days
   * are **not** in the denominator: an absence is not an unpunctual arrival.
   */
  punctualityRate: number
}

/** The two chart series. */
export interface ClockInCharts {
  /** Capped at twelve bars, by hours descending. */
  hoursByEmployee: Array<{
    employeeId: number
    employeeName: string
    hours: number
  }>
  /** Includes `missing`, so the donut accounts for every day in the range. */
  statusDistribution: Array<{ status: string; count: number }>
}

export interface ClockInListPayload {
  summary: ClockInReportSummary
  charts: ClockInCharts
  data: ClockInReportRow[]
  total: number
  page: number
  pageSize: number
}

/** The export envelope echoes the server's own range, not `from`/`to`. */
export interface ClockInExportRange {
  startDate: string
  endDate: string
}

export interface ClockInExportPayload {
  generatedAt: string
  range: ClockInExportRange
  summary: ClockInReportSummary
  charts: ClockInCharts
  /** Every matching employee, each with every session. */
  data: ClockInExportRow[]
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface ClockInReportRow {
  employeeId: number
  employeeName: string
  employeeType: string
  hireDate: string | null
  isActive: boolean
  /** `false` for an employee who is not expected to clock in. */
  needClockIn: boolean
  shiftType: string | null
  shiftStartTime: string | null
  shiftEndTime: string | null
  clockInCount: number
  totalHours: number
  avgHoursPerDay: number
  totalDeductions: number
  attendanceSummary: AttendanceSummary
}

export interface ClockInPatientRow {
  patientId: number
  patientName: string
  paymentType: string
  diagnosis: string | null
  hoursWorked: number
  admissionTime: string | null
  dischargeTime: string | null
}

export interface ClockInRecordRow {
  /** `null` on a synthesized missing day — there is no clock-in to point at. */
  clockId: number | null
  /** `YYYY-MM-DD` (the day the session started). */
  date: string
  clockIn: string | null
  clockOut: string | null
  hoursWorked: number
  payDeduction: number
  /** `on_time` | `late` | `early` | `incomplete` | `missing`. */
  status: string
  isMissing: boolean
  lateMinutes: number
  earlyMinutes: number
  patients: ClockInPatientRow[]
  patientCount: number
}

export interface ClockInEmployee {
  employeeId: number
  employeeName: string
  employeeType: string
  hireDate: string | null
  isActive: boolean
  needClockIn: boolean
  shiftType: string | null
  shiftStartTime: string | null
  shiftEndTime: string | null
}

export interface ClockInDetailPayload {
  employee: ClockInEmployee
  /** Describes the **whole** range, never the filtered page. */
  attendanceSummary: AttendanceSummary
  /** One page of records, newest first (sessions and missing days). */
  records: ClockInRecordRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * One employee in the clock-in export.
 *
 * The per-employee roll-up is `attendanceSummary`, and the sessions are
 * `records` — there is no `summary` on a row (contract 36: only the envelope
 * has one).
 */
export interface ClockInExportRow extends ClockInReportRow {
  records: ClockInRecordRow[]
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

/**
 * Clock-in sort keys (`?sort=`).
 *
 * The rows are aggregated in TypeScript — the attendance rule lives in one
 * shared helper — so the server validates this list and sorts with a
 * comparator. A key here must exist in the server's `CLOCK_IN_SORT_KEYS`.
 */
export const CLOCK_IN_SORT_COLUMNS = {
  name: "name",
  clockIns: "clock_ins",
  days: "days",
  hours: "hours",
  avgPerDay: "avg_per_day",
  onTime: "on_time",
  late: "late",
  early: "early",
  incomplete: "incomplete",
  missing: "missing",
  punctuality: "punctuality",
  deductions: "deductions",
} as const

/** The server's own sort key (`?sort=`). */
export type ClockInSortColumn =
  (typeof CLOCK_IN_SORT_COLUMNS)[keyof typeof CLOCK_IN_SORT_COLUMNS]

/** A table column id that can be sorted — the map's keys, not its values. */
export type ClockInSortColumnId = keyof typeof CLOCK_IN_SORT_COLUMNS

/**
 * Guards a table column id before it is mapped to a server key.
 *
 * The map is `columnId → serverKey`, and the two differ here (`clockIns` →
 * `clock_ins`), so testing `Object.values` would reject every multi-word
 * column. Ids are the keys.
 */
export function isClockInSortColumnId(
  value: string
): value is ClockInSortColumnId {
  return Object.prototype.hasOwnProperty.call(CLOCK_IN_SORT_COLUMNS, value)
}

/** The detail dialog's record filter; `all` means every status. */
export const CLOCK_IN_STATUS_FILTERS = [
  "all",
  "on_time",
  "late",
  "early",
  "incomplete",
  "missing",
] as const

export type ClockInStatusFilter = (typeof CLOCK_IN_STATUS_FILTERS)[number]

export interface ClockInQueryFilters {
  range: ReportRange
  /** `all` means "no type filter"; the API omits the param in that case. */
  employeeType: EmployeeTypeFilter
  /** `null` = every eligible employee. */
  employeeId: number | null
  /** Matches the employee's name. */
  search: string
}

export interface ClockInQueryPaging {
  page: number
  pageSize: number
  sort: { columnId: string; direction: "asc" | "desc" } | null
}

/** The detail endpoint has no sort: records are always newest first. */
export interface ClockInDetailPaging {
  page: number
  pageSize: number
}
