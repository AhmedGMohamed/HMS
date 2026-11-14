"use client"

import { useEffect, useRef, useState } from "react"

import { listPaymentsByEmployee, resolveUserNames } from "@/pages/Employees/api"
import type { EmployeePayment } from "@/pages/Employees/types/employee"

export interface UseEmployeePaymentsResult {
  payments: EmployeePayment[]
  /** `paid_by_user_id` → username, resolved lazily and cached per id. */
  paidByNames: Map<number, string>
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * One employee's full payment history (pending, paid and voided) for the
 * detail sheet. Fetched on demand when the sheet opens instead of
 * downloading every payment in the system.
 */
export function useEmployeePayments(
  employeeId: number | null,
  enabled: boolean
): UseEmployeePaymentsResult {
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [paidByNames, setPaidByNames] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const nameCache = useRef<Map<number, string>>(new Map())

  useEffect(() => {
    if (!enabled || employeeId == null) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listPaymentsByEmployee(employeeId)
      .then((rows) => {
        if (cancelled) return
        setPayments(rows)
        const missing = rows
          .map((payment) => payment.paidByUserId)
          .filter((id): id is number => typeof id === "number")
          .filter((id) => !nameCache.current.has(id))
        const known = new Map(nameCache.current)
        setPaidByNames(known)
        if (missing.length === 0) return

        // Resolve the unknown usernames once, then merge into the cache.
        resolveUserNames(missing)
          .then((resolved) => {
            if (cancelled) return
            resolved.forEach((name, id) => nameCache.current.set(id, name))
            setPaidByNames(new Map(nameCache.current))
          })
          .catch(() => {
            /* names are decorative — ignore failures */
          })
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
  }, [enabled, employeeId, nonce])

  return {
    payments,
    paidByNames,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
