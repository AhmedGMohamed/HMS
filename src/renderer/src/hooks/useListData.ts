"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
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
  /**
   * Function called by the hook. Receives the latest
   * `{ page, pageSize, search }` so the closure can pass it on
   * to the API endpoint (typically as query-string parameters).
   * Callers don't need to memoize the closure — the hook
   * reads it through a ref so a fresh identity on each render is
   * loop-safe.
   */
  fetch: (
    params: { page: number; pageSize: number; search: string }
  ) => Promise<{ data: T[]; total: number } | T[]>
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

  /**
   * Stable ref mirroring the latest fetch closure. Inlining this
   * pattern lets callers pass a fresh `fetch` arrow function on
   * every render without us causing an infinite loop. The effect
   * depends only on stable primitives; the ref is read at execution
   * time so the latest closure (with up-to-date page/pageSize/search)
   * is fired regardless of how often the parent re-renders.
   *
   * The ref update lives in `useLayoutEffect` so the write happens
   * after render but before the browser paints, satisfying the
   * react-hooks compat linter's "no refs in render" rule.
   */
  const fetchRef = useRef(fetcher.fetch)
  useLayoutEffect(() => {
    fetchRef.current = fetcher.fetch
  }, [fetcher.fetch])

  const { page, pageSize, debouncedSearch } = pagination

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // The synchronous state updates here are intentional — we want
    // the loading/error flags to flip the moment the deps change, even
    // before the async fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetchRef
      .current({ page, pageSize, search: debouncedSearch })
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
  }, [enabled, page, pageSize, debouncedSearch, nonce])

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
