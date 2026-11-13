import { useAuthStore } from "@/store/authStore"
import { isPrivilegedRole } from "@/lib/roles"
import type { Role } from "@/types"

/**
 * Client-side permission gate. Mirrors the server-side logic in
 * `auth.middleware.ts` so a denial on the front-end is consistent with
 * the 403 the API would return — defense in depth.
 *
 * Rules (must match between client & server):
 *   - Privileged roles (`Admin`, `System`) bypass all permission checks.
 *   - Otherwise the required permission must be on the user's `permissions`.
 *   - `isPrivileged()` complements permission checks for role-only routes
 *     (e.g. /admin/users).
 *
 * `isAdmin()` is kept as an alias of `isPrivileged()` for existing call sites;
 * the name is historical. Prefer `isPrivileged()` in new code.
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user)

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (isPrivilegedRole(user.role)) return true
    return user.permissions.includes(permission)
  }

  const hasRole = (role: Role): boolean => user?.role === role

  const isPrivileged = (): boolean => isPrivilegedRole(user?.role)

  const isAdmin = (): boolean => isPrivileged()

  return { user, hasPermission, hasRole, isPrivileged, isAdmin }
}
