"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { ApiError, isNetworkError } from "@/lib/errors"
import { useAuthStore } from "@/store/authStore"
import type {
  AuditLogRecord,
  DashboardChartPoint,
  DashboardStatistics,
} from "@/types"

/**
 * One dashboard resource failure, normalized so callers never have to
 * care whether the transport failed, the API answered with an error, or
 * something unexpected was thrown.
 *
 * `kind: "network"` means no HTTP response exists (`NetworkError`,
 * statusCode 0) — its `message` is the English "Network request failed",
 * so the page must render `errors.networkError` instead.
 */
export interface DashboardResourceError {
  kind: "network" | "api" | "unknown"
  message: string
  statusCode?: number
}

/** One error slot per independently-loaded resource. */
export interface DashboardErrors {
  stats: DashboardResourceError | null
  chart: DashboardResourceError | null
  logs: DashboardResourceError | null
}

export interface UseDashboardStatsResult {
  stats: DashboardStatistics | null
  chartData: DashboardChartPoint[]
  logs: AuditLogRecord[]
  loading: boolean
  /** `null` per slot means that resource loaded (or was never requested). */
  errors: DashboardErrors
  /** Retry all three resources (the page's error surfaces call this). */
  refresh: () => void
}

const NO_ERRORS: DashboardErrors = { stats: null, chart: null, logs: null }

function toResourceError(error: unknown): DashboardResourceError {
  if (isNetworkError(error)) {
    return {
      kind: "network",
      message: error.message,
      statusCode: error.statusCode,
    }
  }
  if (error instanceof ApiError) {
    return {
      kind: "api",
      message: error.message,
      statusCode: error.statusCode,
    }
  }
  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : String(error),
  }
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
 * The three admin resources are independent and load concurrently.
 * Every failure is normalized (`isNetworkError` → `kind: "network"`) and
 * recorded in its **own** slot: one failing resource neither blanks the
 * others nor leaves a zeroed payload behind, so the page can render an
 * error/retry surface for that section while the rest keeps its data.
 * The 401 case is handled inside `lib/api.ts` (logout + redirect).
 */
export function useDashboardStats(): UseDashboardStatsResult {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === "Admin"

  const [stats, setStats] = useState<DashboardStatistics | null>(null)
  const [chartData, setChartData] = useState<DashboardChartPoint[]>([])
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  /* Starts `true`: the first paint must be skeletons, never a flash of
     "0 patients / 0 revenue" before the request even starts. */
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<DashboardErrors>(NO_ERRORS)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false)
      return
    }

    let cancelled = false
    // Hand the loading flag to React eagerly so the chart/card
    // skeletons appear before the first byte of the response.
    setLoading(true)
    setErrors(NO_ERRORS)

    const load = async (): Promise<void> => {
      const statsPath = isAdmin
        ? "/dashboard/admin-statistics"
        : "/dashboard/user-statistics"

      /* allSettled (not all): a denying chart endpoint must not discard a
         successfully loaded KPI payload. */
      const [statsResult, chartResult, logsResult] = await Promise.allSettled([
        api.get<DashboardStatistics>(statsPath),
        isAdmin
          ? api.get<DashboardChartPoint[]>("/dashboard/chart-data")
          : Promise.resolve<DashboardChartPoint[]>([]),
        isAdmin
          ? api.get<AuditLogRecord[]>("/logs/page/1")
          : Promise.resolve<AuditLogRecord[]>([]),
      ])
      if (cancelled) return

      setStats(
        statsResult.status === "fulfilled" ? (statsResult.value ?? null) : null
      )
      setChartData(
        chartResult.status === "fulfilled" ? (chartResult.value ?? []) : []
      )
      setLogs(logsResult.status === "fulfilled" ? (logsResult.value ?? []) : [])
      setErrors({
        stats:
          statsResult.status === "rejected"
            ? toResourceError(statsResult.reason)
            : null,
        chart:
          chartResult.status === "rejected"
            ? toResourceError(chartResult.reason)
            : null,
        logs:
          logsResult.status === "rejected"
            ? toResourceError(logsResult.reason)
            : null,
      })
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user, isAdmin, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { stats, chartData, logs, loading, errors, refresh }
}
