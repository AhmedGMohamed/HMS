# Phase 6.11 — Reports & Analytics · Implementation Record

**Status:** 6.11.0 complete and verified · **6.11.1 (patient report) complete and verified, including the follow-up that makes both exports carry every admission (§8.5)** · 6.11.2–6.11.7 not started
**Scope:** Replace the React Reports placeholder with the full six-tab module **and** add a purpose-built `/api/reports/*` backend. The legacy `/reports` HTML page and `/api/reports/*` endpoints remain untouched until Phase 7.
**Companion docs:** `C:\Users\gamal\.opencode\plan\phase_6.11_plan.md` (the approved plan: decisions, defect ledger, per-endpoint contracts, subphase breakdown, "as built" appendix), `react_implementation_plan.md` §6.11 (superseded), `design.md`, `phase_6.10_implementation.md` (report/PDF precedent).

> **If you are picking this phase up later:** read §3 (contracts) and §8 (continue here) first. Everything in §3 is load-bearing — later subphases must not invent parallel conventions.

---

## 1. What 6.11.0 shipped

The goal of the subphase was: a working `/reports` shell with URL state, tabs, filters, permission gates and not-generated states, plus every shared primitive the five remaining tabs need — with `/api/reports/options` live.

### 1.1 Backend (new, additive)

| File | Role |
|---|---|
| `src/app/utils/billFinancials.ts` | Pure bill math: `calculateBillFinancials`, `normalizeScope`, `toMoneyNumber`, `roundMoney`, `BILL_CATEGORIES`. Ported verbatim from the old inline algorithm. |
| `src/app/models/Bill.model.ts` | `recalculateTotal` now fetches config + the three category subtotals in **one** query and delegates to the helper. Passes the **unrounded** total so `DECIMAL(15,2)` remains the rounder (identical behaviour to before). |
| `src/app/models/reports/shared.ts` | Validation + SQL-safety helpers (details in §3.2). |
| `src/app/models/reports/OptionsReport.model.ts` | All five picker lists; payroll list skipped entirely without `manage_employees`. |
| `src/app/controllers/Reports.controller.ts` | `getOptions`, `sendError`, `NotFoundError`, `userHasPermission`, `userHasAllPermissions`. |
| `src/app/routes/reports.routes.ts` | Mounted at `/api/reports` **before** the legacy `/api/reports` router in `api.routes.ts`. |
| `src/app/utils/types/reports.d.ts` | Wire contracts for all six reports (options + patient + doctor + nurse + statistics + payroll + clock-in). Later subphases consume these types; only `*-options` are implemented so far. |
| `src/app/models/database/migrations/003_reports_indexes.sql` | Additive indexes, mirrored in `setUpDatabase.ts`: `EmployeePayment(employee_id, issued_timestamp) WHERE is_void = false`, `EmployeeClockIn(employee_id, clock_in)`, partial `pay_deduction > 0`, `Employee(need_clock_in, is_active)`. |

Tests: `billFinancials.spec.ts` (21 pure cases), `Reports.options.spec.ts` (options + `Bill.model` parity), `Reports.controller.spec.ts` (envelope, payroll filtering, admin bypass, 500 path, permission helpers).

### 1.2 Frontend

```
src/renderer/src/pages/Reports/
├── ReportsPage.tsx                  # composition root (page chrome, tabs, gates)
├── api.ts                           # getReportOptions() — list/detail/export fetchers per subphase
├── types/reports.ts                 # tabs, enums, draft, paging, KPI, session types
├── state/
│   ├── reportParams.ts              # pure URL contract + validation + doctor picker filter
│   ├── tabMeta.ts                   # per-tab label/description keys + usesGrouping
│   ├── useReportUrlState.ts         # draft vs generated, generate/setTab, stale
│   └── useReportSession.ts          # in-memory per-tab cache (keyed by params)
├── hooks/useReportOptions.ts        # one fetch for every picker
└── components/
    ├── ReportsTabs.tsx              # 6 tabs, payroll hidden without permission
    ├── ReportShell.tsx              # heading + Generate + exports + stale banner + footer
    ├── ReportState.tsx              # not-generated | loading | error | empty
    ├── ReportKpiStrip.tsx           # EditorialKpiCard grid
    ├── DateRangeField.tsx           # calendar range + presets (+ LTR-isolated dates)
    ├── GroupByField.tsx             # day/month/year, only where consumed
    ├── StatusBadges.tsx             # payment/gender/doctor/employee/attendance
    └── TabPlaceholder.tsx           # TRANSITIONAL — delete after 6.11.6
```

Shared primitives added (used by the remaining tabs):

| File | Purpose |
|---|---|
| `components/charts/MultiLineChart.tsx` | N-series line chart |
| `components/charts/GroupedBarChart.tsx` | vertical/horizontal, grouped or stacked |
| `components/charts/DualAxisComposedChart.tsx` | bars on left axis + line on right |
| `components/charts/DistributionDonutChart.tsx` | donut with optional `n (x%)` tooltip |
| `components/charts/ChartShell.tsx` | `ChartSrTable`, `ChartEmpty`, `CHART_DIRECTION` |
| `components/charts/ChartSnapshotSurface.tsx` | hidden English 900×420 render for PDF capture |
| `components/charts/chartPalette.ts` | `CHART_PALETTE`, `seriesColor(i)`, `ChartSeries` |
| `components/charts/chartFormat.ts` | `createChartFormatter(kind, locale)` → `{ axis, full }` |
| `lib/chartSnapshot.ts` | `captureElementAsPng`, `captureChartSnapshots` (html-to-image) |
| `lib/csv.ts` | `toCsv`, `toSectionedCsv`, `downloadCsv`, `toFileNameDate`, `escapeCsvCell` |
| `lib/dateRange.ts` | local-date presets, `toDateParam`, `fromDateParam`, `isValidRange` |
| `lib/pdf/pdfTheme.ts` | PDF palette/table factories (promoted from Insurance 6.10) |
| `lib/pdf/format.ts` | `formatEnGbDate/DateTime/Time`, `formatMoneyEn`, `formatCurrencyEn`, `formatNumberEn` |

`lib/pdfShell.ts` gained `pageOrientation` and `pageMargins` (header/footer follow the margins). Defaults are unchanged, so Vault/Insurance output is byte-identical.

**Re-export shims** (kept so existing imports did not churn): `pages/Vault/print/toCsv.ts`, `pages/Vault/dateRange.ts`, `pages/Insurance/print/pdfTheme.ts`, `pages/Insurance/report/format.ts`. New code should import from `lib/`.

**Dependency added:** `html-to-image@^1.11.13` (only used by `lib/chartSnapshot.ts`, which is tree-shaken until a tab imports it).

**Deleted:** `pages/Reports/types/ReportsPlaceholder.tsx`.

### 1.3 i18n

`reports.en.json` / `reports.ar.json` grew from 252 to 332 keys each, in parity. Added: `reports.page.*` (eyebrow/subtitle/descriptions), `reports.actions.*`, `reports.state.*`, `reports.enums.*` (admissionStatus, doctorType, employeeType, relationship, attendance, scope), `reports.filters.dateRange|quick.*|<field labels>`, extra `reports.validation.*`, `reports.messages.optionsError`.

No cross-namespace keys are used (lazy namespaces must stay independent). Enum lookups are dynamic (`reports.enums.doctorType.${value}`), so `check-i18n` reports them as "potentially unused" — that is expected and not a defect.

---

## 2. Infrastructure repairs that were required first

**The test database could not be created at all**, so no DB-backed test could run before this subphase.

### 2.1 `src/app/tests/helpers/db.helper.ts`

Four fatal DDL bugs, all fixed:
1. `CREATE TABLE VaultManualPayment (...)` was missing its terminating `;`.
2. `RETURNS TIMESTAMP AS $ $ BEGIN` → a broken dollar-quote (should be `$$`).
3. `InsuranceCompany` referenced `PriceList` before it was created (forward FK). An idempotent early `CREATE TABLE IF NOT EXISTS PriceList` was added.
4. `ServicePrice` declared **two** primary keys.

Seed data that no longer matched the real schema, fixed:
- `seedDrugShipments` now supplies `buy_quantity` (NOT NULL in the real schema).
- `seedBillDetails` now supplies `active_service_id` for service lines (the real `billdetail_check` demands it) and takes `activeServiceIds`.
- Time literals were double-quoted identifiers (`"08:00:00"`); now single-quoted strings.
- `seedMedicalSupplyTransactions` used `$1,$2,$4` with four params (parameter `$3` was never referenced → parse error); now `$1,$2,$3`.

Bootstrap change: `createDBIfNotExists` now calls the **application's** `initDB` (`setUpDatabase.ts`, newly exported) instead of the stale local copy. The local `initDB` is still present but unused — do not extend it.

New helper for existing test databases:
```ts
await dbHelper.ensureReportsSchema(); // beforeAll in every Reports spec
```
It idempotently adds `Bill.discount_scope` / `Bill.vat_scope_custom` and the four report indexes. `HMS_test` may predate them.

`clearDatabase()` ordering fixed: `PriceList` is referenced by `Patient`, `PatientHistory`, `InsuranceCompany`, `ServicePrice`, `ShipmentPrice`, `MedicalSupplyShipmentPrice`, so it is now cleared **last**. Added `clearMedicalSupplyShipmentPrices()` and `clearDailyStaffAssignments()`.

### 2.2 `src/app/utils/setUpDatabase.ts`

A fresh install could not build its schema either — both fixed:
- `get_default_pricelist_id()` was declared before `PriceList`. An SQL-language function body is validated at creation time, so this failed with `relation "pricelist" does not exist`. Moved after the table.
- `ActivePatientService` referenced `PatientHistory` before it existed. Moved after `PatientHistory`.
- `Bill` now declares `discount_scope` / `vat_scope_custom` as an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (the columns previously only existed in `migrations/add_bill_scope_columns.sql`, so a fresh install's `recalculateTotal` would have failed).
- Reports indexes added to the index block.

### 2.3 Rebuilding `HMS_test` from scratch

If the test DB is ever corrupted or predates the schema:

```powershell
# 1. compile the app
npx tsc --project ./src/app/tsconfig.json

# 2. drop + recreate from template0 (template1 in this cluster is polluted: pg_operator was empty)
#    then run setUpDatabase.initDB() — see the script pattern in §7.2
```

---

## 3. Contracts later subphases MUST follow

### 3.1 Wire format

- **Query params:** snake_case (`start_date`, `end_date`, `page_size`, `payment_type`, …).
- **Response keys:** snake_case. `lib/api.ts` camelCases once at the boundary — never hand-map.
- **Money:** every `NUMERIC` is coerced to a finite `number` server-side (`toMoneyNumber`). Never let a string reach the client.
- **Envelopes:**
  - list: `{ summary, data, total, page, page_size }`
  - detail: `{ summary, data, … }` (per-report shape in `reports.d.ts`)
  - export: `{ generated_at, range: { start_date, end_date }, summary, data }`
- **Errors:** `400 { error }` (validation), `403 { error: "Insufficient permissions" }`, `404`, `500`. Use `sendError(res, error, context)` from `Reports.controller.ts` — it maps `ReportValidationError`→400, `NotFoundError`→404, logs and returns a generic 500.

### 3.2 Validation & SQL safety (`models/reports/shared.ts`)

```ts
parseDateRange(query)          // { startDate, endDate }, 400 on bad/inverted
parseDateOnly(value, field)    // strict YYYY-MM-DD + real-calendar check
parsePaging(query)             // page ≥ 1; page_size ∈ {10,25,50,100} else 400
parseSort(query, allowed, def) // { column, direction, sql } — whitelisted fragments only
parseSearch(query)             // trimmed, ≤ 255, null when empty
likePattern(term)              // `%term%` for ILIKE $n
parseEnumParam(value, allowed, field, fallback)
parseOptionalId / parseRequiredId
readWindowTotal(rows) / stripWindowTotal(rows)   // COUNT(*) OVER() AS total_count
numericKeys / numericKeysInRows / safeDivide / roundTo
timeToMinutes / hoursBetween
toDateOnlyString / todayDateOnly / enumerateDates / maxDate / minDate
```

**Date semantics (non-negotiable):** timestamps filter with
```sql
col >= $n::date AND col < ($n+1::date + INTERVAL '1 day')
```
Never `BETWEEN` on a timestamp — that is the legacy end-day bug. Pure `DATE` columns use inclusive `BETWEEN`. Every model spec must assert end-date inclusion.

### 3.3 Permissions

| Surface | Requirement |
|---|---|
| Page `/reports` | `view_reports` (route already) |
| All reports read routes | `view_reports` |
| Patient/doctor/nurse/statistics/clock-in exports | + `manage_reports` |
| Payroll tab + all payroll routes | + `manage_employees` (server `checkPermissions([...])`) |
| Payroll export | `view_reports` + `manage_employees` + `manage_reports` |

Client mirrors this with `usePermission().hasPermission`. The payroll **tab is hidden** without `manage_employees`, and a direct `?tab=payments` renders `ReportState kind="error"` with the permission copy instead of firing a request.

### 3.4 Frontend state

`useReportUrlState()` returns:

```ts
{
  tab: ReportTab, draft: ReportDraft, generated: ReportDraft | null,
  generatedKey: string | null, isGenerated: boolean, isStale: boolean,
  setDraft(patch), replaceDraft(next), setTab(tab), generate(), clearGenerated()
}
```

Rules:
- The **draft** is component state; the **generated** params are in the URL (`run=1`). Editing a filter does not touch the URL → `isStale` turns true and `ReportShell` shows the banner.
- `generate()` writes the URL with `replace: true`. `setTab()` keeps the range, resets tab filters, drops `run`.
- URL params: `tab, from, to, group, run` + `payment_type, insurance_id, search, relationship, scope, doctor_id, nurse_id, employee_type, employee_id, dist`.
- Only the active tab's params are serialized (`serializeReportParams`); the same function produces the session-cache key and the staleness token.
- `validateDraft(draft, tab)` returns an i18n key (`reports.validation.*`) or `null`. `ReportsPage` blocks `generate()` while it returns a key.
- `useReportSession()` is an in-memory per-tab cache keyed by `generatedKey`. Switching tabs keeps results; reload clears them.

### 3.5 Chart wrappers

All take `series: ChartSeries[]` (`{ key, label, color?, dashed?, fill? }`), `format: ChartValueFormat` (`currency | number | days | hours | percent`), `locale`, `loading`, `srCaption`, `xHeader`, `emptyTitle/emptyDescription`, `className`, and render an auto-generated `sr-only` table + an `EmptyState` + a skeleton. They mount inside `dir="ltr"` — never reverse an axis for RTL; only labels are localized.

For PDFs: render the chart again inside `ChartSnapshotSurface` with `locale="en-US"` and English labels, tag it with `ChartSnapshotSlot name="…"`, then `captureChartSnapshots(root)` at export time. Capture failure returns `undefined`; the PDF must still print the data table. The surface provides `ChartAnimationContext = false`, so the captured copy is drawn at its final state — do not add per-chart `isAnimationActive` props at call sites (contract 49).

### 3.6 Exports

- English-only labels and `en-GB` dates (`lib/pdf/format`), regardless of UI language.
- PDFs go through `openPdfShellDoc({ title, content }, { t, language: "en" })`; clock-in passes `pageOrientation: "landscape"`.
- CSV uses `lib/csv` (`toCsv` / `toSectionedCsv` + `downloadCsv`), BOM + CRLF, filename `hms-<report>-YYYY-MM-DD_YYYY-MM-DD.csv`.
- Exports fetch the **dedicated export endpoint** with the **generated** params — never the paginated list, never the current form state.

### 3.7 Data-source invariants

- `Bill.total_amount` is the authoritative final total (base + tests − scoped discount + scoped VAT + admin). Use it for list totals; derive the component breakdown for detail display with `calculateBillFinancials` and prefer the stored total if they differ by less than rounding.
- No endpoint may query per row. Patient detail = 3 queries; patient **export** = 5 (rows + summary, then admissions/items/staff over `ANY(ids)`) — see §8.5; doctor list/detail = 2; nurse list/detail = 3; statistics = 7 parallel; payroll list = 3; clock-in list = 2.
- Clock-in missing days are synthesized only from `max(range start, hire date)` to `min(range end, today)`, active employees only. Multiple clock-ins per day stay separate rows.
- Payroll deductions are summed once per employee over the range; payment rows are gross.

---

## 4. Verification (6.11.0)

| Gate | Command | Result |
|---|---|---|
| App types | `npx tsc --project ./src/app/tsconfig.json --noEmit` | No errors in touched files |
| Renderer types | `npx tsc --project src/renderer/tsconfig.json --noEmit` | No errors in touched files |
| Lint | `npx eslint <changed files>` | Clean |
| Backend specs | `npx tsc -p ./src/app/tsconfig.json` then `npx jasmine --filter="Reports"` / `"ReportsController"` | 9/9 and 7/7 |
| Renderer unit | `npx vitest run --config src/renderer/vitest.config.ts` | 26/26 (13 new) |
| Full backend suite | `npm test` | 415 specs, **33 failures — all pre-existing** (§6) |
| Bundle | `npm run build:renderer` | OK, `ReportsPage` chunk emitted |
| i18n | `node src/renderer/scripts/check-i18n.mjs` | No missing `reports.*`; EN/AR 332 = 332 |

Live check (Express + Vite + Playwright, Admin JWT cookie): EN and AR/RTL render; tab click writes `?tab=statistics&from=…&to=…&group=day&dist=payment`; Generate appends `run=1`; changing the date leaves the generated range in the URL and shows the stale banner; `GET /api/reports/options` → 200 (admin: payroll populated; `view_reports`-only: `payroll_employees: []`); legacy `/api/reports/patients` still → 200.

Two UI defects found and fixed in that pass: the shadcn `TabsTrigger` styles `data-active` while Radix emits `data-state="active"` (active tab was invisible — fixed locally on the Reports strip), and the two dates inside the range button were bidi-reordered in Arabic (now isolated `dir="ltr"` runs).

---

## 5. Deviations from the plan

| Plan | As built | Why |
|---|---|---|
| Response keys snake_case | Confirmed snake_case (first pass mistakenly returned camelCase) | Consistency with every other endpoint; `lib/api` converts once |
| `TAB_META` / descriptors inside the page module | Moved to `state/tabMeta.ts` | `react-refresh` only tolerates component exports |
| `ReportOptionsDTO` declared in the model | Imported from `reports.d.ts` | One contract, no drift |
| `useReportOptions` set `loading` inside the effect | State object updated only from promise callbacks; `reload()` sets it in an event handler | `react-hooks/set-state-in-effect` lint rule |
| `lib/csv.ts` promoted "and update Vault/Insurance imports" | Originals converted to re-export shims | Zero churn, both paths work |
| Test bootstrap left alone | `db.helper` now delegates to the app's `initDB` | The local copy could never run |

---

## 6. Known pre-existing test failures (do not chase)

33 of 415 backend specs fail before and after this phase:

- **Vault date specs** (`VaultController` ×8, `VaultModel` ×3) compute `TODAY = new Date().toISOString().slice(0, 10)` — that is the *UTC* date. On the UTC+3 development machine at 01:37 the UTC date is yesterday, so "today range" queries legitimately return 0 rows. Fix by using local date components if you touch them.
- **~21 stale specs** assert older return shapes (`{rows,total}` vs array), missing DTO fields (`national_id`, `patient_history_id`, `shift_start_time/end_time`), or role/permission ordering.
- **1 rounding expectation** (`1274` vs `1273`) in `VaultModel.getSupplySalesProfit`.

`check-i18n` also reports 12 missing EN / 14 missing AR keys (`medicalSupplies.usage.*`, `patients.*`, `common.record`, `employees.servicePrices`) and ~794 "potentially unused" — all pre-existing, none in `reports.*`.

---

## 7. Running things locally

### 7.1 Servers

```powershell
npx tsx src/app/index.ts                                  # API on :3000 (loads src/app/.env)
npx vite --config src/renderer/vite.config.ts             # UI on :5173 (or next free port), proxies /api
```

`vite.config.ts` reads `PORT` from `src/env`, so the proxy targets `http://localhost:3000`.

### 7.2 Visual check without knowing a password

Mint a session cookie and seed Zustand's persisted auth state, then drive the page:

```js
// node script importing dotenv + jsonwebtoken
const token = jwt.sign(
  { userId: 1, username: "admin", role: "Admin", permissions: [] },
  process.env.JWT_SECRET || "your-secret-key",
  { expiresIn: "2h" }
)
// Playwright:
await page.context().addCookies([{ name: "auth", value: token, url: "http://localhost:5173" }])
await page.addInitScript(() => {
  localStorage.setItem("hms-auth", JSON.stringify({
    state: { user: { userId: 1, username: "admin", role: "Admin", permissions: [] }, isAuthenticated: true },
    version: 0,
  }))
})
await page.goto("http://localhost:5173/reports")
```

For a payroll-gated check you need a user whose **server** permissions are `view_reports` without `manage_employees` (no such role exists in the dev DB today — creating one is a data change, do it deliberately).

### 7.3 Rebuilding the test DB

`npx tsc -p ./src/app/tsconfig.json`, then a script that connects to `postgres` with the `*_TEST` credentials, terminates backends on `HMS_test`, `DROP DATABASE`, `CREATE DATABASE "HMS_test" TEMPLATE template0`, and finally calls `setUpDatabase.initDB()` with `NODE_ENV=test`.

---

## 8. 6.11.1 — Patient report (as built)

### 8.1 What shipped

**Backend (all additive, under `/api/reports`):**

| File | Role |
|---|---|
| `src/app/utils/nationalId.ts` | Egyptian national-ID parsing: `parseNationalId` → `{ birthDate, gender, valid }`; age derived from the **report end date**, not `today`, so historical reports stay stable. |
| `src/app/models/reports/PatientReport.model.ts` | `listPatients` (admissions CTE → per-patient aggregate → filters → whitelisted sort → `LIMIT/OFFSET` + a separate summary query), `getPatientDetail` (**3** queries: patient+admissions, all `BillDetail` rows for those bills, `DailyStaffAssignment` in range), `exportPatients` (**5** queries, see §8.5 — every row carries all of its admissions). |
| `src/app/controllers/Reports.controller.ts` | `listPatients`, `getPatient`, `exportPatients`; exports wrapped in `checkPermissions(["view_reports","manage_reports"])`. |
| `src/app/routes/reports.routes.ts` | Order matters: `/patients/export` → `/patients/:patientId` → `/patients`. |
| `src/app/utils/types/reports.d.ts` | `PatientReportListResponse`, `PatientReportRow`, `PatientReportDetail`, `PatientReportAdmission`, item/staff DTOs. |

Specs: `Reports.patient.spec.ts` (**27/27**) and `Reports.patient.controller.spec.ts` (**10/10**).

**Frontend:**

```
pages/Reports/
├── api.ts                         # getPatients / getPatientDetail / exportPatients + patientParams/sortParam
├── types/patientReport.ts         # camelCase wire types + PATIENT_SORT_COLUMNS
├── hooks/usePatientReport.ts      # cache-aware list query with keep-previous paging
├── components/SearchField.tsx     # label + input (replaces the ad-hoc date inputs in filters)
├── components/SelectField.tsx     # label + native select
├── components/StatusBadges.tsx    # PaymentType / Gender / AdmissionStatus / ItemType
├── patients/PatientReportTab.tsx  # tab body: filters, KPIs, table, exports, print
├── patients/patientColumns.tsx    # 10 column defs + width discipline
├── patients/PatientDetailDialog.tsx
├── patients/AdmissionSection.tsx  # financial grid + billed items + staff
├── patients/AdmissionItemsTable.tsx # 6 columns, service date is a column
├── patients/DailyStaffTable.tsx
└── export/
    ├── pdf/buildPatientReportPdf.ts   # index table + one full section per patient
    ├── pdf/buildPatientDetailPdf.ts   # patient report / single admission
    ├── pdf/patientReportSections.ts   # identity, totals, item table, staff — shared by both PDFs
    └── csv/exportPatientReportCsv.ts  # 4 sections: patients / admissions / items / staff
```

`ReportsPage` now renders `PatientReportTab` for `tab === "patients"` (the other five still use `TabPlaceholder`), passes `canExport = hasPermission("manage_reports")`, and owns `useReportSession()`.

i18n: **31 keys added to each locale** (36 top-level `reports` groups): `reports.detail.*` (title/identity/card/form/billId/noBill/leaveReason/admissionHeading/dischargedOn/currentlyAdmitted/lengthOfStay[_one/_two/_few]/billedItems/dateTotal/baseTotal/finalTotal/noItems/noStaff/noAdmissionsDescription/searchPlaceholder), `reports.enums.itemType.*`, `reports.summary.admissions`, `reports.table.{serviceDate,itemName,itemType,quantity,unitPrice,totalPrice,referringDoctor,outstanding}`, `reports.messages.{exportError,printError}`, `reports.state.exportForbidden`. (`reports.detail.itemsForDate` was added for the first draft's date-heading rows and removed when the date became a column.)

### 8.2 Contracts that 6.11.1 added (later tabs must follow)

1. **Paging/sort are page-local, keyed by `generatedKey`.** `PatientQueryPaging` is stored as `{ key, value }`; a value whose `key` is not the current `generatedKey` is never read, so a new report (new dates/filters) starts on page 1 with the default sort **without a reset effect**. The list query is built from `generated` (URL) only — never from the draft.
2. **Keep-previous payload while paging.** `usePatientReport` returns `payload` = current-key payload **or** the last payload fetched for the same `patientFilterKey`; `refreshing = loading && payload !== undefined`. Without this, every page/sort click produced a key miss and unmounted the table + pagination for a frame. A filter/date change deliberately does **not** keep the previous payload (different report → full skeleton).
3. **`loading` is derived, not stored** (`key && !cached && !error`) so the render that sees a new key already knows the payload is missing.
4. **Exports always re-fetch** `/patients/export` with the **generated** filters **and the current sort**, so a download matches the visible table even after the draft was edited.
5. **Detail and print fetch on demand, never per row.** The detail dialog re-uses its payload for the same `patientId` + period; the row print action fetches the detail then prints, sharing `buildPatientDetailPdf`.
6. **Detail request identity is `<patientId>|<from>|<to>`** (`requestKey`). State is `{ key, payload, error }` and is only shown when `key === requestKey`; `retry()` clears it and bumps a nonce. No `setState` runs synchronously in the effect body (`react-hooks/set-state-in-effect`).
7. **List `total` comes from `summary.total_patients`**, not `COUNT(*) OVER()`, so the pagination footer and the KPI card can never disagree.
8. **Stored `Bill.total_amount` always wins** over the recomputed breakdown; the breakdown (`calculateBillFinancials`) is display-only in the admission card.
9. **`insurance_id` is honoured only when `payment_type=insurance`** (server ignores it otherwise; the tab also clears it when the payment type changes).
10. **`birth_date` is emitted as ISO `YYYY-MM-DD`**, never a `Date`.
11. **Radix `TabsContent` unmounts inactive tabs.** On return the tab remounts with default paging (page 1); `useReportSession` supplies the page-1 payload without a request, but a cached page 2/3 is not reused because the new key is page 1. This is accepted behaviour, not a bug.

### 8.3 Deviations from the 6.11.0 plan for this tab

| Plan | As built | Why |
|---|---|---|
| New bespoke `ReportTable` | Reused `components/common/DataTable` + `DataTablePagination` | Already supports server paging, sort, empty state, sticky header; a wrapper would only re-export it |
| Row totals via `COUNT(*) OVER()` | `summary.total_patients` | One fewer column to strip, and the KPI is authoritative |
| Free-form table widths | Explicit per-column `width` + truncation | Ten columns overflowed the card at 1680 px (§8.4) |
| `ReportKpiStrip` fixed 5-col grid | Grid derives from `items.length` (4 → 4-up) | The dialog's 4 KPIs rendered at 1/5 width and clipped currency values |

### 8.4 Verification

| Gate | Command | Result |
|---|---|---|
| Backend model specs | `npx tsc -p ./src/app/tsconfig.json` → `$env:NODE_ENV="test"; npx jasmine --filter="Patient report"` | 27/27 |
| Backend controller specs | same, `--filter="ReportsController — patient report"` | 10/10 |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | 5 errors, all pre-existing in `pages/Employees` (§6); none in Reports/lib |
| Lint | `npx eslint src/renderer/src/pages/Reports` | Clean |
| Renderer unit | `npm run test:renderer` | 26/26 |
| Bundle | `npm run build:renderer` | OK |
| i18n | key-diff script against `reports.{en,ar}.json` | `reports.*` missing = 0 in both |

Live Playwright pass (Admin JWT, Express :3000 + Vite :5173), EN and AR/RTL: not-generated state → generate → KPI/meta → sort asc→desc (server round trip) → search + Generate (URL write) → row click → detail dialog (identity, Admission 1, print buttons) → CSV download `patient-report_2026-01-01_2026-10-27.csv` (correct headers/rows) → stale banner → Arabic list + dialog with `dir=rtl`. **Zero console errors**; every `/api/reports/*` call 200 with snake_case params; no per-row queries.

**Two defects found in the visual pass, fixed:**

1. **Actions column clipped at the card edge (1680 px).** Ten auto-layout columns each took their max-content width (≈1466 px vs 1326 px available), pushing the eye icon out of the card. Fixed by giving every column a definite preferred width (`name 14rem`, badges `w-24`, `paymentType`/`referringDoctor`/`admissions`/`lastAdmission`/`totalPaid` `w-28`, `totalBilled`/`outstanding` `w-32`, `actions` `w-24`) and truncating the free-text cells with a `title`. Measured after: `scrollWidth == clientWidth == 1326`, actions fully inside the card. Below ~1300 px the table now scrolls horizontally inside its own region, which is the intended fallback.
   - Truncated Latin text in an RTL page used to ellipsize at the *start* of the name (`…Gamal Mohamed Abdelaal`); the name/company/doctor spans carry `dir="auto"` so they truncate at their own logical end.
2. **Detail-dialog KPIs clipped** (`EGP 1,596.0`, `EGP 1,546.0`). `ReportKpiStrip` defaulted to `xl:grid-cols-5` while the dialog passes 4 items, so each card got 1/5 of the dialog width and `EditorialKpiCard`'s `overflow-hidden` cut the value. Fixed in the strip (count-aware `gridColumnsFor`): 4 items → `lg:grid-cols-4`, 2 → 2-up, 3 → 3-up, ≥5 keeps the 5-up rhythm. Measured after: 234 px cards, no value overflow in EN or AR.

### 8.5 Export carries every admission (follow-up inside 6.11.1)

The first cut of the tab exported what the table showed: one aggregate row per
patient. The document is now the **full report** — the index table first, then
one section per patient with every admission, and the CSV mirrors it in four
sections.

**Contract 12 — the export row is a superset of the list row.**

```ts
export interface PatientReportExportRow extends PatientReportRow {
  admissions: PatientReportAdmission[]   // items + staff included
}
```

Only `/patients/export` populates it. The paginated list deliberately does
**not**: attaching admissions there would multiply the table payload by the
admission count for data the table never renders. `PatientReportDetailDTO`
stays `{ patient, admissions }`, which is what the dialog and the single-patient
print consume.

**Contract 13 — the export stays fixed-cost: 5 queries, never one per patient.**

| # | Query | Scope |
|---|---|---|
| 1 | rows (aggregate CTE, no paging) | whole filtered set |
| 2 | summary (`getSummary`) | whole filtered set — runs in parallel with 1 |
| 3 | `getAdmissionsForPatients(patientIds, range)` | `WHERE patient_id = ANY($1::int[])`, `LEFT JOIN Bill` so an admission with no bill still appears |
| 4 | `getItemsByBill(billIds)` | `ANY(billIds)` |
| 5 | `getStaffByPatient(patientIds, range)` | `ANY(patientIds)`, grouped by patient then work date |

`getDailyStaff(patientId, …)` became `getStaffByPatient(patientIds, …)` so the
detail endpoint (one id) and the export (all ids) share the same call;
`getPatientDetail` still runs 3 queries.

**Contract 14 — the service date is a column, not a heading row.**

The item table is flat and identical in all three surfaces (screen, PDF, CSV):

```
Date | Item | Type | Qty | Unit Price | Total
```

- Screen: `patients/AdmissionItemsTable.tsx` (replaced `ItemsByDateTable.tsx`),
  i18n `reports.table.serviceDate`.
- PDF: `export/pdf/patientReportSections.ts` → `admissionSection`, widths
  `["auto", "*", "auto", "auto", "auto", "auto"]` (`"*"` only on the item name,
  so the table cannot exceed the content box).
- CSV: the `Billed Items` section, one row per line.

A per-date subtotal row is emitted **only when that date has more than one
line** (`dateTotalRow` in the PDF, a `colSpan={4}` row on screen); a single line
already states its own date and amount. `dateTotal` is always the server's
value, never recomputed.

**Contract 15 — one shared block builder per PDF fragment.**
`export/pdf/patientReportSections.ts` owns `patientInfoTable`,
`patientTotalsTable`, `totalsFromAdmissions` and `admissionSection`. Both
`buildPatientReportPdf.ts` (index table + per-patient sections) and
`buildPatientDetailPdf.ts` (identity + totals + admissions) import them, so a
fix to the item table or the financial rows cannot land in only one document.
Admission numbering restarts per patient (`1. Admission …`).

**Contract 16 — document order and page breaks.**

1. Report period + whole-set summary KPIs.
2. `N patients` + index table (8 columns) + totals band.
3. Per patient, **always on a new page**: heading `n. <name>`, `N admissions in
   the selected period`, identity grid, per-patient totals (from the row's SQL
   aggregate, so it equals the index row), then each admission — page-broken
   from the one before it — with its item table, financial rows and daily staff.

An admission with no billed lines prints a single `No billed items` row instead
of a bare header above `Base Total 0.00`.

**Contract 17 — CSV sections mirror the document.** `toSectionedCsv` (blank line
between blocks, BOM, CRLF):

| Section | Rows |
|---|---|
| *(title-less)* Patients | one per patient — the pre-existing 20 columns, byte-identical, so the header row is still line 1 for anything already parsing the file |
| Admissions | one per admission, `Admission #` ordinal per patient |
| Billed Items | one per line, `Date` column |
| Daily Staff | one per (admission, work date, employee), `Role` + `Hours` |

Empty detail sections are omitted (a period with no bills leaves no
header-only table behind). Money stays a raw number, dates `DD/MM/YYYY`.

### 8.6 Verification of the export change

| Gate | Result |
|---|---|
| `npx tsc -p ./src/app/tsconfig.json` then `$env:NODE_ENV="test"; npx jasmine --filter="patient"` | 56 specs, all patient-report + export specs green; the only 2 failures are the pre-existing `PatientModel.getAllPatients` baseline |
| Export specs added | attachments (admission + items + staff, bill-less admission kept), aggregates == attached admissions, range scoping |
| `npx tsc -p src/renderer/tsconfig.json --noEmit` | 5 errors, all pre-existing `pages/Employees`; none in Reports |
| `npx eslint src/renderer/src/pages/Reports src/renderer/src/lib/pdf` | Clean |
| `npm run test:renderer` | 26/26 |
| `npm run build:renderer` | OK |

Live Playwright pass (real server payload, EN + AR, 1680 px, dev DB = 2 patients /
9 admissions):

- Export endpoint returns `data[].admissions` — 2 patients, **9 admissions**, and
  the server log shows **one** export request per download (no per-row calls).
- Generated PDF: **11 pages**, `/Count 11`; 9 `pageBreak`s = 1 per patient + 1
  between each patient's admissions; headings in order
  `1. Ahmed… / 1. Admission 31/08/2026 / 2. Admission 25/01/2026 / 2. Nada… /
  1. … 7. Admission …`; **9** item tables, every header row exactly
  `Date | Item | Type | Qty | Unit Price | Total`; **9** staff tables; 2 subtotal
  rows, matching the two dates that carry more than one line.
- Geometry (`pdfbounds` over every content stream): every filled cell sits inside
  `[40.25, 555.03]` on all 11 pages, i.e. `0.25 pt` inside the A4 content box —
  **no column clipped in EN or AR**.
- CSV: 4 sections (`Patients` 3 lines, `Admissions` 11, `Billed Items` 14,
  `Daily Staff` 42); first line is still the original patient header; no
  `Items on …` heading anywhere; ordinals and `DD/MM/YYYY` dates match the PDF.
- Zero console errors in both locales.

Single-patient print re-checked after the rewire: 2 admissions → 2 item tables +
2 staff tables with one page break between them; `admissionId` narrows the
document to 1 block and removes the break.

### 8.7 Continue here — 6.11.3 Nurse report

> **Done — see §10** for what actually shipped and where it deviated. The plan below is kept as
> written before implementation.

Plan §3.5.4 (contract), §3.4 "Nurse queries" (SQL), §5.3 (UX), §6.11.3 (gates).

1. **Backend** — `models/reports/NurseReport.model.ts` (+ `utils/types/reports.d.ts` DTOs, controller, routes with `/nurses/export` → `/nurses/:nurseId` → `/nurses`):
   - list: `Employee e WHERE employee_type='nurse' AND EXISTS (in-range DSA)`; aggregate
     `COUNT(DISTINCT dsa.patient_id)`, `COUNT(DISTINCT dsa.work_date)`, `SUM(dsa.hours_worked)`,
     `MAX(dsa.work_date)`; sort `name|patients|days|hours`; pagination.
   - detail: per-patient aggregate over DSA in range, with `diagnosis` / last admission+discharge
     from a `LATERAL` latest overlapping admission (**not** `MAX(diagnosis)`); plus one
     un-paged query for the daily assignments (group by date in JS).
   - export: same rows, no paging, `{ generated_at, range, summary, data }`.
   - Do not re-derive `hours_worked`: it is the stored `DailyStaffAssignment` value (§3.7).
2. **Frontend** — copy the doctor tab's shape (`doctors/DoctorReportTab.tsx`), not the patient
   tab's: `NurseReportTab`, `nurseColumns`, `NursePatientTable`, `nurseChartSnapshot`,
   `export/pdf/buildNurseReportPdf.ts`, `export/csv/exportNurseReportCsv.ts`; reuse
   `DoctorTotalsBand`'s pattern for the totals strip, `PatientDetailDialog` for drill-down and
   `ChartSnapshotSurface` for the chart bitmap.
   Report-type select = 2 options (`all-nurses`, `specific-nurse`) — the scope/relationship
   encoding in `reportParams.ts` already carries `scope` + `nurseId`, so no URL change is needed.
3. **Chart** — hours per nurse; denominator for the PDF is **all** nurses (zero-safe share helper
   from `buildDoctorReportPdf.ts`), the screen version covers the current page (§9, contract 21).
4. **i18n** — the `reports.nurseReports.*` keys exist except the ones the tab will need
   (`chartTitle`, `chartCaption`, `types.allNurses` label revisit, `assignmentsHint` analogue for
   days/hours). Verify with `check-reports-i18n.cjs`, not `check-i18n` alone (§8.1, item 4).

---

## 9. 6.11.2 — Doctor report (as built)

### 9.1 What shipped

**Backend (additive, under `/api/reports/doctors`):**

| File | Role |
|---|---|
| `src/app/models/reports/DoctorReport.model.ts` | `buildPairsCte(relationship)` builds **one row per (doctor, patient, admission)** — that is what keeps every aggregate a plain `COUNT`/`SUM` with no fan-out. `FILTERED_CTE` applies range/doctor/search, `DOCTOR_AGG_CTE` rolls up per doctor. `listDoctors` = rows + summary (2 queries); `getDoctorDetail` = header + patient page + summary; `exportDoctors` = rows + summary (+ `getPairRefs` when `include_admissions`), then reuses `PatientReportModel.getPatientsByDoctor`'s admission/item/staff shapes. |
| `src/app/controllers/Reports.controller.ts` | `listDoctors`, `getDoctor`, `exportDoctors`, `parseDoctorFilters`. |
| `src/app/routes/reports.routes.ts` | `GET /doctors/export` → `/doctors/:doctorId` → `/doctors` (order matters). |
| `src/app/utils/types/reports.d.ts` | `DoctorReportSummary`, `DoctorReportRow`, `DoctorPatientRow`, `DoctorReportListResponse`, `DoctorReportDetailDTO`, `DoctorExportRow`, `DoctorReportExportPayload`. |

Sort maps: `DOCTOR_SORT_COLUMNS` (`name|patients|admissions|billed|paid`, default `name`) and
`DOCTOR_PATIENT_SORT_COLUMNS` (`name|admissions|billed|paid|last_admission`).

Specs: `Reports.doctor.spec.ts` (**29/29**) and `Reports.doctor.controller.spec.ts` (**12/12**);
`clearDoctorPatientHistory()` added to `tests/helpers/db.helper.ts` so the relationship fixtures
stay independent.

**Frontend:**

```
pages/Reports/
├── types/doctorReport.ts              # camelCase wire types + DOCTOR_*_SORT maps
├── api.ts                             # getDoctors / getDoctorDetail / exportDoctors + doctorParams
├── hooks/useDoctorReport.ts           # list query (filter key, keep-previous paging)
├── hooks/useDoctorDetail.ts           # doctor + patient page query
├── doctors/DoctorReportTab.tsx        # filters, both modes, exports, snapshot, dialogs
├── doctors/doctorColumns.tsx          # 6 column defs (name/type/patients/admissions/billed/paid)
├── doctors/DoctorPatientTable.tsx     # 9-column per-doctor patient table + paging
├── doctors/DoctorTotalsBand.tsx       # totals strip + optional dedupe note
├── doctors/DoctorDistributionChart.tsx# horizontal bar chart + distribution card
├── doctors/doctorChartSnapshot.ts     # English labels for the PDF bitmap
├── doctors/DoctorDetailDialog.tsx     # doctor header + patient table, row drill-down
└── export/
    ├── pdf/buildDoctorReportPdf.ts    # summary → distribution → index → per-doctor sections
    └── csv/exportDoctorReportCsv.ts   # one row per (doctor, patient) + optional admissions
```

`ReportsPage` renders `DoctorReportTab` for `tab === "doctors"`; `DataTable` grew a `footer` prop
(rendered under the table, inside the card) so the totals band does not need a second table.

### 9.2 Contracts that 6.11.2 added (continues §8.2)

18. **Two patient totals, deliberately different.** `total_patients` /
    `total_admissions` / billed / paid in the summary are **deduplicated across doctors**;
    `total_patient_assignments` is the **sum of the per-doctor `patients_count`**. A patient seen
    by three doctors is one patient and three assignments. The KPI card shows the unique count
    with a `reports.doctorReports.assignmentsHint` sub-label; the table footer uses the
    **additive** figure (it sums the column) and carries `dedupeNote` to explain the gap.
    Never "fix" one of the two to match the other.
19. **Relationship → join semantics.**

    | `relationship` | Pairs come from | Extra filter |
    |---|---|---|
    | `referred` | `Patient.referring_doctor_id` | — |
    | `attended` | `PatientHistory.attending_doctor_id` | — (attending, outside, supervising, `NULL` type) |
    | `supervised` | same join as `attended` | `d.doctor_type = 'supervising'` |

    A non-supervising doctor id with `relationship=supervised` is a **400**, not an empty report.
20. **`search` means one thing per mode.** All-doctors mode searches **doctor names**; specific
    mode searches **patients**. Changing the report type therefore clears `search`, and keeps the
    selected doctor only if `doctorsForRelationship()` still lists them. Generate is blocked with
    `reports.validation.selectDoctor` when a specific report has no doctor.
21. **The distribution denominator differs between screen and paper — and says so.** The
    on-screen chart draws the **current page** (`chartCaption`: "This page only…"), the PDF prints
    a table over **every** doctor plus a bitmap of that same all-doctor chart. `sharePercent()`
    returns `-` for a 0 denominator, so an empty report can never print `NaN%`.
22. **Admission detail is single-doctor only.** `include_admissions` is honoured **only** when
    `doctor_id` is present; the attached admissions are doctor-scoped through `getPairRefs`, so a
    doctor's document never shows a colleague's admissions for the same patient.
23. **Exports are English-only** (`formatEnGbDate` / `formatMoneyEn` / `formatCurrencyEn`,
    `openPdfShellDoc` chrome), same as Vault 6.9 / Insurance 6.10 / Patient 6.11.1.
24. **Export shapes.** PDF: period → summary (incl. *Patient-Doctor Assignments*) → distribution
    (skipped for a one-doctor document) → index table with TOTALS → one page per doctor with their
    patient table (and, if attached, admission detail). CSV: **one row per (doctor, patient)** with
    the doctor totals repeated, so `SUM` over the file equals the additive figure; a second
    `Admissions` section appears only when the export carried admissions.
25. **Snapshot capture is best-effort.** `ChartSnapshotSurface` + `waitForSnapshotRoot(900 ms)`
    poll for the off-screen chart, `captureChartSnapshots` returns a `name → dataUrl` map; a failed
    capture only drops the image — the PDF still prints the distribution table.

### 9.3 Deviations from the plan for this tab

| Plan | As built | Why |
|---|---|---|
| Doctor export reuses the page's admission payload | `exportDoctors` runs **3** queries (rows, summary, refs) and only attaches admissions for a single doctor | An all-doctors document prints no admission sections; attaching them would multiply the payload for data no page renders |
| 6 relationship options implied by "referred / attended / supervised" | 6 explicit options in one select (`all-referred` … `specific-supervised`), 2 of them new labels | The select encodes **both** scope and relationship, so one control drives mode + join |
| Distribution chart only | Chart **and** a printed distribution table | A bitmap is unreadable for a long doctor list and impossible to sum; the table is the auditable artifact |
| Separate patient dialog for doctor drill-down | Shared `PatientDetailDialog` (`canExport`, real print handlers via `buildPatientDetailPdf`) | One patient document, not two |

### 9.4 Verification

| Gate | Command | Result |
|---|---|---|
| Backend model specs | `npx tsc -p ./src/app/tsconfig.json` → `$env:NODE_ENV="test"; npx jasmine --filter="doctor report"` | 29/29 |
| Backend controller specs | same, `--filter="ReportsController — doctor report"` | 12/12 |
| API smoke (live server) | `doctor-api-smoke.cjs` over all three relationships | list/detail/export all 200; `supervised` + referring id → **400**; end-before-start → **400** |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | 5 errors, all pre-existing `pages/Employees` (§6) |
| Lint | `npx eslint src/renderer/src/pages/Reports src/renderer/src/lib/pdf src/renderer/src/components/common/DataTable.tsx` | Clean |
| Renderer unit | `npm run test:renderer` | **33/33** (7 new in `test/doctorReportExport.spec.ts`) |
| Bundle | `npm run build:renderer` | OK |
| i18n | `check-reports-i18n.cjs` | `reports.*` missing = 0 in both locales |

Live Playwright pass (**29/29**, Admin JWT, Express :3000 + Vite :5173), EN and AR/RTL:

- all six report types present; `all-attended` generates over `2020-01-01 … 2030-12-31`;
  KPIs (`Total Doctors`, `Unique Patients` + "2 patient-doctor assignments"), distribution card,
  TOTALS band, **no `NaN` anywhere**;
- CSV download `doctor-report_2020-01-01_2030-12-31.csv` — 3 lines (header + 1 row per
  doctor-patient), `Doctor Name` first column;
- `Export PDF` → `200` on `/doctors/export`, **no error toast**; the document itself was verified
  in-page (`loadPdfMake` + `buildPdfShellDoc` + `doctorReportDocContent` → `getBuffer`):
  **29,436 bytes, header `%PDF-`**. pdfmake's `open()` leaves an `about:blank` popup in headless
  Chromium (pre-existing behaviour since the first PDF work), so the popup is *not* a useful
  assertion — the buffer is;
- specific mode: doctor picker populated, table + TOTALS, no distribution card, row click opens the
  shared patient dialog;
- changing the report type clears `search` and drops an ineligible doctor; Generate without a
  doctor shows `select a doctor`; `referred` (empty in the dev DB) shows the no-doctors state
  with no `NaN`;
- AR page has `dir=rtl`, Arabic KPI/chart labels, no `NaN`. **Zero console errors** in both
  locales.

**Two defects found and fixed during the pass:**

1. `reports.doctorReports.chartCaption` interpolated `{{count}}`, so a single-doctor-page report
   read "lists all **1 doctors**". The string is now count-free ("lists every doctor with their
   share of the total") in both locales and the tab no longer passes `count`.
2. The PDF chart labels lived in `DoctorDistributionChart.tsx`, which broke
   `react-refresh/only-export-components`. Moved to `doctors/doctorChartSnapshot.ts`.

---

## 10. 6.11.3 — Nurse report (as built)

### 10.1 What shipped

**Backend (additive, under `/api/reports/nurses`):**

| File | Role |
|---|---|
| `src/app/models/reports/NurseReport.model.ts` | `PAIRS_CTE` builds **one row per (nurse, patient, work_date)** straight from `DailyStaffAssignment` — its unique constraint means every aggregate is a plain `COUNT`/`SUM`, with no fan-out to dedupe. The range filters on `work_date`, so a 3-day stay inside a 1-day window counts only the days that fall inside it. Diagnosis comes from a `LATERAL` latest admission **overlapping** the range (not merely started inside it). `listNurses` = rows + summary (2 queries); `getNurseDetail` = header+summary (1 statement) + patient page + whole accordion; `exportNurses` = rows + summary, then every nurse's patients and days in two batched queries (**4 total**). |
| `src/app/controllers/Reports.controller.ts` | `listNurses`, `getNurse`, `exportNurses`, `parseNurseFilters`. |
| `src/app/routes/reports.routes.ts` | `GET /nurses/export` → `/nurses/:nurseId` → `/nurses` (order matters). |
| `src/app/utils/types/reports.d.ts` | `NurseReportSummary`, `NurseReportRow`, `NursePatientRow`, `NurseDailyAssignment`, `NurseReportListResponse`, `NurseReportDetailDTO`, `NurseExportRow`, `NurseReportExportPayload`. |

Sort maps: `NURSE_SORT_COLUMNS` (`name|patients|days|hours|last_work`, default `name`) and
`NURSE_PATIENT_SORT_COLUMNS` (`name|days|hours|last_admission`).

Specs: `Reports.nurse.spec.ts` (**19/19**) and `Reports.nurse.controller.spec.ts` (**9/9**).

**Frontend:**

```
pages/Reports/
├── types/nurseReport.ts                 # camelCase wire types + NURSE_*_SORT maps
├── api.ts                               # getNurses / getNurseDetail / exportNurses + nurseParams
├── hooks/useNurseReport.ts              # list query (filter key, keep-previous paging)
├── hooks/useNurseDetail.ts              # nurse + patient page + accordion query
├── nurses/NurseReportTab.tsx            # filters, both modes, exports, snapshot, dialogs
├── nurses/nurseColumns.tsx              # nurse list (5 cols) + patient table (6 cols)
├── nurses/NursePatientTable.tsx         # per-nurse patient table + paging + totals band
├── nurses/NurseTotalsBand.tsx           # totals strip + optional dedupe note
├── nurses/NurseDistributionChart.tsx    # hours-per-nurse bar chart + distribution card
├── nurses/nurseChartSnapshot.ts         # English labels for the PDF bitmap
├── nurses/DailyAssignmentAccordion.tsx  # one row per work date, day totals
├── nurses/NurseDetailDialog.tsx         # nurse header + table + accordion, row drill-down
└── export/
    ├── pdf/buildNurseReportPdf.ts       # summary → distribution → index → per-nurse sections
    └── csv/exportNurseReportCsv.ts      # patients section + daily-assignment section
```

`ReportsPage` renders `NurseReportTab` for `tab === "nurses"`.

### 10.2 Contracts that 6.11.3 added (continues §9.2)

26. **The pair is `(nurse, patient, work_date)`, not `(nurse, patient)`.** `DailyStaffAssignment`
    has a unique constraint on that triple, so every nurse figure is a plain aggregate and no
    `DISTINCT` is needed anywhere in the model. This is *why* the nurse report has no fan-out
    hazards, unlike the doctor report (which joins a one-to-many admission history).
27. **`total_patients` is deduplicated; `total_patient_assignments` and `total_days` are additive.**
    Identical to contract 18: the KPI card shows the unique patient count with an
    `assignmentsHint`, the table footer sums the column (`total_patient_assignments`) and carries
    `dedupeNote`. Hours are additive too, but they are not a count so they need no note.
28. **The range scopes `work_date`, and the diagnosis lookup is an *overlap* lateral.** A nurse's
    patient row shows the latest admission whose stay **intersects** the range, so a patient
    admitted before `start_date` and still in the ward gets their current diagnosis rather than
    `NULL`. This is the gate "range-scoped days" plus "overlapping-admission diagnosis".
29. **Empty nurses are excluded, not listed with zeros.** A nurse with no assignment inside the
    range does not appear at all (`NURSES_AGG_CTE` starts from the pairs CTE); the summary counts
    the same population, so `total_nurses` always equals the number of index rows.
30. **No relationship select.** Two report types (`all-nurses`, `specific-nurse`); a nurse is in
    the report when they have at least one in-range assignment. `nurse_id` is sent only in
    specific mode — all mode must send **no** id at all.
31. **`search` means one thing per mode** (contract 20 again): all mode searches nurse names,
    specific mode searches patients. Changing the report type clears it. Generate is blocked with
    `reports.validation.selectNurse` when a specific report has no nurse.
32. **The accordion is one payload, not one request per day.** `getNurseDetail` returns
    `daily_assignments` newest-first, each with its patients, and it **follows `search`** so the
    accordion can never list a patient the table above it hides. `DailyAssignmentAccordion` is
    presentational; it keeps its open state when a date still exists and falls back to the newest
    day when the whole date set changed.
33. **A non-nurse id is a 404.** `/nurses/1` where 1 is a doctor returns `Nurse not found` — the
    same answer as an unknown id, because the endpoint's population is `employee_type = 'nurse'`.
34. **Chart metric is hours, and the denominator is hours.** The on-screen chart draws hours per
    nurse for the **current page** (`chartCaption` says so); the PDF prints a table over **every**
    nurse with each one's share of `summary.total_hours`, reusing `sharePercent()` imported from
    `buildDoctorReportPdf` (zero-safe `-`, never `NaN%`).
35. **Export shapes.** PDF: period → summary (Nurses / Unique Patients / Patient-Nurse Assignments
    / Total Days / Total Hours) → hours distribution (skipped for a one-nurse document) → index
    with TOTALS → one page per nurse (totals, patient table, daily-assignment table or
    *"No daily assignments in this period."*). CSV: patients section, one row per (nurse, patient)
    with the nurse totals repeated, plus a `Daily Assignments` section, one row per
    (nurse, work date, patient) with the day totals repeated.
36. **The export row's per-nurse roll-up is `totals`, not `summary`.** The envelope already has a
    `summary` (whole set); naming the row's block the same thing caused the PDF and CSV to read
    `undefined` for a while. `DoctorExportRow` uses `totals` for the same reason — follow it.

### 10.3 Deviations from the plan for this tab

| Plan | As built | Why |
|---|---|---|
| Nurse chart could be patients or hours | **Hours**, with hours as the share denominator | The tab's distinguishing number is workload; patients are already the KPI and a column |
| Accordion fetched per day | One payload from the detail query | A 30-day assignment would otherwise be 30 round trips, and the day set must match the table's search |
| Export row carries `last_work_date` | Derived in the PDF from `dailyAssignments[0].workDate` | The export rows do not carry the column; deriving it keeps the export at 4 queries instead of adding a fifth |
| Separate patient dialog | Shared `PatientDetailDialog` + `buildPatientDetailPdf` | Same rule as 6.11.2 — one patient document |

### 10.4 Verification

| Gate | Command | Result |
|---|---|---|
| Backend model specs | `npx tsc -p ./src/app/tsconfig.json` → `$env:NODE_ENV="test"; npx jasmine --filter="nurse report"` | 19/19 (+ 9 controller = 28/28) |
| API smoke (live server) | `nurse-api-smoke.cjs` over `2020-01-01 … 2030-12-31` | list 200 (`total_nurses 1`, `total_patients 2`, assignments 2, `total_days 4`, `total_hours 22.8`, last work `2026-08-31`); detail 200; `search=zzz` → 0 everywhere; export 200; doctor id and unknown id both **404**; end-before-start **400** |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | 5 errors, all pre-existing `pages/Employees` (§6) |
| Lint | `npx eslint src/renderer/src/pages/Reports src/renderer/test/nurseReportExport.spec.ts` | Clean |
| Renderer unit | `npm run test:renderer` | **41/41** (8 new in `test/nurseReportExport.spec.ts`) |
| Bundle | `npm run build:renderer` | OK |
| i18n | `check-reports-i18n.cjs` | 160 used keys, missing = 0 in both locales (only the pre-existing `lengthOfStay_two/_few` are `onlyAr`) |

Live Playwright pass (**35/35**, Admin JWT, Express :3000 + Vite :5173), EN and AR/RTL:

- both report types present; all-nurses generates over the full range; KPIs (`Total Nurses`,
  `Unique Patients` + "2 patient-nurse assignments", `Total Days`, `Total Hours`), distribution
  card, TOTALS band, **no `NaN` anywhere**; URL carries `scope=all&run=1` and **no** `nurse_id`;
- a row opens the nurse detail dialog with `Daily Assignments` and `Day total`;
- CSV download `nurse-report_2020-01-01_2030-12-31.csv` — 11 lines, `Nurse Name` first,
  `Daily Assignments` + `Work Date` section present;
- `Export PDF` → `200` on `/nurses/export`, no error toast; document verified in-page
  (`loadPdfMake` + `buildPdfShellDoc` + `nurseReportDocContent` → `getBuffer`):
  **29,191 bytes, header `%PDF-`**;
- specific mode: picker populated, `search` cleared by the type change, patient table + TOTALS,
  no distribution card, **4 accordion days**, row click opens the shared patient dialog;
- Generate without a nurse → `select a nurse`; a `2019` range shows the no-nurses state;
- AR page `dir=rtl`, Arabic KPI + chart labels, no `NaN`. **Zero console errors** in both locales.

**Defects found and fixed during the pass:**

1. **Export contract mismatch (real bug, only the live gate caught it).** `exportNurses` emitted
   the per-nurse roll-up as `summary` while the renderer type, PDF and CSV read `totals`, so every
   exported nurse rendered `undefined` figures and the CSV columns were `0`. Renamed to `totals`
   in the model, the DTO and the model spec (§10.2 contract 36).
2. The gate script clicked `table tbody tr` and hit the chart's `sr-only` accessibility table
   instead of the real one. Locators are now `table:not(.sr-only) tbody tr` — worth remembering
   for the remaining tabs, since every chart ships an `sr` table.

### 10.5 Continue here — 6.11.4 Statistics

> **Done — see §11** for what actually shipped. Kept as written before implementation.

Plan §3.5.5 (contract), §5.4 (UX), §6.11.4 (gates). Follow §10.2 and the 6.11.2/6.11.3 tab
recipes: a `StatisticsReport.model.ts` (grouping by day/month/year over admissions, payments and
supplies), `listStatistics`/`getStatistics`/`exportStatistics`, then a `StatisticsReportTab` that
reuses `GroupByField`, the KPI strip, the chart wrappers and `ChartSnapshotSurface`. Two things to
carry forward: exports are English-only, and every export row's per-group block is named `totals`
(contract 36), never `summary`.

---

## 11. 6.11.4 — Statistics (as built)

### 11.1 What shipped

**Backend (additive, under `/api/reports/statistics`):**

| File | Role |
|---|---|
| `src/app/models/reports/StatisticsReport.model.ts` | `getStatistics` runs **seven independent statements in parallel** (`Promise.all`), so latency is one round trip rather than seven sequential ones: (1) KPIs as scalar subqueries, (2) census/admissions/discharges/average stay per bucket, (3) revenue per bucket, (4) the 2-D distribution, (5) top services, (6) top drugs, (7) staff utilisation. `exportStatistics` calls `getStatistics` and adds `generated_at` — there is deliberately no second implementation. |
| `src/app/controllers/Reports.controller.ts` | `getStatistics`, `exportStatistics`, `parseStatisticsFilters`, `parseStatisticsGrouping` (default `day`). |
| `src/app/routes/reports.routes.ts` | `GET /statistics/export` → `/statistics`. No id segment, so ordering is only about the static `export` suffix. |
| `src/app/utils/types/reports.d.ts` | `StatisticsReportDTO` (already declared in 6.11.0) plus the new `StatisticsReportExportPayload`. |

`generate_series` produces the buckets (`bucketPlan` truncates the bounds for month/year), so a
quiet period is a zero row instead of a gap. Census and admissions are separate subqueries of the
same bucket row, which is what stops the legacy "Admission Trends is actually a census" defect.

Specs: `Reports.statistics.spec.ts` (**22**) and `Reports.statistics.controller.spec.ts` (**5**).

**Frontend:**

```
pages/Reports/
├── types/statisticsReport.ts            # camelCase wire types + query contract
├── api.ts                               # getStatistics / exportStatistics
├── hooks/useStatisticsReport.ts         # one document per (range, grouping)
├── statistics/
│   ├── StatisticsReportTab.tsx          # filters, two KPI strips, eight cards, exports
│   ├── StatisticsCharts.tsx             # eight chart components + StatisticsSnapshotCharts
│   └── statisticsChartSnapshot.ts       # EN labels + snapshot keys
└── export/
    ├── pdf/buildStatisticsReportPdf.ts  # period → KPIs → eight chart+table sections
    └── csv/exportStatisticsReportCsv.ts # sectioned CSV, one section per series
```

`ReportsPage` renders `StatisticsReportTab` for `tab === "statistics"`.

### 11.2 Contracts that 6.11.4 added (continues §10.2)

37. **One request per report, seven statements behind it.** The tab asks for the document once;
    every chart is a projection of that payload. A chart can therefore never disagree with its
    neighbour or with the export.
38. **Buckets are generated, not observed.** An empty range still returns a complete zeroed
    series (so the axes render and the empty state is honest), and a partial month still collapses
    to one calendar-aligned bucket.
39. **Census ≠ admissions.** `census` counts patients *present* in the bucket
    (`admission_time < bucket_end AND (discharge_time IS NULL OR discharge_time >= bucket_start)`);
    `admissions` counts `admission_time` inside it. The two are plotted as separate series,
    labelled separately, and can legitimately diverge.
40. **Average stay averages only discharges inside the bucket.** Averaging every overlapping stay
    would count a long admission once per bucket and pull the figure towards the window length.
41. **Revenue is scoped by `Bill.generated_at`, and `outstanding = billed - collected` is derived
    in TS.** Three separate sums of the same rows can disagree after rounding; one subtraction
    cannot. The same rule applies per bucket and to the KPIs.
42. **The distribution is two splits in one payload.** `GROUP BY payment_type, gender` and split
    in TS, so the toggle is pure view state: it rewrites `?dist=`, never refetches, and is
    **excluded from `reportParamsKey`** — otherwise a redraw would show the "filters changed,
    regenerate" banner. `setViewParam` exists in the URL state for exactly this class of change.
43. **Top-N is by revenue from `BillDetail`.** Services join directly; drugs go through
    `DrugShipment` (`billdetail_check` guarantees one origin per line). Both lists are capped at
    ten and ordered `revenue DESC, name ASC` so ties are stable between renders.
44. **Staff utilisation rolls up per `employee_type`, with derived averages.** `avg_hours_per_
    assignment` and `avg_patients_per_staff` use `safeDivide` (0, never `NaN`), and a quiet range
    returns an empty list rather than a row of zeros.
45. **The export is the screen.** `exportStatistics` is `getStatistics` plus `generated_at`, so the
    PDF/CSV cannot drift from the tab. Exports are English-only, like every other tab in the phase.
46. **Every PDF chart section prints the table behind its bitmap.** The bitmap is best-effort
    (`html-to-image` can fail), and a bitmap alone is not auditable; the table is the fallback and
    the reconciliation. Revenue additionally prints a `TOTALS` row that equals the KPI table.
47. **A table's `widths` array must have exactly one entry per cell in every row.** pdfmake
    silently distributes a phantom column when the array is longer, ends up with a negative
    remainder and throws `unsupported number: NaN` while drawing cell backgrounds — a failure that
    no text assertion can catch. `test/statisticsReportExport.spec.ts` now walks every table
    (including those inside `stack`) and asserts the lengths match.
48. **The session cache deduplicates in-flight requests per `(tab, key)`.** `fetchOnce` stores the
    promise and clears the slot on settle, so React `StrictMode`'s double effect (and two views of
    the same report) share one response. All four report hooks use it; `reload` passes
    `{ force: true }` to bypass it.
49. **Chart entry animation is a context switch, and a capture waits for geometry — never for a
    sleep.** Recharts animates series in over ~1.5 s by default; `ChartSnapshotSurface` captures a
    mounted copy two frames later, so a bitmap taken at t≈30 ms contained the axes and **no series
    at all**. The wrappers now read `ChartAnimationContext` (`useChartAnimation()`), default `true`
    so on-screen charts are unchanged, and the snapshot surface provides `false`, which becomes
    `isAnimationActive={false}` on every `Line`, `Bar` and `Pie`. The measurement half lives in
    `lib/chartSnapshot.ts`: `captureElementAsPng` first awaits `waitForChartGeometry` — a bounded
    (1.5 s) poll for `svg.recharts-surface` with a non-zero box, then two frames — and
    `document.fonts.ready`. A `setTimeout` would have been both slower and wrong (a font swap or a
    slow `ResizeObserver` still blanks the capture); this waits for the condition instead.
50. **A `sr-only` block must be a `<div>`, never a `<table>`.** `sr-only` is `height: 1px;
    overflow: hidden`, but on a **table box** `height` is only a *minimum* and `overflow` does not
    clip — the table grows to fit its rows. `ChartSrTable` therefore renders
    `<div class="sr-only"><table>…</table></div>`. With `grouping=day` over 2020→2030 the
    table reached 4,018 rows and pushed the document to 82,339 px (≈79,600 px of empty space below
    the last card), growing linearly with the range. The same wrapper applies to the two dashboard
    charts that render their own `sr` summary. `test/chartSrTable.spec.tsx` pins the structure, and
    Playwright gates must select real tables with `table[data-slot="table"]` rather than
    `table:not(.sr-only)`.

### 11.3 Deviations from the plan for this tab

| Plan | As built | Why |
|---|---|---|
| One 7-card KPI grid (`xl:grid-cols-7`) | Two strips: 4 clinical + 3 revenue | Seven currency/count cards at 1/7 width clip values; the split also groups the two questions the page answers ("how busy" vs "how much money") |
| Distribution tables side by side | Stacked, full width, with a "By gender" caption | The `columns` block needed percentage widths plus a `columnGap`; stacking removes the arithmetic and keeps long payment-type names on one line |
| `listStatistics` + `getStatistics` | A single `getStatistics` | There is no paging and no sort: the whole series is the document the tab and the export both want |
| Occupancy card | Removed | Hardcoded `-%` in the legacy page and there is no beds table; removing beats faking (plan §2.8) |

### 11.4 Verification

| Gate | Command | Result |
|---|---|---|
| Backend specs | `$env:NODE_ENV="test"; npx jasmine --filter="statistics"` | 27/27 (22 model + 5 controller), exit 0 |
| API smoke (live server) | `statistics-api-smoke.cjs` | `day` 200 / 4,017 buckets, `month` 200 / 132, `year` 200 / 11; KPIs `2 patients / 9 admissions / 8 discharges / 30.97 d / 1,726 billed / 50 collected / 1,676 outstanding`; `grouping=week` **400**; reversed range **400**; export 200 with `generated_at`; export without `manage_reports` **403** |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | Only the 5 pre-existing `pages/Employees` errors (§6) |
| Lint | `npx eslint src/renderer/src/pages/Reports src/renderer/src/components/charts src/renderer/src/lib/chartSnapshot.ts src/renderer/test/statisticsReportExport.spec.ts` | Clean |
| Renderer unit | `npm run test:renderer` | **55/55** (11 in `test/statisticsReportExport.spec.ts`, 3 in `test/chartSrTable.spec.tsx`) |
| PDF bitmaps (live) | `snapshot-ink-check.cjs` | 8 canvases, **8/8** > 0.15 % coloured pixels |
| PDF bytes (live) | `statistics-pdf-size-check.cjs` | 28,741 → **210,932** bytes, header `%PDF-` |
| Page height vs. range (live) | `statistics-layout-check.cjs`, `sr-table-check.cjs` | 1 month / 1 year / 11 years at `grouping=day`: **2,837 px in all three** (was 2,837 / 9,279 / 82,339); 8 `sr` wrappers, 16,077 rows, wrapper height **1 px** |
| Bundle | `npm run build:renderer` | OK |
| i18n | `check-reports-i18n.cjs` | 201 used keys, missing = 0 in both locales (only the pre-existing `lengthOfStay_two/_few` are `onlyAr`) |

Live Playwright pass (**46/46**, Admin JWT, Express :3000 + Vite :5173):

- all seven KPIs present (`Total Patients`, `Admissions`, `Discharges`, `Avg Stay`, `Billed`,
  `Collected`, `Outstanding`), all eight chart cards present, **no occupancy**, **no `$`**, **no
  `NaN`**, and eight `svg.recharts-surface` nodes actually rendered;
- **exactly one** `/statistics` request for the screen (after the `fetchOnce` fix — it was two
  under `StrictMode`);
- toggling the donut writes `dist=gender`, marks the button pressed, **issues no request**, and
  does **not** raise the stale banner; the choice survives a reload;
- CSV `statistics-report_2020-01-01_2030-12-31.csv`, 567 lines, `Metric,Value` first, all seven
  sections, no `EGP`;
- `Export PDF` → `200` on `/statistics/export`, no error toast; document verified in-page
  (`loadPdfMake` + `buildPdfShellDoc` + `statisticsReportDocContent` → `getBuffer`):
  **28,741 bytes, header `%PDF-`**. The real export (`URL.createObjectURL` hook on the clicked
  button, so chart bitmaps included) is **210,932 bytes** — 7.3× larger, all eight bitmaps
  carrying ink (contract 49, defect 3);
- grouping → `year` regenerates with no `NaN`; a `2019` range shows the per-chart "No data in this
  period" state; AR page `dir=rtl` with Arabic KPI/chart labels, **charts stay LTR**, no `NaN`.

The other tabs were re-run after the hook change: nurse **35/35**, doctor **29/29**.

**Defects found and fixed during the pass:**

1. **`unsupported number: NaN` on `Export PDF` (real bug, reported from the UI).** The census and
   average-stay tables reused `TREND_WIDTHS` (four entries) while their rows had three cells, so
   pdfmake distributed a phantom column and computed a NaN rect. Fixed by splitting
   `THREE_WIDTHS`/`TREND_WIDTHS` and adding the widths-vs-cells guard of contract 47 — the guard
   was verified to fail when the bug is reintroduced.
2. **Every report tab fetched twice in development.** `StrictMode` runs effects twice; the cache
   cannot dedupe because nothing is written until the response lands. Added
   `session.fetchOnce` (contract 48) and adopted it in all four hooks.
3. **Exported PDFs contained chart axes and no data (real bug, reported from the UI).** The four
   wrappers never set `isAnimationActive`, so the hidden export copy ran Recharts' ~1.5 s entry
   animation while the capture fired two frames after mount: every bitmap was an empty plot. Fixed
   at the source with `ChartAnimationContext` (contract 49) plus a geometry wait in
   `captureElementAsPng`, rather than a longer sleep. Verified with an ink probe that hooks
   `HTMLCanvasElement.prototype.toDataURL` and decodes each captured canvas: **8/8 bitmaps contain
   coloured series pixels** (0.38 %–35.1 % of pixels; a mid-animation capture scores ~0 %), and the
   real PDF grew 28,741 → **210,932** bytes. Because the fix is in the shared wrappers and surface,
   it repairs the doctor, nurse, patient, pharmacy, insurance and vault PDFs at the same time.
4. **The statistics page grew a huge empty tail on wide ranges (real bug, reported from the UI).**
   The `sr-only` data table behind each chart carried the class on the `<table>` itself. A table box
   treats `height` as a minimum and ignores `overflow`, so the table laid out at full height —
   4,018 rows at `grouping=day` over 2020→2030 — and the document reached **82,339 px** with the
   last card ending at 2,732 px. The gap scaled with the bucket count, which is why it looked like
   a chart problem. Fixed by moving the class to a `<div>` wrapper (contract 50) in `ChartSrTable`
   and in the two dashboard charts that build their own summary; page height is now constant at
   **2,837 px** for one month, one year and eleven years, with all 16,077 table rows still in the
   accessibility tree. `test/chartSrTable.spec.tsx` guards the structure, and the Playwright gates
   were re-pointed at `table[data-slot="table"]`.

### 11.5 Continue here — 6.11.5 Employee payments

Plan §3.5.6 (contract), §3.4 "Employee payment queries", §5.5 (UX), §6.11.5 (gates). This is the
first tab with **two permissions** (`view_reports` + `manage_employees` — check `canViewPayroll` in
`ReportsPage`, the tab must stay hidden without them) and the first with a **detail dialog that
pages its own sub-table**. Reuse `GroupByField`, the payroll timeline from the plan, and
`fetchOnce`; exports stay English-only and every export row's per-employee block is `totals`
(contract 36).

---

## 12. 6.11.5 — Employee payments (as built)

### 12.1 What shipped

**Backend** (all additive under `/api/reports`; legacy `/api/reports/*` untouched):

```
src/app/models/reports/shared.ts                    # + clockStatusFor / ClockStatus / CLOCK_GRACE_MINUTES
src/app/models/reports/EmployeePaymentReport.model.ts
src/app/controllers/Reports.controller.ts          # + 4 handlers + payroll parsers
src/app/routes/reports.routes.ts                   # + 4 routes, PAYROLL_READ pair
src/app/utils/types/reports.d.ts                   # + payroll DTOs
src/app/tests/models/EmployeePaymentReport.spec.ts  # 34 specs
src/app/tests/controllers/Reports.controller.spec.ts  # + 13 specs
```

| Route | Permission pair | Statements |
|---|---|---|
| `GET /employee-payments` | `view_reports` + `manage_employees` | 4 — page, whole-set summary, timeline, type split |
| `GET /employee-payments/:employeeId` | same | 3 — header+config+summary, one page of payments, period deductions |
| `GET /employee-payments/:employeeId/payments/:paymentId` | same | 1 — the associations of that payment (no range) |
| `GET /employee-payments/export` | same + `manage_reports` | **5**, fixed (contract 52) |

Query parameters: `start_date`, `end_date` (half-open, end date inclusive of the whole day),
`grouping` (`day|week|month|year`), `employee_type` (`all|doctor|nurse|other`), `employee_id`,
`search`, `page`, `page_size`, `sort`, `dir`. Sort whitelist:
`name | payments | base | extra | deductions | net`, default `net` **descending** — the list opens on
the largest net, and the first request, the header arrow and the server agree.

**Frontend**:

```
pages/Reports/types/employeePaymentReport.ts
pages/Reports/hooks/useEmployeePaymentsReport.ts      # fetchOnce (contract 48)
pages/Reports/hooks/useEmployeePaymentDetail.ts
pages/Reports/employeePayments/EmployeePaymentsTab.tsx
pages/Reports/employeePayments/EmployeePaymentDetailDialog.tsx
pages/Reports/employeePayments/PayrollCharts.tsx      # timeline + donut + snapshot slots
pages/Reports/employeePayments/payrollChartSnapshot.ts
pages/Reports/employeePayments/employeePaymentsColumns.tsx
pages/Reports/export/pdf/buildEmployeePaymentsReportPdf.ts
pages/Reports/export/csv/exportEmployeePaymentsCsv.ts
pages/Reports/components/StatusBadges.tsx             # + PayrollPaymentTypeBadge
pages/Reports/api.ts                                  # 4 calls + employeePaymentParams/SortParam
pages/Reports/ReportsPage.tsx                         # payments branch + canViewPayroll gate
pages/Reports/state/reportParams.ts                   # payroll grouping default = month
src/renderer/test/employeePaymentReportExport.spec.ts # 15 specs
```

`ReportsPage` renders `EmployeePaymentsTab` for `tab === "payments"` when `canViewPayroll`, and the
`TabPlaceholder blocked` variant otherwise — the tab is not merely empty without the pair, it is
explained.

### 12.2 Contracts that 6.11.5 added (continues §11.2)

51. **Clock status is one function, shared with the clock-in tab.** `clockStatusFor(timestamp,
    clockOut, shift)` in `models/reports/shared.ts` returns `on_time | late | early | incomplete`
    with `CLOCK_GRACE_MINUTES` applied, so "late" means the same thing in the payroll deduction table
    and in the clock-in report that follows. It needs the **raw** `timestamp` (`Date`) — passing
    `toTimestampString()` output makes every comparison a string comparison and every row `on_time`.
52. **The payroll export is five fixed statements, never one per employee.** Employee rows and both
    chart series, then the pay configuration, then every payment with its associations folded in via
    one `ANY(ids)` statement, then every deduction. The legacy `getEmployeePaymentReport` ran a query
    per employee; that is the regression this contract exists to prevent. The envelope `summary` is
    derived from the same `rows` by `summariseRows(rows)` — there is no second summary query, so the
    document cannot disagree with itself.
53. **Deductions are period-scoped, once per employee.** `EmployeeClockIn` rows in range with
    `pay_deduction > 0`, summed once and reported as an employee column and a detail table — **never**
    attributed to a payment. The legacy page recomputed them per payment over a rolling 30 days,
    which multiplied the same deduction by the payment count. Paid/unpaid are **gross**
    (`base + extra`); only `net` subtracts deductions, so the columns reconcile arithmetically.
54. **`getPaymentAssociations(employeeId, paymentId)` takes no range.** The associations belong to
    the payment, not to the window the report was generated with; adding a range would silently
    truncate the work behind a payment that straddles the boundary.
55. **A KPI strip with 7 or 8 cards must pass `xl:grid-cols-4` explicitly.**
    `ReportKpiStrip.gridColumnsFor` caps at five columns and appends `xl:grid-cols-5`, which
    `tailwind-merge` then re-adds over any caller class that does not name `xl`. An 8-card strip
    therefore rendered 5 + 3 with a short last row; passing `sm:grid-cols-2 lg:grid-cols-4
    xl:grid-cols-4` gives the intended 4 × 2. Found in the live EN screenshot, not by a unit test.
56. **Every export row's per-employee roll-up is `totals`** (contract 36, restated because payroll is
    the first tab with two levels of totals): `totals` per employee, `summary` only on the envelope.
    A reader must be able to tell a per-employee figure from a whole-set figure without reading code.

### 12.3 Deviations from the plan for this tab

| Plan | As built | Why |
|---|---|---|
| One 8-card KPI strip at `xl:grid-cols-8` | Two rows of four via `xl:grid-cols-4` | Eight currency cards at 1/8 width clip `EGP 49,890`; contract 55 |
| Deductions per payment | Period total, once per employee | The legacy bug (contract 53); also what `pay_deduction` actually means |
| `parseSort` asc default | `parseSort(..., "net", "desc")` — 4th arg added | A payroll list that opens on the alphabetically first employee hides the report's whole point |
| Payroll grouping default `day` | `month` (`defaultDraftForTab`) | 132 buckets over 2020→2030 instead of 4,018 points; the tab's first question is monthly |
| Detail dialog fetches its own list | Dialog reuses the generated range and pages its own payments table | Same shape as the nurse dialog; the list row already carries the employee id |
| `grouping` sent to the detail endpoint | Dropped | The dialog has no timeline; sending it would imply it did |
| Payment associations in the dialog body | Real `<tr>` sub-row via `DataTable`'s `expandedRowIds`/`renderExpanded`, cached in a `useRef<Map<paymentId, payload>>` | Reuses the table's expansion instead of a second table; the cache stops a re-expand from refetching |
| `PaymentTypeBadge` reused | `PayrollPaymentTypeBadge` | Payroll types (`salary`, `bonus`, `service`, …) share no values with patient payment types (`cash`/`credit`/`insurance`) |
| Currency with 2 decimals everywhere | EGP with **0** decimals in the list/KPI strip, 2 in the dialog and the PDF | Payroll figures are whole pounds on screen; the detail is where the fraction matters |

### 12.4 Verification

| Gate | Command | Result |
|---|---|---|
| Backend specs (payroll) | `$env:NODE_ENV="test"; npx jasmine --filter="employee payments"` | **47/47** (34 model + 13 controller), exit 0 |
| Backend specs (all reports) | `--filter="Reports"` / `--filter="ReportsController"` | **143/143** / **56/56** |
| API smoke (live) | `payroll-probe.cjs` | 200; `997 employees / 1,001 payments / base 49,850 / extra 50 / deductions 52 / paid 10 / unpaid 49,890 / net 49,848`; 132 month buckets |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | Only the 5 pre-existing `pages/Employees` errors (§6) |
| Lint | `npx eslint src/renderer/src/pages/Reports src/renderer/test/employeePaymentReportExport.spec.ts` | Clean |
| Renderer unit | `npx vitest run --config src/renderer/vitest.config.ts` | **70/70** (7 files; 15 in `employeePaymentReportExport.spec.ts`) |
| Bundle | `npm run build:renderer` | OK |
| i18n | `npm run check-i18n` | No new payroll key missing (only the pre-existing list) |

Live Playwright pass (**47/47**, Admin JWT, Express :3000 + Vite :5173, EN + AR):

- eight KPI cards present and laid out 4 × 2; both charts rendered (2 `recharts-surface` nodes);
  footer `TOTALS` equals the KPI strip; **no `NaN`**, **no `$`-prefixed amount**;
- the first list request is
  `…&grouping=month&page=1&page_size=25&sort=net&dir=desc` — one request per generated report;
- clicking a row opens the dialog with configuration, payments and clock-in deductions, and states
  "counted once for the whole period, not once per payment"; expanding a payment fires exactly one
  `200 /employee-payments/:id/payments/:pid` and shows the patient-work panel;
- CSV `employee-payments-report_2020-01-01_2030-12-31.csv` with `Summary` + `Employees` +
  `TOTALS` + the conditional sections, no `EGP`, no `$` amount;
- `Export PDF` → `200` on `/employee-payments/export`, no error toast; document verified in-page
  (`loadPdfMake` + `buildPdfShellDoc` + `employeePaymentsReportDocContent` → `getBuffer`):
  **36,371 bytes, header `%PDF-`**;
- employee type → `employee_type=doctor`, picker + search → `employee_id=…&search=a` round-trip
  through the URL and the list collapses to the one employee; a 2019 range shows
  "No Employee Payments" with no `NaN`;
- AR page `dir=rtl` with Arabic KPI and chart titles, **charts stay LTR**, no `NaN`, no `$` amount.

**Notes found during the pass:**

1. **`$` assertions must be `/\$\s?\d/`, not `includes("$")`.** The dev DB seeds hostile-looking
   employee names (`';print(chr(122)…)`, `#set($engine=…)`, `S${print(...)}`) to exercise escaping;
   a bare `$` check fails on the data, not on the formatting. The CSV writer quotes them correctly —
   verified by reading the downloaded file.
2. **The KPI strip rendered 5 + 3** at 1500 px width; see contract 55. Caught only by looking at the
   screenshot.
3. `getEmployeePaymentDetail` builds its params explicitly instead of destructuring-with-rest:
   `no-unused-vars` rejects the discarded `_grouping` / `_employeeId` bindings.

### 12.5 Continue here — 6.11.6 Clock-in

Plan §3.5.7 (contract), §5.6 (UX), §6.11.6 (gates). Reuse `clockStatusFor` (contract 51) — the tab
and the payroll deductions must agree on `late`/`early`/`incomplete`, and the raw `timestamp` must
reach it. The tab is the first with a **daily grid** (employee × day) rather than a flat list, so
decide the shape of the grid early: the plan's gate list asks for missing/incomplete days to be
visible, which a flat row-per-clock-in list cannot show. Exports stay English-only, the per-entity
roll-up is `totals` (contract 36), and the snapshot keys must be added to the `ChartAnimationContext`
path like `payroll-timeline` / `payroll-type`.

---

## 13. 6.11.6 — Clock-in report (as built)

### 13.1 What shipped

**Backend** (`/api/reports/clock-ins*`, additive; the legacy `/api/reports/employees/clock-ins*`
routes and the `/reports` HTML page are untouched until Phase 7):

| Route | Permission | Queries |
|---|---|---|
| `GET /clock-ins` | `view_reports` | **2** — eligible employees, all in-range clock-ins (+1 assignments query) |
| `GET /clock-ins/:employeeId` | `view_reports` | **3** — header, records page, assignments |
| `GET /clock-ins/export` | `view_reports` + `manage_reports` | **3** — no paging, no sort |

- `src/app/models/reports/ClockInReport.model.ts` — `ELIGIBLE_SQL` (needs clock-in **or** has a
  clock-in **or** has an assignment in range, and `hire_date <= range end`), `CLOCK_IN_SORT_KEYS`,
  `parseClockInSort`, `clockStatusFor` reuse, `eligibleDaysFor`, `buildRecords`, `summariseRows`,
  `buildCharts` (hours capped at 12 bars).
- `ReportsController.listClockIns` / `getClockInEmployee` / `exportClockIns` +
  `parseClockInFilters` / `parseClockInStatus` / `parseClockInSort`.
- DTOs in `src/app/utils/types/reports.d.ts`.

**Frontend** (`pages/Reports/`):

| Piece | File |
|---|---|
| Tab (filters, 8-card KPI strip, charts, table, footer, exports) | `clockIns/ClockInReportTab.tsx` |
| Detail dialog (identity, 8-card attendance strip, status filter, expandable records) | `clockIns/ClockInDetailDialog.tsx` |
| Columns (14, sortable ids mapped to server keys) | `clockIns/clockInColumns.tsx` |
| Charts + English snapshot surface | `clockIns/ClockInCharts.tsx`, `clockIns/clockInChartSnapshot.ts` |
| Hooks (list in the session cache, detail local) | `hooks/useClockInReport.ts`, `hooks/useClockInEmployee.ts` |
| Exports | `export/pdf/buildClockInReportPdf.ts` (landscape), `export/csv/exportClockInReportCsv.ts` |
| Types + query contract | `types/clockInReport.ts` |
| API | `api.ts` (`clockInParams`, `clockInSortParam`, `getClockIns`, `getClockInEmployee`, `exportClockIns`) |

**i18n** — `reports.clockInReports.{emptyTitle,emptyDescription,stats.*,charts.*,detail.*}`,
`reports.table.{shift,clockIns,avgPerDay,punctuality}`, `reports.enums.shiftType.{morning,night}`
(EN + AR). `reports.enums.shiftType` has exactly two keys because the `shift_type` enum has exactly
two values.

**Tests** — `Reports.clockIn.spec.ts` (25), `Reports.clockIn.controller.spec.ts` (13),
`src/renderer/test/clockInReportExport.spec.ts` (16).

### 13.2 Contracts that 6.11.6 added (continues 12.2)

| # | Contract |
|---|---|
| 56 | **An absence is a fact about a job, not about a person.** Missing days are synthesized only for employees who are `is_active` **and** `need_clock_in`; `eligibleDaysFor` returns 0 otherwise and `buildRecords` gates on both. A salaried doctor who never clocks in has zero absences, not thirty. |
| 57 | **Days are not sessions.** `clock_in_count` counts sessions, `worked_days` counts distinct dates, and `avg_hours_per_day` divides by the latter. `punctuality_rate`'s denominator excludes missing days — an absence is not an unpunctual arrival. Every surface (list, footer, detail, PDF, CSV) must keep the two apart. |
| 58 | **Missing days are arithmetic in aggregate, materialized only in detail.** List/export compute `eligibleDays − distinctWorkedDates`; only one employee's detail emits rows. The export passes `synthesizeMissing: false` and states the count in `attendanceSummary.missingDays` plus a sentence above the records table, so a reader does not add the column up and wonder. |
| 59 | **The clock-in sort is a comparator, never SQL.** Rows are aggregated in TS (the status rule lives in `clockStatusFor`), so `parseClockInSort` validates `CLOCK_IN_SORT_KEYS` and returns `{column, direction}`. The renderer map is `columnId → serverKey` and the two differ (`clockIns` → `clock_ins`), so guards test `Object.keys`, not `Object.values`. |
| 60 | **Detail `page_size` must be one of 10 / 25 / 50 / 100.** `parsePaging` rejects anything else with a 400; a dialog that asks for 15 renders an empty shell with "Could not load the details". |
| 61 | **Status slices carry semantic colours.** The donut's positional palette painted `missing` — the biggest and worst slice — in success green. `on_time` success, `late` warning, `early` info, `incomplete` tertiary, `missing` destructive, matching `AttendanceStatusBadge`. |
| 62 | **A horizontal bar chart needs `maxBarSize`.** With one or two categories Recharts stretches each bar across the whole plot, so the "specific employee" filter rendered a solid block. `GroupedBarChart` now takes an optional cap (40 px for the hours chart). |

### 13.3 Deviations from the plan for this tab

| Plan | As built | Why |
|---|---|---|
| Employee × day grid | One row per **employee**, with per-day status counts, plus a records table in the detail dialog | A grid over a year is 365 columns; the counts answer "who is absent" and the dialog answers "which days" |
| 8-card KPI strip at `xl:grid-cols-8` | Two rows of four via `xl:grid-cols-4` | Contract 55, same as payroll |
| Punctuality blended across the filtered set in the footer | Footer omits punctuality | The strip's rate is per employee; a whole-set blend would be invented |
| Export materializes absences | `synthesizeMissing: false` + a count | Contract 58: 27 zero-hour rows per employee bury the 4 real sessions |
| Detail page size 15 | 10 | Contract 60 — the server's allow-list |
| Assignment-only employees excluded | Included (0 sessions, 0 days) | They are the population whose attendance is being questioned; a zero row is the answer |

### 13.4 Verification

| Gate | Command | Result |
|---|---|---|
| Backend specs (clock-in) | `$env:NODE_ENV="test"; npx jasmine --filter="clock-ins"` | **38/38** (25 model + 13 controller) |
| Backend specs (all reports) | `--filter="Reports"` / `--filter="ReportsController"` | **168/168** / **69/69** |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | Only the 5 pre-existing `pages/Employees` errors (§6) |
| Lint | `npx eslint src/renderer/src/pages/Reports src/renderer/test/clockInReportExport.spec.ts` | Clean |
| Renderer unit | `npx vitest run --config src/renderer/vitest.config.ts` | **86/86** (8 files; 16 in `clockInReportExport.spec.ts`) |
| Bundle | `npm run build:renderer` | OK |
| i18n | `npm run check-i18n` | No new clock-in key missing (only the pre-existing list) |

Live Playwright pass (**62/62**, Admin JWT, Express :3000 + Vite :5173, EN + AR):

- the tab has no grouping field; the first list request is
  `…&page=1&page_size=25&sort=name&dir=asc` and sends `start_date`/`end_date`;
- eight KPI cards, both chart titles, footer `TOTALS` equal to the strip, **no `NaN`**, **no
  `$`-prefixed amount**, 2 rows, 2 `recharts-surface` nodes;
- clicking the `Hours` header sends `sort=hours` — the `columnId → serverKey` guard (contract 59);
- the dialog shows 8 attendance cards, the absence sentence
  ("102 days with no clock-in are counted above but are not listed as rows"), the status filter, and
  **disabled expanders on absence rows**; `status=incomplete` enables them and expanding a session
  shows the patient panel;
- CSV `clock-in-report_2026-01-01_2026-12-31.csv` (371 lines) with `Summary` + `Employees` +
  `TOTALS` + `Daily Records` + `Status Distribution` + `Hours by Employee`, no `EGP`, no `$`;
- `Export PDF` → `200`, no error toast; document verified in-page (`loadPdfMake` +
  `buildPdfShellDoc` + `clockInReportDocContent` → `getBuffer`): **38,963 bytes, header `%PDF-`**;
- a 2019 range shows "No clock-in records" in both charts and the table, with zeroed KPIs and no
  `NaN`;
- AR page `dir=rtl` with Arabic KPI and chart titles, **charts stay LTR**, no `NaN`, no `$`.

**Notes found during the pass:**

1. **`page_size=15` returned 400** and the dialog opened empty. Only visible by opening it — the
   specs never paginate. Contract 60.
2. **The donut painted `missing` green.** The default palette is positional, and the server's status
   order put `missing` fifth. Caught by looking at the screenshot, fixed with `STATUS_COLORS`
   (contract 61).
3. **One employee rendered as a solid blue block** in the hours chart. `maxBarSize` added to the
   shared `GroupedBarChart` (contract 62) — additive, so the other five report charts are unchanged.
4. **The dev DB cannot exercise the patient panel unaided.** The nurse has 340 sessions on 9 days and
   her five `DailyStaffAssignment` rows are in July/August, so no record has patients. The check
   inserts two assignment rows on one clock-in date and deletes them in a `finally`; the report itself
   never writes.
5. Absences and sessions disagree by design: the same nurse shows `340` clock-ins and `9` days, so a
   reader who assumes one row per day will think the footer is wrong. That is why contract 57 exists
   and why the CSV header spells out `Worked Days` next to `Clock-Ins`.

---

## 14. Quick reference — surface map (6.11.0 → 6.11.7)

| Surface | File |
|---|---|
| Page entry (lazy, `reports` namespace) | `src/renderer/src/App.tsx` → `pages/Reports/ReportsPage` |
| Patient tab (6.11.1) | `pages/Reports/patients/PatientReportTab.tsx` + `models/reports/PatientReport.model.ts` |
| Patient exports (index + per-admission sections) | `pages/Reports/export/pdf/buildPatientReportPdf.ts`, `export/pdf/patientReportSections.ts`, `export/csv/exportPatientReportCsv.ts` |
| Doctor tab (6.11.2) | `pages/Reports/doctors/DoctorReportTab.tsx` + `models/reports/DoctorReport.model.ts` |
| Doctor exports (distribution + index + per-doctor) | `pages/Reports/export/pdf/buildDoctorReportPdf.ts`, `export/csv/exportDoctorReportCsv.ts` |
| Doctor chart bitmap | `pages/Reports/doctors/DoctorDistributionChart.tsx` + `lib/chartSnapshot.ts` |
| Nurse tab (6.11.3) | `pages/Reports/nurses/NurseReportTab.tsx` + `models/reports/NurseReport.model.ts` |
| Nurse exports (distribution + index + per-nurse) | `pages/Reports/export/pdf/buildNurseReportPdf.ts`, `export/csv/exportNurseReportCsv.ts` |
| Nurse accordion + detail dialog | `pages/Reports/nurses/DailyAssignmentAccordion.tsx`, `nurses/NurseDetailDialog.tsx` |
| Nurse chart bitmap | `pages/Reports/nurses/NurseDistributionChart.tsx` + `nurses/nurseChartSnapshot.ts` |
| Statistics tab (6.11.4) | `pages/Reports/statistics/StatisticsReportTab.tsx` + `models/reports/StatisticsReport.model.ts` |
| Statistics charts + snapshot slots | `pages/Reports/statistics/StatisticsCharts.tsx` + `statistics/statisticsChartSnapshot.ts` |
| Statistics exports (8 chart+table sections) | `pages/Reports/export/pdf/buildStatisticsReportPdf.ts`, `export/csv/exportStatisticsReportCsv.ts` |
| Payroll tab (6.11.5) | `pages/Reports/employeePayments/EmployeePaymentsTab.tsx` + `models/reports/EmployeePaymentReport.model.ts` |
| Payroll detail dialog + payment expansion | `employeePayments/EmployeePaymentDetailDialog.tsx` |
| Payroll charts + snapshot slots | `employeePayments/PayrollCharts.tsx` + `employeePayments/payrollChartSnapshot.ts` |
| Payroll exports (summary → charts → index → per-employee) | `export/pdf/buildEmployeePaymentsReportPdf.ts`, `export/csv/exportEmployeePaymentsCsv.ts` |
| Clock-in tab (6.11.6) | `pages/Reports/clockIns/ClockInReportTab.tsx` + `models/reports/ClockInReport.model.ts` |
| Clock-in detail dialog + record expansion | `clockIns/ClockInDetailDialog.tsx` |
| Clock-in columns (14, `columnId → serverKey`) | `clockIns/clockInColumns.tsx` |
| Clock-in charts + snapshot slots | `clockIns/ClockInCharts.tsx` + `clockIns/clockInChartSnapshot.ts` |
| Clock-in exports (landscape summary → charts → index → per-employee) | `export/pdf/buildClockInReportPdf.ts`, `export/csv/exportClockInReportCsv.ts` |
| Shared clock status (`late`/`early`/`incomplete`) | `models/reports/shared.ts` (`clockStatusFor`, contract 51) |
| Shared report shell (+ large-export strip) | `pages/Reports/components/ReportShell.tsx` |
| Keyboard row activation (contract 63) | `src/renderer/src/components/common/DataTable.tsx` |
| Dialog `aria-modal` + focus restore (contract 64) | `src/renderer/src/components/ui/dialog.tsx` |
| Large-export threshold + server log (contract 65) | `ReportShell.tsx` (`EXPORT_ROW_WARNING_THRESHOLD`) + `controllers/Reports.controller.ts` (`warnIfLargeExport`, `countStatisticsExportRows`) |
| Session cache + in-flight dedupe | `pages/Reports/state/useReportSession.ts` (`read`/`write`/`clear`/`fetchOnce`) |
| Chart animation switch (contract 49) | `src/renderer/src/components/charts/chartAnimation.ts` + `ChartSnapshotSurface.tsx` |
| Chart bitmap capture (geometry wait) | `src/renderer/src/lib/chartSnapshot.ts` |
| URL + draft state (incl. `dist` view param) | `pages/Reports/state/useReportUrlState.ts`, `state/reportParams.ts` |
| Route permission | `src/renderer/src/lib/routes.ts` (`view_reports`) |
| Sidebar entry | `src/renderer/src/lib/navigation.ts` |
| API mount | `src/app/routes/api.routes.ts` → `reportsRoutes` at `/reports` **before** the legacy `reportRoutes` at `/reports` (five shared paths resolve to the new router, §16) |
| Legacy (untouched until Phase 7) | `src/app/views/reports/*`, `src/app/models/Report.model.ts`, `src/app/controllers/Report.controller.ts`, `src/app/routes/report.routes.ts` |
| Plan | `C:\Users\gamal\.opencode\plan\phase_6.11_plan.md` |
| This record | `.opencode/plans/phase_6.11_implementation.md` |

---

## 15. 6.11.7 — Hardening, i18n audit, documentation (as built)

Closes Phase 6.11. No new feature work: the tab code, models and exports are
unchanged except where the four audits below found something wrong.

### 15.1 What shipped

**i18n audit.** `npm run check-i18n:renderer` went from **1624 keys used / 42
missing / 1515 unused** to **1625 / 26 / 1201**.

- 149 dead `reports.*` keys were pruned from `reports.en.json` +
  `reports.ar.json` only (185-line diff each, CRLF + 2-space formatting
  preserved byte-for-byte, empty parent objects removed bottom-up).
- The 42 "missing" keys were **16 false positives + 26 pre-existing misses in
  other features**. The 16 were the doctor/nurse report-type option suffixes:
  the checker's static-key regex reads `labelKey: "…"` as a **complete** key, so
  a suffix like `allReferring` was reported missing while the real key was
  reported unused. Both option arrays now carry full keys
  (`reports.doctorReports.types.*`) and the call sites are `t(option.labelKey)`.
  Contract 66.
- The 26 remaining misses (`common.record`, `patients.*`,
  `medicalSupplies.*`, `employees.servicePrices`) belong to other features and
  were **documented, not fixed**.
- Legacy `src/app/views/locales/*.json` was **not** pruned. The legacy checker
  cannot see `showSuccess("reports.messages.…")` calls, so its unused list is
  unreliable there; that surface dies in Phase 7 anyway. Its 27/28 "missing"
  are 26 `${…}` template-literal artifacts plus `"{"` from `dashboard.html`.

**Accessibility.** Three fixes, each in one shared component rather than five
copies:

- `components/common/DataTable.tsx` — a clickable row is a control: `tabIndex=0`,
  Enter/Space activation, `focus-visible` inset ring. `role` stays `row`.
  Contract 63.
- `components/ui/dialog.tsx` — `aria-modal="true"`, plus capture of
  `document.activeElement` on open and restore on close. Radix only restores to
  a `DialogTrigger`, and every Reports dialog is opened by a table row, so
  closing used to drop focus on `<body>`. Contract 64.
- Verified unchanged: the chart `sr-only` table wrapper, labelled filter
  controls, Radix's roving tabindex (the **list** is the tab stop, every trigger
  is `-1` — that is correct, not a bug).

**Large-export warning.** Plan §3.7 requires a server log above 5,000 rows and a
UI warning; neither existed.

- Client: `ReportShell` gained an optional `exportRowCount` and renders a
  `role="status"` strip above the body when it exceeds
  `EXPORT_ROW_WARNING_THRESHOLD`. Each tab passes the rows its document will lay
  out — `payload.total` for the five entity reports,
  `payload.summary.totalClockIns` for clock-in (the document prints one record
  per **session**), and the sum of all seven series for statistics (it has no
  total).
- Server: `warnIfLargeExport(label, rowCount)` + `countStatisticsExportRows` in
  `reports.controller.ts`, called from all six `export*` handlers. It logs; it
  never truncates. Contract 65.
- i18n: `reports.state.largeExport` in both locales.

**Documentation.** `react_implementation_plan.md` §6.11 now carries an "As
built" block with the real endpoint list and the deviations from the original
sketch. Phase 7 checklist is in §15.5 below — **not executed**.

### 15.2 Contracts that 6.11.7 added (continues 13.2; 67–68 added by §16)

| # | Contract |
|---|---|
| 63 | **A clickable table row is a keyboard control.** `onRowClick` implies `tabIndex=0`, Enter/Space activation and a `focus-visible` ring. The handler must bail when `event.target !== event.currentTarget`, or pressing Enter on a button inside the row fires the row too. `role` stays `row` — a `<tr>` turned into a button loses the table semantics that make its columns readable. |
| 64 | **A dialog with no trigger must restore focus itself.** Radix restores focus to a `DialogTrigger`; every Reports dialog is opened by a row or a button inside one, so `DialogContent` captures `document.activeElement` on open and restores it on close, and sets `aria-modal`. A consumer's `onCloseAutoFocus` that calls `preventDefault` still wins. |
| 65 | **Exports are uncapped, so the warning is a threshold, not a limit.** `> 5000` (not `>=`), shared by the client strip and the server log. The count is *rows the document lays out*: sessions for clock-in, the series sum for statistics, the entity count elsewhere. Truncating would silently change a legal document. |
| 66 | **`labelKey` holds a full key.** The i18n checker's static-key regex reads `labelKey: "…"` as a complete key, so a bare suffix (`allReferring`) is reported missing while its real key is reported unused. Option arrays must carry `reports.<tab>.types.<suffix>` and call `t(option.labelKey)`. |
| 67 | **The reports router is mounted before the legacy one.** Both live at `/api/reports`; the five shared paths (`/patients`, `/patients/formatted`, `/doctors/referred`, `/doctors/attended`, `/nurses/attended`) resolve to the new controller. Reordering the mounts silently hands them back to the legacy controller, whose payload shapes the React code cannot read. |
| 68 | **A class name must exist in `@theme`.** `text-warning-dark` was never defined (only `--color-warning` and `--color-warning-light`), so three "warning" cells rendered with no colour at all. Semantic text on a `*-light` surface uses the base token (`text-warning`, design.md §4.1.3); Tailwind emits nothing for an unknown token, and no test catches it. |

### 15.3 Performance (dev dataset)

Measured with `pg.Pool.prototype.query` patched, so the counts are statements
actually issued, including the `Promise.all` groups. Single cold call each,
against the dev database (2 patients, 2 employees, 340 clock-in sessions, 997
payment rows).

| Surface | Statements | Latency | Documented |
|---|---|---|---|
| clock-ins list | **2** | 79 ms | 2 (+1 assignments) |
| clock-ins detail | **3** | 57 ms | 3 |
| clock-ins export | **3** | 5 ms | 3 |
| patients list | **2** | 4 ms | 2 |
| patients export | **5** | 7 ms | 5 |
| doctors list / export | **2 / 2** | 2 / 2 ms | 2 / 2 (+N when `include_admissions`) |
| nurses list / export | **2 / 4** | 1.5 / 3 ms | 2 / 4 |
| statistics (view and export) | **7 / 7** | 86 / 3 ms | 7 |
| employee payments list / export | **4 / 6** | 9 / 35 ms | 4 / 6 |

No N+1 anywhere: every "per row" section (patient admissions, doctor patients,
nurse assignments, payroll associations, clock-in records) is one statement
fetched with `ANY(ids)` and grouped in JS. The two slowest numbers are not SQL:
clock-in list aggregates 340 sessions × 102 synthesized days in TS (contract
51), statistics runs seven independent aggregates over the whole range.

Bundle split (`npm run build:renderer`):

| Chunk | Raw | Gzip |
|---|---|---|
| `ReportsPage-*.js` | 218.24 kB | 50.44 kB |
| `charts-*.js` (Recharts, shared by all charts) | 395.56 kB | 113.86 kB |
| `index-*.js` | 439.67 kB | 137.02 kB |

### 15.4 Verification

| Gate | Command | Result |
|---|---|---|
| Backend specs (all reports) | `$env:NODE_ENV="test"; npx jasmine --filter="ReportsController"` | **73/73** (69 + 4 new warning specs) |
| Backend specs (large export) | `--filter="large export warning"` | **4/4** |
| Backend types | `npx tsc -p ./src/app/tsconfig.json` | No `Reports.controller` / spec errors |
| Renderer unit | `npx vitest run --config src/renderer/vitest.config.ts` | **91/91** (9 files; +5 `reportShellExportWarning.spec.tsx`) |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | Only the 5 pre-existing `pages/Employees` errors (§6) |
| Lint | `npx eslint` on every touched file | Clean |
| Bundle | `npm run build:renderer` | OK |
| i18n (renderer) | `npm run check-i18n:renderer` | **1625 used / 26 missing / 1201 unused** — no Reports key missing, `largeExport` neither missing nor unused |
| i18n (legacy) | `npm run check-i18n:legacy` | 27/28 missing (26 template artifacts), 303/301 unused — nothing actionable, surface dies in Phase 7 |

Per-tab live gates, re-run after the accessibility changes (Admin JWT, Express
:3000 + Vite :5173, EN + AR):

| Tab | Checks |
|---|---|
| Clock-in | **62/62** |
| Employee payments | **47/47** |
| Statistics | **46/46** |
| Nurses | **35/35** |
| Doctors | **29/29** |

Those five scripts lived in the session temp folder and were lost when the
workspace was cleared, so the export-warning change was verified with one
consolidated gate instead (**89/89**): 6 tabs × 2 locales for raw-key / `NaN` /
`$`-amount / no-false-warning / heading, plus the a11y sweep (tablist, arrow
keys, row focus, Enter, Escape, focus return, `sr` tables, labelled controls,
AR dialog RTL, charts LTR) and the 12 report-type-select checks.

**Permission matrix (28/28)** — `GET`, cookie auth, four identities:

| Endpoint | Admin | `view_reports` | + `manage_reports` | none |
|---|---|---|---|---|
| `patients`, `clock-ins`, `options` | 200 | **200** | 200 | 403 |
| `patients/export`, `clock-ins/export` | 200 | **403** | 200 | 403 |
| `employee-payments` (+ `/export`) | 200 | 403 | **403** (needs `manage_employees`) | 403 |

**PDF/CSV spot check (16/16)**:

- `patient-report_2026-01-01_2026-12-31.csv` — 75 lines, sectioned, no `$`, no
  `NaN`;
- `clock-in-report_2026-01-01_2026-12-31.csv` — 367 lines, same checks;
- patient PDF **68,526 bytes**, `%PDF-1.3`, `pageOrientation: portrait`;
- clock-in PDF **145,708 bytes**, `%PDF-1.3`, `pageOrientation: landscape`;
- no error toast on either export.

Both PDFs were built in-page (`api.export*` → `*DocContent` →
`buildPdfShellDoc` → `getBuffer`) because `openPdfShellDoc` calls `doc.open()`,
which is a separate window, not a browser download — so there is no `download`
event to capture.

### 15.5 Phase 7 cleanup checklist — status after the post-6.11.7 pass

Run on 2026-11-13 with two constraints from the product owner: **the legacy
surface and its keys stay**, and the new API must live at `/api/reports` with no
`v2` segment anywhere. Steps 1 and 3 were therefore skipped; step 2 was
executed; the rest were verified. See §16 for what the rename changed.

| # | Step | Status |
|---|---|---|
| 1 | Delete the legacy reports surface | **Skipped by decision.** `src/app/views/reports/reports.html`, `views/js/reports/reports.ts`, `models/Report.model.ts`, `controllers/Report.controller.ts`, `routes/report.routes.ts` and the `/reports` page route all remain. |
| 2 | Unmount the legacy API / rename the mount | **Done.** The new router is mounted at `/api/reports` *before* the legacy one, so the new paths win. The legacy mount stays and is shadowed on the five shared paths. |
| 3 | Delete the legacy locale keys | **Skipped by decision.** `src/app/views/locales/{en,ar}.json` untouched. |
| 4 | Delete the dead renderer keys the checker cannot see | **Deferred.** 1,201 "potentially unused" keys remain, 804 outside `reports`. They are *not* provably dead — the checker cannot see template literals or `labelKey` indirection. Prune per namespace with a dynamic-prefix proof (the method used for the 149 reports keys), never by trusting the raw list. |
| 5 | Retire the dual reports test suites | **Done.** Specs renamed `Reports.*.spec.ts`; no legacy report spec existed to delete. |
| 6 | Move the plan records | **Done.** `C:\Users\gamal\.opencode\plan\phase_6.11_plan.md` copied to `.opencode/plans/phase_6.11_plan.md`. |
| 7 | Re-check the `$` guard | **Verified.** No `includes("$")` assertion anywhere; every "no dollar amount" check is `/\$\s?\d/`. Dev seed data contains names with `$`, `#set(...)` and `chr(...)`. |
| 8 | Do not "fix" the tab roving tabindex | **Verified, untouched.** `TabsList` is the single tab stop; every `TabsTrigger` is `tabindex="-1"`. |
| 9 | `AttendanceStatusBadge` and `STATUS_COLORS` must stay in sync | **Verified + one fix.** Both maps hold exactly `on_time`, `late`, `early`, `incomplete`, `missing`. The audit also found `text-warning-dark` — a token that does not exist in `@theme` — in `StatusBadges.tsx`, `patientColumns.tsx` and `AdmissionSection.tsx`; all three now use `text-warning` (design.md §4.1.3). |
| 10 | Keep the export warning threshold in one place per side | **Verified.** 5000 on both sides, strict `>`. |

### 15.6 Deviations from the plan for this subphase

| Plan | As built | Why |
|---|---|---|
| "Prune dead legacy report keys that are not used elsewhere" | Pruned **renderer** keys only; legacy left alone | The legacy checker cannot see `showSuccess("…")` calls, so its unused list is unreliable; that surface is deleted in Phase 7 |
| "Accessibility sweep: tables, dialogs, charts, focus, keyboard row activation, labels, RTL" | Fixed once in `DataTable` and `dialog.tsx` | Five dialogs and six tables share two components; per-tab copies would drift |
| "Confirm export row warning" (as a check) | Built it first — it did not exist | Plan §3.7 required it and no subphase had implemented it |
| Add missing edge-case specs | Added only the warning helpers (4 backend, 5 renderer) | Everything else was already covered; the 26 missing i18n keys belong to other features |
| Measure "list/detail latency with seeded large data" | Measured on the dev dataset, cold | Seeding 5,000+ rows would rewrite the shared dev DB; statement counts are the invariant that matters and they are exact |

**Notes found during the pass:**

1. **The checker's `labelKey` regex is a trap.** It reads a bare suffix as a
   full key, so the audit reported 16 missing keys and 16 unused keys that were
   the same 16 keys. Contract 66.
2. **Radix restores focus to `<body>` when there is no trigger.** Visible only
   by tabbing into a row, pressing Enter, closing, and tabbing again — the page
   scrolls to the top. Contract 64.
3. **`document.body.innerText` contains `"reports.Patient"`** — the subtitle
   ends with "…payroll reports." and the next tab label follows with no
   separator. Any "no raw key" assertion must require two dot-separated
   segments, or it fails on correct output.
4. **`openPdfShellDoc` never fires a `download` event.** A Playwright
   `waitForEvent("download")` on Export PDF hangs for the full timeout. Verify
   the PDF through `getBuffer()` instead (§15.4).
5. **`ReportShell` renders the warning strip even with no export handlers.** It
   keys off `exportRowCount`, not on `onExportPdf` — deliberate, so a tab cannot
   show a warning it cannot act on but also cannot *hide* a real one by
   forgetting a prop.

---

## 16. Post-6.11.7 — the `/v2` segment removed (as built)

Executed after 6.11.7 at the product owner's request: **no `v2` anywhere**, the
new API at `/api/reports`, and the legacy surface + keys kept. This supersedes
every `/api/reports/v2` path in §1–§15; the sections above were rewritten to the
new paths rather than left as dead references.

### 16.1 What changed

| Before | After |
|---|---|
| `router.use("/reports/v2", reportV2Routes)` | `router.use("/reports", reportsRoutes)` before `router.use("/reports", reportRoutes)` |
| `ReportV2.controller.ts` / `ReportV2Controller` | `Reports.controller.ts` / `ReportsController` |
| `reportV2.routes.ts` | `reports.routes.ts` |
| `utils/types/reportV2.d.ts` | `utils/types/reportsApi.d.ts` |
| `ReportV2.*.spec.ts` (7 controller + 7 model) | `Reports.*.spec.ts` |
| `003_report_v2_indexes.sql` | `003_reports_indexes.sql` |
| `db.helper.ensureReportV2Schema()` | `ensureReportsSchema()` |

`reportsApi.d.ts` is deliberately **not** `reports.d.ts`: that name already
belongs to the legacy wire types imported by `Report.model.ts` and
`Report.controller.ts`. The first rename attempt overwrote it (both are
`.d.ts`); it was restored from git and the 6.11 types moved to `reportsApi.d.ts`.
The seven `models/reports/*.model.ts` imports were repointed; the two legacy
imports were not.

### 16.2 Mount order and shadowing

`api.routes.ts` mounts `reportsRoutes` first, then `reportRoutes`. Both live at
`/api/reports`, so the new router wins where they overlap:

| Path | Now served by | Legacy page effect |
|---|---|---|
| `/patients` | new list | **broken** (payload shape differs) |
| `/patients/formatted` | new `/patients/:patientId` → 400 | **broken** |
| `/doctors/referred`, `/doctors/attended` | new `/doctors/:doctorId` → 400 | **broken** |
| `/nurses/attended` | new `/nurses/:nurseId` → 400 | **broken** |
| `/statistics/*`, `/employees/*`, `/summary`, `/admissions/*` | legacy (falls through) | works |

That is an explicit decision, not an oversight: the legacy files, page route and
locale keys stay until Phase 7, but the five shared paths are accepted as broken
rather than keeping a versioned namespace. Contract 67.

### 16.3 Verification

| Gate | Command | Result |
|---|---|---|
| Routing probe | `routing-probe.cjs` | **8/8** — new paths return the new envelope; `statistics/comprehensive`, `employees/clock-ins`, `summary` still 200 from the legacy controller; the three shadowed paths return the new 400 |
| Permission matrix + PDF/CSV | `permissions-and-exports.cjs` | **44/44** (patient CSV 76 lines, clock-in 367; patient PDF 68,649 B portrait, clock-in 145,708 B landscape) |
| Consolidated UI gate | `reports-6.11.7-check.cjs` | **89/89** |
| Backend specs | `--filter="ReportsController"` / `--filter="Reports"` | **73/73** / **241/241** |
| Renderer unit | `npx vitest run --config src/renderer/vitest.config.ts` | **91/91** |
| Backend types | `npx tsc -p ./src/app/tsconfig.json` | Only the pre-existing view/`toastr` errors |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | Only the 5 pre-existing `pages/Employees` errors |
| Lint | `npx eslint` on every touched file | Clean; the pre-existing `db.helper.ts` `no-explicit-any` errors remain (4-line rename only) |
| Build | `npm run build:renderer` | OK |
| i18n | `npm run check-i18n:renderer` | **1625 / 26 / 1201** — unchanged |

Stale compiled outputs (`dist-electron/app/tests/**/ReportV2.*.spec.js`, the old
controller and route JS) were deleted before the backend run. `tsc` never prunes
them, so without that step the old suites would run a second time against files
that no longer exist in source.

### 16.4 Notes

1. **`reports.d.ts` was already taken.** A blind "rename the type file" step
   destroys the legacy types; check the target name first. The new file is
   `reportsApi.d.ts`.
2. **The legacy page's breakage is limited to the five shadowed paths.** Its
   statistics, payroll, clock-in and summary tabs still work, which is why
   "keep the legacy surface" was affordable.
3. **`text-warning-dark` never existed.** The audit replaced it with
   `text-warning` in `StatusBadges.tsx`, `patientColumns.tsx` and
   `AdmissionSection.tsx`. Contract 68.
4. **The rename is filesystem-level.** Git sees the moves as deletes + adds;
   `git diff --find-renames` (or the commit summary) reconstructs them. Do not
   `git mv` a file onto an existing name — that is exactly how `reports.d.ts`
   was lost.

