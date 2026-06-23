"use client"

import { useCallback, useEffect, useState } from "react"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"

export interface ListDataState<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  error: Error | null
  search: string
}

export interface UseListDataOptions {
  /** Initial page index, 1-based (matches backend ?page=1). Default 1. */
  initialPage?: number
  /** Initial page size. Default 25. */
  initialPageSize?: number
  /** Initial search value. */
  initialSearch?: string
  /** Debounce ms for `onSearchChange`→server round-trip. Default 250. */
  searchDebounceMs?: number
  /**
   * When true, hitting 0 results mid-page keeps the user on the same
   * `page` value (e.g. they typed something invalid). Default false —
   * behaviour: clamp page to the new total's last page.
   */
  keepPageOnEmpty?: boolean
}

export interface UseListDataResult<T> extends ListDataState<T> {
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSearch: (next: string) => void
  refresh: () => void
  isEmpty: boolean
}

/**
 * Controller hook for paginated, server-driven list views.
 *
 * ⚠️ **Caller-driven controller**: the parent owns the actual fetch
 * because the path, the params, and the response shape vary per
 * domain (some endpoints return `{ data, total }`, others return the
 * raw array and a header). The simpler `usePaginationState` companion
 * below covers the common case — Phase 6 pages that are happy with
 * the standard envelope can use it directly.
 */
export function usePaginationState(options: UseListDataOptions = {}) {
  const {
    initialPage = 1,
    initialPageSize = 25,
    initialSearch = "",
    searchDebounceMs = 250,
  } = options

  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [search, setSearch] = useState(initialSearch)
  const debouncedSearch = useDebouncedValue(search, { delay: searchDebounceMs })

  return {
    page,
    pageSize,
    search,
    debouncedSearch,
    setPage,
    setPageSize,
    setSearch,
  }
}

/**
 * Combined view-state container for tenant lists that follow the
 * `PaginatedResponse<T>` envelope (`data`, `total`, `page`,
 * `pageSize`). Callers wire `fetcher`, optionally enabled. Keeps the
 * `loading`, `error`, and refresh semantics consistent across phases.
 */
export interface PaginatedFetcher<T> {
  params: { page: number; pageSize: number; search: string }
  fetch: () => Promise<{ data: T[]; total: number } | T[]>
}

export interface UseListDataConfig<T> extends UseListDataOptions {
  fetcher: PaginatedFetcher<T>
  /**
   * Disable the auto-fetch (e.g. until a permission check resolves
   * or while a parent wizard is finishing). Default false.
   */
  enabled?: boolean
}

export function useListData<T>(config: UseListDataConfig<T>): UseListDataResult<T> {
  const { fetcher, enabled = true, keepPageOnEmpty = false } = config
  const pagination = usePaginationState(config)

  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // The synchronous state updates here are intentional — we want
    // the loading/error flags to flip the moment the deps change, even
    // before the async fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetcher
      .fetch()
      .then((res) => {
        if (cancelled) return
        if (Array.isArray(res)) {
          setData(res)
          setTotal(res.length)
        } else {
          setData(res.data)
          setTotal(res.total)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    enabled,
    fetcher,
    pagination.page,
    pagination.pageSize,
    pagination.debouncedSearch,
    nonce,
  ])

  // Auto-clamp page on empty result set (avoid leaving the user stuck
  // on a page that no longer exists). Reads `pagination.setPage` via
  // the spread `pagination` reference; listing `pagination` as a dep
  // would trigger re-runs on every state change.
  const {
    page: livePage,
    pageSize: livePageSize,
    setPage: liveSetPage,
  } = pagination
  useEffect(() => {
    if (loading) return
    if (!keepPageOnEmpty && total > 0 && data.length === 0 && livePage > 1) {
      const lastPage = Math.max(1, Math.ceil(total / livePageSize))
      liveSetPage(Math.min(livePage, lastPage))
    }
  }, [loading, keepPageOnEmpty, total, data.length, livePage, livePageSize, liveSetPage])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return {
    data,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    loading,
    error,
    search: pagination.search,
    setPage: pagination.setPage,
    setPageSize: pagination.setPageSize,
    setSearch: pagination.setSearch,
    refresh,
    isEmpty: !loading && data.length === 0,
  }
}
