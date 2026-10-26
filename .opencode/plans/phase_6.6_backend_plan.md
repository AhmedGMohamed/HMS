# Implementation Plan — Phase 6.6 (Backend): Price Lists Bulk Pricing & Service Endpoint Fixes

**Scope:** Backend companion for Phase 6.6 (Price Lists + Services renderer). Adds a transactional bulk-prices endpoint, batch stats on the price-list listing, FK-friendly deletes (409), Service controller/model fixes, unshadows dead search routes, and a default-price-list invariant guard.  
**Target:** Express + PostgreSQL (backend only; companion to `phase_6.6_plan.md`).  
**Companion:** `phase_6.6_plan.md` (renderer) documents the frontend depending on this contract.

---

## 1. Context & Motivation

The Price Lists renderer needs a single transactional "Add Prices" save across services, drug shipments, and supply shipments — the existing per-entity PUT endpoints are gated on `manage_pharmacy`/`manage_supplies`, while the page's permission is `manage_prices`. Secondary fixes close known server bugs found during planning.

**No DB schema changes** — all items are query/route/controller logic over existing tables; deployment-safe, no migration step.

---

## 2. Deliverables

### 2.1 `PUT /api/price-lists/:id/prices` (new)

- **Files:** `src/app/routes/priceList.routes.ts` (route after `verifyToken` + `checkPermission("manage_prices")` + `auditLogger`), `src/app/controllers/PriceList.controller.ts`, `src/app/models/PriceList.model.ts`.
- **Body** (all sections optional; an entry's `price: null` = **remove** that price; entries with a missing `price` key are invalid):
  ```json
  {
    "services":       [{ "service_id": 1, "price": 100.5, "requires_prepayment": false, "prepayment_type": null, "prepayment_amount": null },
                       { "service_id": 2, "price": null }],
    "drugShipments":  [{ "shipment_id": 3, "price": 55, "requires_prepayment": true, "prepayment_type": "percentage", "prepayment_amount": 20 }],
    "supplyShipments":[{ "shipment_id": 7, "price": 30 },
                       { "shipment_id": 9, "price": null }]
  }
  ```
- **Semantics:** single `BEGIN/COMMIT` transaction (raw `query("BEGIN")` — codebase-wide pattern). `price: null` → `DELETE FROM <ServicePrice|ShipmentPrice|MedicalSupplyShipmentPrice> WHERE entity_id = $1 AND pricelist_id = $2` (no-op if absent). Otherwise UPSERT per `(entity_id, pricelist_id)` — other lists' prices untouched. Supplies: no prepayment (mirror `MedicalSupplyShipmentPrice` usage).
- **Validation:** upsert entries — `price` numeric; services `price >= 0`, shipments `price > 0` (matches each domain's existing rules). Prepayment (services + drugs only): `prepayment_type` ∈ fixed|percentage, amount required when `requires_prepayment`, percentage 0–100, fixed ≥ 0 — same rules as `DrugShipment.model.updateShipment`. Removal entries — no other fields required/validated.
- **Response:** `200 { total_services: n, total_drugs: n, total_supplies: n, removed_prices: n }` (fresh stats for the list + removal count — lets the UI patch counts and build the toast without extra fetches). Errors: 400 invalid body, 404 list missing, 500 otherwise.

### 2.2 Batch stats on `GET /api/price-lists`

- Extend `PriceList.model.getAllPriceLists` to join/aggregate the three counts (`ServicePrice` rows; `ShipmentPrice`→`DrugShipment` qty>0; `MedicalSupplyShipmentPrice`→`MedicalSupplyShipment` qty>0) and return `total_services`, `total_drugs`, `total_supplies` per list. Keep `/:id/stats` route for backward compat. Note: the declared `PriceListStats` TS interface is stale (runtime keys are `total_*`).

### 2.3 FK-friendly deletes (409)

- `DELETE /api/services/:id`: pre-check `ActivePatientService` (is_active rows) and `BillDetail` references → `409 { error: "Cannot delete this service: it is used by N active patient service(s) and M bill line(s)." }`.
- `DELETE /api/price-lists/:id`: pre-check `Patient`, `PatientHistory`, `InsuranceCompany` → `409 { error: "Cannot delete this price list: N patient(s), M admission(s), K insurance company(ies) reference it." }`. Existing default-400 stays.

### 2.4 Service controller fixes

- `Service.controller.getServiceById`: guard `prices`/`drugs` `null` → `[]` (fixes 500 on price-less services; remove unguarded `.forEach`).
- `Service.model.updateService`: when `UPDATE` affects 0 rows → throw → controller returns **404** (currently 500).

### 2.5 Dead search routes

- `src/app/routes/service.routes.ts`: move `GET /search` and `GET /suggestions` **above** `GET /:id` (currently shadowed). No behavior change for the React pages (they filter client-side).

### 2.6 Default-invariant guard

- `PriceList.model.updatePriceList`: if `is_default === false` and this row is currently the default → `400 { error: "Cannot unset the default price list. Set another list as default first." }`.

### 2.7 Backend tests (`src/app/tests/`, following `db.helper.ts` patterns)

- Bulk endpoint: upsert across all 3 sections; removal entries (`price: null`) delete only the target (entity, list) row and leave other lists untouched; mixed set+remove in one call; removal of absent price = no-op; blank/invalid entries rejected; prepayment validation errors; `manage_prices` allowed / other-permission user 403.
- Batch stats counts; FK 409s (service referenced by BillDetail; list referenced by Patient); default-unset 400; `getServiceById` with zero prices.
- Mind the test-schema drift: test `ServicePrice` declares `service_price_id SERIAL PK` **plus** composite `(service_id, pricelist_id)` (differs from prod schema) — seed via `db.helper.ts` (lists: Standard (default), VIP, Insurance; services priced in every list).

---

## 3. Verification

- Jasmine suite green incl. new tests (existing test script).
- `npm run lint` clean.
