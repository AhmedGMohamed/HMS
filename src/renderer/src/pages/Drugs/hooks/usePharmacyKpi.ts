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
 * returns `total_stock_value` per warehouse).
 *
 * The three counts derive from the **unfiltered** aggregated drug list:
 * the page passes `useDrugsList().allDrugs`, never the filtered view, so
 * "Total Drugs" stays the dataset size and "Expiring Soon" does not fall
 * to 0 while a KPI chip filter is active.
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