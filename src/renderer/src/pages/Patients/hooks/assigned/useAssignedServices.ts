"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  addService,
  listAssignedServices,
  removeService,
  stopService,
} from "@/pages/Patients/api"
import type { ActivePatientService } from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"
import { useTranslation } from "react-i18next"
import {
  dispatchBillChanged,
} from "@/pages/Patients/lib/billEvents"

export interface UseAssignedServicesResult {
  services: ActivePatientService[]
  loading: boolean
  error: Error | null
  refresh: () => void
  add: (serviceId: number) => Promise<void>
  stop: (activeServiceId: number) => Promise<void>
  remove: (activeServiceId: number) => Promise<void>
}

/**
 * Loads / mutates assigned services for a single patient. Mirrors
 * `useListData`'s `nonce` + cancellation pattern so concurrent
 * mutations don't race stale state.
 *
 * The page-level mutation triggers a `refresh` to keep a single
 * round-trip in flight — mutating-then-fetching rather than
 * client-side splicing avoids drift if another tab crammed in a row.
 */
export function useAssignedServices(
  patientId: number
): UseAssignedServicesResult {
  const { t } = useTranslation()
  const [services, setServices] = useState<ActivePatientService[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!Number.isFinite(patientId) || patientId <= 0) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listAssignedServices(patientId)
      .then((rows) => {
        if (cancelled) return
        setServices(rows)
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
  }, [patientId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const add = useCallback(
    async (serviceId: number) => {
      try {
        await addService(patientId, { serviceId })
        toast.success(t("patients.messages.serviceAdded"))
        dispatchBillChanged({
          patientId,
          patientHistoryId: null,
          source: "services",
          reason: "service-added",
        })
        refresh()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : t("patients.messages.addServiceError")
        )
        throw err
      }
    },
    [patientId, refresh, t]
  )

  const stop = useCallback(
    async (activeServiceId: number) => {
      try {
        await stopService(patientId, activeServiceId)
        toast.success(t("patients.messages.serviceStopped"))
        dispatchBillChanged({
          patientId,
          patientHistoryId: null,
          source: "services",
          reason: "service-stopped",
        })
        refresh()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : t("patients.messages.stopServiceError")
        )
        throw err
      }
    },
    [patientId, refresh, t]
  )

  const remove = useCallback(
    async (activeServiceId: number) => {
      try {
        await removeService(patientId, activeServiceId)
        toast.success(t("patients.messages.serviceRemoved"))
        dispatchBillChanged({
          patientId,
          patientHistoryId: null,
          source: "services",
          reason: "service-removed",
        })
        refresh()
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : t("patients.messages.removeServiceError")
        )
        throw err
      }
    },
    [patientId, refresh, t]
  )

  return { services, loading, error, refresh, add, stop, remove }
}
