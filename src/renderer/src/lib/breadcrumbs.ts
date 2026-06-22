/**
 * Path → breadcrumb resolver.
 *
 * Crumbs are built bottom-up: each segment in the URL either matches a
 * known `ROUTES` pattern (which gives an i18n key directly), falls through
 * to a parametric placeholder (e.g. `/patients/123` → `breadcrumb.detail`),
 * or is dropped if the route map has nothing to say about it.
 *
 * The last crumb is rendered as a non-navigable `<BreadcrumbPage>` by
 * the consuming component; we still emit its path so consumers can
 * decide. Unknown routes produce a single crumb with `common.record`
 * so we never show a blank-ish breadcrumb.
 */
import { findRouteRequirement } from "./routes"

export interface Crumb {
  /** Path the crumb navigates to (always absolute, never `undefined`). */
  path: string
  /** i18n key fed to `useTranslation().t()`. */
  labelKey: string
}

/**
 * Static lookup of `dashboard`-prefixed fallback crumbs that the route
 * table does not yet provide. Kept thin — every new module lands here
 * with the rest of its route metadata in `routes.ts`.
 */
const SIMPLE_CRUMBS: Record<string, string> = {
  "/dashboard": "sidebar.dashboard",
  "/patients": "sidebar.patients",
  "/drugs": "sidebar.drugs",
  "/supplies": "sidebar.supplies",
  "/employees": "sidebar.employees",
  "/doctors": "sidebar.doctors",
  "/clocking": "sidebar.clocking",
  "/vault": "sidebar.vault",
  "/insurance": "sidebar.insurance",
  "/reports": "sidebar.reports",
  "/services": "sidebar.services",
  "/price-lists": "sidebar.priceLists",
  "/admin": "breadcrumbs.admin",
  "/admin/users": "breadcrumbs.adminUsers",
  "/admin/roles": "breadcrumbs.adminRoles",
}

function getLabelKey(path: string): string | null {
  if (SIMPLE_CRUMBS[path]) return SIMPLE_CRUMBS[path]
  const req = findRouteRequirement(path)
  if (req.mode === "admin") return "breadcrumbs.admin"
  return null
}

function isNumericOrId(segment: string): boolean {
  return /^\d+$/.test(segment) || /^[0-9a-f-]{8,}$/i.test(segment)
}

/**
 * Ellipsize middle crumbs when the chain gets too long. The first and
 * last are always kept; everything in between collapses to a single
 * ellipsis crumb pointing at the last-but-(n-2) position so the user
 * can still click "back" to a sensible intermediate.
 */
function compact(crumbs: Crumb[], max = 4): Crumb[] {
  if (crumbs.length <= max) return crumbs
  const head = crumbs[0]!
  const tail = crumbs.slice(-2)
  return [
    head,
    { path: crumbs[crumbs.length - 3]?.path ?? head.path, labelKey: "breadcrumbs.ellipsis" },
    ...tail,
  ]
}

export function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) {
    return [{ path: "/dashboard", labelKey: "sidebar.dashboard" }]
  }

  const crumbs: Crumb[] = []
  let acc = ""
  for (const seg of segments) {
    acc += `/${seg}`
    const exact = getLabelKey(acc)
    if (exact) {
      crumbs.push({ path: acc, labelKey: exact })
      continue
    }
    if (isNumericOrId(seg)) {
      crumbs.push({ path: acc, labelKey: "breadcrumb.detail" })
      continue
    }
    // Unknown segment — derive from the current accumulated path's route
    // requirement, and if even that is unknown, fall back to a generic
    // record label so the breadcrumb still renders gracefully.
    const req = findRouteRequirement(acc)
    if (req.mode !== "private") {
      crumbs.push({ path: acc, labelKey: "common.record" })
    }
  }

  // Always prepend the Dashboard root so a deep URL still feels rooted.
  const result: Crumb[] = [
    { path: "/dashboard", labelKey: "sidebar.dashboard" },
    ...crumbs.filter((c) => c.path !== "/dashboard"),
  ]

  return compact(result)
}
