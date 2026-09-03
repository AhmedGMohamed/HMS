"use client"

import { useTranslation } from "react-i18next"
import {
  PillIcon,
  AlertTriangleIcon,
  CalendarClockIcon,
  WalletIcon,
} from "lucide-react"

import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import { formatCurrency, formatNumber, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { PharmacyKpi } from "@/pages/Drugs/hooks/usePharmacyKpi"
import type { KpiFilter } from "@/pages/Drugs/hooks/useDrugsList"

interface PharmacyKpiStripProps {
  kpi: PharmacyKpi
  loading?: boolean
  filter: KpiFilter
  onFilterChange: (f: KpiFilter) => void
}

/**
 * KPI strip (§6.2) — *Editorial Medical* variant.
 *
 * Four large-numeral cards arranged in a single typographic row.
 * Tapping a card toggles the corresponding filter. The active card
 * is telegraphed three ways: a saturated left rail, a thicker rule,
 * and a faint inset tint — so the filter state is readable without
 * reading the label again.
 *
 * Composition rules (design.md §6.2):
 *  - Total Drugs / Total Value → neutral rail, "—" returns to "all".
 *  - Low Stock / Expiring Soon → warning rail, click toggles filter.
 */
export function PharmacyKpiStrip({
  kpi,
  loading = false,
  filter,
  onFilterChange,
}: PharmacyKpiStripProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)

  const isLowStock = kpi.lowStockCount > 0
  const isNearExpiry = kpi.nearExpiryCount > 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <EditorialKpiCard
        label={t("pharmacy.kpi.totalDrugs")}
        value={formatNumber(kpi.totalDrugs)}
        hint={t("pharmacy.kpi.totalDrugsHint", {
          defaultValue: "Across all warehouses",
        })}
        tone="neutral"
        active={filter === "all"}
        loading={loading}
        onClick={() => onFilterChange("all")}
        icon={<PillIcon aria-hidden className="size-4" />}
      />
      <EditorialKpiCard
        label={t("pharmacy.kpi.lowStock")}
        value={formatNumber(kpi.lowStockCount)}
        hint={
          isLowStock
            ? t("pharmacy.kpi.lowStockHintActive", {
              defaultValue: "Tap to view only these",
            })
            : t("pharmacy.kpi.lowStockHintCalm", {
              defaultValue: "All drugs above their threshold",
            })
        }
        tone={isLowStock ? "warning" : "neutral"}
        active={filter === "low-stock"}
        loading={loading}
        onClick={() =>
          onFilterChange(filter === "low-stock" ? "all" : "low-stock")
        }
        icon={<AlertTriangleIcon aria-hidden className="size-4" />}
        annotation={isLowStock ? "!" : undefined}
      />
      <EditorialKpiCard
        label={t("pharmacy.kpi.expiringSoon")}
        value={formatNumber(kpi.nearExpiryCount)}
        hint={
          isNearExpiry
            ? t("pharmacy.kpi.nearExpiryHintActive", {
              defaultValue: "Expiring within alert window",
            })
            : t("pharmacy.kpi.nearExpiryHintCalm", {
              defaultValue: "No drugs near expiry",
            })
        }
        tone={isNearExpiry ? "warning" : "neutral"}
        active={filter === "near-expiry"}
        loading={loading}
        onClick={() =>
          onFilterChange(filter === "near-expiry" ? "all" : "near-expiry")
        }
        icon={<CalendarClockIcon aria-hidden className="size-4" />}
        annotation={isNearExpiry ? "!" : undefined}
      />
      <EditorialKpiCard
        label={t("pharmacy.kpi.totalValue")}
        value={formatCurrency(kpi.totalInventoryValue, resolveLocale(language))}
        hint={t("pharmacy.kpi.totalValueHint", {
          defaultValue: "Sum of warehouse stock × buy price",
        })}
        tone="primary"
        active={filter === "all"}
        loading={loading}
        onClick={() => onFilterChange("all")}
        icon={<WalletIcon aria-hidden className="size-4" />}
      />
    </div>
  )
}