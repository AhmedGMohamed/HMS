# Employees Page — Server-Side Pagination, Filtering & Sorting

**Status:** planned (not implemented)
**Scope:** `src/app` (Employee, Doctor, EmployeePayment models/controllers/routes) + `src/renderer/src/pages/Employees` + `src/renderer/src/pages/Patients/api.ts` + `employees.{en,ar}.json`
**Commits:** one commit, including the pending `package.json` / `package-lock.json` changes.

---

## 1. Objective

The Employees page currently loads **everything** and does all work in the browser:

- `useEmployees()` fires two unpaginated requests (`GET /employees`, `GET /doctors`); `EmployeesPage` then derives `tabEmployees`, `filteredEmployees`, `filteredDoctors` in `useMemo`s.
- `useEmployeePayments()` fetches **every** payment and derives `paymentsByEmployee` (for the detail sheet) and `pendingSystemPayments` (the Payments tab work queue), then groups/sorts/filters by date in memory.

Goal: every tab of `/employees` — **Employees**, **Doctors**, **Nurses**, **Payments** — is server-paginated with server-side filtering and sorting, page sizes `10/25/50/100`, default `25`.

Decisions taken (from the user):

1. **Payments tab stays grouped by employee**, one page row per employee. Expanding a row loads **only that employee's** pending payments (lazy, not embedded in the list response). The queue gets an **employee-name filter**.
2. **Server-side sorting** on every table, including the payments queue.
3. **One plan doc** (this file) and one commit.
4. The commit **includes** `package.json` and `package-lock.json` (long-pending modifications that were deliberately excluded from the Services / Price Lists / Clock-ins commits).

---

## 2. Conventions to reuse (already established in the repo)

- Envelope `{ data, total, page, pageSize }` via `parsePagination(req)` + `buildPage(rows, total, pagination)` from `src/app/utils/pagination.ts` (default page size 25, max 100).
- `all=true` → unbounded query, response reports `page: 1, pageSize: rows.length`. Reserved for lookup consumers; list pages never send it.
- Models return `{ rows, total }`; the data query and the `COUNT(*)::int` count query are built from **one shared WHERE builder** so the total can never drift from the rows. Sort columns come from a whitelisted constant map — request input never reaches SQL. Always add a stable tie-break column.
- Controllers sanitize silently: unknown/invalid params fall back to defaults, never 400. `readString` / `readBoolean` / `readInt` / `readDate` (`/^\d{4}-\d{2}-\d{2}$/` + `new Date(...T00:00:00Z)` round-trip check) follow `EmployeeClockIn.controller.ts`.
- Renderer `api.get(path, params)`: `QueryParams = Record<string, string|number|boolean|undefined|null>`. A typed params interface is **not** assignable — pass an explicit object literal. Responses are camelCased by `toCamel`.
- Hooks own the fetch; pages own page / pageSize / filters / sort and reset page to `1` in every filter / sort / pageSize handler.
- `react-hooks/set-state-in-effect` is active. **Never** clamp pages with a `useEffect` + `setPage`; clamp inside the mutation handler (`lastPageAfterRemoval(total, pageSize)`).
- `DataTable` never filters/sorts/paginates internally — `pagination` is a `DataTablePaginationSlot` and sort only drives the header indicator + the next query.

---

## 3. API contracts

### 3.1 `GET /api/employees` — staff list (extend existing)

Auth unchanged (`verifyToken` + `checkPermission("manage_employees")` + `auditLogger`).

| Param | Values | Notes |
|---|---|---|
| `page`, `pageSize` | numbers | default `1` / `25`, max 100 |
| `all` | `true` | unbounded lookup path |
| `type` | `all` \| `doctor` \| `nurse` \| `other` | existing param, keep behaviour (`all` = no filter) |
| `search` | string | `e.name ILIKE '%…%'` |
| `isActive` | `true` \| `false` | `e.is_active = $n` |
| `shiftType` | `morning` \| `night` | `e.shift_type = $n` |
| `sort` | `name` \| `hireDate` \| `basePay` \| `shiftType` | default `name` |
| `dir` | `asc` \| `desc` | default `asc` |

Model: `EmployeeModel.getAllEmployees(options)` → `{ rows: Employee[], total: number }`.
Sort map: `name → e.name`, `hireDate → e.hire_date`, `basePay → e.base_pay`, `shiftType → e.shift_type`; tie-break `e.employee_id`.

Tab → `type` mapping in the renderer: Employees tab → `other`, Nurses tab → `nurse`, Doctors tab → `doctor`.

**Breaking change for the cron:** `src/app/cron/employeePaymentCron.ts:68` calls `EmployeeModel.getAllEmployees()` and iterates the result — must become `const { rows } = await EmployeeModel.getAllEmployees()`. Same for the existing assertion in `Employee.Model.spec.ts`.

### 3.2 `GET /api/doctors` — doctors tab (extend existing)

Auth unchanged.

| Param | Values |
|---|---|
| `page`, `pageSize`, `all` | as above |
| `search` | `e.name ILIKE` |
| `isActive` | `d.is_active` (the joined column shadows `e.is_active` in the payload — filter the same column the UI displays) |
| `shiftType` | `e.shift_type` |
| `doctorType` | `d.doctor_type` (`attending` \| `referring` \| …) |
| `sort` | `name` \| `doctorType` \| `hireDate` \| `dailyPay` \| `perPatientPay` \| `shiftType` |
| `dir` | `asc` \| `desc` |

Model: `DoctorModel.getAllDoctors(options)` → `{ rows, total }`, same shared-WHERE + count pattern, tie-break `e.employee_id`.

**Lookup consumer:** `src/renderer/src/pages/Patients/api.ts` `listDoctors()` must switch to `api.get<PaginatedResponse<Doctor>>("/doctors", { all: true }).then(res => res.data)`. That single function serves all five Patients call sites (`useStaffStatus.ts`, `useStaffLookups.ts`, `AdmitPatientDialog.tsx`, `PatientWizardMedicalStep.tsx`, `PatientWizardAdmissionStep.tsx`), so no per-caller edits are needed.

### 3.3 `GET /api/employee-payments/pending` — grouped pending work queue (new)

Registered **before** `/:id`. Auth: `checkPermission("manage_payments")`.

| Param | Values |
|---|---|
| `page`, `pageSize` | default `1` / `25` |
| `from`, `to` | `YYYY-MM-DD`, on `ep.issued_timestamp` — `>= $from::date` and `< $to::date + interval '1 day'` (same convention as clock-ins) |
| `search` | employee name `ILIKE` |
| `sort` | `employee` \| `oldest` \| `newest` \| `totalAmount` |
| `dir` | `asc` \| `desc` (default `asc` = oldest group first, matching today's behaviour) |

Query: `EmployeePayment ep JOIN Employee e ON e.employee_id = ep.employee_id`,
`WHERE ep.is_paid = false AND ep.is_void = false AND ep.paid_by_user_id IS NULL` + filters,
`GROUP BY ep.employee_id, e.name`,
`ORDER BY <sort> <dir> NULLS LAST, ep.employee_id` + `LIMIT/OFFSET`.
`total` = `COUNT(*)` of the grouped subquery (i.e. number of employees with matching pending payments), **not** the payment count.

Response row (**no embedded payments**):

```ts
{
  employeeId: number
  employeeName: string
  paymentCount: number      // COUNT(*)
  oldestIssuedAt: string    // MIN(issued_timestamp)
  newestIssuedAt: string    // MAX(issued_timestamp)
  totalAmount: number       // SUM(payment_amount + COALESCE(extra_amount, 0))
}
```

### 3.4 `GET /api/employee-payments/pending/stats` (new)

Same auth, same `from`/`to` filter. Returns:

```ts
{ pendingCount: number, employeeCount: number }
```

so the “{{count}} pending payments” line reflects the whole queue, not just the current page. One aggregate query over the same predicate.

### 3.5 `GET /api/employee-payments/pending/employee/:id` (new — lazy expansion)

Same auth and `from`/`to` params. Returns the **bare array** of that employee's matching pending payments (`is_paid=false AND is_void=false AND paid_by_user_id IS NULL`, ordered `issued_timestamp ASC`). Called only when a group row is expanded.

### 3.6 `PUT /api/employee-payments/pending/employee/:id/paid` and `/void` (new — bulk actions)

Because the group row no longer carries payment ids, “Mark all paid” / “Void all” must be server-side. Both accept the same optional `from`/`to` scope, apply the same pending predicate, and return `{ updated: number }`. Implemented as a single `UPDATE … WHERE employee_id = $1 AND is_paid = false AND is_void = false AND paid_by_user_id IS NULL [AND date range] RETURNING payment_id` inside the existing audit-friendly path.

### 3.7 `GET /api/employee-payments` (consistency only)

Add `page` / `pageSize` / `all` + envelope. No renderer caller remains after this change; keeping the endpoint consistent avoids a non-enveloped outlier. `GET /employee-payments/employee/:id` and `/paid/employee/:id` stay unpaginated — inherently bounded to one employee and still used by the detail sheet / history.

---

## 4. Backend file changes

| File | Change |
|---|---|
| `src/app/models/Employee.model.ts` | `getAllEmployees(options: EmployeeListOptions = {})` → `{ rows, total }`; add `EmployeeListOptions`, `EMPLOYEE_SORT_COLUMNS`, `buildEmployeeWhere` |
| `src/app/controllers/Employee.controller.ts` | `getAllEmployees` parses/sanitizes pagination + filters, returns `buildPage(...)`; `all` → `page: 1, pageSize: rows.length` |
| `src/app/models/Doctor.model.ts` | `getAllDoctors(options)` → `{ rows, total }`; `DOCTOR_SORT_COLUMNS`, shared WHERE builder |
| `src/app/controllers/Doctor.controller.ts` | paginated envelope + `all` + filters |
| `src/app/models/EmployeePayment.model.ts` | `getAllPayments(options)` → `{ rows, total }`; new `getPendingPaymentGroups(options)` → `{ rows, total }`; new `getPendingPaymentStats(options)` → `{ pendingCount, employeeCount }`; new `getPendingPaymentsForEmployee(id, {from,to})`; new `markPendingPaymentsPaid(employeeId, {from,to})` / `voidPendingPayments(employeeId, {from,to})` → `number` |
| `src/app/controllers/EmployeePayment.controller.ts` | paginated `getAllPayments`; new `getPendingPaymentGroups`, `getPendingPaymentStats`, `getPendingPaymentsForEmployee`, `markAllPendingAsPaid`, `voidAllPending` |
| `src/app/routes/employeePayment.routes.ts` | register in this order before `/:id`: `/pending`, `/pending/stats`, `/pending/employee/:id`, `PUT /pending/employee/:id/paid`, `PUT /pending/employee/:id/void` |
| `src/app/cron/employeePaymentCron.ts` | destructure `{ rows }` from `getAllEmployees()` |

Notes:
- `EmployeePayment.model` currently returns rows straight from `query`; keep the new methods returning `{ rows, total }` while the legacy single-employee methods stay arrays (documented in each docblock).
- Use `SUM(ep.payment_amount + COALESCE(ep.extra_amount, 0))::numeric` and coerce with `Number()` on both sides of the wire; `pg` returns `COUNT` as a string for bigint.

---

## 5. Frontend changes

### 5.1 `src/renderer/src/pages/Employees/api.ts`

```ts
listEmployeesPage(params)      // { page, pageSize, search, type, isActive, shiftType, sort, dir }
listAllEmployees(params?)      // { all: true } + .data
listDoctorsPage(params)        // { page, pageSize, search, isActive, shiftType, doctorType, sort, dir }
listAllDoctors(params?)
listPendingPaymentGroups(params)   // { page, pageSize, from, to, search, sort, dir }
listPendingPaymentStats(params)    // { from, to }
listPendingPaymentsForEmployee(id, params) // { from, to } → EmployeePayment[]
markAllPendingPaid(id, params)     // → { updated }
voidAllPending(id, params)         // → { updated }
listPaymentsByEmployee(id)         // existing /employee-payments/employee/:id, for the detail sheet
```

All params passed as explicit object literals with `undefined` for empty values.

### 5.2 Hooks

| Hook | Shape | Notes |
|---|---|---|
| `useEmployees(params)` (rewrite) | `{ employees, total, loading, error, refresh }` | one `type` per instance, 300 ms debounce on `search` |
| `useDoctorList(params)` (new) | `{ doctors, total, loading, error, refresh }` | replaces the doctors half of the old hook |
| `usePendingPaymentGroups(params)` (new) | `{ groups, total, loading, error, refresh }` | normalizes `paymentCount` / `totalAmount` to numbers |
| `usePendingPaymentStats(from, to)` (new) | `{ pendingCount, employeeCount, loading, error, refresh }` | drives the count line |
| `usePendingPaymentsForEmployee(employeeId, range, enabled)` (new) | `{ payments, loading, error, refresh }` | fetch only while expanded |
| `useEmployeePaymentHistory(employeeId, enabled)` (new) | `{ payments, paidByNames, loading, error }` | replaces `paymentsByEmployee` for the detail sheet; keeps the lazy `resolveUserNames` cache |
| `useEmployeePayments.ts` | **delete** | its two derivations are replaced by the hooks above |

All fetch effects keep the `// eslint-disable-next-line react-hooks/set-state-in-effect` before `setLoading(true)` and bump-a-nonce `refresh`.

### 5.3 `EmployeesPage.tsx`

Remove: `staffFilters`, `tabEmployees`, `filteredEmployees`, `filteredDoctors`, `workQueueGroups`, `employeeNames`, `pendingForEmployee`, the `mountedRef` tab refetch effect, and `matchesDateRange`/`issuedTimeOf` helpers.

Add state (per tab so each remembers its own position):
- `staffPage` / `staffPageSize` (Employees + Nurses share the staff table component but each tab keeps its own page — key the table by tab so state resets naturally), `doctorPage` / `doctorPageSize`, `paymentsPage` / `paymentsPageSize`.
- `staffSort` (Employees/Nurses) and `doctorSort` remain distinct; `paymentsSort` (`{ columnId, direction }`, default `oldest asc`).
- Keep existing shared filters (`search`, `statusFilter`, `shiftFilter`, `doctorTypeFilter`) and `dateRange`; **add** `paymentSearch` dedicated to the Payments queue (the staff search box must not filter payments).

Behaviour:
- Every filter / sort / pageSize handler resets **its own** page to 1.
- Hooks are gated by the active tab (`enabled = tab === "employees" | "nurses" | "doctors" | "payments"`) so only one list request is in flight.
- `refreshAll()` → `staff.refresh()`, `doctors.refresh()`, `groups.refresh()`, `stats.refresh()`; called after create/update/delete/pay/void.
- Delete clamps the affected tab: `lastPageAfterRemoval(total, pageSize)`.
- “Mark all paid” / “Void all” call the new bulk endpoints with the active `dateRange`, then `refreshAll()`. No per-payment loop in the page any more.
- `PaymentGroup` rows come straight from `groups`; each row’s expansion state is per-row.
- One combined error toast per source (staff / doctors / payments) instead of the split `loadError` handling.

### 5.4 Components

- `EmployeeTable.tsx`, `DoctorTable.tsx`: add `pagination: DataTablePaginationSlot`, pass it to `DataTable`, delete the client-side `sorted` memo. Sortable columns keep driving `onSortToggle` (server does the work).
- `PaymentsTable.tsx`:
  - `PaymentGroup` becomes the server row shape: `{ employeeId, employeeName, paymentCount, oldestIssuedAt, newestIssuedAt, totalAmount }` (drop the `payments` array).
  - Drop the `employeeNames` prop; `employeeName` / `totalAmount` / date-range columns read the row directly.
  - Add `pagination`, `sort`, `onSortToggle`, `search` (placeholder `employees.placeholders.searchPayments`), and keep the date-range `Popover` in the header.
  - `renderExpanded` renders a new **`PaymentGroupDetails`** child component (hooks are not allowed inside the callback): it owns `usePendingPaymentsForEmployee`, shows a spinner / empty / error state, and per-payment `Mark paid` / `Void` buttons.
  - The “N pending payments” line reads `pendingCount` from the stats hook, not from the current page.
  - Add a `search` empty state distinct from the “nothing pending” state.
- `EmployeeDetailSheet.tsx`: accepts payments from `useEmployeePaymentHistory` (page-level, keyed by the current subject) and its docblock claim of “zero requests” is corrected to “one request per opened employee”.
- `EmployeesPage` passes `pagination` to all three tables with `pageSizes={[10, 25, 50, 100]}`.

### 5.5 i18n (`employees.en.json` / `employees.ar.json`)

New keys only (existing filter/label keys are reused):

| Key | en | ar |
|---|---|---|
| `messages.noMatchesStaff` | “No employees match your filters” | “لا يوجد موظفون يطابقون عوامل التصفية” |
| `messages.noMatchesStaffDesc` | “Try a different search term or clear the filters.” | “جرّب كلمة بحث مختلفة أو امسح عوامل التصفية.” |
| `messages.noMatchingPayments` | “No pending payments match your filters” | “لا توجد مدفوعات معلّقة تطابق عوامل التصفية” |
| `messages.searchPaymentsPlaceholder` | “Search employees…” | “البحث عن موظفين...” |

`messages.pendingPaymentsCount` and `messages.noPendingPayments` are reused as-is.

---

## 6. Tests

**Backend (new/updated specs under `src/app/tests/`)**

- `models/Employee.Model.spec.ts` — update the existing `getAllEmployees()` call + query-spy assertion for `{ rows, total }`; add pagination (2 pages, stable total 5), `type` filters (`doctor` 2, `nurse` 2, `other` 1), `search` ("Nurse" → 2), `isActive`, `shiftType` (`morning` → 1), sort `hireDate` asc/desc.
- `models/Doctor.model.spec.ts` (new) — 2 seeded doctors: total, pagination, `doctorType` filter, `search`, `isActive` on `d.is_active`, sort `dailyPay` / `doctorType`, `all` (unbounded = total).
- `models/EmployeePayment.model.spec.ts` (new) — **seeds contain zero system-pending rows**, so insert explicit `is_paid=false, is_void=false, paid_by_user_id=NULL` rows for two employees (one with 2 payments, one with 1); assert grouped totals (2 groups), `paymentCount` / `totalAmount` sums, oldest-first default order, `search` by name, `from`/`to` filtering, pagination with `pageSize: 1`, stats `{ pendingCount: 3, employeeCount: 2 }`, per-employee lazy fetch, and bulk paid/void updating exactly the scoped rows (`updated` count + post-state).
- `controllers/EmployeePayment.controller.spec.ts` (new) — envelope shape for the grouped queue, `pageSize`/`page` honoured, stats body, 200 + `{ updated }` for the bulk routes, invalid `from`/`to`/`sort` ignored (still 200).
- `controllers/Employee.controller.spec.ts` (new, optional but cheap) — envelope + `all=true` + filter pass-through.

**Renderer** — no page tests exist today; the suite must stay at 15 files / 135 tests green.

---

## 7. Verification

```powershell
npx tsc -p src/app/tsconfig.json --noEmit
npx tsc -p src/renderer/tsconfig.json --noEmit
npm run test:renderer -- --run          # expect 15 files / 135 tests
$env:NODE_ENV="test"; npx jasmine --filter="Employee"   # Employee + Doctor + EmployeePayment specs
npm run check-i18n                      # baseline: ~1695 used / 26 missing / 1161 unused (pre-existing)
npm run build
npx eslint <touched files>
```

Known pre-existing failures (not regressions, do not fix here): 24 unrelated jasmine failures (DrugCard/DrugShipment/DrugUsage, Vault reports, `EmployeeModel` query-spy arg count *if not updated*, `PatientModel` ordering, `VaultModel` profit off-by-one) and the `ServiceModel.updateService` unconditional `serviceData.prices.map(...)` bug at `src/app/models/Service.model.ts:291-299`.

---

## 8. Commit

Message: `feat(employees): server-side pagination, filtering and sorting`

Stage:
- all backend files in §4 + the new/updated specs,
- `src/renderer/src/pages/Employees/{EmployeesPage.tsx,api.ts,types/employee.ts}`,
- `src/renderer/src/pages/Employees/hooks/*` (rewritten/new, deleted `useEmployeePayments.ts`),
- `src/renderer/src/pages/Employees/components/{EmployeeTable,DoctorTable,PaymentsTable,PaymentGroupDetails,EmployeeDetailSheet}.tsx`,
- `src/renderer/src/pages/Patients/api.ts` (`listDoctors` → `all=true`),
- `src/renderer/src/locales/employees.{en,ar}.json`,
- `.opencode/plans/employees_pagination_plan.md` (copy of this file),
- **`package.json` and `package-lock.json`** (explicitly requested for this commit — they are the long-standing dirty files carried since before the Services work).

Do **not** include unrelated files.

---

## 9. Risks / edge cases

- **Cron regression**: forgetting the `{ rows }` destructure silently paginates the cron to 25 employees — covered by the updated `Employee.Model.spec.ts` assertion.
- **Payments page shrink**: bulk-paying or voiding the last group on a trailing page must clamp with `lastPageAfterRemoval`, never an effect.
- **Expanded row after bulk action**: the group may disappear from the page; clear its expansion state and its cached payments on refresh.
- **`d.is_active` vs `e.is_active`**: filter and sort the column the UI shows (`d.is_active`), otherwise the toggle looks broken.
- **Numeric coercion**: `pg` returns `COUNT`/`SUM` as strings — coerce in the model (`Number(...)`) *and* keep the renderer defensive with `Number(row.x ?? 0)`.
- **Route order**: every new `/pending…` literal must be registered before `/:id` in `employeePayment.routes.ts`.
- **Patients module**: `listDoctors` is shared by five call sites — the `all=true` + `.data` unwrap must land in the same commit or those screens break.
