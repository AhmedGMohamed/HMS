"use client"

import { useEffect } from "react"
import { useLocation } from "react-router-dom"

import { useBreadcrumbOverrideStore } from "@/store/breadcrumbStore"

/**
 * Publishes a human label for the current route's last breadcrumb.
 *
 * Detail pages call this with the entity's display name once it is
 * loaded (e.g. the insurance company name on `/insurance/:companyId`).
 * Passing `null`/`undefined` — or unmounting — restores the static
 * `breadcrumbs.ts` label for that crumb.
 *
 * The override is scoped to `location.pathname`, so navigating away can
 * never leave the previous entity's name in the trail.
 */
export function useBreadcrumbLabel(label: string | null | undefined): void {
  const { pathname } = useLocation()
  const setOverride = useBreadcrumbOverrideStore((s) => s.setOverride)

  useEffect(() => {
    setOverride(pathname, label ?? null)
    return () => {
      useBreadcrumbOverrideStore.getState().clearOverride(pathname)
    }
  }, [pathname, label, setOverride])
}
