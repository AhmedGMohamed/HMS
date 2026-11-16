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
   * Formula: `unitsDispensedLast30Days / (selectedInStock + unitsDispensedLast30Days)`.
   * Returns `0` when the summary is not yet loaded or when both the
   * in-stock and dispensed-30d totals are zero (avoids `NaN`).
   */
  turnoverRate: number
}

export interface SuppliesKpiInput {
  /**
   * Unfiltered dataset. Drives the counts, the inventory value and the
   * denominator baseline — a KPI card must not change because the user
   * narrowed the table with search or a chip filter.
   */
  supplies: EnrichedMedicalSupply[]
  /**
   * The current search/chip selection. Used for the turnover
   * denominator only, so "turnover over the current selection" is a
   * real, documented semantic rather than an accident of sharing one
   * filtered array.
   */
  filteredSupplies: EnrichedMedicalSupply[]
  /** Σ(quantity × buyPrice) across all in-stock supply shipments. */
  totalInventoryValue: number
  summary: SupplyUsageSummaryMetrics | null
}

/**
 * Computes the 5 KPI strip metrics for the Supplies Inventory tab
 * (design plan §6.3.1).
 *
 * Scope contract (mirrors P2-04 checklist item (a)):
 *  - `totalSupplies` / `lowStockCount` / `nearExpiryCount` and
 *    `totalInventoryValue` are **always unfiltered** — they describe the
 *    dataset, not the visible slice.
 *  - `turnoverRate` is the one intentionally selection-scoped metric:
 *    its denominator is the in-stock total of the **filtered** set, so
 *    filtering to a category answers "how fast is this selection
 *    moving?". The numerator is the global 30-day dispensed volume —
 *    `GET /api/pharmacy/medical-supply-usages/summary` is not
 *    filterable — so the rate is an approximation that leans on the
 *    selection's stock, which is what the card's hint promises.
 *
 * `totalInventoryValue` is sourced from `useSuppliesList`'s
 * client-side aggregate (Σ(quantity × buyPrice) across all
 * in-stock supply shipments). The backend's `/api/warehouse`
 * endpoint aggregates **drug** stock only — using it would
 * surface the wrong number on the supplies page.
 */
export function useSuppliesKpi({
  supplies,
  filteredSupplies,
  totalInventoryValue,
  summary,
}: SuppliesKpiInput): SuppliesKpi {
  return useMemo<SuppliesKpi>(() => {
    const totalSupplies = supplies.length
    const lowStockCount = supplies.filter((s) => s.isLowStock).length
    const nearExpiryCount = supplies.filter((s) => s.isNearExpiry).length

    const units30d = Number(summary?.totalUnitsDispensedLast30Days ?? 0)
    const selectedInStock = filteredSupplies.reduce(
      (sum, s) => sum + Number(s.totalQuantity ?? 0),
      0
    )
    const denominator = selectedInStock + units30d
    const turnoverRate =
      denominator > 0 ? Math.min(1, Math.max(0, units30d / denominator)) : 0

    return {
      totalSupplies,
      lowStockCount,
      nearExpiryCount,
      totalInventoryValue,
      turnoverRate,
    }
  }, [supplies, filteredSupplies, totalInventoryValue, summary])
}
