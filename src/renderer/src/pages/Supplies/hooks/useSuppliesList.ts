"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  getLowStockSupplies,
  listSupplies,
  listWarehouseSupplyShipments,
} from "@/pages/Supplies/api"
import type {
  EnrichedMedicalSupply,
  MedicalSupply,
  MedicalSupplyStock,
  WarehouseSupplyInventoryItem,
} from "@/pages/Supplies/types/supply"

export type KpiFilter = "all" | "low-stock" | "near-expiry"

export interface UseSuppliesListResult {
  /** Filtered view — what the table renders. */
  supplies: EnrichedMedicalSupply[]
  /**
   * Unfiltered dataset (search + KPI chips not applied). Stock/count
   * KPIs must read this: deriving them from the filtered view makes
   * "Total Supplies" collapse and the turnover denominator follow the
   * filter unintentionally.
   */
  allSupplies: EnrichedMedicalSupply[]
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
   * the same shipment rows that drive `totalQuantity`.
   */
  totalValue: number
  /** Timestamp captured when the fetch completed — used as the
   *  reference point for "days until expiry" so the rendered value
   *  is stable across re-renders (avoids the `Date.now()`-in-render
   *  purity violation the linter flags). */
  fetchedAt: number
}

const NEAR_EXPIRY_DAYS = 30

/**
 * Fold the per-warehouse shipment rows into one aggregate per supply.
 * A supply's shipments can live in several warehouses, so only the
 * union carries its real stock total, earliest in-stock expiry and
 * inventory value.
 */
function foldShipmentRows(
  perWarehouse: WarehouseSupplyInventoryItem[][],
  fetchedAt: number
): Map<number, SupplyAggregate> {
  const map = new Map<number, SupplyAggregate>()
  for (const rows of perWarehouse) {
    for (const row of rows) {
      const supplyId = Number(row.supplyId)
      const existing = map.get(supplyId) ?? {
        nearestExpiryDate: null,
        totalQuantity: 0,
        shipmentsCount: 0,
        totalValue: 0,
        fetchedAt,
      }
      existing.shipmentsCount += 1
      const quantity = Number(row.quantity ?? 0)
      if (quantity > 0) {
        existing.totalQuantity += quantity
        existing.totalValue += quantity * Number(row.buyPrice ?? 0)
        if (
          row.expiryDate != null &&
          (existing.nearestExpiryDate == null ||
            new Date(row.expiryDate).getTime() <
              new Date(existing.nearestExpiryDate).getTime())
        ) {
          existing.nearestExpiryDate = row.expiryDate
        }
      }
      map.set(supplyId, existing)
    }
  }
  return map
}

/**
 * Aggregated medical supply list (§3.5.1 of the plan).
 *
 * Mirrors `useDrugsList`, with two simplifications:
 *  1. No `/monitor/near-expiry` endpoint — the per-supply flag is
 *     derived from the shipment rows' expiry dates.
 *  2. No unit conversion — every `quantity` is a single integer.
 *
 * Shipment aggregation is **warehouse-scoped, not supply-scoped**. The
 * previous implementation fanned out `listSupplyShipments(supplyId)`
 * once per supply (up to 100 requests/page). The supplies KPIs need the
 * unfiltered per-supply stock total (the "Total Inventory Value" card
 * and the turnover denominator), and the only value source is the
 * shipment rows — the `/api/warehouse` aggregate is drug-only. So the
 * hook fetches the existing
 * `GET /pharmacy/medical-supply-shipments/warehouse/:id` endpoint once
 * per warehouse (bounded concurrency 4) and folds the rows into one
 * per-supply aggregate map. Requests are constant in the number of
 * supplies, the data covers every row (so KPIs stay honest), and no
 * new endpoint is introduced.
 *
 * `runIdRef` is per hook instance: a module-level counter was shared by
 * every instance, so StrictMode's double mount (or a second hook
 * instance) invalidated the other's in-flight run. The effect also
 * keeps a `cancelled` flag for unmount/refresh.
 */
export function useSuppliesList(warehouseIds: number[]): UseSuppliesListResult {
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

  const runIdRef = useRef(0)

  // Warehouse ids are deduped/stringified so a page re-render that
  // rebuilds the array does not retrigger the fetch.
  const warehouseKey = warehouseIds.join(",")
  const warehouseIdList = useMemo(
    () => (warehouseKey ? warehouseKey.split(",").map(Number) : []),
    [warehouseKey]
  )

  // Base supply list + low-stock cross-join + per-warehouse shipment
  // fold (which yields the per-supply expiry/stock/value aggregates).
  useEffect(() => {
    const myRunId = ++runIdRef.current
    const fetchedAt = Date.now()
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    Promise.all([
      listSupplies({ pageSize: 100 }),
      getLowStockSupplies(),
      /* A warehouse stock fetch failure must surface, not fold to [] —
         folding silently understates every stock/expiry aggregate. */
      mapWithConcurrency(warehouseIdList, 4, (warehouseId) =>
        listWarehouseSupplyShipments(warehouseId)
      ),
    ])
      .then(([suppliesPage, lowStockRows, perWarehouse]) => {
        if (cancelled || runIdRef.current !== myRunId) return
        setSupplies(suppliesPage.data)
        setLowStock(lowStockRows)
        setAggregates(foldShipmentRows(perWarehouse, fetchedAt))
      })
      .catch((err: unknown) => {
        /* Superseded runs must not write state either — the old guard only
           checked `cancelled`, so a stale run could still set the error. */
        if (cancelled || runIdRef.current !== myRunId) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled && runIdRef.current === myRunId) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce, warehouseIdList])

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
      const totalQuantity = aggregate
        ? aggregate.totalQuantity
        : stock?.totalQuantity != null
          ? Number(stock.totalQuantity)
          : 0
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
    allSupplies: enriched,
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
