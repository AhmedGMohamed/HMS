import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { usePermission } from "@/hooks/usePermission"
import { findRouteRequirement } from "@/lib/routes"
import { toast } from "sonner"

/**
 * Per-route permission gate.
 *
 * Resolves the current path's required permission from `routes.ts`,
 * evaluates it against `usePermission().hasPermission(...)`, and either
 * renders the outlet or redirects to /dashboard with a Sonner `warning`
 * toast. Admin role bypasses the check per server convention.
 */
export function PermissionRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission } = usePermission()

  const requirement = findRouteRequirement(location.pathname)
  const allowed =
    requirement.mode === "public" ||
    requirement.mode === "private" ||
    (requirement.mode === "permission" && hasPermission(requirement.permission))

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
