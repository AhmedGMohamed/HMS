import { api } from "@/lib/api"

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
 * The backend returns raw unordered rows and strings pg DECIMAL
 * `pay_deduction`; `normalize` coerces it to a number at the
 * boundary so page code only sees `ClockIn`. Payload datetimes are
 * local wall strings `"YYYY-MM-DDTHH:mm"` (minute precision, legacy
 * parity — plan A15); use `toLocalInputValue` / `nowLocalInputValue`
 * for `datetime-local` prefill and defaults.
 */

/** pg DECIMAL arrives as a JSON string → coerce to number. */
function normalize(row: ClockInRow): ClockIn {
  return { ...row, payDeduction: Number(row.payDeduction ?? 0) }
}

export function listClockIns() {
  return api.get<ClockInRow[]>("/clock-ins").then((rows) => rows.map(normalize))
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
