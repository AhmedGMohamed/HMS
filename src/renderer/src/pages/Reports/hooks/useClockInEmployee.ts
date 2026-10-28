"use client"

/**
 * One employee's clock-in detail — Phase 6.11.6.
 *
 * Used by the detail dialog (the tab itself lists employees, not sessions), so
 * this hook does **not** write to the session cache: the cache holds one entry
 * per tab, and a detail page would evict the clock-in list the user is about to
 * go back to. Keeping the last payload locally is enough for the only thing
 * that matters UX-wise — not unmounting the table on every page click.
 *
 * The status filter is part of the key: `missing` days are synthesized on the
 * server and filtered there (they do not exist in the database), so switching
 * to "Missing" is a different request, not a client-side filter over the page.
 */

import { useCallback, useEffect, useState } from "react"

import { getClockInEmployee } from "@/pages/Reports/api"
import type {
  ClockInDetailPayload,
  ClockInDetailPaging,
  ClockInQueryFilters,
  ClockInStatusFilter,
} from "@/pages/Reports/types/clockInReport"

export interface UseClockInEmployeeInput {
  /** `null` when no employee has been chosen yet. */
  employeeId: number | null
  /** Must be non-null while `enabled`. */
  filters: ClockInQueryFilters | null
  status: ClockInStatusFilter
  paging: ClockInDetailPaging
  enabled: boolean
}

export interface UseClockInEmployeeResult {
  payload: ClockInDetailPayload | undefined
  loading: boolean
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/**
 * Everything except paging — the "same employee, same period, same status"
 * token.
 *
 * `employeeType`/`search` are deliberately absent: the detail endpoint only
 * takes a range, a status and paging, and folding a filter the request ignores
 * into the key would refetch the same document for no reason.
 */
export function clockInDetailFilterKey(
  employeeId: number,
  filters: ClockInQueryFilters,
  status: ClockInStatusFilter
): string {
  return [employeeId, filters.range.from, filters.range.to, status].join("|")
}

export function clockInDetailQueryKey(
  employeeId: number,
  filters: ClockInQueryFilters,
  status: ClockInStatusFilter,
  paging: ClockInDetailPaging
): string {
  return [
    clockInDetailFilterKey(employeeId, filters, status),
    paging.page,
    paging.pageSize,
  ].join("|")
}

interface DetailState {
  key: string
  payload: ClockInDetailPayload | null
  error: Error | null
}

interface LoadedPayload {
  filterKey: string
  payload: ClockInDetailPayload
}

export function useClockInEmployee({
  employeeId,
  filters,
  status,
  paging,
  enabled,
}: UseClockInEmployeeInput): UseClockInEmployeeResult {
  const usable = enabled && employeeId !== null && filters !== null
  const key = usable
    ? clockInDetailQueryKey(employeeId, filters, status, paging)
    : null

  const [state, setState] = useState<DetailState | null>(null)
  const [lastLoaded, setLastLoaded] = useState<LoadedPayload | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key || employeeId === null || !filters) return

    let cancelled = false
    const requestKey = key
    const filterKey = clockInDetailFilterKey(employeeId, filters, status)

    getClockInEmployee(employeeId, filters.range, status, paging)
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
    // `employeeId`, `filters`, `status` and `paging` are fully described by
    // `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  const reload = useCallback(() => {
    setState(null)
    setNonce((value) => value + 1)
  }, [])

  const current = key !== null && state?.key === key ? state : null
  const currentPayload = current?.payload ?? undefined
  const previous =
    employeeId !== null &&
    filters &&
    lastLoaded &&
    lastLoaded.filterKey === clockInDetailFilterKey(employeeId, filters, status)
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
