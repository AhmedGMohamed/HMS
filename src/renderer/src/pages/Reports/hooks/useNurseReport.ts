"use client"

/**
 * Nurse report list query — Phase 6.11.3.
 *
 * The same discipline as `usePatientReport` / `useDoctorReport` (6.11.1
 * contract §8.2): the query is built from **generated** parameters only,
 * paging/sort are part of the cache key, the previous page's payload stays
 * visible while the next one is in flight, and `loading` is derived rather
 * than stored.
 *
 * The session cache is keyed by the tab (`"nurses"`), so the nurse list can
 * never read a doctor or patient payload.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { getNurses } from "@/pages/Reports/api"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  NurseQueryFilters,
  NurseQueryPaging,
  NurseReportListPayload,
} from "@/pages/Reports/types/nurseReport"

export interface UseNurseReportInput {
  /** `null` until the tab has generated at least once, or in specific mode. */
  filters: NurseQueryFilters | null
  paging: NurseQueryPaging
  session: ReportSessionResult
  enabled: boolean
}

export interface UseNurseReportResult {
  payload: NurseReportListPayload | undefined
  loading: boolean
  /** `true` when `payload` belongs to another page of the same filters. */
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/**
 * Filters-only token: everything the numbers depend on except paging.
 *
 * `nurseId` is included even though the all-report list always passes `null`,
 * so the same hook could serve a filtered list without a cache collision.
 */
export function nurseFilterKey(filters: NurseQueryFilters): string {
  return [
    filters.range.from,
    filters.range.to,
    filters.nurseId ?? "",
    filters.search.trim(),
  ].join("|")
}

/** Stable cache key for one page of one filtered report. */
export function nurseQueryKey(
  filters: NurseQueryFilters,
  paging: NurseQueryPaging
): string {
  return [
    nurseFilterKey(filters),
    paging.page,
    paging.pageSize,
    paging.sort?.columnId ?? "",
    paging.sort?.direction ?? "",
  ].join("|")
}

interface LoadedPayload {
  filterKey: string
  payload: NurseReportListPayload
}

export function useNurseReport({
  filters,
  paging,
  session,
  enabled,
}: UseNurseReportInput): UseNurseReportResult {
  const key = filters && enabled ? nurseQueryKey(filters, paging) : null
  const cached = key
    ? session.read<NurseReportListPayload>("nurses", key)
    : undefined

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
    if (!forced && session.read<NurseReportListPayload>("nurses", key)) return

    let cancelled = false
    setState({ key, error: null })
    const filterKey = nurseFilterKey(filters)

    session
      .fetchOnce("nurses", key, () => getNurses(filters, paging), {
        force: forced,
      })
      .then((payload) => {
        if (cancelled) return
        session.write("nurses", key, payload)
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
    if (key) session.clear("nurses")
    setNonce((value) => value + 1)
  }, [key, session])

  const error = state.key === key ? state.error : null
  const loading = Boolean(key) && cached === undefined && error === null

  const previous =
    filters && lastLoaded && lastLoaded.filterKey === nurseFilterKey(filters)
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
