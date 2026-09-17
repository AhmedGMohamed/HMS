# Phase 6.8 Implementation Plan — Clocking Page (React Migration)

**Status:** Research complete · Awaiting user confirmation on open decisions (§1.2) before implementation.
**Scope:** Replace the legacy vanilla Clocking page — `src/app/views/js/employees/clocking.ts` (~19K) + `src/app/views/css/clocking.css`, hosted by `src/app/views/employees/clocking.html` — with a React renderer page under `src/renderer/src/pages/Clocking/`. Legacy files are **not** deleted in this phase (matches 6.4–6.7 practice; removal happens in the legacy-cleanup phase).
**Target stack:** React 19 + Vite 6 + Tailwind v4 + shadcn/ui, react-i18next lazy namespace `clocking`, data layer via `@/lib/api`, forms via RHF + zod, toasts via Sonner.
**Route:** `/clocking` — **already wired**: lazy import + `lazyLoadWithNamespace("clocking")` in `App.tsx`, permission `manage_clocking` registered in `lib/routes.ts:43`, sidebar (`lib/navigation.ts:59-63`) and breadcrumb (`lib/breadcrumbs.ts:36`) entries exist. `ClockingPage.tsx` is currently a `ModulePlaceholder` stub — this phase replaces its content only.
**Reference pages:** `pages/Services/` (closest anatomy precedent), `pages/Employees/` (employee data source).

---

## 1. Architectural Decisions Summary

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | **Two tabs: Active \| History** (legacy parity). Active = open records with live durations; History = completed records with filters. | `clocking.tabs.{active,history}` i18n keys already exist; legacy UX is proven; the Active tab *is* the operational status surface. |
| A2 | **Single fetch, client-side derivation.** `GET /api/clock-ins` once; Active = `!clockOut`, History = `clockOut` truthy. No server-side filters (backend has none; desktop app, modest data volumes). | Legacy parity; backend exposes no query params, no ordering, no pagination. Documented as future backend-companion option. |
| A3 | **Per-page data layer** `pages/Clocking/api.ts` using `api` from `@/lib/api` (auto `/api` prefix, `toCamel`/`toSnake`). | Repo convention (Services, Employees, PriceLists…). |
| A4 | **`payDeduction` normalized at the boundary.** PostgreSQL `DECIMAL` reaches JSON as a **string**; `api.ts` maps rows to `payDeduction: number` (`Number(x ?? 0)`). Types stay wire-shape camelCase. | Prevents `formatCurrency` and sorting bugs ("10" < "9"). |
| A5 | **Employee picker reuses `listEmployees()` from `pages/Employees/api.ts`**, filtered client-side to `needClockIn === true`. Option label `name (employeeType)`; sorted alphabetically by name (legacy had no sort — improvement). | Avoids duplicate types. Permission caveat → open decision **D1**. |
| A6 | **Live durations via one shared 1-second tick** (`useNowTick(1000)` hook driving a `LiveDuration` cell), not per-row `setInterval` maps. Tick stops on unmount. | Fixes legacy interval-leak pattern (legacy never cleared intervals except on rerender). |
| A7 | **Duration formatting** uses existing i18n keys `clocking.duration.hoursMinutes` ("{{hours}}h {{minutes}}m") / `clocking.duration.minutes` ("{{minutes}}m"), floor arithmetic, minutes precision (seconds ignored). Negative durations render as computed (legacy parity). | Exact i18n parity; keys already exist. |
| A8 | **History filters:** employee-name search (DataTable `search` slot, 300ms debounce, case-insensitive substring) + **date range on clock-in date** + Clear. Date range = Popover + `Calendar mode="range"` (Patients `PatientFilters` precedent) — pending **D3**. Applies to `clockIn`; both boundaries inclusive; same-day range supported. | Plan-file calls for a date-range DatePicker filter. |
| A9 | **Sorting:** DataTable controlled sort. History sortable columns: employee name, clock-in, clock-out, duration, pay deduction. Default `clockIn` desc. Active tab keeps fetch order (legacy parity). | design.md §6.2 mandates sortable headers with `aria-sort`. |
| A10 | **Pagination:** client-side via DataTable `pagination` slot — page sizes 10/25/50/100, default 25, bottom-right. Active tab: no pagination (typically few rows). | design.md §6.2; legacy had none (improvement). |
| A11 | **One modal for create/edit** (`ClockInModal`, `Dialog` `sm:max-w-md`), RHF + zod. Fields: employee (Select), clock-in (`datetime-local`, default = now, minute precision), clock-out (optional `datetime-local`), pay deduction (number, `min 0`, `step 0.01`). | design.md §6.3/§6.4; legacy single-modal parity. |
| A12 | **Clearing clock-out works:** edit sends `clockOut: null` explicitly (not omitted) → backend sets `clock_out = NULL` → record returns to Active. **Fixes a legacy bug** (legacy omitted the key, so clearing silently did nothing). | Backend PUT iterates keys that are not `undefined`; `toSnake` preserves `null`. |
| A13 | **Quick clock-out = minimal `PUT {clockOut: now}`** (minute-precision local wall time) after `ConfirmDialog` (variant `warning`, confirm label `clocking.buttons.confirmClockOut`). Deliberately does **not** resend cached `employeeId`/`clockIn`/`payDeduction` (legacy sent stale cached values). Client guard: block clock-out when `clockIn > now` (error toast, `validation.clockOutAfterClockIn`). | Avoids stale-cache overwrites; keeps partial-update semantics. |
| A14 | **Create sends `{employeeId, clockIn, clockOut: value ?? null}` — no `payDeduction`.** The server ignores client deductions on POST and auto-computes from shift lateness (≥6h late → full `basePay`, ≥3h → half, else 0; only when `needClockIn && shiftStartTime`). In create mode the deduction field is hidden and a help note is shown (pending **D2**). Edit sends all fields incl. `payDeduction` (PUT honors it). | Server contract verified in `EmployeeClockIn.controller.ts:60-88`. |
| A15 | **Timezone model (legacy parity):** `datetime-local` values are sent as local wall strings `YYYY-MM-DDTHH:mm` (minute precision); DB columns are naive `TIMESTAMP`; display via `formatDateTime`. Valid because server TZ ≈ user TZ (single-site desktop app). Edit prefill converts ISO → local input value (seconds stripped, legacy parity). | Documented quirk; not fixable client-side without backend TZ work. |
| A16 | **Toasts:** Sonner `richColors`, top-right (RTL-mirrored by app shell). Success = 5s auto-dismiss; load/save/clock-out/delete errors = persistent, message from `ApiError` fallback to i18n error key (Services pattern). Destructive/confirm decisions use `ConfirmDialog`, never toasts. | design.md §6.6. |
| A17 | **Delete:** `ConfirmDialog` variant `danger` + `destructiveIcon`, `AlertDialog`-based (no outside dismiss). Backend `DELETE` returns `204` even for missing rows — treated as success. | design.md §6.4/§6.6. |
| A18 | **Employee name resolution:** `Map<employeeId, Employee>`; missing employee renders `—` (no fake "Unknown" entries; employee load failure shows a retryable error state). | Improves on legacy race that rendered "Unknown". |
| A19 | **Page calls `useEnsureNamespace("clocking")`** on mount. | Convention for lazy namespaces (Services precedent). |
| A20 | **No KPI strip.** The only summary affordance is the Active count badge on the tab trigger (legacy `activeCount` parity). | Legacy has none; plan-file does not require one. |

### 1.1 Backend API Contract (verified, as-used by this page)

| Endpoint | Method | Auth / permission | Request → Response | Notes / quirks |
|----------|--------|-------------------|--------------------|----------------|
| `/api/clock-ins` | GET | `manage_clocking` [gated] | — → `ClockIn[]` raw rows | No params, no ordering, includes records of employees with `need_clock_in = false`. |
| `/api/clock-ins` | POST | `manage_clocking` [gated] | `{employee_id, clock_in, clock_out?}` → `201` raw row | **`pay_deduction` from client is ignored**; server computes from shift lateness. No duplicate-active check, no `clock_out > clock_in` check. Missing employee → `404`. |
| `/api/clock-ins/:id` | PUT | `manage_clocking` [gated] | Partial body → `200` updated row | Honors every key that is not `undefined` (incl. `pay_deduction`); `clock_out: null` clears the clock-out. Empty body → `500 "No fields to update"`. ⚠ No field allowlist (arbitrary-key interpolation — see **D4**). Missing row → `404`. |
| `/api/clock-ins/:id` | DELETE | `manage_clocking` [gated] | — → `204` | `204` even when the row does not exist; invalid id → `400`. |
| `/api/employees` | GET | **`manage_employees`** [gated] | — → `Employee[]` | Picker source (filtered to `needClockIn`). **Permission mismatch:** a user with only `manage_clocking` reaches this page but cannot load the picker → open decision **D1**. |
| `/api/clock-ins/clocked-in` | GET | auth only (no `manage_clocking`) | — → open rows w/ shift times | Used by Patients staff-status, **not** by this page. |

Wire shape of a clock-in row (post-`toCamel`, pre-normalization):

```ts
// DB: clock_id SERIAL PK · employee_id INT → Employee (nullable col, ON DELETE CASCADE)
//     clock_in TIMESTAMP NOT NULL · clock_out TIMESTAMP · pay_deduction DECIMAL(15,2) DEFAULT 0
interface ClockInRow {
  clockId: number
  employeeId: number
  clockIn: string      // JSON Date → ISO string (server-local interpretation)
  clockOut: string | null
  payDeduction: string | number | null // DECIMAL arrives as string from pg
}
// Normalized domain type used by the page:
interface ClockIn {
  clockId: number
  employeeId: number
  clockIn: string
  clockOut: string | null
  payDeduction: number // normalized at the api.ts boundary
}
```

### 1.2 Open Decisions — RESOLVED by user 2026-09-17: **D1a, D2a, D3a, D4a all approved**

| # | Question | Resolution |
|---|----------|------------|
| **D1** | Employee picker permission mismatch (`manage_clocking` ≠ `manage_employees`) | ✅ **(a) APPROVED** — Backend companion: add `GET /api/clock-ins/eligible-employees` (`verifyToken → checkPermission("manage_clocking") → auditLogger`), `SELECT employee_id, name, employee_type, shift_start_time, shift_end_time FROM Employee WHERE need_clock_in = TRUE`, mirrors the 6.6 backend-companion pattern. |
| **D2** | Pay-deduction field in create mode (server ignores it and auto-computes lateness deduction) | ✅ **(a) APPROVED** — Hide in create mode; show help note "auto-calculated from shift lateness" (`help.autoDeduction`, §3.6). Edit mode keeps the editable field. |
| **D3** | History date-range control | ✅ **(a) APPROVED** — Popover + `Calendar mode="range"` (Patients precedent; design.md §6.4 Popover hosts Calendar). |
| **D4** | Backend hardening: PUT interpolates arbitrary body keys into SQL (no allowlist) | ✅ **(a) APPROVED** — allowlist `employee_id, clock_in, clock_out, pay_deduction` in `update` (companion step 4.1). Ordering/duplicate guards deferred as noted. |

### 1.3 UX Research Amendments (2026-09-17) — healthcare UX report adopted

Full report: `phase_6.8_ux_research.md` (authoritative UX spec; component specs §A–§B, plan changes §C, deferred items §D). Decisions adopted (user directive: "good UI fit for healthcare standards"; all client-side, zero new endpoints):

| # | Amendment |
|---|-----------|
| **A20 — REVERSED** | 3-card `ClockingKpiStrip` (On shift now / Missing clock-out / Shifts over 12h), reusing `EditorialKpiCard` + click-to-filter (Supplies pattern). Missing clock-out = `startOfDay(clockIn) < startOfDay(now)`; over-12h card read-only. `EditorialKpiCard` gains additive `danger` tone + `text-left`→`text-start` fix. |
| **A2 — AMEND** | Active tab toolbar gains `missingOnly` toggle chip (visible only when count > 0, `aria-pressed`). |
| **A9 — AMEND** | Active default sort `clockIn` **asc** (longest-on-shift first); clockIn + duration sortable. History default `clockIn` desc unchanged. |
| **A11 — AMEND** | Modal adds edit-mode `DialogDescription` (payroll consequence), `help.editingRecord` ("Record #id"), `help.recordedLocalTime` line, non-blocking duplicate-open warning in create mode. |
| **A13/A17 — AMEND (copy)** | Clock-out confirm mentions payroll finalization; delete confirm gets payroll-consequence copy + conditional active-row text + scoped `confirmLabel` (`buttons.confirmDelete`). |
| **A18 — AMEND (D1a)** | `eligible-employees` returns **all** employees (adds `need_clock_in`, `is_active` columns, no WHERE); picker filters client-side (`needClockIn && isActive`), name map uses full list (records for `needClockIn=false` employees would otherwise render `—` permanently). |
| Anomaly system | `components/anomaly.ts` pure derivation (missingClockOut, extendedShift ≥8h, fatigueRisk ≥12h, futureClockIn, negativeDuration, duplicateActive) drives KPI cards, filter chip, row badges (icon+text, label stays `text-foreground`), and modal warning. Missing-clock-out escalation: warning >24h, danger ≥72h. Pay deduction `0 → "—"`, muted, always visible. Live dot `bg-success-dark` + `animate-pulse`; no aria-live on ticking cells; sr-only `caption` per table; `EmployeeCell` initials disc. |

---

## 2. Directory & File Structure

```text
src/renderer/src/pages/Clocking/
├── ClockingPage.tsx                  # replaces ModulePlaceholder stub (existing file, rewritten)
├── api.ts                            # list/create/update/delete + row normalization
├── types/
│   └── clocking.ts                   # ClockInRow, ClockIn, ClockInFormValues, filter types
├── schemas/
│   └── clocking.schema.ts            # clockInFormSchema (zod)
├── hooks/
│   ├── useClockIns.ts                # fetch + refresh + derived active/history lists
│   ├── useClockingEmployees.ts       # employee picker data (D1a or D1b source)
│   └── useNowTick.ts                 # shared 1s Date tick for live durations
├── components/
│   ├── ClockingTabs.tsx              # Active | History tab triggers (w/ Active count badge)
│   ├── ActiveClockInsTable.tsx       # Active tab table + row actions
│   ├── HistoryTable.tsx              # History tab table (sortable, paginated)
│   ├── HistoryFilters.tsx            # search + date-range + clear (DataTable toolbar slot)
│   ├── LiveDuration.tsx              # ticking duration cell for active rows
│   └── duration.ts                   # computeDurationParts() + format via i18n
└── modals/
    └── ClockInModal.tsx              # create/edit dialog (RHF + zod)
```

Existing infrastructure touched: **none** besides `ClockingPage.tsx` (route, guard, nav, breadcrumb, locale loader already registered) and `clocking.en.json` / `clocking.ar.json` (new keys in §3.6). If **D1a/D4a** approved, additionally `src/app/routes/employeeClockIn.routes.ts` + `src/app/models/EmployeeClockIn.model.ts`.

---

## 3. Detailed Component & Module Specs

### 3.1 Types (`types/clocking.ts`)

```ts
import type { Employee } from "@/pages/Employees/types/employee"

/** Raw wire shape after toCamel — payDeduction not yet normalized. */
export interface ClockInRow {
  clockId: number
  employeeId: number
  clockIn: string
  clockOut: string | null
  payDeduction: string | number | null
}

/** Normalized domain model used by all page code. */
export interface ClockIn {
  clockId: number
  employeeId: number
  clockIn: string
  clockOut: string | null
  payDeduction: number
}

/** Payload for POST /clock-ins (server computes payDeduction). */
export interface CreateClockInPayload {
  employeeId: number
  clockIn: string            // "YYYY-MM-DDTHH:mm" local wall time, minute precision
  clockOut: string | null
}

/** Payload for PUT /clock-ins/:id. `clockOut: null` re-activates the record. */
export interface UpdateClockInPayload {
  employeeId: number
  clockIn: string
  clockOut: string | null
  payDeduction: number
}

export type ClockingTab = "active" | "history"

export interface HistoryFilters {
  search: string
  range: { from?: Date; to?: Date } // D3a
}
```

Employee picker type (D1a): `{ employeeId: number; name: string; employeeType: string; shiftStartTime?: string | null; shiftEndTime?: string | null }` — or reuse `Employee` from Employees module (D1b).

### 3.2 API module (`api.ts`)

```ts
import { api } from "@/lib/api"
import type { ClockIn, ClockInRow, CreateClockInPayload, UpdateClockInPayload } from "./types/clocking"

function normalize(row: ClockInRow): ClockIn {
  return { ...row, payDeduction: Number(row.payDeduction ?? 0) }
}

export function listClockIns() {
  return api.get<ClockInRow[]>("/clock-ins").then((rows) => rows.map(normalize))
}
export function createClockIn(body: CreateClockInPayload) {
  return api.post<ClockInRow>("/clock-ins", body).then(normalize)
}
export function updateClockIn(id: number, body: UpdateClockInPayload) {
  return api.put<ClockInRow>(`/clock-ins/${id}`, body).then(normalize)
}
export function deleteClockIn(id: number) {
  return api.delete<void>(`/clock-ins/${id}`)
}
// D1a only:
export function listEligibleEmployees() {
  return api.get<EligibleEmployee[]>("/clock-ins/eligible-employees")
}
```

Datetime rules: payloads carry local wall strings `"YYYY-MM-DDTHH:mm"` (A15). Helper `toLocalInputValue(iso: string | null): string` converts stored values for `datetime-local` prefill; `nowLocalInputValue(): string` for create default / quick clock-out (minute precision).

### 3.3 Zod schema (`schemas/clocking.schema.ts`)

```ts
import { z } from "zod"

export const clockInFormSchema = z
  .object({
    employeeId: z.coerce.number().int().positive(),          // messages: validation.employeeRequired
    clockInTime: z.string().min(1),                          // validation.clockInTimeRequired
    clockOutTime: z.string().optional().nullable(),          // optional
    payDeduction: z.coerce.number().min(0),                  // step 0.01 enforced by input
  })
  .refine(
    (v) => !v.clockOutTime || new Date(v.clockOutTime) > new Date(v.clockInTime),
    { path: ["clockOutTime"], message: "clockOutAfterClockIn" } // equality invalid (legacy parity)
  )

export type ClockInFormValues = z.infer<typeof clockInFormSchema>
```

Validation messages resolved via `t("clocking.validation.*")` in the modal (schema carries keys, modal maps to translations — same approach as Services).

### 3.4 Hooks

- **`useClockIns()`** — `{ clockIns, loading, error, refresh }`; fetch on mount; derived via `useMemo` in the page: `active = clockIns.filter(c => !c.clockOut)`, `history = clockIns.filter(c => c.clockOut)`; employee map lookup via `useClockingEmployees` data.
- **`useClockingEmployees()`** (D1a) — `{ employees, loading, error, refresh }` from `listEligibleEmployees()`; (D1b) wraps `listEmployees()` + filter `needClockIn`, sorted by `name` (`localeCompare`).
- **`useNowTick(intervalMs = 1000)`** — returns `Date` that updates every second while mounted (single interval; no per-row timers).

### 3.5 Components

**`ClockingPage.tsx`** — composition root (Services pattern):
`useEnsureNamespace("clocking")` → `PageHeader` (title `clocking.title`, subtitle `clocking.subtitle`, eyebrow, `actions` = "New Clock-In" button) → `ClockingTabs` (tab state; Active trigger shows count badge) → tab panels: `ActiveClockInsTable` | `HistoryTable`. Owns modal state (`create | edit(clockIn) | null`), ConfirmDialog states (clock-out / delete), and mutation handlers calling `refresh()` after success. Errors from load → persistent toast + retry `EmptyState` action.

**`ActiveClockInsTable`** — `DataTable<ClockIn>`: columns Employee (name or `—`), Clock-In (`formatDateTime`), Duration (`LiveDuration`), Actions (hover-reveal icon buttons per design §6.2: Clock Out, Edit, Delete). `getRowId = clockId`. `emptyTitle = messages.noActiveClockIns`. `loading` → skeleton rows. No pagination/search.

**`LiveDuration`** — consumes `useNowTick()`; computes floor hours/minutes from `clockIn` → now; renders `t("clocking.duration.hoursMinutes", { hours, minutes })` or `t("clocking.duration.minutes", { minutes })`; `tabular-nums`. Memo-safe (recomputes only when the tick crosses a minute for that row).

**`HistoryTable`** — `DataTable<ClockIn>` with `toolbar = <HistoryFilters/>`: columns Employee, Clock-In, Clock-Out, Duration (static), Pay Deduction (`formatCurrency`, `numeric: true`), Actions (Edit, Delete). Controlled sort (default `clockIn` desc); client pagination (10/25/50/100, default 25); `emptyTitle = messages.noHistoryFound`; filters applied to `clockIn` date, inclusive boundaries, same-day supported.

**`HistoryFilters`** — search input (DataTable `search` slot semantics, 300ms debounce) + (D3a) Popover → `Calendar mode="range"` showing selected range, plus Clear button. Labels: `filters.searchEmployee` (existing), `filters.fromDate`/`filters.toDate` (new, §3.6) or `common.from/to` if present.

**`ClockInModal`** — `Dialog sm:max-w-md`, RHF (`useForm<ClockInFormValues>` + `zodResolver`):
- Employee: shadcn `Select`, options `name (employeeType)`, required; loading/disabled state while picker loads.
- Clock-In Time: `<Input type="datetime-local">` (EmployeeModal/DischargeDialog precedent), default now (minute precision).
- Clock-Out Time: optional `datetime-local`, help text `help.optionalClockOut`; clearable → submits `null` (A12).
- Pay Deduction: `<Input type="number" min=0 step=0.01>`, currency prefix (`common.currency`), help `help.payDeduction`. **Create mode (D2a): field hidden, replaced by muted note `help.autoDeduction`.**
- Submit button: `Loader2 animate-spin` while saving (design §6.3); zod errors inline via `FormMessage`; `ApiError` message surfaces as persistent toast, modal stays open.
- On success: `toast.success(messages.createSuccess | updateSuccess)`, close, `refresh()`.

**Clock-out / delete confirms** — shared `ConfirmDialog`: clock-out = `variant="warning"`, title `messages.clockOutConfirmTitle`, text `messages.clockOutConfirmText`, confirm `buttons.confirmClockOut`; delete = `variant="danger"` + `destructiveIcon`, title `messages.deleteConfirmTitle`, text `messages.deleteConfirmText`. Success toasts: `messages.clockOutSuccess` / `deleteSuccess`; failure: persistent `clockOutError` / `deleteError` (ApiError fallback).

### 3.6 New translation keys

Existing `clocking.*` namespace covers the full legacy surface (verified 1:1 against legacy usage — zero missing, zero unused). **New keys to add** (EN + AR):

| Key | EN | AR |
|-----|----|----|
| `clocking.filters.fromDate` | `From` | `من` |
| `clocking.filters.toDate` | `To` | `إلى` |
| `clocking.messages.retry` | `Retry` | `إعادة المحاولة` |
| `clocking.help.autoDeduction` *(only if D2a)* | `Pay deduction is calculated automatically at clock-in based on shift lateness.` | `يُحتسب خصم الأجر تلقائيًا عند تسجيل الحضور بناءً على تأخر المواعيد.` |

Reuse from `common` (verify presence during implementation; fall back to clocking-scoped keys if `check-i18n:renderer` flags them): `common.edit`, `common.delete`, `common.cancel`, `common.yes`, `common.from`, `common.to`, `common.clear`, `common.currency`.

### 3.7 Behavior & edge-case matrix

| Case | Behavior |
|------|----------|
| Overnight shifts | Timestamp math handles clock-out on the next day; duration positive. |
| Clock-out ≤ clock-in (edit) | Blocked by zod refine (equality invalid). |
| Quick clock-out on future-dated clock-in | Blocked client-side (error toast `validation.clockOutAfterClockIn`); legacy allowed negative durations. |
| Negative durations in existing data | Rendered as computed (legacy parity); no clamp. |
| Clearing clock-out on a completed record | `clockOut: null` sent → record returns to Active (legacy bug fixed, A12). |
| Edit prefill | ISO → local `YYYY-MM-DDTHH:mm`; seconds stripped (legacy parity). |
| Duplicate active records | Allowed (no backend constraint); no client prevention (parity). |
| Employee missing from picker data | Row shows `—`; picker error → retryable EmptyState (no "Unknown" strings). |
| `DELETE` on already-deleted row | `204` → treated as success. |
| Load failures | Persistent toast + EmptyState with Retry (`messages.loadClockInsError` / `loadEmployeesError`, `messages.retry`). |
| Mutation + refetch failure | Mutation toast still shows success; list refresh error toasts separately. |
| Tab switch / locale change | Filters persist; no refetch on tab switch; rerender via i18n. |
| Interval hygiene | Single tick interval, cleared on unmount (legacy leak fixed). |
| RTL | Logical utilities only (`ms-/me-`, `text-start/end`); actions column end-aligned; Sonner mirrored by shell. |
| Reduced motion | Row-stagger (≤10 rows, 50ms) and 150ms fades per design §10; global neutralizer applies. |

---

## 4. Phased Implementation Steps

| Step | Work | Files |
|------|------|-------|
| **4.1** *(optional, D1a/D4a)* | Backend companion: `GET /api/clock-ins/eligible-employees` route + model query; PUT field allowlist (`employee_id, clock_in, clock_out, pay_deduction`). | `src/app/routes/employeeClockIn.routes.ts`, `src/app/models/EmployeeClockIn.model.ts` |
| **4.2** | Types, `api.ts` (incl. normalization + datetime helpers), zod schema. | `types/clocking.ts`, `api.ts`, `schemas/clocking.schema.ts` |
| **4.3** | Hooks (`useClockIns`, `useClockingEmployees`, `useNowTick`) + page shell replacing stub (header, tabs, wiring, `useEnsureNamespace`). | `hooks/*`, `ClockingPage.tsx`, `components/ClockingTabs.tsx` |
| **4.4** | Active tab: table, `LiveDuration`, row actions, clock-out/delete ConfirmDialogs. | `components/ActiveClockInsTable.tsx`, `LiveDuration.tsx`, `duration.ts` |
| **4.5** | History tab: filters (search + date range + clear), sortable paginated table. | `components/HistoryTable.tsx`, `HistoryFilters.tsx` |
| **4.6** | `ClockInModal` (create/edit) + mutation handlers + toasts. | `modals/ClockInModal.tsx` |
| **4.7** | i18n keys (§3.6), a11y pass (aria-sort, labels, focus), RTL pass, stagger/fade polish. | `locales/clocking.{en,ar}.json`, components |
| **4.8** | Verification (§5) + manual matrix; fix findings. | — |

---

## 5. Verification Plan

### 5.1 Automated checks

```bash
npm run lint                    # ESLint clean
npx tsc -p tsconfig.app.json    # strict type-check, no emit
npm run check-i18n:renderer     # renderer namespace audit (new keys + usage)
npm run build                   # electron compile + asset copy
```

### 5.2 Manual testing matrix

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Open `/clocking` as user with `manage_clocking` | Page renders; skeletons during load; Active count badge correct. |
| 2 | Open `/clocking` without `manage_clocking` | Blocked by `PermissionRoute`. |
| 3 | Active tab | Only open records; duration ticks every second; format `Xh Ym` / `Ym`; `tabular-nums`. |
| 4 | Clock Out (confirm → cancel → confirm) | Cancel closes with no change; confirm sends `PUT {clockOut: now}`; row moves to History; success toast. |
| 5 | Quick clock-out with future-dated clock-in | Blocked with `validation.clockOutAfterClockIn` toast. |
| 6 | New Clock-In (D2a) | Deduction field hidden w/ auto note; save → 201 → list refreshes; success toast. |
| 7 | Create with missing employee / empty clock-in | Inline zod errors (`employeeRequired`, `clockInTimeRequired`). |
| 8 | Edit prefill | Employee, times (minute precision), deduction prefilled; title "Edit Clock-In". |
| 9 | Edit: clear clock-out on completed record | Record returns to Active tab (regression test for legacy bug). |
| 10 | Edit: clock-out ≤ clock-in | Inline `clockOutAfterClockIn` error; save blocked. |
| 11 | Delete (confirm) | Row removed from both tabs; success toast; `204`. |
| 12 | History search | Case-insensitive substring on employee name, 300ms debounce; empty → `noHistoryFound`. |
| 13 | History date range | Inclusive boundaries; same-day range works; Clear resets search+range; reversed range → empty (no crash). |
| 14 | Sorting | Click each sortable header → `aria-sort` toggles asc/desc; default clock-in desc. |
| 15 | Pagination | Page sizes 10/25/50/100; controls bottom-right; state resets on filter change. |
| 16 | Load failures (network) | Persistent error toast + Retry EmptyState action for both clock-ins and employees. |
| 17 | RTL (ar) | Layout mirrored; actions end-aligned; badges/toasts mirrored; duration "X ساعة Y دقيقة". |
| 18 | Keyboard & a11y | Dialog focus trap; Esc closes form modal (not AlertDialog confirms); labels tied to inputs; sortable headers keyboard-operable. |
| 19 | Reduced motion | Stagger/fade disabled under `prefers-reduced-motion`. |
| 20 | md width (≤768px) | Tables scroll horizontally; no layout break. |
| 21 | (D1a) Login as `manage_clocking`-only user | Employee picker loads via new endpoint. |
| 22 | Legacy regression spot-check | Legacy `/clocking` page still functional until cleanup phase. |
