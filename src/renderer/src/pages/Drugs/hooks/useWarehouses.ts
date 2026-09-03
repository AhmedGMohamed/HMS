"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createWarehouse,
  deleteWarehouse,
  listShipmentsByWarehouse,
  listWarehouses,
  updateWarehouse,
} from "@/pages/Drugs/api"
import type {
  CreateWarehousePayload,
  DrugShipment,
  UpdateWarehousePayload,
  WarehouseWithStats,
} from "@/pages/Drugs/types/drug"

export interface UseWarehousesResult {
  warehouses: WarehouseWithStats[]
  loading: boolean
  error: Error | null
  refresh: () => void
  create: (payload: CreateWarehousePayload) => Promise<void>
  update: (id: number, payload: UpdateWarehousePayload) => Promise<void>
  remove: (id: number) => Promise<void>
  /** Fetch the per-shipment breakdown for a warehouse's "View Inventory" dialog. */
  inventory: (id: number) => Promise<DrugShipment[]>
}

/**
 * Warehouse listing + CRUD (§3.5.4).
 *
 * `listWarehouses()` already aggregates `totalShipments` / `totalDrugs`
 * / `totalStockValue`. The "View Inventory" breakdown is derived from
 * `listShipmentsByWarehouse(id)` because the dedicated
 * `getWarehouseInventory` controller is not route-mounted (§3.2 caveat).
 */
export function useWarehouses(): UseWarehousesResult {
  const [warehouses, setWarehouses] = useState<WarehouseWithStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listWarehouses()
      .then((rows) => {
        if (cancelled) return
        // pg returns BIGINT aggregates as strings; coerce to number
        // so `formatNumber` and other numeric consumers don't blow up.
        setWarehouses(
          rows.map((w) => ({
            ...w,
            totalShipments: Number(w.totalShipments ?? 0),
            totalDrugs: Number(w.totalDrugs ?? 0),
            totalStockValue: Number(w.totalStockValue ?? 0),
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

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const create = useCallback(
    async (payload: CreateWarehousePayload) => {
      await createWarehouse(payload)
      refresh()
    },
    [refresh]
  )

  const update = useCallback(
    async (id: number, payload: UpdateWarehousePayload) => {
      await updateWarehouse(id, payload)
      refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteWarehouse(id)
      refresh()
    },
    [refresh]
  )

  const inventory = useCallback(
    async (id: number) => listShipmentsByWarehouse(id),
    []
  )

  return { warehouses, loading, error, refresh, create, update, remove, inventory }
}