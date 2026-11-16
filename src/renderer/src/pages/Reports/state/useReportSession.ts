"use client"

/**
 * In-memory report cache — Phase 6.11 plan §4.3.
 *
 * Switching tabs must not throw away a report the user just generated (the
 * legacy page refetched everything), but a reload should be a clean slate —
 * so this is deliberately **not** persisted. Entries are keyed by tab and
 * invalidated whenever the generated-parameter token changes, which makes a
 * stale payload impossible to show.
 *
 * Payloads are per-tab and therefore typed as `unknown` here; each tab
 * narrows with its own type when it reads (`get<PatientListPayload>(...)`).
 */

import { useCallback, useRef, useState } from "react"

import type { ReportTab } from "@/pages/Reports/types/reports"

interface CacheEntry {
  key: string
  generatedAt: string
  payload: unknown
}

export interface ReportSessionResult {
  /** Cached payload for `tab`, or `undefined` when the key changed. */
  read: <T>(tab: ReportTab, key: string) => T | undefined
  /** Stores a payload for `tab` under `key`. */
  write: (tab: ReportTab, key: string, payload: unknown) => void
  /** Drops one tab (e.g. after a permission change). */
  clear: (tab: ReportTab) => void
  /** Generated-at timestamp of the cached payload, if any. */
  generatedAt: (tab: ReportTab, key: string) => string | null
  /**
   * Runs `fetcher` **at most once** per `(tab, key)` while a request is in
   * flight and resolves every caller with the same result.
   *
   * Two things need this:
   *
   *   - React `StrictMode` mounts effects twice in development, so a tab's
   *     effect fires the same request twice before either response lands —
   *     the cache cannot dedupe them because nothing has been written yet;
   *   - two views of the same report (a tab and a dialog, or the screen and an
   *     export) can ask for the same document concurrently.
   *
   * `force` bypasses the in-flight map (used by `reload`, which wants a fresh
   * response rather than the one already on the wire).
   */
  fetchOnce: <T>(
    tab: ReportTab,
    key: string,
    fetcher: () => Promise<T>,
    options?: { force?: boolean }
  ) => Promise<T>
}

export function useReportSession(): ReportSessionResult {
  const cacheRef = useRef<Map<ReportTab, CacheEntry>>(new Map())
  // Keyed `tab|key`; deleted as soon as the request settles either way.
  const inFlightRef = useRef<Map<string, Promise<unknown>>>(new Map())
  // Bumped on every write so consumers re-render when a cache entry lands.
  const [, setVersion] = useState(0)

  const read = useCallback(<T,>(tab: ReportTab, key: string): T | undefined => {
    const entry = cacheRef.current.get(tab)
    if (!entry || entry.key !== key) return undefined
    return entry.payload as T
  }, [])

  const write = useCallback((tab: ReportTab, key: string, payload: unknown) => {
    cacheRef.current.set(tab, {
      key,
      generatedAt: new Date().toISOString(),
      payload,
    })
    setVersion((value) => value + 1)
  }, [])

  const clear = useCallback((tab: ReportTab) => {
    cacheRef.current.delete(tab)
    setVersion((value) => value + 1)
  }, [])

  const generatedAt = useCallback((tab: ReportTab, key: string): string | null => {
    const entry = cacheRef.current.get(tab)
    return entry && entry.key === key ? entry.generatedAt : null
  }, [])

  const fetchOnce = useCallback(
    <T,>(
      tab: ReportTab,
      key: string,
      fetcher: () => Promise<T>,
      options: { force?: boolean } = {}
    ): Promise<T> => {
      const slot = `${tab}|${key}`
      const existing = inFlightRef.current.get(slot)

      // Only join a request that is still on the wire; a settled entry is
      // removed in `finally`, so this can never return a stale promise.
      if (existing && !options.force) return existing as Promise<T>

      const request = fetcher().finally(() => {
        // Only clear the slot if it still holds *this* request: a forced
        // reload may have replaced it in the meantime.
        if (inFlightRef.current.get(slot) === request) {
          inFlightRef.current.delete(slot)
        }
      })

      inFlightRef.current.set(slot, request)
      return request
    },
    []
  )

  return { read, write, clear, generatedAt, fetchOnce }
}
