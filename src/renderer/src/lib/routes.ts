/**
 * Per-route permission metadata.
 *
 * `PermissionRoute` looks up the current path here and decides whether
 * the user is allowed. Keeping the table in one place ensures the
 * server (`page.routes.ts`) and the client stay aligned: if you add a
 * route here, you also need to add it on the server (or rely on the
 * server's 401/403 to surface).
 *
 * Routes marked `mode: "private"` are reachable by any authenticated
 * user. `mode: "permission"` further narrows access.
 *
 * Matching order:
 *   1. Exact match (e.g. `/patients` resolves the literal row).
 *   2. Longest prefix match where `path === pattern` OR
 *      `path.startsWith(pattern + "/")`. This covers parametric
 *      sub-routes (e.g. `/patients/123` matches `/patients`) without
 *      forcing a row per dynamic segment.
 *   3. Default: `{ mode: "private" }`.
 */
type RouteRequirement =
  | { mode: "public" }
  | { mode: "private" }
  | { mode: "permission"; permission: string }
  | { mode: "admin" }

interface RouteEntry {
  pattern: string
  requirement: RouteRequirement
}

const ROUTES: RouteEntry[] = [
  { pattern: "/login", requirement: { mode: "public" } },
  { pattern: "/dashboard", requirement: { mode: "private" } },

  { pattern: "/patients", requirement: { mode: "permission", permission: "view_patients" } },
  { pattern: "/drugs", requirement: { mode: "permission", permission: "manage_pharmacy" } },
  { pattern: "/supplies", requirement: { mode: "permission", permission: "manage_pharmacy" } },
  { pattern: "/employees", requirement: { mode: "permission", permission: "manage_employees" } },
  { pattern: "/doctors", requirement: { mode: "permission", permission: "manage_employees" } },
  { pattern: "/clocking", requirement: { mode: "permission", permission: "manage_clocking" } },
  { pattern: "/vault", requirement: { mode: "permission", permission: "view_vault" } },
  { pattern: "/insurance", requirement: { mode: "permission", permission: "manage_insurance" } },
  { pattern: "/reports", requirement: { mode: "permission", permission: "view_reports" } },
  { pattern: "/services", requirement: { mode: "permission", permission: "manage_services" } },
  { pattern: "/price-lists", requirement: { mode: "permission", permission: "manage_prices" } },

  { pattern: "/admin/users", requirement: { mode: "admin" } },
  { pattern: "/admin/roles", requirement: { mode: "admin" } },
]

export function findRouteRequirement(path: string): RouteRequirement {
  /* 1. Exact match wins. */
  const exact = ROUTES.find((r) => r.pattern === path)
  if (exact) return exact.requirement

  /* 2. Longest prefix match. We avoid `/patients` matching `/patientsx`
     by requiring either equality OR a trailing slash separator after
     the registered pattern. */
  const prefixes = ROUTES.filter(
    (r) => path === r.pattern || path.startsWith(r.pattern + "/")
  )
  if (prefixes.length === 0) return { mode: "private" }
  const best = prefixes.sort((a, b) => b.pattern.length - a.pattern.length)[0]
  return best.requirement
}

export type { RouteRequirement }
