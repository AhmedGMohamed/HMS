"use client"

/**
 * Clock-in list query — Phase 6.11.6.
 *
 * Same discipline as the patient/doctor/nurse/payroll hooks (6.11.1 contract
 * §8.2): the query is built from **generated** parameters only, paging/sort are
 * part of the cache key, the previous page's payload stays visible while the
 * next one is in flight, and `loading` is derived rather than stored.
 *
 * The session cache is keyed by the tab (`"clock-ins"`), so a clock-in list can
 * never read a patient/doctor/nurse/payroll payload. `fetchOnce` (contract 48)
 * dedupes the in-flight request so switching tabs and back does not fire twice.
 *
 * There is no `grouping` in the filter key: the clock-in report has no
 * timeline, so nothing about the payload depends on a bucket size.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { getClockIns } from "@/pages/Reports/api"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  ClockInListPayload,
  ClockInQueryFilters,
  ClockInQueryPaging,
} from "@/pages/Reports/types/clockInReport"

export interface UseClockInReportInput {
  /** `null` until the tab has generated at least once. */
  filters: ClockInQueryFilters | null
  paging: ClockInQueryPaging
  session: ReportSessionResult
  enabled: boolean
}

export interface UseClockInReportResult {
  payload: ClockInListPayload | undefined
  loading: boolean
  /** `true` when `payload` belongs to another page of the same filters. */
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/** Filters-only token: everything the numbers depend on except paging. */
export function clockInFilterKey(filters: ClockInQueryFilters): string {
  return [
    filters.range.from,
    filters.range.to,
    filters.employeeType,
    filters.employeeId ?? "",
    filters.search.trim(),
  ].join("|")
}

/** Stable cache key for one page of one filtered report. */
export function clockInQueryKey(
  filters: ClockInQueryFilters,
  paging: ClockInQueryPaging
): string {
  return [
    clockInFilterKey(filters),
    paging.page,
    paging.pageSize,
    paging.sort?.columnId ?? "",
    paging.sort?.direction ?? "",
  ].join("|")
}

interface LoadedPayload {
  filterKey: string
  payload: ClockInListPayload
}

export function useClockInReport({
  filters,
  paging,
  session,
  enabled,
}: UseClockInReportInput): UseClockInReportResult {
  const key = filters && enabled ? clockInQueryKey(filters, paging) : null
  const cached = key ? session.read<ClockInListPayload>("clock-ins", key) : undefined

  const [state, setState] = useState<{ key: string | null; error: Error | null }>({
    key: null,
    error: null,
  })
  const [lastLoaded, setLastLoaded] = useState<LoadedPayload | null>(null)
  const [nonce, setNonce] = useState(0)
  /** Set by `reload` so exactly one effect run ignores the cache. */
  const forceRef = useRef(false)

  useEffect(() => {
    if (!key || !filters || !enabled) return

    const forced = forceRef.current
    forceRef.current = false
    if (!forced && session.read<ClockInListPayload>("clock-ins", key)) return

    let cancelled = false
    setState({ key, error: null })
    const filterKey = clockInFilterKey(filters)

    session
      .fetchOnce("clock-ins", key, () => getClockIns(filters, paging), {
        force: forced,
      })
      .then((payload) => {
        if (cancelled) return
        session.write("clock-ins", key, payload)
        setLastLoaded({ filterKey, payload })
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
    // `paging`, `filters` and `session` are fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, enabled])

  const reload = useCallback(() => {
    forceRef.current = true
    if (key) session.clear("clock-ins")
    setNonce((value) => value + 1)
  }, [key, session])

  const error = state.key === key ? state.error : null
  const loading = Boolean(key) && cached === undefined && error === null

  const previous =
    filters && lastLoaded && lastLoaded.filterKey === clockInFilterKey(filters)
      ? lastLoaded.payload
      : undefined
  const payload = cached ?? previous

  return {
    payload,
    loading,
    refreshing: loading && payload !== undefined,
    error,
    reload,
  }
}
