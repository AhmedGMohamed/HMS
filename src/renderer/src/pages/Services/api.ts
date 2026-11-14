import { api } from "@/lib/api"
import { listDrugCards as listDrugCardsFromDrugsApi } from "@/pages/Drugs/api"
import type { PaginatedResponse } from "@/types"
import type {
  CreateServicePayload,
  Service,
  ServiceType,
  UpdateServicePayload,
} from "@/pages/Services/types/service"

/**
 * Services module API — CRUD over `/api/services` plus the drug
 * picker source. `lib/api.ts` camelCases responses and snake_cases
 * outgoing bodies automatically; see the wire-shape docs in
 * `pages/_shared/services/types.ts` (null `prices`/`drugs`, price
 * number-vs-string quirks are normalized by `normalizeService`).
 */

export interface ServiceListParams {
  page?: number
  pageSize?: number
  search?: string
  serviceType?: ServiceType | ""
  pricelistId?: number | ""
  drug?: string
  sort?: "name" | "serviceType"
  dir?: "asc" | "desc"
}

/**
 * Paginated `/api/services` list. The server always answers with the
 * shared `{ data, total, page, pageSize }` envelope; `all` is reserved
 * for lookup callers that need the full catalogue, never the Services
 * page itself.
 */
export function listServicesPage(params: ServiceListParams = {}) {
  return api.get<PaginatedResponse<Service>>("/services", {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    search: params.search?.trim() || undefined,
    serviceType: params.serviceType || undefined,
    pricelistId: params.pricelistId === "" ? undefined : params.pricelistId,
    drug: params.drug?.trim() || undefined,
    sort: params.sort,
    dir: params.dir,
  })
}

/** Unbounded lookup variant (`?all=true`) for selects/pickers. */
export function listAllServices() {
  return api
    .get<PaginatedResponse<Service>>("/services", { all: true })
    .then((res) => res.data)
}

/** Create returns the bare row (no prices/drugs) — callers refetch. */
export function createService(payload: CreateServicePayload) {
  return api.post<Service>("/services", payload)
}

/** `prices` UPSERT-only, `drugs` full replace (always sent). */
export function updateService(id: number, payload: UpdateServicePayload) {
  return api.put<Service>(`/services/${id}`, payload)
}

export function deleteService(id: number) {
  return api.delete<void>(`/services/${id}`)
}

/** Drug picker source — reuses the Drugs module's paginated cards
 *  endpoint (first page, `pageSize: 100`; do not re-implement). */
export function listDrugCards() {
  return listDrugCardsFromDrugsApi({ pageSize: 100 })
}
