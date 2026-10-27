# Phase 6.11 — Reports & Analytics · Implementation Record

**Status:** 6.11.0 complete and verified · **6.11.1 (patient report) complete and verified, including the follow-up that makes both exports carry every admission (§8.5)** · 6.11.2–6.11.7 not started
**Scope:** Replace the React Reports placeholder with the full six-tab module **and** add a purpose-built `/api/reports/v2/*` backend. The legacy `/reports` HTML page and `/api/reports/*` endpoints remain untouched until Phase 7.
**Companion docs:** `C:\Users\gamal\.opencode\plan\phase_6.11_plan.md` (the approved plan: decisions, defect ledger, per-endpoint contracts, subphase breakdown, "as built" appendix), `react_implementation_plan.md` §6.11 (superseded), `design.md`, `phase_6.10_implementation.md` (report/PDF precedent).

> **If you are picking this phase up later:** read §3 (contracts) and §8 (continue here) first. Everything in §3 is load-bearing — later subphases must not invent parallel conventions.

---

## 1. What 6.11.0 shipped

The goal of the subphase was: a working `/reports` shell with URL state, tabs, filters, permission gates and not-generated states, plus every shared primitive the five remaining tabs need — with `/api/reports/v2/options` live.

### 1.1 Backend (new, additive)

| File | Role |
|---|---|
| `src/app/utils/billFinancials.ts` | Pure bill math: `calculateBillFinancials`, `normalizeScope`, `toMoneyNumber`, `roundMoney`, `BILL_CATEGORIES`. Ported verbatim from the old inline algorithm. |
| `src/app/models/Bill.model.ts` | `recalculateTotal` now fetches config + the three category subtotals in **one** query and delegates to the helper. Passes the **unrounded** total so `DECIMAL(15,2)` remains the rounder (identical behaviour to before). |
| `src/app/models/reports/shared.ts` | Validation + SQL-safety helpers (details in §3.2). |
| `src/app/models/reports/OptionsReport.model.ts` | All five picker lists; payroll list skipped entirely without `manage_employees`. |
| `src/app/controllers/ReportV2.controller.ts` | `getOptions`, `sendError`, `NotFoundError`, `userHasPermission`, `userHasAllPermissions`. |
| `src/app/routes/reportV2.routes.ts` | Mounted at `/api/reports/v2` **before** the legacy `/api/reports` router in `api.routes.ts`. |
| `src/app/utils/types/reportV2.d.ts` | Wire contracts for all six reports (options + patient + doctor + nurse + statistics + payroll + clock-in). Later subphases consume these types; only `*-options` are implemented so far. |
| `src/app/models/database/migrations/003_report_v2_indexes.sql` | Additive indexes, mirrored in `setUpDatabase.ts`: `EmployeePayment(employee_id, issued_timestamp) WHERE is_void = false`, `EmployeeClockIn(employee_id, clock_in)`, partial `pay_deduction > 0`, `Employee(need_clock_in, is_active)`. |

Tests: `billFinancials.spec.ts` (21 pure cases), `ReportV2.options.spec.ts` (options + `Bill.model` parity), `ReportV2.controller.spec.ts` (envelope, payroll filtering, admin bypass, 500 path, permission helpers).

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
await dbHelper.ensureReportV2Schema(); // beforeAll in every Reports v2 spec
```
It idempotently adds `Bill.discount_scope` / `Bill.vat_scope_custom` and the four report indexes. `HMS_test` may predate them.

`clearDatabase()` ordering fixed: `PriceList` is referenced by `Patient`, `PatientHistory`, `InsuranceCompany`, `ServicePrice`, `ShipmentPrice`, `MedicalSupplyShipmentPrice`, so it is now cleared **last**. Added `clearMedicalSupplyShipmentPrices()` and `clearDailyStaffAssignments()`.

### 2.2 `src/app/utils/setUpDatabase.ts`

A fresh install could not build its schema either — both fixed:
- `get_default_pricelist_id()` was declared before `PriceList`. An SQL-language function body is validated at creation time, so this failed with `relation "pricelist" does not exist`. Moved after the table.
- `ActivePatientService` referenced `PatientHistory` before it existed. Moved after `PatientHistory`.
- `Bill` now declares `discount_scope` / `vat_scope_custom` as an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (the columns previously only existed in `migrations/add_bill_scope_columns.sql`, so a fresh install's `recalculateTotal` would have failed).
- Report v2 indexes added to the index block.

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
  - detail: `{ summary, data, … }` (per-report shape in `reportV2.d.ts`)
  - export: `{ generated_at, range: { start_date, end_date }, summary, data }`
- **Errors:** `400 { error }` (validation), `403 { error: "Insufficient permissions" }`, `404`, `500`. Use `sendError(res, error, context)` from `ReportV2.controller.ts` — it maps `ReportValidationError`→400, `NotFoundError`→404, logs and returns a generic 500.

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
| All v2 read routes | `view_reports` |
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

For PDFs: render the chart again inside `ChartSnapshotSurface` with `locale="en-US"` and English labels, tag it with `ChartSnapshotSlot name="…"`, then `captureChartSnapshots(root)` at export time. Capture failure returns `undefined`; the PDF must still print the data table.

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
| Backend specs | `npx tsc -p ./src/app/tsconfig.json` then `npx jasmine --filter="Reports v2"` / `"ReportV2Controller"` | 9/9 and 7/7 |
| Renderer unit | `npx vitest run --config src/renderer/vitest.config.ts` | 26/26 (13 new) |
| Full backend suite | `npm test` | 415 specs, **33 failures — all pre-existing** (§6) |
| Bundle | `npm run build:renderer` | OK, `ReportsPage` chunk emitted |
| i18n | `node src/renderer/scripts/check-i18n.mjs` | No missing `reports.*`; EN/AR 332 = 332 |

Live check (Express + Vite + Playwright, Admin JWT cookie): EN and AR/RTL render; tab click writes `?tab=statistics&from=…&to=…&group=day&dist=payment`; Generate appends `run=1`; changing the date leaves the generated range in the URL and shows the stale banner; `GET /api/reports/v2/options` → 200 (admin: payroll populated; `view_reports`-only: `payroll_employees: []`); legacy `/api/reports/patients` still → 200.

Two UI defects found and fixed in that pass: the shadcn `TabsTrigger` styles `data-active` while Radix emits `data-state="active"` (active tab was invisible — fixed locally on the Reports strip), and the two dates inside the range button were bidi-reordered in Arabic (now isolated `dir="ltr"` runs).

---

## 5. Deviations from the plan

| Plan | As built | Why |
|---|---|---|
| Response keys snake_case | Confirmed snake_case (first pass mistakenly returned camelCase) | Consistency with every other endpoint; `lib/api` converts once |
| `TAB_META` / descriptors inside the page module | Moved to `state/tabMeta.ts` | `react-refresh` only tolerates component exports |
| `ReportOptionsDTO` declared in the model | Imported from `reportV2.d.ts` | One contract, no drift |
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

**Backend (all additive, under `/api/reports/v2`):**

| File | Role |
|---|---|
| `src/app/utils/nationalId.ts` | Egyptian national-ID parsing: `parseNationalId` → `{ birthDate, gender, valid }`; age derived from the **report end date**, not `today`, so historical reports stay stable. |
| `src/app/models/reports/PatientReport.model.ts` | `listPatients` (admissions CTE → per-patient aggregate → filters → whitelisted sort → `LIMIT/OFFSET` + a separate summary query), `getPatientDetail` (**3** queries: patient+admissions, all `BillDetail` rows for those bills, `DailyStaffAssignment` in range), `exportPatients` (**5** queries, see §8.5 — every row carries all of its admissions). |
| `src/app/controllers/ReportV2.controller.ts` | `listPatients`, `getPatient`, `exportPatients`; exports wrapped in `checkPermissions(["view_reports","manage_reports"])`. |
| `src/app/routes/reportV2.routes.ts` | Order matters: `/patients/export` → `/patients/:patientId` → `/patients`. |
| `src/app/utils/types/reportV2.d.ts` | `PatientReportListResponse`, `PatientReportRow`, `PatientReportDetail`, `PatientReportAdmission`, item/staff DTOs. |

Specs: `ReportV2.patient.spec.ts` (**27/27**) and `ReportV2.patient.controller.spec.ts` (**10/10**).

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
| Backend controller specs | same, `--filter="ReportV2PatientController"` | 10/10 |
| Renderer types | `npx tsc -p src/renderer/tsconfig.json --noEmit` | 5 errors, all pre-existing in `pages/Employees` (§6); none in Reports/lib |
| Lint | `npx eslint src/renderer/src/pages/Reports` | Clean |
| Renderer unit | `npm run test:renderer` | 26/26 |
| Bundle | `npm run build:renderer` | OK |
| i18n | key-diff script against `reports.{en,ar}.json` | `reports.*` missing = 0 in both |

Live Playwright pass (Admin JWT, Express :3000 + Vite :5173), EN and AR/RTL: not-generated state → generate → KPI/meta → sort asc→desc (server round trip) → search + Generate (URL write) → row click → detail dialog (identity, Admission 1, print buttons) → CSV download `patient-report_2026-01-01_2026-10-27.csv` (correct headers/rows) → stale banner → Arabic list + dialog with `dir=rtl`. **Zero console errors**; every `/api/reports/v2/*` call 200 with snake_case params; no per-row queries.

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

### 8.7 Continue here — 6.11.2 Doctor report

1. `models/reports/DoctorReport.model.ts` — **2 queries**: (a) per-doctor aggregate over `PatientHistory` joined to `Bill` and grouped by the doctor relationship (`referring` / `attending` / `supervising` via `DailyStaffAssignment`), (b) the detail/admissions query for the selected doctor. Reuse `parseDateRange` / `parseSort` / `parsePaging` / `likePattern` from `shared.ts`; reuse the admissions-CTE pattern in `PatientReport.model.ts`. If the doctor export must also carry admissions, reuse `attachAdmissions`'s `ANY(ids)` shape (§8.5, contract 13) — do not add a per-doctor query.
2. Routes `/doctors/export` → `/doctors/:doctorId` → `/doctors`; controller `listDoctors` / `getDoctor` / `exportDoctors`; export behind `manage_reports`.
3. Frontend: `doctors/DoctorReportTab.tsx` + `doctorColumns.tsx` + `DoctorDetailDialog.tsx`; copy the `usePatientReport` pattern (filter key, keep-previous payload, `generatedKey` paging) into `hooks/useDoctorReport.ts`; PDF/CSV under `export/`. The doctor picker filter already exists in `reportParams.ts`.
4. i18n: add only the keys the tab actually uses; verify parity with the key-diff script, not `check-i18n` alone (it truncates and misses template-literal keys).

---

## 9. Quick reference — surface map (6.11.0 + 6.11.1)

| Surface | File |
|---|---|
| Page entry (lazy, `reports` namespace) | `src/renderer/src/App.tsx` → `pages/Reports/ReportsPage` |
| Patient tab (6.11.1) | `pages/Reports/patients/PatientReportTab.tsx` + `models/reports/PatientReport.model.ts` |
| Patient exports (index + per-admission sections) | `pages/Reports/export/pdf/buildPatientReportPdf.ts`, `export/pdf/patientReportSections.ts`, `export/csv/exportPatientReportCsv.ts` |
| Route permission | `src/renderer/src/lib/routes.ts` (`view_reports`) |
| Sidebar entry | `src/renderer/src/lib/navigation.ts` |
| API mount | `src/app/routes/api.routes.ts` → `/reports/v2` before `/reports` |
| Legacy (untouched until Phase 7) | `src/app/views/reports/*`, `src/app/models/Report.model.ts`, `src/app/controllers/Report.controller.ts`, `src/app/routes/report.routes.ts` |
| Plan | `C:\Users\gamal\.opencode\plan\phase_6.11_plan.md` |
| This record | `.opencode/plans/phase_6.11_implementation.md` |
