"use client"

import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/common/PageHeader"
import { useAuthStore } from "@/store/authStore"
import { AdminDashboard } from "./AdminDashboard"
import { UserDashboard } from "./UserDashboard"

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

      {isAdmin ? <AdminDashboard /> : <UserDashboard />}
    </div>
  )
}
