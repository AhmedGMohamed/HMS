"use client"

import { useCallback, useEffect, useState } from "react"

import {
  dispenseSupplyToPatient,
  getSupplyUsageSummary,
  listSupplyUsageHistory,
} from "@/pages/Supplies/api"
import type {
  DispenseSupplyPayload,
  MedicalSupplyUsageRow,
  SupplyUsageFilters,
  SupplyUsageSummaryMetrics,
} from "@/pages/Supplies/types/supply"

export interface UseSupplyUsageHistoryResult {
  rows: MedicalSupplyUsageRow[]
  summary: SupplyUsageSummaryMetrics | null
  loading: boolean
  loadingSummary: boolean
  error: Error | null
  filters: SupplyUsageFilters
  setFilters: (f: SupplyUsageFilters) => void
  refresh: () => void
  dispense: (patientId: number, payload: Omit<DispenseSupplyPayload, "patientHistoryId">) => Promise<void>
}

/**
 * Supply usage history + summary (Tab 3 of `/supplies`).
 *
 * Mirrors `useDrugTransactions`. The filters object is the SSOT for
 * both `listSupplyUsageHistory` and `getSupplyUsageSummary`, so the
 * summary cards always reflect the currently-filtered list.
 */
export function useSupplyUsageHistory(): UseSupplyUsageHistoryResult {
  const [rows, setRows] = useState<MedicalSupplyUsageRow[]>([])
  const [summary, setSummary] = useState<SupplyUsageSummaryMetrics | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [filters, setFiltersState] = useState<SupplyUsageFilters>({})
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listSupplyUsageHistory(filters)
      .then((res) => {
        if (cancelled) return
        setRows(res)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, nonce])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingSummary(true)
    getSupplyUsageSummary()
      .then((res) => {
        if (cancelled) return
        setSummary(res)
      })
      .catch(() => {
        /* summary is non-blocking */
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  const setFilters = useCallback((next: SupplyUsageFilters) => {
    setFiltersState(next)
  }, [])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const dispense = useCallback(
    async (
      patientId: number,
      payload: Omit<DispenseSupplyPayload, "patientHistoryId">
    ) => {
      await dispenseSupplyToPatient(patientId, payload)
      setNonce((n) => n + 1)
    },
    []
  )

  return {
    rows,
    summary,
    loading,
    loadingSummary,
    error,
    filters,
    setFilters,
    refresh,
    dispense,
  }
}
