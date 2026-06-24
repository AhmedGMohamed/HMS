/**
 * Shared renderer types.
 *
 * This file is the single source of truth for cross-module shapes:
 * the Auth shape used by both the auth store and the API contract,
 * the navigation tree rendered by the sidebar, and the generic
 * paginated envelope used by every DataTable in the app.
 *
 * Domain types (Patient, Bill, Drug, Employee, etc.) are colocated
 * with their consumption in the relevant `pages/<Module>/types.ts`
 * (declared during Phase 6 migration). Adding a new domain type
 * elsewhere is a code smell.
 */

/* ----------------------------------------------------------------
   Auth
   ---------------------------------------------------------------- */

export type Role = "Admin" | (string & {})

export interface User {
  userId: number
  username: string
  name?: string
  role: Role
  permissions: string[]
}

/* ----------------------------------------------------------------
   Navigation
   ---------------------------------------------------------------- */

export type IconName = string

export interface NavigationItem {
  id: string
  /** i18n key — fed to useTranslation().t() at render time */
  label: string
  /** Lucide icon component name resolved via dynamic-import helper */
  icon: IconName
  url?: string
  /** If set, only users with this permission see the entry */
  permission?: string
  /** If set, only users matching this role see the entry */
  role?: Role
  /** Nested entries (rendered inside a Collapsible) */
  children?: NavigationItem[]
}

/* ----------------------------------------------------------------
   API pagination envelope
   ---------------------------------------------------------------- */

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * Loose result envelope returned by some endpoints.
 * Renderer uses this only as a fallback; prefer typed endpoints.
 */
export interface ApiResult<T> {
  success: boolean
  data?: T
  error?: string
}

/* ----------------------------------------------------------------
   Bilingual name — used by domain entities (Patient, Service,
   Insurance Company, etc.) where both Arabic & English names are
   stored. Renders gracefully when either side is missing.
   ---------------------------------------------------------------- */

export interface BilingualName {
  ar?: string
  en?: string
}

/* ----------------------------------------------------------------
   Common domain snippets (lightweight — phase 6 will codify
   per-page domain types separately)
   ---------------------------------------------------------------- */

export type AuditStatus = "active" | "inactive" | "pending" | "archived"

export interface Auditable {
  createdAt?: string
  updatedAt?: string
  createdBy?: number
}

/* ----------------------------------------------------------------
   Dashboard
   Mirrors the server-side contract in
   `src/app/utils/types/dashboard.d.ts`. All field names are
   camelCase because the renderer auto-maps snake_case keys at the
   `lib/api.ts` boundary. `todayInsurancePayments` is optional in the
   user-statistics projection; admins always receive a number.
   ---------------------------------------------------------------- */

export interface DashboardStatistics {
  activePatientsCount: number
  todayRevenue: number
  todayProfit: number
  lowStockItemsCount: number
  nearExpiryItemsCount: number
  todayInsurancePayments?: number
}

/** 30-day revenue + profit breakdown per day. */
export interface DashboardChartPoint {
  /** ISO `YYYY-MM-DD` so axis rendering is timezone-agnostic. */
  date: string
  revenue: number
  profit: number
  patientRevenue: number
  pharmacyRevenue: number
  insuranceRevenue: number
  patientProfit: number
  pharmacyProfit: number
  insuranceProfit: number
}

/** Audit-log entry used by the dashboard recent-activity widget. */
export interface AuditLogRecord {
  logId: number
  userId: number
  actionType: string
  details: {
    url?: string
    description?: string
    params?: Record<string, unknown>
    query?: Record<string, unknown>
    body?: unknown
  }
  /** ISO datetime. */
  timestamp: string
  username?: string
}

/* ----------------------------------------------------------------
   Domain enums for the Login flow.
   ---------------------------------------------------------------- */

export type LoginErrorKind =
  | "invalid-credentials"
  | "rate-limited"
  | "network"
  | "server-error"
