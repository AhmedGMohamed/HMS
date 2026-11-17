"use client"

import { useTranslation } from "react-i18next"
import { AlertTriangleIcon, Building2, RotateCcwIcon } from "lucide-react"

import { StatCard } from "@/components/common/StatCard"
import { DynamicIcon } from "@/components/common/DynamicIcon"
import { EmptyState } from "@/components/common/EmptyState"
import { Button } from "@/components/ui/button"

import { useAuthStore } from "@/store/authStore"
import { filterNavForUser, NAV_CONFIG } from "@/lib/navigation"
import { useMemo } from "react"
import { useDashboardStats } from "./useDashboardStats"

/**
 * Non-admin landing (Phase 6.1).
 *
 * Per the locked decision: this view contains only the FeatureGrid —
 * no KPI tiles, no charts, no audit-log feed. The StatCard harness is
 * reused as a link-card with `href`; the `value` slot is intentionally
 * empty and we lean on the icon + label + footer to communicate what
 * the tile does.
 */
export function UserDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  /* Role-aware hook: for non-admins this fetches `/dashboard/user-statistics`.
     Its per-resource error slot is what makes a failed load visible instead
     of silently rendering an empty workspace. */
  const { errors, refresh } = useDashboardStats()

  const items = useMemo(() => {
    const filtered = filterNavForUser(NAV_CONFIG, user)
    // Skip the dashboard itself — a tile linking to where the user
    // already is has no value, and we want the grid to feel like a
    // workspace shortcut launcher.
    return filtered
      .filter((item) => item.url && item.url !== "/dashboard")
      .map((item) => ({
        id: item.id,
        url: item.url!,
        labelKey: item.label,
        iconName: item.icon,
      }))
  }, [user])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Building2 aria-hidden className="size-5" />}
        title={t("dashboard.userDashboard.noFeatures")}
        description={t("dashboard.userDashboard.description")}
      />
    )
  }

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      {errors.stats ? (
        <EmptyState
          live="alert"
          icon={<AlertTriangleIcon aria-hidden className="size-5" />}
          title={t("errors.loadStatisticsError")}
          /* Same discriminant as AdminDashboard: only transport failures get
             the localized connection copy; API errors keep the server text. */
          description={
            errors.stats.kind === "network"
              ? t("errors.networkError")
              : errors.stats.message
          }
          action={
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RotateCcwIcon aria-hidden className="me-1.5 size-4" />
              {t("common.refresh")}
            </Button>
          }
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <StatCard
            key={item.id}
            href={item.url}
            label={t(item.labelKey)}
            value=""
            icon={<DynamicIcon name={item.iconName} />}
            footer={t(`dashboard.featureDescriptions.${item.id}`, {
              defaultValue: "",
            })}
          />
        ))}
      </div>
    </div>
  )
}
