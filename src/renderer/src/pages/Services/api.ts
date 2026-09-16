import { api } from "@/lib/api"
import { listDrugCards as listDrugCardsFromDrugsApi } from "@/pages/Drugs/api"
import type {
  CreateServicePayload,
  Service,
  UpdateServicePayload,
} from "@/pages/Services/types/service"

/**
 * Services module API — CRUD over `/api/services` plus the drug
 * picker source. `lib/api.ts` camelCases responses and snake_cases
 * outgoing bodies automatically; see the wire-shape docs in
 * `pages/_shared/services/types.ts` (null `prices`/`drugs`, price
 * number-vs-string quirks are normalized by `normalizeService`).
 */

export function listServices() {
  return api.get<Service[]>("/services")
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
