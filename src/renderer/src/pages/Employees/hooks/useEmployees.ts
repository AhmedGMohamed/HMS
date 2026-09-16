"use client"

import { useEffect, useState } from "react"

import { listDoctors, listEmployees } from "@/pages/Employees/api"
import type { Doctor, Employee } from "@/pages/Employees/types/employee"

export interface UseEmployeesResult {
  employees: Employee[]
  doctors: Doctor[]
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Staff list hook (Phase 6.7) — two requests total:
 *
 * - `GET /api/employees` → nurses + other staff (the flat list does
 *   not include Doctor-table fields, so doctors come separately).
 * - `GET /api/doctors` → the Doctors tab dataset.
 *
 * Legacy parity note: the legacy page fetched `/api/employees` once
 * and filtered by `employee_type` per tab; the flat fetch is kept so
 * the nurses/employees tabs share one request.
 */
export function useEmployees(): UseEmployeesResult {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    Promise.all([listEmployees(), listDoctors()])
      .then(([employeeRows, doctorRows]) => {
        if (cancelled) return
        setEmployees(
          employeeRows.map((row) => ({
            ...row,
            /* `is_active` is a nullable column — normalize once here. */
            isActive: row.isActive ?? true,
          }))
        )
        setDoctors(
          doctorRows.map((row) => ({
            ...row,
            isActive: row.isActive ?? true,
          }))
        )
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
  }, [nonce])

  return {
    employees,
    doctors,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
