/**
 * Per-route permission metadata.
 *
 * `PermissionRoute` looks up the current path here and decides whether
 * the user is allowed. Keeping the table in one place ensures the
 * server (`page.routes.ts`) and the client stay aligned: if you add a
 * route here, you also need to add it on the server (or rely on the
 * server's 401/403 to surface).
 *
 * Routes marked `private: true` are reachable by any authenticated user.
 * `adminOnly: true` restricts to the Admin role. `permission` further
 * narrows access. Multiple matches (root paths) are fine — first match
 * wins.
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
  const match = ROUTES.find((r) => r.pattern === path)
  return match?.requirement ?? { mode: "private" }
}

export type { RouteRequirement }
