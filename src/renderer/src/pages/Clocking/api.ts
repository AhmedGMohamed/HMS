import { api } from "@/lib/api"
import type { PaginatedResponse } from "@/types"

import type {
  ClockIn,
  ClockInRow,
  CreateClockInPayload,
  EligibleEmployee,
  UpdateClockInPayload,
} from "@/pages/Clocking/types/clocking"

/**
 * Clocking module API — `/api/clock-ins` (§3.2 of `phase_6.8_plan.md`).
 *
 * Both list endpoints answer with the shared
 * `{ data, total, page, pageSize }` envelope, filter/sort/paginate in
 * SQL, and return strings for pg DECIMAL `pay_deduction`;
 * `normalize` coerces it to a number at the boundary so page code
 * only sees `ClockIn`. Payload datetimes are local wall strings
 * `"YYYY-MM-DDTHH:mm"` (minute precision, legacy parity — plan A15);
 * use `toLocalInputValue` / `nowLocalInputValue` for `datetime-local`
 * prefill and defaults.
 */

/** pg DECIMAL arrives as a JSON string → coerce to number. */
function normalize(row: ClockInRow): ClockIn {
  return { ...row, payDeduction: Number(row.payDeduction ?? 0) }
}

export interface ListClockInsParams {
  page: number
  pageSize: number
  status?: "all" | "active" | "closed"
  search?: string
  /** `YYYY-MM-DD` local day. */
  from?: string
  /** `YYYY-MM-DD` local day (inclusive). */
  to?: string
  sort?: "employee" | "clockIn" | "clockOut" | "duration" | "payDeduction"
  dir?: "asc" | "desc"
}

/** Paginated clock-in history (`GET /api/clock-ins`). */
export function listClockIns(params: ListClockInsParams) {
  return api
    .get<PaginatedResponse<ClockInRow>>("/clock-ins", {
      page: params.page,
      pageSize: params.pageSize,
      status: params.status,
      search: params.search?.trim() || undefined,
      from: params.from,
      to: params.to,
      sort: params.sort,
      dir: params.dir,
    })
    .then((page) => ({ ...page, data: page.data.map(normalize) }))
}

export interface ListClockedInParams {
  page: number
  pageSize: number
  missingOnly?: boolean
  /** `YYYY-MM-DD` client-local day; DB falls back to `CURRENT_DATE`. */
  today?: string
  sort?: "clockIn" | "duration" | "employee"
  dir?: "asc" | "desc"
}

/** Paginated currently-open rows (`GET /api/clock-ins/clocked-in`). */
export function listClockedIn(params: ListClockedInParams) {
  return api
    .get<PaginatedResponse<ClockInRow>>("/clock-ins/clocked-in", {
      page: params.page,
      pageSize: params.pageSize,
      missingOnly: params.missingOnly,
      today: params.today,
      sort: params.sort,
      dir: params.dir,
    })
    .then((page) => ({ ...page, data: page.data.map(normalize) }))
}

/** KPI/badge figures over *all* open rows — never a page subset. */
export interface ClockingStats {
  activeCount: number
  missingCount: number
  over12hCount: number
  duplicateEmployeeIds: number[]
  openEmployeeIds: number[]
}

export function listClockedInStats(params?: { today?: string }) {
  return api.get<ClockingStats>("/clock-ins/clocked-in/stats", params)
}

/** Unbounded open set for the Patients staff-status poll (`all=true`). */
export function listAllClockedIn() {
  return api
    .get<PaginatedResponse<ClockInRow>>("/clock-ins/clocked-in", { all: true })
    .then((page) => page.data.map(normalize))
}

/** Server ignores any client payDeduction and computes it from shift
 *  lateness (D2a — create mode hides the field). */
export function createClockIn(body: CreateClockInPayload) {
  return api.post<ClockInRow>("/clock-ins", body).then(normalize)
}

/** Partial-update semantics on the wire; `clockOut: null` re-activates. */
export function updateClockIn(id: number, body: UpdateClockInPayload) {
  return api.put<ClockInRow>(`/clock-ins/${id}`, body).then(normalize)
}

/** Backend answers `204` even for a missing id — treated as success. */
export function deleteClockIn(id: number) {
  return api.delete<void>(`/clock-ins/${id}`)
}

/** Quick clock-out (plan A14): minimal partial PUT — only `clockOut`.
 *  The backend honors non-undefined keys, so the other columns are
 *  untouched. */
export function quickClockOut(id: number, clockOut: string) {
  return api.put<ClockInRow>(`/clock-ins/${id}`, { clockOut }).then(normalize)
}

/** Employee picker source (D1a) — scoped to `manage_clocking`. */
export function listEligibleEmployees() {
  return api.get<EligibleEmployee[]>("/clock-ins/eligible-employees")
}

/** ISO (or Date) → local `"YYYY-MM-DDTHH:mm"` for `datetime-local`
 *  inputs; seconds stripped (legacy parity), invalid input → `""`. */
export function toLocalInputValue(value: string | Date | null | undefined): string {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Current local time as a `datetime-local` value (minute precision). */
export function nowLocalInputValue(): string {
  return toLocalInputValue(new Date())
}
