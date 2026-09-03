"use client"

import { useMemo } from "react"

import type { EnrichedMedicalSupply, SupplyUsageSummaryMetrics } from "@/pages/Supplies/types/supply"

export interface SuppliesKpi {
  totalSupplies: number
  lowStockCount: number
  nearExpiryCount: number
  totalInventoryValue: number
  /**
   * Turnover rate as a fraction in `[0, 1]`. The renderer formats this
   * to a percentage for display (`48.2%`).
   *
   * Formula: `unitsDispensedLast30Days / (currentInStock + unitsDispensedLast30Days)`.
   * Returns `0` when the summary is not yet loaded or when both the
   * in-stock and dispensed-30d totals are zero (avoids `NaN`).
   */
  turnoverRate: number
}

/**
 * Computes the 5 KPI strip metrics for the Supplies Inventory tab
 * (design plan §6.3.1).
 *
 * `totalInventoryValue` is sourced from `useSuppliesList`'s
 * client-side aggregate (Σ(quantity × buyPrice) across all
 * in-stock supply shipments). The backend's `/api/warehouse`
 * endpoint aggregates **drug** stock only — using it would
 * surface the wrong number on the supplies page.
 *
 * The first three counts derive from the aggregated supply list
 * (low-stock cross-joined; near-expiry derived from the per-supply
 * fan-out). `turnoverRate` is computed from the global summary
 * metrics (which come from `GET /api/pharmacy/medical-supply-usages/
 * summary`).
 */
export function useSuppliesKpi(
  supplies: EnrichedMedicalSupply[],
  totalInventoryValue: number,
  summary: SupplyUsageSummaryMetrics | null
): SuppliesKpi {
  return useMemo<SuppliesKpi>(() => {
    const totalSupplies = supplies.length
    const lowStockCount = supplies.filter((s) => s.isLowStock).length
    const nearExpiryCount = supplies.filter((s) => s.isNearExpiry).length

    const units30d = Number(summary?.totalUnitsDispensedLast30Days ?? 0)
    const currentInStock = supplies.reduce(
      (sum, s) => sum + Number(s.totalQuantity ?? 0),
      0
    )
    const denominator = currentInStock + units30d
    const turnoverRate =
      denominator > 0 ? Math.min(1, Math.max(0, units30d / denominator)) : 0

    return {
      totalSupplies,
      lowStockCount,
      nearExpiryCount,
      totalInventoryValue,
      turnoverRate,
    }
  }, [supplies, totalInventoryValue, summary])
}
