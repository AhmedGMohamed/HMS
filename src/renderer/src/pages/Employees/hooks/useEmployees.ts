"use client"

import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import {
  listEmployeesPage,
  type EmployeeListParams,
  type EmployeeSortKey,
} from "@/pages/Employees/api"
import type { Employee } from "@/pages/Employees/types/employee"

export interface UseEmployeesParams
  extends Omit<EmployeeListParams, "sort"> {
  /** Only fetch while the owning tab is visible. */
  enabled?: boolean
  /** DataTable sort state — `columnId` maps onto the server sort key. */
  sort?: { columnId: string; direction: "asc" | "desc" } | null
}

export interface UseEmployeesResult {
  employees: Employee[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
}

/** `is_active` can arrive as null on legacy rows — treat it as active. */
function normalizeEmployee(row: Employee): Employee {
  return { ...row, isActive: row.isActive ?? true }
}

/**
 * Paginated staff list hook — backs the Employees and Nurses tabs.
 *
 * The page owns page / pageSize / filters / sort; the hook debounces the
 * name search and asks the server for that exact slice, so filter
 * changes never touch the current page's rows.
 */
export function useEmployees(params: UseEmployeesParams): UseEmployeesResult {
  const {
    enabled = true,
    page = 1,
    pageSize = 10,
    type = "all",
    search = "",
    isActive,
    shiftType = "",
    sort,
    dir,
  } = params

  const [employees, setEmployees] = useState<Employee[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const debouncedSearch = useDebouncedValue(search, { delay: 300 })
  const sortColumn = sort?.columnId as EmployeeSortKey | undefined
  const sortDirection = sort?.direction ?? dir

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listEmployeesPage({
      page,
      pageSize,
      type,
      search: debouncedSearch,
      isActive,
      shiftType,
      sort: sortColumn,
      dir: sortDirection,
    })
      .then((res) => {
        if (cancelled) return
        setEmployees(res.data.map(normalizeEmployee))
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
    type,
    debouncedSearch,
    isActive,
    shiftType,
    sortColumn,
    sortDirection,
    nonce,
  ])

  return {
    employees,
    total,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
