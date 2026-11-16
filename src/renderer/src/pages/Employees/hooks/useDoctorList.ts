"use client"

import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import {
  listDoctorsPage,
  type DoctorListParams,
  type DoctorSortKey,
} from "@/pages/Employees/api"
import type { Doctor } from "@/pages/Employees/types/employee"

export interface UseDoctorListParams extends Omit<DoctorListParams, "sort"> {
  /** Only fetch while the Doctors tab is visible. */
  enabled?: boolean
  /** DataTable sort state — `columnId` maps onto the server sort key. */
  sort?: { columnId: string; direction: "asc" | "desc" } | null
}

export interface UseDoctorListResult {
  doctors: Doctor[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
}

/** `is_active` is read from the Doctor row on this endpoint. */
function normalizeDoctor(row: Doctor): Doctor {
  return { ...row, isActive: row.isActive ?? true }
}

/**
 * Paginated Doctors tab hook.
 *
 * Mirrors `useEmployees`: the page owns the list state, the hook
 * debounces the name search and fetches one server page (the doctor
 * join carries `doctorType` / pay columns that the flat employee list
 * does not have).
 */
export function useDoctorList(
  params: UseDoctorListParams
): UseDoctorListResult {
  const {
    enabled = true,
    page = 1,
    pageSize = 10,
    search = "",
    isActive,
    shiftType = "",
    doctorType = "",
    sort,
    dir,
  } = params

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const debouncedSearch = useDebouncedValue(search, { delay: 300 })
  const sortColumn = sort?.columnId as DoctorSortKey | undefined
  const sortDirection = sort?.direction ?? dir

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listDoctorsPage({
      page,
      pageSize,
      search: debouncedSearch,
      isActive,
      shiftType,
      doctorType,
      sort: sortColumn,
      dir: sortDirection,
    })
      .then((res) => {
        if (cancelled) return
        setDoctors(res.data.map(normalizeDoctor))
        setTotal(res.total)
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
  }, [
    enabled,
    page,
    pageSize,
    debouncedSearch,
    isActive,
    shiftType,
    doctorType,
    sortColumn,
    sortDirection,
    nonce,
  ])

  return {
    doctors,
    total,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
