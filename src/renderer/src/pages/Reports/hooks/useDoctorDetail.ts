"use client"

/**
 * One doctor + one page of their patients — Phase 6.11.2.
 *
 * Used by two surfaces that need identical behaviour:
 *   - the specific-report body (the patient table is the report),
 *   - the all-report detail dialog (the same table inside a modal).
 *
 * Unlike `useDoctorReport` this hook does **not** write to the session cache:
 * the cache holds one entry per tab, so a detail page would evict the doctor
 * list the user is about to go back to. Keeping the last payload locally is
 * enough for the only thing that matters UX-wise — not unmounting the table
 * and its pagination on every page click.
 *
 * State is `{ key, payload, error }` and is only returned when `key` matches
 * the current request, so a doctor/search change can never show the previous
 * doctor's patients for a frame; a closed dialog keeps its payload, which is
 * what makes reopening the same doctor free.
 */

import { useCallback, useEffect, useState } from "react"

import { getDoctorDetail } from "@/pages/Reports/api"
import type {
  DoctorQueryFilters,
  DoctorQueryPaging,
  DoctorReportDetailPayload,
} from "@/pages/Reports/types/doctorReport"

export interface UseDoctorDetailInput {
  /** `null` when no doctor has been chosen yet. */
  doctorId: number | null
  /** Must be non-null while `enabled`. */
  filters: DoctorQueryFilters | null
  paging: DoctorQueryPaging
  enabled: boolean
}

export interface UseDoctorDetailResult {
  payload: DoctorReportDetailPayload | undefined
  loading: boolean
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/** Everything except paging — the "same doctor, same report" token. */
export function doctorDetailFilterKey(
  doctorId: number,
  filters: DoctorQueryFilters
): string {
  return [
    doctorId,
    filters.range.from,
    filters.range.to,
    filters.relationship,
    filters.search.trim(),
  ].join("|")
}

export function doctorDetailQueryKey(
  doctorId: number,
  filters: DoctorQueryFilters,
  paging: DoctorQueryPaging
): string {
  return [
    doctorDetailFilterKey(doctorId, filters),
    paging.page,
    paging.pageSize,
    paging.sort?.columnId ?? "",
    paging.sort?.direction ?? "",
  ].join("|")
}

interface DetailState {
  key: string
  payload: DoctorReportDetailPayload | null
  error: Error | null
}

interface LoadedPayload {
  filterKey: string
  payload: DoctorReportDetailPayload
}

export function useDoctorDetail({
  doctorId,
  filters,
  paging,
  enabled,
}: UseDoctorDetailInput): UseDoctorDetailResult {
  const usable = enabled && doctorId !== null && filters !== null
  const key = usable ? doctorDetailQueryKey(doctorId, filters, paging) : null

  const [state, setState] = useState<DetailState | null>(null)
  const [lastLoaded, setLastLoaded] = useState<LoadedPayload | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key || doctorId === null || !filters) return

    let cancelled = false
    const requestKey = key
    const filterKey = doctorDetailFilterKey(doctorId, filters)

    getDoctorDetail(doctorId, filters, paging)
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
    // `doctorId`, `filters` and `paging` are fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  const reload = useCallback(() => {
    setState(null)
    setNonce((value) => value + 1)
  }, [])

  const current = key !== null && state?.key === key ? state : null
  const currentPayload = current?.payload ?? undefined
  const previous =
    doctorId !== null &&
    filters &&
    lastLoaded &&
    lastLoaded.filterKey === doctorDetailFilterKey(doctorId, filters)
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
