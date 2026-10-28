"use client"

/**
 * Patient report list query — Phase 6.11.1.
 *
 * The report is fetched only from **generated** parameters (the URL), never
 * from the form draft, so editing a filter can never silently change the
 * visible numbers. Paging and sorting are page-local state, but they are part
 * of the cache key: paging away and back re-uses the cached page instead of
 * re-querying, which is what keeps the table snappy without a data library.
 *
 * ## Why `payload` outlives the current key
 *
 * A page or sort change produces a new key, so the cache has no entry for it
 * yet. Rendering the full "loading" state at that moment would unmount the
 * table (and its pagination controls) for every page click. Instead the hook
 * keeps the **last payload fetched for the same filters** and reports
 * `refreshing`, so the table stays mounted and shows skeleton rows while the
 * next page arrives. A change of filters or dates does *not* keep anything —
 * those describe a different report and must reset to a full skeleton.
 *
 * `loading` is derived (no cache entry and no error yet) rather than stored,
 * which removes the "flash of the wrong state" a stored boolean causes when
 * the key changes: the very render that sees the new key already knows the
 * payload is missing.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { getPatients } from "@/pages/Reports/api"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  PatientQueryFilters,
  PatientQueryPaging,
  PatientReportListPayload,
} from "@/pages/Reports/types/patientReport"

export interface UsePatientReportInput {
  /** `null` until the tab has generated at least once. */
  filters: PatientQueryFilters | null
  paging: PatientQueryPaging
  session: ReportSessionResult
  enabled: boolean
}

export interface UsePatientReportResult {
  /** Best available payload: the current key's, else the last one for these
   *  filters (kept mounted while a page/sort change is in flight). */
  payload: PatientReportListPayload | undefined
  /** The current key has not resolved yet. */
  loading: boolean
  /** `true` when `payload` belongs to another page of the same filters. */
  refreshing: boolean
  error: Error | null
  /** Re-runs the query, bypassing the cache entry for this key. */
  reload: () => void
}

/** Filters-only token: everything the numbers depend on except paging. */
export function patientFilterKey(filters: PatientQueryFilters): string {
  return [
    filters.range.from,
    filters.range.to,
    filters.paymentType,
    filters.insuranceId ?? "",
    filters.search.trim(),
  ].join("|")
}

/** Stable cache key for one page of one filtered report. */
export function patientQueryKey(
  filters: PatientQueryFilters,
  paging: PatientQueryPaging
): string {
  return [
    patientFilterKey(filters),
    paging.page,
    paging.pageSize,
    paging.sort?.columnId ?? "",
    paging.sort?.direction ?? "",
  ].join("|")
}

interface LoadedPayload {
  /** `patientFilterKey` the payload belongs to. */
  filterKey: string
  payload: PatientReportListPayload
}

export function usePatientReport({
  filters,
  paging,
  session,
  enabled,
}: UsePatientReportInput): UsePatientReportResult {
  const key = filters && enabled ? patientQueryKey(filters, paging) : null
  const cached = key ? session.read<PatientReportListPayload>("patients", key) : undefined

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
    if (!forced && session.read<PatientReportListPayload>("patients", key)) return

    let cancelled = false
    setState({ key, error: null })
    const filterKey = patientFilterKey(filters)

    session
      .fetchOnce("patients", key, () => getPatients(filters, paging), {
        force: forced,
      })
      .then((payload) => {
        if (cancelled) return
        session.write("patients", key, payload)
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
    // `paging`, `filters` and `session` are fully described by `key`; adding
    // them would re-run the effect on every render that builds a new object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, enabled])

  const reload = useCallback(() => {
    forceRef.current = true
    if (key) session.clear("patients")
    setNonce((value) => value + 1)
  }, [key, session])

  const error = state.key === key ? state.error : null
  const loading = Boolean(key) && cached === undefined && error === null

  // Another page of the same report is loading: keep the rows on screen.
  const previous =
    filters && lastLoaded && lastLoaded.filterKey === patientFilterKey(filters)
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
