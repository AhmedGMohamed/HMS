"use client"

import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"

/**
 * Dev-only route gate.
 *
 * Mount any children of `<DevOnly>` only when running in development
 * mode (Vite sets `import.meta.env.DEV === true` in dev builds). When
 * the app is bundled for production we redirect to the dashboard.
 *
 * Use this to expose component-demo pages for Phase 4 verification
 * without shipping dead routes in the production bundle. The demo
 * route should never be a real entry-point; we render `<Navigate />`
 * (react-router) so navigation history is preserved.
 */
export function DevOnly({ children }: { children: ReactNode }) {
  if (import.meta.env.DEV) {
    return <>{children}</>
  }
  return <Navigate to="/dashboard" replace />
}
