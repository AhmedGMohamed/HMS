import { useCallback, useEffect, useState } from "react"

import { listPermissions, listRoles } from "@/pages/Admin/Roles/api"
import type {
  AdminRole,
  Permission,
} from "@/pages/Admin/Roles/types/role"

export interface UseRolesResult {
  roles: AdminRole[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Roles list controller (fetch-all).
 *
 * The endpoint returns every non-system role in one array, so there is no
 * pagination to manage. The Users page reuses this for its role `<select>` and
 * role filter.
 */
export function useRoles(enabled = true): UseRolesResult {
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listRoles()
      .then((rows) => {
        if (cancelled) return
        setRoles(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { roles, loading, error, refresh }
}

export interface UsePermissionsResult {
  permissions: Permission[]
  loading: boolean
  error: Error | null
}

/**
 * Full permission catalogue for the role modal's checkbox grid.
 *
 * This is the source of truth for labels too: the grid renders whatever the
 * database has, so a permission added by a migration shows up without a client
 * release (`permissionLabel` falls back to the raw `feature_name`).
 */
export function usePermissions(enabled = true): UsePermissionsResult {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listPermissions()
      .then((rows) => {
        if (cancelled) return
        setPermissions(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { permissions, loading, error }
}
