"use client"

/**
 * One nurse + one page of their patients + the whole accordion — Phase 6.11.3.
 *
 * Used by the specific-report body and by the all-report detail dialog, so the
 * two surfaces share sorting, paging and the patient search behaviour.
 *
 * Like `useDoctorDetail` this hook does **not** write to the session cache: the
 * cache holds one entry per tab, so a detail page would evict the nurse list
 * the user is about to go back to. Keeping the last payload locally is enough
 * for the only thing that matters UX-wise — not unmounting the table on every
 * page click.
 */

import { useCallback, useEffect, useState } from "react"

import { getNurseDetail } from "@/pages/Reports/api"
import type {
  NurseQueryFilters,
  NurseQueryPaging,
  NurseReportDetailPayload,
} from "@/pages/Reports/types/nurseReport"

export interface UseNurseDetailInput {
  /** `null` when no nurse has been chosen yet. */
  nurseId: number | null
  /** Must be non-null while `enabled`. */
  filters: NurseQueryFilters | null
  paging: NurseQueryPaging
  enabled: boolean
}

export interface UseNurseDetailResult {
  payload: NurseReportDetailPayload | undefined
  loading: boolean
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/** Everything except paging — the "same nurse, same report" token. */
export function nurseDetailFilterKey(
  nurseId: number,
  filters: NurseQueryFilters
): string {
  return [
    nurseId,
    filters.range.from,
    filters.range.to,
    filters.search.trim(),
  ].join("|")
}

export function nurseDetailQueryKey(
  nurseId: number,
  filters: NurseQueryFilters,
  paging: NurseQueryPaging
): string {
  return [
    nurseDetailFilterKey(nurseId, filters),
    paging.page,
    paging.pageSize,
    paging.sort?.columnId ?? "",
    paging.sort?.direction ?? "",
  ].join("|")
}

interface DetailState {
  key: string
  payload: NurseReportDetailPayload | null
  error: Error | null
}

interface LoadedPayload {
  filterKey: string
  payload: NurseReportDetailPayload
}

export function useNurseDetail({
  nurseId,
  filters,
  paging,
  enabled,
}: UseNurseDetailInput): UseNurseDetailResult {
  const usable = enabled && nurseId !== null && filters !== null
  const key = usable ? nurseDetailQueryKey(nurseId, filters, paging) : null

  const [state, setState] = useState<DetailState | null>(null)
  const [lastLoaded, setLastLoaded] = useState<LoadedPayload | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key || nurseId === null || !filters) return

    let cancelled = false
    const requestKey = key
    const filterKey = nurseDetailFilterKey(nurseId, filters)

    getNurseDetail(nurseId, filters, paging)
      .then((payload) => {
        if (cancelled) return
        setState({ key: requestKey, payload, error: null })
        setLastLoaded({ filterKey, payload })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setState({
          key: requestKey,
          payload: null,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        })
      })

    return () => {
      cancelled = true
    }
    // `nurseId`, `filters` and `paging` are fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  const reload = useCallback(() => {
    setState(null)
    setNonce((value) => value + 1)
  }, [])

  const current = key !== null && state?.key === key ? state : null
  const currentPayload = current?.payload ?? undefined
  const previous =
    nurseId !== null &&
    filters &&
    lastLoaded &&
    lastLoaded.filterKey === nurseDetailFilterKey(nurseId, filters)
      ? lastLoaded.payload
      : undefined
  const payload = currentPayload ?? previous

  const error = current?.error ?? null
  const loading = Boolean(key) && current === null && error === null

  return {
    payload,
    loading,
    refreshing: loading && payload !== undefined,
    error,
    reload,
  }
}
