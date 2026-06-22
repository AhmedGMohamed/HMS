import type { NavigationItem, User } from "@/types"

/**
 * Sidebar navigation source of truth.
 *
 * Mirrors `src/app/controllers/Navigation.controller.ts` so the client
 * can render the same visibility-filtered tree without an extra round
 * trip to `/navigation`. Updates live alongside the server list whenever
 * a module is added or removed from routes.
 *
 * Icons are Lucide React component names — resolved at render time by
 * the Sidebar (Phase 3) via a dynamic icon-map lookup.
 *
 * `label` is an i18n key fed to `useTranslation().t()`. Per Decision #10
 * the `nurses` entry is intentionally omitted.
 */
export const NAV_CONFIG: NavigationItem[] = [
  {
    id: "dashboard",
    label: "sidebar.dashboard",
    icon: "LayoutDashboard",
    url: "/dashboard",
  },
  {
    id: "user_management",
    label: "sidebar.userManagement",
    icon: "Users",
    role: "Admin",
    children: [
      {
        id: "users",
        label: "sidebar.users",
        icon: "User",
        url: "/admin/users",
      },
      {
        id: "roles",
        label: "sidebar.roles",
        icon: "Shield",
        url: "/admin/roles",
      },
    ],
  },
  {
    id: "patients",
    label: "sidebar.patients",
    icon: "Hospital",
    url: "/patients",
    permission: "manage_patients",
  },
  {
    id: "employees",
    label: "sidebar.employees",
    icon: "BadgeCheck",
    url: "/employees",
    permission: "manage_employees",
  },
  {
    id: "clocking",
    label: "sidebar.clocking",
    icon: "Clock",
    url: "/clocking",
    permission: "manage_clocking",
  },
  {
    id: "services",
    label: "sidebar.services",
    icon: "HeartPulse",
    url: "/services",
    permission: "manage_services",
  },
  {
    id: "drugs",
    label: "sidebar.drugs",
    icon: "Pill",
    url: "/drugs",
    permission: "manage_pharmacy",
  },
  {
    id: "supplies",
    label: "sidebar.supplies",
    icon: "Package",
    url: "/supplies",
    permission: "manage_pharmacy",
  },
  {
    id: "price_lists",
    label: "sidebar.priceLists",
    icon: "Tag",
    url: "/price-lists",
    permission: "manage_prices",
  },
  {
    id: "insurance",
    label: "sidebar.insurance",
    icon: "ShieldCheck",
    url: "/insurance",
    permission: "manage_insurance",
  },
  {
    id: "vault",
    label: "sidebar.vault",
    icon: "Vault",
    url: "/vault",
    permission: "view_vault",
  },
  {
    id: "reports",
    label: "sidebar.reports",
    icon: "FileText",
    url: "/reports",
    permission: "view_reports",
  },
]

function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false
  if (user.role === "Admin") return true
  return user.permissions.includes(permission)
}

/**
 * Filter the navigation tree against the current user's permissions.
 * Logic mirrors `Navigation.controller.filterNavigationByPermissions`:
 *   - Drop entries whose `role` doesn't match.
 *   - Drop entries whose `permission` is missing.
 *   - For entries with `children`, keep the parent only if at least one
 *     child passes (recursive filter).
 *
 * Returning a fresh array keeps Zustand subscriber rerenders cheap.
 */
export function filterNavForUser(
  items: NavigationItem[],
  user: User | null
): NavigationItem[] {
  const filtered: NavigationItem[] = []

  for (const item of items) {
    if (item.role && user?.role !== item.role) continue
    if (item.permission && !hasPermission(user, item.permission)) continue

    if (item.children && item.children.length > 0) {
      const filteredChildren = filterNavForUser(item.children, user)
      if (filteredChildren.length === 0) continue
      filtered.push({ ...item, children: filteredChildren })
      continue
    }

    filtered.push(item)
  }

  return filtered
}
