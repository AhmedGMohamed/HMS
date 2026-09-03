"use client"

import { useCallback, useEffect, useState } from "react"

import { getBill } from "@/pages/Patients/api"
import type { Bill } from "@/pages/Patients/types/patient"

export interface UseBillResult {
  bill: Bill | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Loads a single bill by id. Mirrors the `nonce` + cancellation
 * pattern used by the assigned-lines hooks so refetch is idempotent
 * under concurrent updates.
 *
 * `billId`: 0 / negative / non-finite — no fetch happens, returns
 * `bill: null`.
 */
export function useBill(billId: number | null): UseBillResult {
  const [bill, setBill] = useState<Bill | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (billId == null || !Number.isFinite(billId) || billId <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBill(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getBill(billId)
      .then((row) => {
        if (cancelled) return
        setBill(row)
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
  }, [billId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { bill, loading, error, refresh }
}
