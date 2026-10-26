"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { listPastAdmissions } from "@/pages/Patients/api"
import type { LeaveReason } from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"

export interface PastAdmissionSummary {
  patientHistoryId: number
  billId: number | null
  quickCheck: boolean | null
  diagnosis: string | null
  admissionTime: string
  dischargeTime: string
  leaveReason: LeaveReason | null
  totalAmount: number
  paidAmount: number
  medicalTestsAmount: number
  /** Server returns `array_agg(DISTINCT name)` — flat strings. */
  assignedDoctors: string[]
  assignedNurses: string[]
  totalServicesCount: number
  totalDrugsCount: number
  totalSuppliesCount: number
}

export interface UsePastAdmissionsResult {
  admissions: PastAdmissionSummary[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Loads the past-admissions list for a single patient. Mirrors the
 * nonce + cancellation pattern from T5 hooks so concurrent refresh
 * calls don't race stale state.
 *
 * Server returns rows already sorted `dischargeTime DESC`. We
 * coerce numeric strings to numbers before storing.
 */
export function usePastAdmissions(patientId: number): UsePastAdmissionsResult {
  const { t } = useTranslation()
  const [admissions, setAdmissions] = useState<PastAdmissionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!Number.isFinite(patientId) || patientId <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAdmissions([])
       
      setError(null)
      return
    }
    let cancelled = false
     
    setLoading(true)
     
    setError(null)
    listPastAdmissions(patientId)
      .then((rows) => {
        if (cancelled) return
        const mapped: PastAdmissionSummary[] = rows.map((r) => ({
          patientHistoryId: Number((r as { patientHistoryId?: number }).patientHistoryId ?? 0),
          billId: toNullableNumber((r as { billId?: number | null }).billId),
          quickCheck:
            Boolean((r as { quickCheck?: boolean | null }).quickCheck) || null,
          diagnosis: nonEmptyString(
            (r as { diagnosis?: string | null }).diagnosis
          ),
          admissionTime: String(
            (r as { admissionTime?: string }).admissionTime ?? ""
          ),
          dischargeTime: String(
            (r as { dischargeTime?: string }).dischargeTime ?? ""
          ),
          leaveReason: toLeaveReason(
            (r as { leaveReason?: unknown }).leaveReason
          ),
          totalAmount: toNumber(
            (r as { totalAmount?: number | string }).totalAmount
          ),
          paidAmount: toNumber(
            (r as { paidAmount?: number | string }).paidAmount
          ),
          medicalTestsAmount: toNumber(
            (r as { medicalTestsAmount?: number | string })
              .medicalTestsAmount
          ),
          assignedDoctors: toStringArray(
            (r as { assignedDoctors?: string[] }).assignedDoctors
          ),
          assignedNurses: toStringArray(
            (r as { assignedNurses?: string[] }).assignedNurses
          ),
          totalServicesCount: toNumberCount(
            (r as { totalServicesCount?: number }).totalServicesCount
          ),
          totalDrugsCount: toNumberCount(
            (r as { totalDrugsCount?: number }).totalDrugsCount
          ),
          totalSuppliesCount: toNumberCount(
            (r as { totalSuppliesCount?: number }).totalSuppliesCount
          ),
        }))
        setAdmissions(mapped)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const ae = err instanceof ApiError ? err : null
        const msg = ae?.message ?? null
        setError(
          err instanceof Error
            ? err
            : new Error(
                msg ?? t("patients.messages.loadAdmissionsError")
              )
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId, nonce, t])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { admissions, loading, error, refresh }
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === "number" ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function toNullableNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === "number" ? value : parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function toNumberCount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === "number" ? value : parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function nonEmptyString(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function toStringArray(
  value: string[] | null | undefined
): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string" && v.length > 0)
}

function toLeaveReason(
  value: unknown
): LeaveReason | null {
  if (!value) return null
  const s = String(value)
  if (
    s === "improvement" ||
    s === "death" ||
    s === "transfer" ||
    s === "as_desired"
  ) {
    return s as LeaveReason
  }
  return null
}
