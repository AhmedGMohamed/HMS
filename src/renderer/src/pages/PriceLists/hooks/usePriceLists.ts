"use client"

import { useEffect, useState } from "react"

import { listPriceLists } from "@/pages/PriceLists/api"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"

export interface PriceListStatsPatch {
  totalServices: number
  totalDrugs: number
  totalSupplies: number
}

export interface UsePriceListsResult {
  priceLists: PriceListWithStats[]
  loading: boolean
  error: Error | null
  refresh: () => void
  /** Patch one list's embedded stats from the bulk-save response —
   *  avoids a full refetch after saving prices. */
  patchStats: (pricelistId: number, stats: PriceListStatsPatch) => void
}

/**
 * Price Lists list hook (§2 of `phase_6.6_plan.md`).
 *
 * Single `GET /api/price-lists` fetch (batch stats embedded since
 * Stage 0 — no N+1 stats loop like the legacy page). Counts arrive as
 * JSON strings (Postgres bigint via `pg`) → coerced with `Number()`.
 */
export function usePriceLists(): UsePriceListsResult {
  const [priceLists, setPriceLists] = useState<PriceListWithStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listPriceLists()
      .then((rows) => {
        if (cancelled) return
        setPriceLists(
          rows.map((row) => ({
            ...row,
            isDefault: row.isDefault === true,
            totalServices: Number(row.totalServices ?? 0),
            totalDrugs: Number(row.totalDrugs ?? 0),
            totalSupplies: Number(row.totalSupplies ?? 0),
          }))
        )
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
  }, [nonce])

  return {
    priceLists,
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
