# Implementation Plan — Phase 6.4: Pharmacy (Drugs)

**Scope:** Full React refactoring for Pharmacy Drugs Management (`/drugs`), including Drug Cards, Expandable Shipments, Direct Sales / Transactions, Warehouses Management, and Transaction Logs.  
**Target:** React 19 + Vite 6 + Tailwind v4 + shadcn/ui + react-hook-form + Zod + react-i18next.  
**Legacy Replacement:** `src/app/views/pharmacy/drugs.html`, `src/app/views/js/pharmacy/drugs.ts`, `src/app/views/css/pharmacy.css`, `src/app/views/css/pharmacy-rtl.css`.  
**Route:** `/drugs` (Guarded by `PermissionRoute` with permission `manage_pharmacy`).

> **Backend dependency:** Patient sale persistence and quantity handling require backend changes that are tracked separately in `phase_6.4_backend_plan.md`. This document is **renderer-only**; it documents the API contract it depends on (see §1.1) and flags any feature gated behind the backend phase.

---

## 1. Architectural Decisions Summary

| # | Topic | Decision |
|----|-------|----------|
| 1 | **Page Layout** | **3 Tabs** on `/drugs`: `Drugs Inventory`, `Warehouses`, and `Transactions History` using shadcn `<Tabs>` and vertical/horizontal responsive navigation. |
| 2 | **Shipments Display** | **Expandable Accordion Sub-row** in the Drugs table (inline accordion revealing active shipments with warehouse, stock counts in larger/smaller units, expiry status, prices, and quick action buttons: Sell, Edit, Delete). |
| 3 | **KPI Strip** | **4 StatCards** at the top of the Drugs tab: Total Drugs, Low Stock Alert, Expiring Soon, Total Inventory Value. **KPI cards are clickable filters**; tapping a card applies/releases the corresponding filter. The separate filter chips (All, Low Stock, Near Expiry) remain as a secondary affordance and stay in sync with the selected KPI card. |
| 4 | **Direct Sales** | Dedicated **Sell Drug Dialog** triggered per shipment: supports `patient` (patient picker), `check` (medical check — **also uses patient picker**), or `outside` sale, unit conversion calculation (renderer-side), price list selection, price verification against buy price, and submission to `/api/pharmacy/drugs/transactions`. |
| 5 | **Warehouse Management** | Dedicated **Warehouses Tab** with full CRUD: add/edit warehouse dialogs, delete confirmations with dependency checks, and "View Inventory" modal (summary stat cards + per-shipment breakdown list). |
| 6 | **i18n & RTL** | Uses `pharmacy` namespace, full RTL support via CSS logical properties (`ms-`, `pe-`, `inset-s-`). **New translation keys are required** for tabs, KPI strip, transactions table, filters, and summary cards — see §3.6. |

### 1.1 Backend API contract (dependency on `phase_6.4_backend_plan.md`)

The renderer depends on the following backend behavior. Items marked **`[gated]`** are not yet implemented and are tracked in the backend plan; the renderer MUST guard against them until the backend lands.

| Feature | Current backend | Required contract |
|---------|-----------------|-------------------|
| **Patient sale linkage** `[gated]` | `DrugTransaction` has no `patient_id`; a sent `patient_id` is silently dropped | `DrugTransaction.patient_id` column + patient name join in transaction SELECTs |
| **Patient sale → DrugUsage** `[gated]` | Patient sales never create a `DrugUsage` | Patient sale creates/links a `DrugUsage` row |
| **Quantity conversion** | Server stores `quantity` as given (smaller units); no conversion | **Renderer converts to smaller units and sends a single integer `quantity`; server validates** `> 0` and `<= available`. No server-side multiply. |
| **Transaction wire fields** | SELECT emits `drugId`, `warehouseId`, `drugName`, `warehouseName`, `unitConversion`, `shipmentBuyPrice`, `profit`, `timestamp` | Confirmed; no changes needed |
| **`patientName` in transactions** `[gated]` | Not emitted (`Patient` not joined) | Add `patientName` join for `patient`/`check` types (backend phase) |

---

## 2. Directory & File Structure

All new files will be placed under `src/renderer/src/pages/Drugs/`:

```
src/renderer/src/pages/Drugs/
├── DrugsPage.tsx                           # Main page container with Tabs (Inventory, Warehouses, Transactions)
├── api.ts                                  # Complete API client for Drugs, Shipments, Transactions, Warehouses
├── types/
│   └── drug.ts                             # Re-exports shared domain types (see §3.1) — NO local duplication
├── schemas/
│   ├── drug.schema.ts                      # Zod schema for Drug Card create/update
│   ├── shipment.schema.ts                  # Zod schema for Drug Shipment create/update with price list matrix
│   ├── sell.schema.ts                      # Zod schema for Direct Sale transaction
│   └── warehouse.schema.ts                 # Zod schema for Warehouse create/update
├── hooks/
│   ├── useDrugsList.ts                     # Hook for drugs fetching, stock calculation, search & filtering
│   ├── useDrugShipments.ts                 # Hook for fetching/mutating shipments of a drug
│   ├── useWarehouses.ts                    # Hook for warehouse listing & inventory summary
│   ├── useDrugTransactions.ts              # Hook for transaction logs & summaries
│   └── usePharmacyKpi.ts                   # Hook for top KPI metrics calculation
├── components/
│   ├── PharmacyKpiStrip.tsx                # 4 KPI StatCards (clickable filters)
│   ├── DrugsTable/
│   │   ├── DrugsTable.tsx                  # Main table for Drug Cards with expandable rows
│   │   ├── DrugTableRow.tsx                # Single drug row with stock badges, nearest expiry & actions
│   │   ├── DrugShipmentsSubTable.tsx       # Expanded shipment list for a single drug
│   │   └── ShipmentRow.tsx                 # Shipment item with price list chips & action buttons
│   ├── Warehouses/
│   │   ├── WarehousesPanel.tsx             # Warehouses tab panel with table & actions
│   │   └── WarehouseInventoryDialog.tsx    # Modal: summary stat cards + per-shipment breakdown
│   └── Transactions/
│       ├── TransactionsPanel.tsx           # Transactions history tab with date/type filters
│       └── TransactionSummaryCards.tsx     # Summary metrics for filtered transactions
└── modals/
    ├── DrugCardModal.tsx                   # Create / Edit Drug Card dialog (with unit conversion preview)
    ├── ShipmentModal.tsx                   # Add / Edit Shipment dialog (with dynamic price list inputs & prepayment)
    ├── SellDrugModal.tsx                   # Sell Drug dialog (patient/check/outside, live price calculation)
    └── WarehouseModal.tsx                  # Add / Edit Warehouse dialog
```

---

## 3. Detailed Component & Module Specifications

### 3.1 Shared types (`types/drug.ts`)

Drug/Shipment/Warehouse types **already exist** in `src/renderer/src/pages/Patients/types/patient.ts:188-267` and server-side `src/app/utils/types/drugs.d.ts`. Per the approved decision, extract these into a **shared module** and import from both `Patients` and `Drugs` — no local duplication.

**Shared location:** `src/renderer/src/pages/_shared/pharmacy/types.ts` (new). `pages/Drugs/types/drug.ts` re-exports from it for local discoverability.

Relevant shared types (wire-shape, camelCase — `lib/api.ts` runs `toCamel` on responses):

- `UnitConversion`: `{ larger: string; smaller: string; ratio: number }`
- `DrugCard`: `{ drugId: number; name: string; manufacturer: string | null; provider: string | null; isObligatoryContinuous: boolean; saleQuantity: number; frequency: string | null; minStockAlert: number | null; maxDaysExpiryAlert: number | null; unitConversion: UnitConversion; createdByUserId: number }`
- `ShipmentPrice`: `{ pricelistId: number; price: number | string; requiresPrepayment: boolean; prepaymentType: 'fixed' | 'percentage' | null; prepaymentAmount: number | null }`
- `DrugShipment`: `{ shipmentId: number; drugId: number; warehouseId: number; quantity: number; buyPrice: string | number; expiryDate: string | null; receivedDate?: string; drugName: string; warehouseName: string; unitConversion: UnitConversion; quantityInLargerUnit: number; prices: ShipmentPrice[] }`
- `DrugStock`: aggregate computed in the renderer (see §3.5.1)
- `EnrichedDrugCard`: `DrugCard & { stock?: DrugStock; isLowStock?: boolean; isNearExpiry?: boolean; daysUntilExpiry?: number | null }`
- `DrugTransaction`: `{ transactionId: number; shipmentId: number; transactionType: 'patient' | 'check' | 'outside'; quantity: number; price: number; timestamp: string; drugId: number; warehouseId: number; drugName: string; warehouseName: string; unitConversion: UnitConversion; shipmentBuyPrice: number; profit: string }`
- `DrugTransactionPatient` `[gated]`: extends `DrugTransaction` with `patientId?: number | null; patientName?: string | null` — only valid once the backend adds the column/join.
- `Warehouse`: `{ warehouseId: number; name: string; location: string; totalShipments?: number; totalDrugs?: number; totalStockValue?: number }`
- `PriceList`: shape to be confirmed against `PriceListController.getAllPriceLists()` — see §3.2 note.
- `ActivePatient`: `{ patientId: number; name: string; isActive: boolean }` (verify actual `/api/patients/active` response shape)

### 3.2 `api.ts`

Comprehensive wrapper utilizing `api` from `@/lib/api` (note: `lib/api.ts` prefixes `/api` and runs `toCamel`/`toSnake` automatically — use renderer-side path + camelCase payloads):

- **Drug Cards:**
  - `listDrugCards(params?)` → `GET /pharmacy/drugs/cards`
  - `getDrugCard(id)` → `GET /pharmacy/drugs/cards/:id`
  - `createDrugCard(payload)` → `POST /pharmacy/drugs/cards`
  - `updateDrugCard(id, payload)` → `PUT /pharmacy/drugs/cards/:id`
  - `deleteDrugCard(id)` → `DELETE /pharmacy/drugs/cards/:id`
  - `getLowStockDrugs()` → `GET /pharmacy/drugs/cards/monitor/low-stock`
  - `getNearExpiryDrugs()` → `GET /pharmacy/drugs/cards/monitor/near-expiry`
- **Shipments:**
  - `listDrugShipments(drugId)` → `GET /pharmacy/drugs/shipments/drug/:id`
  - `getShipment(id)` → `GET /pharmacy/drugs/shipments/:id`
  - `createShipment(payload)` → `POST /pharmacy/drugs/shipments`
  - `updateShipment(id, payload)` → `PUT /pharmacy/drugs/shipments/:id`
  - `deleteShipment(id)` → `DELETE /pharmacy/drugs/shipments/:id`
- **Transactions:**
  - `createTransaction(payload)` → `POST /pharmacy/drugs/transactions`
  - `listTransactions(filters?)` → `GET /pharmacy/drugs/transactions/search/filtered`
  - `getTransactionSummary(filters?)` → `GET /pharmacy/drugs/transactions/reports/summary`
- **Warehouses:**
  - `listWarehouses()` → `GET /warehouse` (returns stats already: `totalShipments`, `totalDrugs`, `totalStockValue`)
  - `getWarehouse(id)` → `GET /warehouse/:id`
  - `createWarehouse(payload)` → `POST /warehouse`
  - `updateWarehouse(id, payload)` → `PUT /warehouse/:id`
  - `deleteWarehouse(id)` → `DELETE /warehouse/:id`
  - `getWarehouseInventory(id)` → `GET /warehouse/:id/inventory` (verify: controller exposes `getWarehouseInventory`; confirm route path in `warehouse.routes.ts` — **route not currently mounted**, may need backend addition)
  - `getWarehouseShipments(id)` → `GET /warehouse/:id/shipments` (same route-mount caveat)
- **Lookups:**
  - `listPriceLists()` → `GET /price-lists` (confirm response shape; the plan's assumed `{ pricelistId, name, isDefault }` must be verified against `PriceListController.getAllPriceLists()`)
  - `getActivePatients()` → `GET /patients/active`

> **Route-mount caveat:** `Warehouse.controller` implements `getWarehouseInventory` and `getWarehouseShipments`, but `warehouse.routes.ts` does **not** mount them. Either add these routes in the backend phase or derive the "View Inventory" breakdown from already-available endpoints (`listWarehouses()` for stats + `listDrugShipments`/`getShipmentsByWarehouse` for per-shipment data). Confirm before Step 3.

### 3.3 Form Schemas (`schemas/*.ts`)

1. **`drug.schema.ts`**:
   - `name`: string min 3 chars
   - `manufacturer`: optional string
   - `provider`: optional string
   - `saleQuantity`: positive integer (min 1)
   - `unitConversion`: object `{ larger: min 1 char, smaller: min 1 char, ratio: min 1 integer }`
   - `minStockAlert`: non-negative integer or null
   - `maxDaysExpiryAlert`: non-negative integer or null
   - `isObligatoryContinuous`: boolean
   - `frequency`: string (matches server — stored as string; UI may offer an "every N hours" helper that **serializes to a string**)
2. **`shipment.schema.ts`**:
   - `warehouseId`: positive number (required)
   - `quantity`: positive integer; **the renderer converts larger-unit input to smaller units before submit** (multiply `larger × ratio`, add smaller remainder). The submitted `quantity` is the smaller-unit total integer.
   - `buyPrice`: positive number (min 0.01)
   - `expiryDate`: future date string
   - `prices`: array of `{ pricelistId, price, requiresPrepayment, prepaymentType, prepaymentAmount }`
     - Default price list price is required (> 0)
     - Prepayment amount required if `requiresPrepayment` is checked; percentage max 100
3. **`sell.schema.ts`**:
   - `transactionType`: enum `'patient' | 'check' | 'outside'`
   - `patientId`: required when `transactionType` is `'patient'` **or `'check'`** (per decision: `check` also uses the patient picker)
   - `quantityLarger`: non-negative integer
   - `quantitySmaller`: non-negative integer
   - Resolved smaller-unit total = `quantityLarger * ratio + quantitySmaller`; validated `> 0` and `<= available`.
   - `priceListId`: number
   - `totalPrice`: positive number
4. **`warehouse.schema.ts`**:
   - `name`: string min 3 chars
   - `location`: string min 5 chars

### 3.4 Modals & Dialogs

1. **`DrugCardModal.tsx`**:
   - Full responsive form with live unit conversion preview badge (`1 [larger] = [ratio] [smaller]`).
   - Fields for basic info, unit conversion cards, alerts & continuous dosage frequency.
2. **`ShipmentModal.tsx`**:
   - Select warehouse, enter quantity in larger units (shows converted smaller-unit total), buy price, expiry date picker.
   - Dynamic price lists section with default price highlighted, individual price inputs, prepayment checkbox with fixed/percentage switcher.
3. **`SellDrugModal.tsx`**:
   - Select transaction type (`patient`, `check`, `outside`); **loads active patients dropdown for both `patient` and `check` types**.
   - Dual-unit quantity inputs with live available stock display; renderer computes final smaller-unit quantity.
   - Price list selector with auto-calculated total price and override capability.
   - Warning alert if selling unit price is below shipment buy price.
4. **`WarehouseModal.tsx`**:
   - Add and edit warehouse name & location.
5. **`WarehouseInventoryDialog.tsx`**:
   - **Summary stat cards** (Total Shipments, Total Drugs, Total Stock Value) on top + **per-shipment breakdown list** (drug name, quantity, buy price, expiry, status badge) beneath.
6. **Confirmation Dialogs**:
   - `ConfirmDialog` for deleting drug (critical stock warning if `EnrichedDrugCard.stock.totalQuantity > 0`; backend also blocks delete when shipments exist).
   - `ConfirmDialog` for deleting shipment (stock removal warning).
   - `ConfirmDialog` for deleting warehouse (disabled/blocked if shipments exist).

### 3.5 Core Pages & Panels

#### 3.5.1 `useDrugsList.ts` — stock aggregation (avoid N+1)
The main Drugs table needs per-drug total stock + nearest expiry. `listDrugCards()` does NOT include aggregated stock. To avoid an N+1 over `listDrugShipments(drugId)`, aggregate in the hook:
- Load `listDrugCards()` for the base list.
- Load `getLowStockDrugs()` + `getNearExpiryDrugs()` (flat lists) and cross-join to produce `isLowStock` / `isNearExpiry` / `daysUntilExpiry`.
- For total stock per drug, use `getLowStockDrugs()` (`totalQuantity`) where available; for non-low-stock drugs, either a batched fetch or accept a follow-up per-expanded-row fetch (`useDrugShipments`).
- Filtering: search (debounced) + KPI-card filter (low stock / near expiry / all) + independent chips (kept in sync).

#### 3.5.2 `PharmacyKpiStrip.tsx`
- 4 `StatCard`s: Total Drugs, Low Stock Alert, Expiring Soon, Total Inventory Value.
- **Clickable**: tapping a card toggles the corresponding filter (Low Stock → low-stock filter; Expiring Soon → near-expiry filter; Total Drugs / Total Value → clear filter to "All"). Selected card shows `bg-primary-light` + `ring-1 ring-primary` (reuse `design.md §6.2` selected-row treatment).
- A single source of truth: the active KPI filter is lift into `DrugsPage` state, and the Filter chips render from the same state (chips remain available but always reflect the KPI selection).

#### 3.5.3 `DrugsTable.tsx` & `DrugTableRow.tsx`
- Top KPI Strip (above) + search bar (debounced) + filter chips.
- Table columns: expand chevron, Drug Name, Manufacturer/Provider, Auto-renew/Frequency badge, Total Stock (`X larger + Y smaller`, red badge if below min alert), Nearest Expiry (warning/danger badge + days remaining), Actions (Edit, Delete).
- Expanded row embeds `DrugShipmentsSubTable` (per-shipment: warehouse, buy price, quantity, expiry, price badges, actions Sell/Edit/Delete + `+ Add New Shipment`).
- Honors `design.md §6.2`: sticky header (`bg-surface-muted`), `h-12` rows, `bg-primary-light/60` hover, tabular-nums on numeric columns, `<Badge>` with icon + text (never color alone), `<EmptyState>` when empty, skeleton rows while loading.

#### 3.5.4 `WarehousesPanel.tsx`
- "Add New Warehouse" button; table with Name, Location, Total Shipments, Actions (Edit, View Inventory, Delete).
- "View Inventory" opens `WarehouseInventoryDialog` (summary + breakdown).

#### 3.5.5 `TransactionsPanel.tsx`
- Date range pickers, Transaction Type filter (All / Patient / Check / Outside), Drug filter, Warehouse filter.
- `TransactionSummaryCards`: Total Sales, Total Revenue, Total Units Sold (from `getTransactionSummary`).
- Filtered transactions table: timestamp, drug, warehouse, quantity, price, type, patient name (`[gated]` — show `—`/omit until backend join lands).

### 3.6 New translation keys

The existing `pharmacy.{en,ar}.json` lacks keys for the new features. Add (dotted keys under `pharmacy`):

- Tabs: `tabs.inventory`, `tabs.warehouses`, `tabs.transactions`
- KPI strip: `kpi.totalDrugs`, `kpi.lowStock`, `kpi.expiringSoon`, `kpi.totalValue`
- Transactions: `transactions.title`, `transactions.startDate`, `transactions.endDate`, `transactions.type`, `transactions.drug`, `transactions.warehouse`, `transactions.timestamp`, `transactions.totalSales`, `transactions.totalRevenue`, `transactions.totalUnits`, `transactions.typeAll`, `transactions.typePatient`, `transactions.typeCheck`, `transactions.typeOutside`
- `check` type label already exists in `transactionTypes.check`; reuse.

Run `npm run check-i18n:renderer` after adding.

---

## 4. Phased Implementation Steps

> **Execution order.** Each phase is independently verifiable (typechecks + lints clean) and lands as a coherent unit. Phases 1–4 are pure renderer additive work; Phase 5 wires the page and i18n. No phase blocks on the tracked `phase_6.4_backend_plan.md` work — the `[gated]` patient/check paths are feature-flagged in the renderer (§1.1) until the backend lands.

| Phase | Deliverable | Key files | Exit criteria |
|-------|-------------|-----------|---------------|
| **P1 — Types & API & schemas** | Shared domain types + full API client + Zod schemas | `pages/_shared/pharmacy/types.ts`, `pages/Drugs/types/drug.ts`, `pages/Drugs/api.ts`, `pages/Drugs/schemas/*.ts`, `Patients/types/patient.ts` (re-export) | `tsc` clean; no local type duplication |
| **P2 — Hooks** | Data-fetching/aggregation hooks | `pages/Drugs/hooks/useDrugsList.ts`, `useDrugShipments.ts`, `useWarehouses.ts`, `useDrugTransactions.ts`, `usePharmacyKpi.ts` | hooks compile; stock aggregation avoids N+1 |
| **P3 — Modals** | Create/edit/sell/warehouse dialogs | `pages/Drugs/modals/*.tsx` (+`WarehouseInventoryDialog`) | each modal zod-validated; below-buy-price safeguard; `[gated]` patient/check guard |
| **P4 — Components** | KPI strip + drugs table + warehouses + transactions panels | `pages/Drugs/components/**` | design.md §6.2 tables; clickable KPI filter SSOT; RTL-safe |
| **P5 — Assembly & i18n** | `DrugsPage` + translation keys + verification | `pages/Drugs/DrugsPage.tsx`, `locales/pharmacy.{en,ar}.json` | `/drugs` renders 3 tabs; `check-i18n:renderer` + lint clean |

---

### Phase 1 — Shared types, API client & schemas

1. **Extract shared types** → `src/renderer/src/pages/_shared/pharmacy/types.ts`:
   - Reuse the wire-sourced `UnitConversion`, `DrugCard`, `DrugShipment`, `DrugShipmentPrice` from `Patients/types/patient.ts:188-302` (already `toCamel`-accurate).
   - Add `DrugStock`, `EnrichedDrugCard`, `DrugTransaction` / `DrugTransactionPatient`, `TransactionSummary`, `Warehouse` / `WarehouseWithStats`, `ShipmentPrice`, `ActivePatient`.
   - `Patients/types/patient.ts` re-exports from the shared module (removes the drug/supply/wares entries it currently owns — no duplication).
2. **`pages/Drugs/types/drug.ts`** → barrel re-export from `_shared/pharmacy/types.ts`.
3. **`pages/Drugs/api.ts`** → typed wrappers over `api` from `@/lib/api` for every endpoint in §3.2 (drug cards, shipments, transactions, warehouses, price lists, active patients). Note the §3.2 route-mount caveat: warehouse *inventory* breakdown derived from `listWarehouses()` stats + `listDrugShipments`/`getShipmentsByWarehouse` (the `getWarehouseInventory`/`getWarehouseShipments` controllers are not route-mounted).
4. **Zod schemas** → `pages/Drugs/schemas/`: `drug.schema.ts`, `shipment.schema.ts`, `sell.schema.ts`, `warehouse.schema.ts` (per §3.3; error messages reference `pharmacy.validation.*` keys).

### Phase 2 — Custom hooks

- `useDrugsList.ts` — base list (`listDrugCards`) + low-stock/near-expiry cross-join (§3.5.1); search (debounced), KPI-filter, sort, pagination via `useListData`.
- `useDrugShipments.ts` — per-drug shipments fetch + create/edit/delete mutations (expand-on-demand).
- `useWarehouses.ts` — warehouse list + CRUD + inventory breakdown.
- `useDrugTransactions.ts` — filtered transactions + summary + `createTransaction` sale.
- `usePharmacyKpi.ts` — 4 KPI metrics (total drugs, low-stock count, near-expiry count, Σ(stock × buy price)).

### Phase 3 — Modals & dialogs

- `DrugCardModal.tsx` (create/edit + live unit-conversion preview), `ShipmentModal.tsx` (warehouse/qty/buy-price/expiry + price-list matrix with prepayment), `SellDrugModal.tsx` (type radio group → patient picker [patient/check] → dual-unit qty → price list + override → below-buy-price warning), `WarehouseModal.tsx`, `WarehouseInventoryDialog.tsx`.
- All destructive paths route through `ConfirmDialog`; `[gated]` patient/check sale disabled with tooltip.

### Phase 4 — Components & panels

- `PharmacyKpiStrip.tsx` (clickable `StatCard`s, SSOT filter), `DrugsTable.tsx` + `DrugTableRow.tsx` + `DrugShipmentsSubTable.tsx` + `ShipmentRow.tsx`, `WarehousesPanel.tsx`, `TransactionsPanel.tsx` + `TransactionSummaryCards.tsx`.

### Phase 5 — Page assembly, routing & i18n

- Assemble `DrugsPage.tsx` (3 shadcn `<Tabs>`: Inventory / Warehouses / Transactions under a single `PageHeader`).
- Routing: `/drugs` already wired in `App.tsx:157`, `lib/routes.ts:37`, `lib/navigation.ts:73`, `lib/breadcrumbs.ts:31` — verify only.
- Add §3.6 translation keys (en + ar); run `npm run check-i18n:renderer`.

### Phase 6 — Verification & polish

- Bilingual EN/AR + RTL (`dir="rtl"`); edge cases (stock depletion, below-buy-price, warehouse delete safeguard, `[gated]` patient/check).
- `npm run lint` + TypeScript compile check.

---

## 5. Verification Plan

### Automated / Build Checks:
1. TypeScript compile check across `src/renderer/src/pages/Drugs/` and `pages/_shared/pharmacy/`.
2. i18n: `npm run check-i18n:renderer` — zero missing keys for `pharmacy`.
3. Lint (`npm run lint`) — no `red/blue-600` literals (semantic tokens only).

### Manual Testing Matrix:
| Feature | Test Case | Expected Result |
|---------|-----------|-----------------|
| **Drug Cards** | Create new drug with unit conversion (e.g., 1 Box = 20 Strips) | Drug created, appears in table with stock 0 |
| **Shipments** | Add shipment to warehouse with default + custom price lists | Stock updates immediately, displays in Box + Strips (renderer converts to smaller units on submit) |
| **Direct Sale (outside)** | Sell quantity with `outside` type | Quantity deducted, transaction logged, success toast |
| **Direct Sale (patient/check)** `[gated]` | Sell to a patient | Requires backend phase; guard/disable until available |
| **KPI filter** | Click "Low Stock" KPI card; chips reflect it | Table filters to low-stock drugs; chip + card stay in sync |
| **Low Stock Alert** | Set min stock to 50, stock falls to 20 | Red badge appears; Low Stock KPI increments |
| **Near Expiry** | Add shipment expiring in 5 days | Amber/red badge with days remaining |
| **Warehouses** | Add warehouse, view inventory (summary + breakdown), delete with shipments | Delete blocked with warning; inventory modal shows stats + list |
| **Transactions** | Filter by date range & type | Filtered list + summary cards update |
| **i18n & RTL** | Toggle language to Arabic | Layout flips RTL; new keys render correctly |

---

## 6. Intuitive UI Design (Pharmacy Page)

> **Goal:** a data-dense but scannable Pharmacy module a pharmacist can operate at a glance — **one page, three modes, zero hunting**. The page maps to an explicit mental model: *the top strip says what needs attention → the drugs table lets you scan and expand drugs → the two companion tabs handle warehouses and history*. Every state (loading, empty, filtered, error) is represented visually, and every destructive/irreversible action is gated behind a confirmation. All spells use the tokens in `design.md §4`, the shared components (`StatCard`, `DataTable`, `PageHeader`, `EmptyState`, `ConfirmDialog`), and shadcn primitives per `design.md §6`. No new design tokens or bespoke primitives are introduced.

### 6.1 Page topology (one `<h1>`, three tabs)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ <PageHeader title="Drug Management"  [eyebrow: "Pharmacy"]               │
│             actions: [ + Create New Drug ]                               │
├──────────────────────────────────────────────────────────────────────────┤
│  [ Pills | Warehouse | History ]  ← shadcn <Tabs>, full-width triggers    │
│  ────────────────────────────────    (icon + label on each trigger)       │
│                                                                          │
│  ▸ Drugs Inventory tab:                                                  │
│    ┌────────────────────────────────────────────────────────────────┐    │
│    │  KPI strip (4 clickable StatCards)                             │    │
│    │  [ Total Drugs ][ Low Stock ][ Expiring Soon ][ Total Value ]  │    │
│    └────────────────────────────────────────────────────────────────┘    │
│    ┌────────────────────────────────────────────────────────────────┐    │
│    │  [ Search… ]      [All] [Low Stock] [Near Expiry]  (synced)    │    │
│    │  ──────────────────────────────────────────────────────────────│    │
│    │  ▸ Drug A     50 Box    Warn (12d)   [◂ expand]  [edit][del]   │    │
│    │    └ shipments (inline sub-table)…                             │    │
│    └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ▸ Warehouses tab:   flat CRUD table + "View Inventory" dialog           │
│  ▸ Transactions tab: filter bar + summary cards + transactions table     │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Page header** uses `PageHeader` (one `<h1>`; no duplicate page title — the breadcrumb already reads "Pharmacy"). Primary action is **Create New Drug** (default `<Button>` with `Plus` icon), kept visible regardless of the active tab because it is the highest-frequency entry point.
- **Tab strip** is the top-level navigation affordance: **Drugs Inventory** (default) → **Warehouses** → **Transactions History**. Each trigger is **icon + text** (Lucide `Pill`, `Warehouse`, `History`) — never icon-only (`design.md §6.7`). Active trigger uses `bg-primary-light text-primary`.

### 6.2 KPI strip — "health at a glance" + filter

Four `StatCard`s double as the page's *attention funnel* and its *filter*:

| Card | Metric | Icon | Click behavior |
|------|--------|------|----------------|
| **Total Drugs** | count of drug cards | `Pill` | clear filter → "All" |
| **Low Stock** | count below `minStockAlert` | `AlertTriangle` (`emphasis="warning"`) | toggle low-stock filter |
| **Expiring Soon** | count within `maxDaysExpiryAlert` | `CalendarClock` (`emphasis="warning"`) | toggle near-expiry filter |
| **Total Inventory Value** | Σ(stock × buy price) | `Wallet` | clear filter → "All" |

- **Single source of truth (SSOT):** the active KPI filter is lifted into `DrugsPage` state. Both the KPI cards and the secondary filter chips read/write the same value, so they can never drift (decision #3). Filter chips (`All` / `Low Stock` / `Near Expiry`) remain a secondary, always-synced affordance for discoverability.
- **Selected affordance** reuses `design.md §6.2` selected-row treatment — `bg-primary-light` + `ring-1 ring-primary` — surfaced through `StatCard.onClick`, which already renders the card as a keyboardable `<button>`.
- **Emphasis is semantic + icon, never color alone:** "Low Stock" and "Expiring Soon" carry both `emphasis="warning"` and a paired icon, so a colorblind user still reads the state (`design.md §8`).
- Values render in `tabular-nums`; loading state shows a `<Skeleton>` matching the value dimensions to prevent layout shift.

### 6.3 Drugs table + expandable shipments

Column order is tuned for left→right scanning (mirrors automatically under RTL):

`[▸ expand] · Drug Name · Manufacturer/Provider · Auto-renew/Frequency · Total Stock · Nearest Expiry · [Actions]`

- **Expansion affordance:** a chevron button (`ChevronDown`, rotating 180° when open) in the leading column toggles an **inline sub-table** (`DrugShipmentsSubTable`) revealing that drug's shipments: warehouse, per-unit stock (`X boxes + Y strips`), buy price, expiry status badge, price-list chips, and quick actions **Sell / Edit / Delete** plus a **`+ Add New Shipment`** row. Expand-on-demand avoids the legacy N+1 over every drug (§3.5.1).
- **Stock badge** follows `design.md §6.2`: `<Badge variant="warning"><AlertTriangle/> Low Stock</Badge>` — icon + text (red/amber *and* a label), in `tabular-nums`.
- **Nearest Expiry** shows the date plus a **days-remaining pill**: `success` (> threshold), `warning` (≤ `maxDaysExpiryAlert`), `destructive` (≤ 7 days). No expiry → em dash.
- **Empty / filtered / loading states:** `DataTable` already provides skeleton rows while loading and `<EmptyState>` for zero rows. For a zero-result **filtered** state, render a distinct "No drugs match your filter" `EmptyState` with a **Clear filter** action; for a genuinely empty inventory, show "No drugs yet" with a **Create New Drug** CTA.
- **Hover / density** follows `design.md §6.2`: sticky header (`bg-surface-muted`), `h-12` rows, `hover:bg-primary-light/60`.

### 6.4 Sell flow (the "zero-thought" transaction)

`SellDrugModal` opens from a shipment row and is ordered top→bottom the way a cashier thinks:

1. **Transaction type** — a `<RadioGroup>` of three cards (**Patient / Medical Check / Outside Sale**) so the choice is laid out, not buried in a dropdown.
2. **Patient picker** — shown only for *Patient* and *Medical Check* (both use the patient picker, decision #4); an autocomplete `<Select>` over active patients.
3. **Quantity** — dual-unit inputs (`boxes` + `strips`) with a **live "Available"** readout beneath and a live **smaller-unit total** computed in the renderer. Over-availability is blocked inline (zod + `<= available`).
4. **Price list** selector → **auto-calculated total** (unit price × quantity) rendered large in `tabular-nums`, with **override** enabled for the cashier.
5. **Safety net:** a `warning` alert appears only when unit price drops below the shipment buy price, with an `AlertDialog` confirm step if the user proceeds (parity with legacy behavior).

Success resolves with a Sonner `success` toast; the stock badge and KPI strip refresh immediately.

> `[gated]` — Patient/Check sales are **disabled with a tooltip** ("available in the coming backend update") until `phase_6.4_backend_plan.md` lands `DrugTransaction.patient_id` + the `DrugUsage` linkage. Outside sale remains fully functional (§1.1).

### 6.5 Warehouses tab

`WarehousesPanel` is a flat CRUD table — the lightest of the three tabs:

- Header action **Add New Warehouse** (opens `WarehouseModal`).
- Columns: **Name · Location · Total Shipments** (`tabular-nums`) **· Actions** (Edit / View Inventory / Delete).
- **View Inventory** opens `WarehouseInventoryDialog`: summary `StatCard`s on top (**Total Shipments · Total Drugs · Total Stock Value**) followed by a **per-shipment breakdown list** (drug name, quantity, buy price, expiry, status badge). Derived from `getWarehouseInventory` / `getWarehouseShipments` — see the §3.2 route-mount caveat.
- **Delete** is gated by `ConfirmDialog`; warehouses still containing shipments show a destructive warning and are blocked server-side (legacy dependency check preserved).

### 6.6 Transactions tab

`TransactionsPanel` answers "what happened, and what did it earn":

- **Filter bar:** date-range pickers (start/end), **Type** (`All / Patient / Check / Outside`), **Drug**, **Warehouse**.
- **Summary cards** (`TransactionSummaryCards`, from `/transactions/reports/summary`): **Total Sales · Total Revenue · Total Units Sold** in `tabular-nums`.
- **Table:** Timestamp · Drug · Warehouse · Quantity · Price · Type badge · Patient Name. Patient Name is `[gated]` — renders an em dash (`—`) until the backend join lands (§1.1). Empty/loading states reuse `DataTable`.

### 6.7 Cross-cutting rules

- **i18n & RTL:** directional spacing uses logical properties (`ms-*`, `pe-*`, `inset-s-*`, `start-*`); the tab strip, table columns, and dialogs mirror automatically under `dir="rtl"`. New keys land under `pharmacy.*` (§3.6).
- **Accessibility:** one `<h1>` (via `PageHeader`); every icon-only button has `aria-label`; status badges are always icon + text; `tabular-nums` on numeric cells; focus rings per `design.md §8`.
- **Feedback:** create/edit/delete/sale all resolve via a Sonner toast (non-blocking); destructive and irreversible actions (delete drug/shipment/warehouse, below-buy-price sale) route through `ConfirmDialog`/`AlertDialog`.