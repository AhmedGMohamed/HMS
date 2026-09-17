/**
 * Clocking module — domain types (Phase 6.8).
 *
 * Wire-shape types for `/api/clock-ins` and
 * `/api/clock-ins/eligible-employees` (D1a companion endpoint).
 * The boundary in `lib/api.ts:request` runs `toCamel` on every
 * response, so every field here is camelCase even though the server
 * emits snake_case. See `phase_6.8_plan.md` §1.1 for the verified
 * backend contract.
 *
 * ⚠️ `payDeduction` is a pg DECIMAL — the JSON payload carries it as
 * a string. `ClockInRow` keeps the raw wire shape; `ClockIn` is the
 * normalized domain model (`api.ts:normalize` coerces to number).
 */

/** Raw `/api/clock-ins` row after `toCamel` — not yet normalized. */
export interface ClockInRow {
  clockId: number
  employeeId: number
  clockIn: string
  clockOut: string | null
  payDeduction: string | number | null
}

/** Normalized domain model used by all page code. */
export interface ClockIn {
  clockId: number
  employeeId: number
  clockIn: string
  clockOut: string | null
  payDeduction: number
}

/** Payload for POST /clock-ins (server computes payDeduction — D2a). */
export interface CreateClockInPayload {
  employeeId: number
  /** `"YYYY-MM-DDTHH:mm"` local wall time, minute precision. */
  clockIn: string
  clockOut: string | null
}

/**
 * Payload for PUT /clock-ins/:id. Sent as a full record from the
 * modal; `clockOut: null` clears the clock-out and re-activates the
 * record (legacy bug fixed — see plan A12). The backend now
 * allowlists columns (D4a), so unknown keys are ignored safely.
 */
export interface UpdateClockInPayload {
  employeeId: number
  clockIn: string
  clockOut: string | null
  payDeduction: number
}

export type ClockingTab = "active" | "history"

export interface HistoryFilters {
  search: string
  /** D3a — Popover + Calendar range applied to `clockIn` dates. */
  range: { from?: Date; to?: Date }
}

/** `/api/clock-ins/eligible-employees` element (D1a companion).
 *  Scoped to `manage_clocking`; returns ALL employees — the picker
 *  filters client-side to `needClockIn && isActive` and the page
 *  builds its clock-in name map from the full list (plan §1.3 A18). */
export interface EligibleEmployee {
  employeeId: number
  name: string
  employeeType: string
  needClockIn: boolean
  isActive: boolean
  /** `"HH:mm"` time strings (server-side shift, for context display). */
  shiftStartTime?: string | null
  shiftEndTime?: string | null
}
