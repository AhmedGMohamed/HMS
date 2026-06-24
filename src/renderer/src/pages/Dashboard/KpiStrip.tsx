"use client"

import { StatCard, type StatCardProps } from "@/components/common/StatCard"

export interface KpiStripItem {
  /** Pre-translated label, e.g. `t('dashboard.metrics.activePatients')`. */
  label: string
  value: string | number
  icon?: React.ReactNode
  loading?: boolean
  /** Optional delta pill. Forwarded to `<StatCard>`. */
  delta?: StatCardProps["delta"]
}

export interface KpiStripProps {
  items: KpiStripItem[]
  /** 1..6 columns; layout collapses naturally on small viewports. */
  columns?: 2 | 3 | 4 | 5 | 6
  className?: string
}

const COL_CLASS: Record<NonNullable<KpiStripProps["columns"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
}

/**
 * Compact KPI row used by the Admin Dashboard.
 *
 * Phase 6.1 ships a single composition row for admin KPIs. Non-admin
 * users don't see this strip — they get the FeatureGrid-only
 * `UserDashboard` per locked Phase 6.1 decision.
 */
export function KpiStrip({
  items,
  columns = 4,
  className,
}: KpiStripProps) {
  return (
    <div className={`grid gap-4 ${COL_CLASS[columns]} ${className ?? ""}`}>
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          icon={item.icon}
          loading={item.loading}
          delta={item.delta}
        />
      ))}
    </div>
  )
}
