# Phase 7 & 8 — Express Integration, Polish, Accessibility & Cleanup

**Status:** complete — see `.opencode/plans/phase_7_8_implementation.md`  
**Baseline commit:** `5f5376a`  
**Branch:** `react-refactor`  
**Supersedes:** Phase 7/8 sketches in `react_implementation_plan.md` (lines 1073-1131) where they conflict with the decisions below.

## 1. Decisions locked with the product owner

| # | Decision |
|---|----------|
| 1 | **Single build layout**: Vite writes to `dist-electron/app/renderer`; Express serves `path.join(__dirname, "renderer")`. |
| 2 | Electron continues to load the configured remote `serverUrl`; the MSI does **not** package or start Express. |
| 3 | Remove all legacy renderer/backend items. |
| 4 | Add the `Ctrl+K` navigation command palette as a separate phase/commit. |
| 5 | Include a skip link (explanation in §5.2). |
| 6 | Delete `/navigation` from Express, `navigation.controller.ts`, and the Vite dev proxy. |
| 7 | Losing legacy page-view audit entries is accepted; API mutation auditing stays. |
| 8 | Remove `chart.js` with the other legacy dependencies. |
| 9 | Fix the five pre-existing Employees TypeScript errors. |
| 10 | Make build scripts sequential (`&&`, not `&`). |
| 11 | Defer i18n dead-key pruning (1,201 keys); do not delete unproven keys. |
| 12 | Delete `src/app/assets`. |
| 13 | Add `/api/health` as an alias of `/health` for the Electron probe. |

## 2. Phase 7 — Express integration

### 2.1 Runtime topology

```text
dist-electron/
  app/
    index.js              ← Express entry (`tsc` output)
    routes/ ...
    renderer/             ← Vite output (index.html + hashed assets)
```

Express resolves the SPA relative to its own compiled directory:

```ts
const rendererDist = path.join(__dirname, "renderer")
```

This removes the old `build/renderer` and sibling `dist-electron/renderer` assumptions.

### 2.2 `src/app/index.ts`

- Remove `pageRoutes` import and the legacy static mounts:
  - `/assets` → `src/app/assets`
  - `/css`, `/js`, `/utils`, `/locales` → `src/app/views/*`
- Serve the built SPA with `express.static(rendererDist, { index: false })` **before** `/api`.
- Keep `/health`; add `GET /api/health` with the same payload. Update the stale `0.3.42` version to `0.4.04`.
- Mount `/api` as today.
- Add an explicit JSON 404 after `apiRoutes` so unknown API paths never return `index.html`.
- Add an Express 5 SPA fallback using `app.get("/{*splat}", ...)` (never `app.get("*")`; Express 5 rejects it).
- Delete the legacy `/` login sendFile and the `404.html` sendFile.
- Keep both cron jobs and `app.listen`.

### 2.3 Route/controller removal

Delete:

- `src/app/routes/page.routes.ts`
- `src/app/controllers/navigation.controller.ts`
- `src/app/routes/report.routes.ts`
- `src/app/controllers/Report.controller.ts`
- `src/app/models/Report.model.ts`

Remove the `reportRoutes` import and `/reports` mount from `src/app/routes/api.routes.ts`. The new `reportsRoutes` mount stays.

### 2.4 Vite

- Change `build.outDir` to `path.resolve(__dirname, "../../dist-electron/app/renderer")`.
- Remove the `/navigation` dev proxy entry.
- Keep `emptyOutDir: true`; it only empties the renderer subdirectory.

### 2.5 Scripts/package

- `build`: `npm run build:renderer && npm run build:app && npm run copyDist`
- `dev:te`: `npm run build && electron .`
- `build:t`: `npm run build && npm test`
- `dist`: `npm run build && electron-builder --win --x64`
- `copyDist`: stop copying `src/app/views` and `src/app/assets`.

### 2.6 Phase 7 acceptance criteria

- `GET /patients/123` returns the SPA shell (deep-link refresh works).
- Hashed `/assets/*` files load from `dist-electron/app/renderer/assets`.
- `/api/*` still works; unknown `/api/*` returns JSON 404.
- `/health` and `/api/health` return `200` with version `0.4.04`.
- No legacy page route, page static mount, `/navigation`, or legacy reports router remains.
- `npm run build` produces `dist-electron/app/index.js` and `dist-electron/app/renderer/index.html`.

## 3. Phase 8 — Polish, accessibility, cleanup

### 3.1 Motion

- `AppShell`: keyed `<div key={location.pathname} className="animate-in fade-in-0 duration-150">` around `<Outlet />`; add `motion-safe` if needed. The global reduced-motion guard covers duration.
- Sidebar width transitions: change `ease-linear` → `ease-in-out` for the width/left-right transitions only.
- DataTable rows: add `@keyframes row-in` (opacity + translateY) and a `motion-safe:animate-row-in` style with `animationDelay = min(rowIndex, 9) * 50ms`. Cap at 10 visible rows. Add a reduced-motion override that removes the animation entirely so the delay cannot hide rows.
- Button press: optional `active:scale-[0.97]` on the shared Button, matching design.md §10; keep it contained.

### 3.2 Accessibility

**What a skip link is:** the first focusable control on the page, visually hidden until it receives keyboard focus. Pressing Tab once reveals “Skip to content”; activating it moves focus past the sidebar and top bar to `<main id="main-content" tabindex="-1">`. This is a WCAG 2.4.1 bypass-blocks requirement and is especially useful in this app because the sidebar contains many links before page content in DOM order. It is included.

- `AppShell`: skip link as the first focusable element; `main` gets `id="main-content"` and `tabIndex={-1}`.
- `TopBar`: replace hardcoded `aria-label="Toggle navigation"` with `t("topbar.toggleNavigation")`.
- `DataTable`:
  - name the `role="region"` scroll wrapper via `aria-label`;
  - replace hardcoded “Clear search” with `t("common.clearSearch")`;
  - replace hardcoded “Expand” column header with `t("common.expand")`;
  - fix the empty-state `colSpan` to account for the expansion column.
- Verify icon-only buttons and form labels; most already use `Label`/`FieldLabel` and `htmlFor`.
- Dialogs/Radix focus trapping, Sonner `aria-live`, chart `ChartSrTable`, and one `<h1>` per page are already in place; verify, do not rewrite.
- Add i18n keys in `common.{en,ar}.json` and `topbar.{en,ar}.json`.

### 3.3 Cleanup

Delete:

- `src/app/views/` (all legacy HTML/CSS/JS/locales)
- `src/app/assets/` (vendored Bootstrap/SweetAlert/toastr/chart.js/pdfmake copies)
- `src/app/check-i18n-keys.js`

Update:

- `package.json`: remove `bootstrap`, `@popperjs/core`, `toastr`, `sweetalert2`, `chart.js`, `@types/toastr`; remove `check-i18n:legacy`; make `check-i18n` renderer-only; remove legacy `copyDist` entries.
- `tsconfig.app.json`: remove the three deleted legacy include paths.
- `electron-builder.json`: remove `src/app/assets/**/*` from `extraResources`.
- `AGENTS.md`: replace the stale “static HTML/JS renderer” description; update build, i18n, and command sections.

### 3.4 Employees TypeScript fixes

1. `api.ts`: map `PaymentCalculation` → `ExtraPaymentType` explicitly (`fixed` → `none`, `per_patient` → `per_patient`, `both` → `both`); add `"both"` to `ExtraPaymentType`.
2. `PaymentsTable.tsx`: type `reduce<number>`; drop the synthetic `key` and use `employeeId` for `getRowId`.
3. `EmployeesPage.tsx`: call `isAdmin()`.
4. `EmployeeModal.tsx`: annotate the reset object as `EmployeeFormValues`.

### 3.5 Phase 8 acceptance criteria

- Skip link works with keyboard only and is invisible otherwise.
- Page/row motion works and respects reduced motion.
- No hardcoded “Expand” / “Clear search” / “Toggle navigation” remain in the touched components.
- DataTable region and table have accessible names.
- `npx tsc -p src/renderer/tsconfig.json --noEmit` is clean.
- Legacy views/assets/locales/scripts/dependencies are gone.
- `npm run lint`, `npm run build`, `npm run test:renderer`, `npm test`, `npm run check-i18n` pass.

## 4. Ctrl+K command palette (separate commit)

- Add `GlobalCommandPalette` using `components/ui/command.tsx`.
- Flatten `NAV_CONFIG` through `filterNavForUser` so only permitted destinations appear.
- `Ctrl+K` / `Cmd+K` opens it; `TopBar` gets an accessible search trigger.
- Navigate and close on selection.
- Add baked i18n keys under `topbar`.
- Test keyboard open/close, filtering, RTL, and permission filtering.

## 5. Code-debt audit (past phases)

| Item | Disposition |
|------|-------------|
| 55 pooled `BEGIN`/`COMMIT` blocks across 17 files (`code_debt_transactions.md`) | Out of scope; record as deferred. |
| Root `npm run typecheck` uses solution `tsc --noEmit` and is unreliable | Use targeted `-p` checks; document. |
| Health version stale (`0.3.42`) | Fix in Phase 7. |
| Nav patients permission `manage_patients` vs route `view_patients` | Align nav to `view_patients`. |
| `ExtraPaymentType` missing `"both"` | Fix in Phase 8. |
| DataTable hardcoded strings / missing region name / colSpan | Fix in Phase 8. |
| Mobile sidebar hardcoded Sheet labels | Optional a11y cleanup if touched. |
| Page-view audit entries disappear | Accepted. |
| 1,201 unused i18n keys | Deferred. |

## 6. Commit plan

1. `docs(plans): add Phase 7 & 8 plan`
2. `refactor(server): serve the React SPA and remove legacy page routes`
3. `refactor(renderer): finish Phase 8 polish, accessibility, and cleanup`
4. `feat(renderer): add Ctrl+K navigation palette`
5. `docs(plans): record Phase 7 & 8 implementation results`
