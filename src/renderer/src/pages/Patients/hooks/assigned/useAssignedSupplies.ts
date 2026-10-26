"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  listAssignedSupplies,
  removeSupply,
} from "@/pages/Patients/api"
import type {
  MedicalSupplyUsage,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"
import { useTranslation } from "react-i18next"
import {
  dispatchBillChanged,
} from "@/pages/Patients/lib/billEvents"

export interface UseAssignedSuppliesResult {
  supplies: MedicalSupplyUsage[]
  loading: boolean
  error: Error | null
  refresh: () => void
  remove: (usageId: number) => Promise<void>
}

export function useAssignedSupplies(
  patientId: number,
  currentAdmission: PatientHistory | null
): UseAssignedSuppliesResult {
  const { t } = useTranslation()
  const [supplies, setSupplies] = useState<MedicalSupplyUsage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const historyId = currentAdmission?.patientHistoryId ?? null

  useEffect(() => {
    if (!Number.isFinite(patientId) || patientId <= 0) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listAssignedSupplies(patientId, historyId ?? undefined)
      .then((rows) => {
        if (cancelled) return
        setSupplies(rows)
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
  }, [patientId, historyId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const remove = useCallback(
    async (usageId: number) => {
      try {
        await removeSupply(patientId, usageId)
        toast.success(t("patients.messages.supplyRemoved"))
        dispatchBillChanged({
          patientId,
          patientHistoryId: currentAdmission?.patientHistoryId ?? null,
          source: "supplies",
          reason: "supply-removed",
        })
        refresh()
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : t("patients.messages.removeSupplyError")
        )
        throw err
      }
    },
    [patientId, currentAdmission, refresh, t]
  )

  return { supplies, loading, error, refresh, remove }
}
