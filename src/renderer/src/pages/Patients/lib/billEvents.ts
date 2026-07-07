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
