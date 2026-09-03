"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { ApiError } from "@/lib/errors"
import { updatePatient } from "@/pages/Patients/api"
import {
  dispatchStaffChanged,
} from "@/pages/Patients/lib/billEvents"

export interface StaffAssignmentDiff {
  attendingDoctors?: { add: number[]; remove: number[] }
  attendingNurses?: { add: number[]; remove: number[] }
}

export interface UseUpdateStaffAssignmentResult {
  submitting: boolean
  error: Error | null
  /**
   * PUT `/api/patients/:id` with the diff payload. Resolves the
   * roles that actually changed on success, or `null` if the diff
   * was empty (the caller closes silently).
   */
  submit: (
    patientId: number,
    diff: StaffAssignmentDiff
  ) => Promise<("doctors" | "nurses")[] | null>
  clearError: () => void
}

/**
 * T10 — One-shot staff-assignment mutation hook for
 * `<EditStaffAssignmentDialog>`. The caller computes the diff
 * client-side (doctor + nurse ids vs. baseline from
 * `/api/patients/:id/admissions/current`) and passes it here.
 *
 * No-op guard: when both `attendingDoctors` and `attendingNurses`
 * have no add/remove entries, the hook short-circuits and the
 * caller closes silently. This avoids an extra round-trip +
 * toast noise when the user opens the dialog and dismisses it
 * without flipping any chip.
 *
 * On success the hook fires `hms:staff-changed` for downstream
 * listeners (`useStaffChangeSubscription` on the patient profile
 * and the Staff Status panel).
 */
export function useUpdateStaffAssignment(): UseUpdateStaffAssignmentResult {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const submit = useCallback(
    async (patientId: number, diff: StaffAssignmentDiff) => {
      if (!Number.isFinite(patientId) || patientId <= 0) return null

      const changedRoles: ("doctors" | "nurses")[] = []
      const doctorAdd = diff.attendingDoctors?.add ?? []
      const doctorRemove = diff.attendingDoctors?.remove ?? []
      const nurseAdd = diff.attendingNurses?.add ?? []
      const nurseRemove = diff.attendingNurses?.remove ?? []
      if (doctorAdd.length > 0 || doctorRemove.length > 0) {
        changedRoles.push("doctors")
      }
      if (nurseAdd.length > 0 || nurseRemove.length > 0) {
        changedRoles.push("nurses")
      }
      if (changedRoles.length === 0) return null

      setSubmitting(true)
      setError(null)
      try {
        await updatePatient(patientId, {
          attendingDoctors: {
            add: doctorAdd,
            remove: doctorRemove,
          },
          attendingNurses: {
            add: nurseAdd,
            remove: nurseRemove,
          },
        })
        toast.success(t("patients.messages.staffAssignmentUpdated"))
        dispatchStaffChanged({ patientId, roles: changedRoles })
        return changedRoles
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
            : t("patients.messages.staffAssignmentUpdateError")
        )
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [t]
  )

  const clearError = useCallback(() => setError(null), [])

  return { submitting, error, submit, clearError }
}
