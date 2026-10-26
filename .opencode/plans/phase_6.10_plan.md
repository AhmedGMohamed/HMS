# Implementation Plan — Phase 6.10: Insurance Page Migration

**Scope:** Replace the `ModulePlaceholder` at `src/renderer/src/pages/Insurance/InsurancePage.tsx` with the full Insurance module: two-view structure (company card list ↔ company detail), company CRUD modal, record-payment modal, payment-history dialog, clear-balance modal, and the two report flows (company insurance report + per-patient report) with on-screen grouped tables, PDF export via `lib/pdfShell`, and CSV export. **No backend changes.**
**Target:** React 19 + Vite + Tailwind v4 + shadcn/ui + react-hook-form + Zod + react-i18next.
**Companion docs:** `react_implementation_plan.md` §6.10 (sketch is stale — see Decision #1), `design.md`, `phase_6.7-employees.md` (format reference), `phase_6.8_plan.md` / Vault 6.9 implementation (report-dialog + KPI-strip + print/CSV patterns).
**Legacy source:** `src/app/views/insurance/insurance.html` (576 lines), `src/app/views/js/insurance/insurance.ts` (4,142 lines), backend `insurance.controller.ts` / `Insurance.model.ts`.

---

## 1. Architectural Decisions Summary

| # | Topic | Decision |
|---|-------|----------|
| 1 | Umbrella plan §6.10 sketch | **Treat as stale.** The sketch's "coverage type, discount rate, AR+EN company name" fields do not exist anywhere in the legacy page or backend. Actual editable fields: `name` (required, ≤255), `contactInfo` (optional textarea, ≤1000), `pricelistId` (optional default price list). Migrate the actual fields. |
| 2 | Two-view structure | **Replicated (user decision).** List view (company card grid) ↔ detail view (Company Details card + Statistics & Actions card + Patients card). The selected company lives in the **URL** (`/insurance/:companyId`): deep-linkable, refresh-safe, breadcrumb-addressable, and the browser back button returns to the list. The legacy had no URL state; the detail view is a full work view, not a Sheet. |
| 3 | Permission gating | Page route already `manage_insurance` (`routes.ts` + `page.routes.ts` aligned). Add/Edit/Payment/Clear-Balance buttons render unconditionally on the page (page guard covers `manage_insurance`). **Report buttons (company + per-patient) render only when `hasPermission("manage_reports")`** — fixes the legacy gap where the buttons rendered for users whose `manage_insurance` lacked `manage_reports` and the generate call 403'd. |
| 4 | Statistics KPI strip | **Kept (user decision).** Detail view renders the legacy's 8 stat metrics as a KPI strip (EditorialKpiCard/StatCard row, 6.9 Vault pattern), with the `*` post-clear-date caveat surfaced as a proper info note (new i18n key — see §6). |
| 5 | Report rendering | **On-screen grouped tables + PDF via shared `lib/pdfShell` (user decision).** Report Details dialogs render the legacy patient-grouped/admission-grouped tables as React tables; "Print Report" ports the legacy pdfmake docDefinitions to `openPdfShellDoc(...)` (English-only labels, en-GB dates — legacy parity). CSV export added per Vault 6.9 pattern (`toCsv` + `exportItemsCsv`). |
| 6 | Financial engine | Port `calculateFinancials` verbatim to a pure module `report/financials.ts` (per-bill category totals, scoped discount, scoped VAT, proportional VAT-discount overlap, admin expenses) — exact `Bill.model.ts` semantics. Unit-identical outputs; the same engine feeds both report dialogs and both PDFs. |
| 7 | Patient grouping | Port `groupItemsByPatient` verbatim to `report/groupItemsByPatient.ts`: group by `patientName`, medical-tests summed **once per unique `billId`**, `patientPaid`/`patientTotal` = **max** across the group's items (legacy quirk — a patient with several bills shows the largest bill's paid/total; replicate for parity), items sorted by `serviceDate` ascending. |
| 8 | List data fetching | `useListData<InsuranceCompanySummary>` (server pagination: `?page=&pageSize=`, `PaginatedResponse` envelope) + server-backed search input wired to `?q=` (endpoint supports it; legacy had **no search UI**). `DataTablePagination` added — legacy fetched with default `pageSize=25` and had **no pagination UI**, silently hiding companies past 25. |
| 9 | Card content fix | Legacy cards render "Last Cleared: N/A" always and a contact-info row never (the **list** SQL selects only `insurance_id, name, pricelist_id, pricelist_name, patient_count` — no `contact_info`/`last_cleared_date`). Cards drop both dead rows; they show name, price list, patient count + "View details" hint. |
| 10 | Delete actions | **None (parity).** The legacy UI never calls `DELETE /api/insurance-companies/:id` or `DELETE /:id/payments/:paymentId` (endpoints exist but are dead). No delete UI in React; delete-confirm i18n keys already in the locale file stay unused. |
| 11 | Payment modal defaults | `paymentFrom` = first day of previous month, `paymentTo` = last day of previous month (legacy `new Date(y, m-1, 1)` → `new Date(y, m, 0)`). Validation: from < to, to ≤ today. |
| 12 | Report modal defaults | Company + patient report modals default to current-month start → today; `includeDrugs` default **checked**, `includeClearedItems` default **unchecked**. |
| 13 | Clear-balance modal | Default clear date = today; Zod refine max = today; warning alert text = `messages.clearBalanceWarning`; success refreshes list + current detail (statistics + patients). |
| 14 | Patient card admission block | Diagnosis shows `diagnosis ?? "No diagnosis recorded"` (new key). Legacy rendered "No active admission" *inside* an active-admission block when `diagnosis` was null — nonsensical; fixed. Everything else on the card is parity (status badge, gender icon + localized gender, phone, card ID, form ID, registration date, admission date/total/tests/outstanding with zero-highlight). |
| 15 | Gender labels | Localized per-gender keys added under `insurance.patient.gender.{male,female,other}` — do **not** reference the `patients` namespace (lazy namespaces are independent; cross-namespace keys break when `patients` isn't loaded). |
| 16 | Data fetching pattern | Established renderer pattern: hand-rolled `useState`/`useEffect` hooks + `nonce` refresh; detail view fetches statistics + patients with `Promise.all` on selection (legacy parity). Reports fetch on demand via a `useInsuranceReport`/`usePatientReport` open/close hook (Vault `useVaultReport` pattern); data clears when the details dialog closes. |
| 17 | i18n | `useEnsureNamespace("insurance")` + lazy `insurance` namespace (split locale files already exist from the 6.0 prep). New keys listed in §6; `npm run check-i18n:renderer` must pass. |
| 18 | Testing | Backend: none (no backend changes; existing Jasmine suite untouched). Frontend: no unit tests (deferred); gates = `npm run typecheck`, `npm run lint`, `npm run check-i18n:renderer`, manual matrix incl. RTL + permission matrix. |

### 1.1 Backend API Contract (existing — no changes)

| Endpoint | Method | Permission | Purpose |
|----------|--------|-----------|---------|
| `/api/insurance-companies` | GET | auth (any user) | Paginated list. Query: `?page=&pageSize=&q=` (name ILIKE). Returns `{ data, total, page, pageSize }`; rows: `insurance_id, name, pricelist_id, pricelist_name, patient_count` (ordered by name). |
| `/api/insurance-companies/:id` | GET | auth | Full row incl. `contact_info`, `last_cleared_date`, `pricelist_name`, `patient_count`. 404 if missing. |
| `/api/insurance-companies` | POST | `manage_insurance` | Create (`name` required ≤255; `contact_info` ≤1000; `pricelist_id?` validated). 201 `{ data }`. |
| `/api/insurance-companies/:id` | PUT | `manage_insurance` | Partial update (dynamic SQL; same validation; `last_cleared_date` accepted but never sent by this page). 404 if missing. |
| `/api/insurance-companies/:id` | DELETE | `manage_insurance` | Hard delete. **Unused by this page (Decision #10).** Model 500s "Cannot delete insurance company with existing patients" if referenced. |
| `/api/insurance-companies/:id/patients` | GET | auth | Patients with this insurance, active-first then name; each with `current_admission` (open `PatientHistory` + `Bill` money fields) or `null`. |
| `/api/insurance-companies/:id/payments` | GET | `manage_insurance` | All payments for the company (`added_by_username` joined), newest first. Also accepts `?insurance_id=` globally (unused). |
| `/api/insurance-companies/:id/payments` | POST | `manage_insurance` | Create payment `{ payment_amount > 0, payment_from, payment_to }`; from < to; to ≤ now; stamps `added_by_user_id` from token. 201. |
| `/api/insurance-companies/:id/payments/:paymentId` | DELETE | `manage_insurance` | Delete payment. **Unused by this page (Decision #10).** |
| `/api/insurance-companies/:id/clear-balance` | POST | `manage_insurance` | `{ clear_date }` (≤ now) → sets `last_cleared_date`. Returns updated company. |
| `/api/insurance-companies/:id/reports` | POST | `manage_reports` | Insurance report `{ start_date, end_date, include_drugs?, include_cleared_items? }` (start < end). Returns `InsuranceReportSummary`. |
| `/api/insurance-companies/:id/statistics` | GET | `manage_insurance` | `{ totalPatients, activePatients, totalAdmissions, currentAdmissions, totalBilled, totalPaid, totalOutstanding, totalInsurancePayments, netOutstanding, paymentCoveragePercentage }` (financials cover charges after `last_cleared_date`). |
| `/api/insurance-companies/:id/outstanding` | GET | `manage_insurance` | `{ outstanding_amount }` for `?start_date=&end_date=` (post-clear outstanding in period). **Unused by this page** — statistics + report summary already surface outstanding. Not wired. |
| `/api/insurance-companies/:id/patients/:patientId/reports` | POST | `manage_insurance` (UI gates `manage_reports`) | Patient report `{ start_date, end_date, include_drugs, include_cleared_items }`. Patient must belong to the company (else error). Returns `PatientReportSummary` with per-admission `items[]` + flat `items[]`. |
| `/api/price-lists` | GET | auth | For the company modal's price-list Select (reuse `listPriceLists` from `@/pages/PriceLists/api`). |

### 1.2 Wire-shape notes (camelCase after `lib/api.ts` `toCamel`)

- **Company:** `insuranceId, name, contactInfo?, pricelistId?, lastClearedDate?, pricelistName?, patientCount`. **List rows omit `contactInfo`/`lastClearedDate`** (Decision #9).
- **InsurancePatient:** `patientId, name, nationalId, gender ("male"|"female"|"other"), phone?, insuranceCardId?, insuranceFormId?, paymentType, isActive, registrationDate, currentAdmission?: { patientHistoryId, admissionTime, diagnosis?, billId, totalAmount, paidAmount, medicalTestsAmount, outstandingAmount }`.
- **Statistics:** all numbers (model `parseInt`/`parseFloat`); `paymentCoveragePercentage` is 0–100.
- **InsurancePayment:** `paymentId, insuranceId, paymentAmount, paymentFrom, paymentTo, addedByUserId, issuedTimestamp, addedByUsername?`. **`paymentAmount` may arrive as a JSON string** (pg `NUMERIC` passthrough on the payments endpoints — the model does not coerce) → coerce with `Number()` in the hook, same class of fix as 6.6's bigint counts.
- **InsuranceReportSummary:** `insuranceId, insuranceName, reportPeriod { startDate, endDate }, lastClearedDate, totalServicesCost, totalDrugsCost, totalSuppliesCost, totalMedicalTestsCost, totalCost, totalPatientPayments, outstandingAmount, patientCount, items[], clearedPayments[]`.
- **ReportItem (flat):** `patientId, patientName, insuranceCardId?, insuranceFormId?, admissionTime, dischargeTime?, billId, serviceId?, serviceName?, drugShipmentId?, drugName?, medicalSupplyShipmentId?, medicalSupplyName?, itemType ("service"|"drug"|"supply"), quantity, unitPrice, totalCost, serviceDate, saleType, patientPaidAmount, patientTotalAmount, medicalTestsAmount, discount, discountType ("percentage"|…), discountScope: string[], vatPercentage, vatScopeCustom: string[], administrativeExpenses` — numeric fields pre-coerced by the model; `serviceDate`/`admissionTime` serialize as ISO strings.
- **PatientReportSummary:** adds `patientId, patientName, patientInfo { nationalId?, gender, phone?, insuranceCardId?, insuranceFormId?, registrationDate }, admissions[]` — each admission: `patientHistoryId, admissionTime, dischargeTime?, diagnosis?, billId, totalAmount, paidAmount, outstandingAmount, medicalTestsAmount, discount, discountType, discountScope, vatPercentage, vatScopeCustom, administrativeExpenses, items[]`; plus the same totals as the company report and a flat `items[]`.
- Item display name: `serviceType === "service" ? serviceName : itemType === "supply" ? medicalSupplyName : drugName` (fallback `"-"`).

---

## 2. File Layout

All files under `src/renderer/src/pages/Insurance/` (replace placeholder). Conventions: `"use client"` header doc comments, module style matching Vault/Clocking (tabs), Zod messages = i18n keys, sonner toasts, `ApiError`-first error messages.

```
Insurance/
├── InsurancePage.tsx                 # Composition root: list view ↔ detail view switch,
│                                     # PageHeader (title + Add action), all modal wiring
├── api.ts                            # listCompanies (paginated), getCompany, createCompany,
│                                     # updateCompany, listCompanyPatients, listCompanyPayments,
│                                     # createPayment, clearBalance, getStatistics,
│                                     # generateCompanyReport, generatePatientReport
├── types/insurance.ts                # Wire types (§1.2), payloads, date-range + report types
├── schemas/
│   ├── company.schema.ts             # name required ≤255; contactInfo ≤1000; pricelistId optional
│   ├── payment.schema.ts             # amount > 0; from/to required; from < to; to ≤ today
│   ├── report.schema.ts              # start/end required; start < end; include flags
│   └── clearBalance.schema.ts        # clearDate required; ≤ today
├── hooks/
│   ├── useInsuranceCompanies.ts      # useListData-backed: rows, q-search state, refresh
│   ├── useInsuranceDetail.ts         # statistics + patients, Promise.all, per-company cache bust
│   └── useInsuranceReports.ts        # on-demand company/patient report fetch (open/close)
├── components/
│   ├── InsuranceCard.tsx             # Card: icon, name, price list, patient count, hint
│   ├── InsuranceCardsGrid.tsx        # Responsive card grid + skeletons
│   ├── CompanyDetailsCard.tsx        # Details + Edit/Payment/Report footer actions
│   ├── StatisticsKpiStrip.tsx        # 8 KPI cards + post-clear info note + action buttons
│   ├── PatientCard.tsx               # Patient summary card + current-admission block
│   └── PatientsGrid.tsx              # Patients section (count in header, Back to List)
├── modals/
│   ├── CompanyModal.tsx              # Add/Edit (name, contact info, price list Select)
│   ├── PaymentModal.tsx              # Record payment (amount, period from/to)
│   ├── PaymentHistoryDialog.tsx      # Summary strip + payment list
│   ├── ClearBalanceModal.tsx         # Clear date + warning
│   ├── ReportModal.tsx               # Company report options (dates + include flags)
│   ├── ReportDetailsModal.tsx        # Company report: summary grid + patient groups +
│   │                                 # cleared payments table; Print (PDF) + Export CSV
│   ├── PatientReportModal.tsx        # Patient report options
│   └── PatientReportDetailsModal.tsx # Patient report: info section + summary +
│                                     # per-admission cards; Print (PDF) + Export CSV
├── report/
│   ├── financials.ts                 # calculateFinancials port (per-bill, scoped d/VAT)
│   ├── groupItemsByPatient.ts        # Company-report patient grouping port
│   └── itemColumns.ts                # Shared item-table columns (on-screen + CSV/PDF)
└── print/
    ├── buildCompanyReportPdf.ts      # Port of legacy printReport docDefinition
    ├── buildPatientReportPdf.ts      # Port of legacy printPatientReport docDefinition
    └── exportItemsCsv.ts             # Vault toCsv pattern for the flat item list
```

**Wiring (no new route work needed):** `routes.ts` + `breadcrumbs.ts` already carry `/insurance`; `App.tsx` already lazy-imports `pages/Insurance/InsurancePage` (the placeholder file is replaced in place). Sidebar entry already present.

---

## 3. UX Decisions (design.md pass)

- **List view:** `PageHeader` ("Insurance Companies Management", Add action) + server search input + card grid (`InsuranceCard`, `min-w` responsive grid like PriceLists) + `DataTablePagination` under the grid. Empty state uses `EmptyState` with an Add CTA; loading = skeletons (never spinners).
- **Detail view:** two-column top row — `CompanyDetailsCard` (description list: name, contact info, price list, last cleared) and `StatisticsKpiStrip` (8 `StatCard`s + note + Clear Balance / Payment History actions) — then the Patients section card with count badge and Back-to-List. Breadcrumb resolves `/insurance` (already wired).
- **Modals:** sectioned per design.md §6.3 (labels, `(optional)` markers, inline Zod validation, focus-first-invalid, busy state on submit buttons, Esc/overlay cancel).
- **Report dialogs:** `modal`-sized with scrollable body (`max-h-[70vh] overflow-auto`), sticky footer actions (Close / Print / Export CSV). Tables: `Badge` for item type (service=success, supply=info, drug=primary), `tabular-nums` right-aligned money columns, `tfoot` summary rows with emphasis.
- **KPI strip:** currency metrics formatted with the shared `formatCurrency`; `netOutstanding` colored red/green by sign (parity); `*` markers carried onto the four post-clear metrics with the corrected explanatory note (§5 #4).
- **RTL:** logical spacing only (`ps/pe`, `text-start/end`); no `[dir=rtl]` overrides; Sheet/Dialog default from shadcn are RTL-safe.
- **a11y:** buttons ≥44px targets in the card grids; report tables get `scope`d headers; dialogs trap focus (shadcn default); `prefers-reduced-motion` respected (no card `fade-in`-style JS animations — CSS transitions only).

---

## 4. Implementation Steps

1. **Types + api.ts** — wire types per §1.2; `api.ts` wrappers (list with `page/pageSize/q`, detail, CRUD, patients, payments, clear-balance, statistics, two report POSTs). Coerce `paymentAmount: Number()` in `listCompanyPayments`.
2. **Schemas** — four Zod schemas (§2) with i18n-key messages; date-order and not-future refinements.
3. **Hooks** — `useInsuranceCompanies` (useListData + `q` state, debounced), `useInsuranceDetail` (parallel stats+patients, `refresh` busts per company), `useInsuranceReports` (on-demand open/close for both report kinds, loading/error, clear-on-close).
4. **List view** — `InsurancePage` skeleton with view-switch state; `InsuranceCard`/`InsuranceCardsGrid` (Decision #9 content), search field, pagination, EmptyState, skeletons.
5. **Company modal** — add/edit; price-list Select from `listPriceLists`; on save: toast, refresh list; if editing from detail view also refresh detail. Payment + clear-balance modals; success refreshes statistics (+ list for clear-balance).
6. **Detail view** — `CompanyDetailsCard`, `StatisticsKpiStrip` (8 KPIs + note + actions), `PatientsGrid`/`PatientCard` (current-admission block per Decision #14; Generate Patient Report button gated on `manage_reports`).
7. **Payment history dialog** — fetch on open; summary strip (count / total / average); payment list (amount, recorded date, period range, recorded-by); empty state.
8. **Report engine ports** — `report/financials.ts` (calculateFinancials) + `report/groupItemsByPatient.ts` + `report/itemColumns.ts` (shared column config for on-screen tables, CSV, PDF).
9. **Company report** — `ReportModal` (dates + flags) → fetch → `ReportDetailsModal` (summary grid with discount/admin/VAT/net/patient-payments/outstanding + S/D breakdown; numbered patient-group cards with items tables and tfoot rows: medical tests, conditional discount (w/ % + scope), conditional admin, conditional VAT (w/ % + scope), net total, patient paid, colored outstanding; cleared-payments table when present; "no data" empty state; Print → `buildCompanyReportPdf` via `openPdfShellDoc`; Export CSV).
10. **Patient report** — `PatientReportModal` (patient banner + dates + flags) → fetch → `PatientReportDetailsModal` (patient-info section; summary; per-admission cards with their items tables and the same tfoot logic; Print → `buildPatientReportPdf`; Export CSV).
11. **PDF + CSV exports** — port both legacy docDefinitions into the shared shell (title/period header, patient/admission sections, page-break-per-patient in the company PDF, English-only labels, en-GB dates); `exportItemsCsv` for both reports.
12. **i18n** — add keys (§6) to `insurance.{en,ar}.json`; run `npm run check-i18n:renderer`.
13. **Validation** — gates below; fix fallout; commit as one phase commit (`Phase 6.10 Insurance backend-free renderer migration`).

---

## 5. Legacy bugs / gaps not replicated

| # | Legacy behavior | React behavior |
|---|-----------------|----------------|
| 1 | Header Add button gated `data-requires-permission="manage_patients"` (wrong permission; API needs `manage_insurance`) | No per-button gate needed — page is already `manage_insurance`-gated. |
| 2 | Report buttons always rendered; generate 403'd for users without `manage_reports` | Buttons gated on `hasPermission("manage_reports")` (Decision #3). |
| 3 | Cards show "Last Cleared: N/A" always; contact row never renders (list endpoint omits both fields) | Both rows dropped from cards (Decision #9). |
| 4 | Statistics `*` footnote renders `messages.reportNote` (the report-explanation text) which does not explain `*` | New key `statistics.postClearNote` explaining the post-clear caveat + last-cleared date; coverage % relabeled `statistics.paymentCoverage`. |
| 5 | Stats labels borrow `dashboard.metrics.admittedPatients` (current admissions) and `insurance.paymentHistory.paymentAmount` (total paid) | Dedicated keys `statistics.currentAdmissions` + `statistics.patientPaidAmount` (no cross-namespace lazy issues). |
| 6 | "Services / Drugs" breakdown label hardcoded English in the on-screen report | Localized key `report.servicesDrugs` on screen; PDFs remain English-only (parity with Vault). |
| 7 | Active-admission block shows "No active admission" when `diagnosis` is null | Shows `diagnosis ?? "No diagnosis recorded"` (new key `patient.noDiagnosis`). |
| 8 | Gender displayed via `capitalizeFirst` (English-only) | Localized `patient.gender.{male,female,other}` keys. |
| 9 | No pagination UI (default `pageSize=25` silently truncates) + no search | `useListData` pagination + debounced `q` search (Decision #8). |
| 10 | Payment-history "average" divides by count after the empty-check (safe) | Same math, `Number()`-coerced; zero-state handled before rendering. |

Everything else is parity, including: `patientPaid`/`patientTotal` max-per-group quirk (Decision #7), report-date ordering errors surfacing server messages, unused `/:id/outstanding` endpoint left unwired, and no delete actions (Decision #10).

---

## 6. i18n plan (`src/renderer/src/locales/insurance.{en,ar}.json`)

Existing namespace already covers most UI (fields, buttons, modals, validation, messages, statistics, patient, report, paymentHistory — verified in both languages). **Add:**

| Key | EN | AR |
|-----|----|----|
| `insurance.statistics.currentAdmissions` | Admitted Patients | المرضى المقيمون |
| `insurance.statistics.paymentCoverage` | Payment Coverage | نسبة التغطية |
| `insurance.statistics.postClearNote` | Figures marked * cover charges after the last cleared date ({{date}}). | الأرقام المعلّمة بـ * تغطي الرسوم بعد تاريخ آخر تسوية ({{date}}). |
| `insurance.report.adminExpenses` | Administrative Expenses | المصاريف الإدارية |
| `insurance.report.vat` | VAT | ضريبة القيمة المضافة |
| `insurance.report.servicesDrugs` | Services / Drugs | الخدمات / الأدوية |
| `insurance.report.admitted` | Admitted | مُقيم |
| `insurance.report.dischargeDate` | Discharged | تم التخريج |
| `insurance.report.patientsCount` | patient(s) | مريض |
| `insurance.report.itemsCount` | items | عنصر |
| `insurance.patient.noDiagnosis` | No diagnosis recorded | لا يوجد تشخيص |
| `insurance.patient.gender.male` | Male | ذكر |
| `insurance.patient.gender.female` | Female | أنثى |
| `insurance.patient.gender.other` | Other | آخر |
| `insurance.patient.registration` | Registration | تاريخ التسجيل |
| `insurance.validation.endDateAfterStart` | Start date must be before end date. | يجب أن يكون تاريخ البدء قبل تاريخ الانتهاء. |
| `insurance.validation.toDateAfterFrom` | From date must be before to date. | يجب أن يكون تاريخ البدء قبل تاريخ الانتهاء. |
| `insurance.validation.clearDateNotFuture` | Clear date cannot be in the future. | لا يمكن أن يكون تاريخ التسوية في المستقبل. |
| `insurance.report.exportCsv` | Export CSV | تصدير CSV |

Keys **not** added: delete-confirm strings (unused — Decision #10), legacy cross-namespace keys (`dashboard.metrics.*`, `vault.fields.*`, `insurance.paymentHistory.paymentAmount` reuse for total-paid — replaced by Decision #5 keys). `check-i18n:renderer` must pass both directions.

---

## 7. Validation gates & manual matrix

**Gates:** `npm run typecheck` · `npm run lint` · `npm run check-i18n:renderer` · manual smoke via `npm run dev` (Vite + Express on :3000).

**Manual matrix:**

| Area | Checks |
|------|--------|
| Permissions | Role A: `manage_insurance` only → page loads, Report buttons hidden. Role B: `+ manage_reports` → both report flows open. Non-granted user → redirected from `/insurance`. |
| List | Empty state → Add CTA opens modal; search filters by name (server `q`); pagination beyond 25 companies; card click opens detail; back to list preserves scroll/page. |
| CRUD | Create (name required; 255 cap; price-list optional); edit pre-fills; validation errors inline; success toasts; price-list Select shows all lists. |
| Payments | Defaults (prev month); from ≥ to blocked; future to blocked; amount ≤ 0 blocked; success updates statistics strip; history dialog shows count/total/average + rows. |
| Clear balance | Default today; future blocked; warning shown; success refreshes statistics + list; note date updates. |
| Company report | Current-month defaults; flags toggle; generate shows grouped tables; tfoot math (tests/discount/admin/VAT/net/paid/outstanding) matches legacy for a seeded company; cleared-payments table; empty-data state; PDF opens with header/footers/page breaks; CSV downloads. |
| Patient report | Defaults; generate for a company patient; per-admission cards + totals; patient-info section; PDF + CSV. |
| RTL | Both views + all 8 dialogs under Arabic: logical spacing, aligned money columns, badges, dialogs. |
| Regression | Dashboard/Vault unaffected; `check-i18n` legacy suite still green; Electron build still packages (`npm run build`). |

---

## 8. Risks / open items

- **Report item volume:** large periods can return thousands of grouped rows; tables render virtualization-free (parity), CSV/PDF handle full sets. If slow in practice, follow-up phase can virtualize the details tables.
- **`paymentAmount` string coercion** must happen before any math (statistics totals come pre-numbered from the model; only the payments list is raw).
- **`outstanding` endpoint** intentionally unwired (dead in legacy too); revisit if a future phase needs period-scoped outstanding on demand.
- **PDF parity** is the largest port (~600 lines of legacy docDefinition); visual diffs vs legacy PDFs are expected only in shell chrome (brand header/footer from `pdfShell` replaces the legacy inline footer).

---

## 10. PDF defect fix (totals rows + margins + palette)

Reported after the first implementation: totals values (admission / medical tests / net total / …) were missing from the generated PDFs, text sat against the page edge, and the colours didn't match the other reports.

**Root cause (verified by rendering the real builders headlessly with pdfmake + PyMuPDF):** the item tables used `widths: ["*", "auto", …]` **together with `colSpan` totals rows**. pdfmake's column sizing counts cell padding on top of the declared widths, so the table grew past the 515pt content box and the whole 6th column — which holds every total — was clipped at the page edge (the `Total Price` header even truncated to `Tot` in the extracted text). So all three symptoms were one layout overflow.

**Fixes:**

| Area | Change |
|------|--------|
| Widths | Switched every table to pdfmake-managed widths (`["*", "auto", …]`, no fixed sums). The star column absorbs the remainder, so the table can never exceed the content box — the same strategy the working Vault report uses. |
| Totals rows | Dropped `colSpan` entirely: label in column 1, four empty banded cells, value in column 6. |
| Patient info block | Replaced the two side-by-side tables with **one four-column table** (`label § value § label § value`) using `["auto", "*", "auto", "*"]`: pdfmake sizes the label columns to their content and splits the remainder between the two value columns, so the block cannot overflow. Values left-aligned; the shorter half is padded with empty pairs so the grid stays rectangular. |
| Spacing | Cell padding 6/4 (was pdfmake's 4/4) plus section spacing, so text no longer sits on the table/page edge. |
| Palette | New `print/pdfTheme.ts` mirrors the Vault PDF palette: `#0077B6` header with white bold text, `#0f172a` body, `#e2e8f0` 0.5pt borders, `#ffffff`/`#f8fafc` zebra, `#f1f5f9`/`#e2e8f0` totals bands. Semantic accents use the print-weight dark ends of the `danger`/`success`/`warning` tokens (`#B91C1C`/`#047857`/`#B45309`) — the UI tokens fall to ~2:1 contrast at 8pt. |
| Pure content builders | `companyReportDocContent` / `patientReportDocContent` are exported separately from the `openPdfShellDoc` wrappers so the layout can be rendered and asserted headlessly. |

**Verification:** rendered both reports from the real builders with mock data covering scoped discount + VAT + admin expenses and asserted the extracted text contains `Medical Tests: 50.00`, `10% Discount (services): -60.00`, `Administrative Expenses: 20.00`, `14% VAT (all): 134.40`, `Net Total: 1,094.40`, `Patient Paid: 400.00`, `Outstanding: 694.40`, plus a complete `Total Price` header and item totals. Pages were also rasterised and inspected visually (multi-page patient break included).

---

## 11. PDF footer page label

The shared shell footer printed the literal key (reported as `patients.pdfShell.page`; the actual key is `patients.pdfShelf.page`) on exports started from Insurance (and Vault).

**Cause:** `lib/pdfShell.ts` resolved `t("patients.pdfShelf.page")`, which lives in the **lazy** `patients` namespace. Only pages that load `patients` could resolve it; every other module printed the raw key.

**Fix:** moved the label to the always-baked `common` namespace — new `common.pdfPage` (`"Page {{current}} of {{total}}"` / `"صفحة {{current}} من {{total}}"`) and `pdfShell.ts` now calls `t("common.pdfPage", …)`. Removed the now-orphaned `patients.pdfShelf` block from both patient bundles (it had exactly one consumer). This repairs the footer for every PDF in the app, not just insurance.

**Verification:** built the real shell document with an i18next instance initialised from the shipped locale files and read the footer node back — `en → "Page 1 of 3"`, `ar → "صفحة 1 من 3"`. `check-i18n:renderer` no longer reports either key as missing or unused.

---

## 9. Implementation notes (as built)

Deviations / additions relative to §2, recorded after implementation:

| Item | Note |
|------|------|
| `components/ReportTables.tsx` | **Added.** `ReportSummaryGrid` + `ReportItemsTable` shared by both details dialogs (they were inline in §2's sketch). |
| `report/footerRows.ts` | **Added.** `buildItemFooter` lives here rather than in `ReportTables.tsx` so the file only exports components (`react-refresh/only-export-components`). |
| `report/format.ts` | **Added.** `formatEnGbDate` / `formatEnGbDateTime` / `formatMoneyEn` for the English-only exports. |
| `modals/ReportOptionsModal.tsx` | **Added.** Shared options form; `ReportModal` + `PatientReportModal` are thin wrappers (avoids duplicating ~130 lines). |
| Detail view data | `useInsuranceDetail` also fetches `GET /:id`. The legacy detail view reused the **list** row, whose SQL omits `contact_info` / `last_cleared_date` — so it never showed contact info and always printed "N/A" for last cleared. Fetching the full row fixes it (extends Decision #9 to the detail card). |
| Card interactivity | `InsuranceCard` uses `<Card role="button" tabIndex={0}>` + Enter/Space handling instead of wrapping the card in a `<button>` (block content inside a button is invalid HTML). |
| Detail load failure | Shows an inline destructive `Alert` with a Refresh action instead of leaving the skeleton up indefinitely. |
| `useInsuranceCompanies` | Supplies the shared `PaginatedFetcher.params` stub (the type requires it; the controller reads page/pageSize/search from its own state). |
| Locale shape change | `insurance.patient.gender` became an object (`label` + `male`/`female`/`other`) so labels and values are both available; the label is referenced as `insurance.patient.gender.label`. |
| Breadcrumb (3rd level) | Detail view moved to `/insurance/:companyId` (new `<Route>` in `App.tsx`; `routes.ts` prefix-matching already applies `manage_insurance`, `navMatch` already highlights the sidebar entry). The trail is `Dashboard / Insurance Companies / <company name>`. Static `lib/breadcrumbs.ts` only sees the path, so the name is published via a new pathname-scoped override: `store/breadcrumbStore.ts` + `hooks/useBreadcrumbLabel.ts`, consumed by `Breadcrumbs.tsx` (it replaces the last crumb's `breadcrumb.detail` label only while the recorded pathname matches). Reusable by other entity detail routes (e.g. `/patients/:id`). |
| Malformed detail URL | `/insurance/not-a-number` renders `<Navigate to="/insurance" replace />` instead of an empty detail shell. |
