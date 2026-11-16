import { useEffect } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useAuthStore } from "@/store/authStore"
import { useAuthVerify } from "@/hooks/useAuthVerify"
import { ApiError } from "@/lib/errors"

/**
 * Optimistic authenticated wrapper.
 *
 * Behaviour:
 *   - Persisted state says `isAuthenticated`: render the outlet immediately.
 *     `useAuthVerify` revalidates the cookie in parallel and clears state
 *     server-side (401) if the token expired.
 *   - No persisted user: redirect to /login, preserving the attempted path
 *     in router state so the login page can return the user to where they
 *     were going after a successful sign-in.
 *
 * We deliberately do NOT render a global spinner when verify is in flight:
 * that adds jank to every page refresh. The cookie + persisted user covers
 * the 99% case; the rare 401 surfaces as a fast login redirect.
 */
export function PrivateRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isVerifying = useAuthStore((s) => s.isVerifying)
  const verify = useAuthStore((s) => s.verify)
  const logout = useAuthStore((s) => s.logout)

  useAuthVerify()

  useEffect(() => {
    if (isAuthenticated) return
    if (isVerifying) return
    navigate("/login", { replace: true, state: { from: location.pathname } })
  }, [isAuthenticated, isVerifying, navigate, location.pathname])

  useEffect(() => {
    // Best-effort re-verify when GA returns from another tab where they
    // already cleared auth. Not essential for the happy path.
    if (!isAuthenticated) return
    void (async () => {
      try {
        await verify()
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) {
          logout()
        }
      }
    })()
  }, [isAuthenticated, verify, logout])

  if (!isAuthenticated) return null

  return <Outlet />
}
