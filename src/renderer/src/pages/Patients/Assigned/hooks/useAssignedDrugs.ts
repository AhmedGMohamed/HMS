"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  addDrug,
  administerDrug,
  listAssignedDrugs,
  removeDrug,
} from "@/pages/Patients/api"
import type {
  DrugUsage,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"
import { useTranslation } from "react-i18next"

export interface UseAssignedDrugsResult {
  drugs: DrugUsage[]
  loading: boolean
  error: Error | null
  refresh: () => void
  add: (args: AddDrugArgs) => Promise<void>
  remove: (drugUsageId: number) => Promise<void>
  administer: (drugUsageId: number) => Promise<void>
}

export interface AddDrugArgs {
  drugId: number
  shipmentId: number
  quantity: number
  price: number
  /** Legacy patients may not be admitted yet (POST will return 400). */
  patientHistoryId?: number | null
}

export function useAssignedDrugs(
  patientId: number,
  currentAdmission: PatientHistory | null
): UseAssignedDrugsResult {
  const { t } = useTranslation()
  const [drugs, setDrugs] = useState<DrugUsage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!Number.isFinite(patientId) || patientId <= 0) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listAssignedDrugs(patientId)
      .then((rows) => {
        if (cancelled) return
        setDrugs(rows)
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
    async (args: AddDrugArgs) => {
      try {
        const patientHistoryId = currentAdmission?.patientHistoryId ?? null
        if (patientHistoryId == null) {
          throw new Error(t("patients.messages.patientMustBeAdmitted"))
        }
        await addDrug(patientId, {
          drugId: args.drugId,
          shipmentId: args.shipmentId,
          quantity: args.quantity,
          price: args.price,
          patientHistoryId,
        })
        toast.success(t("patients.messages.drugAdded"))
        refresh()
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : t("patients.messages.addDrugError")
        )
        throw err
      }
    },
    [patientId, currentAdmission, refresh, t]
  )

  const remove = useCallback(
    async (drugUsageId: number) => {
      try {
        await removeDrug(patientId, drugUsageId)
        toast.success(t("patients.messages.drugRemoved"))
        refresh()
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : t("patients.messages.removeDrugError")
        )
        throw err
      }
    },
    [patientId, refresh, t]
  )

  const administer = useCallback(
    async (drugUsageId: number) => {
      const row = drugs.find((d) => d.drugUsageId === drugUsageId)
      if (!row) {
        toast.error(t("patients.messages.noRemainingQuantity"))
        throw new Error("missing row")
      }
      if (row.remainingQuantity <= 0) {
        toast.error(t("patients.messages.noRemainingQuantity"))
        throw new Error("remaining <= 0")
      }
      const nextRemaining = Math.max(0, row.remainingQuantity - 1)
      try {
        await administerDrug(drugUsageId, { remainingQuantity: nextRemaining })
        toast.success(t("patients.messages.drugAdministered"))
        refresh()
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : t("patients.messages.administerDrugError")
        )
        throw err
      }
    },
    [drugs, refresh, t]
  )

  return { drugs, loading, error, refresh, add, remove, administer }
}
