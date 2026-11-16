"use client"

import { useTranslation } from "react-i18next"
import {
  BadgeCheckIcon,
  BanknoteIcon,
  CheckCircleIcon,
  HistoryIcon,
  ReceiptIcon,
  TriangleAlertIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import {
  formatCurrency,
  formatDate,
  formatNumber,
  resolveLocale,
} from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { InsuranceStatistics } from "@/pages/Insurance/types/insurance"

export interface StatisticsKpiStripProps {
  statistics: InsuranceStatistics | null
  lastClearedDate: string | null
  loading: boolean
  onClearBalance: () => void
  onViewPayments: () => void
}

/**
 * "Statistics & Actions" panel of the detail view (Phase 6.10 plan §3).
 *
 * Eight KPI tiles mirror the legacy `displayInsuranceStatistics` grid —
 * the four marked `*` in the legacy copy (total billed, patient paid,
 * outstanding, net outstanding) only cover charges **after** the last
 * cleared date. Instead of reusing `insurance.messages.reportNote` as a
 * fake footnote (legacy behaviour, plan §5 #4), the caveat is stated in
 * plain language beneath the strip, together with the payment-coverage
 * percentage.
 */
export function StatisticsKpiStrip({
  statistics,
  lastClearedDate,
  loading,
  onClearBalance,
  onViewPayments,
}: StatisticsKpiStripProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)

  const money = (value: number) => formatCurrency(value, locale)
  const clearedDate = lastClearedDate
    ? formatDate(new Date(lastClearedDate), language)
    : "-"

  const stats = statistics

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {t("insurance.statisticsActions")}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <EditorialKpiCard
          label={t("insurance.statistics.totalPatients")}
          value={formatNumber(stats?.totalPatients ?? 0)}
          loading={loading}
          icon={<UsersIcon className="size-4" />}
        />
        <EditorialKpiCard
          label={t("insurance.statistics.activePatients")}
          value={formatNumber(stats?.activePatients ?? 0)}
          loading={loading}
          tone="primary"
          icon={<BadgeCheckIcon className="size-4" />}
        />
        <EditorialKpiCard
          label={t("insurance.statistics.currentAdmissions")}
          value={formatNumber(stats?.currentAdmissions ?? 0)}
          loading={loading}
          tone="primary"
          icon={<CheckCircleIcon className="size-4" />}
        />
        <EditorialKpiCard
          label={`${t("insurance.statistics.totalRevenue")} *`}
          value={money(stats?.totalBilled ?? 0)}
          loading={loading}
          icon={<ReceiptIcon className="size-4" />}
        />
        <EditorialKpiCard
          label={t("insurance.statistics.totalPayments")}
          value={money(stats?.totalInsurancePayments ?? 0)}
          loading={loading}
          tone="primary"
          icon={<BanknoteIcon className="size-4" />}
        />
        <EditorialKpiCard
          label={`${t("insurance.statistics.patientPaidAmount")} *`}
          value={money(stats?.totalPaid ?? 0)}
          loading={loading}
          icon={<WalletIcon className="size-4" />}
        />
        <EditorialKpiCard
          label={`${t("insurance.statistics.outstandingBalance")} *`}
          value={money(stats?.totalOutstanding ?? 0)}
          loading={loading}
          tone="warning"
          icon={<TriangleAlertIcon className="size-4" />}
        />
        <EditorialKpiCard
          label={t("insurance.statistics.outstandingBalance")}
          value={money(stats?.netOutstanding ?? 0)}
          loading={loading}
          tone={(stats?.netOutstanding ?? 0) > 0 ? "danger" : "neutral"}
          icon={<HistoryIcon className="size-4" />}
        />
      </div>

      <Alert className="border-warning/40 bg-warning-light/40">
        <TriangleAlertIcon aria-hidden className="text-warning" />
        <AlertDescription className="space-y-1">
          <p>
            {t("insurance.statistics.postClearNote", { date: clearedDate })}
          </p>
          <p>
            {t("insurance.statistics.paymentCoverage")}:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {(stats?.paymentCoveragePercentage ?? 0).toFixed(1)}%
            </span>
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onClearBalance}>
          <CheckCircleIcon aria-hidden className="me-1.5 size-4" />
          {t("insurance.buttons.clearBalance")}
        </Button>
        <Button type="button" variant="outline" onClick={onViewPayments}>
          <HistoryIcon aria-hidden className="me-1.5 size-4" />
          {t("insurance.buttons.viewPayments")}
        </Button>
      </div>
    </section>
  )
}
