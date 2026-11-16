"use client"

import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { listClockIns } from "@/pages/Clocking/api"
import type { ClockIn } from "@/pages/Clocking/types/clocking"

export interface UseClockInsParams {
  page: number
  pageSize: number
  search: string
  /** `YYYY-MM-DD` local day. */
  from?: string
  /** `YYYY-MM-DD` local day (inclusive). */
  to?: string
  sort: { columnId: string; direction: "asc" | "desc" } | null
}

export interface UseClockInsResult {
  clockIns: ClockIn[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Clock-in history hook (History tab).
 *
 * Server-paginated: search, date range, sort, page, and page size all
 * become `GET /api/clock-ins` query parameters, and the page always
 * asks for `status=closed` (only completed rows belong in history).
 * The employee-name search is debounced here; rows are already
 * normalized (`ClockIn`) by `api.ts`.
 */
export function useClockIns(params: UseClockInsParams): UseClockInsResult {
  const { page, pageSize, search, from, to, sort } = params
  const debouncedSearch = useDebouncedValue(search, { delay: 300 })
  const [clockIns, setClockIns] = useState<ClockIn[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const sortColumn = sort?.columnId ?? "clockIn"
  const direction = sort?.direction ?? "desc"

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listClockIns({
      page,
      pageSize,
      status: "closed",
      search: debouncedSearch,
      from,
      to,
      sort: sortColumn as Parameters<typeof listClockIns>[0]["sort"],
      dir: direction,
    })
      .then((res) => {
        if (cancelled) return
        setClockIns(res.data)
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
  }, [page, pageSize, debouncedSearch, from, to, sortColumn, direction, nonce])

  return {
    clockIns,
    total,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
