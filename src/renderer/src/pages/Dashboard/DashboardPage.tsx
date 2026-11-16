"use client"

import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/common/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTileSkeleton } from "@/components/charts/StatTileSkeleton"
import { useAuthStore } from "@/store/authStore"
import { UserDashboard } from "./UserDashboard"

/**
 * The admin dashboard (and with it every chart module) is split into its
 * own async chunk: `DashboardPage` is the entry route for *all* roles, so
 * a static import here would ship `recharts` to non-admin users who never
 * draw a chart.
 */
const AdminDashboard = lazy(() =>
  import("./AdminDashboard").then((module) => ({
    default: module.AdminDashboard,
  }))
)

/**
 * /dashboard (Phase 6.1).
 *
 * Routes between `<AdminDashboard>` and `<UserDashboard>` based on the
 * auth store's user role. Per the locked Phase 6.1 decision:
 *   - Admin  → 5 KPI tiles, Revenue + Donut charts, Recent Activity.
 *   - Any other authenticated user → FeatureGrid of permitted modules.
 *
 * A user with no role match (e.g. token revoked, storage cleared)
 * briefly renders the page header only — `PrivateRoute`'s effect
 * routes them back to the login screen.
 */
export default function DashboardPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === "Admin"
  const username = user?.name ?? user?.username ?? ""

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="HMS"
        title={t("dashboard.welcome", { name: username })}
        subtitle={t("dashboard.subtitle")}
      />

      {isAdmin ? (
        <Suspense fallback={<AdminDashboardFallback />}>
          <AdminDashboard />
        </Suspense>
      ) : (
        <UserDashboard />
      )}
    </div>
  )
}

/** Matches the admin grid's boxes so the async chunk swap does not shift layout. */
function AdminDashboardFallback() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <StatTileSkeleton aspect="video" />
        <StatTileSkeleton aspect="square" />
      </div>
    </div>
  )
}
