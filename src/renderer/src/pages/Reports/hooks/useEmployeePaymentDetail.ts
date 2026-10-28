"use client"

/**
 * One employee's payroll detail — Phase 6.11.5.
 *
 * Used by the detail dialog (the tab itself lists employees, not payments), so
 * this hook does **not** write to the session cache: the cache holds one entry
 * per tab, and a detail page would evict the payroll list the user is about to
 * go back to. Keeping the last payload locally is enough for the only thing
 * that matters UX-wise — not unmounting the tables on every page click.
 */

import { useCallback, useEffect, useState } from "react"

import { getEmployeePaymentDetail } from "@/pages/Reports/api"
import type {
  EmployeePaymentDetailPayload,
  EmployeePaymentQueryFilters,
  EmployeePaymentQueryPaging,
} from "@/pages/Reports/types/employeePaymentReport"

export interface UseEmployeePaymentDetailInput {
  /** `null` when no employee has been chosen yet. */
  employeeId: number | null
  /** Must be non-null while `enabled`. */
  filters: EmployeePaymentQueryFilters | null
  paging: EmployeePaymentQueryPaging
  enabled: boolean
}

export interface UseEmployeePaymentDetailResult {
  payload: EmployeePaymentDetailPayload | undefined
  loading: boolean
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/**
 * Everything except paging — the "same employee, same period" token.
 *
 * `employeeType`/`search`/`grouping` are deliberately absent: the detail
 * endpoint only takes a range and paging, and folding a filter the request
 * ignores into the key would refetch the same document for no reason.
 */
export function employeePaymentDetailFilterKey(
  employeeId: number,
  filters: EmployeePaymentQueryFilters
): string {
  return [employeeId, filters.range.from, filters.range.to].join("|")
}

export function employeePaymentDetailQueryKey(
  employeeId: number,
  filters: EmployeePaymentQueryFilters,
  paging: EmployeePaymentQueryPaging
): string {
  return [
    employeePaymentDetailFilterKey(employeeId, filters),
    paging.page,
    paging.pageSize,
  ].join("|")
}

interface DetailState {
  key: string
  payload: EmployeePaymentDetailPayload | null
  error: Error | null
}

interface LoadedPayload {
  filterKey: string
  payload: EmployeePaymentDetailPayload
}

export function useEmployeePaymentDetail({
  employeeId,
  filters,
  paging,
  enabled,
}: UseEmployeePaymentDetailInput): UseEmployeePaymentDetailResult {
  const usable = enabled && employeeId !== null && filters !== null
  const key = usable ? employeePaymentDetailQueryKey(employeeId, filters, paging) : null

  const [state, setState] = useState<DetailState | null>(null)
  const [lastLoaded, setLastLoaded] = useState<LoadedPayload | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key || employeeId === null || !filters) return

    let cancelled = false
    const requestKey = key
    const filterKey = employeePaymentDetailFilterKey(employeeId, filters)

    getEmployeePaymentDetail(employeeId, filters, paging)
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
    // `employeeId`, `filters` and `paging` are fully described by `key`.
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
    lastLoaded.filterKey === employeePaymentDetailFilterKey(employeeId, filters)
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
