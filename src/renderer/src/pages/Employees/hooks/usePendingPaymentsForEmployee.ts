"use client"

import { useEffect, useState } from "react"

import { listPendingPaymentsForEmployee } from "@/pages/Employees/api"
import type { EmployeePayment } from "@/pages/Employees/types/employee"

export interface UsePendingPaymentsForEmployeeResult {
  payments: EmployeePayment[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Lazily loads the pending payments behind one expanded queue row.
 *
 * The date bounds come from the page's queue filter so the expanded
 * detail matches the aggregate shown on the collapsed row. Rendered by
 * a dedicated component that only mounts while the row is open, so no
 * payment is ever fetched for a row the user never expanded.
 */
export function usePendingPaymentsForEmployee(
  employeeId: number,
  from = "",
  to = ""
): UsePendingPaymentsForEmployeeResult {
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listPendingPaymentsForEmployee(employeeId, { from, to })
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
  }, [employeeId, from, to, nonce])

  return {
    payments,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
