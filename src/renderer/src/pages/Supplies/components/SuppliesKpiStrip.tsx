"use client"

import { useTranslation } from "react-i18next"
import {
  BoxesIcon,
  AlertTriangleIcon,
  CalendarClockIcon,
  ActivityIcon,
  WalletIcon,
} from "lucide-react"

import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import { formatCurrency, formatNumber, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { KpiFilter } from "@/pages/Supplies/hooks/useSuppliesList"
import type { SuppliesKpi } from "@/pages/Supplies/hooks/useSuppliesKpi"

interface SuppliesKpiStripProps {
  kpi: SuppliesKpi
  loading?: boolean
  filter: KpiFilter
  onFilterChange: (f: KpiFilter) => void
}

/**
 * KPI strip for the Supplies Inventory tab (design plan §6.3.1).
 *
 * Five cards in a single responsive row:
 *  - Total Supplies       → neutral, click resets filter
 *  - Low Stock Alert      → warning when > 0, click toggles filter
 *  - Expiring Soon        → warning when > 0, click toggles filter
 *  - Monthly Turnover     → primary, NOT clickable (it's an
 *                            efficiency metric, not a filter)
 *  - Total Inventory Value → primary, click resets filter
 *
 * The grid is `grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4` so
 * 5-up renders from `xl` (1280px) and 2-up to `md` (768px). The
 * percentage value on the Turnover card uses tabular-nums.
 */
export function SuppliesKpiStrip({
  kpi,
  loading = false,
  filter,
  onFilterChange,
}: SuppliesKpiStripProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)

  const isLowStock = kpi.lowStockCount > 0
  const isNearExpiry = kpi.nearExpiryCount > 0
  const turnoverPct = (kpi.turnoverRate * 100).toFixed(1)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <EditorialKpiCard
        label={t("medicalSupplies.kpi.totalSupplies")}
        value={formatNumber(kpi.totalSupplies)}
        hint={t("medicalSupplies.kpi.totalSuppliesHint")}
        tone="neutral"
        active={filter === "all"}
        loading={loading}
        onClick={() => onFilterChange("all")}
        icon={<BoxesIcon aria-hidden className="size-4" />}
      />
      <EditorialKpiCard
        label={t("medicalSupplies.kpi.lowStock")}
        value={formatNumber(kpi.lowStockCount)}
        hint={
          isLowStock
            ? t("medicalSupplies.kpi.lowStockHintActive")
            : t("medicalSupplies.kpi.lowStockHintCalm")
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
        label={t("medicalSupplies.kpi.expiringSoon")}
        value={formatNumber(kpi.nearExpiryCount)}
        hint={
          isNearExpiry
            ? t("medicalSupplies.kpi.nearExpiryHintActive")
            : t("medicalSupplies.kpi.nearExpiryHintCalm")
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
        label={t("medicalSupplies.kpi.turnoverRate")}
        value={`${turnoverPct}%`}
        hint={t("medicalSupplies.kpi.turnoverRateHint")}
        tone="primary"
        loading={loading}
        icon={<ActivityIcon aria-hidden className="size-4" />}
      />
      <EditorialKpiCard
        label={t("medicalSupplies.kpi.totalValue")}
        value={formatCurrency(kpi.totalInventoryValue, resolveLocale(language))}
        hint={t("medicalSupplies.kpi.totalValueHint")}
        tone="primary"
        active={filter === "all"}
        loading={loading}
        onClick={() => onFilterChange("all")}
        icon={<WalletIcon aria-hidden className="size-4" />}
      />
    </div>
  )
}
