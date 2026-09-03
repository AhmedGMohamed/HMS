"use client"

import { useMemo } from "react"
import type { EnrichedDrugCard } from "@/pages/Drugs/types/drug"

export interface PharmacyKpi {
  totalDrugs: number
  lowStockCount: number
  nearExpiryCount: number
  totalInventoryValue: number
}

/**
 * Computes the 4 KPI strip metrics (§6.2).
 *
 * `totalInventoryValue` is Σ(stock × buy price) across all warehouses —
 * authoritatively provided by the Warehouses endpoint (`GET /warehouse`
 * returns `total_stock_value` per warehouse). The three counts derive
 * from the aggregated drug list (low-stock / near-expiry monitor lists
 * are cross-joined by `useDrugsList`).
 */
export function usePharmacyKpi(
  drugs: EnrichedDrugCard[],
  totalInventoryValue: number
): PharmacyKpi {
  return useMemo(
    () => ({
      totalDrugs: drugs.length,
      lowStockCount: drugs.filter((d) => d.isLowStock).length,
      nearExpiryCount: drugs.filter((d) => d.isNearExpiry).length,
      totalInventoryValue,
    }),
    [drugs, totalInventoryValue]
  )
}