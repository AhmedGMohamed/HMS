"use client"

import { useCallback, useState } from "react"
import {
  generateCompanyReport,
  generatePatientReport,
} from "@/pages/Insurance/api"
import type {
  InsuranceReportSummary,
  PatientReportSummary,
  ReportPayload,
} from "@/pages/Insurance/types/insurance"

/**
 * On-demand report fetching — Phase 6.10 plan §4 Step 3.
 *
 * Mirrors the 6.9 Vault `useVaultReport` shape: the options dialog calls
 * `generate(...)`, the hook performs the POST, and the details dialog
 * opens only when the fetch succeeds. `close()` clears the payload so a
 * re-open never flashes stale data.
 *
 * `generate` resolves to the failure (`Error | null`) instead of throwing
 * so the page can toast the server message while the dialog stays open.
 */

export interface UseCompanyReportResult {
  open: boolean
  data: InsuranceReportSummary | null
  loading: boolean
  error: Error | null
  generate: (companyId: number, payload: ReportPayload) => Promise<Error | null>
  close: () => void
}

export function useCompanyReport(): UseCompanyReportResult {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<InsuranceReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const generate = useCallback(
    async (companyId: number, payload: ReportPayload) => {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        const report = await generateCompanyReport(companyId, payload)
        setData(report)
        setOpen(true)
        return null
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err))
        setError(normalized)
        return normalized
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const close = useCallback(() => {
    setOpen(false)
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { open, data, loading, error, generate, close }
}

export interface UsePatientReportResult {
  open: boolean
  data: PatientReportSummary | null
  loading: boolean
  error: Error | null
  generate: (
    companyId: number,
    patientId: number,
    payload: ReportPayload
  ) => Promise<Error | null>
  close: () => void
}

export function usePatientReport(): UsePatientReportResult {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PatientReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const generate = useCallback(
    async (companyId: number, patientId: number, payload: ReportPayload) => {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        const report = await generatePatientReport(
          companyId,
          patientId,
          payload
        )
        setData(report)
        setOpen(true)
        return null
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err))
        setError(normalized)
        return normalized
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const close = useCallback(() => {
    setOpen(false)
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { open, data, loading, error, generate, close }
}
