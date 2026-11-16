"use client"

import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import {
  listAllPriceLists,
  listPriceListsPage,
} from "@/pages/PriceLists/api"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"

export interface PriceListStatsPatch {
  totalServices: number
  totalDrugs: number
  totalSupplies: number
}

export interface UsePriceListsParams {
  page: number
  pageSize: number
  search: string
}

export interface UsePriceListsResult {
  priceLists: PriceListWithStats[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
  /** Patch one list's embedded stats from the bulk-save response —
   *  avoids a full refetch after saving prices. */
  patchStats: (pricelistId: number, stats: PriceListStatsPatch) => void
}

export interface UseAllPriceListsResult {
  priceLists: PriceListWithStats[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/** Coerce pg bigint strings and the `is_default` flag at the boundary. */
function normalizeRow(row: PriceListWithStats): PriceListWithStats {
  return {
    ...row,
    isDefault: row.isDefault === true,
    totalServices: Number(row.totalServices ?? 0),
    totalDrugs: Number(row.totalDrugs ?? 0),
    totalSupplies: Number(row.totalSupplies ?? 0),
  }
}

/**
 * Paginated price-lists hook.
 *
 * The page owns page / pageSize / search; the hook debounces the
 * search term and fetches the current server page. Batch stats are
 * embedded by the list endpoint (no N+1 stats loop), and
 * `patchStats` keeps the bulk-save response from forcing a refetch.
 */
export function usePriceLists(
  params: UsePriceListsParams
): UsePriceListsResult {
  const { page, pageSize, search } = params
  const debouncedSearch = useDebouncedValue(search, { delay: 300 })
  const [priceLists, setPriceLists] = useState<PriceListWithStats[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listPriceListsPage({ page, pageSize, search: debouncedSearch })
      .then((res) => {
        if (cancelled) return
        setPriceLists(res.data.map(normalizeRow))
        setTotal(res.total)
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
  }, [page, pageSize, debouncedSearch, nonce])

  return {
    priceLists,
    total,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
    patchStats: (pricelistId, stats) => {
      setPriceLists((prev) =>
        prev.map((pl) =>
          pl.pricelistId === pricelistId ? { ...pl, ...stats } : pl
        )
      )
    },
  }
}

/**
 * Unbounded price-list lookup (`?all=true`) for places that need the
 * whole catalogue — e.g. the Services page's filter dropdown, badge
 * names, and the service modal's price matrix.
 */
export function useAllPriceLists(): UseAllPriceListsResult {
  const [priceLists, setPriceLists] = useState<PriceListWithStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listAllPriceLists()
      .then((rows) => {
        if (!cancelled) setPriceLists(rows.map(normalizeRow))
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return {
    priceLists,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
