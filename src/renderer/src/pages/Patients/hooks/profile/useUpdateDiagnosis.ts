"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { ApiError } from "@/lib/errors"
import { updateDiagnosis } from "@/pages/Patients/api"

export interface UseUpdateDiagnosisResult {
  submitting: boolean
  error: Error | null
  /**
   * PUT `/api/patients/:id/diagnosis`. Resolves true on success.
   *
   * Backend only requires the diagnosis to be a non-empty string;
   * the dialog also surfaces the dialog-level "save" gating so
   * blanks never reach the wire.
   */
  setDiagnosis: (diagnosis: string) => Promise<boolean>
  clearError: () => void
}

/**
 * T9.1 — One-shot diagnosis update hook for `<EditDiagnosisDialog>`.
 *
 * Diagnosis lives on the current `PatientHistory`, not the patient
 * record — we PUT it through `updateDiagnosis` which the server
 * routes to `updateCurrentDiagnosis(patientId, diagnosis)`.
 */
export function useUpdateDiagnosis(
  patientId: number
): UseUpdateDiagnosisResult {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const setDiagnosis = useCallback(
    async (diagnosis: string) => {
      if (!Number.isFinite(patientId) || patientId <= 0) return false
      setSubmitting(true)
      setError(null)
      try {
        await updateDiagnosis(patientId, diagnosis)
        toast.success(t("patients.messages.diagnosisUpdated"))
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
            : t("patients.messages.diagnosisUpdateError")
        )
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [patientId, t]
  )

  const clearError = useCallback(() => setError(null), [])

  return { submitting, error, setDiagnosis, clearError }
}
