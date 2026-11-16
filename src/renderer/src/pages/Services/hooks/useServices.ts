"use client"

import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { listServicesPage } from "@/pages/Services/api"
import {
  normalizeService,
  type NormalizedService,
  type ServiceType,
} from "@/pages/_shared/services/types"

export interface UseServicesParams {
  page: number
  pageSize: number
  search: string
  serviceType: ServiceType | ""
  pricelistId: number | ""
  drug: string
  sort: { columnId: string; direction: "asc" | "desc" } | null
}

export interface UseServicesResult {
  services: NormalizedService[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Paginated services list hook.
 *
 * The page owns the list view state (page / pageSize / filters / sort)
 * and passes it in; the hook debounces the two free-text filters and
 * fetches the current server page. `normalizeService` turns null
 * `prices`/`drugs` arrays into `[]` and coerces prices with `Number()`.
 */
export function useServices(params: UseServicesParams): UseServicesResult {
  const [services, setServices] = useState<NormalizedService[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const {
    page,
    pageSize,
    search,
    serviceType,
    pricelistId,
    drug,
    sort,
  } = params
  const debouncedSearch = useDebouncedValue(search, { delay: 300 })
  const debouncedDrug = useDebouncedValue(drug, { delay: 300 })
  const sortColumn = sort?.columnId === "serviceType" ? "serviceType" : "name"
  const direction = sort?.direction ?? "asc"

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listServicesPage({
      page,
      pageSize,
      search: debouncedSearch,
      serviceType,
      pricelistId,
      drug: debouncedDrug,
      sort: sortColumn,
      dir: direction,
    })
      .then((res) => {
        if (cancelled) return
        setServices(res.data.map(normalizeService))
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
    page,
    pageSize,
    debouncedSearch,
    debouncedDrug,
    serviceType,
    pricelistId,
    sortColumn,
    direction,
    nonce,
  ])

  return {
    services,
    total,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
