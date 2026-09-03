"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { ApiError } from "@/lib/errors"
import { admitPatient } from "@/pages/Patients/api"
import type { AdmitPatientPayload } from "@/pages/Patients/api"
import type {
  Bill,
  PatientHistory,
} from "@/pages/Patients/types/patient"

export interface UseAdmitPatientResult {
  submitting: boolean
  error: Error | null
  /** Fire POST `/api/patients/:id/admit`. Resolves on success. */
  admit: (payload: AdmitPatientPayload) => Promise<{
    admission: PatientHistory
    bill: Bill
  } | null>
  clearError: () => void
}

/**
 * T9.1 — One-shot admit hook for `<AdmitPatientDialog>`.
 *
 * Mirrors `useBillSave`'s shape: caller owns the form, the hook
 * fire-and-forgets the POST and toasts on success / surfaces the
 * server's first-party error message on failure (the legacy
 * `Patient is already admitted` and `Doctor not found` 400s come
 * verbatim from the controller).
 *
 * On success the page-level `usePatientProfile` is re-poked by the
 * parent dialog through `onAdmitted`; this hook additionally fires
 * `hms:bill-changed` so the billing/assigned tabs swap their
 * `!bill` empty states when the new `billId` lands.
 */
export function useAdmitPatient(patientId: number): UseAdmitPatientResult {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const admit = useCallback(
    async (payload: AdmitPatientPayload) => {
      if (!Number.isFinite(patientId) || patientId <= 0) return null
      setSubmitting(true)
      setError(null)
      try {
        const result = await admitPatient(patientId, payload)
        toast.success(t("patients.messages.patientAdmitted"))
        return result
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
            : t("patients.messages.admitPatientError")
        )
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [patientId, t]
  )

  const clearError = useCallback(() => setError(null), [])

  return { submitting, error, admit, clearError }
}
