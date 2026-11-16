# Phase 7 & 8 — Implementation Record

**Status:** complete  
**Plan:** `.opencode/plans/phase_7_8_plan.md`  
**Baseline commit:** `5f5376a`  
**Branch:** `react-refactor`

## 1. What shipped

Phase 7 moved the production UI from the deleted vanilla surface to the built React SPA and removed the legacy page/report backend. Phase 8 finished the motion, accessibility, and cleanup work, including the five pre-existing Employees type errors and the backend test drift that blocked a clean server typecheck. The Ctrl+K navigation palette shipped as its own follow-up commit.

The production layout now follows the product decision for a single server bundle:

- Renderer: `dist-electron/app/renderer`
- Server: `dist-electron/app`
- Electron client: `build/electron`
- Electron continues to load the configured remote `serverUrl`; the MSI does not bundle Express.

Commits:

| Commit | Scope |
|---|---|
| `1aca7ce` | Phase 7 — Express integration and legacy page/report retirement |
| `eb3e806` | Phase 8 — polish, accessibility, legacy cleanup, type/test fixes |
| `4415afe` | Ctrl+K permission-aware navigation palette |
| `0b10fef` | Backend test-helper teardown ordering fix and stale TopBar comment |
| _(this commit)_ | This implementation record |

## 2. Phase 7 — Express integration

### Server entry

`src/app/index.ts` now:

- Serves `dist-electron/app/renderer` with `express.static(..., { index: false })`.
- Keeps `/health` and adds `/api/health` for Electron's `testServerConnection`.
- Mounts `/api` before the SPA fallback.
- Returns `404 {"error":"Not found"}` for every unknown `/api/*` path instead of returning the SPA shell.
- Uses the Express 5-compatible history fallback `app.get("/{*splat}")` to send `index.html` for client-side routes.
- Starts the same patient-renewal and employee-payment cron jobs.

Removed:

- The legacy `/assets`, `/css`, `/js`, `/utils`, and `/locales` static mounts.
- The legacy `/` login page send and the `views/404.html` fallback.
- `src/app/routes/page.routes.ts`.
- `src/app/controllers/navigation.controller.ts` (the `/navigation` endpoint was deleted per product decision).
- `src/app/routes/report.routes.ts`, `src/app/controllers/Report.controller.ts`, and `src/app/models/Report.model.ts`.
- The legacy `reportRoutes` import and `/api/reports` shadow mount.

### Build output

`src/renderer/vite.config.ts` now writes to `../../dist-electron/app/renderer` and no longer proxies `/navigation`. `npm run build` is sequential:

```text
build:renderer && build:app && copyDist
```

`copyDist` copies only the Electron shell assets/views. The renderer is emitted directly into the server bundle, so no renderer copy step remains.

### Verification

Built-server smoke test (`node dist-electron/app/index.js` on a temporary port):

- `/` → `200`, contains the React root.
- `/patients/123` → `200`, contains the React root.
- `/health` → `200`.
- `/api/health` → `200`.
- `/assets/index-*.js` → `200`.
- `/api/does-not-exist` → `404` with JSON `{"error":"Not found"}`.

## 3. Phase 8 — Polish, accessibility & cleanup

### Motion

- `AppShell.tsx` wraps `<Outlet />` in a `key={location.pathname}` container with `animate-in fade-in-0 duration-150`.
- `DataTable.tsx` applies `motion-safe:animate-row-in` to body rows with a capped `animationDelay` of `min(rowIndex, 9) * 50ms`.
- `index.css` adds the `row-in` keyframe and `@utility animate-row-in`. Because the class is applied through `motion-safe`, reduced-motion users do not receive either the animation or its delay.
- `components/ui/sidebar.tsx` width transitions now use `duration-200 ease-in-out` instead of `ease-linear`.

### Accessibility

- `AppShell.tsx` adds a skip link to `#main-content`, and `<main>` has `id="main-content"` and `tabIndex={-1}`.
- `TopBar.tsx` uses `t("topbar.toggleNavigation")` instead of a hardcoded aria-label.
- `DataTable.tsx`:
  - The table region has an accessible name from `ariaLabel`, the caption, or `common.table`.
  - The clear-search button uses `common.clearSearch`.
  - The expand-column header uses `common.expand`.
  - The empty-state row `colSpan` accounts for the expand column.
  - The skeleton renders an expand placeholder when expansion is enabled.
- `lib/navigation.ts` aligns the sidebar Patients entry with the route guard: `view_patients` instead of `manage_patients`.

### Employees TypeScript fixes

The five pre-existing renderer errors are resolved:

| File | Fix |
|---|---|
| `types/employee.ts` | `ExtraPaymentType` now includes `"both"` |
| `api.ts` | Explicit `paymentCalculation` → `extraPaymentType` mapper (`fixed` → `none`) |
| `schemas/employee.schema.ts` | `extraPaymentType` enum includes `"both"` |
| `PaymentsTable.tsx` | Typed `reduce<number>`, removed synthetic row `key`, `getRowId` uses `employeeId` |
| `EmployeesPage.tsx` | Calls `isAdmin()` instead of testing the function object |
| `EmployeeModal.tsx` | Base reset object annotated as `EmployeeFormValues` |

`npx tsc -p src/renderer/tsconfig.json --noEmit` is clean.

### Backend test drift

Four existing model specs were updated to match current return types and DTOs:

- `DrugCard.model.spec.ts` uses `{ rows, total }`.
- `Patient.model.spec.ts` uses `{ rows, total }`, adds `national_id`, and narrows the `createPatient` union.
- `Employee.Model.spec.ts` adds the required shift times and updates the 15-slot query expectation.
- `DrugUsage.model.spec.ts` adds `patient_history_id` to all create payloads.

`npx tsc -p src/app/tsconfig.json --noEmit` and `npm run typecheck` are clean.

The legacy jasmine suite itself is not functional, so the backend runtime tests were not used as an acceptance gate. While investigating the teardown failure, `db.helper.ts` was still corrected to delete `NursePatientHistory` before `PatientHistory`; the table has a non-cascading foreign key and the old order could fail once nurse-history seeds were present.

### Legacy cleanup

Deleted:

- `src/app/views/` — all legacy HTML, CSS, vanilla TS, and locale JSON.
- `src/app/assets/` — vendored Bootstrap, Bootstrap Icons, jQuery, SweetAlert2, toastr, Chart.js, and pdfmake copies.
- `src/app/check-i18n-keys.js`.

Updated:

- `package.json`: removed `bootstrap`, `@popperjs/core`, `sweetalert2`, `toastr`, `chart.js`, and `@types/toastr`; removed the legacy i18n script; `check-i18n` is renderer-only; `typecheck` targets the renderer and server configs.
- `electron-builder.json`: removed the `src/app/assets` extra resource.
- `tsconfig.app.json`: includes only `src/renderer/src`.
- `src/electron/tsconfig.json`: removed the stale Bootstrap and SweetAlert exclusions.
- `AGENTS.md`: rewritten for the React-only architecture, single-bundle server output, sequential scripts, targeted typechecks, and renderer-only i18n.
- Removed the stale `check-i18n-keys.js` `.gitignore` entry.

## 4. Ctrl+K navigation palette

Added:

- `src/renderer/src/lib/commandPalette.ts` — flattens the permission-filtered `NAV_CONFIG` tree into page entries.
- `src/renderer/src/components/layout/CommandPalette.tsx` — `CommandDialog` with `Ctrl+K` / `Cmd+K`, search input, empty state, and permission-filtered navigation.
- `TopBar.tsx` search trigger with an accessible label and shortcut hint.
- English and Arabic topbar keys.
- `src/renderer/test/commandPalette.spec.ts` — four cases for unauthenticated, limited, admin, and duplicate destinations.

The palette never exposes pages outside the same `filterNavForUser` tree used by the sidebar.

## 5. Verification

| Check | Result |
|---|---|
| `npm run build` | Pass — Vite emitted 3,994 modules into `dist-electron/app/renderer`; Electron and server TypeScript compiled; Electron assets copied |
| `npm run typecheck` | Pass |
| `npx tsc -p src/renderer/tsconfig.json --noEmit` | Pass |
| `npx tsc -p src/app/tsconfig.json --noEmit` | Pass |
| `npm run test:renderer` | Pass — 15 files, 135 tests |
| `npm run check-i18n` | Pass with pre-existing debt — 1,691 used, 26 missing, 1,161 unused |
| `npm run lint` | Fails on the pre-existing repository backlog — 532 problems (493 errors, 39 warnings); no new findings in the touched files |
| Backend `npm test` | Skipped — legacy jasmine suite is not functional (product directive); server typecheck passes |
| Built-server SPA smoke | Pass — see Phase 7 smoke results |

## 6. Code debt / follow-ups

- **Lint backlog:** 532 pre-existing lint problems remain, overwhelmingly backend `no-explicit-any`, `no-useless-catch`, unused variables, shadcn fast-refresh export warnings, and React Compiler/RHF warnings. A focused lint pass on the touched renderer files is clean. Full cleanup is deferred.
- **Backend tests:** the legacy jasmine suite is not functional and was not part of this phase's acceptance gate. The model specs were still aligned with current DTOs/return shapes so the server TypeScript build stays clean.
- **Transactions:** `code_debt_transactions.md` still tracks 55 pooled `BEGIN`/`COMMIT` blocks across 17 files. This phase did not change transaction handling.
- **i18n:** 26 missing keys and 1,161 potentially unused renderer keys remain. Dead-key pruning was explicitly deferred; the missing keys are pre-existing and outside this phase.
- **Electron config UI:** `src/electron/views/config.html` and `connection-error.html` reference Bootstrap CSS/JS paths that are not present under `src/electron`. This was already broken before Phase 7/8 and was not rewritten.
- **Page-view audit:** Removing the Express page routes removes the legacy page-view audit records. The product decision accepted this; API mutation audit logging remains in place.
- **Build directory hygiene:** local `dist-electron/app` may retain stale `views/` and `assets/` directories from pre-Phase-8 builds. Clean the output directory before packaging a release if those directories are present.
- **Navigation permission:** the sidebar now matches the `/patients` route guard (`view_patients`). Server-side API authorization is unchanged and remains the source of truth.
