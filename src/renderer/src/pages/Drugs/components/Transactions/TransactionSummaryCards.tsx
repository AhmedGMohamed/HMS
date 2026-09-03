"use client"

import { useTranslation } from "react-i18next"
import { ReceiptIcon, WalletIcon, BoxesIcon } from "lucide-react"

import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import { formatNumber, formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { TransactionSummary } from "@/pages/Drugs/types/drug"

interface TransactionSummaryCardsProps {
  summary: TransactionSummary | null
  loading: boolean
}

/**
 * Summary metrics for the filtered transactions (§6.6):
 * Total Sales · Total Revenue · Total Units Sold.
 *
 * Uses the *Editorial Medical* KPI card to keep the Transactions tab
 * visually consistent with the Inventory strip.
 */
export function TransactionSummaryCards({
  summary,
  loading,
}: TransactionSummaryCardsProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)

  const transactionCount = Number(summary?.transactionCount ?? 0)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <EditorialKpiCard
        label={t("pharmacy.transactions.totalSales")}
        value={formatNumber(transactionCount)}
        hint={t("pharmacy.transactions.totalSalesHint", {
          count: transactionCount,
          defaultValue: "transactions in this range",
        })}
        tone="neutral"
        loading={loading}
        icon={<ReceiptIcon aria-hidden className="size-4" />}
      />
      <EditorialKpiCard
        label={t("pharmacy.transactions.totalRevenue")}
        value={formatCurrency(
          Number(summary?.totalSales ?? 0),
          resolveLocale(language)
        )}
        hint={t("pharmacy.transactions.totalRevenueHint", {
          defaultValue: "Sum of sale prices",
        })}
        tone="primary"
        loading={loading}
        icon={<WalletIcon aria-hidden className="size-4" />}
      />
      <EditorialKpiCard
        label={t("pharmacy.transactions.totalUnits")}
        value={formatNumber(Number(summary?.totalQuantity ?? 0))}
        hint={t("pharmacy.transactions.totalUnitsHint", {
          defaultValue: "Items sold in this range",
        })}
        tone="neutral"
        loading={loading}
        icon={<BoxesIcon aria-hidden className="size-4" />}
      />
    </div>
  )
}