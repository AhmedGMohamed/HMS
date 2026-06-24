"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/errors"
import { useAuthStore } from "@/store/authStore"
import type {
  AuditLogRecord,
  DashboardChartPoint,
  DashboardStatistics,
} from "@/types"

export interface UseDashboardStatsResult {
  stats: DashboardStatistics | null
  chartData: DashboardChartPoint[]
  logs: AuditLogRecord[]
  loading: boolean
  /** When the endpoint denies (403) or fails, the graph is empty. */
  error: ApiError | null
}

/**
 * Loads the right set of dashboard endpoints depending on the user's
 * role (Phase 6.1 design contract):
 *
 *   - Admin role → admin-statistics + chart-data + logs/page/1.
 *   - Non-admin user → user-statistics only. KPIs + accessibility icons
 *     are still rendered; charts and audit logs are intentionally not
 *     fetched (per locked decision).
 *
 * On 403/404 the hook returns `error` instead of throwing — the
 * dashboard page can fall back to its "no data" rendering on resolve
 * of an empty stats object. The 401 case is handled inside `lib/api.ts`
 * (logout + redirect).
 */
export function useDashboardStats(): UseDashboardStatsResult {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === "Admin"

  const [stats, setStats] = useState<DashboardStatistics | null>(null)
  const [chartData, setChartData] = useState<DashboardChartPoint[]>([])
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    // Hand the loading flag to React eagerly so the chart/card
    // skeletons appear before the first byte of the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)

    const load = async (): Promise<void> => {
      try {
        const statsPath = isAdmin
          ? "/dashboard/admin-statistics"
          : "/dashboard/user-statistics"
        const statsRes = await api.get<DashboardStatistics>(statsPath)
        if (cancelled) return
        setStats(statsRes ?? null)

        if (isAdmin) {
          const [chartRes, logsRes] = await Promise.all([
            api.get<DashboardChartPoint[]>("/dashboard/chart-data"),
            api.get<AuditLogRecord[]>("/logs/page/1"),
          ])
          if (cancelled) return
          setChartData(chartRes ?? [])
          setLogs(logsRes ?? [])
        } else {
          // Locked decision: users don't see charts/audit. Releases
          // the Admin-only fetches without touching React state.
          setChartData([])
          setLogs([])
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError) {
          setError(err)
        }
        setStats(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user, isAdmin])

  return { stats, chartData, logs, loading, error }
}
