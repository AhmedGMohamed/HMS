# Implementation Plan — Phase 6.11: Reports & Analytics

**Status:** proposed (ready for implementation)
**Scope:** Replace the React `ReportsPlaceholder` with the full Reports module **and** add a purpose-built v2 reporting API (set-based SQL, server pagination, on-demand detail, dedicated exports). The legacy `/reports` HTML page and `/api/reports/*` endpoints stay untouched until Phase 7.
**Target:** React 19 + Vite + Tailwind v4 + shadcn/ui + Recharts v3 + react-i18next; Express 5 + PostgreSQL + Jasmine.
**Companion docs:** `react_implementation_plan.md` §6.11 (stale sketch — this document supersedes it), `design.md`, `phase_6.9_plan.md`, `phase_6.10_plan.md`.
**Legacy source:** `src/app/views/reports/reports.html` (773 lines), `src/app/views/js/reports/reports.ts` (8,972 lines), `src/app/views/css/reports.css` (25.6 KB), `src/app/models/Report.model.ts` (94.7 KB), `src/app/controllers/Report.controller.ts` (1,357 lines), `src/app/routes/report.routes.ts`, `src/app/utils/types/reports.d.ts`.
**Backend source of truth to preserve:** `Bill.model.ts` (`Bill.total_amount` is the recalculated final total), `PatientHistory`, `BillDetail`, `DoctorPatientHistory`, `DailyStaffAssignment`, `EmployeePayment`, `EmployeePaymentPatient`, `EmployeeClockIn`.

---

## 1. Locked decisions

| # | Decision |
|---|----------|
| D1 | **Full backend redesign** in a new additive `/api/reports/v2/*` namespace. Legacy routes remain until Phase 7. |
| D2 | Page IA = **six tabs with URL state**. Tab, generated range, grouping, and the active tab's filters are deep-linkable. |
| D3 | **Explicit Generate per tab.** Filter edits mark results stale; results are never silently refetched by a date change. Pagination/sort/search after generation may refetch with the generated params. |
| D4 | Patient report = **summary + drill-down**. Patient list/table → detail dialog with admission accordions and item tables. No stacked-cards page. |
| D5 | Permissions: page = `view_reports`; **exports** (and detail-print actions) additionally require `manage_reports`. |
| D6 | Payroll tab requires **`view_reports` + `manage_employees`** (server enforces both; the tab is hidden otherwise). |
| D7 | Every report supports **PDF + CSV**. Statistics gets a PDF (KPI + chart snapshots + data tables) and **one sectioned CSV**. |
| D8 | PDFs are **English-only** (en-GB dates, English labels), matching Vault 6.9 / Insurance 6.10. The UI stays bilingual. |
| D9 | List endpoints are **paginated**; nested detail is fetched on demand. No full-report payloads in the list path. |
| D10 | **Dedicated export endpoints** return the full unpaginated dataset; the client builds PDF/CSV. |
| D11 | Patient report is **patient-centric**; money uses `Bill.total_amount` (authoritative final total incl. discount/VAT/admin), not raw subtotals. |
| D12 | Doctor reports have **three relationships** (referred / attended / supervised) plus the missing **All Supervising Doctors** option. |
| D13 | Nurse report days are **range-scoped**; daily assignments are included; nurses with no assignments in range are excluded from "all". |
| D14 | Clock-in missing days are synthesized **only from max(range start, hire date) to min(range end, today)** and only for active employees. No weekend/holiday assumptions (no schedule source exists). |
| D15 | Payroll deductions are **period-scoped once per employee**; payments are gross. No per-payment deduction attribution (no period columns). |
| D16 | The dead **Occupancy Rate** KPI is removed. |
| D17 | Statistics shows **Billed, Collected, Outstanding** (both billed and collected KPIs), plus patients/admissions/discharges. |
| D18 | PDF charts are **rasterized from the on-screen Recharts components** (hidden English snapshot surface), not drawn from scratch. |
| D19 | New **shared chart wrappers** under `components/charts/` (multi-line, grouped/stacked bar, dual-axis composed, generalized donut + token palette). |
| D20 | v2 backend gets **Jasmine model + controller specs** using the existing test DB helper. |
| D21 | No hard schema changes are required. Additive indexes only (see §3.8). |

---

## 2. What we are replacing — complete legacy inventory

### 2.1 Shared shell (legacy)

- One page (`reports.html`) with a global filter card: start date, end date, group-by, quick buttons Today / This Week / This Month.
- Six Bootstrap tabs: Patient, Doctor, Nurse, Statistics, Employee Payments, Clock-In.
- One global loading modal; toastr for success/error; print buttons disabled until a load succeeds; locale change re-renders the current report.
- Default range = first of current month → today, computed with `toISOString()` (UTC off-by-one bug).
- Group-by is only used by Statistics; other tabs ignore it.
- `reports.css` uses physical margins; `reports-rtl.css` is referenced but missing.

### 2.2 Patient reports (legacy lines 568–2374)

**Endpoints**
| Endpoint | Permission | Use |
|---|---|---|
| `GET /api/reports/patients?start_date&end_date&payment_type&insurance_id` | `view_reports` | On-screen data (`getPatientReports`). Returns full admissions, services, drugs, supplies, daily staff, computed financial fields. |
| `GET /api/reports/patients/formatted?...&patient_id` | `manage_reports` | PDF data (`getPatientReportFormatted`) with `items_by_date` groups. |
| `GET /api/reports/admissions/:admissionId/formatted` | `manage_reports` | Single-admission PDF. |

**On-screen features**
- Filters: payment type (all/cash/credit/insurance), insurance company (shown only for insurance), Generate.
- 4 summary cards: total patients, total bill, total paid, total outstanding.
- Per-patient card: name, patient ID, national ID, age + birth date derived from Egyptian national ID, payment-type badge, gender badge, phone, address, insurance company, referring doctor, total bill/paid/outstanding, admission history.
- Per-admission block: admission ID, admission/discharge (or Active), diagnosis, base total, discount (percentage + scope), admin expenses, VAT (percentage + scope + admin), final total, paid, outstanding; daily staff per day (doctors + nurses + hours); services, drugs, supplies item lists; medical tests.
- Print buttons: per patient, per admission, whole report.
- Empty states; toast success/error.

**PDF**
- Summary table (name, gender, age, payment type, billed, paid, referring doctor).
- Page break per patient; patient info table; admission sections; items table with type/date/qty/unit/total; totals rows (base, discount, admin, VAT, final, paid, outstanding); daily staff table.
- Single-admission PDF: patient info, admission details, items table (finances hidden), daily staff.
- English labels, en-GB dates, generated-on footer.

### 2.3 Doctor reports (legacy lines 2375–3710)

**Endpoints**
| Endpoint | Permission |
|---|---|
| `GET /api/reports/doctors/referred`, `/attended` | `view_reports` |
| `GET /api/reports/doctors/:doctorId/referred`, `/attended`, `/supervised` | `view_reports` |
| `GET /api/reports/patients/formatted?...&patient_id` | `manage_reports` (used by single-doctor PDF only) |

**Features**
- Report type select: All Referring, Specific Referring, All Attending, Specific Attending, Specific Supervising. Doctor picker filtered by `doctor_type` (referring; attending + outside; supervising).
- On-screen: total doctors + total patients summary; per-doctor cards with patient table (name, national ID, gender, age, payment type, admissions, total billed, total paid) and totals row.
- Pie chart of patients per doctor when >1 doctor (hardcoded heading, no empty state).
- PDF: all-doctors → pie image + summary table (doctor, type, patients, %) + page break per doctor + patient table; single doctor → patient summary table + per-patient admission details, each patient fetched separately from `/patients/formatted`.

### 2.4 Nurse reports (legacy lines 3711–4884)

**Endpoints**
| Endpoint | Permission |
|---|---|
| `GET /api/reports/nurses/attended`, `/nurses/:nurseId/attended` | `view_reports` |
| `GET /api/employees?type=nurse` (picker) | `manage_employees` (permission mismatch) |

**Features**
- All Nurses / Specific Nurse; picker populated once at init.
- Summary cards: total nurses, total patients.
- Per-nurse card: patients, total days, work days; patient summary table (name, last admission, last discharge/Active, payment type, diagnosis, days assigned) with totals; daily work assignments accordion (date, patient count, total hours; patient/payment/diagnosis/hours table with totals).
- Pie chart of patients per nurse when >1.
- PDF: multiple nurses → pie + summary table + per-nurse pages (patient table + daily assignment tables every 3 days); single nurse → patient table + daily assignments on new pages.

### 2.5 Statistics (legacy lines 4885–5799)

- Single endpoint: `GET /api/reports/statistics/comprehensive?start_date&end_date&grouping` (`view_reports`).
- 4 KPI cards: Total Patients, Avg Stay (Days), **Occupancy Rate (dead, always `-%`)**, Total Revenue (sum of billed).
- 8 chart cards / 9 configurations: Patient Admission Trends (line; actually in-hospital census), Patient Distribution (pie; Payment/Gender toggle), Average Stay Duration (line), Revenue Trends (grouped bar: total/collected/outstanding), Admissions vs Discharges (line + net change), Top 10 Services (horizontal bar), Top 10 Drugs (horizontal bar), Staff Utilization (bar with dual axis).
- Load Statistics button; empty/error handling only via toast; charts not destroyed on tab switch.

### 2.6 Employee payment reports (legacy lines 5799–7385)

**Endpoints**
| Endpoint | Permission |
|---|---|
| `GET /api/reports/employees/payments/chart?...` | `view_reports` |
| `GET /api/reports/employees/payments` | `view_reports` (not used by the UI) |
| `GET /api/reports/employees/:employeeId/payments` | `view_reports` (not used by the UI) |

**Features**
- Filters: employee type (all/doctor/nurse/other), specific employee (optional), Generate.
- 4 summary cards: total employees, total payments, total paid, total unpaid.
- Per-employee card: name, type, hire date, work days, patients served, net payment, payment record count; configuration alert (base pay, extra amount/type, per-patient type, percentage scope, shift); 6 mini KPIs (base, extra, deductions, paid, unpaid, average); payment detail cards (date, type badges, net amount, paid/pending, base/extra/deductions/net, paid-on/by, main patient, patient work details table, clock-in deductions table).
- 2 charts: payment timeline (line), payment type distribution (doughnut).
- PDF: title + total employees + overall summary table; per-employee config + summary + payment blocks + patient work details + clock-in deductions + paid line.

### 2.7 Clock-in reports (legacy lines 7385–8827)

**Endpoints**
| Endpoint | Permission |
|---|---|
| `GET /api/reports/employees/clock-ins?...` | `view_reports` |
| `GET /api/reports/employees/clock-ins/chart?...` | `view_reports` |
| `GET /api/reports/employees/:employeeId/clock-ins` | `view_reports` (unused) |
| `GET /api/reports/statistics/clock-ins[/chart]` | `view_reports` (unused by this tab) |

**Features**
- Filters: employee type, specific employee (optional), Generate.
- 4 summary cards: total employees, total hours, avg hours/employee, total deductions.
- 2 charts: hours worked by employee (bar; hours + deductions datasets), attendance status distribution (doughnut).
- Per-employee card: name, type, shift; 6 attendance cards (total days, on time, late, missing, incomplete, punctuality rate); alerts for missing/incomplete/deductions; records table (date, in, out, hours, status, deduction, notes) with patient-assignment expandable rows and totals.
- PDF: **landscape**; summary; per-employee shift/summary, 6 attendance boxes, records table (date, in, out, hours, status, patients, deduction), totals.

### 2.8 Legacy defect ledger (v2 must fix)

| Area | Defect | v2 behavior |
|---|---|---|
| Shared | `toISOString()` default range shifts a day in UTC+ | Local `YYYY-MM-DD` helpers |
| Shared | Group-by visible on every tab but ignored | Shown only where it applies (Statistics, payment timeline) |
| Patient | `/patients` N+1 per patient/admission; formatted PDF endpoint separate | Set-based list + 3-query detail; one contract |
| Patient | Age/birth date re-derived in renderer | Server returns age (same helper, one place) |
| Patient | No start ≤ end validation | 400 + inline form validation |
| Doctor | Attended and Supervised share the same `DoctorPatientHistory` query | Supervised restricted to `doctor_type='supervising'`; separate all-supervising list |
| Doctor | No All Supervising option | Added |
| Doctor | All-doctors endpoint loops per doctor (N+1) | One aggregate query |
| Doctor | Single-doctor PDF fetches `/patients/formatted` per patient (N+1, `manage_reports` mismatch) | One export endpoint with `include_admissions` |
| Doctor | PDF title uses live select, not loaded report | Generated params captured; export uses them |
| Doctor | Total row `colSpan` mismatch (`colSpan:8` + 4 empties) | Explicit column counts; PDF theme rows |
| Doctor | `NaN%` when total patients = 0 | Guard + `—` |
| Doctor | Fetch/print button never disabled after a later failure | Buttons derive from current report state |
| Doctor | `last_admission_time` / `last_discharge_time` / `last_diagnosis` fetched but unused | Surfaced in the detail table |
| Nurse | `GET /api/employees?type=nurse` needs `manage_employees` | `/v2/options` with `view_reports` |
| Nurse | `total_days_assigned` counts all-time DSA | Range-scoped |
| Nurse | DSA↔PatientHistory date-overlap join duplicates rows | Lateral latest-admission lookup |
| Nurse | All-nurses EXISTS ignores DSA date/hours | Excludes nurses with no in-range work |
| Nurse | Multi-nurse PDF lacks no-patient branch | Explicit empty section |
| Nurse | `.toFixed()` on raw strings/nulls | Numbers coerced server-side |
| Nurse | `totalDays` can exceed `workDays` | Consistent range-scoped metrics |
| Statistics | Occupancy always `-%` | Removed |
| Statistics | "Admission Trends" is actually census | Two series: census + admissions, correctly labelled |
| Statistics | Revenue KPI is billed, chart has collected/outstanding | KPIs show billed + collected + outstanding |
| Statistics | `BETWEEN` excludes end day in revenue/admission queries | Half-open `[start, end+1)` everywhere |
| Statistics | Average stay averages overlapping stays, not discharges | Discharges in period |
| Statistics | Distribution toggle resets to payment after reload | Toggle state preserved |
| Statistics | `$` axis ticks vs EGP tooltips/KPIs | One currency formatter (EGP) |
| Statistics | Hardcoded English dataset/axis labels | i18n keys |
| Statistics | Staff tooltip indexes `data[datasetIndex]` | `data[dataIndex]` |
| Statistics | `destroyAllCharts` dead; hidden-tab sizing | React unmounts charts; wrappers use responsive containers |
| Statistics | 11 unused statistics endpoints + chart generators | Only v2 endpoints; legacy removed in Phase 7 |
| Payments | Deductions counted in rolling 30-day windows per payment (double count) | Period-scoped once |
| Payments | Paid/unpaid ignore deductions; `avg_payment` ambiguous | Gross paid/unpaid; net explicit; average removed/redefined |
| Payments | `total_voided` hardcoded 0 | Non-void only; no void KPI |
| Payments | `main_patient` arbitrary (`DISTINCT ON` no ORDER BY) | Associations list; no "main patient" claim |
| Payments | Breakdown totals inflated by cartesian join | Period aggregates only |
| Payments | `displayEmployeePaymentReport` called twice | Not applicable |
| Payments | Employee picker empty until type changes | Options preloaded |
| Payments | Missing i18n keys for `fixed_per_patient`, `percentage_per_patient`, `supervising_doctor_fixed`, `both` | Enum label keys added |
| Payments | Deduction status `"Late/Early"` → missing key | `reports.enums.deductionStatus.*` |
| Payments | Print cross-tab uses shared data | Per-tab report state + generated params |
| Clock-in | Two requests compute the same N+1 report twice | One endpoint with charts in the response |
| Clock-in | Missing days for future/weekends/pre-hire | Elapsed days since hire |
| Clock-in | Multiple clock-ins/day silently overwritten | One row per record; missing only when none |
| Clock-in | `avg_hours_per_day` is per clock-in | Per worked day |
| Clock-in | Status defaults to `late` when deduction exists without shift | Deterministic late/early/on-time logic + minutes |
| Clock-in | Attendance summary mixes missing/incomplete | Explicit counts + defined punctuality denominator |
| Clock-in | Patient-assignment join duplicates overlapping admissions | Lateral admission lookup |
| Clock-in | PDF landscape not supported by shared shell | `pdfShell` orientation option |
| Clock-in | `$` in PDF; hardcoded English | EGP + English-only export formatter |

---

## 3. v2 backend design

### 3.1 Module layout (new files; legacy untouched)

```
src/app/
├── routes/
│   ├── api.routes.ts                         # MODIFY: mount reportV2Routes
│   └── reportV2.routes.ts                    # NEW
├── controllers/
│   └── ReportV2.controller.ts                # NEW (thin: validation + response)
├── models/
│   └── reports/
│       ├── shared.ts                         # NEW: date bounds, paging, money, age, sort whitelist
│       ├── PatientReport.model.ts            # NEW
│       ├── DoctorReport.model.ts             # NEW
│       ├── NurseReport.model.ts              # NEW
│       ├── StatisticsReport.model.ts         # NEW
│       ├── EmployeePaymentReport.model.ts    # NEW
│       └── ClockInReport.model.ts            # NEW
├── utils/
│   ├── billFinancials.ts                     # NEW: pure Bill math (shared with Bill.model)
│   └── types/
│       └── reportV2.d.ts                     # NEW server-side wire types
└── tests/
    ├── models/
    │   ├── ReportV2.patient.spec.ts
    │   ├── ReportV2.doctor.spec.ts
    │   ├── ReportV2.nurse.spec.ts
    │   ├── ReportV2.statistics.spec.ts
    │   ├── ReportV2.employeePayment.spec.ts
    │   └── ReportV2.clockIn.spec.ts
    └── controllers/
        └── ReportV2.controller.spec.ts
```

**Naming/routing:** mount `reportV2Routes` at `/api/reports/v2` **before** the existing `/api/reports` router in `api.routes.ts`. All v2 routes use `verifyToken`, then `auditLogger`, then the permission middleware. `checkPermissions([...])` (already in `auth.middleware.ts`) enforces multiple permissions.

**No controller/model duplication of legacy:** v2 is new code; legacy `Report.model.ts` remains for the old page until Phase 7.

### 3.2 Conventions

- **Query names:** snake_case (`start_date`, `end_date`, `page_size`, `payment_type`, …), matching Express/Postgres. The renderer wrapper translates camelCase → snake_case once.
- **Response names:** snake_case (the shared `lib/api.ts` `toCamel` converts to camelCase for React).
- **List envelope:** `{ summary, data, total, page, page_size }`.
- **Detail envelope:** `{ summary, data }` (or `{ patient, admissions }`, etc. as specified).
- **Export envelope:** `{ generated_at, range: { start_date, end_date }, summary, data }`.
- **Errors:** `400 { error: "<human message>" }`, `403 { error: "Insufficient permissions" }`, `404 { error: "..." }`, `500 { error: "Failed to ..." }` (log the real error server-side; do not leak SQL).
- **Money:** map `NUMERIC` with `Number()` then `roundMoney` (2 decimals). Never return raw strings.
- **Dates:** accept `YYYY-MM-DD`; validate with a strict regex and real-calendar check. Timestamp filters use `>= start_date::date AND < end_date::date + interval '1 day'` (end inclusive). Date columns use `BETWEEN start AND end` (inclusive).
- **Pagination:** `page` default 1, `page_size` default 25; allow 10/25/50/100 (reject others with 400). `LIMIT/OFFSET`.
- **Search:** trim, max 255, `ILIKE '%'||$q||'%'` on whitelisted columns.
- **Sort:** whitelist per endpoint; map to safe `ORDER BY` fragments; default direction `asc` for names, `desc` for dates/money. Never interpolate user input.
- **Nullability:** every optional string is `string | null`; numeric aggregates are `0` when empty.
- **Rounding:** `roundMoney(n) = Math.round((Number(n) || 0) * 100) / 100`.

### 3.3 Endpoint matrix

| Method | Path | Permissions | Purpose |
|---|---|---|---|
| GET | `/api/reports/v2/options` | `view_reports` | Pickers: insurance companies, doctors, nurses; payroll employees only with `manage_employees`; clock-in employees. |
| GET | `/api/reports/v2/patients` | `view_reports` | Paginated patient summary list + summary. |
| GET | `/api/reports/v2/patients/export` | `view_reports` + `manage_reports` | Full patient report dataset for PDF/CSV. |
| GET | `/api/reports/v2/patients/:patientId` | `view_reports` | Patient + admissions + items + staff detail. |
| GET | `/api/reports/v2/doctors` | `view_reports` | Paginated doctor summary list + summary (all/specific). |
| GET | `/api/reports/v2/doctors/:doctorId` | `view_reports` | Doctor + paginated patient rows. |
| GET | `/api/reports/v2/doctors/export` | `view_reports` + `manage_reports` | Full doctor report dataset; `include_admissions` for specific-doctor PDFs. |
| GET | `/api/reports/v2/nurses` | `view_reports` | Paginated nurse summary list + summary. |
| GET | `/api/reports/v2/nurses/:nurseId` | `view_reports` | Nurse + patient rows + daily assignments. |
| GET | `/api/reports/v2/nurses/export` | `view_reports` + `manage_reports` | Full nurse report dataset. |
| GET | `/api/reports/v2/statistics` | `view_reports` | KPI + all chart series. |
| GET | `/api/reports/v2/statistics/export` | `view_reports` + `manage_reports` | Statistics PDF/CSV dataset. |
| GET | `/api/reports/v2/employee-payments` | `view_reports` + `manage_employees` | Paginated payroll list + summary + charts. |
| GET | `/api/reports/v2/employee-payments/:employeeId` | `view_reports` + `manage_employees` | Employee config + paginated payments + period deductions. |
| GET | `/api/reports/v2/employee-payments/:employeeId/payments/:paymentId` | `view_reports` + `manage_employees` | Lazy payment → patient associations. |
| GET | `/api/reports/v2/employee-payments/export` | `view_reports` + `manage_employees` + `manage_reports` | Full payroll dataset for PDF/CSV. |
| GET | `/api/reports/v2/clock-ins` | `view_reports` | Paginated clock-in employee list + summary + charts. |
| GET | `/api/reports/v2/clock-ins/:employeeId` | `view_reports` | Employee + paginated records + attendance summary. |
| GET | `/api/reports/v2/clock-ins/export` | `view_reports` + `manage_reports` | Full clock-in dataset. |

**Route ordering:** register `/patients/export` before `/patients/:patientId`, same for doctors/nurses/employee-payments/clock-ins. Validate numeric ids with `Number.isInteger` + `> 0`; non-numeric → 400 (not 500).

### 3.4 Shared SQL / financial semantics

#### Date bounds
Every timestamp comparison uses the same helper:
```sql
ph.admission_time >= $start::date
AND ph.admission_time < ($end::date + INTERVAL '1 day')
```
Never use bare `BETWEEN` on timestamps. This fixes the legacy end-day omission.

#### Bill totals
`Bill.total_amount` is already recalculated from components in `Bill.model.recalculateTotal` (services + drugs + supplies + medical tests − scoped discount + scoped VAT + admin expenses). Use it as the authoritative final total everywhere.

Create `src/app/utils/billFinancials.ts`:
```ts
export interface BillFinancialInput {
  services: number; drugs: number; supplies: number; tests: number;
  discount: number; discountType: "fixed" | "percentage" | null;
  discountScope: string[]; vatPercentage: number; vatScope: string[];
  administrativeExpenses: number;
}
export interface BillFinancialResult {
  baseTotal: number; discountAmount: number; vatAmount: number;
  administrativeExpenses: number; finalTotal: number;
}
export function calculateBillFinancials(input: BillFinancialInput): BillFinancialResult
```
Port the exact `Bill.model.recalculateTotal` algorithm (scope expansion, proportional VAT-discount overlap, admin expenses). Refactor `Bill.model.recalculateTotal` to call this helper so bill writes and reports can never drift. Add a unit spec for the helper (fixed/percentage/scoped VAT/all scope/no discount/no VAT).

**List totals:** `SUM(b.total_amount)` and `SUM(b.paid_amount)` over admissions in range.
**Detail breakdown:** compute `baseTotal`, `discountAmount`, `vatAmount`, `adminExpenses` with the helper; `finalTotal` from `Bill.total_amount`. (If the helper result differs from `total_amount` by more than rounding, log a warning server-side; the stored total wins.)

#### Patient list query strategy
1. `patient_agg` CTE: join `PatientHistory ph` + `Bill b` for admissions in range; group by patient; `COUNT(ph)`, `SUM(b.total_amount)`, `SUM(b.paid_amount)`, `MIN/MAX(ph.admission_time)`, `BOOL_OR(ph.discharge_time IS NULL)`.
2. Filter (`payment_type`, `insurance_id`, `search`).
3. `COUNT(*) OVER()` for total.
4. Sort whitelist: `name`, `last_admission`, `total_billed`, `total_paid`, `outstanding`.
5. `LIMIT/OFFSET`.
6. Separate summary query over the same filtered CTE (`COUNT`, `SUM(total_billed)`, `SUM(total_paid)`, `SUM(outstanding)`).

#### Patient detail query strategy
Three parallel queries:
1. Patient row + admissions in range with `bill_id`, `total_amount`, `paid_amount`, discount/VAT/admin fields, `items` not included.
2. All `BillDetail` rows for those bill ids with item names (service/drug/supply), `generated_at::date`, quantity, unit price; group by date/type/name in JS (same shape as legacy `items_by_date`).
3. `DailyStaffAssignment` for the patient in range, joined to `Employee`; group by date and role in JS, then attach to each admission by admission/discharge window.

No per-admission queries. Patient detail is one request with 3 queries.

#### Doctor queries
- `referred`: `p.referring_doctor_id = d.doctor_id`.
- `attended`: `EXISTS (SELECT 1 FROM PatientHistory ph JOIN DoctorPatientHistory dph ... WHERE ph.patient_id = p.patient_id AND dph.doctor_id = d.doctor_id AND ph.admission_time in range)`.
- `supervised`: attended expression **plus** `d.doctor_type = 'supervising'` (doctor validation and list filter). Document that a supervising doctor's patient set equals attended by construction; the report populations differ.
- Doctor list: one query with `LATERAL`/CTE aggregates per doctor, filter by relationship, optional `doctor_id`, search, count window, sort, pagination.
- Doctor detail patient list: one query with per-patient aggregates, count window, sort, pagination.
- Global summary: doctors count, **unique patients** (`COUNT(DISTINCT patient_id)` across the filtered set), **patient assignments** (sum of per-doctor distinct counts), admissions count, billed, paid. The UI headline uses unique patients; per-doctor rows keep their own counts.

#### Nurse queries
- Nurse list: `Employee e WHERE employee_type='nurse'` and `EXISTS (DSA in range)`; optional `nurse_id`/search; aggregate `COUNT(DISTINCT dsa.patient_id)`, `COUNT(DISTINCT dsa.work_date)`, `SUM(dsa.hours_worked)`, `MAX(dsa.work_date)`; count window; sort `name|patients|days|hours`; pagination.
- Nurse patients: aggregate per patient over DSA in range; diagnosis/last admission/discharge from a `LATERAL` latest admission overlapping the range (not `MAX(diagnosis)`); pagination.
- Daily assignments: one query for all DSA in range for the nurse, joined patient; group by date in JS; `patient_count`, `total_hours`.
- Exclude nurses/patients with zero in-range rows.

#### Statistics queries
Use `generate_series` for day/month/year buckets and separate CTEs:
- `census`: distinct patients present in each bucket (`admission_time < bucket_end AND (discharge_time IS NULL OR discharge_time >= bucket_start)`), plus admissions count by `admission_time`.
- `admissions_discharges`: counts by admission/discharge timestamps in bucket; `net_change`.
- `average_stay`: for admissions **discharged** in bucket: `AVG(EXTRACT(EPOCH FROM (discharge_time - admission_time))/86400)`, count.
- `revenue`: bills with `generated_at` in bucket: `SUM(total_amount)` billed, `SUM(paid_amount)` collected, `billed - collected` outstanding, `COUNT`, `AVG`.
- `distribution`: patients admitted in range by payment type and gender.
- `top_services` / `top_drugs`: `BillDetail` with `generated_at` in range, join names; `SUM(quantity*unit_price)`, `COUNT(DISTINCT bill_id)` usage, `SUM(quantity)`, ordered desc limit 10.
- `staff_utilization`: DSA in range grouped by `employee_type`: distinct employees, distinct patients, `SUM(hours)`, avg hours/assignment, avg patients/staff.
- KPIs: total patients admitted in range, admissions, discharges, avg stay (discharges in range), billed, collected, outstanding.
- **No occupancy.**

#### Employee payment queries
- Employee list: `Employee e WHERE EXISTS (EmployeePayment ep WHERE employee_id=e.employee_id AND is_void=false AND issued_timestamp in range)`; optional type/id/search; aggregate payments (`COUNT`, base, extra, paid gross, unpaid gross); period deductions via correlated subquery `SUM(pay_deduction)` on `EmployeeClockIn` with `clock_in in range`; net = base + extra − deductions; count window; sort; pagination.
- Detail: employee + `Employee` config (`base_pay`, extra, per-patient, percentage scope, shift); payments paginated (`EmployeePayment` non-void in range, ordered desc); period deductions list (`clock_in` in range, `pay_deduction > 0`, computed hours/status); no per-payment deduction list.
- Payment associations: one query by `payment_id`, deterministic order (`work_date DESC, payment_patient_id`).
- Charts: timeline grouped by day/month/year over all filtered payments (`SUM(payment_amount + extra_amount)`), type distribution by `payment_type`.
- `totalPaid`/`totalUnpaid` are gross (base+extra); `totalNet` subtracts period deductions. Labels make this explicit.

#### Clock-in queries
- Employee list: active `need_clock_in=true` **or** has clock-ins/assignments in range; optional type/id/search.
- Actual records: one query per report for all employees (`EmployeeClockIn` in range), grouped by employee. Do **not** synthesize missing days for every employee individually. Fetch hire dates and shift times in the same employee query.
- Missing days: for each eligible employee, generate dates from `max(start, hire_date)` to `min(end, today)` (only if active); a date with no actual record becomes a synthetic missing row. Days with patient assignments but no clock-in are marked missing **and** carry the assignments.
- Multiple sessions per day: keep one row per actual clock-in; missing row only when no record exists. `avg_hours_per_day = totalHours / workedDays` (distinct dates with actual records), not per clock-in.
- Status: shared TS helper:
  - no clock-in → `missing`
  - no clock-out → `incomplete`
  - with shift: `late` if clock-in > shift start + 30 min; else `early` if clock-out < shift end − 30 min; else `on_time`
  - without shift: `late` if `pay_deduction > 0`, else `on_time`
  - return `late_minutes`, `early_minutes`, `deduction`.
- Attendance summary: `total_days` (actual + missing), `on_time_days`, `late_days`, `early_days`, `incomplete_days`, `missing_days`, `worked_days`, `punctuality_rate = onTime / (onTime + late + early + incomplete) * 100` (0 when denominator 0). `complete_days` may be included for API completeness but is not a KPI.
- Patient assignments: `DailyStaffAssignment` for the employee/date, join patient; diagnosis/admission/discharge via a `LATERAL` latest admission covering the work date.
- Charts: hours per employee, status distribution (on-time/late/early/incomplete; missing optional separate).

### 3.5 Per-report contracts

#### 3.5.1 Patient list
`GET /api/reports/v2/patients?start_date&end_date&payment_type=all|cash|credit|insurance&insurance_id&search&page&page_size&sort=name|last_admission|total_billed|total_paid|outstanding&dir=asc|desc`

```jsonc
{
  "summary": { "total_patients": 0, "total_admissions": 0, "total_billed": 0, "total_paid": 0, "total_outstanding": 0 },
  "data": [{
    "patient_id": 1, "patient_name": "", "national_id": null, "gender": "male",
    "age": 34, "phone": null, "payment_type": "cash",
    "insurance_company": null, "insurance_form_id": null, "referring_doctor_name": null,
    "admissions_count": 2, "first_admission": "2026-10-01T08:00:00.000Z",
    "last_admission": "2026-10-20T09:00:00.000Z", "has_active_admission": false,
    "total_billed": 0, "total_paid": 0, "total_outstanding": 0
  }],
  "total": 0, "page": 1, "page_size": 25
}
```

#### 3.5.2 Patient detail
`GET /api/reports/v2/patients/:patientId?start_date&end_date`

```jsonc
{
  "patient": { /* patient row fields incl. address + aggregate totals */ },
  "admissions": [{
    "patient_history_id": 1, "bill_id": 10,
    "admission_time": "...", "discharge_time": null, "diagnosis": null,
    "length_of_stay_days": 3,
    "base_total": 0, "discount_type": "percentage", "discount": 10,
    "discount_scope": ["services"], "calculated_discount": 0,
    "vat_percentage": 14, "vat_scope_custom": ["services"], "calculated_vat": 0,
    "administrative_expenses": 0, "final_total": 0,
    "paid_amount": 0, "outstanding_amount": 0,
    "items_by_date": [{ "service_date": "2026-10-02", "date_total": 0,
      "items": [{ "item_type": "service", "item_name": "", "quantity": 1, "unit_price": 0, "total_price": 0 }] }],
    "daily_staff": [{ "work_date": "2026-10-02",
      "doctors": [{ "employee_id": 1, "name": "", "hours_worked": 4 }],
      "nurses": [{ "employee_id": 2, "name": "", "hours_worked": 8 }] }]
  }]
}
```

#### 3.5.3 Doctor list / detail / export
`GET /api/reports/v2/doctors?start_date&end_date&relationship=referred|attended|supervised&doctor_id&search&page&page_size&sort=name|patients|billed|paid&dir`

```jsonc
{
  "summary": { "relationship": "referred", "total_doctors": 0, "total_patients": 0,
    "total_patient_assignments": 0, "total_admissions": 0, "total_billed": 0, "total_paid": 0 },
  "data": [{ "doctor_id": 1, "doctor_name": "", "doctor_type": "referring",
    "patients_count": 0, "admissions_count": 0, "total_billed": 0, "total_paid": 0 }],
  "total": 0, "page": 1, "page_size": 25
}
```
Detail (`/:doctorId?relationship&start_date&end_date&page&page_size&search&sort&dir`):
```jsonc
{
  "doctor": { "doctor_id": 1, "doctor_name": "", "doctor_type": "referring" },
  "summary": { "patients": 0, "admissions": 0, "billed": 0, "paid": 0 },
  "data": [{ "patient_id": 1, "patient_name": "", "national_id": null, "gender": "male",
    "age": 30, "payment_type": "cash", "insurance_company": null, "insurance_card_id": null,
    "insurance_form_id": null, "admissions_count": 0, "total_billed": 0, "total_paid": 0,
    "last_admission_time": null, "last_discharge_time": null, "last_diagnosis": null }],
  "total": 0, "page": 1, "page_size": 25
}
```
Export (`/doctors/export?...&doctor_id&include_admissions=true|false`) returns `{ generated_at, range, summary, data: [DoctorFull] }` where `DoctorFull.patients[]` rows may include `admissions[]` (same shape as patient detail admissions) when `include_admissions=true` and `doctor_id` is set.

#### 3.5.4 Nurse list / detail / export
`GET /api/reports/v2/nurses?start_date&end_date&nurse_id&search&page&page_size&sort=name|patients|days|hours&dir`
```jsonc
{
  "summary": { "total_nurses": 0, "total_patients": 0,
    "total_patient_assignments": 0, "total_days": 0, "total_hours": 0 },
  "data": [{ "nurse_id": 1, "nurse_name": "", "patients_count": 0,
    "days_worked": 0, "total_hours": 0, "last_work_date": "2026-10-20" }],
  "total": 0, "page": 1, "page_size": 25
}
```
Detail `/:nurseId?start_date&end_date&page&page_size&search&sort&dir`:
```jsonc
{
  "nurse": { "nurse_id": 1, "nurse_name": "" },
  "summary": { "patients": 0, "days": 0, "hours": 0 },
  "data": [{ "patient_id": 1, "patient_name": "", "payment_type": "cash",
    "last_admission_time": null, "last_discharge_time": null, "diagnosis": null,
    "days_assigned": 0, "hours_worked": 0 }],
  "daily_assignments": [{ "work_date": "2026-10-20", "patient_count": 0, "total_hours": 0,
    "patients": [{ "patient_id": 1, "patient_name": "", "payment_type": "cash",
      "diagnosis": null, "hours_worked": 0 }] }],
  "total": 0, "page": 1, "page_size": 25
}
```
Export `{ generated_at, range, summary, data: [NurseFull] }`.

#### 3.5.5 Statistics
`GET /api/reports/v2/statistics?start_date&end_date&grouping=day|month|year`
```jsonc
{
  "range": { "start_date": "", "end_date": "", "grouping": "day" },
  "kpis": { "total_patients": 0, "total_admissions": 0, "total_discharges": 0,
    "avg_stay_days": 0, "total_billed": 0, "total_collected": 0, "total_outstanding": 0 },
  "patient_census": [{ "period": "", "year": 0, "month": 0, "day": 0, "census": 0, "admissions": 0 }],
  "distribution": {
    "payment_type": [{ "key": "cash", "count": 0 }],
    "gender": [{ "key": "male", "count": 0 }]
  },
  "average_stay": [{ "period": "", "discharges": 0, "avg_stay_days": 0 }],
  "revenue_trends": [{ "period": "", "billed": 0, "collected": 0, "outstanding": 0, "bill_count": 0, "avg_bill_amount": 0 }],
  "admission_discharge": [{ "period": "", "admissions": 0, "discharges": 0, "net_change": 0 }],
  "top_services": [{ "service_id": 0, "service_name": "", "service_type": "", "usage_count": 0, "total_quantity": 0, "total_revenue": 0 }],
  "top_drugs": [{ "drug_id": 0, "drug_name": "", "manufacturer": null, "usage_count": 0, "total_quantity": 0, "total_revenue": 0 }],
  "staff_utilization": [{ "employee_type": "", "staff_count": 0, "patients_served": 0,
    "avg_hours_per_assignment": 0, "total_hours_worked": 0, "avg_patients_per_staff": 0 }]
}
```
Export = same + `generated_at`.

#### 3.5.6 Employee payments
`GET /api/reports/v2/employee-payments?start_date&end_date&employee_type=all|doctor|nurse|other&employee_id&search&grouping=day|month|year&page&page_size&sort=name|payments|base|extra|deductions|net&dir`
```jsonc
{
  "summary": { "total_employees": 0, "total_payments": 0, "total_base_pay": 0,
    "total_extra_pay": 0, "total_deductions": 0, "total_paid": 0,
    "total_unpaid": 0, "total_net": 0 },
  "charts": {
    "timeline": [{ "period": "", "total": 0 }],
    "by_type": [{ "payment_type": "salary", "total": 0 }]
  },
  "data": [{ "employee_id": 1, "employee_name": "", "employee_type": "nurse",
    "hire_date": "", "payment_count": 0, "total_base_pay": 0, "total_extra_pay": 0,
    "total_deductions": 0, "total_paid": 0, "total_unpaid": 0, "net_payment": 0 }],
  "total": 0, "page": 1, "page_size": 25
}
```
Detail `/:employeeId?start_date&end_date&page&page_size&grouping&dir`:
```jsonc
{
  "employee": { "employee_id": 1, "employee_name": "", "employee_type": "nurse", "hire_date": "" },
  "breakdown": { "base_pay": 0, "base_extra_amount": 0, "base_extra_payment_type": null,
    "per_patient_payment_type": null, "percentage_scope": null, "need_clock_in": false,
    "shift_type": null, "shift_start_time": null, "shift_end_time": null,
    "total_work_days": 0, "total_patients_served": 0 },
  "summary": { "total_payments": 0, "total_base_pay": 0, "total_extra_pay": 0,
    "total_deductions": 0, "total_paid": 0, "total_unpaid": 0, "net_payment": 0 },
  "payments": [{ "payment_id": 1, "payment_date": "", "payment_amount": 0,
    "extra_amount": 0, "extra_payment_type": "none", "payment_type": "salary",
    "percentage_scope": null, "is_paid": false, "paid_timestamp": null,
    "paid_by": null, "patient_count": 0 }],
  "period_deductions": [{ "clock_id": 1, "clock_in": "", "clock_out": null,
    "hours_worked": 0, "pay_deduction": 0, "status": "Late/Early" }],
  "total": 0, "page": 1, "page_size": 25
}
```
Associations `/:employeeId/payments/:paymentId`: `{ payment, associations: [{ payment_patient_id, patient_id, patient_name, patient_history_id, admission_time, discharge_time, diagnosis, work_date, hours_worked, payment_amount, payment_type }] }`.
Export includes all payments with associations + period deductions.

#### 3.5.7 Clock-in
`GET /api/reports/v2/clock-ins?start_date&end_date&employee_type=all|doctor|nurse|other&employee_id&search&page&page_size&sort=name|hours|deductions|punctuality&dir`
```jsonc
{
  "summary": { "total_employees": 0, "total_clock_ins": 0, "total_hours": 0,
    "avg_hours_per_employee": 0, "total_deductions": 0 },
  "charts": {
    "hours_by_employee": [{ "employee_id": 1, "employee_name": "", "hours": 0 }],
    "status_distribution": [{ "status": "on_time", "count": 0 }]
  },
  "data": [{ "employee_id": 1, "employee_name": "", "employee_type": "nurse",
    "shift_type": "morning", "shift_start_time": "08:00:00", "shift_end_time": "16:00:00",
    "clock_in_count": 0, "total_hours": 0, "avg_hours_per_day": 0,
    "total_deductions": 0, "attendance_summary": {
      "total_days": 0, "worked_days": 0, "on_time_days": 0, "late_days": 0,
      "early_days": 0, "incomplete_days": 0, "missing_days": 0, "punctuality_rate": 0
    } }],
  "total": 0, "page": 1, "page_size": 25
}
```
Detail `/:employeeId?start_date&end_date&status&page&page_size`:
```jsonc
{
  "employee": { "employee_id": 1, "employee_name": "", "employee_type": "nurse",
    "shift_type": "morning", "shift_start_time": "08:00:00", "shift_end_time": "16:00:00" },
  "attendance_summary": { /* same */ },
  "records": [{ "clock_id": 1, "date": "2026-10-20", "clock_in": "", "clock_out": null,
    "hours_worked": 0, "pay_deduction": 0, "status": "late", "is_missing": false,
    "late_minutes": 12, "early_minutes": 0,
    "patients": [{ "patient_id": 1, "patient_name": "", "payment_type": "cash",
      "diagnosis": null, "hours_worked": 0, "admission_time": null, "discharge_time": null }],
    "patient_count": 0 }],
  "total": 0, "page": 1, "page_size": 25
}
```
Export includes all records for all employees.

### 3.6 Options endpoint
`GET /api/reports/v2/options` → 
```jsonc
{
  "insurance_companies": [{ "insurance_id": 1, "name": "" }],
  "doctors": [{ "doctor_id": 1, "name": "", "doctor_type": "referring", "is_active": true }],
  "nurses": [{ "employee_id": 1, "name": "" }],
  "payroll_employees": [{ "employee_id": 1, "name": "", "employee_type": "nurse" }],
  "clock_in_employees": [{ "employee_id": 1, "name": "", "employee_type": "nurse" }]
}
```
`payroll_employees` is `[]` unless the user has `manage_employees`. `clock_in_employees` = active `need_clock_in=true`. This replaces legacy `/api/doctors` and `/api/employees` picker calls and removes the nurse-picker permission trap.

### 3.7 Export endpoints
- All export routes use `checkPermissions(["view_reports", "manage_reports"])`; payroll export adds `"manage_employees"`.
- They accept the same filters as the list/detail (without `page`/`page_size`).
- They return the full dataset; the client builds the PDF/CSV.
- Add a server-side safety log when a result exceeds 5,000 rows (no hard cap; the UI shows a warning before export if the list summary exceeds it).
- Exports must use the **generated params**, not the current form state (client responsibility; server validates).

### 3.8 Indexes and performance
Additive indexes (also add to `setUpDatabase.ts` for fresh installs and a `migrations/003_report_v2_indexes.sql` for existing DBs):
```sql
CREATE INDEX IF NOT EXISTS idx_employee_payment_employee_issued
  ON EmployeePayment(employee_id, issued_timestamp) WHERE is_void = false;
CREATE INDEX IF NOT EXISTS idx_employee_clock_in_employee_clock_in
  ON EmployeeClockIn(employee_id, clock_in);
CREATE INDEX IF NOT EXISTS idx_employee_clock_in_deduction
  ON EmployeeClockIn(employee_id, clock_in) WHERE pay_deduction > 0;
CREATE INDEX IF NOT EXISTS idx_patient_name_trgm
  ON Patient USING gin (name gin_trgm_ops); -- only if pg_trgm is available; otherwise rely on idx_patient_name
```
The trigram index is optional; the existing `idx_patient_name` btree does not help `ILIKE '%…%'`. Gate the trigram extension behind a check; if unavailable, skip and document.

Performance requirements:
- Patient list: one aggregate query + one summary query (constant, not per patient).
- Patient detail: 3 queries.
- Doctor list/detail: 2 queries each.
- Nurse list/detail: 3 queries.
- Statistics: 7 parallel queries (as the legacy comprehensive endpoint does) with half-open bounds.
- Payments list: 1 aggregate query + 1 summary + 1 chart aggregate; detail: 4 queries.
- Clock-in list: 2 queries (employees + actual records) + in-memory missing-day synthesis; detail: records + assignments.
- No endpoint performs a query per row.

### 3.9 Backend tests (Jasmine)
Use `src/app/tests/helpers/db.helper.ts`; seed the minimum fixtures per suite.
- **Shared/billFinancials:** fixed, percentage, scoped discount, scoped VAT, overlap, admin, tests-only; assert against `Bill.model` outputs.
- **Patient:** list pagination/search/filter; summary equals sum of rows; end date inclusive; detail financials match `Bill.total_amount`; item grouping; staff grouping; no admissions → empty detail; 404 invalid id.
- **Doctor:** referred vs attended vs supervised populations; all-supervising list; specific doctor; global totals; end date inclusive; no N+1 (assert query count? optional).
- **Nurse:** range-scoped days; overlapping admissions not duplicated; excludes nurses with no in-range DSA; daily assignments; diagnosis from the covering admission.
- **Statistics:** census vs admissions; discharges-only average stay; revenue billed/collected/outstanding; distribution; top services/drugs; staff utilization; grouping day/month/year; end date inclusive.
- **Payroll:** period deductions counted once; net = base+extra−deductions; paid/unpaid gross; void payments excluded; charts; employee type filter.
- **Clock-in:** missing days start at hire and stop today; inactive employees don't get synthesized days; multiple clock-ins per day preserved; status late/early/incomplete/on-time; punctuality denominator; patient assignment dedupe.
- **Controller:** missing dates → 400; start > end → 400; invalid enums → 400; non-numeric ids → 400; forbidden permissions → 403; payroll requires both permissions; exports require `manage_reports`; 404s; response envelope shape.
- **Permissions:** Admin bypass; view_reports-only cannot export; view_reports+manage_employees can read payroll but not export without manage_reports.

Run `npm test` (Jasmine) as a gate.

---

## 4. Frontend architecture

### 4.1 File tree

Replace `src/renderer/src/pages/Reports/ReportsPage.tsx` and delete `types/ReportsPlaceholder.tsx` (React placeholder only; legacy files untouched).

```
src/renderer/src/pages/Reports/
├── ReportsPage.tsx                     # PageHeader + tabs + shared shell
├── api.ts                              # v2 wrappers (options, lists, details, exports)
├── types/reports.ts                     # wire types, enums, params
├── state/
│   ├── useReportUrlState.ts             # tab/from/to/group/filters/run
│   ├── useReportSession.ts              # in-memory last result per tab
│   ├── useReportList.ts                 # list fetch + page/sort/search state
│   ├── useReportDetail.ts               # lazy detail fetch
│   └── useReportExport.ts               # export fetch + PDF/CSV orchestration
├── components/
│   ├── ReportsTabs.tsx
│   ├── ReportFiltersCard.tsx            # shared date range + presets + group-by
│   ├── DateRangeField.tsx               # Calendar range popover + presets
│   ├── ReportShell.tsx                  # title, Generate, export buttons, stale banner
│   ├── ReportKpiStrip.tsx               # generic KPI row
│   ├── ReportState.tsx                  # not-generated / loading / error / empty
│   ├── ReportTable.tsx                  # DataTable + server pagination glue
│   ├── StatusBadges.tsx                 # payment/gender/attendance/doctor-type
│   └── SnapshotSurface.tsx              # hidden English chart render for PDFs
├── patients/
│   ├── PatientReportTab.tsx
│   ├── PatientFilters.tsx
│   ├── PatientDetailDialog.tsx
│   ├── AdmissionSection.tsx
│   ├── ItemsByDateTable.tsx
│   └── DailyStaffTable.tsx
├── doctors/
│   ├── DoctorReportTab.tsx
│   ├── DoctorFilters.tsx
│   ├── DoctorDetailDialog.tsx
│   └── DoctorPatientTable.tsx
├── nurses/
│   ├── NurseReportTab.tsx
│   ├── NurseFilters.tsx
│   ├── NurseDetailDialog.tsx
│   ├── NursePatientTable.tsx
│   └── DailyAssignmentAccordion.tsx
├── statistics/
│   ├── StatisticsTab.tsx
│   ├── StatisticsKpiStrip.tsx
│   ├── DistributionCard.tsx
│   └── charts/ (thin compositions of shared wrappers)
├── payments/
│   ├── EmployeePaymentsTab.tsx
│   ├── EmployeePaymentsFilters.tsx
│   ├── EmployeePaymentsDetailDialog.tsx
│   ├── PaymentRow.tsx
│   ├── PaymentAssociationsTable.tsx
│   └── PeriodDeductionsTable.tsx
├── clockins/
│   ├── ClockInReportTab.tsx
│   ├── ClockInFilters.tsx
│   ├── ClockInDetailDialog.tsx
│   ├── ClockInRecordsTable.tsx
│   └── AttendanceKpiGrid.tsx
└── export/
    ├── pdf/
    │   ├── buildPatientReportPdf.ts
    │   ├── buildDoctorReportPdf.ts
    │   ├── buildNurseReportPdf.ts
    │   ├── buildEmployeePaymentsReportPdf.ts
    │   ├── buildClockInReportPdf.ts
    │   ├── buildStatisticsReportPdf.ts
    │   └── chartSnapshots.ts
    └── csv/
        ├── exportPatientReportCsv.ts
        ├── exportDoctorReportCsv.ts
        ├── exportNurseReportCsv.ts
        ├── exportEmployeePaymentsReportCsv.ts
        ├── exportClockInReportCsv.ts
        └── exportStatisticsReportCsv.ts
```

Shared additions:
```
src/renderer/src/components/charts/
├── MultiLineChart.tsx
├── GroupedBarChart.tsx            # vertical/horizontal, grouped/stacked
├── DualAxisComposedChart.tsx
├── DistributionDonutChart.tsx     # generalized PatientServicesDonut
├── chartPalette.ts                # token-based N-series palette
├── ChartSnapshotSurface.tsx       # hidden English 900×420 render + capture
└── index.ts                       # extend barrel
src/renderer/src/lib/
├── csv.ts                         # toCsv, toSectionedCsv, downloadCsv (promoted from Vault)
├── dateRange.ts                   # local-date presets/toIsoDateLocal
└── pdf/pdfTheme.ts                # promoted from Insurance print/pdfTheme
```

**Route wiring:** `App.tsx` already lazy-loads `pages/Reports/ReportsPage` with the `reports` namespace. No route change. `routes.ts` already gates `/reports` with `view_reports`; add `?tab=payments` to the page-level guard? The page hides the tab and the server 403s; do not add a second route.

### 4.2 URL state contract

`/reports?tab=patients&from=2026-10-01&to=2026-10-26&run=1&payment_type=insurance&insurance_id=3&search=...`

- `tab`: `patients|doctors|nurses|statistics|payments|clock-ins` (default `patients`).
- `from`, `to`: local `YYYY-MM-DD`; default = first of current month → today.
- `group`: `day|month|year` (only statistics/payments; default `day`).
- `run=1`: the active tab has generated results for the params in the URL. On mount, this triggers a fetch (or hydrates from session cache if the params match).
- Tab-specific params (only when `run=1`): `payment_type`, `insurance_id`, `search`, `relationship`, `doctor_id`, `nurse_id`, `employee_type`, `employee_id`, `dist` (statistics distribution toggle).
- Editing a filter does **not** update `run` params until Generate. The form state is local; the URL is updated on Generate. Changing tabs keeps `from`/`to` and clears tab-specific params + `run`.
- `run=1` with invalid params → the tab shows validation and removes `run`.
- Use `replace` for tab/filter updates (avoid history spam); the browser back button still returns to the previous page.

### 4.3 Data flow and session cache

- `useReportList` owns `{ rows, total, summary, loading, error, page, pageSize, sort }`. It fetches on explicit `generate(params)` and on page/sort changes after generation. Search is a form filter; it applies on Generate.
- `useReportDetail` fetches by id on dialog open; clears on close; aborts stale requests with an `AbortController` or a request nonce.
- `useReportExport` fetches the export dataset with the **generated params**, then calls the PDF/CSV builder. It exposes `exporting: "pdf" | "csv" | null`.
- `useReportSession` keeps the last `{ paramsKey, generatedAt, summary, rows, total }` per tab in memory so switching tabs does not lose results. It is not persisted across reloads (URL `run` + cache hydrate covers refresh only if the tab is active; inactive tabs reset).
- All fetches use `api.get`/`api.post` from `lib/api.ts` (401 handling, `ApiError`, camel conversion).
- Error UX: 400 → inline form error; 403 → persistent toast + permission empty state; 5xx/network → persistent toast + retry action in the report body.

### 4.4 Permission gating (client)

| UI | Gate |
|---|---|
| Page | `view_reports` (route already) |
| Tabs: patients/doctors/nurses/statistics/clock-ins | `view_reports` |
| Tab: employee payments | `view_reports` && `manage_employees` |
| Export CSV/PDF buttons (all tabs) | `manage_reports` (disabled + tooltip if missing) |
| Patient detail "Print patient / Print admission" | `manage_reports` |
| Payroll detail | `view_reports` && `manage_employees` |
| Payroll export | `view_reports` && `manage_employees` && `manage_reports` |

Use `usePermission().hasPermission`. Do not rely on the server alone; do not hide a tab without also handling a direct URL (show a permission empty state instead of firing the request).

### 4.5 Shared UI components (behavior)

- **ReportFiltersCard:** `<Card>` with labeled date range, quick presets (Today / This Week / This Month / This Year), conditional group-by, tab-specific filters, Generate button. Validation messages inline (`text-danger text-xs`). Dates use local calendar helpers (no `toISOString`).
- **ReportShell:** title + subtitle; toolbar (Generate primary; Export CSV/PDF outline; refresh icon); stale warning (`role="status"`); body; footer with generated timestamp, range, record count. Never show a spinner-only body; use skeletons.
- **ReportKpiStrip:** `StatCard`/`EditorialKpiCard` row; currency via `formatCurrency(amount, locale)`; counts via `formatNumber`; `tabular-nums`.
- **ReportState:** four states: `not-generated` (icon + title + description + Generate), `loading` (skeletons matching the eventual layout), `error` (title + description + Retry), `empty` (no data for the generated filters + adjust filters). All translated.
- **ReportTable:** `DataTable` with `caption`/`ariaLabel`, server pagination (`DataTablePagination`), sort state, row click (keyboard accessible), sticky header, end-aligned money/number columns.
- **Detail dialogs:** `Dialog` with `max-w-5xl` for patient/payroll (wide tables), `max-w-3xl` for doctor/nurse/clock-in; scrollable body `max-h-[75vh]`; sticky footer with Close + print actions; focus trap/restore from shadcn.
- **Badges:** payment type (cash/credit/insurance), gender, doctor type, attendance status, admission status. Every badge pairs color with text (design.md §8).
- **Empty state:** `EmptyState` with a relevant icon; never a blank canvas.

### 4.6 Charts (shared wrappers)

Add to `components/charts/`:
- `MultiLineChart`: `series: { key, label, color?, dashed?, fill? }[]`, `xKey`, `yFormatter`, `tooltipFormatter`, `srSummary`, `loading`, `empty`. Used by census/admissions, admissions/discharges, average stay, payment timeline.
- `GroupedBarChart`: `layout: "vertical" | "horizontal"`, `stacked?: boolean`, `series`, `xKey`, `valueFormatter`, `srSummary`, `loading`, `empty`. Used by revenue trends, top services/drugs, hours by employee, distribution.
- `DualAxisComposedChart`: `leftSeries` (bars/lines), `rightSeries` (line), `leftLabel`, `rightLabel`, `srSummary`. Used by staff utilization.
- `DistributionDonutChart`: generalize `PatientServicesDonut` with `valueFormatter`, `showPercent`, `centerLabel`, `srSummary`, `loading`, `empty`; keep `PatientServicesDonut` as a thin wrapper to avoid breaking Dashboard.
- `chartPalette.ts`: `CHART_PALETTE = [primary, success, warning, info, secondary, accent, danger, ...]` using `var(--color-*)`; `seriesColor(index)`; never raw hex for UI charts.
- All wrappers use `ChartContainer` + `useChartConfig`; all labels are props (i18n from the page); all have `EmptyState` (never blank axes) and `StatTileSkeleton` (no CLS).
- **RTL:** wrap chart canvases in `dir="ltr"` (time/axis flow stays LTR; labels remain localized). Do not reverse axes.
- **Snapshot mode:** wrappers accept `snapshot?: boolean` and `language?: "en" | "ar"`; `ChartSnapshotSurface` renders a hidden fixed-size (900×420) chart with `language="en"`, `aria-hidden`, `pointer-events-none`, positioned off-screen. The export builder captures it with `html-to-image` (`toPng`, pixelRatio 2, white background). Add `html-to-image` to dependencies.

### 4.7 Export pipeline

**PDF**
- Extend `lib/pdfShell.ts`:
  - `PdfShellOptions.pageOrientation?: "portrait" | "landscape"` (default portrait).
  - Optional `pageMargins?: [number, number, number, number]` (default `[40, 50, 40, 40]`).
  - Keep `language` and `t`; pass `language: "en"` for all report PDFs.
- Extract `print/pdfTheme.ts` from Insurance to `lib/pdf/pdfTheme.ts`; Insurance imports it from the new path (mechanical). Reuse `PDF_COLORS`, `reportTableLayout`, `headerCell`, `bodyCell`, `totalRow`, `summaryRow`, `sectionHeading`, `sectionMeta`, `plural`.
- Add `formatEnGbDate`, `formatEnGbDateTime`, `formatMoneyEn` to `lib/pdf/format.ts` (promote from Insurance `report/format.ts`).
- Each builder:
  - `buildPatientReportPdf`: summary page (patient count, billed/paid/outstanding); page break per patient; patient info grid; admissions; items-by-date tables with totals (base, discount with %, admin, VAT with %, final, paid, outstanding); daily staff table. Reuse 6.10 patient-report layout grammar.
  - `buildDoctorReportPdf`: summary + distribution table (name, patients, %) + per-doctor pages with patient table; for `include_admissions`, per-patient admission/item sections. No pie image; distribution table + optional chart snapshot.
  - `buildNurseReportPdf`: summary + distribution table + per-nurse patient table + daily assignment tables (page break every 3 days or when needed).
  - `buildEmployeePaymentsReportPdf`: overall summary; per-employee config, summary, payment blocks, patient work details, period deductions; no "main patient".
  - `buildClockInReportPdf`: landscape; overall summary; per-employee shift + attendance boxes + records table + patients column; page break per employee.
  - `buildStatisticsReportPdf`: KPI table; chart snapshots (census, revenue, admissions, average stay, distribution, top services, top drugs, staff); each chart's underlying data as a compact table. Page breaks as needed.
- Chart snapshots: only for reports that had charts on screen; use the hidden English surface. If capture fails, fall back to the data table and toast a warning (PDF still succeeds).

**CSV**
- Promote Vault `toCsv`/`downloadCsv` to `lib/csv.ts`; add `toSectionedCsv(sections: { title?: string; headers: string[]; rows: unknown[][] }[])` for Statistics. Update Vault/Insurance imports to the shared module.
- CSV is English-only, RFC-4180, BOM, CRLF, `YYYY-MM-DD` filename suffix.
- Column sets:
  - Patient: one row per item (`patient_id, patient_name, national_id, payment_type, insurance, admission_id, bill_id, admission_time, discharge_time, item_type, item_date, item_name, quantity, unit_price, item_total, admission_base, admission_discount, admission_admin, admission_vat, admission_final, admission_paid, admission_outstanding`).
  - Doctor: one row per doctor-patient (`doctor, type, patient, national_id, gender, age, payment_type, insurance, admissions, billed, paid, last_admission`).
  - Nurse: one row per daily assignment (`nurse, work_date, patient, payment_type, diagnosis, hours_worked, nurse_day_total_hours`).
  - Payments: one row per payment (`employee, type, hire_date, payment_id, payment_date, payment_type, extra_type, base, extra, paid_status, paid_on, paid_by, patient_count, period_deductions, net`). Period deductions repeated per employee (document).
  - Clock-in: one row per record (`employee, type, date, clock_in, clock_out, hours, status, deduction, patient_names`).
  - Statistics: sections `KPIs`, `Patient census`, `Distribution`, `Average stay`, `Revenue trends`, `Admissions vs discharges`, `Top services`, `Top drugs`, `Staff utilization`, each with its own header row and a blank line between sections.
- Filenames: `hms-patient-report-2026-10-01_2026-10-26.csv`, etc.

### 4.8 Detail dialogs (shared rules)

- Fetch on open; skeleton while loading; error with Retry; close clears state/aborts.
- Sticky header with primary identity (name + badges) and sticky footer (Close, Print PDF gated).
- All money right-aligned, `tabular-nums`, `formatCurrency`; dates via `formatDate`/`formatDateTime` with the active locale.
- Item tables: `Table` with `scope`d headers, `tfoot` totals, date group headers; no raw `innerHTML`.
- Daily staff: per-day card/table with doctor/nurse chips and hours.
- Print actions use the export endpoint with the current detail id + generated range, not the list data.

### 4.9 i18n

- Use `useEnsureNamespace("reports")` on the page (already lazy-loaded by `App.tsx`).
- Add new keys under `reports.*` (see §7). Keep existing legacy keys where labels match.
- Enum labels: `reports.enums.relationship.*`, `reports.enums.scope.*`, `reports.enums.employeeType.*`, `reports.enums.paymentType.*` (reuse `reports.paymentTypes.*`), `reports.enums.attendance.*`, `reports.enums.deductionStatus.*`, `reports.enums.doctorType.*` (or reuse `employees.doctorTypes.*`? Prefer reports-local to avoid lazy cross-namespace dependency).
- Do **not** reference `employees.*`, `patients.*`, `dashboard.*` keys from the reports namespace (lazy namespaces are independent; cross-namespace keys break when the other namespace is not loaded).
- Add Arabic translations for every new key.
- Run `npm run check-i18n:renderer`; fix missing keys. Remove dead keys only after confirming no other page uses them (`reports.tabs.medicalSupplyReports` is legacy-only; likely remove at the end of the phase).
- Number/date/currency formatting via `lib/utils.ts` (`formatNumber`, `formatCurrency(amount, locale)`, `formatDate`, `formatDateTime`) and `resolveLocale(language)`.

### 4.10 Accessibility, RTL, performance

- Every table has a caption/aria-label; sortable headers use `aria-sort`; loading tables set `aria-busy`.
- Dialogs: focus trap/restore (shadcn); Esc closes; buttons have accessible names; icon-only buttons have `aria-label`.
- Charts: `srSummary` table for every chart (design.md §7.4); no color-only encoding; legends always present.
- RTL: logical spacing (`ps/pe`, `ms/me`, `text-start/end`), no `[dir=rtl]` overrides; charts wrapped `dir="ltr"`; dialogs preserve logical layout.
- Reduced motion: no JS animations; CSS transitions only.
- Performance: route-level lazy; lazy-load each tab component (`React.lazy`) with a skeleton fallback; server pagination; detail on demand; memoized column definitions; no chart rendering for inactive tabs; chart snapshots only during export; `useMemo` for heavy derived rows.
- Large item tables inside a patient detail: collapsed by date group; if a single date has >200 items, paginate client-side within the group (or show first 200 + "show all"). Document.

---

## 5. UX specification per tab

### 5.1 Patient tab

**Filters:** payment type (All/Cash/Credit/Insurance), insurance company (only when Insurance), search (name/national ID), Generate.

**After Generate**
- KPI strip: Patients, Admissions, Billed, Paid, Outstanding.
- Table columns: Patient (name + ID + national ID), Age/Gender, Payment type (+ insurance badge/tooltip), Referring doctor, Admissions (count + Active badge), Last admission, Billed, Paid, Outstanding, actions (View, Print — print gated).
- Server pagination/sort; row click opens detail.
- Detail dialog: patient identity (name, ID, national ID, age/birth date, gender, phone, address, insurance, form/card IDs, referring doctor), KPI summary (billed/paid/outstanding), admission accordions (newest first). Each admission: admission ID/bill ID, times, diagnosis, financial grid (base, discount %, scope, admin, VAT %, scope, final, paid, outstanding), items-by-date tables, daily staff table, "Print admission" (gated). Header "Print patient" (gated).
- Empty/error/stale states as in §4.5.

**Parity checklist:** all legacy patient fields, item lists, staff, financial rows, per-patient/per-admission print, age/birth date from national ID, insurance/referring doctor, empty states.

### 5.2 Doctor tab

**Filters:** Report type select (6 options: all/specific × referred/attended/supervised), doctor picker (specific only, filtered by type), search (doctor name), Generate.

**All mode**
- KPI strip: Doctors, Unique patients, Admissions, Billed, Paid (per-doctor patient counts stay in the table).
- Distribution chart: horizontal bar (patients per doctor) with English snapshot for PDF; no pie.
- Table: Doctor, Type, Patients, Admissions, Billed, Paid, actions (View).
- Doctor detail dialog: doctor header + patient table (name, national ID, gender, age, payment, insurance, admissions, billed, paid, last admission, last discharge) with pagination; row click opens the Patient detail dialog (reuses §5.1 detail) for admission-level data.

**Specific mode**
- Doctor header + KPI strip; patient table directly (same columns); row click → patient detail.
- Print PDF: doctor summary + patient table + (optionally) per-patient admission sections; export button gated.

**Parity checklist:** doctor picker type filtering, all/specific, summaries, patient totals rows, distribution, per-doctor pages, single-doctor per-patient admission details, unused `last_*` fields now surfaced.

### 5.3 Nurse tab

**Filters:** Scope (All/Specific), nurse picker (specific only), search, Generate.

**All mode**
- KPI strip: Nurses, Unique patients, Days, Hours (per-nurse patient counts stay in the table).
- Distribution chart: hours per nurse (horizontal bar).
- Table: Nurse, Patients, Days (range), Hours, Last work date, actions (View).
- Detail dialog: nurse header + patient table (name, payment, last admission, last discharge/Active, diagnosis, days assigned, hours) + daily assignments accordion (date, patient count, total hours; patient/payment/diagnosis/hours table with totals).

**Specific mode**
- Nurse header + KPI; patient table + daily assignments directly.

**Parity checklist:** patient summary, daily assignments accordion, totals, distribution, all/specific, days/hours.

### 5.4 Statistics tab

**Filters:** shared date range + Group By (Day/Month/Year) + Generate (button label "Load statistics" or "Generate" — use Generate for consistency).

**Layout**
- KPI row (5 cards): Total Patients, Avg Stay (Days), Admissions, Discharges, Billed / Collected / Outstanding (could be 7 cards in a responsive grid; design: `grid-cols-2 md:grid-cols-4 xl:grid-cols-7`). Keep 5 primary + a secondary revenue strip if cramped.
- Charts:
  1. **Patient Census & Admissions** — multi-line (census + admissions), labelled correctly.
  2. **Patient Distribution** — donut with Payment/Gender toggle (state preserved across reloads; `dist` URL param).
  3. **Average Stay Duration** — bar or line; use bar for period averages (clearer), with discharges count in tooltip.
  4. **Revenue Trends** — grouped bars (Billed, Collected, Outstanding).
  5. **Admissions vs Discharges** — multi-line + dashed net change.
  6. **Top 10 Services by Revenue** — horizontal bar.
  7. **Top 10 Drugs by Revenue** — horizontal bar.
  8. **Staff Utilization** — dual-axis composed (staff count/patients as bars, hours as line).
- Each chart card has title, subtitle (metric/period), skeleton, empty state, and sr-only data table.
- No occupancy card.
- Export PDF: KPI table + chart snapshots + underlying data tables. Export CSV: one sectioned file.
- Currency always EGP; axes use compact currency (`EGP 1.2k`) consistent with the tooltip.

**Parity checklist:** all 8 legacy chart types (plus corrected labels), distribution toggle, 4→7 KPIs, group-by, quick ranges, load action. No dead occupancy.

### 5.5 Employee payments tab (gated)

**Filters:** employee type (All/Doctor/Nurse/Other), employee picker (optional), Group By (Day/Month/Year, for timeline), Generate.

**After Generate**
- KPI strip: Employees, Payments, Base, Extra, Deductions, Paid, Unpaid, Net (8 cards; responsive).
- Charts: Payment Timeline (line/bar by grouping) + Payment Type Distribution (donut).
- Table: Employee, Type, Hire date, Payments, Base, Extra, Deductions (period), Paid (gross), Unpaid (gross), Net, actions (View).
- Detail dialog: employee header + config card (base, extra, per-patient, percentage scope, shift, work days, patients served); summary strip; payments table (date, type badges, base, extra, gross, paid/pending, paid on/by, patient count) with expandable associations (lazy fetch); period deductions table (clock-in, out, hours, status, deduction) with total; no per-payment deduction attribution.
- Export PDF/CSV gated by `manage_reports`; tab hidden unless `manage_employees`.

**Parity checklist:** config block, 6 mini KPIs + net, payment cards, patient work details, clock-in deductions (now period-level), main patient removed, charts, per-employee PDF pages.

### 5.6 Clock-in tab

**Filters:** employee type, employee picker (optional), Generate.

**After Generate**
- KPI strip: Employees, Clock-ins, Hours, Avg hours/day, Deductions.
- Charts: Hours by Employee (horizontal bar) + Attendance Status Distribution (donut).
- Table: Employee, Type, Shift, Days, Clock-ins, Hours, Avg/day, On time, Late, Early, Incomplete, Missing, Punctuality, Deductions, actions (View).
- Detail dialog: employee header + attendance KPI grid (6 cards: total days, worked days, on time, late, early, incomplete, missing — 7; responsive); alerts for missing/incomplete/deductions; records table (date, in, out, hours, status, deduction, notes) with status filter and client/server pagination; expandable patient assignments per record (patient, payment, diagnosis, admission status, hours).
- Multiple sessions per day allowed; each row is a session; missing rows only when no session.
- Export PDF landscape; CSV per record.

**Parity checklist:** 4 summary cards, 2 charts, per-employee attendance cards/alerts, records table, patient assignment expandable, landscape PDF, totals.

---

## 6. Subphases

Each subphase is independently shippable, gated, and leaves the legacy page working. Do not start a subphase before its dependency passes its gates.

### 6.11.0 — Foundations (backend v2 skeleton + frontend shell + shared primitives)

**Goal:** a working `/reports` shell with URL state, tabs, filters, permission gates, not-generated states, and all shared infrastructure; `/api/reports/v2/options` live.

**Backend**
- Add `reportV2.routes.ts`, `ReportV2.controller.ts` (`getOptions` only), `models/reports/shared.ts`, `utils/types/reportV2.d.ts`; mount in `api.routes.ts`.
- Implement `getOptions` (insurance, doctors, nurses, payroll employees gated, clock-in employees).
- Add `utils/billFinancials.ts` + refactor `Bill.model.recalculateTotal` to use it; add its spec.
- Add indexes (§3.8) to `setUpDatabase.ts` + migration SQL.
- Add `ReportV2.controller.spec.ts` for options/permissions.

**Frontend**
- Replace `ReportsPage` placeholder; delete `types/ReportsPlaceholder.tsx` import.
- Add `api.ts` (`getOptions` only + shared params/types scaffolding), `types/reports.ts`, `state/useReportUrlState.ts`, `useReportSession.ts`.
- Add `ReportsTabs`, `ReportFiltersCard` (dates/presets/group-by), `ReportShell`, `ReportKpiStrip`, `ReportState`, `StatusBadges`.
- Add shared chart wrappers + palette + `ChartSnapshotSurface`; add `html-to-image`.
- Promote `lib/csv.ts` and `lib/pdf/pdfTheme.ts`; extend `pdfShell` orientation; update Vault/Insurance imports mechanically.
- Add shell i18n keys.
- Tab bodies: `ReportState` "not generated" placeholders (no data yet).

**Tests/gates**
- `npm run typecheck`, `npm run lint`, `npm test` (new options/billFinancials specs), `npm run check-i18n:renderer`.
- Manual: tabs/URL/refresh, EN/AR/RTL shell, permission-gated payroll tab, export buttons disabled without `manage_reports`.

**Risk:** the `pdfShell`/theme extraction touches 6.9/6.10; keep the extraction mechanical and run a PDF smoke for Vault/Insurance.

---

### 6.11.1 — Patient report (v2 + React + PDF/CSV)

**Backend**
- `PatientReport.model.ts`: list (summary + pagination + search/filter/sort), detail (3 queries), export (full dataset).
- `ReportV2.controller.ts`: `listPatients`, `getPatient`, `exportPatients`.
- Routes + validation + permissions.
- Specs: list, summary, detail financials/items/staff, export, end-date inclusive, 404/400, permissions.

**Frontend**
- `PatientReportTab`, `PatientFilters`, `PatientDetailDialog`, `AdmissionSection`, `ItemsByDateTable`, `DailyStaffTable`.
- Patient table + KPI strip + pagination/sort.
- PDF/CSV builders (reuse 6.10 patient report layout/theme; adapt to v2 types).
- Detail print actions gated by `manage_reports`.
- i18n keys.

**Gates:** typecheck/lint/test/check-i18n; manual patient list/detail/print/CSV with seeded multi-admission patient; AR/RTL; 403 export gate; end-date inclusion check.

---

### 6.11.2 — Doctor report

**Backend**
- `DoctorReport.model.ts`: list/detail/export for referred/attended/supervised; all-supervising; N+1-free queries.
- Controller/routes/validation.
- Specs: relationship populations, all-supervising, pagination, totals, export with/without admissions, end-date inclusive.

**Frontend**
- `DoctorReportTab`, `DoctorFilters` (6 report types + picker), `DoctorDetailDialog`, `DoctorPatientTable`.
- Distribution bar chart + snapshot.
- Reuse `PatientDetailDialog` from 6.11.1 for row drill-down.
- PDF/CSV (summary + per-doctor pages; specific-doctor inclusion of admission detail).

**Gates:** all 6 options; no `NaN%`; totals row; permission gate; PDF/CSV; AR/RTL.

---

### 6.11.3 — Nurse report

**Backend**
- `NurseReport.model.ts`: list/detail/export; range-scoped metrics; daily assignments; lateral diagnosis; exclude empty nurses.
- Controller/routes.
- Specs: range scoping, overlap dedupe, daily assignments, empty nurse, export.

**Frontend**
- `NurseReportTab`, `NurseFilters`, `NurseDetailDialog`, `NursePatientTable`, `DailyAssignmentAccordion`.
- Distribution bar chart + snapshot.
- PDF/CSV.

**Gates:** range-scoped days, no duplicate patients, daily accordion, empty states, PDF/CSV, AR/RTL.

---

### 6.11.4 — Statistics

**Backend**
- `StatisticsReport.model.ts`: KPIs, census+admissions, distribution, average stay, revenue (billed/collected/outstanding), admissions/discharges, top services/drugs, staff utilization; grouping.
- Controller/routes/export; specs for each series and date bounds.

**Frontend**
- `StatisticsTab`, `StatisticsKpiStrip`, 8 chart cards using shared wrappers, distribution toggle (URL `dist`), export PDF/CSV.
- Remove occupancy; add billed/collected/outstanding; correct labels; currency consistency.
- i18n labels + axis labels (no hardcoded English in UI).
- Sr-only data tables for each chart.

**Gates:** all charts render/empty/loading; toggle persists; end-date inclusion; PDF snapshots in English; CSV sections; AR/RTL (charts LTR, labels localized); no `$`.

---

### 6.11.5 — Employee payments

**Backend**
- `EmployeePaymentReport.model.ts`: list/summary/charts, detail/breakdown/payments/period deductions, payment associations, export.
- Controller/routes; dual permissions.
- Specs: period deductions once, net math, gross paid/unpaid, void exclusion, charts, associations, permissions.

**Frontend**
- `EmployeePaymentsTab`, filters, KPI strip, charts, table, detail dialog with lazy associations, period deductions, PDF/CSV.
- Tab hidden without `manage_employees`; export gate `manage_reports`.
- Enum labels for all payment/extra types.

**Gates:** payroll tab visibility; direct URL permission state; net/deductions math; associations lazy load; PDF/CSV; AR/RTL.

---

### 6.11.6 — Clock-in reports

**Backend**
- `ClockInReport.model.ts`: list/summary/charts, detail/records/attendance summary, missing-day synthesis (hire→today), multiple sessions, export.
- Shared status/summary helper; specs.

**Frontend**
- `ClockInReportTab`, filters, KPI strip, charts, table, detail dialog, records table, patient assignments, PDF (landscape)/CSV.
- Status/notes i18n; punctuality; missing/incomplete alerts.

**Gates:** missing days start at hire/stop today; multiple sessions; status/punctuality; landscape PDF; CSV; AR/RTL.

---

### 6.11.7 — Hardening, i18n audit, documentation, handoff

- Full i18n key audit (missing/unused); prune dead legacy report keys that are not used elsewhere; verify `check-i18n` legacy + renderer.
- Accessibility sweep: tables, dialogs, charts sr tables, focus, keyboard row activation, labels, RTL.
- Performance: measure list/detail latency with seeded large data; verify no N+1; confirm export row warning; check bundle split.
- Test coverage: ensure all v2 model/controller specs pass; add any missing edge cases found manually.
- Update `react_implementation_plan.md` §6.11 to point to this plan/actual endpoints; add a short "as built" note (like 6.10 §9).
- Phase 7 cleanup checklist: delete legacy `/api/reports/*`, `Report.controller/model` (if unused), legacy `reports.html/ts/css`, Chart.js usage in reports, unused report i18n keys, legacy `reports-rtl.css` reference.
- Final manual matrix (§8) in EN + AR + RTL; permission matrix; PDF/CSV spot checks.

---

## 7. i18n key plan (`reports.{en,ar}.json`)

Existing namespace already covers 252 legacy keys. Add (names indicative; exact keys finalized per subphase):

**Shell/actions**
`reports.page.subtitle`, `reports.page.eyebrow`, `reports.actions.generate`, `reports.actions.regenerate`, `reports.actions.exportPdf`, `reports.actions.exportCsv`, `reports.actions.viewDetails`, `reports.actions.printPatient`, `reports.actions.printAdmission`, `reports.actions.retry`, `reports.actions.close`, `reports.actions.refresh`.

**Filters**
`reports.filters.dateRange`, `reports.filters.from`, `reports.filters.to`, `reports.filters.searchPatient`, `reports.filters.searchDoctor`, `reports.filters.searchNurse`, `reports.filters.searchEmployee`, `reports.filters.scope`, `reports.filters.scopeAll`, `reports.filters.scopeSpecific`, `reports.filters.relationship`, `reports.filters.doctor`, `reports.filters.nurse`, `reports.filters.employee`, `reports.filters.employeeType`, `reports.filters.paymentType`, `reports.filters.insuranceCompany`, `reports.filters.allDoctors`, `reports.filters.allNurses`, `reports.filters.allEmployees`, `reports.filters.allCompanies`, `reports.filters.quick.today`, `.thisWeek`, `.thisMonth`, `.thisYear`.

**States**
`reports.state.notGeneratedTitle`, `.notGeneratedDescription`, `.generating`, `.stale`, `.errorTitle`, `.errorDescription`, `.emptyTitle`, `.emptyDescription`, `.noResultsForFilters`, `.generatedAt`, `.records`, `.range`, `.loadingDetail`, `.detailError`, `.retry`.

**Enums**
`reports.enums.relationship.referred`, `.attended`, `.supervised`, `reports.enums.scope.all`, `.specific`, `reports.enums.doctorType.attending|supervising|referring|outside`, `reports.enums.employeeType.doctor|nurse|other`, `reports.enums.attendance.onTime|late|early|incomplete|missing`, `reports.enums.deductionStatus.onTime|lateEarly|incomplete`, `reports.enums.paymentType.fixedPerPatient|percentagePerPatient|referral|salary|commission|bonus|overtime|manual|supervisingDoctorFixed|both|none`, `reports.enums.extraPaymentType.*`.

**Tables** (new columns)
`reports.table.patient`, `.doctor`, `.nurse`, `.employee`, `.doctorType`, `.employeeType`, `.patientsCount`, `.admissionsCount`, `.insurance`, `.referringDoctor`, `.lastAdmission`, `.lastDischarge`, `.activeAdmission`, `.billed`, `.paid`, `.outstanding`, `.daysAssigned`, `.daysWorked`, `.hours`, `.totalHours`, `.avgPerDay`, `.lastWorkDate`, `.hireDate`, `.payments`, `.basePay`, `.extraPay`, `.deductions`, `.net`, `.shift`, `.clockIns`, `.onTime`, `.late`, `.early`, `.incomplete`, `.missing`, `.punctuality`, `.billId`, `.admissionId`, `.itemType`, `.itemName`, `.serviceDate`, `.quantity`, `.unitPrice`, `.itemTotal`, `.diagnosis`, `.admissionStatus`.

**Detail**
`reports.patientDetail.title`, `.info`, `.noAdmissions`, `.admissionHistory`, `.financials`, `.itemsByDate`, `.dailyStaff`, `.medicalTests`, `.baseTotal`, `.discount`, `.adminExpenses`, `.vat`, `.finalTotal`, `.patientPaid`, `.outstanding`.
`reports.doctorDetail.title`, `.patients`, `.noPatients`.
`reports.nurseDetail.title`, `.patients`, `.dailyAssignments`, `.noAssignments`.
`reports.paymentDetail.title`, `.configuration`, `.periodDeductions`, `.associations`, `.noAssociations`, `.loadAssociations`.
`reports.clockInDetail.title`, `.attendance`, `.records`, `.patientsWorkedOn`, `.noRecords`, `.lateMinutes`, `.earlyMinutes`, `.missingAlert`, `.incompleteAlert`.

**Statistics**
`reports.statistics.kpi.billed`, `.collected`, `.outstanding`, `.admissions`, `.discharges`, `.avgStayDays`.
`reports.statistics.charts.patientCensus`, `.distributionPayment`, `.distributionGender`, `.averageStay`, `.revenueBilled`, `.revenueCollected`, `.revenueOutstanding`, `.admissions`, `.discharges`, `.netChange`, `.staffCount`, `.patientsServed`, `.hoursWorked`, `.noData`.
`reports.statistics.axis.period`, `.count`, `.currency`, `.days`, `.hours`.
`reports.statistics.export.*`.

**Messages/validation**
`reports.messages.loadSuccess`, `.loadError`, `.exportSuccess`, `.exportError`, `.permissionDenied`, `.detailLoadError`, `.chartCaptureWarning`, `.largeExportWarning`.
`reports.validation.startRequired`, `.endRequired`, `.endBeforeStart`, `.selectDoctor`, `.selectNurse`, `.selectEmployee`, `.invalidRange`.

**Exports**
`reports.export.pdfTitle.*`, `.csvFileName.*`, `.pdfGenerating`, `.csvGenerating`.

Rules:
- No cross-namespace keys.
- Both en + ar for every key.
- Run `npm run check-i18n:renderer` and `npm run check-i18n:legacy`; `reports.tabs.medicalSupplyReports` and other legacy-only keys are candidates for removal in 6.11.7 after confirming no consumer.

---

## 8. Validation gates and manual matrix

### Automated gates (every subphase)
- `npm run typecheck`
- `npm run lint`
- `npm test` (Jasmine; new v2 specs included)
- `npm run check-i18n:renderer` (and `check-i18n:legacy` in 6.11.7)
- `npm run build` (Electron compile + assets) at the end of each subphase or at least 6.11.0/6.11.7
- Optional frontend unit tests: `npm run test:renderer` for pure helpers added.

### Manual matrix

| Area | Checks |
|---|---|
| Navigation/URL | Each tab deep-link; refresh restores generated results; back button; invalid tab; changing tab keeps range; filter change → stale banner; Generate updates URL. |
| Permissions | view_reports only: page loads, payroll tab hidden, export buttons disabled, direct `?tab=payments` shows permission state, server 403 on direct API. view_reports+manage_employees: payroll visible, export still disabled without manage_reports. +manage_reports: exports/print enabled. Admin: all. |
| Dates | Default month-to-date; Today/This Week/This Month/This Year; start>end blocked inline; end date included (seed a record on the end day); local timezone no off-by-one. |
| Patient | List summary equals footer/CSV; search/filter/sort/pagination; detail financial totals match Bill; items and staff; print patient/admission; empty patient; large patient (200+ items) performance. |
| Doctor | All 6 report types; picker filters by type; all-supervising; totals; distribution; detail; print all vs specific; no `NaN%`; empty doctor. |
| Nurse | All/specific; range-scoped days; no duplicate patients; daily assignments; empty nurse; print. |
| Statistics | All 8 charts; toggle; group-by day/month/year; empty periods; end-date inclusion; KPIs; PDF snapshots; sectioned CSV; no `$`; no occupancy. |
| Payroll | Tab visibility; employee picker preloaded; type filter; summary/net math; period deductions once; associations lazy; void excluded; PDF/CSV; permission. |
| Clock-in | Missing days since hire only; no future dates; inactive employee; multiple sessions/day; status late/early/incomplete/on-time; punctuality; deductions; landscape PDF; CSV. |
| RTL | All tabs, filters, tables, dialogs, charts (LTR canvas, localized labels), PDFs (English), logical spacing, no clipped text. |
| Accessibility | Keyboard-only tab/filter/table/dialog flow; focus restore; chart sr tables; `aria-sort`/`aria-busy`; icon labels; contrast. |
| Regression | Legacy `/reports` page still works; Vault/Insurance PDFs still work after theme/shell extraction; Dashboard unaffected; Electron build packages. |

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Scope is very large** (6 tabs + v2 backend) | Eight subphases, each shippable behind the additive v2 namespace; no big-bang cutover. |
| **SQL financial parity** (discount/VAT/admin scope math) | Single `billFinancials.ts` shared with `Bill.model`; unit tests; use `Bill.total_amount` for final totals; detail breakdown tested against seeded bills. |
| **N+1 regressions** | Query-count assertions in specs; no per-row queries in models; detail endpoints have fixed query counts. |
| **Date/timezone drift** | Local `YYYY-MM-DD` helpers in renderer; half-open server bounds; end-date inclusion tests in every model spec. |
| **Export volume** | Dedicated export endpoints; warning above 5,000 rows; PDF progress; no silent caps; pagination for lists. |
| **Chart snapshots** | Hidden English surface; `html-to-image`; fallback to tables + warning if capture fails; snapshot tests/manual checks. |
| **PDF table overflow** | Reuse 6.10 `pdfTheme` (`"*"`/`"auto"`, no `colSpan` totals) learned from the 6.10 defect; headless render checks for totals columns. |
| **Permission regressions** | Server `checkPermissions`; client gates; direct-URL tests; payroll dual permission. |
| **Legacy page breakage** | v2 additive; legacy routes/models untouched; regression check each subphase. |
| **`pdfShell`/theme extraction touches 6.9/6.10** | Mechanical import moves; smoke-test Vault/Insurance PDFs; no layout changes. |
| **URL state complexity** | Single `useReportUrlState` with typed parser; `run=1` contract; invalid params fall back safely. |
| **Large item tables** | Detail on demand; date-group collapse; client-side pagination within a group if >200 items. |
| **Payroll sensitivity** | Dual permission; hidden tab; no exports without `manage_reports`; audit logger on every request. |
| **Test DB coverage** | Extend `db.helper.ts` fixtures for multi-admission, insurance, payroll periods, missing clock-ins; specs per model. |
| **i18n key sprawl** | Key plan + `check-i18n` gate; no cross-namespace keys; prune legacy-only keys at the end. |

---

## 10. Out of scope / Phase 7 cleanup

- Deleting the legacy `/api/reports/*` routes, `Report.controller.ts`, `Report.model.ts`, `reports.html`, `reports.ts`, `reports.css`, and Chart.js report usage. Do this in Phase 7 after the React page has been validated in production.
- Server-side PDF/CSV generation. Revisit only if export volumes exceed client capacity.
- Occupancy rate / bed capacity. Needs a schema + admin source; separate phase.
- Payment-period columns on `EmployeePayment`. Current period-scoped deduction model is intentional.
- Per-user report scoping / payroll row-level security. Current model is module-level permissions.
- Multi-currency. EGP only.

---

## 11. Reuse from Phase 6.10 (insurance patient report)

Useful assets and how they are reused:

| 6.10 asset | Reuse in 6.11 |
|---|---|
| `pages/Insurance/print/pdfTheme.ts` | Promote to `lib/pdf/pdfTheme.ts`; use for every report PDF (header bands, total rows, summary rows, section headings). |
| `pages/Insurance/print/buildPatientReportPdf.ts` | Structural template for the v2 patient report PDF (patient info grid, summary table, admission sections, item table totals). Adapt to v2 types and `Bill.total_amount`. |
| `pages/Insurance/components/ReportTables.tsx` (`ReportSummaryGrid`, `ReportItemsTable`) | Generalize/extract if the shapes align; otherwise reuse the visual grammar for `AdmissionSection`/`ItemsByDateTable`. |
| `pages/Insurance/report/financials.ts` | Reference for the exact financial semantics; the backend `billFinancials.ts` is the single source of truth. If the client needs a display-only recomputation, reuse this engine instead of duplicating. |
| `pages/Insurance/report/groupItemsByPatient.ts` | Not used (v2 is patient-centric by query); keep as reference for grouping rules. |
| `pages/Insurance/modals/PatientReportDetailsModal.tsx` | UX reference for the patient report detail (summary grid, numbered admissions, item tables, print/export footer). |
| `pages/Insurance/print/exportItemsCsv.ts` | Reference for RFC-4180/BOM; promote the generic helpers to `lib/csv.ts`. |
| `pages/Insurance/report/format.ts` | Promote `formatEnGbDate`/`formatMoneyEn` to `lib/pdf/format.ts`. |

**Not reused:** the insurance report endpoint (`/api/insurance-companies/:id/patients/:patientId/reports`) is insurance-scoped and cannot serve general reports; v2 patient endpoints replace it for the Reports module. The Insurance page continues to use its own endpoint.

---

## 11a. Implementation status (as built)

### 6.11.0 — Foundations — ✅ implemented

**Backend**

| File | Purpose |
|---|---|
| `src/app/utils/billFinancials.ts` | Pure `calculateBillFinancials` + `normalizeScope` + `toMoneyNumber` + `roundMoney`; ported verbatim from the old inline math. |
| `src/app/models/Bill.model.ts` | `recalculateTotal` now fetches components + config in one round trip and delegates to the helper (unrounded value is passed so `DECIMAL(15,2)` rounding behaviour is unchanged). |
| `src/app/models/reports/shared.ts` | Strict `YYYY-MM-DD` parsing, `ReportValidationError`, paging whitelist, sort whitelist, `COUNT(*) OVER()` helpers, money coercion, `safeDivide`, time-of-day helpers. |
| `src/app/models/reports/OptionsReport.model.ts` | All five picker lists in one call. |
| `src/app/controllers/ReportV2.controller.ts` | `getOptions` + shared `sendError` / `NotFoundError` / permission helpers. |
| `src/app/routes/reportV2.routes.ts` | Mounted at `/api/reports/v2` **before** the legacy router. |
| `src/app/utils/types/reportV2.d.ts` | Wire contracts for all six reports (declared now, filled in per subphase). |
| `src/app/models/database/migrations/003_report_v2_indexes.sql` | Additive indexes (also added to `setUpDatabase.ts`). |

**Frontend**

- `pages/Reports/ReportsPage.tsx` — real shell (placeholder + placeholder types deleted).
- `state/reportParams.ts` — pure URL contract (parse/serialize/validate/stale/doctor-picker filtering).
- `state/useReportUrlState.ts`, `state/useReportSession.ts`, `hooks/useReportOptions.ts`.
- `components/` — `ReportsTabs`, `ReportShell`, `ReportState`, `ReportKpiStrip`, `DateRangeField`, `GroupByField`, `StatusBadges`, `TabPlaceholder` (transitional, removed by 6.11.6).
- `components/charts/` — `MultiLineChart`, `GroupedBarChart`, `DualAxisComposedChart`, `DistributionDonutChart`, `ChartShell` (sr table + empty + RTL), `ChartSnapshotSurface`, `chartPalette`, `chartFormat`.
- `lib/csv.ts`, `lib/dateRange.ts`, `lib/pdf/pdfTheme.ts`, `lib/pdf/format.ts`, `lib/chartSnapshot.ts`; `pdfShell` gained `pageOrientation` / `pageMargins`.
- Vault `print/toCsv.ts`, `Vault/dateRange.ts`, Insurance `print/pdfTheme.ts`, Insurance `report/format.ts` are now re-export shims — no call-site churn.
- `html-to-image@^1.11.13` added.

**Deviations / discoveries worth recording**

1. **The test database could not be built at all.** `db.helper.initDB()` contained four fatal defects (missing `;` after `VaultManualPayment`, a broken `$ $` dollar-quote, a forward `REFERENCES PriceList`, a duplicate primary key on `ServicePrice`) and its DDL had drifted from the real schema (no `discount_scope` / `vat_scope_custom`, no FK from `Patient` to `PriceList`, `buy_quantity` not seeded, double-quoted time literals, skipped `$3` parameter). `dbHelper.createDBIfNotExists` now bootstraps from the application's own `initDB` (newly exported from `setUpDatabase.ts`), and `ensureReportV2Schema()` applies the additive bits idempotently for existing test databases.
2. **The application's own `initDB` also failed on an empty database** — `get_default_pricelist_id()` was declared before `PriceList`, and `ActivePatientService` referenced `PatientHistory` before it existed. Both were reordered (fresh-install fix, no behavioural change).
3. `clearDatabase()` ordering fixed (`PriceList` is referenced by six tables, so it is cleared last); `MedicalSupplyShipmentPrice` and `DailyStaffAssignment` clears added.
4. Pre-existing suite failures remain (33 of 415): stale specs written against older model return shapes (`{rows,total}`), and the Vault "today range" specs compute `TODAY` with `toISOString()`, which is yesterday for the UTC+3 development machine. None involve Reports.

**Gates run:** `tsc` (app + renderer, no new errors), `eslint` (new files clean), `jasmine --filter="Reports v2"` (9/9), `jasmine --filter="ReportV2Controller"` (7/7), `vitest` (26/26 incl. 13 new URL-contract specs), `build:renderer` (OK, `ReportsPage` chunk emitted), `check-i18n` (no missing `reports.*` keys; EN/AR parity 332/332).

---

## 12. Definition of done (phase-level)

- `/reports` is fully React; no `ModulePlaceholder`/`ReportsPlaceholder` remains.
- All six tabs work in EN + AR/RTL with URL state, explicit Generate, stale/empty/error/loading states.
- v2 endpoints are documented by the contract in §3, covered by Jasmine specs, and enforce the permission matrix.
- PDF + CSV exports work for every tab; PDFs are English-only and free of clipped totals; clock-in PDF is landscape.
- Statistics has no occupancy KPI, shows billed/collected/outstanding, and all 8 charts with correct labels/currency.
- Payroll tab is gated and its deducations are period-scoped (no double count).
- Clock-in missing days start at hire and stop today; multiple sessions are preserved.
- Legacy `/reports` page and Vault/Insurance PDFs still work.
- `typecheck`, `lint`, `test`, `check-i18n`, and `build` pass.
- Plan/implementation notes updated; Phase 7 cleanup list recorded.
