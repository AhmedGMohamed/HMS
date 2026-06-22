import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { usePermission } from "@/hooks/usePermission"
import { toast } from "sonner"

/**
 * Admin-only gate. Mirrors the server's `adminOnly` middleware — exact
 * `user.role === 'Admin'` check, no permission fallback.
 */
export function AdminRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAdmin } = usePermission()

  useEffect(() => {
    if (isAdmin()) return
    navigate("/dashboard", { replace: true })
    toast.warning("adminOnly", {
      description: "That page is restricted to administrators.",
    })
  }, [isAdmin, navigate, location.pathname])

  if (!isAdmin()) return null
  return <Outlet />
}
