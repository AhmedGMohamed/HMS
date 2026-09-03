"use client"

import { useCallback, useEffect, useState } from "react"

import { getCurrentAdmission, getPatient } from "@/pages/Patients/api"
import type {
  Patient,
  PatientHistory,
} from "@/pages/Patients/types/patient"

export interface UsePatientProfileResult {
  patient: Patient | null
  admission: PatientHistory | null
  loading: boolean
  error: Error | null
  /** Manual refresh — invoked after a successful Edit / Admit / Discharge. */
  refresh: () => void
}

/**
 * Loads a patient + their current admission in parallel.
 *
 * The hook mirrors `useListData`'s loading semantics:
 *  - synchronous `setLoading(true)` on deps change (deliberate,
 *    disables the `react-hooks/set-state-in-effect` rule per-line);
 *  - cancels in-flight requests on unmount so navigating between
 *    patient records doesn't race;
 *  - returns a stable `refresh` callback so action dialogs can poke
 *    the page to re-fetch after a server mutation.
 *
 * 404 from `getPatient` is surfaced as `error: ApiError(404, ...)`
 * so `<PatientProfilePanel>` can switch to its not-found empty
 * state without inspecting internal controller state.
 */
export function usePatientProfile(
  patientId: number
): UsePatientProfileResult {
  const [patient, setPatient] = useState<Patient | null>(null)
  const [admission, setAdmission] = useState<PatientHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!Number.isFinite(patientId) || patientId <= 0) return
    let cancelled = false

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)

    Promise.allSettled([
      getPatient(patientId),
      getCurrentAdmission(patientId),
    ])
      .then(([patientRes, admissionRes]) => {
        if (cancelled) return
        if (patientRes.status === "fulfilled") {
          setPatient(patientRes.value)
          setError(null)
        } else {
          setPatient(null)
          setError(
            patientRes.reason instanceof Error
              ? patientRes.reason
              : new Error(String(patientRes.reason))
          )
        }
        if (admissionRes.status === "fulfilled") {
          setAdmission(admissionRes.value)
        } else {
          /* Missing admission is fine — patient may not be admitted. */
          setAdmission(null)
        }
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [patientId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { patient, admission, loading, error, refresh }
}
