import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { usePermission } from "@/hooks/usePermission"
import { toast } from "sonner"

/**
 * Admin-only gate. Mirrors the server's `adminOnly` middleware, which now
 * accepts any privileged role (`Admin` and the automation `System` role).
 *
 * `PermissionRoute` already handles `{ mode: "admin" }` for `/admin/*`; this
 * inner gate is defense in depth.
 */
export function AdminRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isPrivileged } = usePermission()

  useEffect(() => {
    if (isPrivileged()) return
    navigate("/dashboard", { replace: true })
    toast.warning("adminOnly", {
      description: "That page is restricted to administrators.",
    })
  }, [isPrivileged, navigate, location.pathname])

  if (!isPrivileged()) return null
  return <Outlet />
}
