"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createTransaction,
  getTransactionSummary,
  listTransactions,
} from "@/pages/Drugs/api"
import type {
  CreateTransactionPayload,
  DrugTransaction,
  TransactionFilters,
  TransactionSummary,
} from "@/pages/Drugs/types/drug"

export interface UseDrugTransactionsResult {
  transactions: DrugTransaction[]
  summary: TransactionSummary | null
  loading: boolean
  loadingSummary: boolean
  error: Error | null
  filters: TransactionFilters
  setFilters: (f: TransactionFilters) => void
  refresh: () => void
  sell: (payload: CreateTransactionPayload) => Promise<void>
}

/**
 * Transactions history + summary (§3.5.5).
 *
 * Mirror-ed `filters` drive both `listTransactions` and
 * `getTransactionSummary` so the summary cards always reflect the
 * currently-filtered list.
 */
export function useDrugTransactions(): UseDrugTransactionsResult {
  const [transactions, setTransactions] = useState<DrugTransaction[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [filters, setFiltersState] = useState<TransactionFilters>({})
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listTransactions(filters)
      .then((rows) => {
        if (cancelled) return
        setTransactions(rows)
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
    getTransactionSummary(filters)
      .then((rows) => {
        if (cancelled) return
        setSummary(rows)
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
  }, [filters, nonce])

  const setFilters = useCallback((next: TransactionFilters) => {
    setFiltersState(next)
  }, [])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const sell = useCallback(async (payload: CreateTransactionPayload) => {
    await createTransaction(payload)
    setNonce((n) => n + 1)
  }, [])

  return {
    transactions,
    summary,
    loading,
    loadingSummary,
    error,
    filters,
    setFilters,
    refresh,
    sell,
  }
}