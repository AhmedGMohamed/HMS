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

### Step 1: Shared types & API layer
- Create `src/renderer/src/pages/_shared/pharmacy/types.ts` (extract from `Patients/types/patient.ts` + `drugs.d.ts`).
- Update `Patients/types/patient.ts` to re-export the shared types (remove local duplication).
- Create `pages/Drugs/types/drug.ts` re-exporting shared types.
- Create `pages/Drugs/api.ts` with all endpoints.
- Resolve the warehouse-inventory route-mount question (§3.2) before Step 3.
- Create Zod schemas in `pages/Drugs/schemas/`.

### Step 2: Custom Hooks
- `useDrugsList.ts` (aggregation per §3.5.1, KPI-filter state), `useWarehouses.ts`, `useDrugTransactions.ts`, `useDrugShipments.ts`, `usePharmacyKpi.ts`.

### Step 3: Modals & Dialogs
- `DrugCardModal`, `ShipmentModal`, `SellDrugModal`, `WarehouseModal`, `WarehouseInventoryDialog`.

### Step 4: Components & Sub-panels
- `PharmacyKpiStrip`, `DrugShipmentsSubTable` & `ShipmentRow`, `DrugsTable` & `DrugTableRow`, `WarehousesPanel`, `TransactionsPanel` & `TransactionSummaryCards`.

### Step 5: Page assembly, routing & i18n
- Assemble `DrugsPage.tsx`.
- Confirm routing: `/drugs` is already wired in `App.tsx`, `lib/routes.ts`, `lib/navigation.ts`, `lib/breadcrumbs.ts` — verify only.
- Add §3.6 translation keys (en + ar); run `npm run check-i18n:renderer`.

### Step 6: Verification & Polish
- Bilingual EN/AR + RTL (`dir="rtl"`).
- Edge cases: stock depletion, price below buy price, warehouse delete safeguard, `patient`/`check` sale gating until backend lands.
- Typecheck + lint.

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