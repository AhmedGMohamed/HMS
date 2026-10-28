"use client"

/**
 * Statistics document query — Phase 6.11.4.
 *
 * The simplest of the report hooks: one payload per (range, grouping), no
 * paging and no sort, so the cache key is just `${from}|${to}|${grouping}`.
 * That is also why the tab has no "keep the previous page visible" behaviour —
 * there are no pages to keep.
 *
 * The session cache is keyed by the tab (`"statistics"`), so the document can
 * never be read by — or evict — another tab's entry.
 *
 * The distribution toggle is deliberately **not** part of the key: the payload
 * carries both splits, so switching payment/gender must not refetch.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { getStatistics } from "@/pages/Reports/api"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  StatisticsQueryFilters,
  StatisticsReportPayload,
} from "@/pages/Reports/types/statisticsReport"

export interface UseStatisticsReportInput {
  /** `null` until the tab has generated at least once. */
  filters: StatisticsQueryFilters | null
  session: ReportSessionResult
  enabled: boolean
}

export interface UseStatisticsReportResult {
  payload: StatisticsReportPayload | undefined
  loading: boolean
  error: Error | null
  reload: () => void
}

/** Stable cache key for one statistics document. */
export function statisticsKey(filters: StatisticsQueryFilters): string {
  return [filters.range.from, filters.range.to, filters.grouping].join("|")
}

export function useStatisticsReport({
  filters,
  session,
  enabled,
}: UseStatisticsReportInput): UseStatisticsReportResult {
  const key = filters && enabled ? statisticsKey(filters) : null
  const cached = key
    ? session.read<StatisticsReportPayload>("statistics", key)
    : undefined

  const [state, setState] = useState<{ key: string | null; error: Error | null }>(
    { key: null, error: null }
  )
  const [nonce, setNonce] = useState(0)
  /** Set by `reload` so exactly one effect run ignores the cache. */
  const forceRef = useRef(false)

  useEffect(() => {
    if (!key || !filters || !enabled) return

    const forced = forceRef.current
    forceRef.current = false
    if (!forced && session.read<StatisticsReportPayload>("statistics", key)) return

    let cancelled = false
    setState({ key, error: null })

    session
      .fetchOnce("statistics", key, () => getStatistics(filters), { force: forced })
      .then((payload: StatisticsReportPayload) => {
        if (cancelled) return
        session.write("statistics", key, payload)
        // Re-render: the payload now lives in the cache, not in local state.
        setState({ key, error: null })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setState({
          key,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        })
      })

    return () => {
      cancelled = true
    }
    // `filters` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, enabled])

  const reload = useCallback(() => {
    forceRef.current = true
    if (key) session.clear("statistics")
    setNonce((value) => value + 1)
  }, [key, session])

  const error = state.key === key ? state.error : null
  const loading = Boolean(key) && cached === undefined && error === null

  return { payload: cached, loading, error, reload }
}
