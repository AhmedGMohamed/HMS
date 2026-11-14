# Price Lists Page — Server-Side Pagination & Search

Status: **Planned** (commit 2 of 3)
Branch: `react-refactor`
Depends on: `services_pagination_plan.md` (commit 1) — `/services` now returns a
paginated envelope and its lookup callers already use `all=true`.

## Goal

Paginate the Price Lists card grid server-side and add a name search box.
The card grid keeps its design; pagination is a standalone
`DataTablePagination` below the grid. Page size 10/25/50/100, default 25.

Every lookup caller of `/price-lists` keeps getting the complete list via
`all=true`.

## Current behavior

- `GET /api/price-lists` returns every list with embedded stats as a raw array.
- `PriceListsPage` renders all cards, no search, no pagination.
- `usePriceLists()` fetches once and supports `patchStats()` after a bulk save.
- `ServicesPage` uses `usePriceLists()` for its filter dropdown, badges, and
  `ServiceModal`; this must be updated in the same commit because
  `usePriceLists` becomes paginated.

## API contract

### `GET /api/price-lists`

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int | `1` | Clamped 1..10000 |
| `pageSize` | int | `25` | Clamped 1..100 |
| `all` | `true` \| `1` | off | Lookup escape hatch; unbounded |
| `search` | string | — | `ILIKE '%term%'` on `PriceList.name` |

Response is always:

```json
{
  "data": [
    {
      "pricelist_id": 1,
      "name": "Standard",
      "is_default": true,
      "total_services": "12",
      "total_drugs": "4",
      "total_supplies": "2"
    }
  ],
  "total": 3,
  "page": 1,
  "pageSize": 25
}
```

Ordering stays `ORDER BY pl.name` (ASCII/DB collation) with
`pl.pricelist_id` as a stable tie-breaker. `all=true` returns
`page: 1`, `pageSize: data.length`, `total: data.length`.

## Backend changes

### `src/app/models/PriceList.model.ts`

```ts
export interface PriceListListOptions {
  offset?: number
  limit?: number
  search?: string
}

async getAllPriceLists(
  options: PriceListListOptions = {}
): Promise<{ rows: PriceListWithStats[]; total: number }>
```

- Keep the existing select (all three correlated count subqueries) and
  `FROM PriceList pl`.
- Shared WHERE builder for data + count:
  `search` → `pl.name ILIKE $n` with `%term%`.
- `ORDER BY pl.name, pl.pricelist_id`.
- Append `LIMIT $n OFFSET $n+1` only when `limit !== undefined`.
- Count: `SELECT COUNT(*)::int AS total FROM PriceList pl <where>`.
- Run data + count in parallel and return `{ rows, total }`.

Do not touch `getPriceListById`, `getDefaultPriceList`,
`getPriceListStats`, `getPriceListServices`, or the bulk-price methods.

### `src/app/controllers/PriceList.controller.ts`

```ts
async getAllPriceLists(req: Request, res: Response) {
  const pagination = parsePagination(req)
  const all = isTruthy(req.query.all)
  const search = readString(req.query.search)?.trim() || undefined
  const { rows, total } = await PriceListModel.getAllPriceLists({
    offset: all ? undefined : pagination.offset,
    limit: all ? undefined : pagination.limit,
    search,
  })
  res.json(
    all
      ? buildPage(rows, total, { ...pagination, page: 1, pageSize: rows.length })
      : buildPage(rows, total, pagination)
  )
}
```

Use the same small helpers as the Services controller (duplicate locally or
extract a tiny `query-params` helper under `src/app/utils/` if it stays
generic; a local duplicate is acceptable and keeps commits independent).

### Routes

No change; `GET /` already has `auditLogger`.

## Frontend changes

### `src/renderer/src/pages/PriceLists/api.ts`

```ts
export interface ListPriceListsParams {
  page: number
  pageSize: number
  search?: string
}

export function listPriceListsPage(params: ListPriceListsParams) {
  return api.get<PaginatedResponse<PriceListWithStats>>("/price-lists", {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
  })
}

/** Lookup escape hatch — complete list, unwrapped. */
export function listAllPriceLists() {
  return api
    .get<PaginatedResponse<PriceListWithStats>>("/price-lists", { all: true })
    .then((res) => res.data)
}
```

Remove the old array-returning `listPriceLists()`. Keep `listServices()`
(now `all=true` from commit 1), the shipment loaders, CRUD, and
`setPricesForList` unchanged.

### `src/renderer/src/pages/PriceLists/hooks/usePriceLists.ts`

Signature becomes caller-driven:

```ts
export interface UsePriceListsParams {
  page: number
  pageSize: number
  search: string
}

export interface UsePriceListsResult {
  priceLists: PriceListWithStats[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
  patchStats: (pricelistId: number, stats: PriceListStatsPatch) => void
}
```

- Debounce `search` internally with `useDebouncedValue(search, { delay: 300 })`.
- Fetch on `[page, pageSize, debouncedSearch, nonce]`.
- Keep the existing coercion: `isDefault` to boolean, counts to `Number()`.
- `patchStats` stays page-local (the saved list may be on another page; no
  refetch is required — a bulk save also calls `refresh()` if the page
  already does so today).

### New `src/renderer/src/pages/PriceLists/hooks/useAllPriceLists.ts`

```ts
export function useAllPriceLists(): {
  priceLists: PriceListWithStats[]
  loading: boolean
  error: Error | null
  refresh: () => void
}
```

Uses `listAllPriceLists()` plus the same count coercion. This replaces
`usePriceLists()` in `ServicesPage` for the filter dropdown, badge names, and
`ServiceModal`. Keep it in the PriceLists module because it owns the
endpoint and the wire-shape normalization.

### `src/renderer/src/pages/PriceLists/PriceListsPage.tsx`

- Add `search`, `page` (1), `pageSize` (25).
- Search box above the grid:
  ```tsx
  <div className="relative w-full max-w-sm">
    <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      value={search}
      onChange={(e) => { setSearch(e.target.value); setPage(1) }}
      placeholder={t("priceLists.placeholders.searchPriceLists")}
      className="ps-9"
      aria-label={t("priceLists.placeholders.searchPriceLists")}
    />
  </div>
  ```
- Below the grid, only when `total > 0`:
  ```tsx
  <DataTablePagination
    page={page}
    pageSize={pageSize}
    total={total}
    pageSizes={[10, 25, 50, 100]}
    onPageChange={setPage}
    onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
  />
  ```
  Wrap in a `mt-6` container so it sits under the cards.
- Page-out-of-range clamp effect (same pattern as Services):
  `if (!loading && total > 0 && priceLists.length === 0 && page > 1) setPage(ceil(total / pageSize))`.
- Empty state:
  - search active and no rows → `priceLists.messages.noMatchingPriceLists`
  - no search and no rows → existing `noPriceLists` create-first state
- `patchStats` still passed through to the Add Prices success path.
- Default-list handling, modals, delete confirmation: unchanged.

`PriceListsGrid.tsx` needs no structural change; it receives the paged rows.
Its docblock can note that the page now owns pagination.

### `ServicesPage` cross-page fix

Replace `usePriceLists()` with `useAllPriceLists()` in
`src/renderer/src/pages/Services/ServicesPage.tsx`. The rest of the wiring
(`priceLists={lists.priceLists}`, `ServiceFilters`, `ServiceModal`) stays the
same. Without this, the Services filter dropdown would only see the first
page of price lists.

## Lookup consumers — request the full list

All of these must send `all=true`; otherwise they silently see only page 1.

| File | Change |
|---|---|
| `src/renderer/src/pages/PriceLists/api.ts` | replaced by `listAllPriceLists()` |
| `src/renderer/src/pages/Insurance/modals/CompanyModal.tsx` | import/use `listAllPriceLists()` instead of `listPriceLists()` |
| `src/renderer/src/pages/Drugs/api.ts` (`listPriceLists`) | `api.get<PaginatedResponse<PriceList>>("/price-lists", { all: true }).then(r => r.data)` |
| `src/renderer/src/pages/Supplies/api.ts` (`listPriceLists`) | same |
| `src/renderer/src/pages/Patients/api.ts` (`listPriceLists`) | add `{ all: true }`; keep `parseLegacyList` or simplify to `res.data` |

`AddPricesModal` does not fetch price lists; it receives the selected list
as a prop, so it needs no change.

## i18n

Add to `src/renderer/src/locales/priceLists.en.json` and
`priceLists.ar.json`:

```json
"placeholders": {
  "searchPriceLists": "Search price lists..."
},
"messages": {
  "noMatchingPriceLists": "No price lists match your search"
}
```

Arabic: `"البحث في قوائم الأسعار..."` and
`"لا توجد قوائم أسعار مطابقة لبحثك"`.

## Tests

### `src/app/tests/models/PriceList.model.spec.ts`

There are five existing `getAllPriceLists()` call sites expecting an array —
update each to destructure `{ rows, total }` (or use `rows`). Add:

- page/limit/offset returns the expected slice with a correct `total`
- `search` matches case-insensitively
- unbounded (no offset/limit) returns every row
- rows still carry `total_services` / `total_drugs` / `total_supplies`

### `src/app/tests/controllers/PriceList.controller.spec.ts`

- Assert the envelope shape.
- Add `?all=true`.
- Add `?search=` forwarding.

## Verification

```powershell
npx tsc -p src/app/tsconfig.json --noEmit
npx tsc -p src/renderer/tsconfig.json --noEmit
npm run test:renderer
npm run check-i18n
npm run build
```

Manual smoke:

- `/api/price-lists?page=1&pageSize=10`
- `...&search=stand`
- `/api/price-lists?all=true`
- UI: search, clear search, change page size, navigate pages, delete the only
  card on the last page, open Add Prices, confirm the Services filter dropdown
  still lists every price list.

## Edge cases

- Empty `data` + `total > 0` on a stale page → clamp back to the last page.
- `all=true` for lookups with zero lists → `data: []`.
- Search is trimmed; blank means no filter.
- Counts remain JSON strings from `pg`; only the renderer coerces them.
- Deleting a list refetches the current page (existing behavior via
  `refresh()`), and the clamp effect handles the last-card case.

## Commit

Message: `feat(price-lists): server-side pagination and search`

Files:

- `src/app/models/PriceList.model.ts`
- `src/app/controllers/PriceList.controller.ts`
- `src/app/tests/models/PriceList.model.spec.ts`
- `src/app/tests/controllers/PriceList.controller.spec.ts`
- `src/renderer/src/pages/PriceLists/api.ts`
- `src/renderer/src/pages/PriceLists/hooks/usePriceLists.ts`
- `src/renderer/src/pages/PriceLists/hooks/useAllPriceLists.ts` (new)
- `src/renderer/src/pages/PriceLists/PriceListsPage.tsx`
- `src/renderer/src/pages/PriceLists/components/PriceListsGrid.tsx` (docblock only)
- `src/renderer/src/pages/Services/ServicesPage.tsx` (price-list source)
- `src/renderer/src/pages/Insurance/modals/CompanyModal.tsx`
- `src/renderer/src/pages/Drugs/api.ts`
- `src/renderer/src/pages/Supplies/api.ts`
- `src/renderer/src/pages/Patients/api.ts`
- `src/renderer/src/locales/priceLists.en.json`
- `src/renderer/src/locales/priceLists.ar.json`
- `.opencode/plans/price_lists_pagination_plan.md` (copy of this document)
