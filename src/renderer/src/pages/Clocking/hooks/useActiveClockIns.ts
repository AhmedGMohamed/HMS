"use client"

import { useEffect, useState } from "react"

import { listClockedIn } from "@/pages/Clocking/api"
import type { ClockIn } from "@/pages/Clocking/types/clocking"

export interface UseActiveClockInsParams {
  page: number
  pageSize: number
  missingOnly: boolean
  sort: { columnId: string; direction: "asc" | "desc" } | null
  /** `YYYY-MM-DD` client-local day — drives the missing-clock-out filter. */
  today: string
}

export interface UseActiveClockInsResult {
  rows: ClockIn[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Currently-open clock-ins hook (Active tab).
 *
 * Server-paginated: `missingOnly`, sort, page, and page size become
 * `GET /api/clock-ins/clocked-in` query parameters. `today` is the
 * ticking local day so the filter rolls over at midnight without a
 * reload. Aggregate figures live in `useClockingStats` — this hook
 * only ever returns the current page.
 */
export function useActiveClockIns(
  params: UseActiveClockInsParams
): UseActiveClockInsResult {
  const { page, pageSize, missingOnly, sort, today } = params
  const [rows, setRows] = useState<ClockIn[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const sortColumn = sort?.columnId ?? "clockIn"
  const direction = sort?.direction ?? "asc"

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listClockedIn({
      page,
      pageSize,
      missingOnly,
      today,
      sort: sortColumn as Parameters<typeof listClockedIn>[0]["sort"],
      dir: direction,
    })
      .then((res) => {
        if (cancelled) return
        setRows(res.data)
        setTotal(res.total)
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
  }, [page, pageSize, missingOnly, today, sortColumn, direction, nonce])

  return {
    rows,
    total,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
