"use client"

/**
 * Doctor report list query — Phase 6.11.2.
 *
 * A direct adaptation of `usePatientReport` (6.11.1 contract §8.2): the query
 * is built from **generated** parameters only, paging/sort are part of the
 * cache key, the payload of the previous page is kept while the next one is
 * in flight, and `loading` is derived rather than stored.
 *
 * The session cache is keyed by the tab, so the doctor list and the patient
 * list can never read each other's payload: `read("doctors", key)` misses
 * after the
 * patient tab wrote under `"patients"`.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { getDoctors } from "@/pages/Reports/api"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  DoctorQueryFilters,
  DoctorQueryPaging,
  DoctorReportListPayload,
} from "@/pages/Reports/types/doctorReport"

export interface UseDoctorReportInput {
  /** `null` until the tab has generated at least once, or in specific mode. */
  filters: DoctorQueryFilters | null
  paging: DoctorQueryPaging
  session: ReportSessionResult
  enabled: boolean
}

export interface UseDoctorReportResult {
  payload: DoctorReportListPayload | undefined
  loading: boolean
  /** `true` when `payload` belongs to another page of the same filters. */
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/**
 * Filters-only token: everything the numbers depend on except paging.
 *
 * `doctorId` is included even though the all-report list always passes
 * `null`, so the same hook could serve a filtered list without a cache
 * collision.
 */
export function doctorFilterKey(filters: DoctorQueryFilters): string {
  return [
    filters.range.from,
    filters.range.to,
    filters.relationship,
    filters.doctorId ?? "",
    filters.search.trim(),
  ].join("|")
}

/** Stable cache key for one page of one filtered report. */
export function doctorQueryKey(
  filters: DoctorQueryFilters,
  paging: DoctorQueryPaging
): string {
  return [
    doctorFilterKey(filters),
    paging.page,
    paging.pageSize,
    paging.sort?.columnId ?? "",
    paging.sort?.direction ?? "",
  ].join("|")
}

interface LoadedPayload {
  filterKey: string
  payload: DoctorReportListPayload
}

export function useDoctorReport({
  filters,
  paging,
  session,
  enabled,
}: UseDoctorReportInput): UseDoctorReportResult {
  const key = filters && enabled ? doctorQueryKey(filters, paging) : null
  const cached = key
    ? session.read<DoctorReportListPayload>("doctors", key)
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
    if (!forced && session.read<DoctorReportListPayload>("doctors", key)) return

    let cancelled = false
    setState({ key, error: null })
    const filterKey = doctorFilterKey(filters)

    getDoctors(filters, paging)
      .then((payload) => {
        if (cancelled) return
        session.write("doctors", key, payload)
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
    if (key) session.clear("doctors")
    setNonce((value) => value + 1)
  }, [key, session])

  const error = state.key === key ? state.error : null
  const loading = Boolean(key) && cached === undefined && error === null

  const previous =
    filters && lastLoaded && lastLoaded.filterKey === doctorFilterKey(filters)
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
