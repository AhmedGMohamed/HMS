# Implementation Plan — Phase 6.5: Pharmacy (Medical Supplies)

**Scope:** Full React refactoring for Pharmacy Medical Supplies Management (`/supplies`), including Medical Supply Cards, Expandable Shipments with Pricelist Matrix, Direct Inpatient Dispensing Modal, Shared Warehouse Inventory Management, and Inpatient Usage History & Efficiency Auditing.  
**Target:** React 19 + Vite 6 + Tailwind v4 + shadcn/ui + react-hook-form + Zod + react-i18next.  
**Legacy Replacement:** `src/app/views/pharmacy/supplies.html`, `src/app/views/js/pharmacy/supplies.ts` (36K), `src/app/views/css/pharmacy.css`, `src/app/views/css/pharmacy-rtl.css`.  
**Route:** `/supplies` (Guarded by `PermissionRoute` with permission `manage_supplies` / `manage_pharmacy`).

> **Backend companion:** Query-filtered usage history, SQL search parameter fix, and route permission alignment are tracked in `phase_6.5_backend_plan.md`. This document is **renderer-focused**; it documents the contract it consumes (see §1.1) and provides fallbacks where needed.

---

## 1. Architectural Decisions Summary

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Page Layout** | **3 Tabs** on `/supplies`: `Supplies Inventory`, `Warehouses`, and `Usage History` using shadcn `<Tabs>` and responsive layout with a single cohesive `PageHeader`. |
| 2 | **Shipments Display** | **Expandable Accordion Sub-row** in the Supplies table (inline accordion revealing active shipments with warehouse, unit count, buy price, optional expiry date, pricelist badges, and action buttons: Dispense, Edit, Delete). |
| 3 | **KPI Strip** | **5 EditorialKPICard** at the top of the Supplies Inventory tab: `Total Supplies`, `Low Stock Alert` (clickable filter), `Expiring Soon` (clickable filter), `Monthly Turnover Rate` (efficiency metric), and `Total Inventory Value`. Clicking a filter card updates the table and synchronizes with the filter chips. |
| 4 | **Monthly Turnover Rate** | Defined as: `(Units Dispensed in Last 30 Days / Total Inventory in Last 30 Days) * 100%`, where Total Inventory = `Current In-Stock Units + Units Dispensed in Last 30 Days`. |
| 5 | **Direct Inpatient Dispensing** | Dedicated **Dispense to Patient Dialog** triggered directly per shipment row: allows selecting an active admitted patient (`GET /api/patients/active`), specifying quantity (1 to available stock), validating unit price against shipment buy price, and submitting to `POST /api/pharmacy/medical-supply-usages/patient/:patientId` (which creates `MedicalSupplyUsage`, `MedicalSupplyTransaction`, and writes to `BillDetail`). |
| 6 | **Usage History Auditing** | Dedicated **Usage History Tab**: designed for hospital administration and clinical audit to track supply usage efficiency. Features Date Range picker, Patient filter, Supply filter, and Status filter (All / Active / Completed), backed by top summary metrics (Total Units Dispensed, Total Usages, Active Ongoing Treatments). |
| 7 | **Warehouse Management** | **Shared Warehouse Architecture**: Reuses the warehouse management domain and modal (`WarehouseModal`) from `pages/_shared/pharmacy/`, while providing a supply-specific `WarehouseSupplyInventoryDialog` (viewing supply shipments breakdown via `GET /api/pharmacy/medical-supply-shipments/warehouse/:id`). |
| 8 | **Unit Conversion Parity** | Unlike Drugs, Medical Supplies **do NOT have unit conversion**. All quantities (sale quantity, min stock alert, shipment quantity, dispensed quantity) are integer units, eliminating conversion arithmetic and rounding errors. |
| 9 | **RBAC Alignment** | Route `/supplies` and navigation item aligned on `manage_supplies` (with `manage_pharmacy` accepted as fallback). |
| 10 | **i18n & Locales** | Uses lazy-loaded `medicalSupplies` namespace (`src/renderer/src/locales/medicalSupplies.{en,ar}.json`), full RTL support via CSS logical properties (`ms-`, `pe-`, `text-start`, `text-end`). |

---

### 1.1 Backend API Contract & Dependencies

The renderer consumes the endpoints listed below. Items marked **`[backend-companion]`** are detailed in `phase_6.5_backend_plan.md`:

| Endpoint | Method | Purpose | Status / Notes |
|----------|--------|---------|----------------|
| `/api/pharmacy/medical-supplies` | `GET` | List supplies with pagination envelope | Existing (`MedicalSupply.controller`) |
| `/api/pharmacy/medical-supplies` | `POST` | Create supply card | Existing (`manage_supplies`) |
| `/api/pharmacy/medical-supplies/:id` | `PUT` | Update supply card | Existing (`manage_supplies`) |
| `/api/pharmacy/medical-supplies/:id` | `DELETE` | Delete supply card (blocked if shipments exist) | Existing (`manage_supplies`) |
| `/api/pharmacy/medical-supplies/monitor/low-stock` | `GET` | Low stock supplies list | Existing |
| `/api/pharmacy/medical-supply-shipments/supply/:id` | `GET` | List shipments for a specific supply | Existing |
| `/api/pharmacy/medical-supply-shipments` | `POST` | Create shipment with price matrix | Existing (`manage_pharmacy` / `manage_supplies`) |
| `/api/pharmacy/medical-supply-shipments/:id` | `PUT` | Update shipment details & prices | Existing |
| `/api/pharmacy/medical-supply-shipments/:id` | `DELETE` | Delete shipment (blocked if used) | Existing |
| `/api/pharmacy/medical-supply-shipments/warehouse/:id` | `GET` | Breakdown of supply shipments in warehouse | Existing |
| `/api/pharmacy/medical-supply-usages/patient/:patientId` | `POST` | Dispense supply to admitted patient bill | Existing (`manage_patients`) |
| `/api/pharmacy/medical-supply-usages/history` `[backend-companion]` | `GET` | Filtered usage history with date range, patient, supply | Added in companion backend plan |
| `/api/pharmacy/medical-supply-usages/summary` `[backend-companion]` | `GET` | Aggregate summary (units last 30 days, active count) | Added in companion backend plan (fallback: client-side compute from history) |
| `/api/warehouse` | `GET` | Hospital-wide warehouse list with stats | Existing |
| `/api/patients/active` | `GET` | Admitted patient picker list | Existing |
| `/api/price-lists` | `GET` | Price lists for pricing matrix | Existing |

---

## 2. Directory & File Structure

All new files will be placed under `src/renderer/src/pages/Supplies/`, reusing shared types from `src/renderer/src/pages/_shared/pharmacy/`:

```
src/renderer/src/pages/
├── _shared/
│   └── pharmacy/
│       ├── types.ts                               # Shared domain types (expanded with Supply types)
│       └── hooks/
│           └── useSharedWarehouses.ts             # Extracted reusable warehouse management hook
└── Supplies/
    ├── SuppliesPage.tsx                           # Main page with 3 Tabs (Inventory, Warehouses, Usage History)
    ├── api.ts                                     # Complete typed API client for Medical Supplies
    ├── types/
    │   └── supply.ts                              # Re-exports shared domain types + local UI view-models
    ├── schemas/
    │   ├── supply.schema.ts                       # Zod schema for Medical Supply card create/update
    │   ├── supplyShipment.schema.ts               # Zod schema for Supply Shipment create/update
    │   └── dispenseSupply.schema.ts               # Zod schema for Inpatient Dispensing dialog
    ├── hooks/
    │   ├── useSuppliesList.ts                     # Supplies list fetching, stock aggregation, search & filtering
    │   ├── useSupplyShipments.ts                  # Fetching and mutations for shipments of a supply
    │   ├── useSupplyUsageHistory.ts               # Filtered usage history, pagination, and audit queries
    │   └── useSuppliesKpi.ts                      # KPI calculations (stock, low stock, near expiry, 30d turnover)
    ├── components/
    │   ├── SuppliesKpiStrip.tsx                   # 5 KPI StatCards (EditorialKPICard - clickable filters + turnover rate)
    │   ├── SuppliesTable/
    │   │   ├── SuppliesTable.tsx                  # Main table for Medical Supplies with expandable rows
    │   │   ├── SupplyTableRow.tsx                 # Single supply row with stock badge, auto-renew, and actions
    │   │   ├── SupplyShipmentsSubTable.tsx        # Expanded shipment list for a single supply
    │   │   └── SupplyShipmentRow.tsx              # Shipment row with prices & action buttons (Dispense/Edit/Delete)
    │   ├── Warehouses/
    │   │   ├── SuppliesWarehousesPanel.tsx        # Warehouses tab panel for Supplies
    │   │   └── WarehouseSupplyInventoryDialog.tsx # Modal: summary stats + supply shipment breakdown
    │   └── UsageHistory/
    │       ├── UsageHistoryPanel.tsx              # Usage History tab with filters & pagination
    │       ├── UsageSummaryCards.tsx              # Top metric cards for usage efficiency
    │       └── UsageHistoryTable.tsx              # Tabular audit log with status badges and patient info
    └── modals/
        ├── SupplyModal.tsx                        # Create / Edit Medical Supply dialog
        ├── SupplyShipmentModal.tsx                # Add / Edit Supply Shipment dialog (dynamic price lists)
        └── DispenseSupplyModal.tsx                # Dispense to Inpatient dialog (active patient picker & price check)
```

---

## 3. Detailed Component & Module Specifications

### 3.1 Shared Types (`pages/_shared/pharmacy/types.ts` & `pages/Supplies/types/supply.ts`)

Extract and consolidate all medical supply wire types into `src/renderer/src/pages/_shared/pharmacy/types.ts` (so `Patients`, `Drugs`, and `Supplies` all import from a single clean source of truth):

```typescript
/* ----------------------------------------------------------------
   Medical Supplies Domain Types
   ---------------------------------------------------------------- */

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

export interface MedicalSupplyShipmentPrice {
  pricelistId: number
  pricelistName?: string
  price: number | string
  requiresPrepayment?: boolean
  prepaymentType?: string | null
  prepaymentAmount?: number | null
}

export interface MedicalSupplyShipment {
  shipmentId: number
  supplyId: number
  warehouseId: number
  warehouseName: string
  buyQuantity?: number
  quantity: number
  buyPrice: number | string
  expiryDate: string | null
  receivedDate?: string
  prices: MedicalSupplyShipmentPrice[]
  supplyName?: string
}

export interface CreateSupplyShipmentPayload {
  supplyId: number
  warehouseId: number
  quantity: number
  buyPrice: number
  expiryDate?: string | null
  prices: { pricelistId: number; price: number }[]
}

export type UpdateSupplyShipmentPayload = Partial<Omit<CreateSupplyShipmentPayload, "supplyId">>

/* ----------------------------------------------------------------
   Enriched Supply Card (Renderer-Computed Aggregations)
   ---------------------------------------------------------------- */

export interface EnrichedMedicalSupply extends MedicalSupply {
  totalQuantity: number
  isLowStock: boolean
  isNearExpiry: boolean
  nearestExpiryDate: string | null
  daysUntilExpiry: number | null
  shipmentsCount: number
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
```

`pages/Supplies/types/supply.ts` re-exports these domain types and exports local component state interfaces.

---

### 3.2 API Client (`pages/Supplies/api.ts`)

Encapsulates all HTTP calls using `api` from `@/lib/api` (which prefixes `/api` and applies camelCase transforms):

```typescript
// Supplies Cards
export const listSupplies = (params?: { q?: string; page?: number; limit?: number }) =>
  api.get<MedicalSupply[]>("/pharmacy/medical-supplies", { params })

export const getSupply = (id: number) =>
  api.get<MedicalSupply>(`/pharmacy/medical-supplies/${id}`)

export const createSupply = (payload: CreateMedicalSupplyPayload) =>
  api.post<MedicalSupply>("/pharmacy/medical-supplies", payload)

export const updateSupply = (id: number, payload: UpdateMedicalSupplyPayload) =>
  api.put<MedicalSupply>(`/pharmacy/medical-supplies/${id}`, payload)

export const deleteSupply = (id: number) =>
  api.delete(`/pharmacy/medical-supplies/${id}`)

export const getLowStockSupplies = () =>
  api.get<{ supplyId: number; name: string; minStockAlert: number; totalQuantity: number }[]>(
    "/pharmacy/medical-supplies/monitor/low-stock"
  )

// Supply Shipments
export const listSupplyShipments = (supplyId: number) =>
  api.get<MedicalSupplyShipment[]>(`/pharmacy/medical-supply-shipments/supply/${supplyId}`)

export const listWarehouseSupplyShipments = (warehouseId: number) =>
  api.get<MedicalSupplyShipment[]>(`/pharmacy/medical-supply-shipments/warehouse/${warehouseId}`)

export const createSupplyShipment = (payload: CreateSupplyShipmentPayload) =>
  api.post<MedicalSupplyShipment>("/pharmacy/medical-supply-shipments", payload)

export const updateSupplyShipment = (id: number, payload: UpdateSupplyShipmentPayload) =>
  api.put<MedicalSupplyShipment>(`/pharmacy/medical-supply-shipments/${id}`, payload)

export const deleteSupplyShipment = (id: number) =>
  api.delete(`/pharmacy/medical-supply-shipments/${id}`)

// Dispensing & Usages
export const dispenseSupplyToPatient = (patientId: number, payload: {
  supplyId: number
  shipmentId: number
  quantity: number
  price: number
}) => api.post(`/pharmacy/medical-supply-usages/patient/${patientId}`, payload)

export const listSupplyUsageHistory = (filters?: SupplyUsageFilters) =>
  api.get<MedicalSupplyUsageRow[]>("/pharmacy/medical-supply-usages/history", { params: filters })

export const getSupplyUsageSummary = () =>
  api.get<SupplyUsageSummaryMetrics>("/pharmacy/medical-supply-usages/summary")

// Shared Lookups
export const listPriceLists = () => api.get<PriceList[]>("/price-lists")
export const getActivePatients = () => api.get<ActivePatient[]>("/patients/active")
```

---

### 3.3 Form Validation Schemas (`schemas/*.ts`)

All schemas validate using Zod with localized error messages:

1. **`supply.schema.ts`**:
   - `name`: string, min 3 chars (`validation.supplyNameLength`).
   - `manufacturer`: optional string.
   - `provider`: optional string.
   - `saleQuantity`: integer, min 1 (`validation.saleQuantityMin`).
   - `minStockAlert`: non-negative integer or null.
   - `isObligatoryContinuous`: boolean.
   - `frequency`: string or null (e.g. "Every 8 hours").

2. **`supplyShipment.schema.ts`**:
   - `warehouseId`: positive integer (`validation.warehouseRequired`).
   - `quantity`: positive integer (min 1, `validation.quantityMin`).
   - `buyPrice`: positive number (min 0.01, `validation.buyPriceRequired`).
   - `expiryDate`: optional future date string (nullable).
   - `prices`: array of `{ pricelistId: number, price: positive number }`. Default price list price required.

3. **`dispenseSupply.schema.ts`**:
   - `patientId`: positive integer (`validation.patientRequired`).
   - `quantity`: positive integer (min 1, max available shipment quantity).
   - `price`: positive number (min 0, warns if below buy price).

---

### 3.4 Modals & Dialogs

1. **`SupplyModal.tsx`**:
   - Create / Edit dialog for medical supply card.
   - Form fields: Name, Manufacturer, Provider, Default Sale Quantity, Continuous flag + frequency, Minimum Stock Alert.
   - Standard shadcn `Dialog`, responsive two-column grid.

2. **`SupplyShipmentModal.tsx`**:
   - Add / Edit shipment dialog.
   - Fields: Warehouse select, Quantity (single integer units), Buy Price, Optional Expiry Date picker.
   - Dynamic Price Lists matrix: highlights default price list, validates each selling price against buy price.

3. **`DispenseSupplyModal.tsx`**:
   - Triggered from shipment row: Dispense to Inpatient.
   - Patient search / select dropdown (`ActivePatient` picker). Shows admitted status and bed/admission info.
   - Displays preselected shipment: Warehouse, Available stock, Unit buy price.
   - Quantity input with inline validation (`1` to `available`).
   - Selling price input (auto-populates with default price list price, editable). Warning alert banner if price is lower than shipment buy price.
   - Submit executes `dispenseSupplyToPatient`, shows toast, and refreshes supply shipments & stock.

4. **`WarehouseSupplyInventoryDialog.tsx`**:
   - Triggered from the Warehouses tab "View Inventory" button.
   - Shows top KPI cards for the warehouse: Total Supply Shipments, Total Units in Stock, Total Stock Value.
   - Below: DataTable listing all supply shipments in this warehouse (Supply Name, Quantity, Buy Price, Expiry Date, Status).

5. **`ConfirmDialog`**:
   - Delete supply (warns if shipments exist; server rejects if count > 0).
   - Delete shipment (warns if transactions exist; server rejects if used).
   - Delete warehouse (gated if shipments exist).

---

### 3.5 Core Pages, Panels & Hooks

#### 3.5.1 Stock Aggregation Hook (`useSuppliesList.ts`)
To avoid N+1 queries when loading the main table:
1. Calls `listSupplies()` to retrieve base supply catalog.
2. Simultaneously fetches `getLowStockSupplies()` to cross-join `isLowStock`.
3. Fan-outs per expanded row or loads shipments to derive `totalQuantity` and `nearestExpiryDate`.
4. Exposes debounced search, active KPI filter, sorting, and pagination.

#### 3.5.2 KPI Strip Hook (`useSuppliesKpi.ts`)
Calculates the 5 top metrics:
- **Total Supplies:** `supplies.length`.
- **Low Stock Alert:** Count of supplies with `isLowStock === true`.
- **Expiring Soon:** Count of supplies with active shipments expiring within 30 days.
- **Monthly Turnover Rate:** Computed from `GET /summary` or last 30 days usage:
  $$\text{Turnover Rate} = \frac{\text{Units Dispensed (Last 30 Days)}}{\text{Current In-Stock Units} + \text{Units Dispensed (Last 30 Days)}} \times 100\%$$
- **Total Inventory Value:** Sum of `quantity * buyPrice` across all active shipments.

#### 3.5.3 `SuppliesKpiStrip.tsx`
- Displays the 5 `EditorialKpiCard`s in a responsive grid (`grid-cols-2 md:grid-cols-5`).
- Clickable filters: Tapping `Low Stock Alert` filters the table by low stock; tapping `Expiring Soon` filters by near expiry; tapping `Total Supplies` resets filter to All.
- Selected card displays `bg-primary-light` and `ring-1 ring-primary` (consistent with `design.md`).

#### 3.5.4 `SuppliesTable.tsx` & Sub-Table
- Adheres strictly to `design.md §6.2`:
  - Sticky header (`bg-surface-muted`), `h-12` rows, `tabular-nums` on numeric columns.
  - Expandable accordion row toggles `SupplyShipmentsSubTable`.
  - Columns: Expand Chevron, Supply Name, Manufacturer/Provider, Auto-Renew/Frequency badge, Total Stock (`X units` + Low Stock badge if below alert), Nearest Expiry Date (badge + days remaining, or "—" if none), Actions (Edit, Delete).
  - Sub-Table row (`SupplyShipmentRow.tsx`): Warehouse, Buy Price, Available Quantity, Expiry Date, Selling Prices badges, and Actions: **Dispense to Patient** (primary button), Edit, Delete.

#### 3.5.5 `SuppliesWarehousesPanel.tsx`
- Reuses shared `WarehouseModal` and `useSharedWarehouses` hook.
- Shows table of warehouses with Name, Location, Total Shipments, and Actions (Edit, View Inventory, Delete).
- "View Inventory" opens `WarehouseSupplyInventoryDialog`.

#### 3.5.6 `UsageHistoryPanel.tsx` & `UsageHistoryTable.tsx`
- Full audit and efficiency tracking view.
- Top metrics: `UsageSummaryCards.tsx` (Total Units Dispensed, Active Ongoing Usages, Patients Served).
- Filter bar: Date range picker (`DatePickerWithRange`), Patient search input, Supply picker dropdown, Status filter chip (All / Active / Completed).
- Table columns: Date/Timestamp, Patient Name, Supply Name, Quantity Dispensed, Remaining Quantity (for continuous usage), Status Badge (Active / Completed), Unit Price.

---

### 3.6 Translation Keys & Namespaces (`medicalSupplies.{en,ar}.json`)

Update `src/renderer/src/locales/medicalSupplies.{en,ar}.json` with all necessary keys:

```json
{
  "medicalSupplies": {
    "tabs": {
      "inventory": "Supplies Inventory",
      "warehouses": "Warehouses",
      "usageHistory": "Usage History"
    },
    "kpi": {
      "totalSupplies": "Total Supplies",
      "lowStock": "Low Stock Alert",
      "expiringSoon": "Expiring Soon",
      "turnoverRate": "Monthly Turnover Rate",
      "totalValue": "Total Inventory Value"
    },
    "usage": {
      "title": "Supply Usage & Efficiency Audit",
      "totalUnits": "Total Units Dispensed",
      "activeTreatments": "Active Inpatient Usages",
      "patientsServed": "Patients Served",
      "date": "Date & Time",
      "patient": "Patient",
      "supply": "Supply",
      "initialQty": "Dispensed Qty",
      "remainingQty": "Remaining Qty",
      "status": "Status",
      "statusActive": "Active",
      "statusCompleted": "Completed"
    },
    "dispense": {
      "title": "Dispense Supply to Inpatient",
      "selectPatient": "Select Admitted Patient",
      "quantity": "Quantity to Dispense",
      "available": "Available in Shipment",
      "unitPrice": "Selling Price per Unit",
      "totalAmount": "Total Charge",
      "belowBuyPriceWarning": "Warning: Selling price is below shipment buy price ({buyPrice}).",
      "confirm": "Dispense & Charge to Bill",
      "success": "Supply dispensed successfully and added to patient bill."
    }
  }
}
```

---

## 4. Phased Implementation Steps

> **Execution Order:** Each phase is independently testable and verifiable. Phase 1 sets up types and API clients; Phase 2 builds hooks; Phase 3 implements dialogs; Phase 4 creates panels and tables; Phase 5 wires the page and i18n; Phase 6 handles verification.

| Phase | Deliverable | Key Files | Exit Criteria |
|-------|-------------|-----------|---------------|
| **P1 — Types & API & Schemas** | Domain types, API client, Zod validation schemas | `_shared/pharmacy/types.ts`, `pages/Supplies/types/supply.ts`, `pages/Supplies/api.ts`, `pages/Supplies/schemas/*.ts` | `tsc` clean; zero duplicate types |
| **P2 — Custom Hooks** | Supplies data fetching, stock aggregation, usage history, and KPI hooks | `pages/Supplies/hooks/useSuppliesList.ts`, `useSupplyShipments.ts`, `useSupplyUsageHistory.ts`, `useSuppliesKpi.ts` | Hooks compile without circular dependencies |
| **P3 — Modals & Dialogs** | Supply create/edit, shipment modal, inpatient dispense modal, inventory dialog | `pages/Supplies/modals/SupplyModal.tsx`, `SupplyShipmentModal.tsx`, `DispenseSupplyModal.tsx`, `WarehouseSupplyInventoryDialog.tsx` | All dialogs Zod-validated; active patient picker wired |
| **P4 — Components & Panels** | KPI strip, Supplies table with sub-rows, Warehouses panel, Usage history panel | `pages/Supplies/components/**` | Design.md §6.2 compliant; clickable KPI filter SSOT; RTL safe |
| **P5 — Page Assembly & i18n** | Full `SuppliesPage.tsx` container + locale translations | `pages/Supplies/SuppliesPage.tsx`, `locales/medicalSupplies.{en,ar}.json`, `lib/routes.ts`, `lib/navigation.ts` | Route `/supplies` renders 3 tabs; i18n audits clean |
| **P6 — Polish & Verification** | Bilingual EN/AR verification, permission check, end-to-end testing | Full `Supplies` tree | `npm run check-i18n:renderer` passes; `npm run lint` passes |

---

### Detailed Implementation Phases

#### Phase 1 — Types, API Client & Schemas
1. Move/consolidate medical supply wire types into `src/renderer/src/pages/_shared/pharmacy/types.ts`.
2. Create `pages/Supplies/types/supply.ts` re-exporting domain types and defining UI view models (`EnrichedMedicalSupply`, `SupplyUsageFilters`).
3. Create `pages/Supplies/api.ts` implementing all typed API methods.
4. Implement Zod schemas in `pages/Supplies/schemas/`: `supply.schema.ts`, `supplyShipment.schema.ts`, `dispenseSupply.schema.ts`.

#### Phase 2 — Custom Hooks
1. `useSuppliesList.ts`: Loads supplies list + low-stock cross-join; handles search and table filtering.
2. `useSupplyShipments.ts`: Loads shipments per supply on row expansion; create/update/delete mutations with cache updates.
3. `useSupplyUsageHistory.ts`: Fetches filtered usage history and summary metrics for the audit tab.
4. `useSuppliesKpi.ts`: Calculates the 5 KPI metrics including the 30-day turnover rate.

#### Phase 3 — Modals & Dialogs
1. `SupplyModal.tsx`: Create / Edit medical supply card.
2. `SupplyShipmentModal.tsx`: Add / Edit shipment with warehouse picker, quantity, optional expiry, and price list matrix.
3. `DispenseSupplyModal.tsx`: Selects active admitted patient, validates quantity, displays price, writes usage to patient bill.
4. `WarehouseSupplyInventoryDialog.tsx`: Displays summary cards and supply shipment breakdown for a selected warehouse.

#### Phase 4 — Components & Panels
1. `SuppliesKpiStrip.tsx`: 5 EditorialKpiCards with clickable filter binding to table state.
2. `SuppliesTable.tsx`, `SupplyTableRow.tsx`, `SupplyShipmentsSubTable.tsx`, `SupplyShipmentRow.tsx`: Main inventory table with expandable accordion shipments and action buttons.
3. `SuppliesWarehousesPanel.tsx`: Warehouse management table with Add/Edit/Delete actions and "View Inventory".
4. `UsageHistoryPanel.tsx`, `UsageSummaryCards.tsx`, `UsageHistoryTable.tsx`: Usage history auditing tab with date range and status filters.

#### Phase 5 — Page Assembly, Routing & i18n
1. Wire `SuppliesPage.tsx` with 3 shadcn `<Tabs>`: `Inventory`, `Warehouses`, `Usage History`.
2. Update `src/renderer/src/lib/routes.ts` and `navigation.ts` to align route requirement to `manage_supplies`.
3. Add all new keys to `src/renderer/src/locales/medicalSupplies.{en,ar}.json`.
4. Run `npm run check-i18n:renderer` to ensure zero missing keys.

#### Phase 6 — Verification & Polish
1. Test switching between EN and AR in RTL layout (`dir="rtl"`).
2. Validate keyboard accessibility (focus traps on dialogs, tab navigation).
3. Run `npm run lint` and TypeScript compilation checks.

---

## 5. Verification Plan

### Automated Checks
1. `npm run check-i18n:renderer` — verify zero missing translation keys in `medicalSupplies` namespace.
2. `npm run lint` — ESLint validation across all new components and hooks.
3. TypeScript compiler check — verify no type errors across `src/renderer/src/pages/Supplies/` and `_shared/`.

### Manual Testing Matrix

| Feature | Test Case | Expected Result |
|---------|-----------|-----------------|
| **Supply Card Creation** | Create new supply "Sterile Gauze 10x10" with min stock alert 20 | Supply created, appears in table with stock 0 |
| **Shipment Entry** | Add shipment of 100 units to "Central Warehouse" with default price 15.00 | Stock displays 100 units; shipment appears in expanded accordion |
| **Optional Expiry** | Add shipment with no expiry date; add another with an expiry date | Both shipments save and display correctly; nearest expiry updates |
| **KPI Strip & Filtering** | Click "Low Stock Alert" KPI card; click "Expiring Soon" KPI card | Inventory table filters rows accordingly; card shows selected ring |
| **Inpatient Dispensing** | Click "Dispense" on a shipment, pick an admitted patient, enter quantity 5 | Stock decrements to 95; success toast shown; usage record created |
| **Usage History Tab** | Open Usage History tab, filter by patient name or date range | Table displays usage record with patient name, timestamp, and units |
| **Warehouse Inventory** | Open Warehouses tab, click "View Inventory" on Central Warehouse | Modal opens displaying warehouse stat cards and supply shipments list |
| **RTL Layout** | Switch language to Arabic (`العربية`) | Page mirrors cleanly; chevrons, table headers, and badges respect RTL |

---

## 6. Front-end Design Plan

> **Scope of this section:** the visual, interaction, and reusability contract for the renderer side of phase 6.5. Mirrors the §1–§5 technical plan; binds designers, reviewers, and implementers to one vocabulary. All tokens, primitives, and patterns referenced here are defined in `design.md` (the canonical design document) and validated by phase 6.4 (`DrugsPage`).

### 6.1 Design Direction Summary

- **Aesthetic:** *Editorial Medical* (established in phase 6.4 / `DrugsPage`) — restrained, type-led, clinical-readout cards over a hairline grid. Carried forward with **no fresh visual language**.
- **DFII score:** **11/15** — strong, *do not invent*. The plan below reuses every visual primitive that phase 6.4 already validated (`EditorialKpiCard`, `DataTable` + expand, `PageHeader` with eyebrow, `ConfirmDialog`, Sonner, shadcn `Dialog`/`Tabs`). New ground is limited to: (a) a 5th KPI with its own layout treatment, (b) a third tab that has no Drugs equivalent, (c) a dispense dialog that omits unit conversion.
- **Inspiration (conceptual, not visual):** A *clinical chart readout* — page opens as a ledger of inventory and consumption, not a card grid. The 5-card KPI strip is a single typographic row (eyebrow + large numeral + hairline + hint), the inventory table is the page's main event, the **Usage History** tab reads as a chart-room audit.

### 6.2 Design System Snapshot (binding for this phase)

| Layer | Token / Spec | Source |
|---|---|---|
| **Surfaces** | `bg-background` `#F0F9FF` app, `bg-card` `#FFFFFF` panels | `design.md` §4.1.2 |
| **Brand** | `primary` `#0077B6`, `primary-light` `#DBEAFE`; `secondary` `#00A896`; `success` `#10B981`; `warning` `#F59E0B`; `danger` `#EF4444` | §4.1.1 |
| **KPI card** | `EditorialKpiCard` (`src/renderer/src/components/common/EditorialKpiCard.tsx`) — 3 tones (`neutral`/`warning`/`primary`); rail on the inline-start edge; `text-[1.75rem] font-extralight tabular-nums` for value | phase 6.4 |
| **KPI strip layout** | `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4` — 5-up from `xl` (1280) up, 2-up to `md` (768). The 5th card (turnover) is shorter than a value cell and still reads at 1/5 width. | confirmed |
| **DataTable** | `src/renderer/src/components/common/DataTable.tsx` — `h-12` rows, sticky `bg-surface-muted` header, `tabular-nums` on numeric columns, `h-12` (default) / `h-10` (compact), `hover:bg-primary-light/60`, expandable row slot for sub-table | phase 6.4 |
| **Dialogs** | shadcn `<Dialog>`; default `sm:max-w-lg`; wide wizard `sm:max-w-2xl`; inventory dialog `sm:max-w-2xl`. Backdrop `bg-black/50 backdrop-blur-sm`. | §6.4 |
| **Status badges** | `<Badge>` always paired with a Lucide icon — never color alone. Low stock → warning + `<AlertTriangleIcon>`; near expiry → warning/destructive + `<CalendarClockIcon>`; active treatment → success + `<ActivityIcon>`; completed → secondary + `<CheckCircle2Icon>`. | §6.2 + §8 |
| **Typography** | Inter 600 `text-2xl` page h1 (PageHeader); Inter 500 `text-xs uppercase tracking-wide` eyebrows on tabs/cards; Inter 400 `text-sm` body; JetBrains Mono / `tabular-nums` on every number | §4.2 |
| **Spacing** | Page: `flex flex-col gap-6`; KPI strip: `gap-4`; dialog body: `gap-6`; form fields: `gap-4` | §4.3 |
| **Radii** | `radius-md` (6px) on inputs/buttons, `radius-lg` (8px) on cards, `radius-full` on chips | §4.3 |
| **RTL** | CSS logical utilities only (`ms-*`/`me-*`/`ps-*`/`pe-*`/`text-start`/`text-end`/`border-s-*`); `dir="rtl"` swaps font to Noto Sans Arabic via `[dir="rtl"]` in `index.css` | §4.2 / §6.2 |
| **Motion** | Page enter `animate-in fade-in-0 duration-150`; KPI hover/active 150ms color transition; DataTable row stagger 50ms; shadcn dialog defaults. Reduced-motion respected via the global rule in `index.css`. | §10 |
| **Density** | Buttons & inputs `h-10` (40px); icon-only `h-10 w-10 p-0` with `aria-label`; table row `h-12` | §4.3 / §6.5 |

### 6.3 Page Composition — `SuppliesPage.tsx`

```
┌──────────────────────────────────────────────────────────────────────┐
│  PageHeader                                                          │
│  • eyebrow: t("sidebar.pharmacy")                                     │
│  • h1:      t("medicalSupplies.title")                               │
│  • actions: [+ New Supply] (primary Button, opens SupplyModal)        │
├──────────────────────────────────────────────────────────────────────┤
│  Tabs (full-width, justify-center triggers, Lucide icons):           │
│  [📦 Supplies Inventory] [🏬 Warehouses] [📈 Usage History]          │
├──────────────────────────────────────────────────────────────────────┤
│  Tab 1: Inventory                                                     │
│  ┌── SuppliesKpiStrip (5 EditorialKpiCards, xl:grid-cols-5) ──┐      │
│  │ Total Supplies · Low Stock · Expiring Soon · Turnover · Value│    │
│  └────────────────────────────────────────────────────────────────┘    │
│  ┌── Filter chips [All | Low Stock | Expiring Soon] ────────────┐    │
│  │ [🔍 Search supplies…]                                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│  DataTable<EnrichedMedicalSupply> (expandable rows)                   │
│  Columns: ⌄ · Supply Name · Manufacturer/Provider · Auto-Renew ·      │
│           Total Stock · Nearest Expiry · Actions                       │
│  Expanded row → SupplyShipmentsSubTable (inline)                       │
├──────────────────────────────────────────────────────────────────────┤
│  Tab 2: Warehouses  → reuses shared <WarehousesPanel/> skeleton       │
│  Tab 3: Usage History → UsageSummaryCards + filter bar + DataTable    │
└──────────────────────────────────────────────────────────────────────┘
```

All modals are children of `<SuppliesPage>` (not nested in tabs) so their state lives above the tab switch and survives tab changes.

#### 6.3.1 Tab 1 — Inventory

**`SuppliesKpiStrip` (5 cards, `xl:grid-cols-5`)**

| # | Card | Tone | Click behaviour | Hint logic |
|---|------|------|-----------------|------------|
| 1 | **Total Supplies** | `neutral` | Reset filter → `"all"` | "Across all warehouses" |
| 2 | **Low Stock Alert** | `neutral` → `warning` when count > 0 | Toggle `filter === "low-stock"` | Active: "Tap to view only these" / Calm: "All supplies above their threshold" |
| 3 | **Expiring Soon** | `neutral` → `warning` when count > 0 | Toggle `filter === "near-expiry"` | Active: "Expiring within 30 days" / Calm: "No supplies near expiry" |
| 4 | **Monthly Turnover Rate** | `primary` (constant) | **Not clickable** (efficiency KPI, not a filter) | "Units dispensed (30d) ÷ (in-stock + dispensed 30d)" — micro-formula always shown so the value is legible without docs |
| 5 | **Total Inventory Value** | `primary` | Reset filter → `"all"` | "Sum of warehouse stock × buy price" |

- The 4th card's value renders as a percentage (e.g. `42.3%`); cards 1–3 use `formatNumber`; card 5 uses `formatCurrency`.
- Active card swap: rail + rule become fully saturated, `bg-primary-light/40 ring-1 ring-inset ring-primary/40` (existing `EditorialKpiCard` "active" state — no new classwork).
- Loading state: each card's hero numeral collapses to a 40px-wide `Skeleton` pulse — matches `EditorialKpiCard.loading`.

**`SuppliesTable` (expandable)**

Built on `DataTable<EnrichedMedicalSupply>`, identical column vocabulary to `DrugsTable` minus the unit-conversion presentation:

| Column | Render |
|---|---|
| Expand chevron (handled by DataTable when `renderExpanded` is set) | — |
| **Supply Name** | `font-medium text-foreground`; secondary line: manufacturer / provider in `text-xs text-muted-foreground` |
| **Manufacturer / Provider** | One line: `<manufacturer>` or `— <provider>` |
| **Auto-Renew / Frequency** | `<Badge variant="outline">` containing `Continuous · Every N hours` or `—` when not continuous |
| **Total Stock** | `formatNumber(totalQuantity)`; if `isLowStock` → `<Badge variant="outline" className="border-warning/40 bg-warning/5"><AlertTriangleIcon/> Low Stock · N</Badge>` |
| **Nearest Expiry** | Two-line stack: top = date (`text-xs tabular-nums text-muted-foreground`); bottom = `<Badge variant="destructive">` if ≤7 days, else outline-warning with `AlertTriangleIcon`. "—" if no in-stock shipment has a date. |
| **Actions** (right-aligned) | Edit + Delete icon buttons (same ghost-icon pattern as `DrugsTable`); click handlers `e.stopPropagation()` to preserve expand |

Filter chips: same `All / Low Stock / Expiring Soon` chips as Drugs, but using `medicalSupplies.filters.*` keys. The KPI strip and the chips are two views of the **same** `filter` state lifted into `SuppliesPage` (KPI click toggles the chip, chip click toggles the KPI — the `EditorialKpiCard` is the visual selector, the chips are the textual selector; both call the same `setFilter`).

Expand contract: same as `DrugsTable` — `expandedRowIds={new Set([expandedId])}` and `onExpandedChange`. Single-row expand, no multi-expand.

**`SupplyShipmentsSubTable` (inline, expanded)**

Same shape as `DrugShipmentsSubTable`:

```
┌────────────────────────────────────────────────────────────────────┐
│  Warehouse · Qty (units) · Buy Price · Expiry · [Pricelist chips]  │
│                                  [Dispense to Patient] [Edit] [✕]  │
└────────────────────────────────────────────────────────────────────┘
```

Key visual difference from drug shipments: **no unit conversion**. Stock displays as a single integer (`formatNumber(quantity)`) — no `X larger + Y smaller` line. This is the user-visible benefit of "Supplies have no unit conversion" and it should be reflected in a cleaner row, **not** a sparse one — pills, prices, and actions fill the same horizontal real-estate.

- **Dispense to Patient** is the primary affordance on the row (`<Button variant="outline" size="sm">` with `UserRoundIcon` to differentiate from "Sell" in Drugs — supplies only dispense to admitted patients, never to outside).
- Buy price: `formatCurrency(Number(shipment.buyPrice), resolveLocale(language))` — `tabular-nums`.
- Expiry: same `<Badge variant="outline">{date}</Badge>` as Drugs, or `—` if null (no expiry supplied).
- Pricelist chips: same `<Badge variant="secondary" className="tabular-nums">` per price.
- The "Add Shipment" affordance lives at the bottom of the sub-table (ghost button) and as the empty-state CTA when the supply has no shipments yet.

#### 6.3.2 Tab 2 — Warehouses

Reuses the phase 6.4 `<WarehousesPanel>` shell — promotes it into `src/renderer/src/pages/_shared/pharmacy/` (decision §2 of the existing plan). Per-supply changes:

- The shared `WarehouseSupplyInventoryDialog` replaces `WarehouseInventoryDialog`. Same 3-`StatCard` row at the top, but with **supply-specific** stats:
  - **Total Supply Shipments** (count of rows returned)
  - **Total Units in Stock** (Σ `quantity` across in-stock rows)
  - **Total Stock Value** (Σ `quantity × buyPrice`)
- Below the stat row: a flat table (no expand) — Supply Name · Quantity (integer, `tabular-nums`) · Buy Price · Expiry Date (badge) · Status (computed: `ok` / `warning` if expiry ≤ 30 days / `expired`).

#### 6.3.3 Tab 3 — Usage History

New surface. Composition (confirmed): **summary cards on top → filter bar → DataTable with pagination footer**.

**`UsageSummaryCards` (3 EditorialKpiCards, `sm:grid-cols-3`)**

| # | Card | Tone | Value | Hint |
|---|------|------|-------|------|
| 1 | **Total Units Dispensed** | `primary` | `formatNumber(totalUnitsAllTime)` | "Across all time and patients" |
| 2 | **Active Inpatient Usages** | `neutral` → `warning` when > 0 | `formatNumber(activeUsagesCount)` | "Ongoing continuous treatments" / "No active ongoing treatments" |
| 3 | **Patients Served** | `neutral` | `formatNumber(totalPatientsServed)` | "Distinct patient count" |

**Filter bar (toolbar slot of `DataTable`)**

A single row of inputs on `xl` (wrapping on `md`):

| Control | Component |
|---|---|
| Date range | Two `<Input type="date">` with a hairline divider and an inline "Clear" ghost button. Same native-date pattern as `TransactionsPanel`. |
| Patient | `<Input type="text">` with leading `<SearchIcon>`; client-side fuzzy filter on `patientName` (list is small after date filter) |
| Supply | `<NativeSelect>` populated from `useSuppliesList().drugs.map(s => s.name)` — same pattern as Drugs' `drugId` filter |
| Status | 3-button group (`All` / `Active` / `Completed`) styled as outlined chips; selected one inherits the same `border-primary bg-primary-light text-primary` chip treatment used by Drugs filter chips |
| Apply | `<Button size="sm">{t("common.apply")}</Button>` |
| Reset | `<Button variant="outline" size="sm">{t("common.reset")}</Button>` |

**`UsageHistoryTable` (DataTable + pagination)**

Columns:

| Column | Render | Notes |
|---|---|---|
| **Date & Time** | `formatDateTime(new Date(row.startDate), language)` in `text-muted-foreground` | Sortable, default sort = desc |
| **Patient** | `font-medium text-foreground` | Sortable |
| **Supply** | `text-foreground` | Sortable |
| **Initial Qty** | `formatNumber(row.initialQuantity)` `tabular-nums` | `numeric`, end-aligned |
| **Remaining Qty** | `formatNumber(row.remainingQuantity)` `tabular-nums` | `numeric`, end-aligned |
| **Unit Price** | `formatCurrency(row.unitPrice, resolveLocale(language))` | `numeric` |
| **Status** | `<Badge variant={isActive ? "default" : "secondary"}>` + `<ActivityIcon/>` (active) or `<CheckCircle2Icon/>` (completed) | Sortable |

Pagination: `<DataTablePagination>` in the card footer (10 / 25 / 50 page-size select) — same component Drugs uses.

### 6.4 Modal Specifications

**`SupplyModal` (create / edit supply card)**

- `sm:max-w-lg`; `gap-6` form.
- Two-column grid (`sm:grid-cols-2`): Name, Manufacturer, Provider, Sale Quantity, Min Stock Alert, Frequency.
- Continuous toggle: `<Switch>` (shadcn) immediately below frequency; when off, frequency `<Input>` is disabled and dimmed (`disabled:opacity-50 disabled:bg-muted/30`).
- All required markers: red `*` next to label, `aria-required` on input, `<FormMessage>` below in `text-danger text-xs`.
- Footer: `[Cancel] [Save]` — Save shows `<Spinner/>` and label `t("common.saving")` while pending.

**`SupplyShipmentModal` (add / edit shipment)**

Adapted from `ShipmentModal.tsx` with two material simplifications:

1. **No dual-unit quantity.** One `<Field>` only: `Quantity (units)`, integer `min={1}`. The Drugs modal's "larger + smaller → converted" block collapses to a single field — the plan's "eliminates conversion arithmetic" advantage is honoured here.
2. **Optional expiry date** — date `<Input>` with a `min={today}` (Drugs requires it; supplies don't). Help text under the field: `t("medicalSupplies.help.expiryDate")` → "Optional".

Everything else carries over verbatim from `ShipmentModal.tsx`:
- Warehouse `<NativeSelect>`.
- Buy price + dynamic price-list matrix (default price list highlighted with `border-primary/40 bg-primary-light/40`).
- Below-buy-price alert only shows on **edit** when buy price is being lowered.

**`DispenseSupplyModal` (inpatient dispensing)**

Adopted from `SellDrugModal.tsx` with three deliberate changes (the plan's §3.4 row 3):

1. **No transaction-type radio group.** Supplies dispense only to admitted inpatients — the modal removes the `outside / patient / check` radio entirely and goes straight to patient picker.
2. **No dual-unit quantity.** Single integer `<Input>` (mirroring `SupplyShipmentModal`).
3. **No "Sell" button label.** The CTA is `Dispense & Charge to Bill` (primary, `h-10`).

Visual order top→bottom (a cashier-thinker's mental flow):
1. **Patient picker** (`<NativeSelect>` of `ActivePatient[]`, with the `⚡ Quick check` affordance carried over from `SellDrugModal`).
2. **Shipment readout** — a small read-only card showing warehouse, available stock (`formatNumber(quantity)`), and buy price. This is the visual proof of which shipment is being debited.
3. **Quantity** — single integer input with live `1` to `available` validation. Available shown in a small caption below the input: `Available in shipment: 100 units`. Insufficient override shows `text-danger`.
4. **Selling price** — `<Input type="number" step="0.01">` with a caption showing the default pricelist's price and the computed total.
5. **Below-buy-price warning** — `<Alert variant="destructive">` with `<AlertTriangleIcon/>` when sell price < buy price, citing the buy price explicitly in the message.
6. **Footer:** `[Cancel] [Dispense & Charge to Bill]`.

All the validation logic from `SellDrugModal` (`patientAdmissionRequired`, `priceListRequired`, `insufficientQuantity`, etc.) is reused; only the labels change.

**`WarehouseSupplyInventoryDialog`**

Two changes vs `WarehouseInventoryDialog.tsx`:
- Stat row uses **supply** stats (count / units in stock / total value) — not drug stats.
- The breakdown table column "Drug Name" → "Supply Name"; the row uses `s.supplyName` and a single integer quantity.

### 6.5 Visual & Behavioural Conventions Cheat-Sheet (phase 6.5 only)

| Concern | Rule |
|---|---|
| **Unit conversion** | Never. Supplies are integer-units only. If a UI artefact implies `larger + smaller`, it's a bug. |
| **Expiry (shipment)** | Optional. Render "—" (muted) when null, not an empty badge. |
| **Expiry (supply row)** | Only the *earliest* in-stock shipment's date — supplies with no in-stock shipments show "—". |
| **Dispense CTA** | `Dispense to Patient` (sub-table) and `Dispense & Charge to Bill` (modal). No "Sell" label. |
| **Below-buy-price warning** | Destructive `<Alert>` with `<AlertTriangleIcon/>` + a short, specific message including the buy price. |
| **Status badges** | Always icon + label. `Active` → `<ActivityIcon/>` + success; `Completed` → `<CheckCircle2Icon/>` + secondary. |
| **Filter chips** | Same `border-primary bg-primary-light text-primary` when selected. KPI strip is the *primary* selector; chips are the *secondary* selector. |
| **RTL** | CSS logical utilities only; chevrons flip automatically via Lucide; emoji ⚡ is intentionally kept because it conveys the same meaning in both scripts. |
| **Empty states** | `<EmptyState>` with title + description + primary CTA (e.g. "Add first supply", "No admitted patients — admit or quick-check the patient first"). Never blank. |
| **Loading** | DataTable skeleton rows (6 of them) during initial load; `<EmptyState>` after success with zero rows; inline `<Spinner/>` on per-row sub-table loads. |
| **Pagination** | `<DataTablePagination>` in card footer; page-size select 10/25/50, current page + total. |

### 6.6 Internationalisation — additions to `medicalSupplies.{en,ar}.json`

The existing `medicalSupplies.*` locale files are sufficient for tab names, basic table headers, and create/edit forms. The following keys must be **added** for phase 6.5 (the plan's §3.6 already lists most — confirming the final shape):

```jsonc
{
  "medicalSupplies": {
    "tabs": { "inventory": "Supplies Inventory", "warehouses": "Warehouses", "usageHistory": "Usage History" },
    "kpi": {
      "totalSupplies": "Total Supplies",
      "totalSuppliesHint": "Across all warehouses",
      "lowStock": "Low Stock Alert",
      "lowStockHintActive": "Tap to view only these",
      "lowStockHintCalm": "All supplies above their threshold",
      "expiringSoon": "Expiring Soon",
      "nearExpiryHintActive": "Expiring within 30 days",
      "nearExpiryHintCalm": "No supplies near expiry",
      "turnoverRate": "Monthly Turnover Rate",
      "turnoverRateHint": "Units dispensed (30d) ÷ (in-stock + dispensed 30d)",
      "totalValue": "Total Inventory Value",
      "totalValueHint": "Sum of warehouse stock × buy price"
    },
    "filters": { "all": "All", "lowStock": "Low Stock", "expiringSoon": "Expiring Soon" },
    "status": { "lowStock": "Low Stock", "expired": "Expired", "active": "Active", "completed": "Completed" },
    "table": {
      "supplyName": "Supply Name", "manufacturer": "Manufacturer", "provider": "Provider",
      "autoRenew": "Auto Renew", "totalStock": "Total Stock", "nearestExpiry": "Nearest Expiry"
    },
    "shipment": {
      "warehouse": "Warehouse", "available": "Available in Shipment",
      "addShipment": "Add Shipment", "editShipment": "Edit Shipment",
      "noShipments": "No shipments available for this supply",
      "loadShipmentError": "Failed to load shipment details"
    },
    "actions": { "expand": "Expand shipments", "collapse": "Collapse shipments" },
    "warehouses": {
      "title": "Warehouses",
      "addWarehouse": "Add New Warehouse", "addFirstWarehouse": "Add First Warehouse",
      "viewInventory": "View Inventory", "totalShipments": "Total Shipments",
      "totalUnits": "Total Units in Stock", "totalValue": "Total Stock Value",
      "supplyName": "Supply Name", "expiry": "Expiry", "status": "Status",
      "statusOk": "OK", "statusWarning": "Near expiry", "statusExpired": "Expired",
      "deleteTitle": "Delete Warehouse?", "deleteText": "Are you sure you want to delete \"{{name}}\"? This action cannot be undone."
    },
    "dispense": {
      "title": "Dispense Supply to Inpatient",
      "selectPatient": "Select Admitted Patient", "patientRequired": "Please select a patient",
      "patientAdmissionRequired": "Selected patient is not currently admitted.",
      "quantity": "Quantity to Dispense", "quantityMin": "Quantity must be greater than 0",
      "insufficientQuantity": "Insufficient quantity available in this shipment",
      "unitPrice": "Selling Price per Unit", "totalAmount": "Total Charge",
      "belowBuyPriceWarning": "Selling price is below the shipment buy price ({{buyPrice}}).",
      "confirm": "Dispense & Charge to Bill",
      "success": "Supply dispensed successfully and added to patient bill.",
      "error": "Failed to dispense supply",
      "loadingPatients": "Loading patients…",
      "noAdmittedPatients": "No admitted patients available — admit or quick-check the patient first."
    },
    "usage": {
      "title": "Supply Usage & Efficiency Audit",
      "date": "Date & Time", "patient": "Patient", "supply": "Supply",
      "initialQty": "Dispensed Qty", "remainingQty": "Remaining Qty",
      "status": "Status", "statusActive": "Active", "statusCompleted": "Completed",
      "totalUnits": "Total Units Dispensed", "activeTreatments": "Active Inpatient Usages",
      "patientsServed": "Patients Served",
      "dateRange": "Date Range", "statusFilter": "Status", "statusAll": "All",
      "empty": "No usage records found",
      "loadError": "Failed to load usage history"
    },
    "validation": {
      "supplyNameLength": "Supply name must be at least 3 characters long",
      "saleQuantityMin": "Sale quantity must be greater than 0",
      "minStockNegative": "Minimum stock alert cannot be negative",
      "warehouseRequired": "Please select a warehouse",
      "quantityMin": "Please enter a valid quantity",
      "buyPriceRequired": "Please enter a valid buy price",
      "defaultPriceRequired": "Default price list must have a valid price",
      "warehouseNameLength": "Warehouse name must be at least 3 characters long",
      "locationLength": "Location must be at least 5 characters long"
    },
    "messages": {
      "noSupplies": "No supplies yet",
      "noSuppliesDesc": "Create your first supply to start tracking inventory.",
      "noSuppliesMatchFilter": "No supplies match the current filter",
      "deleteSupplyTitle": "Delete Supply?",
      "deleteSupplyText": "This action cannot be undone.",
      "deleteSupplyWithStockWarning": "This supply has {{quantity}} units in stock. Deleting it will remove all stock records. This action cannot be undone!",
      "createSuccess": "Supply successfully created",
      "updateSuccess": "Supply successfully updated",
      "deleteSuccess": "Supply successfully deleted",
      "shipmentCreateSuccess": "Shipment successfully created",
      "shipmentUpdateSuccess": "Shipment successfully updated",
      "shipmentDeleteSuccess": "Shipment successfully deleted",
      "saveError": "Failed to save supply",
      "deleteError": "Failed to delete supply",
      "loadError": "Failed to load medical supplies"
    }
  }
}
```

Arabic mirror under `medicalSupplies.ar.json` — same keys, RTL values, `formatCurrency(..., "ar-EG")` already wired via `useUIStore` + `resolveLocale`.

### 6.7 Accessibility & Quality Gates

These mirror the existing phase 6.4 bars — **no new a11y work is invented for this phase**:

| Concern | Check | Phase 6.5 specific |
|---|---|---|
| One `<h1>` per page | `<PageHeader title>` | ✅ |
| `dir="rtl"` swap | PageHeader eyebrow, KPI eyebrow, table headers, badges all use logical properties | Verify in AR locale |
| Focus ring | Every Button uses shadcn default `focus-visible:ring-2 focus-visible:ring-ring/50` | — |
| Color-blind safety | Status badges always have icon + text; never color alone (per §8) | Verify Active/Completed and Low Stock/Expiring Soon pairings |
| `aria-sort` on sortable columns | `DataTableColumnHeader` already emits it | — |
| `aria-busy` while loading | `DataTable` sets it on `<Table>` | — |
| Empty state | `<EmptyState>` with title, description, CTA | Every tab has one |
| Skeleton rows | `DataTableSkeleton` renders 6 rows on `loading` | — |
| Touch target ≥ 40px | Buttons & inputs `h-10`; icon-only `h-10 w-10` | Verify in compact breakpoint |
| Reduced motion | Global rule in `index.css` neutralises row stagger + dialog animations | — |
| Filter chip keyboardability | shadcn `<Button>` (`<button>` element) — `Enter`/`Space` toggle | — |
| `aria-expanded` on chevron | Already in `DataTable` expand button | — |
| Sonner `aria-live="polite"` | Library default | — |

### 6.8 Performance Budget

| Asset | Budget |
|---|---|
| `/supplies` page bundle (gzipped, excluding the shared `pharmacy` chunk) | ≤ 25 KB (Drugs is 22 KB; +5 cards KPI strip, no unit conversion arithmetic) |
| Initial paint | < 200 ms (synchronous skeleton, no waterfall) |
| KPI strip hydration | Independent of the inventory table — strips renders as soon as counts resolve |
| TTI on the Inventory tab | < 1 s on a mid-tier desktop |
| Network requests on first paint | 3 (`/medical-supplies`, `/monitor/low-stock`, `/summary`); the rest are on-demand |

The KPI strip is a single memoised computation; it does **not** add a network call. The new `/summary` endpoint is fetched once on Inventory mount, parallel to the supplies list, and updates the Turnover card live as it resolves.

### 6.9 Component Reuse Map

| New in phase 6.5 | Reused from phase 6.4 | Delta |
|---|---|---|
| `SuppliesPage.tsx` | Mirrors `DrugsPage.tsx` structure | Tabs: inventory / warehouses / **usage history** (3rd) |
| `SuppliesKpiStrip.tsx` | Reuses `<EditorialKpiCard>` | 5 cards vs 4 — adds Turnover Rate |
| `SuppliesTable.tsx` | Mirrors `DrugsTable.tsx` | No `unit_conversion` column; manufacturer/provider collapsed into one cell; Total Stock single-integer |
| `SupplyTableRow.tsx` | Same column renderer shape | — |
| `SupplyShipmentsSubTable.tsx` | Reuses `DrugShipmentsSubTable` layout | Quantity = single integer; no `X larger + Y smaller` |
| `SupplyShipmentRow.tsx` | Reuses `ShipmentRow.tsx` | Action button: **Dispense to Patient** (not "Sell") |
| `SupplyModal.tsx` | Mirrors `DrugCardModal.tsx` | No unit-conversion section; optional `frequency`; no `minStockAlert` validation depth |
| `SupplyShipmentModal.tsx` | Mirrors `ShipmentModal.tsx` | Single integer quantity; **optional** expiry date |
| `DispenseSupplyModal.tsx` | Adapted from `SellDrugModal.tsx` | No transaction-type radio; single integer qty; CTA = "Dispense & Charge to Bill" |
| `SuppliesWarehousesPanel.tsx` | Reuses the shared `<WarehousesPanel>` shell | "View Inventory" opens supply-specific dialog |
| `WarehouseSupplyInventoryDialog.tsx` | Adapted from `WarehouseInventoryDialog.tsx` | Supply stats (count / units / value); column "Supply Name" |
| `UsageHistoryPanel.tsx` | **NEW** | Filter bar + summary cards + DataTable + pagination |
| `UsageSummaryCards.tsx` | Mirrors `TransactionSummaryCards.tsx` | 3 cards (not 3 cards of revenue/units) |
| `UsageHistoryTable.tsx` | **NEW** | Audit log; status badge (Active / Completed) |
| `useSuppliesList.ts` | Mirrors `useDrugsList.ts` | No `/monitor/near-expiry` fan-out — supplies use a single per-supply fetch on expand |
| `useSupplyShipments.ts` | Mirrors `useDrugShipments.ts` | — |
| `useSuppliesKpi.ts` | Mirrors `usePharmacyKpi.ts` | Adds turnover rate (calls `/summary`) |
| `useSupplyUsageHistory.ts` | **NEW** | Date range, patient, supply, status filters; paginated |
| `useSharedWarehouses.ts` | Extracted from `useWarehouses.ts` (Drugs) | Lives in `_shared/pharmacy/` so Supplies can import the same hook |

### 6.10 Phase 6.5 Differentiation Callout

> This page **avoids generic pharmacy UI** by: (a) collapsing the dual-unit quantity into a single integer input — visually quieter, semantically correct for supplies; (b) introducing a *turnover rate* KPI that pairs its percentage with the literal formula in the hint, so the value is interpretable without a stats handbook; (c) treating the new Usage History tab as a **chart-room audit** — a flat filter bar, three summary cards, and a paginated table — rather than nesting filters inside modals or burying them in accordions; (d) carrying the phase 6.4 *Editorial Medical* visual language (hairline rails, large extralight numerals, eyebrow captions) without a single new visual primitive.



---

## 7. Future Work: Lazy-Load Shipments + Supply Stats Endpoint

> **Captured during the phase 6.5 code review (Dec 2026).** Same root
> issue as the drugs page — `useSuppliesList` runs a 4-concurrent
> per-supply shipment fan-out on every page mount, which is a 1 + N
> request burst (N up to 100 with the default `pageSize`). Acceptable
> for the small supply catalog, but will not scale past a few
> hundred supplies — and the per-supply fan-out is what currently
> drives the *Expiring Soon* count, the *Total Inventory Value*, and
> the *Monthly Turnover Rate*'s denominator.

### 7.1 Lazy-load shipments on row expand

The shipment sub-table is **already** lazy-loaded — it uses
`useSupplyShipments(supplyId)` on row expand. The fan-out that
*currently runs on mount* is only there to compute
`totalQuantity` / `nearestExpiryDate` / `isNearExpiry` /
`isLowStock` / `totalValue` for the parent row. When §7.2 lands,
the parent row no longer needs that data, so the fan-out can be
deleted entirely.

**Renderer changes:**

1. Remove the fan-out effect from `useSuppliesList.ts` and the
   `aggregates` state. The hook returns a flat list of supplies
   with only the `lowStock` cross-join attached.
2. Remove the `totalInventoryValue` field from
   `UseSuppliesListResult` (the stats endpoint replaces it).
3. The "Nearest Expiry" cell on the supplies table shows "—" while
   collapsed (current behaviour when the fan-out hasn't returned
   yet — this is acceptable until the user expands the row).
4. The `isNearExpiry` filter on the chip group continues to work
   from the stats endpoint's `nearExpiryCount` (and the per-row
   `isNearExpiry` is populated only when the row is expanded, so
   the filter is at most a moment behind the server truth — this
   matches the drugs-page behaviour).

**Backend changes:** none required — the existing
`/api/pharmacy/medical-supply-shipments/supply/:id` already returns
the data on demand.

### 7.2 Supply stats endpoint

The 5-card supplies KPI strip (`SuppliesKpiStrip`) currently reads
`totalInventoryValue` from a client-side fan-out sum and
`turnoverRate` from a per-supply aggregate. To make the stats
composable across modules, add a dedicated stats endpoint (same
shape as the drugs stats endpoint from
`react_implementation_plan.md` § Future Work).

**New endpoint (backend, e.g. `MedicalSupplyStats.controller.ts`):**

```
GET /api/pharmacy/medical-supplies/stats
  → {
      totalSupplies: number,
      lowStockCount: number,
      nearExpiryCount: number,
      totalInventoryValue: number,   // Σ(quantity × buy_price) over in-stock shipments
      monthlyTurnoverRate: number,   // (units dispensed 30d) ÷ (in-stock + dispensed 30d)
      unitsDispensedLast30Days: number,
    }
```

The SQL is already inside `MedicalSupplyShipment.model.ts`
(supply list), `MedicalSupply.model.ts` (`getLowStockSupplies`),
and `MedicalSupplyUsage.model.ts` (`getUsageSummary`). The new
endpoint is a thin composition.

**Renderer changes:**

1. Add `useSuppliesStats()` in
   `src/renderer/src/pages/Supplies/hooks/useSuppliesStats.ts` that
   fetches the new endpoint.
2. `SuppliesKpiStrip.tsx` accepts the stats object directly instead
   of a `SuppliesKpi` value computed in `SuppliesPage` from the
   per-supply fan-out.
3. `useSuppliesKpi` (the renderer-side aggregator) becomes either
   a no-op or is deleted.
4. The `UsageHistoryPanel` summary cards are unrelated to this
   endpoint and continue to read `getSupplyUsageSummary`.

### 7.3 When to do this

- Schedule alongside the drugs follow-up from
  `react_implementation_plan.md` § Phase 6.4 — Future Work so the
  two stats endpoints can be designed in a single change.
- Blockers: a hospital with > 300 supplies **or** per-page load
  > 1.5 s on a standard workstation. The current implementation
  has the same scaling ceiling as the drugs page.

### 7.4 Open question (carry to follow-up)

The 5th KPI (Total Inventory Value) currently uses the **drug** `/api/warehouse`
aggregate for the drugs page and a **supply** client-side sum for
the supplies page. The two stats endpoints should agree on a
shared return shape so the editor can render one consistent card
across both modules. Decide during the follow-up phase whether
the unified endpoint lives at `/api/pharmacy/stats` (domain = both)
or at each module's own controller (domain = one, with
duplication).
