# Phase 6.10 — Insurance Page Migration · Implementation Record

**Status:** complete (pending hands-on manual matrix run)
**Scope:** Replace the `ModulePlaceholder` at `src/renderer/src/pages/Insurance/InsurancePage.tsx` with the full Insurance module and its report pipeline.
**Backend:** untouched — the existing `/api/insurance-companies/*` router already covered every operation the page needs.
**Companion docs:** `phase_6.10_plan.md` (plan + decisions + §10/§11 defect logs), `react_implementation_plan.md` §6.10 (stale sketch), `design.md`, `phase_6.7-employees.md` (format reference).

---

## 1. What shipped

### 1.1 Two-view page

| View | Contents |
|------|----------|
| List (`/insurance`) | Card grid of companies (name, default price list, patient count), server-side pagination (`page`/`pageSize`), debounced name search (`q`), skeleton loading, "no companies" and "no search results" states. |
| Detail (`/insurance/:companyId`) | Company details card (name, contact info, price list, last cleared) with Edit / Payment / Report actions; eight-tile KPI strip with the post-clear-date caveat and payment-coverage %; Clear Balance + Payment History actions; patient cards with the current-admission block and per-patient report action; Back to List. |

The selected company lives in the URL rather than component state — deep-linkable, refresh-safe, browser-back friendly, and it gives the breadcrumb a real third level.

### 1.2 Dialogs (8)

| Dialog | Notes |
|--------|-------|
| `CompanyModal` | Add/edit: name (required ≤255), contact info (≤1000), default price list (lazy-loaded `Select`). |
| `PaymentModal` | Amount + covered period; defaults to the previous calendar month; from < to, to ≤ today. |
| `PaymentHistoryDialog` | Summary strip (count / total / average) + payment rows (amount, period, recorded by). |
| `ClearBalanceModal` | Clear date (≤ today) + irreversible-action warning; refreshes list and detail. |
| `ReportModal` / `PatientReportModal` | Thin wrappers over a shared options form (current month → today, drugs on, cleared items off). |
| `ReportDetailsModal` | Company report: summary grid, numbered patient groups with item tables + financial footers, cleared-payments table; PDF + CSV. |
| `PatientReportDetailsModal` | Patient report: single 4-column info grid, summary, per-admission cards with item tables + footers; PDF + CSV. |

### 1.3 Report engine (ported, not reinvented)

| Module | Purpose |
|--------|---------|
| `report/financials.ts` | `calculateFinancials` — per-bill category totals, scoped discount (percentage/absolute), scoped VAT applied to the post-discount overlap plus administrative expenses, net total. Verbatim `Bill.model.ts` semantics. |
| `report/groupItemsByPatient.ts` | Groups company-report items by patient; medical tests counted once per bill; `patientPaid`/`patientTotal` = **max** across the group (legacy quirk preserved). |
| `report/itemColumns.ts` | One column config for on-screen tables, CSV and PDF; item-name fallback chain (service → supply → drug). |
| `report/footerRows.ts` | `<tfoot>` rules (tests always; discount/admin/VAT only when non-zero; net; patient paid/outstanding). |
| `report/format.ts` | English-only export formatting (`en-GB` dates, grouped 2-dp money). |
| `print/pdfTheme.ts` | Palette, table widths, layout (borders + padding), header/body/summary/total cell factories. |
| `print/buildCompanyReportPdf.ts` | `companyReportDocContent` (pure) + `buildCompanyReportPdf` (shell wrapper). |
| `print/buildPatientReportPdf.ts` | `patientReportDocContent` (pure) + `buildPatientReportPdf`. |
| `print/exportItemsCsv.ts` | RFC-4180 CSV with BOM + summary preamble. |

### 1.4 Deliberate fixes over the legacy page

| Legacy behaviour | Implemented behaviour |
|------------------|----------------------|
| Add button gated on `manage_patients` | No per-button gate — the route already requires `manage_insurance`. |
| Report buttons always rendered; API 403'd without `manage_reports` | Report entry points gated on `hasPermission("manage_reports")`. |
| List cards showed "Last Cleared: N/A" and never showed contact info (list SQL omits both columns) | Both rows dropped from cards. **Detail view now fetches `GET /:id`**, so contact info and the real last-cleared date render. |
| `*` footnote reused `messages.reportNote` (unrelated copy) | Dedicated `statistics.postClearNote` + last-cleared date, plus `statistics.paymentCoverage`. |
| Stats labels borrowed `dashboard.metrics.admittedPatients` and `insurance.paymentHistory.paymentAmount` | Dedicated `statistics.currentAdmissions` / `statistics.patientPaidAmount` keys. |
| "No active admission" shown inside an *active* admission block | `patient.noDiagnosis` ("No diagnosis recorded"). |
| Gender rendered via `capitalizeFirst` (English only) | Localized `patient.gender.{male,female,other}`. |
| No pagination UI (default 25 silently truncated) and no search | `useListData` pagination + debounced `q` search. |
| Empty patients block used `loadPatientsError` as its copy | Proper `emptyPatients.{title,description}`. |

Preserved as-is (documented quirks): `patientPaid`/`patientTotal` max-per-group, cleared-items filtering semantics, no delete actions (the legacy never called the delete endpoints), and the unused `/:id/outstanding` endpoint left unwired.

---

## 2. File inventory

### 2.1 New — `src/renderer/src/pages/Insurance/` (35 files, ~5,180 lines)

```
api.ts                                  165
InsurancePage.tsx                       421
types/insurance.ts                      270
schemas/company.schema.ts                22
schemas/payment.schema.ts                34
schemas/report.schema.ts                 23
schemas/clearBalance.schema.ts           17
hooks/useInsuranceCompanies.ts           32
hooks/useInsuranceDetail.ts              83
hooks/useInsuranceReports.ts            112
components/InsuranceCard.tsx             73
components/InsuranceCardsGrid.tsx        59
components/CompanyDetailsCard.tsx       144
components/StatisticsKpiStrip.tsx       143
components/PatientCard.tsx              185
components/PatientsGrid.tsx              85
components/ReportTables.tsx             246
modals/CompanyModal.tsx                 261
modals/PaymentModal.tsx                 214
modals/PaymentHistoryDialog.tsx         192
modals/ClearBalanceModal.tsx            152
modals/ReportOptionsModal.tsx           233
modals/ReportModal.tsx                   37
modals/PatientReportModal.tsx            38
modals/ReportDetailsModal.tsx           326
modals/PatientReportDetailsModal.tsx    332
report/financials.ts                    162
report/groupItemsByPatient.ts            62
report/itemColumns.ts                    88
report/footerRows.ts                    114
report/format.ts                         34
print/pdfTheme.ts                       222
print/buildCompanyReportPdf.ts          240
print/buildPatientReportPdf.ts          299
print/exportItemsCsv.ts                  60
```

### 2.2 New — shared

| File | Lines | Purpose |
|------|-------|---------|
| `store/breadcrumbStore.ts` | 46 | Pathname-scoped breadcrumb label override. |
| `hooks/useBreadcrumbLabel.ts` | 25 | Detail pages publish their entity name for the last crumb. |

### 2.3 Modified

| File | Change |
|------|--------|
| `pages/Insurance/InsurancePage.tsx` | Placeholder (+462) replaced by the real page. |
| `App.tsx` | +8 — `/insurance/:companyId` route. |
| `components/layout/Breadcrumbs.tsx` | ±22 — honours the label override. |
| `lib/pdfShell.ts` | ±7 — footer page label moved to `common.pdfPage`. |
| `locales/insurance.{en,ar}.json` | +38 / +40 — new keys (see §4). |
| `locales/common.{en,ar}.json` | +1 each — `pdfPage`. |
| `locales/patients.{en,ar}.json` | −3 each — removed orphaned `pdfShelf`. |

---

## 3. API contract used (unchanged)

| Endpoint | Method | Permission |
|----------|--------|-----------|
| `/api/insurance-companies` | GET (`page`, `pageSize`, `q`) | authenticated |
| `/api/insurance-companies/:id` | GET | authenticated |
| `/api/insurance-companies` | POST | `manage_insurance` |
| `/api/insurance-companies/:id` | PUT | `manage_insurance` |
| `/api/insurance-companies/:id/patients` | GET | authenticated |
| `/api/insurance-companies/:id/payments` | GET / POST | `manage_insurance` |
| `/api/insurance-companies/:id/clear-balance` | POST | `manage_insurance` |
| `/api/insurance-companies/:id/statistics` | GET | `manage_insurance` |
| `/api/insurance-companies/:id/reports` | POST | `manage_reports` |
| `/api/insurance-companies/:id/patients/:patientId/reports` | POST | `manage_insurance` |
| `/api/price-lists` | GET | authenticated (company modal) |

Wire-shape handling worth remembering: list rows **omit** `contactInfo`/`lastClearedDate`; payments arrive with `paymentAmount` as a string (normalized in `api.ts`); statistics/report numbers are already coerced server-side.

---

## 4. i18n

New keys in the `insurance` namespace (EN + AR): `validation.contactInfoTooLong`, `toDateAfterFrom`, `toDateNotFuture`, `endDateAfterStart`, `clearDateNotFuture`; `statistics.currentAdmissions`, `patientPaidAmount`, `paymentCoverage`, `postClearNote` (interpolated `{{date}}`); `report.adminExpenses`, `vat`, `servicesDrugs`, `admissionTotal`, `dischargeDate`, `exportCsv`; `patient.noDiagnosis`, `registration`, `gender.{label,male,female,other}`; `messages.searchPlaceholder`, `searchEmpty`, `exportSuccess`; `emptyPatients.{title,description}`; `paymentHistory.average`.

Note: `patient.gender` changed from a string to an object (label + values); the label is referenced as `patient.gender.label`.

---

## 5. Post-review fixes

### 5.1 Breadcrumb third level

Detail view moved into the URL (`/insurance/:companyId`); the name is published through the new pathname-scoped override. Trail: `Dashboard / Insurance Companies / <company>`.

### 5.2 PDF totals rows clipped, text against the edge, off-palette

**Root cause (reproduced by rendering the real builders headlessly):** item tables combined `colSpan` totals rows with pdfmake width management; padding is added on top of declared widths, so the table grew past the 515 pt content box and the whole 6th column — every total — was clipped at the page edge (`Total Price` extracted as `Tot`).

**Fixes:** no `colSpan` (label in col 1, four empty banded cells, value in col 6); pdfmake-managed widths (`["*", "auto", …]`); cell padding 6/4; palette rebuilt to match the Vault PDF (`#0077B6` header + white text, `#0f172a` body, `#e2e8f0` 0.5 pt borders, zebra `#ffffff`/`#f8fafc`, bands `#f1f5f9`/`#e2e8f0`, print-weight semantic accents).

### 5.3 PDF footer printed `patients.pdfShelf.page`

The shell resolved the label from the **lazy** `patients` namespace, so exports started anywhere else printed the raw key. Moved to the baked `common.pdfPage`; removed the orphaned `patients.pdfShelf` block. Fixes the page label for every PDF in the app.

### 5.4 Patient info block

Two side-by-side 2-column tables (fixed widths, overflowed, values colliding) replaced by **one four-column table** `label § value § label § value` with `["auto", "*", "auto", "*"]`; the shorter half is padded with empty pairs so the grid stays rectangular.

---

## 6. Validation evidence

| Gate | Result |
|------|--------|
| `tsc -p src/renderer/tsconfig.json --noEmit` | No errors in any touched file. 4 pre-existing errors remain in `pages/Employees/*` (untouched by this phase). |
| `eslint src/renderer/src/pages/Insurance` (+ touched shared files) | Clean. |
| `npm run build:renderer` | Passes; `InsurancePage` chunk ≈ 92 kB (22.7 kB gzip), code-split. |
| `npm run test:renderer` | 7/7 pass. |
| `npm run check-i18n:renderer` | No missing/unused keys attributable to this work (pre-existing gaps in patients/supplies/employees remain). |
| Dev smoke (Express + Vite + Playwright) | App boots, `/insurance` → `/login` guard works, 0 console errors. |
| PDF render (pdfmake + PyMuPDF) | Totals asserted: `Medical Tests 50.00`, `10% Discount (services) -60.00`, `Administrative Expenses 20.00`, `14% VAT (all) 134.40`, `Net Total 1,094.40`, `Patient Paid 400.00`, `Outstanding 694.40`; complete `Total Price` header and item totals; multi-page patient break; pages rasterised and inspected. |
| PDF shell footer | `en → "Page 1 of 3"`, `ar → "صفحة 1 من 3"` (doc definition) and `Page 1 of 1` in a rendered PDF. |

**Not yet exercised:** the manual matrix from `phase_6.10_plan.md` §7 — permission matrix with real roles, report math against seeded production-like data, RTL pass over both views and all eight dialogs. These need hands-on credentials/data.

---

## 7. Known items / follow-ups

1. **Pre-existing type errors** in `pages/Employees` (`api.ts`, `PaymentsTable.tsx`, `EmployeesPage.tsx`, `EmployeeModal.tsx`) are on `HEAD`, unrelated to this phase — worth a separate fix-up.
2. **Vault files staged before this work** (`locales/vault.{en,ar}.json`, `Vault/components/DateRangeToolbar.tsx`, `Vault/dateRange.ts`) are unrelated to 6.10 and should be committed separately.
3. **`/api/insurance-companies/:id/outstanding`** stays unwired (dead in the legacy page too).
4. **No delete UI** — parity with the legacy page; the delete endpoints exist but were never called.
5. **Large report periods** render tables without virtualization (parity). If slow in practice, a follow-up can virtualize the details dialogs.

---

## 8. Commit message

```
feat(phase 6.10): insurance page migration (renderer)

Replace the Insurance module placeholder with the full two-view page and
its report pipeline, mapped onto the existing insurance API. No backend
changes.

Page
- Card-grid list with server pagination (page/pageSize) and debounced
  name search (q); skeleton, empty and no-results states.
- Detail view moved into the URL (/insurance/:companyId): company card,
  eight-tile KPI strip with the post-clear-date caveat and coverage %,
  patient cards with the current-admission block.
- Dialogs: add/edit company, record payment, payment history, clear
  balance, company report options/results, patient report options/results.
- Report actions gated on manage_reports on top of the route's
  manage_insurance.

Reports
- Ported calculateFinancials (per-bill scoped discount/VAT overlap,
  administrative expenses) and groupItemsByPatient (tests once per bill,
  max-per-group paid) from the legacy page.
- One ITEM_COLUMNS config drives the on-screen tables, CSV and PDF.
- PDFs rebuilt on lib/pdfShell; CSV export added; pure doc-content
  builders allow headless verification.

Breadcrumbs
- Pathname-scoped label override (store + useBreadcrumbLabel) so
  /insurance/:companyId renders Dashboard / Insurance Companies / <name>.

Fixes over legacy
- Detail card fetches GET /:id, so contact info and the last-cleared date
  actually render (the legacy reused the list row, which omits both).
- Statistics footnote no longer reuses the report-explanation copy;
  dedicated currentAdmissions/patientPaidAmount keys replace
  cross-namespace borrowings.
- "No active admission" no longer shown inside an active admission;
  localized gender labels; pagination and search UI added.

PDF defects found after review
- Totals values were clipped: colSpan plus width management overflowed
  the 515pt content box and pushed the value column off-page. Now plain
  six-cell rows with pdfmake-managed widths and 6/4pt cell padding.
- Patient info block is a single four-column label/value table.
- Shell footer printed patients.pdfShelf.page (lazy namespace). Moved to
  baked common.pdfPage and removed the orphaned block, fixing the page
  label for every PDF in the app.

i18n
- insurance namespace: new validation, statistics, report, patient-gender,
  search and export keys in EN and AR.

Validation
- tsc (renderer) clean for touched files; eslint clean for the module
- npm run build:renderer passes (InsurancePage ~92 kB, code-split)
- npm run test:renderer 7/7
- check-i18n:renderer clean for this work
- PDFs rendered headlessly and asserted (totals, palette, page label,
  multi-page breaks)

Notes: pre-existing tsc errors in pages/Employees are untouched; Vault
files staged before this work are unrelated and should land separately.
```
