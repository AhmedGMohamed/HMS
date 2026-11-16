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

interface PaymentsSnapshot {
  employeeId: number | null
  rows: EmployeePayment[]
}

/**
 * One employee's full payment history (pending, paid and voided) for the
 * detail sheet. Fetched on demand when the sheet opens instead of
 * downloading every payment in the system.
 *
 * Requests are tagged per employee: switching from A to B immediately
 * hides A's rows (the snapshot's id no longer matches) and a slow A
 * response cannot overwrite B's state.
 */
export function useEmployeePayments(
  employeeId: number | null,
  enabled: boolean
): UseEmployeePaymentsResult {
  const [snapshot, setSnapshot] = useState<PaymentsSnapshot>({
    employeeId: null,
    rows: [],
  })
  const [paidByNames, setPaidByNames] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const nameCache = useRef<Map<number, string>>(new Map())
  const requestTokenRef = useRef(0)

  useEffect(() => {
    if (!enabled || employeeId == null) {
      requestTokenRef.current += 1
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnapshot({ employeeId: null, rows: [] })
      setLoading(false)
      setError(null)
      return
    }

    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    setSnapshot({ employeeId, rows: [] })
    setLoading(true)
    setError(null)
    listPaymentsByEmployee(employeeId)
      .then((rows) => {
        if (requestTokenRef.current !== token) return
        setSnapshot({ employeeId, rows })
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
            if (requestTokenRef.current !== token) return
            resolved.forEach((name, id) => nameCache.current.set(id, name))
            setPaidByNames(new Map(nameCache.current))
          })
          .catch(() => {
            /* names are decorative — ignore failures */
          })
      })
      .catch((err: unknown) => {
        if (requestTokenRef.current !== token) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (requestTokenRef.current === token) setLoading(false)
      })

    return () => {
      // Invalidate this request when the id/enabled changes or on unmount.
      requestTokenRef.current += 1
    }
  }, [enabled, employeeId, nonce])

  const belongsToEmployee =
    enabled && employeeId != null && snapshot.employeeId === employeeId
  const isSwitchingEmployee =
    enabled && employeeId != null && snapshot.employeeId !== employeeId

  return {
    payments: belongsToEmployee ? snapshot.rows : [],
    paidByNames,
    loading: isSwitchingEmployee || loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
