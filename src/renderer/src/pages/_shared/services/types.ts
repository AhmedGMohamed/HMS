/**
 * Services module — shared domain types.
 *
 * Wire-shape types for `/api/services`. Shared between the `Services`
 * module (Stage 2) and the `PriceLists` module (the Add Prices flow's
 * services tab consumes the same list endpoint — decision #11 of
 * `phase_6.6_plan.md`).
 *
 * The boundary `lib/api.ts:request` runs `toCamel` on every response,
 * so every field here is camelCase even though the server emits
 * snake_case. Field names match the SQL columns/aliases Express
 * actually returns.
 */

export type ServiceType = "once" | "hourly" | "daily"

/**
 * Per-list price row. `GET /api/services` returns `price` as a JSON
 * number (via `json_agg`), while `GET/PUT /api/services/:id` return it
 * as a string (`toFixed(2)` server-side) — normalize with `Number()`
 * at the boundary. `prices`/`drugs` are SQL `null` when empty →
 * normalize to `[]` (see `normalizeService`).
 */
export interface ServicePrice {
  pricelistId: number
  price: number | string
  requiresPrepayment: boolean
  prepaymentType: "fixed" | "percentage" | null
  prepaymentAmount: number | null
}

export interface ServiceDrug {
  serviceId: number
  drugId: number
  name: string
}

/** `/api/services` element (list, by-id, and PUT responses). */
export interface Service {
  serviceId: number
  name: string
  serviceType: ServiceType
  autoRenew: boolean
  autoAddOnAdmission: boolean
  /** Null (not `[]`) when the service has no prices. */
  prices: ServicePrice[] | null
  /** Null (not `[]`) when the service has no drug links. */
  drugs: ServiceDrug[] | null
}

/** Renderer-normalized service: null arrays → `[]`, prices → numbers. */
export interface NormalizedService extends Omit<Service, "prices" | "drugs"> {
  prices: ServicePrice[]
  drugs: ServiceDrug[]
}

/** Normalize one wire service (null arrays → [], price → number). */
export function normalizeService(service: Service): NormalizedService {
  return {
    ...service,
    prices: (service.prices ?? []).map((p) => ({
      ...p,
      price: Number(p.price),
    })),
    drugs: service.drugs ?? [],
  }
}
