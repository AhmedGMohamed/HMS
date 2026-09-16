/**
 * PriceLists module — type re-exports & wire shapes.
 *
 * The `PriceList` base type lives in `pages/_shared/pharmacy/types.ts`
 * (already consumed by Patients/Drugs/Supplies) — re-exported here, not
 * duplicated. Everything else is PriceLists-specific: the stats-bearing
 * list row (Stage 0 batch stats) and the Add Prices datasets/payload.
 */
import type {
  ShipmentPrice,
  UnitConversion,
} from "@/pages/_shared/pharmacy/types"

export type { PriceList } from "@/pages/_shared/pharmacy/types"

/**
 * `/api/price-lists` element after Stage 0 — batch stats embedded.
 * Counts arrive as JSON strings (Postgres `COUNT(*)` bigint via `pg`),
 * so `usePriceLists` coerces them with `Number()`.
 */
export interface PriceListWithStats {
  pricelistId: number
  name: string
  isDefault: boolean
  totalServices: number
  totalDrugs: number
  totalSupplies: number
}

export interface CreatePriceListPayload {
  name: string
  isDefault: boolean
}

export type UpdatePriceListPayload = Partial<CreatePriceListPayload>

/* ----------------------------------------------------------------
   Add Prices datasets (list-all wire shapes)
   ---------------------------------------------------------------- */

/**
 * `GET /api/pharmacy/drugs/shipments` (list-all) element. Unlike the
 * per-drug endpoint's `DrugShipment` (in `_shared/pharmacy/types.ts`),
 * the list-all shape has NO `quantityInLargerUnit` and NO
 * `pricelistName`, and `prices` is SQL `null` when empty. Includes
 * out-of-stock rows — the renderer filters `quantity > 0`.
 */
export interface DrugShipmentPricingRow {
  shipmentId: number
  drugId: number
  warehouseId: number
  quantity: number
  buyPrice: number | string
  expiryDate: string | null
  receivedDate?: string
  drugName: string
  warehouseName: string
  unitConversion: UnitConversion | null
  /** SQL `null` when the batch has no prices. */
  prices: ShipmentPrice[] | null
}

/**
 * `GET /api/pharmacy/medical-supply-shipments` (list-all) element.
 * Supply prices carry no prepayment fields (only `pricelistId` +
 * `price`). The server runs an N+1 price query per shipment — fine at
 * current volume (see backend plan §2.2 future work).
 */
export interface SupplyShipmentPricingRow {
  shipmentId: number
  supplyId: number
  warehouseId: number
  quantity: number
  buyPrice: number | string
  expiryDate: string | null
  receivedDate?: string
  supplyName: string
  warehouseName: string
  /** SQL `null` when the batch has no prices. */
  prices: { pricelistId: number; price: number | string }[] | null
}

/* ----------------------------------------------------------------
   Add Prices payload & response (bulk endpoint)
   ---------------------------------------------------------------- */

/** `price: null` = remove that (entity, pricelist) price row. */
export interface AddServicePriceEntry {
  serviceId: number
  price: number | null
  requiresPrepayment?: boolean
  prepaymentType?: "fixed" | "percentage" | null
  prepaymentAmount?: number | null
}

export interface AddShipmentPriceEntry {
  shipmentId: number
  price: number | null
  requiresPrepayment?: boolean
  prepaymentType?: "fixed" | "percentage" | null
  prepaymentAmount?: number | null
}

/** Wire payload for `PUT /api/price-lists/:id/prices` (sent toSnake). */
export interface AddPricesPayload {
  services?: AddServicePriceEntry[]
  drugShipments?: AddShipmentPriceEntry[]
  supplyShipments?: AddShipmentPriceEntry[]
}

/**
 * Bulk endpoint response — fresh stats for the list + removal count.
 * All four values arrive as JSON strings (bigint COUNT) → coerce with
 * `Number()` before use.
 */
export interface BulkPricesResult {
  totalServices: number
  totalDrugs: number
  totalSupplies: number
  removedPrices: number
}
