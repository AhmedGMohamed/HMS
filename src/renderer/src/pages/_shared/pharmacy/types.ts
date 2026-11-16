import { Patient } from "@/pages/Patients/types/patient"

/**
 * Pharmacy (Drugs) module — shared domain types.
 *
 * These are the wire-shape types for the pharmacy admin endpoints
 * (`/api/pharmacy/drugs/*`, `/api/warehouse`, `/api/price-lists`).
 * The boundary `lib/api.ts:request` runs `toCamel` on every response,
 * so every field here is camelCase even though the server emits
 * snake_case. Field names match the SQL columns/aliases Express
 * actually returns — no invented joins or nested structures the
 * backend doesn't produce.
 *
 * Historically these lived in `Patients/types/patient.ts` (the patient
 * billing/assigned flows consumed the same `DrugCard`/`DrugShipment`
 * shapes). They are now co-located here so both `Patients` and `Drugs`
 * import a single source of truth with no local duplication.
 */

/* ----------------------------------------------------------------
   Unit conversion
   ---------------------------------------------------------------- */

/** `unit_conversion` SQL emits `{ratio, larger, smaller}` — flat keys. */
export interface UnitConversion {
  larger: string
  smaller: string
  ratio: number
}

/* ----------------------------------------------------------------
   Drug cards
   ---------------------------------------------------------------- */

/**
 * `DrugCard.frequency` is a Postgres `INTERVAL` on the backend. The
 * renderer accepts both the `"HH:MM:SS"` string (default `pg` parser)
 * and the `{ hours, minutes, seconds }` object some serialisers emit
 * (e.g. a `pg-types` `INTERVAL` parser installed, or a JSON middleware
 * that expands the value). `parseInterval` normalises either shape
 * into a `{ hours, minutes, seconds }` triple.
 */
export type DrugCardFrequency =
  | string
  | { hours?: number; minutes?: number; seconds?: number }
  | null

/**
 * `/api/pharmacy/drugs/cards` (paginated envelope element) and
 * `/:id`. The server SELECTs `*` from `DrugCard`; its
 * `unit_conversion` JSONB column returns as a nested object.
 */
export interface DrugCard {
  drugId: number
  name: string
  manufacturer: string | null
  provider: string | null
  isObligatoryContinuous: boolean
  saleQuantity: number
  frequency: DrugCardFrequency
  minStockAlert: number | null
  maxDaysExpiryAlert: number | null
  unitConversion: UnitConversion
  createdByUserId: number
}

/** Payload for `POST /pharmacy/drugs/cards` (wire camelCase, sent toSnake). */
export interface CreateDrugCardPayload {
  name: string
  manufacturer?: string | null
  provider?: string | null
  isObligatoryContinuous: boolean
  saleQuantity: number
  frequency?: string | null
  minStockAlert?: number | null
  maxDaysExpiryAlert?: number | null
  unitConversion: UnitConversion
}

export type UpdateDrugCardPayload = Partial<CreateDrugCardPayload>

/* ----------------------------------------------------------------
   Shipments & prices
   ---------------------------------------------------------------- */

export interface ShipmentPrice {
  pricelistId: number
  price: number | string
  requiresPrepayment: boolean
  prepaymentType: "fixed" | "percentage" | null
  prepaymentAmount: number | null
}

/** Pricelist name, joined only on `getShipmentById` (`getShipmentById`
 *  SELECT includes `pl.name as pricelist_name`). */
export interface ShipmentPriceWithName extends ShipmentPrice {
  pricelistName?: string | null
}

/**
 * `/api/pharmacy/drugs/shipments/drug/:drugId` (and `getShipmentById`)
 * envelope element — `ds.*` plus drug_name, warehouse_name,
 * unit_conversion, quantity_in_larger_unit, prices[].
 */
export interface DrugShipment {
  shipmentId: number
  drugId: number
  warehouseId: number
  /** Current stock (smaller units). */
  quantity: number
  buyPrice: number | string
  expiryDate: string | null
  receivedDate?: string
  drugName: string
  warehouseName: string
  unitConversion: UnitConversion
  /** Server-computed `quantity / ratio` (cast). */
  quantityInLargerUnit: number
  prices: ShipmentPrice[]
}

export interface CreateShipmentPayload {
  drugId: number
  warehouseId: number
  /** Smaller-unit total (renderer converts larger→smaller). */
  quantity: number
  buyPrice: number
  expiryDate: string
  receivedDate?: string
  prices: ShipmentPrice[]
}

export type UpdateShipmentPayload = Partial<
  Omit<CreateShipmentPayload, "drugId">
>

/* ----------------------------------------------------------------
   Stock & enrichment (renderer-computed)
   ---------------------------------------------------------------- */

/** `/api/pharmacy/drugs/cards/monitor/low-stock` element. */
export interface DrugStock {
  drugId: number
  name: string
  minStockAlert: number | null
  unitConversion: UnitConversion
  totalQuantity: number
}

/** `/api/pharmacy/drugs/cards/monitor/near-expiry` element. */
export interface DrugExpiry {
  drugId: number
  name: string
  shipmentId: number
  quantity: number
  expiryDate: string
  maxDaysExpiryAlert: number
  unitConversion: UnitConversion
  daysUntilExpiry: number
}

/** Drug card enriched with renderer-side stock/expiry flags (§3.5.1). */
export interface EnrichedDrugCard extends DrugCard {
  stock?: DrugStock
  isLowStock?: boolean
  isNearExpiry?: boolean
  /** Days until the nearest in-stock shipment expires (within the drug's
   *  alert window). Null when the drug has no near-expiry shipments. */
  daysUntilExpiry?: number | null
  /**
   * ISO date string of the earliest in-stock shipment's expiry date.
   * Populated by `useDrugsList` for every drug — for drugs within the
   * alert window it comes from the `/monitor/near-expiry` endpoint;
   * for drugs with no near-expiry shipments it comes from the per-drug
   * shipment fan-out (the SQL orders by `expiry_date ASC`).
   * Null when the drug has no in-stock shipments at all.
   */
  nearestExpiryDate?: string | null
  /**
   * Authoritative per-drug total stock (sum of every in-stock
   * shipment's `quantity`). Populated by the same fan-out that drives
   * `nearestExpiryDate`. Null while the fan-out is still in flight
   * or when the drug genuinely has zero in-stock shipments.
   */
  totalQuantity?: number | null
}

/* ----------------------------------------------------------------
   Transactions
   ---------------------------------------------------------------- */

export type TransactionType = "patient" | "check" | "outside"

/** `/api/pharmacy/drugs/transactions` + `/search/filtered` element. */
export interface DrugTransaction {
  transactionId: number
  shipmentId: number
  transactionType: TransactionType
  quantity: number
  price: number
  timestamp: string
  createdByUserId: number
  patientId: number | null
  drugId: number
  drugName: string
  warehouseId: number
  warehouseName: string
  unitConversion: UnitConversion
  shipmentBuyPrice: number
  profit: string
  /** Patient name from the `DrugTransaction.patient_id` join.
   *  Null for outside sales and for any row where the join is
   *  unavailable. */
  patientName?: string | null
}

export interface CreateTransactionPayload {
  shipmentId: number
  transactionType: TransactionType
  /** Smaller-unit total (renderer converts). */
  quantity: number
  price: number
  patientId?: number | null
}

/**
 * Wire shape for `POST /api/patients/:id/drugs` — the patient-side
 * sell path that *also* writes a `BillDetail` row (charge_type='drug',
 * sale_type='admitted'). Required for any sell with
 * `transactionType = "patient" | "check"` because the controller's
 * `addDrugToPatient` validates `patient_history_id` and rejects
 * "Patient is not currently admitted" otherwise. The drugs sale goes
 * onto the patient's active admission bill in the same transaction.
 *
 * `drugId` is the parent drug; `shipmentId` is the specific batch
 * being decremented (both must agree — the server enforces this).
 */
export interface AddDrugToPatientPayload {
  drugId: number
  shipmentId: number
  quantity: number
  price: number
  patientHistoryId: number
}

/**
 * Result of `addDrugToPatient` — the controller returns the freshly
 * created `DrugUsage` row joined with patient/drug name fields.
 * Renderer only needs a success signal; the field set is kept narrow
 * so a schema change to the join doesn't break callers.
 */
export interface DrugUsageResult {
  usageId: number
  patientId: number
  drugId: number
  patientHistoryId: number
  shipmentId: number
  quantity: number
  price: number
  administeredAt: string | null
  stoppedAt: string | null
  isContinuous: boolean
  createdByUserId: number
}

/** `/api/pharmacy/drugs/transactions/reports/summary` shape. */
export interface TransactionSummary {
  totalQuantity: number
  totalSales: number
  totalCost: number
  totalProfit: number
  transactionCount: number
}

export interface TransactionFilters {
  startDate?: string
  endDate?: string
  transactionType?: TransactionType
  drugId?: number
  warehouseId?: number
}

/* ----------------------------------------------------------------
   Warehouses
   ---------------------------------------------------------------- */

export interface Warehouse {
  warehouseId: number
  name: string
  location: string
}

/** `/api/warehouse` — already aggregates per-warehouse stats. */
export interface WarehouseWithStats extends Warehouse {
  totalShipments: number
  totalDrugs: number
  totalStockValue: number
}

export interface CreateWarehousePayload {
  name: string
  location: string
}

export type UpdateWarehousePayload = Partial<CreateWarehousePayload>

/** `/api/warehouse/:id/inventory` element (derived via shipments when
 *  the dedicated inventory route is not mounted — see §3.2). */
export interface WarehouseInventoryItem {
  shipmentId: number
  drugId: number
  drugName: string
  manufacturer: string | null
  quantity: number
  buyPrice: number | string
  expiryDate: string | null
  receivedDate?: string
  unitConversion: UnitConversion
  expiryStatus: "ok" | "warning" | "expired"
}

/* ----------------------------------------------------------------
   Lookups
   ---------------------------------------------------------------- */

/** `/api/price-lists` element. */
export interface PriceList {
  pricelistId: number
  name: string
  isDefault: boolean
}

/** Active patient from `/api/patients/active` (subset used by Sell). */
export interface ActivePatient extends Patient {
  isActive: true
  activePatientHistoryId: number
  quickCheck: boolean
}

/* ----------------------------------------------------------------
   Medical Supplies Domain Types (Phase 6.5)
   ----------------------------------------------------------------
   Wire-shape types for the medical-supplies admin endpoints
   (`/api/pharmacy/medical-supplies/*`, `/api/medical-supply-shipments/*`,
   `/api/medical-supply-usages/*`). The boundary `lib/api.ts:request`
   runs `toCamel` on every response, so every field here is camelCase
   even though the server emits snake_case. Field names match the SQL
   columns/aliases Express actually returns.

   Unlike drugs, medical supplies have NO unit conversion — every
   quantity is an integer. The shipment / sale / dispense flow is
   correspondingly simpler (no `unitConversion` field, no dual-unit
   inputs, no `quantityInLargerUnit` derivation).
*/

export interface MedicalSupply {
  supplyId: number
  name: string
  manufacturer: string | null
  provider: string | null
  isObligatoryContinuous: boolean
  saleQuantity: number
  frequency: string | null
  minStockAlert: number | null
  createdByUserId: number
}

export interface CreateMedicalSupplyPayload {
  name: string
  manufacturer?: string | null
  provider?: string | null
  isObligatoryContinuous: boolean
  saleQuantity: number
  frequency?: string | null
  minStockAlert?: number | null
}

export type UpdateMedicalSupplyPayload = Partial<CreateMedicalSupplyPayload>

/* Medical supply shipment price (subset of drug shipment price — no
   `pricelistName` is joined in the supply-shipment list endpoint). */
export interface MedicalSupplyShipmentPrice {
  pricelistId: number
  price: number | string
  requiresPrepayment: boolean
  prepaymentType: string | null
  prepaymentAmount: number | null
}

/**
 * Wire element for `/api/pharmacy/medical-supply-shipments/supply/:id`
 * and `/api/pharmacy/medical-supply-shipments/warehouse/:id`. The
 * server's SELECT aliases `warehouse_name` onto the row, so the
 * `warehouseName` is part of every list response.
 *
 * `expiryDate` is intentionally nullable: per `phase_6.5_plan.md`
 * §3.4 the supplies flow treats the shipment expiry as OPTIONAL
 * (the legacy supplies page never asked for one, and the SQL column
 * is `expiry_date DATE` without a NOT NULL). The renderer renders
 * `—` for null, and the form's date input clears with an empty
 * string which the controller normalises back to `null` server-side.
 */
export interface MedicalSupplyShipment {
  shipmentId: number
  supplyId: number
  warehouseId: number
  warehouseName: string
  /** Original buy quantity (smaller units); kept for audit parity. */
  buyQuantity?: number
  /** Current stock (smaller units). */
  quantity: number
  buyPrice: number | string
  /** ISO date string or `null` (see interface doc above). */
  expiryDate: string | null
  receivedDate?: string
  prices: MedicalSupplyShipmentPrice[]
  /** Server may include supply name in detail endpoints. */
  supplyName?: string
}

export interface CreateSupplyShipmentPayload {
  supplyId: number
  warehouseId: number
  quantity: number
  buyPrice: number
  expiryDate?: string | null
  /**
   * Price-list rows. The supplies flow supports the same prepayment
   * fields as drugs (the form's `PriceField` carries
   * `requiresPrepayment` / `prepaymentType` / `prepaymentAmount`),
   * but the legacy controller accepts the trimmed `{ pricelistId,
   * price }` shape. The full shape is passed through so the backend
   * DTO can grow to honour it without a renderer-side change.
   */
  prices: {
    pricelistId: number
    price: number
    requiresPrepayment?: boolean
    prepaymentType?: "fixed" | "percentage" | null
    prepaymentAmount?: number | null
  }[]
}

export type UpdateSupplyShipmentPayload = Partial<
  Omit<CreateSupplyShipmentPayload, "supplyId">
>

/** `/api/pharmacy/medical-supplies/monitor/low-stock` element. */
export interface MedicalSupplyStock {
  supplyId: number
  name: string
  minStockAlert: number | null
  totalQuantity: number
}

/** Per-supply near-expiry element. */
export interface MedicalSupplyExpiry {
  supplyId: number
  name: string
  shipmentId: number
  quantity: number
  expiryDate: string
  daysUntilExpiry: number
}

/** Drug-supply enriched with renderer-side flags. */
export interface EnrichedMedicalSupply extends MedicalSupply {
  stock?: MedicalSupplyStock
  isLowStock?: boolean
  isNearExpiry?: boolean
  /** Days until the earliest in-stock shipment expires. */
  daysUntilExpiry?: number | null
  /** ISO date string of the earliest in-stock shipment's expiry date. */
  nearestExpiryDate?: string | null
  /** Authoritative per-supply total stock (sum of in-stock shipments). */
  totalQuantity?: number | null
  /** Count of in-stock shipments (rendered in the expand chevron hint). */
  shipmentsCount?: number
}

/* ----------------------------------------------------------------
   Inpatient Supply Usage & History Types
   ---------------------------------------------------------------- */

export interface MedicalSupplyUsageRow {
  usageId: number
  patientId: number
  patientName: string
  supplyId: number
  supplyName: string
  transactionId: number
  initialQuantity: number
  remainingQuantity: number
  startDate: string
  lastAdministered: string | null
  isActive: boolean
  warehouseName?: string
  unitPrice?: number
}

export interface SupplyUsageFilters {
  startDate?: string
  endDate?: string
  patientId?: number
  supplyId?: number
  isActive?: boolean
  search?: string
  limit?: number
  offset?: number
}

export interface SupplyUsageSummaryMetrics {
  totalUnitsDispensedAllTime: number
  totalUnitsDispensedLast30Days: number
  activeUsagesCount: number
  totalPatientsServed: number
}

export interface DispenseSupplyPayload {
  supplyId: number
  shipmentId: number
  quantity: number
  price: number
  patientHistoryId: number
}

/* ----------------------------------------------------------------
   Supply-side Warehouse Inventory (renderer view-model)
   ---------------------------------------------------------------- */

/**
 * Per-warehouse supply breakdown returned by
 * `/api/pharmacy/medical-supply-shipments/warehouse/:id`. The server
 * already returns each row joined with `warehouse_name` and
 * `supply_name` — we keep the type narrow.
 */
export interface WarehouseSupplyInventoryItem {
  shipmentId: number
  supplyId: number
  supplyName: string
  quantity: number
  buyPrice: number | string
  expiryDate: string | null
  status: "ok" | "warning" | "expired"
}