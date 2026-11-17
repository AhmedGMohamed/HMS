"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  /** Filtered view — what the table renders. */
  drugs: EnrichedDrugCard[]
  /**
   * Unfiltered dataset (search + KPI chips not applied). The KPI strip
   * must read this — deriving "Total Drugs" / "Expiring Soon" from the
   * filtered view makes the cards collapse to 0 whenever a filter is on.
   */
  allDrugs: EnrichedDrugCard[]
  /** List fetches only (cards + KPI lists). Detail fan-out never sets it. */
  loading: boolean
  /**
   * Per-window shipment fan-out in flight. Kept separate from `loading` so
   * paging/sorting a populated table does not blank it with skeletons while
   * the per-drug detail requests resolve.
   */
  detailsLoading: boolean
  error: Error | null
  search: string
  setSearch: (v: string) => void
  filter: KpiFilter
  setFilter: (f: KpiFilter) => void
  /**
   * Report the drug ids actually on screen. The shipment fan-out is
   * driven by this window, not by the whole list: opening the page
   * costs one request per visible row instead of one per drug.
   */
  setVisibleDrugIds: (ids: number[]) => void
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
 * Loads the base `listDrugCards()` (one bounded request — the full list
 * backs the client-side search/chip filters and the KPI counts) and
 * cross-joins the flat `low-stock` / `near-expiry` monitor lists to
 * derive per-drug flags.
 *
 * The per-drug `listDrugShipments(drugId)` fan-out only targets the
 * rows the table currently renders (`setVisibleDrugIds`, reported by
 * `DrugsTable` after pagination/sorting). Those fetches fill in two
 * pieces of truth the monitor endpoints cannot provide:
 *   1. The real `nearestExpiryDate` (the `/monitor/near-expiry`
 *      SQL filters by the per-drug alert window; a drug whose
 *      earliest in-stock shipment is beyond that window has no row
 *      there). The SQL for `listDrugShipments` already orders by
 *      `expiry_date ASC`, so the first in-stock shipment is the
 *      answer.
 *   2. The total in-stock `quantity` (the `/monitor/low-stock`
 *      endpoint only returns drugs at or below their threshold).
 *
 * Concurrency is capped at 4. Each hook instance owns its `runId`
 * counter (`useRef`) — a module-level counter was shared by every
 * instance, so StrictMode's double mount (or any second hook instance)
 * invalidated the other's in-flight run. The worker only commits its
 * result when its runId is still current; newer runs supersede older
 * ones.
 */
export function useDrugsList(): UseDrugsListResult {
  const [drugs, setDrugs] = useState<DrugCard[]>([])
  const [lowStock, setLowStock] = useState<DrugStock[]>([])
  const [nearExpiry, setNearExpiry] = useState<DrugExpiry[]>([])
  const [aggregates, setAggregates] = useState<Map<number, DrugAggregate>>(
    new Map()
  )
  const [visibleDrugIds, setVisibleDrugIdsState] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<KpiFilter>("all")

  const runIdRef = useRef(0)

  /**
   * Window setter with identity-stable semantics: `DrugsTable`
   * reports its visible rows after every render, so only an actual
   * change of ids is allowed to trigger a new fan-out.
   */
  const setVisibleDrugIds = useCallback((ids: number[]) => {
    setVisibleDrugIdsState((prev) =>
      prev.length === ids.length && prev.every((id, i) => id === ids[i])
        ? prev
        : ids
    )
  }, [])

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

  // The window is keyed by a string so a re-render that re-reports the
  // same page does not retrigger the fan-out.
  const visibleKey = visibleDrugIds.join(",")
  const visibleIds = useMemo(
    () => (visibleKey ? visibleKey.split(",").map(Number) : []),
    [visibleKey]
  )

  // Shipment fan-out for the visible page only. Bounded concurrency and
  // a per-instance runId commit guard so an in-flight run does not race
  // with a newer one. Results merge into the map, so paging back to a
  // previously visited window re-uses/corrects its entries in place.
  useEffect(() => {
    if (visibleIds.length === 0) return
    const myRunId = ++runIdRef.current
    // Detail-only flag: the table keeps its populated rows while this runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailsLoading(true)
    mapWithConcurrency(visibleIds, 4, (drugId) =>
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
        setDetailsLoading(false)
      })
      .catch(() => {
        /* non-blocking — fall back to "—" / 0 */
        if (runIdRef.current === myRunId) {
          setDetailsLoading(false)
        }
      })
    // `visibleIds` is derived from `visibleKey`, so it only changes
    // identity when the visible page (or its ids) actually changes.
  }, [visibleIds, nonce])

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
    allDrugs: enriched,
    loading,
    detailsLoading,
    error,
    search,
    setSearch,
    filter,
    setFilter,
    setVisibleDrugIds,
    refresh: () => setNonce((n) => n + 1),
  }
}