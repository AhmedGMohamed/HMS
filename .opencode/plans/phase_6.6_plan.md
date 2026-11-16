# Implementation Plan — Phase 6.6: Price Lists Page + Services Page

**Scope:** Migrate the Price Lists page (Stage 1) and Services page (Stage 2), replacing `ModulePlaceholder` bodies at `src/renderer/src/pages/PriceLists/PriceListsPage.tsx` and `src/renderer/src/pages/Services/ServicesPage.tsx`. Backend companion in `phase_6.6_backend_plan.md`.  
**Target:** React 19 + Vite + Tailwind v4 + shadcn/ui + react-hook-form + Zod + react-i18next.  
**Companion docs:** `react_implementation_plan.md` §6.6 (sketch is stale — see Decisions #1), `design.md`, `phase_6.5_plan.md` (format/pattern reference).

---

## 1. Architectural Decisions Summary

| # | Topic | Decision |
|---|-------|----------|
| 1 | Umbrella plan §6.6 sketch | **Treat as stale.** No AR/EN service names, no category, no effective dates, no "pricing rules" — backend `Service` = single `name`, `service_type` (once/hourly/daily), `auto_renew`, `auto_add_on_admission`, per-list `ServicePrice` rows (+ prepayment), `ServiceDrug` links; `PriceList` = `name` + `is_default`. Migrate to the real contract. |
| 2 | Price Lists page layout | **Card grid** (legacy parity): shadcn `Card` per list with name, Default badge, 3 priced-item counts, actions (Add Prices / Edit / Delete). Not a DataTable. |
| 3 | Services page layout | **DataTable** (legacy parity columns) + toolbar filters (search, type, price list, drug) — all client-side. |
| 4 | Default price list invariant | **Enforce at UI + API.** Editing the current default: checkbox checked + disabled (move default by setting it on another list). Backend rejects unsetting the last remaining default with a clear 400. |
| 5 | Bulk pricing permission | New bulk endpoint gated on `manage_prices` (the page's permission). Existing per-entity PUTs keep their current permissions. |
| 6 | Add Prices save | Single bulk `PUT /api/price-lists/:id/prices` (transactional upsert). Blank price inputs are skipped (not saved/removed). |
| 7 | Data fetching | Established renderer pattern: hand-rolled `useState`/`useEffect` hooks + `nonce` refresh + cancelled flag; client-side search/filter/sort (no react-query). |
| 8 | Legacy bugs | Do **not** replicate: shipment prepayment checkbox mis-pre-check, quantity rendered as currency, untranslated "N Supplies" suffix, N+1 fetches (services detail loop, per-list stats). |
| 9 | Testing | Backend: extend Jasmine suite (see backend plan). Frontend: no new unit tests (deferred per plan); gates = `npm run typecheck`, `npm run lint`, `npm run check-i18n:renderer`, manual matrix incl. RTL. |
| 10 | Price removal | **Supported** (user decision). Bulk endpoint accepts `price: null` entries → deletes that (entity, pricelist) price row in the same transaction. Modal gets an explicit per-card "Remove price" action (marked state visible + undoable pre-save), not implicit field-clearing. Legacy could never remove prices — this is a deliberate improvement. |
| 11 | Shared Service types | Stage 1 (Add Prices services tab) needs Service shapes before the Services module exists → define `Service`, `ServicePrice`, `ServiceDrug`, `ServiceType` in `pages/_shared/services/types.ts` during Stage 1; Services module re-exports from there (mirrors the `_shared/pharmacy/types.ts` + barrel pattern). |

### 1.1 Backend API Contract

See `phase_6.6_backend_plan.md` §2.1–2.2 for the bulk endpoint and batch stats. Existing endpoints consumed:

| Endpoint | Method | Permission | Purpose |
|----------|--------|-----------|---------|
| `/api/price-lists` | GET | auth | List all (with embedded stats after Stage 0) |
| `/api/price-lists` | POST | `manage_prices` | Create `{name, is_default}` |
| `/api/price-lists/:id` | PUT | `manage_prices` | Rename / set default |
| `/api/price-lists/:id` | DELETE | `manage_prices` | Delete (400 if default; 409 if referenced) |
| `/api/price-lists/:id/stats` | GET | auth | Per-list counts (kept for compat; frontend stops using it) |
| `/api/price-lists/:id/prices` | PUT | `manage_prices` | **NEW** bulk price-set |
| `/api/services` | GET | auth | All services incl. `prices[]` (per-list) + `drugs[]` (`null` when empty) |
| `/api/services` | POST | `manage_services` | Create; returns bare row (no prices/drugs) → refetch |
| `/api/services/:id` | PUT | `manage_services` | Update; `prices` = UPSERT-only; `drugs` = full replace |
| `/api/services/:id` | DELETE | `manage_services` | Delete (409 if referenced) |
| `/api/pharmacy/drugs/shipments` | GET | auth | All drug shipments incl. `prices[]` (batch-scoped) |
| `/api/pharmacy/medical-supply-shipments` | GET | auth | All supply shipments incl. `prices[]` |
| `/api/pharmacy/drugs/cards` | GET | auth | Drug picker source for Service modal |

Wire notes: `lib/api.ts` auto-camelCases responses / snake_cases request bodies. `prices[].price` is numeric on list endpoints but **string** (`toFixed(2)`) on `GET/PUT /api/services/:id` — parse defensively in one place (`Number(price)`). `prices`/`drugs` can be `null` → normalize to `[]`.

---

## 2. Stage 1 — Price Lists Page

All new files under `src/renderer/src/pages/PriceLists/` (replace placeholder `PriceListsPage.tsx`). Follow Supplies-page conventions: `"use client"` header, 2-space indent, `zod` messages = i18n keys, `sonner` toasts, `ApiError`-first error messages.

```
PriceLists/
├── PriceListsPage.tsx        # PageHeader (eyebrow "sidebar.priceLists") + grid + modal/confirm state
├── api.ts                    # listPriceLists, createPriceList, updatePriceList, deletePriceList,
│                             # setPricesForList (bulk), listAllDrugShipments, listAllSupplyShipments, listServices
├── types/priceList.ts        # PriceList (with embedded stats), AddPricesPayload, shipment/supply card view types
│                             # (reuse `PriceList` base from @/pages/_shared/pharmacy/types — re-export, don't duplicate)
├── schemas/priceList.schema.ts    # name ≥ 3, isDefault boolean
├── schemas/addPrices.schema.ts    # per-entry price/coercion + prepayment refinement rules
├── hooks/usePriceLists.ts    # list (+stats) / loading / error / nonce-refresh
├── components/PriceListsGrid.tsx  # responsive grid (1/2/3 cols) + EmptyState ("createFirst" action)
├── components/PriceListCard.tsx   # name, Default badge, 3 counts (priceLists.stats.*), actions
└── modals/
    ├── PriceListModal.tsx    # create/edit: name + Set as Default checkbox (disabled-checked on current default);
    │                         # ConfirmDialog on make-default; help note (priceLists.help.defaultNote)
    └── AddPricesModal.tsx    # 3 Tabs (services / drugs / supplies), per-tab search + count badge,
                              # per-card price (+ prepayment for services & drugs), pre-filled from existing prices,
                              # "Price Set" border+badge when priced, per-card "Remove price" action (Decision #10),
                              # Save = bulk endpoint (sets + removals), Skip for Now, Cancel
```

**Verified wire shapes for the Add Prices datasets** (confirm at implementation; verified 2026-09-15):
- `GET /api/services` → elements `{ serviceId, name, serviceType, autoRenew, autoAddOnAdmission, prices: [{pricelistId, price, requiresPrepayment, prepaymentType, prepaymentAmount}] | null, drugs: [{serviceId, drugId, name}] | null }` — `prices`/`drugs` are SQL `null` when empty → normalize to `[]`; no `serviceId` inside `prices[]` items.
- `GET /api/pharmacy/drugs/shipments` (list-all) → elements = `DrugShipment`-shaped (`shipmentId, drugId, warehouseId, quantity, buyPrice, expiryDate, receivedDate, drugName, warehouseName, unitConversion`) + `prices: [{pricelistId, price, requiresPrepayment, prepaymentType, prepaymentAmount}] | null` — **no** `quantityInLargerUnit`, **no** `pricelistName`; includes out-of-stock rows → filter `quantity > 0` client-side. Define PriceLists-local view types (existing `DrugShipment` type in `_shared/pharmacy/types.ts` doesn't quite match list-all).
- `GET /api/pharmacy/medical-supply-shipments` (list-all) → elements `{ shipmentId, supplyId, warehouseId, quantity, buyPrice, expiryDate, ..., supplyName, warehouseName, prices: [{pricelistId, price}] }` (no prepayment fields) — N+1 pricing query server-side; filter `quantity > 0` client-side.

Key behaviors:
- **Page skeleton:** `"use client"`, `useTranslation()` + `useEnsureNamespace("priceLists")` (idempotent; namespaces/routes/breadcrumbs already registered). PageHeader eyebrow `t("sidebar.priceLists")`, actions = create button.
- **Load:** `listPriceLists` only (stats embedded — no N+1). `AddPricesModal` lazy-loads its 3 datasets on open (`Promise.all` of services + both shipment lists), client-side search per tab (drugs/supplies also match warehouse name), filter shipments to `quantity > 0`.
- **Card price states:** unpriced → priced ("Price Set" badge, accent border) → **marked-for-removal** (danger badge `priceWillBeRemoved`, inputs disabled/cleared, undo restores previous values). Removal is an explicit Trash2 ghost icon button, only enabled on priced cards — not field-clearing (Decision #10). No per-removal confirm; save is the explicit commit.
- **Save prices:** collect entries → upserts (non-blank, changed or new) + removals (`price: null`) → `setPricesForList` → success toast `{{set}} set, {{removed}} removed` (all counts i18n'd, incl. supplies) using response counts, refresh list hook (response stats patch card counts).
- **Untouched cards** (pre-filled, not edited) send nothing — no accidental upserts/removals. Only diff-changed or explicitly-removed entries go in the payload.
- **Post-create flow:** after create, ConfirmDialog "Add Prices Now?" (priceLists.messages.addPricesNow*) → opens modal for the new list.
- **Delete:** `ConfirmDialog` variant danger; description switches to `deleteWithAssociationsWarning` ({{services}}/{{drugs}} interpolation; extend text to include supplies count) when counts > 0; on `409` show server message via toast.
- **Default handling:** card Delete hidden for default list; modal blocks unsetting (Decision #4); 400 from API surfaced as toast with server message.
- **Permission note:** bulk endpoint is `manage_prices` — the page's own permission — so the manage_prices-only user gap is closed by Stage 0.

i18n: extend existing `src/renderer/src/locales/priceLists.{en,ar}.json` (structure already mirrors legacy keys; add: `actions.removePrice` + aria, `status.priceWillBeRemoved`, save toast with `{{set}}`/`{{removed}}` interpolation, delete-warning supplies interpolation, tab count-badge label, default-guard error, empty-tab states). Namespace + route + breadcrumb already registered.

---

## 3. Stage 2 — Services Page

All new files under `src/renderer/src/pages/Services/` (replace placeholder).

```
Services/
├── ServicesPage.tsx          # PageHeader (eyebrow "sidebar.services") + filters + table + modals
├── api.ts                    # listServices, createService, updateService, deleteService,
│                             # listDrugCards (reuse from @/pages/Drugs/api)
├── types/service.ts          # Re-export barrel of `@/pages/_shared/services/types` (Decision #11 —
│                             # Service, ServicePrice, ServiceDrug, ServiceType live there, created in Stage 1)
│                             # + CreateServicePayload / UpdateServicePayload (module-local)
├── schemas/service.schema.ts # zod: name ≥ 3, type enum, per-list price rows (required for included lists,
│                             # prepayment amount required when toggled, percentage 0–100)
├── hooks/useServices.ts      # list; useMemo enrichment (normalize prices/drugs null→[], price→Number);
│                             # client-side filters: search, type, priceList, drug-text; nonce-refresh
├── components/ServicesTable.tsx   # DataTable: Name, Type badge, Auto Renew ✓/✗, Auto Add ✓/✗,
│                                  # Price Lists badges (name: price; tooltip w/ prepayment info), Drugs badges, actions col
├── components/ServiceFilters.tsx  # toolbar: search input, type NativeSelect, price-list NativeSelect, drug filter input
├── components/DrugPicker.tsx      # dual-list Available ⇄ Selected with debounced search (replaces legacy picker)
└── modals/ServiceModal.tsx        # Dialog + RHF + zodResolver:
                                   #   name, type select, autoRenew checkbox (auto-unchecked + disabled when type=once),
                                   #   autoAdd checkbox, per-price-list price rows (default list always priced+required;
                                   #   others behind "Include Price List" checkbox; prepayment sub-fields),
                                   #   DrugPicker section
```

Key behaviors:
- **Page skeleton:** `"use client"`, `useTranslation()` + `useEnsureNamespace("services")`. PageHeader eyebrow `t("sidebar.services")`, actions = create button.
- **Load:** `GET /api/services` once (drops legacy N+1 detail loop); prices normalized with `Number()`.
- **Drug picker data:** reuse `listDrugCards({ pageSize: 100 })` from `@/pages/Drugs/api` (already paginated envelope) — do not re-implement.
- **Create:** POST → refetch list (response omits prices/drugs) → toast `services.messages.createSuccess`.
- **Edit:** pre-fill from row; submit `PUT /api/services/:id` with `{name, service_type, auto_renew, auto_add_on_admission, prices: [...included rows], drugs: selectedDrugIds}` (drugs array always sent = full replace; prices upsert-only).
- **Delete:** `ConfirmDialog` danger; `409` shows server message (Stage 0) instead of generic error.
- **Sorting:** client-side via `DataTable` controlled sort (`sortKey` on name/type).

i18n: extend existing `src/renderer/src/locales/services.{en,ar}.json` (key skeleton already matches legacy; add filter labels/aria, table sort aria, drug-picker strings, any new messages). Namespace + route + breadcrumb already registered.

---

## 4. Implementation Steps

| Stage | Deliverable | Key Files | Exit Criteria |
|-------|-------------|-----------|---------------|
| 1 | Price Lists page | `pages/PriceLists/**` | Placeholder replaced; CRUD + default rules + Add Prices via bulk endpoint; typecheck/lint/check-i18n pass; manual matrix incl. RTL |
| 2 | Services page | `pages/Services/**` | Placeholder replaced; CRUD + filters + drug picker + price matrix; same gates |

Order: backend (see backend plan) → Stage 1 → Stage 2 (backend first so both stages build against final contract). Stage 1 creates `pages/_shared/services/types.ts`; Stage 2 re-exports from it.

---

## 5. Verification Plan

Automated (per stage): `npm run lint`, `npm run typecheck`, `npm run check-i18n:renderer`, backend: Jasmine suite.

Manual matrix (highlights):
| Area | Case | Expected |
|------|------|----------|
| Price lists | create → "Add Prices Now?" → set prices in all 3 tabs → save | Single bulk request; counts update; toast lists all 3 counts (AR: translated) |
| Price lists | edit current default: uncheck default | Checkbox disabled+checked; API 400 if forced |
| Price lists | set default on list B | ConfirmDialog; A loses default; B gains; Delete hidden on B |
| Price lists | delete referenced list (patient/insurance linked) | 409 message toast, list remains |
| Add Prices | untouched cards (pre-filled, not edited) | Not sent — no accidental upserts/removals |
| Add Prices | prepayment toggle w/o amount | Blocked by zod, i18n message |
| Add Prices | mark a priced card for removal → save | Price row deleted for that list only; other lists intact; toast reports removed count; card returns to unpriced after refresh |
| Add Prices | mark for removal, then undo before save | Card restored; nothing sent for it |
| Services | create with 2 of 3 lists priced | Only included rows sent; default always included |
| Services | type = once | autoRenew unchecked + disabled |
| Services | edit drugs (remove all) | `drugs: []` clears associations |
| Services | delete billed service | 409 message toast |
| Permissions | `manage_prices`-only user | Page loads; Add Prices saves succeed (bulk route) |
| RTL | Arabic mode | Logical properties (`me-/ps-/text-start`), tabular-nums on prices, no mirrored bugs |

---

## 6. Future Work / Out of Scope

- Per-page shipment fan-out inside Add Prices datasets (list-all endpoints are unpaginated — fine at current data volume; revisit with a paged/priced-only endpoint if shipment counts grow large, aligning with the unified `/api/pharmacy/stats` question from `phase_6.5_plan.md` §7).
- Server-side pagination/search for `/api/services` (payload grows with lists × services) — capture if catalog exceeds ~300 services.
- Services used by other modules (patients billing dialog, doctors price overrides) already consume the same endpoints — no changes there in 6.6.
