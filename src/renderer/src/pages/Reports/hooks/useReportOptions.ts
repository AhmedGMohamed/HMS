"use client"

/**
 * Report filter options — Phase 6.11.
 *
 * One request fills every picker on the page (insurance companies, doctors,
 * nurses, payroll and clock-in employees). It replaces the legacy page's three
 * separate calls, one of which (`/api/employees?type=nurse`) needed
 * `manage_employees` and therefore silently broke the Nurse tab for
 * report-only roles.
 *
 * Options load once per page mount. A failure is non-fatal: the report tabs
 * still work without pickers, so the error is surfaced as `error` for the
 * caller to display inline.
 *
 * Loading is tracked in the same state object as the payload so the effect
 * never calls `setState` synchronously — it only resolves a promise, which
 * keeps React's render/effect cycle flat.
 */

import { useCallback, useEffect, useState } from "react"

import { getReportOptions } from "@/pages/Reports/api"
import {
  EMPTY_REPORT_OPTIONS,
  type ReportOptions,
} from "@/pages/Reports/types/reports"

export interface UseReportOptionsResult {
  options: ReportOptions
  loading: boolean
  error: Error | null
  reload: () => void
}

interface OptionsState {
  options: ReportOptions
  loading: boolean
  error: Error | null
}

const INITIAL_STATE: OptionsState = {
  options: EMPTY_REPORT_OPTIONS,
  loading: true,
  error: null,
}

export function useReportOptions(): UseReportOptionsResult {
  const [state, setState] = useState<OptionsState>(INITIAL_STATE)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    getReportOptions()
      .then((payload) => {
        if (cancelled) return
        setState({
          options: {
            insuranceCompanies: payload.insuranceCompanies ?? [],
            doctors: payload.doctors ?? [],
            nurses: payload.nurses ?? [],
            payrollEmployees: payload.payrollEmployees ?? [],
            clockInEmployees: payload.clockInEmployees ?? [],
          },
          loading: false,
          error: null,
        })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setState({
          options: EMPTY_REPORT_OPTIONS,
          loading: false,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        })
      })

    return () => {
      cancelled = true
    }
  }, [nonce])

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    setNonce((value) => value + 1)
  }, [])

  return {
    options: state.options,
    loading: state.loading,
    error: state.error,
    reload,
  }
}
