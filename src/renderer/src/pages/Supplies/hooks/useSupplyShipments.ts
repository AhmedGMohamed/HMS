"use client"

import { useCallback, useEffect, useState } from "react"

import {
  createSupplyShipment,
  deleteSupplyShipment,
  listSupplyShipments,
  updateSupplyShipment,
} from "@/pages/Supplies/api"
import type {
  CreateSupplyShipmentPayload,
  MedicalSupplyShipment,
  UpdateSupplyShipmentPayload,
} from "@/pages/Supplies/types/supply"

export interface UseSupplyShipmentsResult {
  shipments: MedicalSupplyShipment[]
  loading: boolean
  error: Error | null
  refresh: () => void
  create: (payload: CreateSupplyShipmentPayload) => Promise<void>
  update: (id: number, payload: UpdateSupplyShipmentPayload) => Promise<void>
  remove: (id: number) => Promise<void>
}

/**
 * Per-supply shipments hook (expand-on-demand, §3.5.1).
 *
 * Fetch/mutate shipments for a single supply. Used by the expanded
 * shipment sub-table inside the supplies table. Mirrors
 * `useDrugShipments`.
 */
export function useSupplyShipments(
  supplyId: number | null
): UseSupplyShipmentsResult {
  const [shipments, setShipments] = useState<MedicalSupplyShipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (supplyId == null || !Number.isFinite(supplyId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipments([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    listSupplyShipments(supplyId)
      .then((rows) => {
        if (cancelled) return
        setShipments(rows)
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
  }, [supplyId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const create = useCallback(
    async (payload: CreateSupplyShipmentPayload) => {
      await createSupplyShipment(payload)
      refresh()
    },
    [refresh]
  )

  const update = useCallback(
    async (id: number, payload: UpdateSupplyShipmentPayload) => {
      await updateSupplyShipment(id, payload)
      refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteSupplyShipment(id)
      refresh()
    },
    [refresh]
  )

  return { shipments, loading, error, refresh, create, update, remove }
}
