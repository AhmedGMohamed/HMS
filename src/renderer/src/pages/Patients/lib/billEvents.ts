"use client"

import { useEffect } from "react"

export const BILL_CHANGED_EVENT = "hms:billing-bill-changed"

export type BillChangeReason =
  | "service-added"
  | "service-stopped"
  | "service-removed"
  | "drug-added"
  | "drug-removed"
  | "drug-administered"
  | "supply-added"
  | "supply-removed"

export interface BillChangedDetail {
  /** Patient owning the bill (canonical key for matching handlers). */
  patientId: number
  /** Current admission id, if any. */
  patientHistoryId: number | null
  /** Which source mutated. */
  source: "services" | "drugs" | "supplies"
  /** What action was performed; informational. */
  reason: BillChangeReason
}

declare global {
  interface WindowEventMap {
    [BILL_CHANGED_EVENT]: CustomEvent<BillChangedDetail>
  }
}

/**
 * Dispatch a bill-change event on `window`. The assigned-lines
 * hooks fire this after every successful mutation so dependent
 * views (Billing tab) can refetch.
 */
export function dispatchBillChanged(detail: BillChangedDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<BillChangedDetail>(BILL_CHANGED_EVENT, { detail })
  )
}

/**
 * Subscribe to bill-changed events filtered by `patientId`. Returns
 * a cleanup-aware async-safe handler; calling sites typically use
 * it to invalidate their cached `useBill` + `useAssigned*` data.
 *
 * `handler` is captured by ref so callers can pass a fresh closure
 * per render without re-binding the listener — the registered
 * listener stays stable for the lifetime of the component.
 */
export function useBillChangeSubscription(
  patientId: number,
  handler: (detail: BillChangedDetail) => void
): void {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !Number.isFinite(patientId) ||
      patientId <= 0
    ) {
      return
    }
    const wrapped = (event: Event) => {
      const ce = event as CustomEvent<BillChangedDetail>
      const detail = ce.detail
      if (!detail || detail.patientId !== patientId) return
      handler(detail)
    }
    window.addEventListener(BILL_CHANGED_EVENT, wrapped)
    return () => {
      window.removeEventListener(BILL_CHANGED_EVENT, wrapped)
    }
  }, [patientId, handler])
}

/* ----------------------------------------------------------------
   Staff-change events (T10)
   ---------------------------------------------------------------- */

export const STAFF_CHANGED_EVENT = "hms:staff-changed"

export interface StaffChangedDetail {
  patientId: number
  /**
   * Which role types changed. Empty array means "no actual change" —
   * the hook never dispatches for a no-op diff.
   */
  roles: ("doctors" | "nurses")[]
}

declare global {
  interface WindowEventMap {
    [STAFF_CHANGED_EVENT]: CustomEvent<StaffChangedDetail>
  }
}

/**
 * Fire after a successful staff-assignment mutation. The Patient
 * profile listens for `patientId === current` and refetches
 * `usePatientProfile`; the Staff Status tab listens for *any*
 * patient id (no filter) and refetches `useStaffStatus` so its
 * 30s polling stays in sync with what the user just changed.
 */
export function dispatchStaffChanged(detail: StaffChangedDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<StaffChangedDetail>(STAFF_CHANGED_EVENT, { detail })
  )
}

/**
 * Variant of `useBillChangeSubscription` for staff events. If
 * `patientId` is `null` the listener fires for *every* patient —
 * used by the Staff Status tab where multiple patients may have
 * just been touched.
 */
export function useStaffChangeSubscription(
  patientId: number | null,
  handler: (detail: StaffChangedDetail) => void
): void {
  useEffect(() => {
    if (typeof window === "undefined") return
    const wrapped = (event: Event) => {
      const ce = event as CustomEvent<StaffChangedDetail>
      const detail = ce.detail
      if (!detail) return
      if (patientId !== null && detail.patientId !== patientId) return
      handler(detail)
    }
    window.addEventListener(STAFF_CHANGED_EVENT, wrapped)
    return () => {
      window.removeEventListener(STAFF_CHANGED_EVENT, wrapped)
    }
  }, [patientId, handler])
}
