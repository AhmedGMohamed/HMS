import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { usePermission } from "@/hooks/usePermission"
import { canAccessRoute, findRouteRequirement } from "@/lib/routes"
import { toast } from "sonner"

/**
 * Per-route permission gate.
 *
 * Resolves the current path's requirement from `routes.ts` and delegates the
 * decision to `canAccessRoute`. Renders the outlet or redirects to /dashboard
 * with a Sonner `warning` toast.
 *
 * `AdminRoute` sits inside this one for `/admin/*`; it keeps its own check as
 * belt-and-braces, but the `admin` mode is now handled here too — without that
 * case these routes were unreachable for every role.
 */
export function PermissionRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission, isPrivileged } = usePermission()

  const requirement = findRouteRequirement(location.pathname)
  const allowed = canAccessRoute(requirement, { hasPermission, isPrivileged })

  useEffect(() => {
    if (allowed) return
    navigate("/dashboard", { replace: true })
    toast.warning("insufficientPermissions", {
      description: "You do not have access to that page.",
    })
  }, [allowed, navigate])

  if (!allowed) return null
  return <Outlet />
}
