"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getCompany,
  getCompanyStatistics,
  listCompanyPatients,
} from "@/pages/Insurance/api"
import type {
  InsuranceCompany,
  InsurancePatient,
  InsuranceStatistics,
} from "@/pages/Insurance/types/insurance"

export interface UseInsuranceDetailResult {
  /** Full company row (contact info + last cleared date live only here). */
  company: InsuranceCompany | null
  statistics: InsuranceStatistics | null
  patients: InsurancePatient[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Detail view data — Phase 6.10 plan §4 Step 3.
 *
 * Three parallel requests on selection (`Promise.all`), matching the
 * legacy `selectInsuranceCompany` fan-out — plus `GET /:id`, which the
 * legacy page skipped: it reused the *list* row, whose SQL omits
 * `contact_info` and `last_cleared_date`. That is why the legacy detail
 * card never showed contact info and always printed "N/A" for the last
 * cleared date (plan §5 #3). Fetching the full row fixes it.
 *
 * Switching companies clears `company` / `statistics` / `patients`
 * before the new requests start, so the previous company's row can never
 * render under the new URL. Every run also carries a token: responses
 * from a superseded run are dropped even if they resolve late. A
 * `refresh` of the *same* company keeps the current data on screen.
 */
export function useInsuranceDetail(
  companyId: number | null
): UseInsuranceDetailResult {
  const [company, setCompany] = useState<InsuranceCompany | null>(null)
  const [statistics, setStatistics] = useState<InsuranceStatistics | null>(
    null
  )
  const [patients, setPatients] = useState<InsurancePatient[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  /** Company whose data is (or was last) on screen. */
  const shownIdRef = useRef<number | null>(null)
  /** Monotonic request token: only the latest run may commit state. */
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (companyId == null) {
      requestIdRef.current += 1
      shownIdRef.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompany(null)
      setStatistics(null)
      setPatients([])
      setError(null)
      setLoading(false)
      return
    }

    if (shownIdRef.current !== companyId) {
      shownIdRef.current = companyId
      setCompany(null)
      setStatistics(null)
      setPatients([])
    }

    const requestId = ++requestIdRef.current
    const isCurrent = () => requestIdRef.current === requestId

    setLoading(true)
    setError(null)

    Promise.all([
      getCompany(companyId),
      getCompanyStatistics(companyId),
      listCompanyPatients(companyId),
    ])
      .then(([companyRow, stats, patientRows]) => {
        if (!isCurrent()) return
        setCompany(companyRow)
        setStatistics(stats)
        setPatients(patientRows)
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
  }, [companyId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { company, statistics, patients, loading, error, refresh }
}
