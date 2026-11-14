"use client"

import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import {
  listPendingPaymentGroups,
  type PendingGroupSortKey,
  type PendingPaymentGroup,
} from "@/pages/Employees/api"

export interface UsePendingPaymentGroupsParams {
  enabled?: boolean
  page?: number
  pageSize?: number
  /** ISO `yyyy-mm-dd` bounds on `issued_timestamp`. */
  from?: string
  to?: string
  search?: string
  sort?: PendingGroupSortKey
  dir?: "asc" | "desc"
}

export interface UsePendingPaymentGroupsResult {
  groups: PendingPaymentGroup[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Pending-payments queue hook — one row per employee.
 *
 * The list endpoint returns the aggregate only; the payments behind a
 * row are fetched when the row is expanded
 * (`usePendingPaymentsForEmployee`), so this page stays O(page size).
 */
export function usePendingPaymentGroups(
  params: UsePendingPaymentGroupsParams
): UsePendingPaymentGroupsResult {
  const {
    enabled = true,
    page = 1,
    pageSize = 10,
    from = "",
    to = "",
    search = "",
    sort,
    dir,
  } = params

  const [groups, setGroups] = useState<PendingPaymentGroup[]>([])
  const [total, setTotal] = useState(0)
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
    listPendingPaymentGroups({
      page,
      pageSize,
      from,
      to,
      search: debouncedSearch,
      sort,
      dir,
    })
      .then((res) => {
        if (cancelled) return
        setGroups(res.data)
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
  }, [enabled, page, pageSize, from, to, debouncedSearch, sort, dir, nonce])

  return {
    groups,
    total,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
