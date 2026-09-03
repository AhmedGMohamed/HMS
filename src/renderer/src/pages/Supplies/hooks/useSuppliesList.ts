"use client"

import { useEffect, useMemo, useState } from "react"

import {
  getLowStockSupplies,
  listSupplyShipments,
  listSupplies,
} from "@/pages/Supplies/api"
import type {
  EnrichedMedicalSupply,
  MedicalSupply,
  MedicalSupplyShipment,
  MedicalSupplyStock,
} from "@/pages/Supplies/types/supply"

export type KpiFilter = "all" | "low-stock" | "near-expiry"

export interface UseSuppliesListResult {
  supplies: EnrichedMedicalSupply[]
  /**
   * Σ(quantity × buyPrice) across every in-stock shipment. The
   * backend's `/api/warehouse` aggregate is drug-only, so this is
   * computed client-side from the same fan-out that powers
   * `supplies[].totalQuantity`. Pass it to `useSuppliesKpi` to drive
   * the "Total Inventory Value" KPI on the Supplies page.
   */
  totalInventoryValue: number
  loading: boolean
  error: Error | null
  search: string
  setSearch: (v: string) => void
  filter: KpiFilter
  setFilter: (f: KpiFilter) => void
  refresh: () => void
}

const runIdRef = { current: 0 }

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index]!)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run)
  )
  return results
}

interface SupplyAggregate {
  nearestExpiryDate: string | null
  totalQuantity: number
  shipmentsCount: number
  /**
   * Σ(quantity × buyPrice) across in-stock shipments. Drives the
   * "Total Inventory Value" KPI. The backend's `/api/warehouse`
   * aggregate is drug-only, so we compute this client-side from
   * the same fan-out that drives `totalQuantity`.
   */
  totalValue: number
  /** Timestamp captured when the fan-out completed — used as the
   *  reference point for "days until expiry" so the rendered value
   *  is stable across re-renders (avoids the `Date.now()`-in-render
   *  purity violation the linter flags). */
  fetchedAt: number
}

const NEAR_EXPIRY_DAYS = 30

/**
 * Aggregated medical supply list (§3.5.1 of the plan).
 *
 * Mirrors `useDrugsList` but with two simplifications:
 *  1. No `/monitor/near-expiry` endpoint — supplies use a single
 *     per-supply fan-out via `listSupplyShipments(supplyId)` and
 *     derive `nearestExpiryDate` from the in-stock shipments.
 *  2. No unit conversion — every `quantity` is a single integer.
 *
 * Concurrency is capped at 4 to avoid hammering the API. The fan-out
 * uses a runId-based commit guard (the same pattern as
 * `useDrugsList`) so an in-flight run does not race with a newer
 * one and clobber state with stale partial results.
 */
export function useSuppliesList(): UseSuppliesListResult {
  const [supplies, setSupplies] = useState<MedicalSupply[]>([])
  const [lowStock, setLowStock] = useState<MedicalSupplyStock[]>([])
  const [aggregates, setAggregates] = useState<Map<number, SupplyAggregate>>(
    new Map()
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<KpiFilter>("all")

  // Base supply list + low-stock cross-join.
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    Promise.all([listSupplies({ pageSize: 100 }), getLowStockSupplies()])
      .then(([suppliesPage, lowStockRows]) => {
        if (cancelled) return
        setSupplies(suppliesPage.data)
        setLowStock(lowStockRows)
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

  // Per-supply fan-out: nearest expiry + total in-stock quantity.
  useEffect(() => {
    if (supplies.length === 0) return
    const supplyIds = supplies.map((s) => s.supplyId)
    const myRunId = ++runIdRef.current
    const fetchedAt = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    mapWithConcurrency(supplyIds, 4, (supplyId) =>
      listSupplyShipments(supplyId)
        .then((rows: MedicalSupplyShipment[]) => {
          const inStock = rows.filter(
            (s): s is MedicalSupplyShipment & { expiryDate: string } =>
              s.expiryDate != null && s.quantity > 0
          )
          const earliest = inStock.sort(
            (a, b) =>
              new Date(a.expiryDate).getTime() -
              new Date(b.expiryDate).getTime()
          )[0]
          const totalQuantity = inStock.reduce(
            (sum, s) => sum + Number(s.quantity ?? 0),
            0
          )
          // Value is computed from the same in-stock set so the KPI
          // strip and the per-supply Total Stock cell agree. The
          // backend's `/api/warehouse` aggregate is drug-only, so
          // we sum the supply fan-out here.
          const totalValue = inStock.reduce(
            (sum, s) => sum + Number(s.quantity ?? 0) * Number(s.buyPrice ?? 0),
            0
          )
          return [
            supplyId,
            {
              nearestExpiryDate: earliest ? earliest.expiryDate : null,
              totalQuantity,
              shipmentsCount: rows.length,
              totalValue,
              fetchedAt,
            },
          ] as const
        })
        .catch(
          () =>
            [
              supplyId,
              {
                nearestExpiryDate: null,
                totalQuantity: 0,
                shipmentsCount: 0,
                totalValue: 0,
                fetchedAt,
              },
            ] as const
        )
    )
      .then((entries) => {
        if (runIdRef.current !== myRunId) return
        setAggregates((prev) => {
          const map = new Map(prev)
          for (const [id, agg] of entries) {
            map.set(id, agg)
          }
          return map
        })
        setLoading(false)
      })
      .catch(() => {
        if (runIdRef.current === myRunId) {
          setLoading(false)
        }
      })
  }, [supplies, lowStock, nonce])

  const lowStockById = useMemo(() => {
    const map = new Map<number, MedicalSupplyStock>()
    for (const row of lowStock) map.set(row.supplyId, row)
    return map
  }, [lowStock])

  const enriched = useMemo<EnrichedMedicalSupply[]>(() => {
    return supplies.map((supply) => {
      const stock = lowStockById.get(supply.supplyId)
      const aggregate = aggregates.get(supply.supplyId)
      const nearestDate = aggregate?.nearestExpiryDate ?? null
      const daysUntilExpiry =
        nearestDate != null && aggregate
          ? Math.max(
              0,
              Math.ceil(
                (new Date(nearestDate).getTime() - aggregate.fetchedAt) /
                  86_400_000
              )
            )
          : null
      const isNearExpiry =
        daysUntilExpiry != null && daysUntilExpiry <= NEAR_EXPIRY_DAYS
      const totalQuantity =
        aggregate?.totalQuantity != null
          ? aggregate.totalQuantity
          : stock?.totalQuantity != null
            ? Number(stock.totalQuantity)
            : null
      return {
        ...supply,
        stock,
        isLowStock: stock != null,
        isNearExpiry,
        daysUntilExpiry,
        nearestExpiryDate: nearestDate,
        totalQuantity,
        shipmentsCount: aggregate?.shipmentsCount ?? 0,
      }
    })
  }, [supplies, lowStockById, aggregates])

  const filtered = useMemo<EnrichedMedicalSupply[]>(() => {
    const q = search.trim().toLowerCase()
    return enriched.filter((supply) => {
      if (
        q &&
        !supply.name.toLowerCase().includes(q) &&
        !(supply.manufacturer ?? "").toLowerCase().includes(q)
      ) {
        return false
      }
      if (filter === "low-stock" && !supply.isLowStock) return false
      if (filter === "near-expiry" && !supply.isNearExpiry) return false
      return true
    })
  }, [enriched, search, filter])

  const totalInventoryValue = useMemo(
    () =>
      Array.from(aggregates.values()).reduce(
        (sum, agg) => sum + Number(agg.totalValue ?? 0),
        0
      ),
    [aggregates]
  )

  return {
    supplies: filtered,
    totalInventoryValue,
    loading,
    error,
    search,
    setSearch,
    filter,
    setFilter,
    refresh: () => setNonce((n) => n + 1),
  }
}
