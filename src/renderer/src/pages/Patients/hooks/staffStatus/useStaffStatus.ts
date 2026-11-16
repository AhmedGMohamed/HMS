"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  listAvailableNurses,
  listClockedInStaff,
  listCurrentAdmissionsWithStaff,
  listDoctors,
} from "@/pages/Patients/api"
import type { ClockedInStaff } from "@/pages/Patients/types/patient"
import type { AssignmentSummary } from "@/pages/Patients/lib/staffStatus/enrichClockedIn"
import {
  buildAssignmentSummary,
  buildAssignmentTargeting,
  enrichClockedIn,
} from "@/pages/Patients/lib/staffStatus/enrichClockedIn"

export interface UseStaffStatusResult {
  clockedIn: ClockedInStaff[]
  /** Doctors filtered out of `clockedIn`. */
  doctors: ClockedInStaff[]
  /** Nurses filtered out of `clockedIn`. */
  nurses: ClockedInStaff[]
  /** Patient rows from `/patients/admissions/current` (with staff names). */
  assignments: AssignmentSummary[]
  loading: boolean
  error: Error | null
  /** Last successful fetch ts (ms epoch). `null` until first success. */
  lastUpdatedAt: number | null
  /** Manual quick refresh (also drives the polling cadence). */
  refresh: () => void
}

const POLL_INTERVAL_MS = 30_000

/**
 * T9.2 — Central data hook for `<StaffStatusPanel>`.
 *
 * Combines four parallel fetches:
 *   - `listClockedInStaff`   → clock-in rows
 *   - `listCurrentAdmissionsWithStaff` → admission row with staff names
 *   - `listDoctors`          → lookup for name/employeeType
 *   - `listAvailableNurses`  → same
 *
 * Joins them into:
 *   - `ClockedInStaff[]` filtered into `doctors[]` & `nurses[]`
 *   - `AssignmentSummary[]` for the Current Patient Assignments panel
 *   - `lastUpdatedAt` for the footer polling hint
 *   - `refresh()` callback exposed to the panel's refresh button + the
 *      30-second `setInterval` loop
 *
 * Cancellation: every fetch is gated by a per-fire `cancelled` flag
 * (cleaned up via the effect return). Polling stops on unmount.
 */
export function useStaffStatus(
  enabled: boolean = true
): UseStaffStatusResult {
  const [clockedIn, setClockedIn] = useState<ClockedInStaff[]>([])
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)

    Promise.all([
      listClockedInStaff(),
      listCurrentAdmissionsWithStaff(),
      listDoctors(),
      listAvailableNurses(),
    ])
      .then(([clockRows, admissionRows, doctorRows, nurseRows]) => {
        if (cancelled) return

        const summaries = admissionRows.map(buildAssignmentSummary)
        const targeting = buildAssignmentTargeting(summaries)
        const enriched = enrichClockedIn(
          clockRows,
          doctorRows,
          nurseRows,
          targeting
        )

        setAssignments(summaries)
        setClockedIn(enriched)
        setLastUpdatedAt(Date.now())
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
  }, [enabled, nonce])

  /* 30s background polling — runs only while the hook is enabled. */
  useEffect(() => {
    if (!enabled) return
    const handle = window.setInterval(() => {
      setNonce((n) => n + 1)
    }, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(handle)
    }
  }, [enabled])

  /* Derived split — doctors vs nurses. */
  const split = useMemo(() => {
    const doctors: ClockedInStaff[] = []
    const nurses: ClockedInStaff[] = []
    for (const c of clockedIn) {
      if (c.employeeType === "doctor") doctors.push(c)
      else if (c.employeeType === "nurse") nurses.push(c)
    }
    return { doctors, nurses }
  }, [clockedIn])

  return {
    clockedIn,
    doctors: split.doctors,
    nurses: split.nurses,
    assignments,
    loading,
    error,
    lastUpdatedAt,
    refresh,
  }
}
