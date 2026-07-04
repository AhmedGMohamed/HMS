"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  getAdmissionDetails,
} from "@/pages/Patients/api"
import {
  hydrateAdmissionDetails,
  type HydratedAdmissionDetails,
} from "@/pages/Patients/Admissions/lib/admissionsShape"
import { ApiError } from "@/lib/errors"

export type AdmissionDetailsEnriched = HydratedAdmissionDetails

export interface UseAdmissionDetailsResult {
  details: AdmissionDetailsEnriched | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Loads the past-admission details for a single history id. The hook
 * hydrates the flat camelCase response into the renderer's typed
 * domain shapes via `hydrateAdmissionDetails`. Patient identity is
 * fetched separately by the dialog (this endpoint carries only
 * `patientId`); admission details + patient fetch are coordinated by
 * the panel/dialog, not this hook.
 */
export function useAdmissionDetails(
  patientId: number,
  historyId: number | null
): UseAdmissionDetailsResult {
  const { t } = useTranslation()
  const [details, setDetails] = useState<AdmissionDetailsEnriched | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (
      !Number.isFinite(patientId) ||
      patientId <= 0 ||
      historyId == null ||
      !Number.isFinite(historyId) ||
      historyId <= 0
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetails(null)
       
      setError(null)
      return
    }
    let cancelled = false
     
    setLoading(true)
    setError(null)
    getAdmissionDetails(patientId, historyId)
      .then((row) => {
        if (cancelled) return
        const hydrated = hydrateAdmissionDetails(row, patientId)
        setDetails(hydrated)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const ae = err instanceof ApiError ? err : null
        setError(
          err instanceof Error
            ? err
            : new Error(
                ae?.message ??
                  t("patients.messages.loadAdmissionDetailsError")
              )
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId, historyId, nonce, t])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { details, loading, error, refresh }
}