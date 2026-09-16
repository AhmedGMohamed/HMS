"use client"

import { useEffect, useState } from "react"

import { listServices } from "@/pages/Services/api"
import {
  normalizeService,
  type NormalizedService,
} from "@/pages/_shared/services/types"

export interface UseServicesResult {
  services: NormalizedService[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Services list hook (§3 of `phase_6.6_plan.md`).
 *
 * Single `GET /api/services` fetch — drops the legacy per-service
 * detail N+1 loop. `normalizeService` turns null `prices`/`drugs`
 * arrays into `[]` and coerces prices with `Number()` (the list
 * endpoint emits JSON numbers; the by-id endpoint strings them).
 */
export function useServices(): UseServicesResult {
  const [services, setServices] = useState<NormalizedService[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listServices()
      .then((rows) => {
        if (cancelled) return
        setServices(rows.map(normalizeService))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return {
    services,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
