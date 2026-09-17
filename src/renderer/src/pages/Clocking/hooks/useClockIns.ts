"use client"

import { useEffect, useState } from "react"

import { listClockIns } from "@/pages/Clocking/api"
import type { ClockIn } from "@/pages/Clocking/types/clocking"

export interface UseClockInsResult {
  clockIns: ClockIn[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Clock-ins list hook (§3.4 of `phase_6.8_plan.md`).
 *
 * Single `GET /api/clock-ins` fetch — Active/History splits are
 * derived client-side via `useMemo` in the page (backend has no
 * filter/query support). Rows are already normalized (`ClockIn`)
 * by `api.ts`. Mirrors the `useServices` fetch pattern.
 */
export function useClockIns(): UseClockInsResult {
  const [clockIns, setClockIns] = useState<ClockIn[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listClockIns()
      .then((rows) => {
        if (cancelled) return
        setClockIns(rows)
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
    clockIns,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
