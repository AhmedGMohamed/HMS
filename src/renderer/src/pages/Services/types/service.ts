/**
 * Services module — type re-exports (Decision #11 of
 * `phase_6.6_plan.md`).
 *
 * The canonical wire-shape types live in
 * `pages/_shared/services/types.ts` (shared with the PriceLists
 * module's Add Prices flow). This barrel gives the `Services` module
 * a single, discoverable import target, plus the module-local
 * request payloads.
 */

import { ServiceType } from "@/pages/_shared/patients/types"

export * from "@/pages/_shared/services/types"

/** One per-list price row in a create/update payload. `lib/api.ts`
 *  runs `toSnake` in transit (`pricelistId` → `pricelist_id`, etc.). */
export interface ServicePricePayload {
  pricelistId: number
  price: number
  requiresPrepayment: boolean
  prepaymentType?: "fixed" | "percentage" | null
  prepaymentAmount?: number | null
}

/**
 * Body for `POST /api/services` and `PUT /api/services/:id`.
 * Semantics (server-side, §1.1): `prices` is UPSERT-only — omitted
 * lists keep their existing rows; `drugs` (selected drug ids) is a
 * full replace, so it is always sent (an empty array clears all
 * associations).
 */
export interface ServicePayload {
  name: string
  serviceType: ServiceType
  autoRenew: boolean
  autoAddOnAdmission: boolean
  prices: ServicePricePayload[]
  drugs: number[]
}

export type CreateServicePayload = ServicePayload

export type UpdateServicePayload = ServicePayload
