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

### 8.7 Continue here — 6.11.3 Nurse report

> **Done — see §10** for what actually shipped and where it deviated. The plan below is kept as
> written before implementation.

Plan §3.5.4 (contract), §3.4 "Nurse queries" (SQL), §5.3 (UX), §6.11.3 (gates).

1. **Backend** — `models/reports/NurseReport.model.ts` (+ `utils/types/reportV2.d.ts` DTOs, controller, routes with `/nurses/export` → `/nurses/:nurseId` → `/nurses`):
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

**Backend (additive, under `/api/reports/v2/doctors`):**

| File | Role |
|---|---|
| `src/app/models/reports/DoctorReport.model.ts` | `buildPairsCte(relationship)` builds **one row per (doctor, patient, admission)** — that is what keeps every aggregate a plain `COUNT`/`SUM` with no fan-out. `FILTERED_CTE` applies range/doctor/search, `DOCTOR_AGG_CTE` rolls up per doctor. `listDoctors` = rows + summary (2 queries); `getDoctorDetail` = header + patient page + summary; `exportDoctors` = rows + summary (+ `getPairRefs` when `include_admissions`), then reuses `PatientReportModel.getPatientsByDoctor`'s admission/item/staff shapes. |
| `src/app/controllers/ReportV2.controller.ts` | `listDoctors`, `getDoctor`, `exportDoctors`, `parseDoctorFilters`. |
| `src/app/routes/reportV2.routes.ts` | `GET /doctors/export` → `/doctors/:doctorId` → `/doctors` (order matters). |
| `src/app/utils/types/reportV2.d.ts` | `DoctorReportSummary`, `DoctorReportRow`, `DoctorPatientRow`, `DoctorReportListResponse`, `DoctorReportDetailDTO`, `DoctorExportRow`, `DoctorReportExportPayload`. |

Sort maps: `DOCTOR_SORT_COLUMNS` (`name|patients|admissions|billed|paid`, default `name`) and
`DOCTOR_PATIENT_SORT_COLUMNS` (`name|admissions|billed|paid|last_admission`).

Specs: `ReportV2.doctor.spec.ts` (**29/29**) and `ReportV2.doctor.controller.spec.ts` (**12/12**);
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
| Backend controller specs | same, `--filter="ReportV2DoctorController"` | 12/12 |
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

**Backend (additive, under `/api/reports/v2/nurses`):**

| File | Role |
|---|---|
| `src/app/models/reports/NurseReport.model.ts` | `PAIRS_CTE` builds **one row per (nurse, patient, work_date)** straight from `DailyStaffAssignment` — its unique constraint means every aggregate is a plain `COUNT`/`SUM`, with no fan-out to dedupe. The range filters on `work_date`, so a 3-day stay inside a 1-day window counts only the days that fall inside it. Diagnosis comes from a `LATERAL` latest admission **overlapping** the range (not merely started inside it). `listNurses` = rows + summary (2 queries); `getNurseDetail` = header+summary (1 statement) + patient page + whole accordion; `exportNurses` = rows + summary, then every nurse's patients and days in two batched queries (**4 total**). |
| `src/app/controllers/ReportV2.controller.ts` | `listNurses`, `getNurse`, `exportNurses`, `parseNurseFilters`. |
| `src/app/routes/reportV2.routes.ts` | `GET /nurses/export` → `/nurses/:nurseId` → `/nurses` (order matters). |
| `src/app/utils/types/reportV2.d.ts` | `NurseReportSummary`, `NurseReportRow`, `NursePatientRow`, `NurseDailyAssignment`, `NurseReportListResponse`, `NurseReportDetailDTO`, `NurseExportRow`, `NurseReportExportPayload`. |

Sort maps: `NURSE_SORT_COLUMNS` (`name|patients|days|hours|last_work`, default `name`) and
`NURSE_PATIENT_SORT_COLUMNS` (`name|days|hours|last_admission`).

Specs: `ReportV2.nurse.spec.ts` (**19/19**) and `ReportV2.nurse.controller.spec.ts` (**9/9**).

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

Plan §3.5.5 (contract), §5.4 (UX), §6.11.4 (gates). Follow §10.2 and the 6.11.2/6.11.3 tab
recipes: a `StatisticsReport.model.ts` (grouping by day/month/year over admissions, payments and
supplies), `listStatistics`/`getStatistics`/`exportStatistics`, then a `StatisticsReportTab` that
reuses `GroupByField`, the KPI strip, the chart wrappers and `ChartSnapshotSurface`. Two things to
carry forward: exports are English-only, and every export row's per-group block is named `totals`
(contract 36), never `summary`.

---

## 11. Quick reference — surface map (6.11.0 + 6.11.1 + 6.11.2 + 6.11.3)

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
| Route permission | `src/renderer/src/lib/routes.ts` (`view_reports`) |
| Sidebar entry | `src/renderer/src/lib/navigation.ts` |
| API mount | `src/app/routes/api.routes.ts` → `/reports/v2` before `/reports` |
| Legacy (untouched until Phase 7) | `src/app/views/reports/*`, `src/app/models/Report.model.ts`, `src/app/controllers/Report.controller.ts`, `src/app/routes/report.routes.ts` |
| Plan | `C:\Users\gamal\.opencode\plan\phase_6.11_plan.md` |
| This record | `.opencode/plans/phase_6.11_implementation.md` |
