"use client"

import { useEffect, useState } from "react"

import { listClockedInStats } from "@/pages/Clocking/api"

export interface UseClockingStatsResult {
  activeCount: number
  missingCount: number
  over12hCount: number
  duplicateIds: Set<number>
  openEmployeeIds: Set<number>
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * KPI/badge figures for the Clocking page.
 *
 * `/api/clock-ins/clocked-in/stats` aggregates over *every* open row,
 * so the KPI strip, the tab badge, the duplicate badges, and the
 * new-clock-in picker guard stay correct once the tables are
 * server-paginated. The two id arrays are exposed as `Set`s because
 * that is how the table and modal consume them.
 */
export function useClockingStats(today: string): UseClockingStatsResult {
  const [stats, setStats] = useState({
    activeCount: 0,
    missingCount: 0,
    over12hCount: 0,
  })
  const [duplicateIds, setDuplicateIds] = useState<Set<number>>(new Set())
  const [openEmployeeIds, setOpenEmployeeIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listClockedInStats({ today })
      .then((res) => {
        if (cancelled) return
        setStats({
          activeCount: res.activeCount,
          missingCount: res.missingCount,
          over12hCount: res.over12hCount,
        })
        setDuplicateIds(new Set(res.duplicateEmployeeIds ?? []))
        setOpenEmployeeIds(new Set(res.openEmployeeIds ?? []))
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
  }, [today, nonce])

  return {
    ...stats,
    duplicateIds,
    openEmployeeIds,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
