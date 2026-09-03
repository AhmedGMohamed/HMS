"use client"

import { useTranslation } from "react-i18next"
import { BoxesIcon, ActivityIcon, UsersIcon } from "lucide-react"

import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import { formatNumber } from "@/lib/utils"
import type { SupplyUsageSummaryMetrics } from "@/pages/Supplies/types/supply"

interface UsageSummaryCardsProps {
  summary: SupplyUsageSummaryMetrics | null
  loading: boolean
}

/**
 * Three EditorialKpiCards for the Usage History tab (design plan
 * §6.3.3). Mirrors `TransactionSummaryCards` from the Drugs page
 * but the metrics are supply-specific.
 */
export function UsageSummaryCards({ summary, loading }: UsageSummaryCardsProps) {
  const { t } = useTranslation()
  const activeUsagesCount = Number(summary?.activeUsagesCount ?? 0)
  const isActive = activeUsagesCount > 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <EditorialKpiCard
        label={t("medicalSupplies.usage.totalUnits")}
        value={formatNumber(Number(summary?.totalUnitsDispensedAllTime ?? 0))}
        hint={t("medicalSupplies.usage.totalUnitsHint", {
          defaultValue: "Across all time and patients",
        })}
        tone="primary"
        loading={loading}
        icon={<BoxesIcon aria-hidden className="size-4" />}
      />
      <EditorialKpiCard
        label={t("medicalSupplies.usage.activeTreatments")}
        value={formatNumber(activeUsagesCount)}
        hint={
          isActive
            ? t("medicalSupplies.usage.activeTreatmentsHint", {
                defaultValue: "Ongoing continuous treatments",
              })
            : t("medicalSupplies.usage.activeTreatmentsCalm", {
                defaultValue: "No active ongoing treatments",
              })
        }
        tone={isActive ? "warning" : "neutral"}
        loading={loading}
        icon={<ActivityIcon aria-hidden className="size-4" />}
      />
      <EditorialKpiCard
        label={t("medicalSupplies.usage.patientsServed")}
        value={formatNumber(Number(summary?.totalPatientsServed ?? 0))}
        hint={t("medicalSupplies.usage.patientsServedHint", {
          defaultValue: "Distinct patient count",
        })}
        tone="neutral"
        loading={loading}
        icon={<UsersIcon aria-hidden className="size-4" />}
      />
    </div>
  )
}
