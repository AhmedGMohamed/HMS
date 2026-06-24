import { useAuthStore } from "@/store/authStore"
import type { Role } from "@/types"

/**
 * Client-side permission gate. Mirrors the server-side logic in
 * `auth.middleware.ts` so a denial on the front-end is consistent with
 * the 403 the API would return — defense in depth.
 *
 * Rules (must match between client & server):
 *   - Admin role bypasses all permission checks.
 *   - Otherwise the required permission must be on the user's `permissions`.
 *   - `usePermission().hasRole('Admin')` complements permission checks for
 *     role-only routes (e.g. /admin/users → Admin-only).
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user)

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (user.role === "Admin") return true
    return user.permissions.includes(permission)
  }

  const hasRole = (role: Role): boolean => user?.role === role

  const isAdmin = (): boolean => user?.role == "Admin"

  return { user, hasPermission, hasRole, isAdmin }
}
