"use client"

import { useEffect, useMemo, useState } from "react"
import {
  getLowStockDrugs,
  getNearExpiryDrugs,
  listDrugCards,
  listDrugShipments,
} from "@/pages/Drugs/api"
import type {
  DrugCard,
  DrugExpiry,
  DrugShipment,
  DrugStock,
  EnrichedDrugCard,
} from "@/pages/Drugs/types/drug"

export type KpiFilter = "all" | "low-stock" | "near-expiry"

export interface UseDrugsListResult {
  drugs: EnrichedDrugCard[]
  loading: boolean
  error: Error | null
  search: string
  setSearch: (v: string) => void
  filter: KpiFilter
  setFilter: (f: KpiFilter) => void
  refresh: () => void
}

/**
 * Bounded-concurrency mapper — runs `worker` over `items` with at most
 * `concurrency` in flight at a time. Used to fan-out per-drug shipment
 * fetches without hammering the API.
 */
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

/**
 * Per-drug aggregate derived from the fan-out. Carries the real
 * "earliest in-stock expiry date" (the `/monitor/near-expiry` endpoint
 * is limited to the alert window) plus a sum of in-stock shipment
 * quantities — so the table's "Total Stock" column can show a real
 * number for every drug, not just those below the low-stock threshold.
 */
interface DrugAggregate {
  nearestExpiryDate: string | null
  totalQuantity: number
}

/**
 * Aggregated drug list (§3.5.1).
 *
 * Loads the base `listDrugCards()` and cross-joins the flat
 * `low-stock` / `near-expiry` monitor lists to derive per-drug flags.
 *
 * For every drug we additionally fan-out a bounded-concurrency
 * `listDrugShipments(drugId)` to compute two pieces of truth the
 * monitor endpoints cannot provide:
 *   1. The real `nearestExpiryDate` (the `/monitor/near-expiry`
 *      SQL filters by the per-drug alert window; a drug whose
 *      earliest in-stock shipment is beyond that window has no row
 *      there). The SQL for `listDrugShipments` already orders by
 *      `expiry_date ASC`, so the first in-stock shipment is the
 *      answer.
 *   2. The total in-stock `quantity` (the `/monitor/low-stock`
 *      endpoint only returns drugs at or below their threshold).
 *
 * Concurrency is capped at 4 to avoid hammering the API. Each effect
 * run gets a monotonically-increasing `runId`; the worker only
 * commits its result to state if its runId is still the current one
 * — newer runs supersede the older one. This avoids the
 * setState-in-cleanup race the previous `cancelled` flag had when
 * the fan-out was cancelled mid-flight by a re-render.
 */
export function useDrugsList(): UseDrugsListResult {
  const [drugs, setDrugs] = useState<DrugCard[]>([])
  const [lowStock, setLowStock] = useState<DrugStock[]>([])
  const [nearExpiry, setNearExpiry] = useState<DrugExpiry[]>([])
  const [aggregates, setAggregates] = useState<Map<number, DrugAggregate>>(
    new Map()
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<KpiFilter>("all")

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    Promise.all([
      listDrugCards({ pageSize: 100 }),
      getLowStockDrugs(),
      getNearExpiryDrugs(),
    ])
      .then(([cardsPage, lowStockRows, nearExpiryRows]) => {
        if (cancelled) return
        setDrugs(cardsPage.data)
        setLowStock(lowStockRows)
        setNearExpiry(nearExpiryRows)
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

  // Per-drug fan-out for nearest-expiry + total stock. Bounded
  // concurrency and a runId-based commit guard so an in-flight run
  // does not race with a newer one (the previous `cancelled` flag
  // was getting tripped by a re-render that happened to re-set
  // `nearExpiry` mid-flight, dropping every per-drug result).
  useEffect(() => {
    if (drugs.length === 0) return
    const drugIds = drugs.map((d) => d.drugId)
    const myRunId = ++runIdRef.current
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    mapWithConcurrency(drugIds, 4, (drugId) =>
      listDrugShipments(drugId)
        .then((rows: DrugShipment[]) => {
          const inStock = rows.filter(
            (s): s is DrugShipment & { expiryDate: string } =>
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
          return [
            drugId,
            {
              nearestExpiryDate: earliest ? earliest.expiryDate : null,
              totalQuantity,
            },
          ] as const
        })
        .catch(
          () =>
            [drugId, { nearestExpiryDate: null, totalQuantity: 0 }] as const
        )
    )
      .then((entries) => {
        // Only commit if this run is still the latest. A newer run
        // has superseded us — let it write state instead so we don't
        // clobber fresher data with stale partial results.
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
        /* non-blocking — fall back to "—" / 0 */
        if (runIdRef.current === myRunId) {
          setLoading(false)
        }
      })
    // Re-fires on every drug list / near-expiry / low-stock change
    // and on refresh; the runId guard above makes that safe.
  }, [drugs, nearExpiry, lowStock, nonce])

  const lowStockById = useMemo(() => {
    const map = new Map<number, DrugStock>()
    for (const row of lowStock) map.set(row.drugId, row)
    return map
  }, [lowStock])

  const nearExpiryByDrugId = useMemo(() => {
    // Collapse multiple near-expiry shipments to the nearest per drug.
    const map = new Map<number, DrugExpiry>()
    for (const row of nearExpiry) {
      const existing = map.get(row.drugId)
      if (!existing || row.daysUntilExpiry < existing.daysUntilExpiry) {
        map.set(row.drugId, row)
      }
    }
    return map
  }, [nearExpiry])

  const enriched = useMemo<EnrichedDrugCard[]>(() => {
    return drugs.map((drug) => {
      const stock = lowStockById.get(drug.drugId)
      const expiry = nearExpiryByDrugId.get(drug.drugId)
      const aggregate = aggregates.get(drug.drugId)
      const nearestDate =
        expiry?.expiryDate ??
        aggregate?.nearestExpiryDate ??
        null
      // Authoritative total stock: prefer the fan-out-computed sum of
      // every in-stock shipment; fall back to the low-stock monitor's
      // total (which only exists for drugs at/below threshold). Both
      // sources come from `pg` BIGINT columns, which the driver
      // returns as strings — coerce to a number defensively so the
      // downstream `formatNumber` doesn't blow up.
      const totalQuantity =
        aggregate?.totalQuantity != null
          ? aggregate.totalQuantity
          : stock?.totalQuantity != null
            ? Number(stock.totalQuantity)
            : null
      return {
        ...drug,
        stock,
        isLowStock: stock != null,
        isNearExpiry: expiry != null,
        daysUntilExpiry: expiry?.daysUntilExpiry ?? null,
        nearestExpiryDate: nearestDate,
        totalQuantity,
      }
    })
  }, [drugs, lowStockById, nearExpiryByDrugId, aggregates])

  const filtered = useMemo<EnrichedDrugCard[]>(() => {
    const q = search.trim().toLowerCase()
    return enriched.filter((drug) => {
      if (
        q &&
        !drug.name.toLowerCase().includes(q) &&
        !(drug.manufacturer ?? "").toLowerCase().includes(q)
      ) {
        return false
      }
      if (filter === "low-stock" && !drug.isLowStock) return false
      if (filter === "near-expiry" && !drug.isNearExpiry) return false
      return true
    })
  }, [enriched, search, filter])

  return {
    drugs: filtered,
    loading,
    error,
    search,
    setSearch,
    filter,
    setFilter,
    refresh: () => setNonce((n) => n + 1),
  }
}

/**
 * Module-scoped run counter. Each fan-out effect run increments this
 * synchronously and captures the value; only the latest value's result
 * is allowed to commit state. Survives StrictMode double-invocation
 * because the increment happens before any async work.
 */
const runIdRef = { current: 0 }