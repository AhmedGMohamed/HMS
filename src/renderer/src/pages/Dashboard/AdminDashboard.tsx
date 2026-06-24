"use client"

import { useTranslation } from "react-i18next"
import {
  UsersIcon,
  DollarSignIcon,
  PillIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/common/EmptyState"
import {
  RevenueLineChart,
  PatientServicesDonut,
} from "@/components/charts"
import { useDashboardStats } from "./useDashboardStats"
import { KpiStrip } from "./KpiStrip"
import { RecentActivityTable } from "./RecentActivityTable"
import type { DashboardChartPoint } from "@/types"

/**
 * Admin-only dashboard (Phase 6.1).
 *
 * Per Phase 6.1 plan: 5 KPI tiles, side-by-side charts, audit feed.
 * Non-admin users land on UserDashboard via DashboardPage branch
 * — this component never receives a non-admin user.
 */

export function AdminDashboard() {
  const { t } = useTranslation()
  const { stats, chartData, logs, loading, error } = useDashboardStats()

  const items = [
    {
      label: t("dashboard.metrics.activePatients"),
      value: stats?.activePatientsCount ?? 0,
      icon: <UsersIcon aria-hidden className="size-4" />,
      loading,
    },
    {
      label: t("dashboard.metrics.todayRevenue"),
      value: t("common.currency") + " " + (stats?.todayRevenue ?? 0).toLocaleString(),
      icon: <DollarSignIcon aria-hidden className="size-4" />,
      loading,
    },
    {
      label: t("dashboard.metrics.todayProfit"),
      value: t("common.currency") + " " + (stats?.todayProfit ?? 0).toLocaleString(),
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
      <KpiStrip items={items} columns={5} />

      {!loading && error ? (
        <EmptyState
          icon={<AlertTriangleIcon aria-hidden className="size-5" />}
          title={t("errors.loadDashboardError")}
          description={error.message}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.charts.revenueOverTime")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueLineChart
                data={lineData}
                loading={loading && lineData.length === 0}
                srSummary={t("dashboard.charts.revenueOverTime")}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.charts.distribution")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PatientServicesDonut
                data={donutData}
                metric="revenue"
                loading={loading && donutData.length === 0}
                srSummary={t("dashboard.charts.distribution")}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <RecentActivityTable logs={logs} loading={loading} />
        </CardContent>
      </Card>
    </div>
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
