"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createShipment,
  deleteShipment,
  listDrugShipments,
  updateShipment,
} from "@/pages/Drugs/api"
import type {
  CreateShipmentPayload,
  DrugShipment,
  UpdateShipmentPayload,
} from "@/pages/Drugs/types/drug"

export interface UseDrugShipmentsResult {
  shipments: DrugShipment[]
  loading: boolean
  error: Error | null
  refresh: () => void
  create: (payload: CreateShipmentPayload) => Promise<void>
  update: (id: number, payload: UpdateShipmentPayload) => Promise<void>
  remove: (id: number) => Promise<void>
}

/**
 * Per-drug shipments hook (expand-on-demand, §3.5.1).
 *
 * Fetch/mutate shipments for a single drug. Used by the expanded
 * shipment sub-table inside the drugs table.
 */
export function useDrugShipments(drugId: number | null): UseDrugShipmentsResult {
  const [shipments, setShipments] = useState<DrugShipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (drugId == null || !Number.isFinite(drugId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipments([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    listDrugShipments(drugId)
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
  }, [drugId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const create = useCallback(
    async (payload: CreateShipmentPayload) => {
      await createShipment(payload)
      refresh()
    },
    [refresh]
  )

  const update = useCallback(
    async (id: number, payload: UpdateShipmentPayload) => {
      await updateShipment(id, payload)
      refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteShipment(id)
      refresh()
    },
    [refresh]
  )

  return { shipments, loading, error, refresh, create, update, remove }
}