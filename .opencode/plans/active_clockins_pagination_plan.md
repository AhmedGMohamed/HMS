# Clocking — Server-Side Pagination for Active & History Tabs

Status: **Planned** (commit 3 of 3)
Branch: `react-refactor`
Depends on: commits 1 and 2 (shared pagination helpers and patterns are already
in use, but this commit is self-contained).

## Goal

Both Clocking tabs become server-paginated:

- **Active Clock-Ins** → `GET /api/clock-ins/clocked-in`
- **History** → `GET /api/clock-ins`

Filters (`missingOnly`, employee search, date range), sorting, and paging all
move to SQL. A new stats endpoint replaces the client-side KPI/duplicate/
open-employee derivations so the KPI strip, tab badge, double-clock-in guard,
and duplicate badges stay correct when only one page is loaded.

Page sizes: 10/25/50/100, default 25.

## Cross-page dependency that must not break

`src/renderer/src/pages/Patients/api.ts` `listClockedInStaff()` calls
`/clock-ins/clocked-in` and needs the **complete** open set for staff-status
polling. It must send `all=true` and unwrap `.data`.

`ClockInModal.openEmployeeIds` needs every open employee id (not just the
current page) — supplied by the new stats endpoint.

## API contracts

### 1. `GET /api/clock-ins` (history)

Requires `manage_clocking` (unchanged).

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int | `1` | |
| `pageSize` | int | `25` | |
| `status` | `all` \| `active` \| `closed` | `all` | Clocking page sends `closed` |
| `search` | string | — | `ILIKE '%term%'` on `Employee.name` |
| `from` | `YYYY-MM-DD` | — | `clock_in >= from::date` |
| `to` | `YYYY-MM-DD` | — | `clock_in < (to::date + interval '1 day')` |
| `sort` | `employee` \| `clockIn` \| `clockOut` \| `duration` \| `payDeduction` | `clockIn` | Whitelisted |
| `dir` | `asc` \| `desc` | `desc` | |

Response: `{ data, total, page, pageSize }`, rows in the existing
`EmployeeClockIn` shape (`clock_id`, `employee_id`, `clock_in`, `clock_out`,
`pay_deduction`). No employee-name column is added to the payload — the page
already has `employeeMap`.

### 2. `GET /api/clock-ins/clocked-in` (active)

`verifyToken` + `auditLogger` only (unchanged, Patients uses it).

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int | `1` | |
| `pageSize` | int | `25` | |
| `all` | `true` \| `1` | off | Full active set for Patients |
| `missingOnly` | `true` \| `1` | off | `clock_in < today::date` |
| `today` | `YYYY-MM-DD` | DB `CURRENT_DATE` | Client local date, keeps parity with the old client filter |
| `sort` | `clockIn` \| `duration` \| `employee` | `clockIn` | |
| `dir` | `asc` \| `desc` | `asc` | |

Response: `{ data, total, page, pageSize }`; rows keep
`ec.* + shift_start_time + shift_end_time`.

**Duration sort mapping:** longer shift = older `clock_in`, so
`sort=duration` maps to `ec.clock_in` with the **inverted** direction
(`duration asc` → `clock_in desc`, `duration desc` → `clock_in asc`). The
header icon still reflects the user's `duration` choice.

### 3. NEW `GET /api/clock-ins/clocked-in/stats`

Register immediately after `/clocked-in` and **before** `/:id`.
`verifyToken` + `auditLogger` (same auth as `/clocked-in`).

| Param | Type | Default |
|---|---|---|
| `today` | `YYYY-MM-DD` | DB `CURRENT_DATE` |

Response (snake_case on the wire, camelCased by `lib/api.ts`):

```json
{
  "active_count": 12,
  "missing_count": 2,
  "over12h_count": 1,
  "duplicate_employee_ids": [7],
  "open_employee_ids": [3, 7, 9]
}
```

Semantics:

- `active_count` = rows with `clock_out IS NULL`
- `missing_count` = open rows with `clock_in < today::date`
- `over12h_count` = open rows with `now() - clock_in >= interval '12 hours'`
- `open_employee_ids` = distinct employees with any open row
- `duplicate_employee_ids` = employees with more than one open row

Implementation: one aggregate query + one grouped query.

```sql
-- aggregate
SELECT
  COUNT(*)::int AS active_count,
  COUNT(*) FILTER (WHERE ec.clock_in < COALESCE($1::date, CURRENT_DATE))::int AS missing_count,
  COUNT(*) FILTER (WHERE now() - ec.clock_in >= interval '12 hours')::int AS over12h_count
FROM EmployeeClockIn ec
WHERE ec.clock_out IS NULL;

-- open employees
SELECT employee_id, COUNT(*)::int AS open_count
FROM EmployeeClockIn
WHERE clock_out IS NULL
GROUP BY employee_id;
```

Derive `open_employee_ids` from all grouped rows and
`duplicate_employee_ids` from rows with `open_count > 1` in JS.

## Backend changes

### `src/app/models/EmployeeClockIn.model.ts`

Add option types and return `{ rows, total }`. Keep every existing
single-row/employee method untouched.

```ts
export interface ClockInListOptions {
  offset?: number
  limit?: number
  status?: "all" | "active" | "closed"
  search?: string
  from?: string        // YYYY-MM-DD
  to?: string          // YYYY-MM-DD
  sort?: "employee" | "clockIn" | "clockOut" | "duration" | "payDeduction"
  dir?: "asc" | "desc"
}

static async getAllClockIns(
  options?: ClockInListOptions
): Promise<{ rows: EmployeeClockIn[]; total: number }>
```

- `FROM EmployeeClockIn ec LEFT JOIN Employee e ON e.employee_id = ec.employee_id`.
- Shared WHERE builder used by data + count:
  - `status=active` → `ec.clock_out IS NULL`
  - `status=closed` → `ec.clock_out IS NOT NULL`
  - `search` → `e.name ILIKE $n` (`%term%`)
  - `from` → `ec.clock_in >= $n::date`
  - `to` → `ec.clock_in < ($n::date + interval '1 day')`
- Sort map (fixed SQL, user input never interpolated):
  ```ts
  const SORT_COLUMNS = {
    employee: "e.name",
    clockIn: "ec.clock_in",
    clockOut: "ec.clock_out",
    duration: "COALESCE(ec.clock_out, now()) - ec.clock_in",
    payDeduction: "ec.pay_deduction",
  } as const
  ```
  `ORDER BY ${col} ${DIR} NULLS LAST, ec.clock_id DESC`.
- `LIMIT $n OFFSET $n+1` only when bounded.
- Count: `SELECT COUNT(*)::int AS total FROM EmployeeClockIn ec LEFT JOIN Employee e ... <where>`.

```ts
export interface ClockedInListOptions {
  offset?: number
  limit?: number
  missingOnly?: boolean
  today?: string        // YYYY-MM-DD
  sort?: "clockIn" | "duration" | "employee"
  dir?: "asc" | "desc"
}

static async getClockedInEmployees(
  options?: ClockedInListOptions
): Promise<{ rows: ActiveClockInRow[]; total: number }>
```

- Keep the existing select (`ec.*`, `e.shift_start_time`, `e.shift_end_time`)
  and base filter `ec.clock_in IS NOT NULL AND ec.clock_out IS NULL`.
- `missingOnly` → `ec.clock_in < $n::date` (`today` or `CURRENT_DATE`).
- Sort map:
  ```ts
  clockIn → ec.clock_in
  employee → e.name
  duration → ec.clock_in (direction inverted)
  ```
  Tie-break `ec.clock_id DESC`.

```ts
static async getClockedInStats(today?: string): Promise<{
  activeCount: number
  missingCount: number
  over12hCount: number
  openEmployeeIds: number[]
  duplicateEmployeeIds: number[]
}>
```

### `src/app/controllers/EmployeeClockIn.controller.ts`

- `getAllClockIns(req, res)`: `parsePagination`, sanitize every filter
  (status whitelist, trimmed search, `YYYY-MM-DD` validation, sort whitelist,
  dir default `desc`), call the model, `buildPage`.
- `getClockedInEmployees(req, res)`: same plus `all` handling; default sort
  `clockIn`, dir `asc`.
- `getClockedInStats(req, res)`: validate `today` (regex + real date check),
  return the stats object directly (not an envelope).
- Keep `getClockInsByEmployeeId`, `getEligibleEmployees`, mutations unchanged.

### Routes

Add:

```ts
router.get(
  "/clocked-in/stats",
  verifyToken,
  auditLogger,
  (req, res) => EmployeeClockInController.getClockedInStats(req, res)
);
```

Place it after `/clocked-in` and before `/eligible-employees`/`/:id` so the
literal segment is not captured by `/:id`.

## Frontend changes

### `src/renderer/src/pages/Clocking/api.ts`

```ts
export interface ListClockInsParams {
  page: number
  pageSize: number
  status?: "all" | "active" | "closed"
  search?: string
  from?: string
  to?: string
  sort?: "employee" | "clockIn" | "clockOut" | "duration" | "payDeduction"
  dir?: "asc" | "desc"
}

export function listClockIns(params: ListClockInsParams) {
  return api
    .get<PaginatedResponse<ClockInRow>>("/clock-ins", params)
    .then((page) => ({ ...page, data: page.data.map(normalize) }))
}

export interface ListClockedInParams {
  page: number
  pageSize: number
  missingOnly?: boolean
  today?: string
  sort?: "clockIn" | "duration" | "employee"
  dir?: "asc" | "desc"
}

export function listClockedIn(params: ListClockedInParams) {
  return api
    .get<PaginatedResponse<ClockInRow>>("/clock-ins/clocked-in", params)
    .then((page) => ({ ...page, data: page.data.map(normalize) }))
}

export interface ClockingStats {
  activeCount: number
  missingCount: number
  over12hCount: number
  duplicateEmployeeIds: number[]
  openEmployeeIds: number[]
}

export function listClockedInStats(params?: { today?: string }) {
  return api.get<ClockingStats>("/clock-ins/clocked-in/stats", params)
}
```

Mutation helpers and `listEligibleEmployees` are unchanged.

### `src/renderer/src/pages/Patients/api.ts`

```ts
export function listClockedInStaff() {
  return api
    .get<PaginatedResponse<ClockedInEmployeeRow>>("/clock-ins/clocked-in", {
      all: true,
    })
    .then((res) => res.data)
}
```

### Hooks

**`src/renderer/src/pages/Clocking/hooks/useClockIns.ts`** — history only:

```ts
export interface UseClockInsParams {
  page: number
  pageSize: number
  search: string
  from?: string
  to?: string
  sort: { columnId: string; direction: "asc" | "desc" } | null
}
```

- Debounce `search` internally (`useDebouncedValue(search, { delay: 300 })`).
- Fetch with `status: "closed"` (the page only shows completed rows).
- Return `{ clockIns, total, loading, error, refresh }`.
- Update the docblock (“backend has no filter support” is no longer true).

**New `src/renderer/src/pages/Clocking/hooks/useActiveClockIns.ts`:**

```ts
export interface UseActiveClockInsParams {
  page: number
  pageSize: number
  missingOnly: boolean
  sort: { columnId: string; direction: "asc" | "desc" } | null
  today: string
}
```

Return `{ rows, total, loading, error, refresh }`.

**New `src/renderer/src/pages/Clocking/hooks/useClockingStats.ts`:**

```ts
export function useClockingStats(today: string): {
  activeCount: number
  missingCount: number
  over12hCount: number
  duplicateIds: Set<number>
  openEmployeeIds: Set<number>
  loading: boolean
  error: Error | null
  refresh: () => void
}
```

Converts the two id arrays to `Set<number>` for the tables/modal.

Add a `toLocalDateString(date: Date): string` helper (in `lib/utils.ts` if no
equivalent exists) returning `YYYY-MM-DD` from **local** components
(`getFullYear`/`getMonth`/`getDate`) — do not use `toISOString()` (UTC shift).

### `src/renderer/src/pages/Clocking/ClockingPage.tsx`

Remove all full-list derivations:

- `active`, `history`, `missingCount`, `over12hCount`
- `activeRows`, `historyRows`, `pagedHistory`
- `toSortable`, `startOfDay` import
- imports of `countMissingClockOut`, `countOver12h`,
  `duplicateActiveEmployeeIds`, `isMissingClockOut`
- `openEmployeeIds` memo

Keep the 1s `now` tick (LiveDuration + anomaly badges) and
`useClockingEmployees()` (full employee map + picker).

State:

```ts
const [activePage, setActivePage] = useState(1)
const [activePageSize, setActivePageSize] = useState(25)
// existing: missingOnly, activeSort (clockIn asc)
// existing: historyPage, historyPageSize, historySearch, historyRange,
//           historySort (clockIn desc)
const today = toLocalDateString(now)
```

Hooks:

```ts
const history = useClockIns({
  page: historyPage, pageSize: historyPageSize, search: historySearch,
  from: historyRange.from, to: historyRange.to, sort: historySort,
})
const active = useActiveClockIns({
  page: activePage, pageSize: activePageSize, missingOnly,
  sort: activeSort, today,
})
const stats = useClockingStats(today)
```

Reset pages **in the handlers** (remove the old history reset effect):

- search change → `setHistorySearch(v); setHistoryPage(1)`
- range change → set range + `setHistoryPage(1)`
- sort toggle → set sort + page 1
- page size → set size + page 1
- `missingOnly` toggle → set flag + `setActivePage(1)`
- active sort toggle → set sort + `setActivePage(1)`

Clamp effects for both tabs, same pattern as the other pages:

```ts
if (!loading && total > 0 && rows.length === 0 && page > 1)
  setPage(Math.max(1, Math.ceil(total / pageSize)))
```

Refresh after every mutation (create/edit/delete/quick clock-out):

```ts
const refreshAll = () => {
  history.refresh()
  active.refresh()
  stats.refresh()
}
```

Wire:

- `ClockingKpiStrip` ← `stats.activeCount`, `stats.missingCount`,
  `stats.over12hCount`, `loading={stats.loading}`
- `ClockingTabs activeCount={stats.activeCount}`
- `ActiveClockInsTable` ← `active.rows`,
  `pagination={{ page: activePage, pageSize: activePageSize, total: active.total,
  onPageChange: setActivePage, onPageSizeChange: handleActivePageSize,
  pageSizes: [10, 25, 50, 100] }}`
- `HistoryTable` ← `history.rows`, same pagination shape, search value/handler,
  date-range toolbar, sort state
- `ClockInModal openEmployeeIds={stats.openEmployeeIds}`
- `ActiveClockInsTable duplicateIds={stats.duplicateIds}`

Error handling: replace the two separate list-error effects with one toast so
a network failure does not fire three times:

```ts
useEffect(() => {
  if (history.error || active.error || stats.error) {
    toast.error(t("clocking.messages.loadClockInsError"))
  }
}, [history.error, active.error, stats.error, t])
```

Keep the employee-load error toast separate.

### Components

- `src/renderer/src/pages/Clocking/components/ActiveClockInsTable.tsx`
  - add `pagination?: DataTablePaginationSlot` (import the type from
    `@/components/common/DataTable`) and pass it to `<DataTable>`
  - mark the `employee` column `sortable: true` (backend supports `employee`)
  - update the docblock: the active list is no longer assumed short; the page
    owns paging and the server owns filtering/sorting
  - `rows` is now the current page only
- `src/renderer/src/pages/Clocking/components/HistoryTable.tsx`
  - docblock only: server-paginated now; no behavior change
- `src/renderer/src/pages/Clocking/components/ClockingKpiStrip.tsx`
  - docblock only: metrics come from `/clocked-in/stats`, not a client
    derivation over the full payload
- `src/renderer/src/pages/Clocking/components/anomaly.ts`
  - keep all helpers (still used by `deriveAnomalies`/badges); the page-tier
    count helpers simply become unused here

## i18n

No new keys required. Existing keys cover the tables, filters, empty states,
and load errors (`clocking.messages.noActiveClockIns`, `noHistoryFound`,
`loadClockInsError`, `retry`).

## Tests

New backend specs (there are none today). Follow the structure of
`Service.model.spec.ts` / `Service.controller.spec.ts` and use
`dbHelper.seedEmployeeClockIns(employeeIds)` /
`dbHelper.clearEmployeeClockIns()`.

### `src/app/tests/models/EmployeeClockIn.model.spec.ts`

- history: default order, `limit`/`offset`, `total`
- history `status=closed` / `active`
- history `search` by employee name (join)
- history `from`/`to` date range (inclusive end day)
- history sort `employee`, `clockIn`, `duration`, `payDeduction` both dirs
- active: only open rows; `limit`/`offset`/`total`
- active `missingOnly` with a `today` that separates yesterday's open row
- active sort `duration` inversion (longest first for `desc`)
- active unbounded (`offset`/`limit` undefined) returns all
- stats: counts, `missing_count`, `over12h_count` (seed a row > 12h old),
  `open_employee_ids`, `duplicate_employee_ids` (two open rows for one
  employee)

### `src/app/tests/controllers/EmployeeClockIn.controller.spec.ts`

- history envelope shape
- active envelope shape + `all=true`
- `missingOnly=true`
- stats route response keys/values and `today` validation (invalid value is
  ignored → DB default)

Renderer: no new unit tests required; verify with typecheck/build.

## Verification

```powershell
npx tsc -p src/app/tsconfig.json --noEmit
npx tsc -p src/renderer/tsconfig.json --noEmit
npm run test:renderer
npm run check-i18n
npm run build
```

Manual smoke:

- `/api/clock-ins?page=1&pageSize=10&status=closed&sort=clockIn&dir=desc`
- `...&search=<employee>&from=2026-11-01&to=2026-11-14`
- `/api/clock-ins/clocked-in?page=1&pageSize=10&missingOnly=true&today=2026-11-14`
- `/api/clock-ins/clocked-in?all=true`
- `/api/clock-ins/clocked-in/stats?today=2026-11-14`
- UI: both tabs page independently, KPI numbers match table totals, the
  missing-only chip changes the active total, the tab badge is correct,
  the new-clock-in picker still blocks employees already on shift, duplicate
  badges appear even when the duplicate row is on another page, and Patients
  staff status still shows every clocked-in employee.

## Edge cases

- Date rollover: `today` comes from the ticking local clock, so at midnight
  the active/stats requests refetch with the new day.
- DB timezone: `missingOnly` and `missing_count` both use the client-supplied
  `today`, so they agree regardless of server timezone. `over12h` uses DB
  `now()` (request time), which is fine for a KPI.
- Sort inversion for `duration` is applied to the sort key only; the
  `clock_id DESC` tie-breaker stays stable.
- `search` trims; blank means no filter.
- Out-of-range pages clamp back after deletes.
- `pay_deduction` remains a string on the wire; `normalize` still coerces it.

## Commit

Message: `feat(clocking): server-side pagination for active and history`

Files:

- `src/app/routes/employeeClockIn.routes.ts`
- `src/app/controllers/EmployeeClockIn.controller.ts`
- `src/app/models/EmployeeClockIn.model.ts`
- `src/app/tests/models/EmployeeClockIn.model.spec.ts` (new)
- `src/app/tests/controllers/EmployeeClockIn.controller.spec.ts` (new)
- `src/renderer/src/pages/Clocking/api.ts`
- `src/renderer/src/pages/Clocking/hooks/useClockIns.ts`
- `src/renderer/src/pages/Clocking/hooks/useActiveClockIns.ts` (new)
- `src/renderer/src/pages/Clocking/hooks/useClockingStats.ts` (new)
- `src/renderer/src/pages/Clocking/ClockingPage.tsx`
- `src/renderer/src/pages/Clocking/components/ActiveClockInsTable.tsx`
- `src/renderer/src/pages/Clocking/components/HistoryTable.tsx` (docblock)
- `src/renderer/src/pages/Clocking/components/ClockingKpiStrip.tsx` (docblock)
- `src/renderer/src/pages/Patients/api.ts` (`listClockedInStaff` → `all=true`)
- `src/renderer/src/lib/utils.ts` (`toLocalDateString`, if absent)
- `.opencode/plans/active_clockins_pagination_plan.md` (copy of this document)
