"use client"

import { useEffect, useState } from "react"

import { listEligibleEmployees } from "@/pages/Clocking/api"
import type { EligibleEmployee } from "@/pages/Clocking/types/clocking"

export interface UseClockingEmployeesResult {
  employees: EligibleEmployee[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Employee picker data hook (§3.4 of `phase_6.8_plan.md`, D1a).
 *
 * Uses the `manage_clocking`-scoped companion endpoint
 * `GET /api/clock-ins/eligible-employees` instead of
 * `GET /api/employees`, so users with clocking-only permissions can
 * still pick employees (legacy permission mismatch fixed). The
 * endpoint returns ALL employees ordered by name — the page filters
 * the picker to `needClockIn && isActive` client-side and builds the
 * clock-in name map from the full list (plan §1.3, A18).
 */
export function useClockingEmployees(): UseClockingEmployeesResult {
  const [employees, setEmployees] = useState<EligibleEmployee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listEligibleEmployees()
      .then((rows) => {
        if (cancelled) return
        setEmployees(rows)
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
  }, [nonce])

  return {
    employees,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
