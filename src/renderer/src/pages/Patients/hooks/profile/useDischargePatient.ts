"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { ApiError } from "@/lib/errors"
import {
  dischargePatient,
  type DischargePatientPayload,
} from "@/pages/Patients/api"

export interface UseDischargePatientResult {
  submitting: boolean
  error: Error | null
  /**
   * Fire POST `/api/patients/:id/discharge`. Resolves on success.
   *
   * On success the parent dialog calls `onDischarged()` which triggers
   * the page-level `usePatientProfile` refresh; this hook additionally
   * toasts the success message and surfaces the server's first-party
   * 400 message verbatim (`Patient is not currently admitted`).
   */
  discharge: (
    payload: DischargePatientPayload
  ) => Promise<boolean>
  clearError: () => void
}

/**
 * T9.1 — One-shot discharge hook for `<DischargePatientDialog>`.
 *
 * Mirrors `useBillSave` + `useAdmitPatient` shape. The dialog owns
 * the form (leave reason select + optional datetime-local), this
 * hook owns the round-trip + toast.
 *
 * Note: we don't fire `hms:bill-changed` — the billing tab's bill
 * is now closed and survives a refresh through its own `useBill`
 * fetcher. Emitting a synthetic bill-changed event would trigger
 * unnecessary re-fetches on the assigned tab.
 */
export function useDischargePatient(
  patientId: number
): UseDischargePatientResult {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const discharge = useCallback(
    async (payload: DischargePatientPayload) => {
      if (!Number.isFinite(patientId) || patientId <= 0) return false
      setSubmitting(true)
      setError(null)
      try {
        await dischargePatient(patientId, payload)
        toast.success(t("patients.messages.patientDischarged"))
        return true
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : err instanceof Error
              ? err
              : new Error(String(err))
        setError(apiErr)
        toast.error(
          err instanceof ApiError
            ? err.message
            : t("patients.messages.dischargePatientError")
        )
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [patientId, t]
  )

  const clearError = useCallback(() => setError(null), [])

  return { submitting, error, discharge, clearError }
}
