# Services Page — Server-Side Pagination & Filtering

Status: **Planned** (commit 1 of 3)
Branch: `react-refactor`
Related: `price_lists_pagination_plan.md` (commit 2), `active_clockins_pagination_plan.md` (commit 3)

## Goal

Make `/services` a true server-paginated list. All four existing filters
(name search, service type, price list, drug text) and both sortable columns
move to the backend. The Services page must always send `page`/`pageSize` and
must never use the `all=true` escape hatch.

## Current behavior

- `GET /api/services` returns every service as a raw array.
- `ServiceFilters` + `ServicesPage` filter/sort client-side with `useMemo`.
- `ServicesTable` sorts the current in-memory array.
- `listServices()` is also used as a lookup by PriceLists, Patients, and
  Employees modules — those need the complete list and will use `all=true`.

## API contract

### `GET /api/services`

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int | `1` | Clamped 1..10000 by `parsePagination` |
| `pageSize` | int | `25` | Clamped 1..100 |
| `all` | `true` \| `1` | off | Lookup escape hatch; unbounded, ignores page/pageSize |
| `search` | string | — | `ILIKE '%term%'` on `Service.name` |
| `serviceType` | `once` \| `hourly` \| `daily` | — | Invalid values ignored |
| `pricelistId` | int | — | Service has a `ServicePrice` row for that list |
| `drug` | string | — | Service has an associated drug whose `DrugCard.name` matches |
| `sort` | `name` \| `serviceType` | `name` | Whitelisted; unknown → `name` |
| `dir` | `asc` \| `desc` | `asc` | Unknown → `asc` |

Response is **always** the shared envelope:

```json
{ "data": [ ...services... ], "total": 42, "page": 1, "pageSize": 25 }
```

`all=true` returns the same keys with `page: 1`, `pageSize: data.length`,
`total: data.length`. One shape everywhere means consumers only need to
unwrap `.data`; they must still pass `all=true` to get every row.

Filters may be combined with `all=true` (lookup callers send none).

Validation strategy mirrors `DrugCard.controller`: sanitize and ignore
unknown/blank values; do not throw 400s for filters.

## Backend changes

### `src/app/models/Service.model.ts`

Replace `getAllServices()` with an options-based method:

```ts
export interface ServiceListOptions {
  offset?: number
  limit?: number
  search?: string
  serviceType?: "once" | "hourly" | "daily"
  pricelistId?: number
  drug?: string
  sort?: "name" | "serviceType"
  dir?: "asc" | "desc"
}

async getAllServices(
  options: ServiceListOptions = {}
): Promise<{ rows: ServiceListRow[]; total: number }>
```

- `ServiceListRow` = the existing return element type
  (`Service & { prices: ServicePrice[] } & { drugs: Array<ServiceDrug & { name: string }> }`).
- Keep the existing `SELECT s.*, <prices json_agg>, <drugs json_agg>` select list
  unchanged. Pagination applies to the outer query only, so `prices`/`drugs`
  stay intact for the page's rows.
- Add a private/shared `buildFilters(options)` that returns
  `{ where: string, values: unknown[] }` and is used by BOTH the data query
  and the count query, so they cannot drift:
  - `search` → `s.name ILIKE $n` (`%term%`)
  - `serviceType` → `s.service_type = $n`
  - `pricelistId` →
    `EXISTS (SELECT 1 FROM ServicePrice sp WHERE sp.service_id = s.service_id AND sp.pricelist_id = $n)`
  - `drug` →
    `EXISTS (SELECT 1 FROM ServiceDrug sd JOIN DrugCard d ON d.drug_id = sd.drug_id WHERE sd.service_id = s.service_id AND d.name ILIKE $n)`
- Sort map (fixed identifiers, never interpolate user input):
  ```ts
  const SORT_COLUMNS = { name: "s.name", serviceType: "s.service_type" } as const
  ```
  Order: `ORDER BY ${SORT_COLUMNS[sort]} ${dir.toUpperCase()}, s.service_id ${dir.toUpperCase()}`
  so equal names/types have a stable order across pages.
- Append `LIMIT $n OFFSET $n+1` only when `limit !== undefined`.
- Count:
  ```sql
  SELECT COUNT(*)::int AS total FROM Service s <where>
  ```
  Run data + count queries in parallel (`Promise.all`) and return
  `{ rows: dataResult.rows, total: countResult.rows[0]?.total ?? 0 }`.

Do **not** change `searchServices` (`/search`) or `getServiceSuggestions`
(`/suggestions`).

### `src/app/controllers/Service.controller.ts`

```ts
async getAllServices(req: Request, res: Response) {
  const pagination = parsePagination(req)
  const all = isTruthy(req.query.all)
  const { rows, total } = await ServiceModel.getAllServices({
    offset: all ? undefined : pagination.offset,
    limit: all ? undefined : pagination.limit,
    search: readString(req.query.search)?.trim() || undefined,
    serviceType: readServiceType(req.query.serviceType),
    pricelistId: readPositiveInt(req.query.pricelistId),
    drug: readString(req.query.drug)?.trim() || undefined,
    sort: readSort(req.query.sort),
    dir: readString(req.query.dir) === "desc" ? "desc" : "asc",
  })
  res.json(
    all
      ? buildPage(rows, total, { ...pagination, page: 1, pageSize: rows.length })
      : buildPage(rows, total, pagination)
  )
}
```

Local helpers (`readString`, `readPositiveInt`, `isTruthy`, `readServiceType`,
`readSort`) keep query parsing explicit; `readServiceType` only accepts the
three enum values, `readSort` only `name`/`serviceType`.

### Routes

No route change. `GET /` already has `auditLogger`.

## Frontend changes

### `src/renderer/src/pages/Services/api.ts`

```ts
export interface ListServicesParams {
  page: number
  pageSize: number
  search?: string
  serviceType?: ServiceType | ""
  pricelistId?: number | ""
  drug?: string
  sort?: "name" | "serviceType"
  dir?: "asc" | "desc"
}

export function listServicesPage(params: ListServicesParams) {
  return api.get<PaginatedResponse<Service>>("/services", {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
    serviceType: params.serviceType || undefined,
    pricelistId: params.pricelistId === "" ? undefined : params.pricelistId,
    drug: params.drug || undefined,
    sort: params.sort,
    dir: params.dir,
  })
}

/** Lookup escape hatch — complete list, unwrapped for existing callers. */
export function listAllServices() {
  return api
    .get<PaginatedResponse<Service>>("/services", { all: true })
    .then((res) => res.data)
}
```

Remove the old array-returning `listServices()`.

### `src/renderer/src/pages/Services/hooks/useServices.ts`

Change from a self-contained list hook to a caller-driven fetch hook:

```ts
export interface UseServicesParams {
  page: number
  pageSize: number
  search: string
  serviceType: ServiceType | ""
  pricelistId: number | ""
  drug: string
  sort: { columnId: "name" | "serviceType"; direction: "asc" | "desc" } | null
}

export interface UseServicesResult {
  services: NormalizedService[]
  total: number
  loading: boolean
  error: Error | null
  refresh: () => void
}
```

- Debounce `search` and `drug` internally with
  `useDebouncedValue(value, { delay: 300 })`.
- Fetch on `[page, pageSize, debouncedSearch, debouncedDrug, serviceType,
  pricelistId, sort, nonce]` with the existing `cancelled` flag pattern.
- Map every row through `normalizeService`; store `page.total`.
- Keep the `refresh()` nonce.

### `src/renderer/src/pages/Services/ServicesPage.tsx`

- Replace the filtered `useMemo` with paginated state:
  `page` (default 1), `pageSize` (default 25), existing `search`,
  `typeFilter`, `priceListFilter`, `drugFilter`, `sort`.
- Every mutator resets to page 1 **in the handler** (no reset effect, so no
  wasted request):
  - `onSearchChange` → `setSearch(v); setPage(1)`
  - type/price-list/drug handlers → set value + `setPage(1)`
  - `onSortToggle` → `setSort(next); setPage(1)`
  - `onPageSizeChange` → `setPageSize(n); setPage(1)`
- `useServices({ page, pageSize, search, serviceType: typeFilter,
  pricelistId: priceListFilter, drug: drugFilter, sort })`.
- Pass `pagination={{ page, pageSize, total, onPageChange: setPage,
  onPageSizeChange: handlePageSizeChange, pageSizes: [10, 25, 50, 100] }}`
  to `ServicesTable`.
- Page-out-of-range clamp (delete/refetch on last page):
  ```ts
  useEffect(() => {
    if (!loading && total > 0 && services.length === 0 && page > 1) {
      setPage(Math.max(1, Math.ceil(total / pageSize)))
    }
  }, [loading, total, services.length, page, pageSize])
  ```
- Empty state: `hasActiveFilters = search || typeFilter || priceListFilter ||
  drugFilter`. Pass `emptyTitle`/`emptyDescription` from
  `services.messages.noMatches` / `noMatchesDesc` when true, otherwise the
  existing `noServices` / `noServicesDesc`.
- Price-list dropdown + badges still come from `usePriceLists()` in this
  commit (that hook is still unpaginated until commit 2).

### `src/renderer/src/pages/Services/components/ServicesTable.tsx`

- Add `pagination: DataTablePaginationSlot` to props and pass it to
  `<DataTable pagination={pagination} ...>`.
- Delete the client `sorted` memo and pass `services` straight through —
  the server already returns the requested order.
- Keep `sort` + `onSortToggle` so header icons and toggles still work.
- Update the docblock that says sorting is client-side.

`ServiceFilters.tsx` needs no change (already fully controlled).

## Lookup consumers (same commit)

The endpoint now returns an envelope, so every direct `/services` caller
must request `all=true` and unwrap `.data`. Their function signatures stay
array-returning, so `AddPricesModal` and `EmployeeModal` do not change.

| File | Change |
|---|---|
| `src/renderer/src/pages/PriceLists/api.ts` | `listServices()` → `api.get<PaginatedResponse<Service>>("/services", { all: true }).then(r => r.data)` |
| `src/renderer/src/pages/Patients/api.ts` (`listServices`) | same |
| `src/renderer/src/pages/Employees/api.ts` (`listServices`) | same |

`src/renderer/src/pages/Services/api.ts` `listDrugCards` is unrelated
(already `pageSize: 100` on the Drugs endpoint).

## i18n

Add to `src/renderer/src/locales/services.en.json` and `services.ar.json`:

```json
"messages": {
  "noMatches": "No services match your filters",
  "noMatchesDesc": "Try a different search or clear the filters."
}
```

Arabic: `"لا توجد خدمات مطابقة"` /
`"جرّب بحثًا آخر أو امسح عوامل التصفية."`

No other new keys; pagination labels come from `common.*`.

## Tests

### `src/app/tests/models/Service.model.spec.ts`

- Update both existing calls to destructure `{ rows, total }`.
- Add cases:
  - default page returns `total` > rows length and respects `limit`/`offset`
  - `search` matches case-insensitively
  - `serviceType` filter
  - `pricelistId` filter (`EXISTS`)
  - `drug` filter (`EXISTS` + join)
  - `sort: "serviceType"` + `dir: "desc"`
  - unbounded (`offset`/`limit` undefined) returns all
  - `prices`/`drugs` are still populated for paginated rows

### `src/app/tests/controllers/Service.controller.spec.ts`

- Assert the envelope (`data`/`total`/`page`/`pageSize`).
- Add `?all=true` case (envelope, full list).
- Add a case that filter params are forwarded (spy on the model).

## Verification

```powershell
npx tsc -p src/app/tsconfig.json --noEmit
npx tsc -p src/renderer/tsconfig.json --noEmit
npm run test:renderer
npm run check-i18n
npm run build
```

Backend specs: run `npm test` if the jasmine suite is runnable; otherwise
note that specs were updated but not executed (existing repo status).

Manual smoke with the dev server:

- `/api/services?page=1&pageSize=10`
- `...&search=lab&serviceType=once`
- `...&pricelistId=1&drug=para`
- `...&sort=serviceType&dir=desc`
- `/api/services?all=true` (full array in `data`)
- UI: type in search, change filters, flip sort, change page size, navigate
  pages, delete the last row of the last page (page clamps back).

## Edge cases

- Page beyond the last page → empty `data`, correct `total`; the page clamp
  effect moves the user back.
- `all=true` with zero rows → `pageSize: 0`, `total: 0`; lookup consumers
  only need `data`.
- Whitespace-only search/drug → dropped before the query.
- Service with zero prices/drugs still returns `null` for those fields;
  `normalizeService` handles it as today.
- Sorting is stable via `s.service_id` tie-breaker.

## Commit

Message: `feat(services): server-side pagination and filtering`

Files:

- `src/app/models/Service.model.ts`
- `src/app/controllers/Service.controller.ts`
- `src/app/tests/models/Service.model.spec.ts`
- `src/app/tests/controllers/Service.controller.spec.ts`
- `src/renderer/src/pages/Services/api.ts`
- `src/renderer/src/pages/Services/hooks/useServices.ts`
- `src/renderer/src/pages/Services/ServicesPage.tsx`
- `src/renderer/src/pages/Services/components/ServicesTable.tsx`
- `src/renderer/src/pages/PriceLists/api.ts`
- `src/renderer/src/pages/Patients/api.ts`
- `src/renderer/src/pages/Employees/api.ts`
- `src/renderer/src/locales/services.en.json`
- `src/renderer/src/locales/services.ar.json`
- `.opencode/plans/services_pagination_plan.md` (copy of this document)
