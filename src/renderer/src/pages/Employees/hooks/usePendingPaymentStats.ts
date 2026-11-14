"use client"

import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { listPendingPaymentStats } from "@/pages/Employees/api"

export interface UsePendingPaymentStatsParams {
  enabled?: boolean
  from?: string
  to?: string
  search?: string
}

export interface UsePendingPaymentStatsResult {
  pendingCount: number
  employeeCount: number
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Totals for the whole pending queue — independent of the current page.
 *
 * Same filters as `usePendingPaymentGroups` so the header count and the
 * rows always describe the same set.
 */
export function usePendingPaymentStats(
  params: UsePendingPaymentStatsParams
): UsePendingPaymentStatsResult {
  const { enabled = true, from = "", to = "", search = "" } = params

  const [pendingCount, setPendingCount] = useState(0)
  const [employeeCount, setEmployeeCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const debouncedSearch = useDebouncedValue(search, { delay: 300 })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listPendingPaymentStats({ from, to, search: debouncedSearch })
      .then((stats) => {
        if (cancelled) return
        setPendingCount(stats.pendingCount)
        setEmployeeCount(stats.employeeCount)
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
  }, [enabled, from, to, debouncedSearch, nonce])

  return {
    pendingCount,
    employeeCount,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
