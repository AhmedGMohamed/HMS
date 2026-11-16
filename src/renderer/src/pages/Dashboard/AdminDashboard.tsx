"use client"

import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import {
  UsersIcon,
  DollarSignIcon,
  PillIcon,
  AlertTriangleIcon,
  RotateCcwIcon,
  TrendingUpIcon,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/common/EmptyState"
import { StatTileSkeleton } from "@/components/charts/StatTileSkeleton"
import { formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { useDashboardStats } from "./useDashboardStats"
import { KpiStrip } from "./KpiStrip"
import { RecentActivityTable } from "./RecentActivityTable"
import type { DashboardResourceError } from "./useDashboardStats"
import type { DashboardChartPoint } from "@/types"

/* Recharts must stay out of the dashboard route chunk. The
   `@/components/charts` barrel re-exports every wrapper (and with them
   `recharts`), so each chart is imported from its own module, lazily, and
   swapped in behind a same-size skeleton. */
const RevenueLineChart = lazy(() =>
  import("@/components/charts/RevenueLineChart").then((module) => ({
    default: module.RevenueLineChart,
  }))
)
const PatientServicesDonut = lazy(() =>
  import("@/components/charts/PatientServicesDonut").then((module) => ({
    default: module.PatientServicesDonut,
  }))
)

/**
 * Admin-only dashboard (Phase 6.1).
 *
 * Per Phase 6.1 plan: 5 KPI tiles, side-by-side charts, audit feed.
 * Non-admin users land on UserDashboard via DashboardPage branch
 * — this component never receives a non-admin user.
 *
 * Each section owns its failure: when a resource fails the page renders
 * an explicit error + retry for that section instead of zero-valued KPIs
 * or an empty chart that looks like real data.
 */

export function AdminDashboard() {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)
  const { stats, chartData, logs, loading, errors, refresh } =
    useDashboardStats()

  /* One money format on the page: the charts below use `formatCurrency`,
     so the KPI tiles must not concatenate `toLocaleString()`. */
  const money = (value: number) => formatCurrency(value, locale)

  const items = [
    {
      label: t("dashboard.metrics.activePatients"),
      value: stats?.activePatientsCount ?? 0,
      icon: <UsersIcon aria-hidden className="size-4" />,
      loading,
    },
    {
      label: t("dashboard.metrics.todayRevenue"),
      value: money(stats?.todayRevenue ?? 0),
      icon: <DollarSignIcon aria-hidden className="size-4" />,
      loading,
    },
    {
      label: t("dashboard.metrics.todayProfit"),
      value: money(stats?.todayProfit ?? 0),
      icon: <TrendingUpIcon aria-hidden className="size-4" />,
      loading,
    },
    {
      label: t("dashboard.metrics.lowStockAlerts"),
      value: stats?.lowStockItemsCount ?? 0,
      icon: <PillIcon aria-hidden className="size-4" />,
      loading,
    },
    {
      label: t("dashboard.metrics.expiringDrugs"),
      value: stats?.nearExpiryItemsCount ?? 0,
      icon: <AlertTriangleIcon aria-hidden className="size-4" />,
      loading,
    },
  ]

  const donutData = deriveDonut(chartData)
  const lineData = chartData.map<DashboardChartPoint>((p) => ({
    date: p.date,
    revenue: p.revenue,
    profit: p.profit,
    patientRevenue: p.patientRevenue,
    pharmacyRevenue: p.pharmacyRevenue,
    insuranceRevenue: p.insuranceRevenue,
    patientProfit: p.patientProfit,
    pharmacyProfit: p.pharmacyProfit,
    insuranceProfit: p.insuranceProfit,
  }))

  return (
    <div className="flex flex-col gap-6">
      {errors.stats ? (
        <DashboardErrorSlot
          title={t("errors.loadStatisticsError")}
          error={errors.stats}
          retry={refresh}
        />
      ) : (
        <KpiStrip items={items} columns={5} />
      )}

      {errors.chart ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.charts.revenueOverTime")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardErrorSlot
              title={t("errors.loadChartError")}
              error={errors.chart}
              retry={refresh}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.charts.revenueOverTime")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<StatTileSkeleton aspect="video" />}>
                <RevenueLineChart
                  data={lineData}
                  loading={loading && lineData.length === 0}
                  srSummary={t("dashboard.charts.revenueOverTime")}
                />
              </Suspense>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.charts.distribution")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<StatTileSkeleton aspect="square" />}>
                <PatientServicesDonut
                  data={donutData}
                  metric="revenue"
                  loading={loading && donutData.length === 0}
                  srSummary={t("dashboard.charts.distribution")}
                />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {errors.logs ? (
            <div className="p-4">
              <DashboardErrorSlot
                title={t("errors.loadActivityError")}
                error={errors.logs}
                retry={refresh}
              />
            </div>
          ) : (
            <RecentActivityTable logs={logs} loading={loading} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Error surface for one failed dashboard resource (failure ≠ empty). */
function DashboardErrorSlot({
  title,
  error,
  retry,
}: {
  title: string
  error: DashboardResourceError
  retry: () => void
}) {
  const { t } = useTranslation()

  return (
    <EmptyState
      live="alert"
      icon={<AlertTriangleIcon aria-hidden className="size-5" />}
      title={title}
      /* `NetworkError.message` is English; the localized key is the
         "check your connection" copy. */
      description={
        error.kind === "network" ? t("errors.networkError") : error.message
      }
      action={
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          <RotateCcwIcon aria-hidden className="me-1.5 size-4" />
          {t("common.refresh")}
        </Button>
      }
    />
  )
}

/**
 * Build the donut's per-category revenue from the chart series. The
 * chart series already aggregates daily totals across patient-,
 * pharmacy-, and insurance-services, so we total each dimension
 * across the 30-day window and feed the donut.
 */
function deriveDonut(chartData: DashboardChartPoint[]) {
  let patient = 0
  let pharmacy = 0
  let insurance = 0
  for (const p of chartData) {
    patient += p.patientRevenue
    pharmacy += p.pharmacyRevenue
    insurance += p.insuranceRevenue
  }
  return [
    { name: "Patient Services", value: patient },
    { name: "Pharmacy", value: pharmacy },
    { name: "Insurance", value: insurance },
  ]
}
