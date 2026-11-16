"use client"

/**
 * Payroll list query — Phase 6.11.5.
 *
 * Same discipline as the patient/doctor/nurse hooks (6.11.1 contract §8.2):
 * the query is built from **generated** parameters only, paging/sort are part
 * of the cache key, the previous page's payload stays visible while the next
 * one is in flight, and `loading` is derived rather than stored.
 *
 * The session cache is keyed by the tab (`"payments"`), so a payroll list can
 * never read a patient/doctor/nurse payload. `fetchOnce` (contract 48) dedupes
 * the in-flight request so switching tabs and back does not fire twice.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { getEmployeePayments } from "@/pages/Reports/api"
import type { ReportSessionResult } from "@/pages/Reports/state/useReportSession"
import type {
  EmployeePaymentListPayload,
  EmployeePaymentQueryFilters,
  EmployeePaymentQueryPaging,
} from "@/pages/Reports/types/employeePaymentReport"

export interface UseEmployeePaymentsReportInput {
  /** `null` until the tab has generated at least once. */
  filters: EmployeePaymentQueryFilters | null
  paging: EmployeePaymentQueryPaging
  session: ReportSessionResult
  enabled: boolean
}

export interface UseEmployeePaymentsReportResult {
  payload: EmployeePaymentListPayload | undefined
  loading: boolean
  /** `true` when `payload` belongs to another page of the same filters. */
  refreshing: boolean
  error: Error | null
  reload: () => void
}

/**
 * Filters-only token: everything the numbers depend on except paging.
 *
 * The grouping belongs here: a day/month/year switch changes the chart series
 * (and therefore the payload), so it must invalidate the cache.
 */
export function employeePaymentFilterKey(
  filters: EmployeePaymentQueryFilters
): string {
  return [
    filters.range.from,
    filters.range.to,
    filters.employeeType,
    filters.employeeId ?? "",
    filters.search.trim(),
    filters.grouping,
  ].join("|")
}

/** Stable cache key for one page of one filtered report. */
export function employeePaymentQueryKey(
  filters: EmployeePaymentQueryFilters,
  paging: EmployeePaymentQueryPaging
): string {
  return [
    employeePaymentFilterKey(filters),
    paging.page,
    paging.pageSize,
    paging.sort?.columnId ?? "",
    paging.sort?.direction ?? "",
  ].join("|")
}

interface LoadedPayload {
  filterKey: string
  payload: EmployeePaymentListPayload
}

export function useEmployeePaymentsReport({
  filters,
  paging,
  session,
  enabled,
}: UseEmployeePaymentsReportInput): UseEmployeePaymentsReportResult {
  const key =
    filters && enabled ? employeePaymentQueryKey(filters, paging) : null
  const cached = key
    ? session.read<EmployeePaymentListPayload>("payments", key)
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
    if (!forced && session.read<EmployeePaymentListPayload>("payments", key)) return

    let cancelled = false
    setState({ key, error: null })
    const filterKey = employeePaymentFilterKey(filters)

    session
      .fetchOnce("payments", key, () => getEmployeePayments(filters, paging), {
        force: forced,
      })
      .then((payload) => {
        if (cancelled) return
        session.write("payments", key, payload)
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
    if (key) session.clear("payments")
    setNonce((value) => value + 1)
  }, [key, session])

  const error = state.key === key ? state.error : null
  const loading = Boolean(key) && cached === undefined && error === null

  const previous =
    filters && lastLoaded && lastLoaded.filterKey === employeePaymentFilterKey(filters)
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
