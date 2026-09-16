"use client"

import { useEffect, useMemo, useState } from "react"

import { listAllPayments, resolveUserNames } from "@/pages/Employees/api"
import type { EmployeePayment } from "@/pages/Employees/types/employee"

export interface UseEmployeePaymentsResult {
  payments: EmployeePayment[]
  /** All payments grouped by employee id (newest first within group). */
  paymentsByEmployee: Map<number, EmployeePayment[]>
  /**
   * The payments-tab work queue — the client-side equivalent of the
   * legacy `unpaid-system` endpoint: unpaid, non-void, not stamped by
   * a user (system-generated rows only), oldest first.
   */
  pendingSystemPayments: EmployeePayment[]
  /** Resolved `paid_by` usernames keyed by user id. */
  paidByNames: Map<number, string>
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Payments hook (Phase 6.7) — ONE `GET /api/employee-payments`
 * request replaces the legacy fan-out (per-employee payment fetches
 * on every table render + a per-paid-row username request).
 *
 * `paidBy` usernames are resolved lazily: only user ids that actually
 * appear on paid rows are requested, de-duplicated, and cached for
 * the lifetime of the hook instance (refresh keeps the cache — user
 * names don't change mid-session).
 */
export function useEmployeePayments(
  enabled: boolean
): UseEmployeePaymentsResult {
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [paidByNames, setPaidByNames] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listAllPayments()
      .then((rows) => {
        if (cancelled) return
        setPayments(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, nonce])

  /* Resolve paid_by usernames for ids not yet cached. */
  useEffect(() => {
    if (!enabled || payments.length === 0) return
    const known = new Set<number>()
    for (const payment of payments) {
      if (payment.isPaid && payment.paidByUserId != null) {
        known.add(payment.paidByUserId)
      }
    }
    const missing = [...known].filter((id) => !paidByNames.has(id))
    if (missing.length === 0) return

    let cancelled = false
    resolveUserNames(missing).then((resolved) => {
      if (cancelled || resolved.size === 0) return
      setPaidByNames((prev) => {
        const next = new Map(prev)
        for (const [id, name] of resolved) next.set(id, name)
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, payments, paidByNames])

  const paymentsByEmployee = useMemo(() => {
    const grouped = new Map<number, EmployeePayment[]>()
    for (const payment of payments) {
      const bucket = grouped.get(payment.employeeId)
      if (bucket) {
        bucket.push(payment)
      } else {
        grouped.set(payment.employeeId, [payment])
      }
    }
    for (const bucket of grouped.values()) {
      bucket.sort(
        (a, b) =>
          new Date(b.issuedTimestamp).getTime() -
          new Date(a.issuedTimestamp).getTime()
      )
    }
    return grouped
  }, [payments])

  const pendingSystemPayments = useMemo(
    () =>
      payments
        .filter(
          (p) => !p.isPaid && !p.isVoid && p.paidByUserId == null
        )
        .sort(
          (a, b) =>
            new Date(a.issuedTimestamp).getTime() -
            new Date(b.issuedTimestamp).getTime()
        ),
    [payments]
  )

  return {
    payments,
    paymentsByEmployee,
    pendingSystemPayments,
    paidByNames,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
