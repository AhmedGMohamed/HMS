import { api } from "@/lib/api"
import type {
  AddPricesPayload,
  BulkPricesResult,
  CreatePriceListPayload,
  DrugShipmentPricingRow,
  PriceList,
  PriceListWithStats,
  SupplyShipmentPricingRow,
  UpdatePriceListPayload,
} from "@/pages/PriceLists/types/priceList"
import type { Service } from "@/pages/_shared/services/types"

/**
 * PriceLists module API — the page's own data plus the three Add
 * Prices datasets. `lib/api.ts` camelCases responses and snake_cases
 * outgoing bodies automatically; see the wire-shape docs in
 * `types/priceList.ts` for nullability quirks per endpoint.
 */

export function listPriceLists() {
  return api.get<PriceListWithStats[]>("/price-lists")
}

export function createPriceList(payload: CreatePriceListPayload) {
  return api.post<PriceList>("/price-lists", payload)
}

export function updatePriceList(id: number, payload: UpdatePriceListPayload) {
  return api.put<PriceList>(`/price-lists/${id}`, payload)
}

export function deletePriceList(id: number) {
  return api.delete<void>(`/price-lists/${id}`)
}

/** Transactional bulk price-set (`price: null` entries remove prices). */
export function setPricesForList(id: number, payload: AddPricesPayload) {
  return api.put<BulkPricesResult>(`/price-lists/${id}/prices`, payload)
}

/* ----------------------------------------------------------------
   Add Prices datasets
   ---------------------------------------------------------------- */

export function listServices() {
  return api.get<Service[]>("/services")
}

/** List-all drug shipments (no `quantityInLargerUnit`/`pricelistName`). */
export function listAllDrugShipments() {
  return api.get<DrugShipmentPricingRow[]>("/pharmacy/drugs/shipments")
}

/** List-all supply shipments (no prepayment fields on prices). */
export function listAllSupplyShipments() {
  return api.get<SupplyShipmentPricingRow[]>(
    "/pharmacy/medical-supply-shipments"
  )
}
