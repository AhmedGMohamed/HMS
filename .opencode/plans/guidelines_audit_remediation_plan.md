# Guidelines Audit Remediation Plan — HMS React Renderer

**Date:** 2026-11-15
**Repo:** `D:\Work\HMS` (Electron client + Express/PostgreSQL server + React renderer)
**Status:** Ready for execution (planning artifact only — no source changes have been made)
**Scope:** `src/renderer/src/pages/**` — 17 route pages, plus the shared primitives those pages depend on.

## 1. Source rule sets

| Rule set | Location | Applied subset |
| --- | --- | --- |
| Vercel React Best Practices | `.agents/skills/react-best-practices/AGENTS.md` (v1.0.0, Jan 2026; rule files under `.agents/skills/react-best-practices/rules/`) | Client-SPA rules only: async waterfalls (`async-parallel`, `async-cheap-condition-before-await`), bundle splitting (`bundle-conditional`, `bundle-barrel-imports`, `bundle-dynamic-imports`), rerender isolation (`rerender-*`, `rerender-memo`, `rerender-derived-state`), rendering/JS cost (`js-*`, `js-set-map-lookups`, `js-early-exit`), state/effect hygiene (`advanced-*`). Server/route-handler rules are out of scope. |
| Vercel Web Interface Guidelines | 2026-11-15 snapshot (a11y, focus, forms, motion, i18n/number/date formatting, locale-aware output) | Applied to every page surface and shared primitive. |

> A second copy of the React rulebook exists at `.agents/skills/vercel-react-best-practices/` (different content hash). This plan cites **`react-best-practices/AGENTS.md`** only. Do not edit either copy, and do not treat their differences as an in-repo defect to fix.

**Project contracts referenced repeatedly** (`design.md`, repo root):

- **§6.2 Data tables** — `DataTable` composes shadcn `Table`/`Skeleton`/`Pagination`/`EmptyState`; loading state is **5–8 skeleton rows**, never a centered spinner; sortable headers expose `aria-sort`; numeric columns use `tabular-nums`; pagination sits bottom-right with a page-size select (`10`, `25`, `50`, `100`).
- **§6.3 Forms & inputs** — labels always visible and **associated**; required fields carry a red `*` **and** `aria-required="true"`; validation messages render inline below the field (`text-danger text-xs`); on submit, **focus the first invalid field** via `form.setFocus(...)`; only category-level failures become toasts (inline errors must not be toast-only); multi-step wizards validate per step with `Next` disabled until valid.
- **§8 Accessibility** — keyboard operability, visible focus, correct roles/names, live regions for async status, no focusable-but-hidden content.

**Supporting repo facts (verified):**

- Renderer: React 19 + Vite 8 + Tailwind v4 + shadcn/Radix under `src/renderer/`. Aliases: `@/*` → `src/renderer/src/*`.
- i18n: one file per (namespace, locale) at `src/renderer/src/locales/<ns>.<lang>.json`; **both `en` and `ar` must be updated**. Eager namespaces: `common`, `sidebar`, `navigation`, `topbar`, `breadcrumbs`, `breadcrumb`, `userMenu`, `errors`, `auth`, `success`. Page namespaces are lazy: `login`, `dashboard`, `patients`, `pharmacy`, `services`, `vault`, `reports`, `insurance`, `users`, `roles`, `employees`, `clocking`, `medicalSupplies`, `priceLists`.
- Renderer tests live in `src/renderer/test/*.spec.ts(x)` (15 files), run by Vitest.
- Canonical verification commands (from repo root):
  - `npm run lint` (ESLint over `**/*.ts`/`**/*.tsx`)
  - `npm run test:renderer` (`vitest run --config src/renderer/vitest.config.ts`)
  - `npm run check-i18n` (`node src/renderer/scripts/check-i18n.mjs`; reports MISSING/UNUSED keys)
  - `npx tsc -p src/renderer/tsconfig.json --noEmit` — **never** root `tsc --noEmit` (solution-style config with `noEmit` references).

## 2. Totals and severity definitions

| Metric | Value |
| --- | --- |
| Route pages audited | 17 |
| **Blocking** findings | **73** |
| **Advisory** findings | **239** |

**Severity definitions**

- **BLOCKING** — one of: (a) accessibility breakage (unlabeled control, invisible focus, focusable-but-hidden content, missing role/name, non-keyboard-operable control), (b) broken or incorrect behavior (wrong data bound to wrong entity, silent failure, double-submit, stale/wrong values, validation that never runs), (c) anti-pattern that will regress (unhandled promise rejection, module-scoped ref shared across hook instances), (d) critical performance (per-second whole-page rerender, per-keystroke whole-report rebuild, unbounded request fan-out).
- **ADVISORY** — polish: duplication, dead code, naming, minor formatting, speculative memoization, copy/i18n nuance. Fixed opportunistically when already in the file, otherwise backlogged.

**Per-page verdicts (blocking / advisory)**

| # | Page (package) | Route/page root | B | A |
| --- | --- | --- | --- | --- |
| 1 | Login | `pages/Login/LoginPage.tsx` | 2 | 8 |
| 2 | Dashboard | `pages/Dashboard/DashboardPage.tsx` | 4 | 11 |
| 3 | Patients — list | `pages/Patients/PatientsPage.tsx`, `PatientListPanel.tsx` | 3 | 19 |
| 4 | Patient detail | `pages/Patients/PatientDetailPage.tsx` | 10 | 35 |
| 5 | Drugs | `pages/Drugs/DrugsPage.tsx` | 12 | 16 |
| 6 | Supplies | `pages/Supplies/SuppliesPage.tsx` | 12 | 13 |
| 7 | Employees | `pages/Employees/EmployeesPage.tsx` | 3 | 13 |
| 8 | Clocking | `pages/Clocking/ClockingPage.tsx` | 4 | 10 |
| 9 | Vault | `pages/Vault/VaultPage.tsx` | 3 | 10 |
| 10 | Insurance | `pages/Insurance/InsurancePage.tsx` | 6 | 41 |
| 11 | Reports | `pages/Reports/ReportsPage.tsx` | 3 | 21 |
| 12 | Services | `pages/Services/ServicesPage.tsx` | 3 | 11 |
| 13 | PriceLists | `pages/PriceLists/PriceListsPage.tsx` | 4 | 9 |
| 14 | Admin — Users | `pages/Admin/Users/UsersPage.tsx` | 0 | 6 |
| 15 | Admin — Roles | `pages/Admin/Roles/RolesPage.tsx` | 1 | 5 |
| 16 | NotFound | `pages/NotFound/NotFoundPage.tsx` | 1 | 3 |
| 17 | ComponentsDemo (dev-only) | `pages/_dev/ComponentsDemo/ComponentsDemoPage.tsx` | 2 | 8 |
| | **Total** | | **73** | **239** |

## 3. Guiding constraints (non-negotiable)

1. **Page-scoped commits.** A commit touches one page package (one page root directory) and nothing else. If a page's blocking work spans unrelated concerns *and* the diff is too large to review, **split within the page** (e.g. billing correctness vs. a11y wiring vs. formatting) — never merge two pages into one commit.
2. **Shared primitives first, in their own component-scoped commits.** `src/renderer/src/components/ui/*`, `components/common/*`, `components/charts/*`, `lib/utils.ts`, `lib/api.ts` are not page-scoped. Phase 1 lands them **before** any page commit. Page commits then *adopt* the primitive behavior (pass ids, use `role`/variant props) and *verify* it — they must not re-implement it.
3. **No broad rewrites, no opportunistic refactors.** While fixing a blocking item, do not deduplicate, rename, restructure, or extract abstractions. Dedup/mirror-collapsing/URL-state/virtualization/server aggregates live in the Backlog (§9). A fix that "needs" a new shared abstraction is a **stop-and-escalate** condition.
4. **Preserve behavior and public contracts** unless the audit names the behavior as the defect. Backward-compatible signatures only (new optional params, opt-in props).
5. **i18n discipline.** Every new/changed user-visible string is a key added to **both** `en` and `ar` files of the owning namespace. Never introduce hardcoded English/Arabic copy, `Intl` calls without a locale, or hand-rolled digit grouping.
6. **No `git push`.** No history rewriting, no `--amend` on reviewed commits, no force operations.
7. **Escalate instead of widening scope.** If a fix requires a shared-primitive change not enumerated in Phase 1, stop and report; do not silently edit `components/ui/*`, `components/common/*`, `lib/*` from a page commit.

## 4. Commit conventions

Format: `fix(<scope>): <summary>` — imperative, ≤ 72 chars, one concern per commit.

- **Commit bodies:** subject + short body (≤72-char subject; 1–2 sentence or 2–4 bullet body describing what/why). Applies to all `fix`/`chore`/`docs` commits going forward, including Phase 2 slices and ledger commits.
- Shared primitives: scope is the **component**, not the page:
  `fix(ui-field): auto-associate labels and wire aria-describedby`,
  `fix(stat-card): move focus ring to the interactive wrapper`,
  `fix(data-table): condition expanded-row aria-hidden on interactive content`,
  `fix(node-formatters): locale-aware numbers and configurable currency`.
- Page packages: scope is the page:
  `fix(drugs): derive KPIs from unfiltered list and refresh warehouses on mutation`,
  `fix(patient-detail): stop reporting billing success after a failed save`.
- If a page commit is split, each split keeps the same scope with a distinct summary:
  `fix(insurance): reset detail state and abort stale requests on company change`,
  `fix(insurance): group report rows by patient id instead of patient name`,
  `fix(insurance): associate modal validation errors and focus first invalid field`.
- Docs/plan-only commits (if used): `chore(plans): update remediation ledger`.
- Each commit must pass scoped verification (§5.1) *before* it is created.

**Example heavy-page split (Patient detail, 10 blockers → 5 commits):**

1. `fix(patient-detail): surface billing save failures instead of success toast`
2. `fix(patient-detail): keep money inputs as strings while typing`
3. `fix(patient-detail): reset settlement state per admission and require real bill ids`
4. `fix(patient-detail): associate labels, add heading levels, and localize durations`
5. `fix(patient-detail): remove PHI console logging`

## 5. Phase 0 — Baseline (do this first, commit nothing)

1. Ensure a clean-enough tree: `git status --porcelain` and record the inventory. **Known pre-existing state on 2026-11-15 (90 entries):** deletions under `.opencode/skills/react-best-practices/`, deleted `skills-lock.json`, modified `src/renderer/vitest.config.ts` (`__dirname` → `import.meta.dirname` in the alias), and untracked `.agents/skills/{vercel-react-best-practices,vercel-react-view-transitions,web-design-guidelines}/`. None of these are part of this work: never stage, revert, or "tidy" them, and never fold the `vitest.config.ts` change into a remediation commit. Baseline is measured on this working tree as-is.
2. Run and **record the output** (paste into the execution ledger, §11) for:
   - `npm run lint`
   - `npx tsc -p src/renderer/tsconfig.json --noEmit`
   - `npm run test:renderer` — **observed baseline on 2026-11-15:** 15 test files / 135 tests passing (~20 s). PowerShell may surface Node's pre-existing `--localstorage-file` warning as a `NativeCommandError`; the command still exits 0.
   - `npm run check-i18n` — snapshot the MISSING and UNUSED key counts per namespace.
3. Work on a single branch, e.g. `fix/guidelines-audit-remediation`. Do not push.
4. Baseline is "green" when lint exits 0, renderer typecheck exits 0, and all Vitest specs pass. If the baseline is already red, record the exact failures and treat **no new failure** as the bar for every later commit; escalate pre-existing red that blocks a target area.

### 5.1 Scoped verification recipe (used by every commit)

```powershell
# scoped typecheck (batch-level, cheap)
npx tsc -p src/renderer/tsconfig.json --noEmit

# scoped lint of exactly the touched paths
npx eslint <path1> <path2> ...

# scoped tests: run the whole renderer suite when hooks/shared code changed;
# otherwise the suite is small (15 specs) — run it in full
npm run test:renderer

# only when locale files changed
npm run check-i18n
```

**Command/output discipline:** never claim a commit is verified without the command output. If a command cannot run (env/db), say so explicitly and mark the commit `unverified`.

## 6. Phase 1 — Shared primitives (16 component-scoped commits)

Land strictly in this order (later items depend on earlier ones). `S01`–`S02` are lib-level and must land first because components and pages consume them.

---

### S01 — `fix(node-formatters): locale-aware numbers and configurable currency`

**Files:** `src/renderer/src/lib/utils.ts` (`formatCurrency` L15-19, `formatNumber` L56-62)

**Change**
- `formatCurrency(amount, locale = "en-US", currency = "EGP")` — add an **optional trailing** currency param. All existing call sites keep identical output.
- `formatNumber(n, decimals = 0, locale = "en-US")` — replace the two hand-rolled `replace(/\B(?=(\d{3})+(?!\d))/g, ",")` calls with `new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })`, keeping the existing non-finite → `0` coercion.
- Keep `resolveLocale(language)` as the single language→locale mapper; pages opt into `ar-EG` explicitly.

**Risk notes**
- Default params preserve old rendering (Latin digits, comma grouping) — do **not** change defaults to `resolveLocale`; that would silently switch digits everywhere at once.
- Switching a call site to `ar-EG` is expected to render Arabic-Indic digits; this is the point, but it is a **visible** change — call it out in each page commit.
- Rounding mode changes from `toFixed` (round-half-away-from-zero in practice) to `Intl` defaults; for `decimals = 0` values in this app, outputs match. No test asserts `formatNumber` today — do not add golden tests here.

**Acceptance:** scoped tsc + eslint on `lib/utils.ts`; `npm run test:renderer` green (`chartSrTable.spec.tsx`, `i18n.spec.ts` consume formatted output-adjacent code).

---

### S02 — `fix(api-client): normalize network failures into ApiError`

**Files:** `src/renderer/src/lib/api.ts` (`request()` L40 `await fetch(...)`), `src/renderer/src/lib/errors.ts`

**Change**
- Wrap the `fetch` call: `catch (cause)` → `throw new NetworkError(url, cause)` where `class NetworkError extends ApiError` (`statusCode = 0`, `code = "NETWORK_ERROR"`, message `"Network request failed"`). Keep `cause` for debugging.
- Export `isNetworkError(error)` from `lib/errors.ts`.
- Do **not** change any existing HTTP branch, the 401 side-effect, or the 204 path.

**Risk notes (important)**
- `instanceof ApiError` is used in **63 places** across the renderer. Every one of those branches will now also match transport failures with `statusCode === 0`. Phase 1 must **not** edit those call sites; page packages that display `err.message` directly for this case will temporarily show the English `"Network request failed"` string. Each affected page lists this explicitly in its advisory/blocking notes and replaces it with localized copy **inside its own package**.
- `useLogin.ts` and `PrivateRoute.tsx`/`authStore.ts` branch on `statusCode === 401` — unaffected (`NetworkError` is 0).
- Do not add retries here; retry policy is out of scope.

**Acceptance:** scoped tsc + eslint; `npm run test:renderer` green; a manual grep confirming no Phase-1 edits to page files.

---

### S03 — `fix(ui-field): auto-associate labels and wire aria-describedby`

**Files:** `src/renderer/src/components/ui/field.tsx` (`Field`, `FieldLabel` ~L100-125, `FieldDescription` ~L130-145, `FieldError` **function at L176** — it renders `null` when `errors` is empty and generates **no `id`**; `data-slot="field-error"` wrapper at L218)

**Change**
- Introduce a `FieldContext` (React context) that mints stable `useId()`-derived ids: `controlId`, `descriptionId`, `errorId`.
- `Field` provides the context (keeps `role="group"`; reflects `invalid` into `data-invalid` when provided).
- `FieldLabel` renders `htmlFor={controlId}` when no explicit `htmlFor` is passed.
- `FieldDescription` sets `id={descriptionId}`.
- `FieldError` sets `id={errorId}` and `aria-live="polite"` (no `role="alert"` — the error region is persistent while invalid; assertive is reserved for async failures).
- Add a helper hook `useFieldControlProps(options?: { invalid?: boolean; hasDescription?: boolean; required?: boolean })` exported from the same module:
  - `id: controlId`
  - `aria-invalid: invalid ? true : undefined`
  - `aria-describedby`: space-joined `descriptionId` (only when `hasDescription`) and `errorId` (only when `invalid`) — **never** emit a dangling id, because `FieldError` renders nothing when there are no errors.
  - `aria-required: required ? true : undefined`
- Backward compatible: all new props optional; explicit `id`/`htmlFor` props keep precedence.

**Risk notes**
- `Field` uses `useId()` — this changes DOM ids; nothing in the repo snapshot-tests fields, but verify `permissionGrid.spec.tsx` (uses `Label`-adjacent Radix markup indirectly) and any `getByLabelText` usage in specs still resolve.
- This is a **mechanism**, not an outcome: pages must still pass `invalid`/`hasDescription`/`required` and spread `useFieldControlProps(...)` onto the control. Phase 1 alone improves association only where `FieldLabel` + `Field` wrap the control.
- Because `FieldError` renders `null` when empty, `aria-describedby` must be gated on `invalid` at the call site (see option names above) — do not hardcode `errorId` into `aria-describedby` unconditionally.
- No focus-first-error logic here (that belongs to each form's submit handler). Do not add a `<FocusScope>`.

**Acceptance:** tsc + eslint; `npm run test:renderer` green; manual keyboard/AT spot check of one dialog (e.g. `Admin/Users/modals/UserModal.tsx`) — label click focuses control, error text is announced via `aria-describedby`.

---

### S04 — `fix(ui-card): make CardTitle an opt-in heading`

**Files:** `src/renderer/src/components/ui/card.tsx` (`CardTitle` L36-41 renders `<div>`)

**Change**
- Add `as?: "div" | "h2" | "h3" | "h4"` (default `"div"`) to `CardTitle`; render the corresponding element with the same classes. Add `data-slot="card-title"` unchanged.
- No automatic heading level inference (no context magic) — callers choose the level.

**Risk notes**
- Default `div` keeps every existing card visually and semantically identical, so tests/visuals do not churn. Heading adoption is a **page-level** decision in Phase 2 (Dashboard, Insurance, Reports, Patient detail).
- Heading-level choices must not skip levels on a page (h1 from `PageHeader` → h2 card titles → h3 subsections).

**Acceptance:** tsc + eslint; suite green; grep proves no page file touched.

---

### S05 — `fix(ui-button): replace transition-all with explicit properties`

**Files:** `src/renderer/src/components/ui/button.tsx` (L8)

**Change:** `transition-all` → `transition-[color,background-color,border-color,box-shadow,opacity,transform]` (keep timing/easing).

**Risk notes:** purely stylistic; `transform` retained for any press/scale affordances. No API change.

**Acceptance:** tsc + eslint; visual spot check of primary/secondary/ghost/destructive variants in light, dark and true-dark themes.

---

### S06 — `fix(ui-alert): allow polite announcements`

**Files:** `src/renderer/src/components/ui/alert.tsx` (L30 — hardcoded `role="alert"`)

**Change:** add `live?: "assertive" | "polite" | "off"` (default `"assertive"` to preserve behavior). Render `role={live === "assertive" ? "alert" : "status"}` + `aria-live` accordingly. Do not remove `role` entirely for the default.

**Risk notes**
- Default preserves current semantics. The Drugs/Supplies "stock warning / below price" surfaces switch to `live="polite"` in their page commits — not here.
- Consumers using `Alert` for static informational content should pass `live="off"`; that is optional page work.

**Acceptance:** tsc + eslint; suite green.

---

### S07 — `fix(ui-native-select): restore explicit color scheme`

**Files:** `src/renderer/src/components/ui/native-select.tsx` (L24-28)

**Change:** add explicit `bg-background text-foreground` (plus `dark:` fallbacks if the token system needs them) on the closed `<select>`; keep focus ring and disabled styles.

**Risk notes:** Windows dark mode renders the closed control with the OS palette when `background-color` is transparent — this is the actual defect. Verify in the Electron shell on Windows, not only in the browser.

**Acceptance:** tsc + eslint; manual check in both themes on Windows.

---

### S08 — `fix(stat-card): move focus ring to the interactive wrapper`

**Files:** `src/renderer/src/components/common/StatCard.tsx` (ring L77-78 on inner `Card`; focusable wrappers L136-156 use `focus-visible:outline-hidden`)

**Change**
- Remove `focus-visible:*` from the inner `Card` (it is never focusable).
- On the `Link`/`button` wrappers: `focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2` (ring on the wrapper, which actually receives focus).
- Fix `aria-label`: only compose `` `${label}: ${value}` `` when `value` is a non-empty string **and** non-interactive. When `value` is a `ReactNode`/number/empty, omit `aria-label` entirely (the visible label + value text already name the link). Optional: accept `ariaLabel?: string` override.

**Risk notes**
- Some dashboards may have `value` as an element; dropping `aria-label` there is a net improvement but changes the accessible name to "label value" — verify with one AT pass on Dashboard.
- The wrapper keeps `block`/`text-left` classes; do not restructure markup (that is a rewrite).

**Acceptance:** tsc + eslint; suite green; keyboard Tab shows a visible ring on every interactive `StatCard`.

---

### S09 — `fix(page-header): balance the h1`

**Files:** `src/renderer/src/components/common/PageHeader.tsx` (L39)

**Change:** add `text-balance` (Tailwind v4 maps to `text-wrap: balance`) to the `<h1>`.

**Risk notes:** `text-balance` is capped by browsers at ~6 lines; titles are short. No API change.

**Acceptance:** tsc + eslint; visual check on Reports/Insurance (long titles, both locales, RTL).

---

### S10 — `fix(empty-state): stop emitting unnamed regions`

**Files:** `src/renderer/src/components/common/EmptyState.tsx` (L40-41 — `role="region"` on every error/empty surface)

**Change**
- Remove the blanket `role="region"`.
- Add `live?: "status" | "alert" | "off"` (default `"status"`) → `role="status" aria-live="polite"` for empty/no-results, `role="alert"` for error surfaces, `role="off"` (no role) for purely decorative in-card empties.
- Where an accessible name is needed, derive it from `title` via `aria-label` only if `title` is a string; otherwise leave unnamed but non-landmark.

**Risk notes**
- `role="status"` on a **persistent** empty state will announce once on mount — acceptable and desired for async empties; for static empties prefer `live="off"` at the call site (page-level decision).
- Removing an unnamed `region` cannot break navigation landmarks because unnamed regions are not landmarks; still run a quick axe/manual landmark check on one page.

**Acceptance:** tsc + eslint; suite green; AT spot check: no "region" announcement on an empty table.

---

### S11 — `fix(editorial-kpi-card): replace transition-all`

**Files:** `src/renderer/src/components/common/EditorialKpiCard.tsx` (L140-145)

**Change:** `transition-all` → explicit properties (color/background/border/box-shadow/opacity/transform). This also stops height/layout properties animating on content change.

**Risk notes:** none functional.

**Acceptance:** tsc + eslint; visual check on Reports/KPI strips.

---

### S12 — `fix(data-table-pagination): use buttons for page actions`

**Files:** `src/renderer/src/components/common/DataTablePagination.tsx` (L84-125 — `<a href="#">` + `preventDefault`; `aria-disabled` anchor stays tabbable)

**Change**
- Replace every page action anchor with `<button type="button">` via `asChild` on the shadcn primitives (`PaginationLink` supports `asChild`; `PaginationPrevious`/`PaginationNext` forward props to it), styled with `buttonVariants` (ghost/outline, icon sizes), using `disabled` for boundary/current states instead of `aria-disabled`.
- Keep the same click handlers and the same visual layout; keep `aria-current="page"` semantics for the active page.
- Localize the pager text: pass `text={t("common.previous")}` / `text={t("common.next")}` (both keys exist in `common.en.json`/`common.ar.json`) and pass localized `aria-label`s — `PaginationPrevious`/`Next` hardcode English defaults **before** the props spread, so a caller-supplied `aria-label` overrides them.
- Remove `aria-disabled` from anchors (no longer applicable).

**Risk notes**
- `disabled` removes elements from tab order — matches §6.2 and prevents tabbing to a dead control.
- `asChild` + `button` requires the child to accept the forwarded props/ref; shadcn `Button` does. Do **not** edit `components/ui/pagination.tsx` in this commit unless `asChild` proves broken (then it is a separate Phase 1 component commit).
- Callers pass `DataTablePaginationSlot` props; no prop changes. Verify callers that relied on `<a>` styling (e.g. `className` merges) still look right in one table per page type.
- Check `design.md` §6.2 pagination layout after the swap (page-size select left, pager right).

**Acceptance:** tsc + eslint; suite green; keyboard walk of Patients/Drugs tables pagination; no navigation on click (URL unchanged).

---

### S13 — `fix(confirm-dialog): stop rethrowing rejected confirmations`

**Files:** `src/renderer/src/components/common/ConfirmDialog.tsx` (L96-109, L133-136)

**Change**
- `handleConfirm`: `try { await onConfirm(); close() } catch (err) { logError(err); }` — **no rethrow**, dialog stays open on failure (current visual behavior after a rejected promise).
- Document the contract in a docblock: *callers must not throw for expected validation failures; return `false` (or throw only for unexpected defects, which are logged once here).* Add `onConfirm: () => void | boolean | Promise<void | boolean>`; `false` means "keep open, no error".
- No call-site changes in this commit.

**Risk notes**
- 63-ish call sites rely on today's rethrow behavior *through* the unhandled-rejection path; removing the rethrow removes console noise but must not remove error surfacing. Callers that toast before throwing keep toasting.
- The **Employees** and **Admin Users** packages delete the `toast + throw` pattern at their call sites (`throw` → `return`/`return false`) in Phase 2. Phase 1 must not touch them, so both patterns coexist temporarily — confirm the dialog still closes on success and stays open on failure in both patterns.
- Add a note to `ConfirmDialog`'s docblock that `onConfirm` throwing is now swallowed-and-logged, so future readers do not reintroduce `void onConfirm()`.

**Acceptance:** tsc + eslint; suite green; manual check with a forced-reject handler (devtools throttle/offline) — one console error, dialog open, no unhandled rejection.

---

### S14 — `fix(data-table): condition expanded-row aria-hidden`

**Files:** `src/renderer/src/components/common/DataTable.tsx` (expanded row `aria-hidden` at L449; see also L227/L414 for icon-only `aria-hidden`, which are correct)

**Change**
- Drop `aria-hidden` from the expanded `<TableRow>` and instead: the expand toggle button gets `aria-expanded={isExpanded}`, `aria-controls={regionId}`, and the expanded cell content wrapper gets `id={regionId}` with `role="region"` + `aria-label` derived from the row (or from a new optional `expandedLabel?: (row) => string` prop).
- If a consumer genuinely renders decorative-only expansion content with no interactive elements, they may still pass `aria-hidden` themselves via a new optional `expandedAriaHidden?: boolean` — default `false`.

**Risk notes**
- Exposing expanded content to AT is the fix; content duplication (row summary repeated inside the expansion) becomes audible. If a consumer duplicates row text, that is a **page-level** cleanup (List of advisory items), not a reason to keep `aria-hidden`.
- Verify each current expandable consumer still matches visual layout after wrapper change: Patients (past admissions), Drugs (`DrugShipmentsSubTable`), Supplies (`SupplyShipmentsSubTable`), Employees (`PaymentGroupDetails`), Insurance (payment history).
- Do **not** memoize/refactor `DataTable` in this commit (that is S15).

**Acceptance:** tsc + eslint; suite green; keyboard test: expand a row, Tab reaches inner buttons, screen reader reads the region name.

---

### S15 — `fix(data-table): memoize rows, size skeletons to pageSize, honor empty copy`

**Files:** `src/renderer/src/components/common/DataTable.tsx` (`ColumnDef.sortKey` L31 unused; not memoized, `export function DataTable` L137; `DataTableSkeleton` L508-549 hardcodes `const rowCount = 6` and receives no `pageSize`; empty fallback L330-338: the title ternary's two branches are identical `t("common.noData")`, and the description defaults to `t("patients.emptyTableSearchDesc")` — patients copy on every table), plus locale files if a neutral key is added.

**Change (one coherent "table behavior" commit; may split into S15a memo/loading and S15b empty-copy if the diff exceeds ~250 changed lines)**
- Wrap the component in `memo` with a stable generic signature (`const DataTableInner = <T,>(...) => ...; export const DataTable = memo(DataTableInner) as typeof DataTableInner`) — or `memo` + `displayName`. Keep the named export so all call sites compile.
- Skeleton rows: thread `pageSize` into `DataTableSkeletonProps` and use `const rowCount = Math.min(Math.max(pageSize ?? 10, 5), 8)` — satisfies §6.2 (5–8 rows) regardless of pageSize, and replaces the fixed 6.
- `ColumnDef.sortKey`: either consume it (map `sortKey` → `aria-sort`/sort handler when `onSortChange` is absent) **or** delete it — choose **consume**, since callers already pass it; behavior must keep working for tables that pass explicit sort props. If ambiguous, keep it typed and documented but unused-marked, and note the follow-up in Backlog. *(Decision rule: if any call site already passes `sortKey` without `onSortChange`, consuming it is behavior-adding → defer to Backlog and only add a `@deprecated` note. Verify with grep before implementing.)*
- Empty fallback: collapse the no-op ternary and replace the patients-specific description default. **Key availability (verified):** `common.noData` exists in `en` + `ar` (`"No data available"` / `"لا توجد بيانات متاحة"`). `common.table` is a **string** (`"Table"`), so do **not** create `common.table.noResults` — add flat keys such as `common.noResults` / `common.noResultsHint` to **both** locale files if neutral copy is needed. Keep the existing `emptyTitle`/`emptyDescription`/`emptyAction` props as overrides (that contract must not change).

**Risk notes**
- `memo` on a generic component with render-prop columns: columns arrays rebuilt per render in several pages defeat memoization. That is why S15 is **not** a performance guarantee — it removes the component-level self-rerender amplification while page-level identity fixes remain page work (advisory).
- Changing skeleton count from 6 to `min(pageSize,8)` changes loading visuals on pageSize=10 (6→8) — acceptable per §6.2.
- Empty-copy change alters user-visible text on tables that never set `empty` — ensure the new default key exists in **both locales** and run `check-i18n`.
- Do not add virtualization/pagination logic here.

**Acceptance:** tsc + eslint; `npm run test:renderer`; `npm run check-i18n` (no new MISSING); visual check of a loading table and an empty table.

---

### S16 — `fix(charts): respect reduced motion and keep recharts out of shared route chunks`

**Files:** `src/renderer/src/components/charts/chartAnimation.ts` (L20-22 ignores `prefers-reduced-motion`), `RevenueLineChart.tsx` (L4-11 static `recharts` import), `PatientServicesDonut.tsx` (L3), `src/renderer/src/components/charts/index.ts` (barrel)

**Change (split into two commits if the diff mixes behavior and bundling: `fix(charts): disable animation under prefers-reduced-motion`, then `fix(charts): allow lazy chart loading`)**
- `chartAnimation.ts`: compute `isAnimationActive` from `window.matchMedia("(prefers-reduced-motion: reduce)").matches` (SSR-safe guard), and subscribe to changes so toggling OS setting takes effect without reload. Export a `useChartAnimation()` hook if a hook is needed by consumers; keep the existing exported helper's signature.
- Barrel: keep `index.ts` for compatibility, but remove any re-export that forces `recharts` into a non-chart chunk. Document in the barrel that **route code should import chart components directly** (or `lazy(() => import("./RevenueLineChart"))`).
- Do **not** change Dashboard routing in this commit — that is Dashboard package work (blocking item 3c). This commit only makes lazy loading possible and documents the rule.

**Risk notes**
- `matchMedia` in tests/jsdom: guard with `typeof window !== "undefined" && window.matchMedia` and default to animation **on** in test env (or read once lazily). `chartSrTable.spec.tsx` must stay green.
- Removing barrel re-exports can break import sites — grep all `from "@/components/charts"` / `from "../charts"` first; if a consumer needs a symbol, keep it exported but verify no `recharts` types leak unintentionally.
- Reduced-motion changes perceived polish for a11y users; that is the intent.

**Acceptance:** tsc + eslint; `npm run test:renderer` (esp. `chartSrTable.spec.tsx`); manual check with OS "reduce motion" on/off in Electron.

---

### Phase 1 exit criteria

- 16 commits (or ≤20 if S15/S16 were split) landed, each scoped to its component path only.
- `git diff --stat` for the phase touches **no** `src/renderer/src/pages/**` file.
- Full `npm run lint`, renderer tsc, `npm run test:renderer`, `npm run check-i18n` match baseline (no new MISSING keys, no new failures).
- A short adoption note per primitive (what pages must now pass) recorded in the ledger — pages will reference it.

## 7. Phase 2 — Page packages (fixed order)

Order rationale: cheapest/highest-signal cross-page dependencies first; shared-primitive adopters early so later pages imitate settled patterns; heaviest pages (Insurance, Reports) after patterns are proven; NotFound/demo last.

**Order:** Patients list → Patient detail → Drugs → Supplies → Insurance → Vault → PriceLists → Services → Employees → Clocking → Dashboard → Reports → Login → Admin Roles → NotFound → dev demo.

Every package section follows the same shape: **Goal**, **Commits**, **Blocking checklist**, **Advisory**, **Acceptance**, **Out of scope**. All `file:line` references are from the audit; paths that the audit abbreviated are corrected to their verified repo locations (`hooks/useLogin.ts`, `Patients/PatientListPanel.tsx`, etc.).

---

### P2-01 — Patients list (`src/renderer/src/pages/Patients/`)

**Goal:** make creation validation real, make filtering/navigation accessible, keep the list surface operable without a mouse.

**Commits (3)**
1. `fix(patients): validate the create-patient wizard with the existing zod schemas`
   - `dialogs/createPatientWizard/CreatePatientWizardDialog.tsx`, `useCreatePatientWizard.ts`, `schemas/patient.schema.ts` (import only), step components as needed.
2. `fix(patients): make the date-range clear action a sibling control`
   - `components/PatientFilters.tsx`.
3. `fix(patients): give patient rows real link semantics`
   - `PatientListPanel.tsx` (+ `components/.../` name cell).

**Blocking checklist**

- [ ] **(a)** `dialogs/createPatientWizard/CreatePatientWizardDialog.tsx:87-113,197-253` — `useForm` has **no resolver**; `validateInternal` resolves `true` with zero rules; every required gate is inert; `schemas/patient.schema.ts` wizard schemas (314 lines) are imported by nobody. → Wire per-step `resolver: zodResolver(stepSchema)` (design.md §6.3), delete the inert `validateInternal`, keep `Next` disabled until the current step validates, and ensure Enter submits the final step.
- [ ] **(b)** `components/PatientFilters.tsx:181-193` — `<span role="button">` nested inside `<Button>` (clear date range); mouse-only. → Replace with a sibling `<Button variant="ghost" size="icon">` (or `Button` + `aria-label`) next to the trigger; no nested interactive elements; keyboard + AT reachable.
- [ ] **(c)** `PatientListPanel.tsx:53-55,158` — row navigation via `<tr onClick>` (`DataTable onRowClick`), no link semantics. → Add a `<Link to={`/patients/${id}`}>` on the patient name cell (real href, ctrl/middle-click works) and keep the row click as a mouse affordance only; do not make the `<tr>` the only affordance.

**Advisory — apply opportunistically while in the page (only if trivial and inside the touched file)**
- `toLocaleDateString()` without locale — `PatientListPanel.tsx:111`, `PatientFilters.tsx:175` → `resolveLocale(language)` (S01 makes this a one-liner).
- `filterValue` identity churn; `as Record` casts; template-literal union casts — leave (Backlog).
- `Stepper.tsx` hardcoded English `aria-label`; wizard's three parallel step representations; `Map` per render; `preventDefault` form (Enter never submits); missing `DialogDescription`; no unsaved-changes guard; raw input class copy; `watch()` in JSX; duplicate `listDoctors` fetch → fix only what the wizard commit already touches.

**Advisory — backlog**
- Tab/search/filters/page not in URL; status header/cell mismatch; `PatientFilters` silent lookup failure + `Date`→string→`Date`; `StaffStatus` 30s full-directory poll with no visibility gate (`hooks/staffStatus/useStaffStatus.ts:111`); module cache without TTL (`hooks/staffStatus/useStaffLookups.ts:42`); triple local formatters; ar-EG comment wrong; joined chip buttons; `CurrentAssignmentsPanel` double `t()` lookup; `staffStatus/duration.ts` hardcoded `d/h/m` and `<1min` inaccuracy; `EmptyState` `"—"`; untyped i18n key strings.

**Acceptance**
- `npx tsc -p src/renderer/tsconfig.json --noEmit`, `npx eslint` on touched files, `npm run test:renderer`.
- `npm run check-i18n` if wizard step copy changed (both locales).
- Manual: submit the wizard with empty required fields → inline errors + focus moves to first invalid control; `Next` blocked per step; Enter on the last step submits.
- Manual keyboard: Tab reaches the clear-range control; Enter activates it; patient name link navigates and is focusable.

**Out of scope:** moving list filters into the URL (Backlog); staff-status polling redesign; wizard extraction/refactor (three step representations stay).

---

### P2-02 — Patient detail (`src/renderer/src/pages/Patients/PatientDetailPage.tsx` + subtree)

**Goal:** money and billing state must never lie; admission↔bill binding must be exact; no PHI in logs; labels/headings/durations correct.

**Commits (5)**
1. `fix(patient-detail): surface billing save failures instead of success toast`
   - `components/Billing/BillingForm.tsx`, `hooks/billing/useBillSave.ts`.
2. `fix(patient-detail): keep money inputs as strings while typing`
   - `components/Billing/sections/BillingPaymentSection.tsx`, `components/Admissions/SettleBillDialog.tsx`.
3. `fix(patient-detail): reset settlement state per admission and require real bill ids`
   - `components/Admissions/AdmissionsPanel.tsx`, `components/Admissions/SettleBillDialog.tsx`, `lib/admissions/admissionsShape.ts`.
4. `fix(patient-detail): associate labels, fix headings, and localize durations`
   - `dialogs/assigned/AddSupplyDialog.tsx`, `components/Billing/sections/BillingPaymentSection.tsx`, `dialogs/assigned/AddDrugQuantityDialog.tsx`, `dialogs/profile/EditDiagnosisDialog.tsx`, `components/Profile/PatientProfilePanel.tsx`, `lib/admissions/admissionFormat.ts`, locale files (`patients.en.json`, `patients.ar.json`).
5. `fix(patient-detail): remove PHI console logging`
   - `dialogs/profile/AdmitPatientDialog.tsx`, `lib/admissions/admissionsShape.ts`.

**Blocking checklist**

- [ ] **(a)** `components/Billing/BillingForm.tsx:199-212` + `hooks/billing/useBillSave.ts:109-119` — save swallows the error; the closure reads a stale `error == null` → success toast after a failed `PUT`. → Return/await the save result (or read the error from the awaited return value, not the React state closure) and only toast success when the request succeeded; keep the inline error.
- [ ] **(b)** `components/Billing/sections/BillingPaymentSection.tsx:78-82` + `components/Admissions/SettleBillDialog.tsx:195-199` — controlled money inputs round-trip `Number`/`String` per keystroke (`1.5` → `15`). → Hold a string draft in state (`inputMode="decimal"`), parse once on change/submit with a single validation point; format on blur only.
- [ ] **(c)** `components/Admissions/AdmissionsPanel.tsx:88-92,174-184` + `components/Admissions/SettleBillDialog.tsx:70` — `settleRow` is never cleared on close; opening the dialog for a different admission reuses the previous row's state. → Key the dialog by `admissionId`, reset on open/close transitions, and pass the selected row explicitly; verify A→close→B shows B's numbers.
- [ ] **(d)** `dialogs/assigned/AddSupplyDialog.tsx:385-392` + `components/Billing/sections/BillingPaymentSection.tsx:61,90,95` — unlabeled inputs (quantity; `ReadOnlyCurrency` under a label without `htmlFor`). → Use `Field`/`FieldLabel` + `useFieldControlProps()` (S03) or explicit `id`/`htmlFor`.
- [ ] **(e)** `components/Admissions/PastAdmissionCard.tsx:42` — `transition-all`. → Explicit transition properties (S05 pattern, applied locally to this file's class string).
- [ ] **(f)** `dialogs/profile/AdmitPatientDialog.tsx:200,329` + `lib/admissions/admissionsShape.ts:301` — 3 committed `console.log`s of PHI. → Remove all three; no replacement logging of patient data.
- [ ] **(g)** `lib/admissions/admissionFormat.ts:108-115` — `Math.ceil` makes `days < 1` unreachable → every stay under 24h renders "1 day". → Render hour precision (or an explicit "less than a day") for `< 24h`; add both locale keys; keep ≥1-day output unchanged.
- [ ] **(h)** `dialogs/assigned/AddDrugQuantityDialog.tsx:116-124` label concatenation + `dialogs/profile/EditDiagnosisDialog.tsx:102-120` hint repeated twice + `components/Profile/PatientProfilePanel.tsx:238,280` missing i18n key `patients.fields.admissionNotActive` (raw key in tooltips). → Add the missing key to **both** locales; stop concatenating label fragments (use one key with interpolation); show the hint once.
- [ ] **(i)** `lib/admissions/admissionsShape.ts:137,171` — `billId ?? patientHistoryId` fabricates a bill id → can bind another admission's bill. → Remove the fallback; when `billId` is absent render the "no bill yet" state and disable bill-bound actions.
- [ ] **(j)** 10th blocker cluster: `lib/admissions/admissionsShape.ts:137/171` bill-binding **plus** the missing-key cluster (`PatientProfilePanel.tsx:238,280`). → Covered by commits 3 and 4; if the combined diff is large, split (h) and (i) into separate commits (already reflected above).

**Advisory — opportunistic (only in files already touched by the commits above)**
- `form.watch()` whole-form subscription + dead `useMemo`s — `BillingForm.tsx:155-194` (touch only if the save fix requires re-render changes; otherwise backlog).
- `h6` heading skips ×4 — fix where headings are in the touched file, else backlog.
- Raw `error.message` ×4, disabled-button `title` tooltips ×5, `aria-label` on an unnamed `div` (`PastAdmissionsList.tsx:33`) — backlog unless in a touched file.

**Advisory — backlog (large, do not mix in)**
- Hardcoded `"EGP"` ×9 + triplicated `ReadOnlyCurrency`; two divergent `formatCurrency` implementations (`lib/billing/billingFormat.ts` vs `lib/admissions/admissionFormat.ts`).
- No `<form>` (Enter dead); `BillingPanel` discards 2 fetched lists; reset-on-open wipes in-progress edits (`dialogs/profile/EditPatientDialog.tsx:83`); lookups refetched every open; `EditStaffAssignmentDialog` fetches while closed.
- `t` in effect deps → refetch on language switch (`hooks/admissions/usePastAdmissions.ts:130`, `useAdmissionDetails.ts:84`, `components/Admissions/AdmissionDetailsDialog.tsx:132`).
- 20+ inline row casts; scope-string mappers ×4; `buildPrintPreview` duplication; `lib/print/groupPrintBillItems.ts` UTC off-by-one; `toSorted`; find-in-loops; `lib/billEvents.ts` doc-vs-implementation; dead SSR guards; `ViewItemDetailsDialog` unguarded `new Date` + swallow chains + 3 identical row state machines; `AddServiceDialog` "View" header + per-keystroke filter; `AddSupplyDialog` hardcoded "Shipment"/`shipmentId`-as-name/close-on-failure/`Math.max(1)`; `AddDrugDialog` dead prop + price-fallback-to-quantity; `AddDrugQuantityDialog` trivial `memo` + duplicated arg + no over-max error; `useBillSave` raw `fetch` bypassing `lib/api` + `vat_scope` magic; `useAssignedServices` null `patientHistoryId`; `lib/api.ts:186` `pageSize` 100 silent + `parseLegacyList` undefined + `SORT_COLUMN_MAP` no-op; `admissionsShape` `vatScopeCustom` + `String(quickCheck)` + dead code; `dismissalBadgeVariant` doc-vs-code; `ProfileSectionCard` `"—"` for `0`; skip-link absent; confirm-payment posts money with no confirm step (`BillingPaymentSection.tsx:99`).

**Acceptance**
- tsc + eslint on touched files; `npm run test:renderer`; `npm run check-i18n` (keys added/modified in commits 4).
- Manual billing: force a failing `PUT` (offline in devtools) → inline error, **no** success toast, form stays dirty.
- Manual money input: type `1.5` → field keeps `1.5`; blur formats; submit sends `1.5`.
- Manual admissions: open settle for admission A, close, open for B → B's figures; `<24h` stay shows hours/less-than-a-day in both locales; no `console.log` output during admit.

**Out of scope:** unifying the two `formatCurrency` implementations (Backlog); adding `<form>` wrappers; print pipeline fixes; URL state.

---

### P2-03 — Drugs (`src/renderer/src/pages/Drugs/`)

**Goal:** KPIs reflect the dataset, not the filter; shipments update dependent totals; list scale bounded; forms validate inline; table semantics correct.

**Commits (4)**
1. `fix(drugs): derive KPIs from the unfiltered list and refresh warehouses on mutation` — `DrugsPage.tsx`, `hooks/usePharmacyKpi.ts` (call-site only).
2. `fix(drugs): scope list runs per hook instance and fetch only the visible page` — `hooks/useDrugsList.ts`, `components/DrugsTable/DrugsTable.tsx`, `DrugsPage.tsx`.
3. `fix(drugs): inline validation, label association, and safe price defaults` — `components/Transactions/TransactionsPanel.tsx`, `modals/SellDrugModal.tsx`, `modals/ShipmentModal.tsx`, `schemas/shipment.schema.ts`.
4. `fix(drugs): correct table header semantics, localized dates, and missing keys` — `components/Warehouses/WarehousesPanel.tsx`, `components/DrugsTable/ShipmentRow.tsx`, `modals/WarehouseInventoryDialog.tsx`, locale files.

**Blocking checklist**

- [ ] **(a)** `DrugsPage.tsx:63` — `usePharmacyKpi(drugsList.drugs, …)` is fed the **filtered** list (Total Drugs collapses; Expiring Soon → 0). → Pass the unfiltered dataset to the KPI hook; keep the table fed by the filtered view.
- [ ] **(b)** `DrugsPage.tsx:203-212,257,312` — shipment mutations never call `warehouses.refresh()` (stale total value). → Refresh warehouses (and any KPI source that depends on shipments) after successful create/edit/delete.
- [ ] **(c)** `hooks/useDrugsList.ts:138-195` — per-drug N+1 fan-out up to 100 requests (concurrency 4). → Fetch only the rows needed for the current page/window (ties into (e)); keep bounded concurrency; **no new endpoint**.
- [ ] **(d)** `hooks/useDrugsList.ts:282` — module-scoped `runIdRef` shared by all hook instances (StrictMode double-mount invalidates runs). → `useRef` inside the hook.
- [ ] **(e)** `hooks/useDrugsList.ts:111` + `components/DrugsTable/DrugsTable.tsx:253-304` — fetches and renders 100 rows; the `pagination` prop is never passed to `DataTable`. → Wire `pagination` (design.md §6.2, default 10) and fetch the page window.
- [ ] **(f)** `components/Transactions/TransactionsPanel.tsx:185-238` — 5 `<label>` with no `htmlFor`/`id`. → Associate each via `Field`/`useFieldControlProps()` (S03) or explicit ids.
- [ ] **(g)** `modals/SellDrugModal.tsx:144-148` — effect clobbers a manual total override. → Only recompute the total from quantity/price when the user has not overridden it (track an "overridden" flag); never overwrite on unrelated re-renders.
- [ ] **(h)** `modals/SellDrugModal.tsx:159-191` — toast-only validation (design.md §6.3 violation); unused `sellSchema`. → Use `sellSchema` via `zodResolver`, render inline `FieldError`, and focus the first invalid field on submit; remove the duplicate toast validation.
- [ ] **(i)** `modals/ShipmentModal.tsx:164-169,320-390` — toast-only errors + unlabeled price-matrix inputs/prepayment select. → Inline errors + focus-first-invalid; associate every matrix input and the select with a visible label (ids from the row key).
- [ ] **(j)** `schemas/shipment.schema.ts:67-76` — `defaultPrice` resolved from the first array element and rejects when that price is `0` → shipment creation blocked with no UI path. → Resolve the default from the row actually used (or allow `0`); add a schema-level test-free manual case: create a shipment with a `0`-priced first row.
- [ ] **(k)** `components/Warehouses/WarehousesPanel.tsx:91-100` — `<TableCell>` inside `<TableHeader>` (no `th`/`scope`). → Use `<TableHead scope="col">` for the header row.
- [ ] **(l)** `components/DrugsTable/ShipmentRow.tsx:60` + `modals/WarehouseInventoryDialog.tsx:138` — raw ISO expiry dates. → Format with `formatDate(new Date(value), resolveLocale(language))` (S01).

**Advisory — opportunistic (touched files only)**
- Hardcoded English error toast (`DrugsPage.tsx:246`) → key in `pharmacy` namespace, both locales.
- `h6` headings (table/matrix) → h2/h3 where already editing.
- Required `*` without `aria-required` + numeric inputs without `inputMode` → fix only in the modals already touched.
- `Date.now()` in render `sortKey` + `toLocaleDateString()` without locale → S01 one-liners in touched files.

**Advisory — backlog**
- Tab state not in URL; price lists fetched with a swallowed error; `ShipmentRow` string-template numbers; `ShipmentModal` `watch` vs `values` two sources + controlled value can't clear + `[open]`-only reset (late `priceLists` risk); `DrugShipmentsSubTable` `div` stack; `min`-pass instead of sort; narrow deps redundant re-runs; active-patients refetch per open (`SellDrugModal.tsx:115`); `RadioGroup` label not tied; `TransactionsPanel` numeric-id text filters + filters reset on unmount; `useWarehouses` compat re-export.

**Acceptance**
- tsc + eslint; `npm run test:renderer`; `npm run check-i18n` when locale files change.
- Manual: with a filter applied, "Total Drugs" equals the unfiltered count and "Expiring Soon" is non-zero; create a shipment → warehouse total updates without reload.
- Manual network panel: opening the Drugs tab issues ≤ page-size + constant requests (not 100), and StrictMode double-mount does not leave a stuck list.
- Manual form: submit an empty Sell/Shipment dialog → inline errors, focus on first invalid control, no toast-only path; `0`-priced first row no longer blocks shipment creation.

**Out of scope:** server-side shipment/drug aggregation endpoints; merging the `DrugsTable` and `SuppliesTable` copies.

---

### P2-04 — Supplies (`src/renderer/src/pages/Supplies/`)

**Goal:** same correctness class as Drugs, plus dispense idempotency (duplicate `BillDetail` rows) and honest usage summaries.

**Commits (4)**
1. `fix(supplies): derive KPIs from the unfiltered list and use filtered turnover`
   - `SuppliesPage.tsx`, `hooks/useSuppliesKpi.ts`.
2. `fix(supplies): scope list runs per instance and fetch only the visible page`
   - `hooks/useSuppliesList.ts`, `components/SuppliesTable/SuppliesTable.tsx`, `SuppliesPage.tsx`.
3. `fix(supplies): guard dispense against double submit and validate before prefetch`
   - `modals/DispenseSupplyModal.tsx`, `hooks/useSupplyUsageHistory.ts`, `lib/api.ts` call-site only.
4. `fix(supplies): header semantics, labels, safe price defaults, localized dates`
   - `components/Warehouses/SuppliesWarehousesPanel.tsx`, `components/UsageHistory/UsageHistoryPanel.tsx`, `modals/SupplyShipmentModal.tsx`, `schemas/supplyShipment.schema.ts`, `components/SupplyShipmentRow.tsx`, `modals/WarehouseSupplyInventoryDialog.tsx`, locale files.

**Blocking checklist**

- [ ] **(a)** `SuppliesPage.tsx:82-86` — KPI computed from the filtered list incl. the turnover denominator (`hooks/useSuppliesKpi.ts:45-53`). → Pass unfiltered stock to stock/value KPIs; pass the **filtered** set only where "turnover over current selection" is the intended semantic (document it in the hook docblock).
- [ ] **(b)** `hooks/useSuppliesList.ts:130-202` — N+1 fan-out. → Page-window fetching + bounded concurrency; no new endpoint.
- [ ] **(c)** `hooks/useSuppliesList.ts:38` — module-scoped `runIdRef`. → `useRef` per hook instance.
- [ ] **(d)** `components/SuppliesTable/SuppliesTable.tsx:258-309` — 100 rows, no pagination. → Wire `pagination` into `DataTable` (§6.2).
- [ ] **(e)** `components/Warehouses/SuppliesWarehousesPanel.tsx:93-102` — `<TableCell>` inside `<TableHeader>`. → `<TableHead scope="col">`.
- [ ] **(f)** `components/UsageHistory/UsageHistoryPanel.tsx:212-232` — 3 unlabeled labels. → Associate via S03 mechanism / explicit ids.
- [ ] **(g)** `hooks/useSupplyUsageHistory.ts:69-87` + `lib/api.ts:138-142` — the usage summary ignores active filters (hook doc promises otherwise). → Either pass the active filters into the summary request or correct the docblock and the UI copy; pick the behavior that matches the visible promise and state it in the commit message.
- [ ] **(h)** `modals/SupplyShipmentModal.tsx:170-187,325-339` — toast-only errors + unlabeled input. → Inline errors + focus-first-invalid + label association.
- [ ] **(i)** `schemas/supplyShipment.schema.ts:62-73` — same `defaultPrice` first-element/zero-price bug. → Same fix as Drugs (j).
- [ ] **(j)** `modals/DispenseSupplyModal.tsx:144-182` — `getActivePatients()` prefetch runs before cheap validation, and `submitting` stays `false` during the prefetch → double-click double-dispense (duplicate `BillDetail` rows). → Validate cheaply first, set `submitting = true` **before** the prefetch, disable the confirm button during the whole flow, and re-enable only on error; verify with a throttled network profile.
- [ ] **(k)** `components/SuppliesKpiStrip.tsx:51,101` — `(x * 100).toFixed(1) + "%"` hardcoded. → `Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 })`.
- [ ] **(l)** `components/SupplyShipmentRow.tsx:53` + `modals/WarehouseSupplyInventoryDialog.tsx:169` — raw ISO expiry dates. → `formatDate` + `resolveLocale`.

**Advisory — opportunistic (touched files only)**
- Tab not in URL; two cards claiming "active" on "all"; `Date.now()` `sortKey`; identity `useMemo`; `status` chips class-only selection (no `aria-pressed`/`role="group"`) — fix only inside files already touched by the four commits.
- `SupplyModal` "Frequency" without a unit; spinner labels.

**Advisory — backlog**
- Duplicated `listPriceLists` effect; `SuppliesTable` ≈ verbatim `DrugsTable` copy (Backlog: collapse); dead `dispense()` in hook; `todayIso` UTC off-by-one; `DispenseSupplyModal` stale price on unpriced list; `SupplyShipmentsSubTable` `div` stack; `[open]`-only reset; inventory dialog per-render `reduce`.

**Acceptance**
- tsc + eslint; `npm run test:renderer`; `npm run check-i18n` when locales change.
- Manual: filter the supplies list → stock KPIs stay unfiltered; turnover label/behavior matches the docblock promise.
- Manual: double-click dispense with network throttling → exactly **one** bill detail row; button disabled throughout.
- Manual: shipment with `0`-priced first row succeeds; expiry dates render localized; warehouse table headers are real `th`.

**Out of scope:** endpoint-level usage aggregation; mirror-collapse with Drugs.

---

### P2-05 — Insurance (`src/renderer/src/pages/Insurance/`)

**Goal:** navigation semantics, correct financial grouping, per-company state isolation, and accessible modal error handling.

**Commits (4)**
1. `fix(insurance): use links for company navigation` — `components/InsuranceCard.tsx`, `InsurancePage.tsx`, `components/PatientsGrid.tsx`.
2. `fix(insurance): group report rows by patient id and isolate detail state` — `report/groupItemsByPatient.ts`, `modals/ReportDetailsModal.tsx`, `hooks/useInsuranceDetail.ts`, `InsurancePage.tsx`.
3. `fix(insurance): associate modal errors and focus the first invalid field` — `modals/CompanyModal.tsx`, `modals/PaymentModal.tsx`, `modals/ClearBalanceModal.tsx`, `modals/ReportOptionsModal.tsx`.
4. `fix(insurance): make inner scroll regions focusable and labeled` — `modals/ReportDetailsModal.tsx`, `modals/PatientReportDetailsModal.tsx`, `modals/PaymentHistoryDialog.tsx`.

**Blocking checklist**

- [ ] **(a)** `components/InsuranceCard.tsx:40-46` + `InsurancePage.tsx:341-345` + `components/PatientsGrid.tsx:49-52` — card/back navigation via `<div role="button" onClick>` / `Button` + `navigate` → use `Link` (real href, ctrl-click, no JS-only navigation). → Convert to `Link` (or `Button asChild` wrapping `Link`); keep styles.
- [ ] **(b)** `components/PatientsGrid.tsx:77-86` + `lib/api.ts:87-93` — unbounded patient `.map()`, API takes no paging params. → **Client-cap** the grid (e.g. 25 per page with existing pagination primitives or a "show more" button); **no server-side paging endpoint work**.
- [ ] **(c)** `report/groupItemsByPatient.ts:29-40` + `modals/ReportDetailsModal.tsx:187-213` — report groups keyed by `patientName` (two same-named patients merge; totals take `max` → financial misattribution). → Key by `patientId` (fall back to a stable composite only when the id is genuinely absent), sum (not `max`) totals, and keep display names for labels.
- [ ] **(d)** `hooks/useInsuranceDetail.ts:62-63` — no clear of `company`/`statistics`/`patients` on `companyId` change (wrong entity under wrong URL). → Clear + abort/token-guard on id change; render loading, never the previous company's data.
- [ ] **(e)** `modals/CompanyModal.tsx:171-183`, `modals/PaymentModal.tsx:144-199`, `modals/ClearBalanceModal.tsx:117-132`, `modals/ReportOptionsModal.tsx:141-171` — errors rendered but no `aria-invalid`/`aria-describedby`, no focus-first-error (design.md §6.3). → Wire via S03 mechanism and `form.setFocus(firstInvalid)`.
- [ ] **(f)** `modals/ReportDetailsModal.tsx:150`, `modals/PatientReportDetailsModal.tsx:143`, `modals/PaymentHistoryDialog.tsx:100` — inner scroll regions neither focusable (`tabIndex`) nor labeled. → `tabIndex={0}` + `role="region"` + `aria-label` (from the section title key).

**Advisory — opportunistic (only in files touched by commits 1–4)**
- `PaymentModal` default amount `0` → instant error; `type="number"` for money; silent `companyId` no-op.
- `ReportDetailsModal` print button missing progress/label; table missing `caption`.
- `CompanyDetailsCard` `CardTitle` not a heading; `PatientsGrid` `CardTitle` + fixed 3 skeleton cards; `StatisticsKpiStrip` `toFixed(1)+"%"`.
- `PaymentHistoryDialog` generic error discarding `ApiError.message`; `issuedTimestamp` rendered twice.
- `ReportDetailsModal` `new Date(x ?? "")` `Invalid Date` crash → guard before `formatDate` (touched file).
- `report.schema` empty-field stacking; `company.schema` `max(255)` message wrong; `payment.schema` `coerce ""→0` + no upper bound — only if the modal commit already edits the schema file.

**Advisory — backlog (large)**
- Inert `useMemo` around a primitive; duplicated error-toast effects + toasts with `duration: Infinity` + duplicate `Alert`; inert `useCallback` deps on hook objects; list state not in URL + `setSearch` doesn't reset page (empty-grid flash); two Back affordances; live-search not announced; `InsuranceCard` weak hover; skeletons not `aria-busy`; `CompanyDetailsCard` eternal skeletons on failure; `PatientsGrid` badge vs KPI count disagreement; `PatientCard` two keys for the same figure + truncated diagnosis without `title`; `StatisticsKpiStrip` two KPIs one label + missing `netOutstanding`; `ReportTables` raw `itemType` enums + `Intl` per cell + `String(extra.value)`; `ReportDetailsModal` CSV export without `try/catch` + per-render `calculateFinancials`; `PatientReportDetailsModal` hardcoded `"Bill ID: "` + duplicated admission count; `PaymentHistoryDialog` 3 hand-rolled stat tiles + double `Number()`; 4× local date padders; `CompanyModal` refetch/no-loading/no-reset-on-identity + no `DialogDescription` + bare `*`; `ReportOptionsModal` checkbox group without `fieldset`/`legend`; `useInsuranceDetail` no `AbortController`; two report hooks differing only by fn; `groupItemsByPatient` sort mutation in `useMemo`; `exportItemsCsv` regex per cell + no CSV-injection guard; PDF builders duplicate `footerRows` financial logic ×3.

**Acceptance**
- tsc + eslint; `npm run test:renderer`; `npm run check-i18n` if copy/keys change.
- Manual: ctrl-click a company card opens a new tab; back button returns to the list.
- Manual: two patients with the same name in one report → two separate groups with correct totals.
- Manual: switch company A → B quickly → no A data under B header (loading state shown); switch back → A data correct.
- Manual: submit each modal with invalid input → inline error, `aria-invalid` set, focus on first invalid; tab into each scroll region and scroll with keyboard.

**Out of scope:** server-side patient paging for `PatientsGrid`; PDF/CSV builder dedup; URL state for list filters.

---

### P2-06 — Vault (`src/renderer/src/pages/Vault/`)

**Goal:** failures must not masquerade as "no data"; A/B report requests must not cross.

**Commits (2)**
1. `fix(vault): surface report load failures instead of "no data"` — `hooks/useVaultReport.ts`, `modals/ReportDialog.tsx`.
2. `fix(vault): guard report requests against stale responses and localize counts` — `hooks/useVaultReport.ts`, `modals/ReportDialog.tsx`, `components/MetricRow.tsx`.

**Blocking checklist**

- [ ] **(a)** `hooks/useVaultReport.ts:37-41` + `modals/ReportDialog.tsx:38-46,152-156` — fetch error never forwarded → a failure renders "No data found". → Return/propagate `error`, render an error state with retry inside the dialog, and keep "no data" for an actually-empty result.
- [ ] **(b)** `hooks/useVaultReport.ts:29-43` — no request token/abort: closing A and opening B shows A's rows under B's title. → Token/`AbortController` per request + reset on report/dialog change.
- [ ] **(c)** `components/MetricRow.tsx:37` + `modals/ReportDialog.tsx:135,145` — non-`Intl` count formatting. → `formatNumber(value, 0, resolveLocale(language))` (S01).

**Advisory — opportunistic (touched files only):** spinner labels/`aria-busy`; duplicated empty-state copy.

**Advisory — backlog:** summary/report hook duplication; CSV export label handling; `dateRange.ts` preset drift.

**Acceptance:** tsc + eslint; suite green; manual: block the report endpoint (offline) → error + retry, not "No data"; open A then immediately B → only B rows; counts render with locale digits in Arabic.

**Out of scope:** PDF/CSV export rework; report config restructure.

---

### P2-07 — PriceLists (`src/renderer/src/pages/PriceLists/`)

**Goal:** the default price list cannot be stolen silently; the big editor stays responsive and cannot lose work without warning.

**Commits (3)**
1. `fix(price-lists): prevent silent default takeover across pages` — `PriceListsPage.tsx`, `modals/PriceListModal.tsx`.
2. `fix(price-lists): isolate bulk-edit inputs and warn before discarding edits` — `modals/AddPricesModal.tsx`.
3. `fix(price-lists): localize counts on cards and bulk editor` — `components/PriceListCard.tsx`, `modals/AddPricesModal.tsx`.

**Blocking checklist**

- [ ] **(a)** `PriceListsPage.tsx:44-45` + `modals/PriceListModal.tsx:48-53,97-103` — `currentDefault` derived from the current page slice → default-steal with no confirmation when the default lives on another page. → Derive `currentDefault` from the full list (or fetch the default explicitly); if a save would move the default away from an existing one, require an explicit confirm.
- [ ] **(b)** `modals/AddPricesModal.tsx:486-517,533-613` — every service + drug shipment + supply shipment rendered as a card with 2–4 controlled inputs, no virtualization, unmemoized, per-keystroke rerender of all. → Memoize row components and keep per-row draft state local to the row (or a keyed store) so a keystroke re-renders one row; keep the form submission shape identical. **No virtualization library** (Backlog).
- [ ] **(c)** `modals/AddPricesModal.tsx:432,619-637` — bulk edits discarded on Cancel/Skip/ESC/overlay with no dirty guard. → Track dirtiness and confirm before discard on all four exits.
- [ ] **(d)** `components/PriceListCard.tsx:78` + `modals/AddPricesModal.tsx:462-597` — non-`Intl` counts. → S01 formatters + `resolveLocale`.

**Advisory — opportunistic (touched files only):** search not `type="search"`; truncate without `min-w-0`; spinner without `sr` text; `addPricesList` never cleared.

**Advisory — backlog:** state not in URL; tab badges showing filtered counts; load-error `EmptyState` without retry + wrong copy; first zod issue only + offending card not highlighted; money inputs `type="number"`; 832-line modal with 3 near-identical tabs (Backlog refactor).

**Acceptance:** tsc + eslint; suite green; manual: set a default on page 2, open page 1, edit a price list → confirmation appears instead of silent rebuild; type in a bulk price field → only that row re-renders (React DevTools highlight); ESC with edits → discard confirmation; counts localized.

**Out of scope:** virtualization; tab-body extraction/dedup.

---

### P2-08 — Services (`src/renderer/src/pages/Services/`)

**Goal:** Save must never silently no-op; table state must be readable without icons.

**Commits (2)**
1. `fix(services): reject empty service type and surface validation errors` — `modals/ServiceModal.tsx`, `schemas/service.schema.ts`.
2. `fix(services): expose icon-only flags as text and localize percentages` — `components/ServicesTable.tsx`.

**Blocking checklist**

- [ ] **(a)** `modals/ServiceModal.tsx:196-198` + `schemas/service.schema.ts:33-37` — `serviceType: ""` passes `.enum().or(z.literal(""))`; `onSubmit` silently returns → Save is a no-op and `FieldError` is unreachable. → Drop the empty-string escape for the submit path (or refine with a required selection), render the field error inline, and focus the select.
- [ ] **(b)** `components/ServicesTable.tsx:119-138` — `autoRenew`/`autoAddOnAdmission` cells render only `aria-hidden` icons. → Add `sr-only` text (or an `aria-label` on the cell content) for on/off in both locales.
- [ ] **(c)** `components/ServicesTable.tsx:95` — non-`Intl` percentage formatting. → `Intl.NumberFormat(locale, { style: "percent", … })`.

**Advisory — opportunistic (touched files only):** `h6` headings; `.find` per badge where the touched file already computes rows; `name`/`autocomplete` attributes; `inputMode` on numeric fields.

**Advisory — backlog:** docblock says client-side but it is server-side; 5× errors→`[{message}]` mapping; drug fetch effect depending on `t`; auto-uncheck via state+effect; rows indexed positionally vs `priceLists`; no dirty guard; columns rebuilt per render; empty header; prepayment detail only in a non-focusable `span` tooltip; delete without page clamp + non-persistent toast; `DrugPicker` identical `aria-label`s + per-render filter; `useServices` loading flash.

**Acceptance:** tsc + eslint; suite green; manual: submit with an empty type → inline error under the select, focus moves there, no silent return; with a valid type → save succeeds; the flags column reads "Yes/No" (localized) to AT; percentages localized.

**Out of scope:** server/client validation documentation rewrite; `DrugPicker` rework.

---

### P2-09 — Employees (`src/renderer/src/pages/Employees/`)

**Goal:** employee B never sees employee A's payments/prices; percent pay renders as percent.

**Commits (3)**
1. `fix(employees): clear payment state and guard price loads on employee change` — `hooks/useEmployeePayments.ts`, `modals/EmployeeModal.tsx`.
2. `fix(employees): format per-patient pay by its payment type` — `components/EmployeeDetailSheet.tsx`.
3. `fix(employees): stop throwing from confirm handlers` — `EmployeesPage.tsx`, `modals/PaymentModal.tsx`, `modals/EmployeeModal.tsx`, `components/PaymentGroupDetails.tsx` (call sites only).

**Blocking checklist**

- [ ] **(a)** `hooks/useEmployeePayments.ts:39-42` — no clear on `employeeId` change → employee A's payments render under B's header. → Clear + token-guard on id change; render loading until B's data arrives.
- [ ] **(b)** `modals/EmployeeModal.tsx:151-153,161-191` — `void loadServicePrices(editing.employeeId)` with no staleness/cancel guard → A's price rows can reset B's form and be submitted for B. → Token/`AbortController`; ignore stale resolutions; only apply results matching the currently edited employee.
- [ ] **(c)** `components/EmployeeDetailSheet.tsx:171-175` — `perPatientPay` always currency-formatted, ignoring `perPatientPaymentType` (percent shown as EGP). → Branch on the type: currency vs percent (`Intl` percent) with the correct locale.

**Advisory — opportunistic (touched files only):** retry button missing `type="button"`; `isAdmin()` ×4 per render; repeated `onPageSizeChange` closures; `ASCII "..."` placeholders; `PaymentModal` errors unlinked (3rd convention — align to S03 only in that file).

**Advisory — backlog:** every handler toasting + throwing (fully normalized by commit 3's call-site sweep — keep the sweep mechanical); duplicated row-action cells (~60 lines); `PaymentsTable` `Intl` per cell + inline EGP + filter badge always `1` + no date min/max; `new` identity `isRowExpandable`; `PaymentGroupDetails` unbounded map + `#id` without `translate="no"`; `EmployeeDetailSheet` unvirtualized history + inline EGP + 8 casts; `eslint-disable exhaustive-deps`; hardcoded `isFacilityEmployee: true` overwriting stored `false`; disclosure without `aria-expanded`/`controls`; `querySelector` focus; local `Field` re-implementation; schema: shift times required while `shiftType` optional; `buildDoctorPayload` fixed→`"none"` contradiction; one request per user id.

**Acceptance:** tsc + eslint; suite green; manual: open employee A's payments → switch to B → no A rows at any point (slow network); open A's edit modal, immediately switch to B → B's form never populated with A's prices; a percent-type employee shows `x%`, not `EGP`.

**Out of scope:** deduplicating row-action cells; virtualizing payment history; schema redesign.

---

### P2-10 — Clocking (`src/renderer/src/pages/Clocking/`)

**Goal:** stop the per-second whole-page rerender; make clock in/out use the click instant; fix the broken filters/copy.

**Commits (3)**
1. `fix(clocking): isolate the live tick to the duration leaf` — `ClockingPage.tsx`, `hooks/useNowTick.ts`, `components/LiveDuration.tsx`.
2. `fix(clocking): use the click instant for clock-out and future guard` — `ClockingPage.tsx`.
3. `fix(clocking): add the missing anomaly key and fix filter semantics` — `components/AnomalyBadge.tsx`, `components/HistoryFilters.tsx`, locale files.

**Blocking checklist**

- [ ] **(a)** `ClockingPage.tsx:91` + `hooks/useNowTick.ts:14-22` — a 1s `Date` at the page root rerenders header/KPIs/tabs/both tables every second. → Remove the page-level tick; each `LiveDuration` owns its own tick (single shared interval module is acceptable if it does not live on the page); memoize the page sections.
- [ ] **(b)** `components/AnomalyBadge.tsx:36` — missing i18n key `clocking.status.duplicateActive` (raw key shown). → Add to `clocking.en.json` + `clocking.ar.json`.
- [ ] **(c)** `components/HistoryFilters.tsx:62-74` — `<span role="button">` inside a `PopoverTrigger` `Button`. → Sibling control (same fix class as Patients (b)).
- [ ] **(d)** `ClockingPage.tsx:280-286,222` — clock-out and the future-clock-in guard use the ticked `now`, not the click instant (payroll accuracy after background throttling). → `const now = new Date()` inside the click handler; pass it to the guard and the mutation.

**Advisory — opportunistic (touched files only):** `HistoryFilters` trigger `aria-label` "From"; `numberOfMonths` overflow; `LiveDuration` `aria-label` duplicating visible text.

**Advisory — backlog:** toasts from effects keyed on `Error` identity + `t`; `loadFailed` unioning both tabs; `lastPageAfterRemoval` duplication; `pageSize` includes 100 unvirtualized; `HistoryTable` `now` threading + dead `sortKey` + import-as-value; `ClockInModal` `h6` skips + raw `employeeType` + clear-button label is a helper sentence + emptied pay-deduction submits `0`; `anomaly.ts` dead exports; unused `search` type; `toLocalInputValue` re-implementation; `useNowTick` running while hidden; 4 fetch hooks with the same shape + `eslint-disable set-state-in-effect` + no `AbortController`; no URL state.

**Acceptance:** tsc + eslint; suite green; `npm run check-i18n` (new key present in both locales, no MISSING).
- Performance: with DevTools "Paint flashing"/React Profiler, the page body does not re-render each second; only duration text updates.
- Manual: clock out after backgrounding the tab ≥2 min → stored time equals the click instant, not the last tick.

**Out of scope:** virtualizing the history table; unifying the four fetch hooks.

---

### P2-11 — Dashboard (`src/renderer/src/pages/Dashboard/`)

**Goal:** no waterfall, no fake zeros on failure, charts out of the base route chunk, locale-correct dates.

**Commits (4)**
1. `fix(dashboard): load independent data in parallel` — `useDashboardStats.ts`.
2. `fix(dashboard): distinguish failure from empty and stop rendering zeros` — `useDashboardStats.ts`, `DashboardPage.tsx`.
3. `fix(dashboard): lazy-load admin charts and keep recharts out of the shared chunk` — `DashboardPage.tsx`, `AdminDashboard.tsx`.
4. `fix(dashboard): localize recent-activity timestamps` — `RecentActivityTable.tsx`.

**Blocking checklist**

- [ ] **(a)** `useDashboardStats.ts:60-71` — sequential waterfall; chart + logs are independent of stats. → `Promise.allSettled` (or parallel hook calls) so independent resources load concurrently.
- [ ] **(b)** `useDashboardStats.ts:78-83` — lossy failure: a network `TypeError` stays `null`, an `ApiError` triggers `setStats(null)` which renders 0 patients / 0 revenue while stale chart/logs stay. → Normalize all failures (S02 `isNetworkError`) into one error state; render an explicit error/retry surface; **never** render zeros as data; keep partial successes independently rendered with their own error slots.
- [ ] **(c)** `DashboardPage.tsx:7` + `AdminDashboard.tsx:14-17` — static charts/`recharts` in the route chunk for all users. → `React.lazy` the chart components (admin-only), `<Suspense>` with a skeleton; non-admin routes must not pull `recharts`.
- [ ] **(d)** `RecentActivityTable.tsx:15-18` — hardcoded `Intl.DateTimeFormat("en-US")`. → `formatDateTime(date, resolveLocale(language))` (S01).

**Advisory — opportunistic (touched files only)**
- Currency via `toLocaleString()` + concatenation vs the chart's `formatCurrency` (two formats on one screen) → use S01's `formatCurrency` in the touched file.
- `RecentActivityTable`: `new Date` guard, `truncate`, empty copy, raw enum, untranslated `ariaLabel` (same file as commit 4).
- Loading starts `false` → zero flash → initialize loading `true`.
- `KpiStrip` `key` on the translated label → use a stable id.

**Advisory — backlog:** `lineData` pure copy; `KpiStrip` speculative unions/always-identical props; `srSummary` gets title not data; donut labels hardcoded English; deps on whole `user` object; dead non-admin branch; no `AbortController`/dedupe (StrictMode double fetch); `RecentActivityTable` columns rebuilt per render; `UserDashboard` `"Patients: "` + `.filter(item => item.url)` silently dropping nested groups + missing `featureDescriptions` keys; chart `CardTitle`s not headings; charts ignoring reduced motion (covered by S16, verify adoption).

**Acceptance:** tsc + eslint; `npm run test:renderer`; manual: throttle offline → Dashboard shows an error/retry, **no zeros**; slow 3G → stats/chart/logs load concurrently (waterfall absent in the Network panel); as a non-admin, the built chunk does not include `recharts` (`npm run build:renderer` then inspect `dist-electron/app/renderer/assets`); activity timestamps localized in AR.

**Out of scope:** dashboard data-model redesign; `srSummary` content model; chart library swap.

---

### P2-12 — Reports (`src/renderer/src/pages/Reports/`)

**Goal:** typing in search must not rebuild the report; long date ranges must not render hundreds of accordions; range trigger must be named.

**Commits (3)**
1. `fix(reports): isolate draft search state and commit it on generate` — `components/SearchField.tsx`, `state/useReportUrlState.ts`, `ReportsPage.tsx` (call site).
2. `fix(reports): cap nurse assignment accordions and default them collapsed` — `nurses/DailyAssignmentAccordion.tsx` (rendered from `nurses/NurseReportTab.tsx:641-644`, `nurses/NurseDetailDialog.tsx:265-268`).
3. `fix(reports): name the date-range trigger and wire its description` — `components/DateRangeField.tsx`.

**Blocking checklist**

- [ ] **(a)** `components/SearchField.tsx:53-61` + `state/useReportUrlState.ts:74,99-101` — the draft search is page-owned controlled state → the whole report rerenders per keystroke (column arrays and all rows rebuilt; 100 rows × ~14 cols per char; value not applied until Generate anyway). → Move the draft into `SearchField` local state (uncontrolled at the page level), commit upward on Generate/blur/Enter, memoize column arrays. Behavior must remain: the value is **not** applied until Generate.
- [ ] **(b)** `nurses/DailyAssignmentAccordion.tsx:94-176` (rendered `NurseReportTab.tsx:641-644`, `NurseDetailDialog.tsx:265-268`) — unbounded `.map()` over the whole date range ("This year" ≈ 365 accordion items). → Default collapsed + render a bounded window (paged/"show more") while keeping the same data set; no virtualization library (Backlog).
- [ ] **(c)** `components/DateRangeField.tsx:74-99` — the range trigger `<button>`'s accessible name is only the dates; `aria-describedby` wiring is dead (no caller passes `error`). → Add a label/`aria-label` from the field's title key, wire `aria-describedby` when an error exists, and pass `error` from at least one caller to prove the path.

**Advisory — opportunistic (touched files only):** `SearchField` fixed id + missing `name`/`autocomplete` + hardcoded `aria-label` + focus drop; `DateRangeField` preset clicks leaving the popover open; `ReportState` skeleton without label.

**Advisory — backlog:** unreachable `else` + `TabPlaceholder` remnant; options failure without retry; static import of 6 tabs + PDF/CSV builders (chunk size); invalid Generate silently doing nothing; `ReportShell` `span` tooltip wrapper + Generate above filters + `CardTitle` + double `role="status"`; `ReportKpiStrip` dead loading path + `gridColumnsFor(8)` override; `StatusBadges` raw enums + `text-destructive` vs `text-danger`; `useReportSession` one-slot cache + `previous` lag; loading replacing `tbody` (retained payload machinery unused); `replaceDraft`/`clearGenerated` dead; `tabUsesGrouping` vs `TAB_META` dup; dead type exports; `DoctorReportTab` reimplementing `waitForSnapshotRoot`; stuck loading on hand-edited `run=1&scope=specific`; `StatisticsReportTab` triple null-clear + hardcoded EGP + `formatNumber` Latin digits + `startsWith` translation heuristic; `PatientReportTab` inconsistent export handlers + row print without spinner/live + concurrent prints; `EmployeePaymentDetailDialog` `new Date(value)` UTC off-by-one + string-slice time formatting + no `overscroll-contain` ×5; key collisions (`date:type:name`, `employeeId`); accordion controlled-state vs `effectiveValues` override; `ReportsTabs` no `aria-label` + inert `data-state` overrides; page/pageSize/sort/draft not in URL.

**Acceptance:** tsc + eslint; `npm run test:renderer` (esp. `reportsParams.spec.ts`, `reportShellExportWarning.spec.tsx`, the 6 export specs); manual: type 10 chars in search with a 100-row report → profiler shows no row/column rebuild until Generate; "This year" nurse report renders a bounded list with the rest behind "show more"; the date-range trigger is announced with a name (not just dates) and its description when invalid.

**Out of scope:** report URL state expansion; static-import chunking of the 6 tabs; PDF/CSV builder refactors; `PatientReportTab` export-handler consistency.

---

### P2-13 — Login (`src/renderer/src/pages/Login/LoginPage.tsx` + `src/renderer/src/hooks/useLogin.ts`)

**Goal:** required fields must be programmatically required; the lockout countdown must not spam AT.

**Commits (2)**
1. `fix(login): mark required fields and associate validation errors` — `LoginPage.tsx` (+ `hooks/useLogin.ts` if error shape changes).
2. `fix(login): announce the lockout once, not every second` — `LoginPage.tsx`, `hooks/useLogin.ts`.

**Blocking checklist**

- [ ] **(a)** `LoginPage.tsx:78-138` — required fields lack `required`/`aria-required` (the `*` is `aria-hidden`), and `FieldError` is unassociated. → Spread `useFieldControlProps()` (S03) onto both inputs, set `required` + `aria-required`, and associate the error id.
- [ ] **(b)** `LoginPage.tsx:150-164` + `hooks/useLogin.ts:85` — live-region storm: a `role="status"` wrapper plus `aria-live` on a 1 Hz countdown re-announces every second for 60 s. → Remove `aria-live` from the ticking text; announce the lockout state change once (`role="status"` on a message that is not re-rendered per second), and keep the countdown visually live only.

**Advisory — opportunistic (same two files only):** `aria-disabled` on the form → `aria-busy`; password toggle `aria-pressed`; lockout banner's missing next-step text and disabled-with-no-explanation at 0 s; `autoFocus`/`spellCheck`/`autoCapitalize` on username; raw untranslated server message replaced with a keyed message.

**Advisory — backlog:** every RHF error replaced by generic `auth.loginError` (empty submit reports "bad credentials"); no `<main>` + `overflow-x-hidden` + safe-area; `PrivateRoute.tsx:35` redirect dropping query/hash.

**Acceptance:** tsc + eslint; suite green; `npm run check-i18n` if keys change; manual: submit empty → both inline errors + focus on the first; AT announces the error and "required" for each field; trigger the lockout → exactly one announcement, countdown updates visually but not audibly.

**Out of scope:** login page layout/`<main>` restructure; `PrivateRoute` redirect semantics (Backlog).

---

### P2-14 — Admin Roles (`src/renderer/src/pages/Admin/Roles/`)

**Goal:** the permission tile is operable and readable without a mouse, without breaking the Radix bubble-input behavior the spec guards.

**Commits (1–2)**
1. `fix(admin-roles): make permission tiles operable and labelled` — `components/PermissionGrid.tsx` (split the visible-text/`aria-labelledby` half into a second commit if the diff grows).

**Blocking checklist**

- [ ] **(a)** `components/PermissionGrid.tsx:97-121,132-143` — the tile is a `<div onClick>` (no role/`tabIndex`/key handler) and the visible text `<span>` is not part of the control's name → keyboard/AT users only get a 16 px checkbox. → Give the visible label an id and reference it via `aria-labelledby` on the checkbox; make the tile a non-interactive wrapper (click delegates through the existing Radix path) **or** a labelled group with an explicit toggle; ensure no focusable element is hidden.

**Critical regression note:** `src/renderer/test/permissionGrid.spec.tsx` documents a Radix bubble-input double-toggle loop ("Maximum update depth exceeded") when a tile-level click handler sees `target === input`. Preserve that guard logic; run this spec after every edit in this package.

**Advisory — opportunistic (touched file only):** svg `aria-label` needing `role="img"`.

**Advisory — backlog:** spinner without `role="status"`; `usePermissions` error never consumed (catalogue failure reads "0/0"); `RoleModal` discarding changes silently; count mixing selected vs catalogue size.

**Acceptance:** tsc + eslint; `npm run test:renderer` — `permissionGrid.spec.tsx`, `adminRoles.spec.ts`, `diffPermissions.spec.ts`, `permissionKeys.spec.ts` green; `npm run check-i18n` if copy changes; keyboard: Tab reaches a tile, Space toggles, AT reads the feature name + description.

**Out of scope:** permission grid data model; `usePermissions` error UX.

---

### P2-15 — NotFound (`src/renderer/src/pages/NotFound/NotFoundPage.tsx`)

**Goal:** localized 404 with honest copy.

**Commits (1)**
1. `fix(not-found): localize title and description and remove the fake shortcut promise` — `NotFoundPage.tsx`, locale files (`common` or a dedicated namespace already in use).

**Blocking checklist**

- [ ] **(a)** `NotFoundPage.tsx:16-19` — hardcoded English "404" title + description in an otherwise translated page; the copy promises a keyboard shortcut that does not exist. → Key both strings in **both** locales; either implement the promised shortcut or remove the promise (prefer remove).

**Advisory — backlog:** no `<main>`; triple duplicated messaging; `Home` import naming.

**Acceptance:** tsc + eslint; `npm run check-i18n` (no MISSING); manual: navigate to a bad route in EN and AR → fully localized, no shortcut claim.

**Out of scope:** 404 layout redesign.

---

### P2-16 — ComponentsDemo (dev-only, `src/renderer/src/pages/_dev/ComponentsDemo/ComponentsDemoPage.tsx`)

**Goal:** keep the dev harness honest (it is a reference for other pages), low priority.

**Commits (1)**
1. `fix(dev-demo): make the demo search controlled and use locale formatters` — `ComponentsDemoPage.tsx`.

**Blocking checklist**

- [ ] **(a)** `ComponentsDemoPage.tsx:294-298` — frozen controlled search (`value: ""`, `onChange: () => {}`). → Real local state (or uncontrolled with a change handler).
- [ ] **(b)** `ComponentsDemoPage.tsx:440-450` — hand-rolled thousands grouping + `M/D` labels. → S01 `formatNumber` + `formatDate` with `resolveLocale`.

**Advisory — backlog:** no-op pagination callbacks; `t() ??` + ASCII `"…"`; `copy.sort` null-order comment wrong; `useMemo` on static data; nested `h2`; second `lucide` import; inert confirm/buttons + no error path; "lazy-loaded here" comment false + English labels.

**Acceptance:** tsc + eslint; suite green; manual: typing in the demo search updates results; numbers/dates render locale-correct in AR.

**Out of scope:** demo page productization; routing guards for `_dev`.

---

### P2-17 — Admin Users (no package — clean)

`pages/Admin/Users/` has **0 blocking** findings. Do not open a package. Advisory items are backlog-only (see §9): JSX in `useMemo`; toast + rethrow + rethrow chain; comment saying 25-row page while the hook sets 10 + dead `fetcher.params`; username `spellCheck`; no set-focus-first-error; delete/toggle logic duplicated with `RolesPage`.

---

## 8. Phase 3 — Verification & review rollup

Run after the last page package lands.

1. **Full gate**
   ```powershell
   npm run lint
   npx tsc -p src/renderer/tsconfig.json --noEmit
   npm run test:renderer
   npm run check-i18n
   ```
   Compare `check-i18n` MISSING/UNUSED counts against the Phase 0 snapshot. Any new MISSING key fails the phase. UNUSED growth must be explained (removed call sites).
2. **Build sanity (bundle-sensitive changes only):** `npm run build:renderer` — verify the renderer builds and inspect `dist-electron/app/renderer/assets` for a `recharts` chunk that is not referenced by the non-admin entry. Do not run `npm run build` unless server/Electron changed (they should not have).
3. **`test-verifier` (Task)** — independent verification pass over the cumulative diff: re-run the four gate commands, spot-check the manual scenarios in §10, report command output verbatim.
4. **`code-reviewer` (Task)** — one review over the cumulative diff, with these explicit checks:
   - no page commit edited a Phase 1 primitive or a sibling page;
   - no unrequested refactor/dedup;
   - every changed visible string exists in both locale files;
   - no `console.log` of patient data;
   - `useRef` instances are hook-local (no module-scoped request tokens);
   - every `instanceof ApiError` addition/removal is intentional and documented.
5. **`docs-reviewer`** — **not required**. No CLI, config, env var, or public API surface changed. Exception: if an implementer introduces a new env/config key (it should not), run it.
6. **Rollback/checkpointing:** the phase boundary is a good squash/branch point, but never rewrite history to "clean up" without explicit instruction. If a page package must be reverted, revert **only** that package's commits (they are page-scoped by construction).

## 9. Backlog (explicitly deferred — do not do during remediation)

> **Backlog sweep (2026-11-17, `fix/backlog-sweep`) — corrected by content on closeout:** this list uses the **original audit numbering**, while the earlier removal list used the prioritized-backlog numbering; commit `9e3ead4` consequently deleted eight **unfixed** rows (1-6, 19, 21 — restored below) and left fixed rows behind. Removed below because the sweep fixed them: **9** (Reports column memoization → `485982f`), **10** (`now` threading removed entirely by `9948297` — moot), **11** (`isNetworkError` localization → batch B), **14** (`5a67649`), **15** (`844e4ec`), **16** (`966a5d8`), **17** (`849ee6b` + `134abe9` + `db4eb28`), **20** (`b27b153`), **22** (`fb6702e`), **25** (`b494629`). Remaining items keep their **original numbers** (no renumbering); new wave findings are in "Wave residuals".

1. **Dedup refactors**
   - `DrugsTable` ↔ `SuppliesTable` mirror (~1,000 lines) + the two mirrored shipment/warehouse panels.
   - 9 `Reports/hooks/*` report hooks with the same shape; `useDoctorReport`/`usePatientReport` differing only by a function.
   - 9 Employees/Clocking fetch hooks with identical structure.
   - Insurance financial logic ×3 (`report/financials.ts`, `footerRows.ts`, `print/*Pdf.ts`).
   - Local date padders ×4; scope-string mappers ×4; `AddPricesModal` 3 near-identical tab bodies; 3 Employees error conventions (`<p>`, local `Field`, `PaymentModal`); 3 PatientDetail row state machines.
2. **URL state** on Patients list, Drugs, Supplies, Employees (`?tab=` only today), Insurance list, PriceLists, Clocking, and Reports (`page`/`pageSize`/`sort`/`draft`).
3. **Virtualization/pagination** for large client lists: Employees payment history, `PaymentGroupDetails`, Clocking history, Reports nurse accordions beyond the cap, `AddPricesModal`, `PatientsGrid`/`Insurance` beyond the client cap, `pageSize = 100` tables.
4. **Server-side aggregates/paging**: drugs/supplies per-row fan-out, insurance patient paging, usage-summary filters, drugs/supplies turnover denominators.
5. **CSV/print hardening**: CSV-injection guard in `exportItemsCsv` + `csv/*` builders, UTC off-by-one in `groupPrintBillItems`/`EmployeePaymentDetailDialog`, PDF footer duplication.
6. **`PrivateRoute` redirect** preserving query/hash (`components/common/PrivateRoute.tsx:35`); `lib/api.ts:186` silent `pageSize` clamp + `SORT_COLUMN_MAP` no-op; `useReportSession` cache semantics; `lib/billEvents` doc-vs-implementation; dead code sweeps (`anomaly.ts`, `TabPlaceholder`, `replaceDraft`/`clearGenerated`, `useWarehouses` compat re-export, `sellSchema` leftovers).
7. **Design-system polish**: skip link, `<main>` landmarks on Login/NotFound, `CardTitle` heading adoption everywhere, safe-area handling, `overscroll-contain` on dialogs, `aria-busy` on skeletons.
8. **PHI log left in the print path** (found during P2-02, print pipeline out of scope): `pages/Patients/print/printBill.ts:424` still `console.log`s a variable while printing. Remove and replace with nothing (no patient data in logs).

**Accepted advisory backlog from the Phase-3 review (one line each, no action taken):**

12. `DataTable`: `aria-controls` IDREF dangles while collapsed; `expandedAriaHidden`/`expandedLabel` are effectively dead for current consumers.
13. `FieldLabel` renders a dangling `for` on group-style `Field`s (no single control to point at).
18. `DailyAssignmentAccordion`: `visibleCount` not reset on data change; `defaultOpen` prop is dead.
19. `SearchField` syncs only through `committedRef` — external value changes can be missed.
21. `ShipmentModal` `matrixError` is not cleared on subsequent edits.
23. Disabled + `aria-disabled` redundancy on several buttons; `noBillYet` `role="status"` re-announces on each dialog open.
24. `PatientListPanel` rows expose a double tab stop (row + name link).
26. `admissionFormat.calculateLengthOfStay` floors ≤59 min to "less than an hour" (under-reports).
27. `AddPricesModal` sibling `ConfirmDialog` focus-trap seam — manual check still pending.
28. Six commit subjects exceed the 72-char convention (record-only, no rewrite).
29. `patients.en.json` `noBillYet` indentation is inconsistent with its neighbours.
30. No committed tests for the new contracts: `ConfirmDialog` `false`/throw, wizard resolver gate, bill-id sentinel, S02 `NetworkError` mapping.

### Wave residuals (discovered during the backlog sweep)

1. **Raw-key error rendering.** `patients.validation.invalidPhone` / `patients.validation.invalidFormat` are missing from both locale files, and `FieldError` renders zod messages verbatim (no `t()`) on the wizard and `EditPatientDialog` surfaces — users see raw keys. Fix = add both keys to `patients.en.json` + `patients.ar.json` and adopt `t()` at the error render.
2. **`VALIDATION_KEYS.nurse` is dead** in `patients/schemas/patient.schema.ts` (no rule, no error slot). Remove it or wire a nurse rule — product decision.
3. **Four Reports detail dialogs** (Doctor / Nurse / ClockIn / EmployeePayment) still build their `DataTable` columns inline; apply the same identity stabilization landed for the five tabs in batch C.
4. **Date-format hardening follow-up.** `Dashboard/RecentActivityTable.tsx` needs a `formatDateTimeSafe` sibling of `formatDateSafe`; ~55 display sites remain unguarded or truthy-only (census in the wave notes); `PatientProfilePanel`'s `.toLocaleDateString()` ignores the active locale.
5. **ESLint follow-up clusters** (post-reduction baseline 298 = 282E/16W): 62 test `any` sites in `src/app/tests` (needs a shared typed mock factory + `asRequest`/`asResponse` helpers; jasmine is DB-gated), 67 `no-useless-catch`, 135 remaining app `no-explicit-any` (`Promise<any>` / `data: any` signatures, cron params, `.d.ts` DTOs), 41 + 7 `no-unused-vars`, 20 `prefer-const`, 10 `react-refresh/only-export-components` (move `*Variants`/hooks out of `components/ui`), 15 `react-hooks/incompatible-library` (RHF `watch` — form-strategy change), 1 `exhaustive-deps` in `SupplyShipmentModal` `[open]` (behaviour-sensitive — leave).
6. **`pdfmakeLoader.ts` debug `console.log(pdfMake)`** remains (distinct from item 8's printBill PHI logs).
7. **Server batch-E changes are type-only and compiled-unverified at runtime** — run the jasmine suite against the test DB when available.
8. **Deferred manual QA additions:** supplies fail-closed trade-off; settle empty-draft inline error; sell-modal live over-quantity warning; employees percent precision + Arabic digits; UserDashboard non-admin stats fetch; `PriceListModal` create-path 400 ambiguity; wizard step-by-step QA; Reports DevTools profiler; Clocking anomaly escalation.

## 10. Global acceptance criteria

A package is **done** only when all of the following hold:

- [ ] Every blocking checkbox for that page is ticked, or explicitly deferred with a written reason and an orchestrator-approved scope change.
- [ ] `git show --stat` for each commit lists only files inside the intended package (Phase 1: only the primitive's own path).
- [ ] `npx tsc -p src/renderer/tsconfig.json --noEmit` exits 0.
- [ ] `npx eslint <touched files>` exits 0; `npm run lint` exits 0 at phase boundaries.
- [ ] `npm run test:renderer` is green (no new failures vs Phase 0).
- [ ] If locale files changed: `npm run check-i18n` shows no new MISSING keys, and every new key exists in **both** `en` and `ar`.
- [ ] The manual scenarios listed in the package's Acceptance section were actually executed (recorded in the ledger).
- [ ] No new `console.log`/`console.error` of patient/financial data.
- [ ] No behavior change outside the audited defect (no drive-by refactors).
- [ ] No `git push` was performed.

## 11. Execution rules for implementer slices

1. **One slice = one commit-sized package.** A slice is: read the package section → make the smallest change that closes its listed blockers → run §5.1 scoped verification → commit with the package's `fix(<scope>)` message. Never bundle two packages.
2. **Order is fixed.** Phase 0 → Phase 1 (S01…S16) → Phase 2 in the listed order. A page that needs a primitive not in Phase 1 **stops** and reports.
3. **Before each commit:** `git status --porcelain` — the only new entries may be the files you intended to touch. Pre-existing entries (`.opencode/skills/...` deletions, deleted `skills-lock.json`, modified `src/renderer/vitest.config.ts`, untracked `.agents/skills/*`) must be left exactly as found: never stage, revert, or commit them.
4. **Stuck rule:** if a blocking fix requires touching a shared primitive or a second page, or if the smallest correct fix is a refactor, stop and report with the file, the reason, and the proposed scope.
5. **Ledger:** append one row per commit to the table below (`ID | scope | files | verified (commands) | notes`), so a fresh engineer can resume after context loss.

| ID | Scope | Files | Verified | Notes |
| --- | --- | --- | --- | --- |
| P0 | baseline | — | `npm run lint` **exit 1** (pre-existing red) · `tsc -p src/renderer` exit 0 · `test:renderer` 15 files / 135 tests pass · `check-i18n` exit 0 | Baseline is **not green**: 534 lint problems (495 errors, 39 warnings) pre-existing. Bar for later commits = no new lint failure. See "Phase 0 baseline record". |
| S01 | node-formatters | `src/renderer/src/lib/utils.ts` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · runtime probe: defaults unchanged | `formatCurrency(amount, locale, currency = "EGP")`; `formatNumber(n, decimals, locale)` via `Intl.NumberFormat`, non-finite → `0` kept. No call sites changed, no default switched to `resolveLocale`. |
| S02 | api-client | `src/renderer/src/lib/api.ts`, `src/renderer/src/lib/errors.ts` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · runtime probe: offline → `NetworkError` (0 / `NETWORK_ERROR`), 404 + 204 unchanged | `fetch` rejection wrapped as `NetworkError extends ApiError`; `isNetworkError` exported; HTTP branches / 401 side-effect / 204 path untouched; 0 `pages/**` files in the phase diff. |
| S03 | ui-field | `src/renderer/src/components/ui/field.tsx` | scoped eslint exit 0 (1 documented disable) · tsc exit 0 · test:renderer 15/135 pass · SSR DOM probe green | `FieldContext` mints `useId()` → `controlId` / `${id}-description` / `${id}-error`; `Field` provides it, keeps `role="group"`, reflects `invalid` → `data-invalid`; `FieldLabel`/`FieldDescription`/`FieldError` auto-wire ids (explicit props win); `FieldError` now `aria-live="polite"` with `role="alert"` **removed** per spec; `useFieldControlProps` gates `aria-describedby` (no dangling error id when valid). One `eslint-disable-next-line react-refresh/only-export-components` for the hook export (same rule already fires pre-existing in `button.tsx`/`badge.tsx`). |
| S04 | ui-card | `src/renderer/src/components/ui/card.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green | `CardTitle` gains `as?: "div" \| "h2" \| "h3" \| "h4"` (default `"div"`); classes and `data-slot="card-title"` unchanged; no inference; no page adoption. |
| S05 | ui-button | `src/renderer/src/components/ui/button.tsx` | scoped eslint **not** exit 0 — pre-existing `react-refresh/only-export-components` 69:18, identical via `git show HEAD:file \| eslint --stdin` · tsc exit 0 · test:renderer 15/135 pass | `transition-all` → `transition-[color,background-color,border-color,box-shadow,opacity,transform]`; timing/easing untouched; no API change. Bar met: 1 error before, 1 after. |
| S06 | ui-alert | `src/renderer/src/components/ui/alert.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green | `live?: "assertive" \| "polite" \| "off"` (default `"assertive"`): assertive → `role="alert"` + `aria-live="assertive"` (unchanged semantics), polite → `role="status"` + `aria-live="polite"`, off → neither; caller-supplied `role`/`aria-live` still override; `live` never reaches the DOM. |
| S07 | ui-native-select | `src/renderer/src/components/ui/native-select.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass | Closed `<select>`: `bg-transparent` → `bg-background` + `text-foreground`; `dark:bg-input/30` / hover / focus ring / disabled / aria-invalid tokens retained (matches `button.tsx` outline convention). **Manual Windows dark-mode check deferred.** |
| S08 | stat-card | `src/renderer/src/components/common/StatCard.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green | `focus-visible:*` removed from the inner `Card`; ring moved to the `Link`/`button` wrappers (layout classes kept); `aria-label` composed only for non-empty **string** values, omitted for numbers/blank, new `ariaLabel?` override wins. **Manual Tab-ring AT pass deferred.** |
| S09 | page-header | `src/renderer/src/components/common/PageHeader.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass | Adds `text-balance` to the `<h1>`. **Visual check (Reports/Insurance, en/ar, RTL) deferred.** |
| S10 | empty-state | `src/renderer/src/components/common/EmptyState.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green | Blanket `role="region"` replaced by `live?: "status" \| "alert" \| "off"` (default `"status"` → `role="status"` + `aria-live="polite"`, named from `title`); `"alert"` → `role="alert"` + assertive; `"off"` → no role/live/label. No unnamed landmark remains. **AT spot check deferred.** |
| S11 | editorial-kpi-card | `src/renderer/src/components/common/EditorialKpiCard.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass | Hairline rule: `transition-all` → explicit property list; height (`h-px` → `h-0.5`) now snaps instead of animating layout. **Visual check deferred.** |
| S12-prep | ui-pagination | `src/renderer/src/components/ui/pagination.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green | Plan-sanctioned separate component commit: S12's `asChild` assumption was broken (PaginationLink hardcoded `<a>`, props had no `asChild`/`disabled`). Adds optional `asChild`/`disabled`, rendering a native `<button type="button">`; default anchor path unchanged. |
| S12 | data-table-pagination | `src/renderer/src/components/common/DataTablePagination.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green (en, page 1 + 3) | All pager actions are buttons via `asChild` (no `href="#"`, no `preventDefault`); boundary prev/next use real `disabled` instead of `aria-disabled`; `aria-current="page"` kept; previous/next text **and** aria-labels localized from `common.previous`/`common.next`; page links get `"${t("common.page")} N"` labels. Active page stays enabled + `aria-current` (see deviations). **Keyboard walk deferred.** |
| S13 | confirm-dialog | `src/renderer/src/components/common/ConfirmDialog.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · 4/4 temp Vitest DOM checks (deleted before commit) | `onConfirm` may return `false` → keep open, no error; success → dialog closes itself; throw → logged once, no rethrow/unhandled rejection. Contract documented on the prop; no call sites changed. **Forced-reject manual check (devtools offline) deferred.** |
| S14 | data-table | `src/renderer/src/components/common/DataTable.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green | Expanded row no longer blanket `aria-hidden`: toggle has `aria-expanded` + `aria-controls`, content wrapped in `role="region"` named via new `expandedLabel?`, and `expandedAriaHidden?` (default `false`) opts decorative expansions back in. **Keyboard walk per consumer (Patients/Drugs/Supplies/Employees/Insurance) deferred.** |
| S15a | data-table | `src/renderer/src/components/common/DataTable.tsx` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · SSR probe green (5/8/3/100/undefined pageSize) | `memo(DataTableInner) as typeof DataTableInner` keeps the generic named export; skeleton takes `pageSize` → `min(max(pageSize ?? 10, 5), 8)` rows; `sortKey` documented as **not** consumed by the table (call sites pass it without `onSortToggle`, so consuming = behaviour-adding → Backlog). |
| S15b | data-table | `src/renderer/src/components/common/DataTable.tsx`, `src/renderer/src/locales/common.{en,ar}.json` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · `check-i18n` exit 0, MISSING 26 unchanged · SSR probe green | No-op `noData` ternary collapsed: filtered → `common.noResults` + `common.noResultsHint`, unfiltered → `common.noData` with no description; patients-specific default removed; `emptyTitle`/`emptyDescription` overrides still win. New flat keys added to **both** locales. **Visual loading/empty check deferred.** |
| S16a | charts | `src/renderer/src/components/charts/chartAnimation.ts` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass · live jsdom probe green | `useChartAnimation()` now ANDs the snapshot context with `(prefers-reduced-motion: reduce)` read via `useSyncExternalStore` (cached `MediaQueryList`, SSR/jsdom-safe → animated). OS toggle flips charts without reload; listener unsubscribes on unmount. **Electron OS reduce-motion check deferred.** |
| S16b | charts | `src/renderer/src/components/charts/index.ts` | scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 pass | All 15 barrel import sites are pages, so no re-export is removable here without page edits: the barrel now documents that it pulls `recharts` into the importing chunk and that route code should import chart modules directly / lazily. No export changes. |
| P2-01 | patients | `CreatePatientWizardDialog.tsx`, `PatientFilters.tsx`, `PatientListPanel.tsx` | 3 commits · scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 after each · temp DOM probes green | (a) zodResolver over the step schemas (namespaced form schema composed from `patient.schema.ts`, which is unmodified), inert validator deleted, `Next` gated by the same step schemas, Save is the form submit so Enter submits on the last step. (b) clear-range is a sibling ghost icon Button (no nested `role="button"`). (c) name cell is a Router `<Link>`, row click kept as mouse affordance, date localised. **Manual checks deferred** (wizard inline errors/focus, clear-range keyboard, link focus). |
| P2-02 | patient-detail | wizard-free billing/admissions subtree (10 files + `patients` locales) | 5 commits · scoped eslint exit 0 · tsc exit 0 · test:renderer 15/135 after each · 11 temp DOM/unit checks · check-i18n MISSING 26 → 24 | (a) `save()` returns `{ ok, error }`; success toast only on success, inline error otherwise. (b) string money drafts (`type="text"` + `inputMode="decimal"`), parse once, format on blur. (c)(i) no `billId ?? patientHistoryId` fallback (0 = "no bill"), settle disabled + no-bill note, dialog keyed per admission, row cleared on close. (d)(g)(h) labels associated, sub-24h durations in hours, add-drug label one key, diagnosis hint once, `patients.fields.admissionNotActive` added. (e) PastAdmissionCard transition list included here per dispatch. (f) 3 PHI `console.log`s removed. **Manual billing/admissions checks deferred.** |
| P2-03 | drugs | | | |
| P2-04 | supplies | | | |
| P2-05 | insurance | | | |
| P2-06 | vault | | | |
| P2-07 | price-lists | | | |
| P2-08 | services | | | |
| P2-09 | employees | | | |
| P2-10 | clocking | | | |
| P2-11 | dashboard | | | |
| P2-12 | reports | | | |
| P2-13 | login | | | |
| P2-14 | admin-roles | | | |
| P2-15 | not-found | | | |
| P2-16 | dev-demo | | | |
| P3 | verification + review fixes | 6 page/modal files, 4 locale files, this plan | 6 fix commits: scoped eslint exit 0, tsc exit 0, test:renderer 15/135 each · full lint `534 problems (495E/39W)` unchanged · rev-count 84 | Reviewer verdict: **approved with 2 blocking findings**, both fixed in this batch. **B1** — all 6 delete handlers in Services / Drugs (×2) / Supplies (×2) / PriceLists now `return false` after catch+toast, so `ConfirmDialog` (S13 contract) stays open on failure. **B2** — shipment EDIT rejects zeroing a row that previously had a price (inline matrix error + focus), instead of filtering it out and letting the server keep the old price; false "server rejects price <= 0" comments corrected; 2 new locale keys (`pharmacy`/`medicalSupplies` `validation.existingPriceRequired`). Test-verifier: **PASS**, incl. build chunk proof — entry chunk 0 `recharts` hits. |

### Phase 0 baseline record (2026-11-15)

Branch `fix/guidelines-audit-remediation`, created from `react-refactor` @ `de6ec09`. Baseline measured on the pre-existing dirty tree, unmodified:

`git status --porcelain` — **90 entries**, all pre-existing and deliberately left untouched:

- 85 × `D` total: 76 under `.opencode/skills/react-best-practices/**`, 8 under `.opencode/skills/react-view-transitions/**`, 1 `skills-lock.json`
- 1 × `M src/renderer/vitest.config.ts` (`__dirname` → `import.meta.dirname`)
- 3 × `?? .agents/skills/{vercel-react-best-practices,vercel-react-view-transitions,web-design-guidelines}/`
- 1 × `?? .opencode/plans/guidelines_audit_remediation_plan.md` (this plan file, first added by the ledger commit)

| Command | Exit | Condensed output |
| --- | --- | --- |
| `npm run lint` | **1** | `✖ 534 problems (495 errors, 39 warnings)`, 21 errors + 20 warnings auto-fixable. Dominant rules: `@typescript-eslint/no-explicit-any`, `no-useless-catch`, `prefer-const`, `react-refresh/only-export-components`, `react-hooks/incompatible-library`; concentrated in `src/app/**`, `src/electron/**`, `src/renderer/src/components/ui/*`. **No** finding in `lib/utils.ts`, `lib/api.ts`, `lib/errors.ts` — scoped `npx eslint` on those three exits 0. |
| `npx tsc -p src/renderer/tsconfig.json --noEmit` | 0 | no output |
| `npm run test:renderer` | 0 | `Test Files 15 passed (15)` · `Tests 135 passed (135)` · 3.00 s. Node's `--localstorage-file` warning surfaces as `NativeCommandError` under PowerShell; exit code is 0. |
| `npm run check-i18n` | 0 | `Keys used in code: 1710` · MISSING: `en.json` 12, `ar.json` 14 (26 total) · UNUSED: `en.json` 576, `ar.json` 579 (1155 total). The checker reports per locale file, not per namespace; missing keys are concentrated in `patients.*` / `employees.*` used by `pages/Patients/**` and `pages/Employees/**`, plus `common.record`. |

**Baseline verdict:** red on lint only. Per §5.4 every later commit is held to **no new failure**: scoped `npx eslint <touched files>` must exit 0 and the global `534 problems (495 errors, 39 warnings)` must not grow. tsc / Vitest / i18n are green and must stay green.

### Slice verification log (Phase 1, S01–S02)

| Slice | eslint (scoped) | tsc | `npm run test:renderer` | Extra evidence |
| --- | --- | --- | --- | --- |
| S01 | exit 0 (no output) | exit 0 | 15 passed / 135 passed, 3.51 s | Runtime probe of the real module: `formatNumber(1234.5)="1,235"`, `formatNumber(1234567)="1,234,567"`, `formatNumber(-1234.567,2)="-1,234.57"`, `formatNumber("12345")="12,345"`, `formatNumber(NaN)="0"`, `formatNumber(Infinity)="0"`, `formatNumber(1234,0,"ar-EG")="١٬٢٣٤"`; `formatCurrency(1234.5)="EGP 1,234.50"` (default unchanged), `formatCurrency(1234.5,"ar-EG")="‏١٬٢٣٤٫٥٠ ج.م.‏"`, `formatCurrency(12.5,"en-US","USD")="$12.50"` |
| S02 | exit 0 (no output) | exit 0 | 15 passed / 135 passed, 3.23 s | Runtime probe with a rejecting `fetch` stub: `api.get("/drugs")` rejects with `name=NetworkError`, `code=NETWORK_ERROR`, `statusCode=0`, `endpoint=/api/drugs`, `cause` preserved. HTTP branches unchanged: 404 → `ApiError` `statusCode=404` `code=NOT_FOUND` `message="Not found"`; 204 → resolves `undefined`. `isNetworkError` returns true for `NetworkError`, false for `ApiError` / `Error` / `null`. `git diff --name-only react-refactor..HEAD` → 0 files under `src/renderer/src/pages/**`. |

### Slice verification log (Phase 1, S03–S08)

All six slices: `npx tsc -p src/renderer/tsconfig.json --noEmit` exit 0; `npm run test:renderer` `Test Files 15 passed (15)` / `Tests 135 passed (135)`; full `npm run lint` after S08 = `✖ 534 problems (495 errors, 39 warnings)` — identical to baseline, **no new failures**. Manual keyboard/AT and Windows-theme spot checks are **deferred** (not executed in this dispatch).

| Slice | Scoped eslint | Extra runtime/DOM evidence |
| --- | --- | --- |
| S03 | exit 0 after adding one targeted `eslint-disable-next-line react-refresh/only-export-components` on the hook export | SSR render: `<label for="_R_0_">` matches `<input id="_R_0_" aria-invalid="true" aria-describedby="_R_0_-description _R_0_-error" aria-required="true">`; description `id="_R_0_-description"`; error `id="_R_0_-error" aria-live="polite"` and **no** `role="alert"`; valid state omits `aria-invalid`/`aria-required` and describedby carries only the description id (no dangling `-error`); explicit `htmlFor`/`id` win; `Field` gets `data-invalid="true"` only when `invalid`. |
| S04 | exit 0 | SSR render: default → `<div data-slot="card-title" class="font-heading text-base leading-normal font-medium group-data-[size=sm]/card:text-sm">`; `as="h2"/"h3"/"h4"` → matching `<h2>/<h3>/<h4>` with identical classes; `data-slot` unchanged; `as` never reaches the DOM. Tailwind preflight zeroes heading margins, so no layout shift. |
| S05 | **exit 1, pre-existing only** (`69:18 react-refresh/only-export-components`); `git show HEAD:button.tsx \| npx eslint --stdin` reports the same single error, and it appears in the Phase 0 baseline | Diff is one line: `transition-all` → explicit property list. No API change. |
| S06 | exit 0 | SSR render: default → `role="alert" aria-live="assertive"`; `live="polite"` → `role="status" aria-live="polite"`; `live="off"` → neither, classes/`data-slot` kept; caller `role`/`aria-live` override still wins; no `live` attribute leaks to the DOM. |
| S07 | exit 0 | One-line class change: `bg-transparent` → `bg-background` + `text-foreground`; focus-visible ring, disabled and `aria-invalid` tokens untouched. **Deferred:** Electron/Windows dark-mode visual check. |
| S08 | exit 0 | SSR render: `Link` wrapper carries `focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2` and `aria-label="Active patients: 24"`; inner `Card` has no `focus-visible:*` and keeps `cursor-pointer hover:shadow-md`; `value={12500}` and `value="  "` omit `aria-label`; `ariaLabel` override wins; `button` wrapper keeps `type="button"` + `block w-full rounded-lg text-left`; inert card renders a bare `div` with no `aria-label`. **Deferred:** keyboard Tab-ring walk + AT pass on Dashboard. |

### Slice verification log (Phase 1, S09–S16)

All slices: `npx tsc -p src/renderer/tsconfig.json --noEmit` exit 0; `npm run test:renderer` `Test Files 15 passed (15)` / `Tests 135 passed (135)` after every commit. Phase-level after S16b: `npm run lint` = `✖ 534 problems (495 errors, 39 warnings)` — **identical to baseline**; `npm run check-i18n` exit 0, MISSING 26 (unchanged), UNUSED 1155 (unchanged), used keys 1710 → 1712. Manual keyboard/AT/theme checks **deferred** (not executed in this dispatch).

| Slice | Scoped eslint | Extra runtime/DOM evidence |
| --- | --- | --- |
| S09 | exit 0 | One class added to the `<h1>`; `text-balance` maps to `text-wrap: balance` in Tailwind v4. **Deferred:** visual check on Reports/Insurance, both locales, RTL. |
| S10 | exit 0 | SSR render: default `<Empty role="status" aria-live="polite" aria-label="No patients">`; `live="alert"` → `role="alert" aria-live="assertive"`; `live="off"` → no role/live/label; **no `role="region"`** in any case; classes and `data-slot="empty"` preserved; title text still rendered. **Deferred:** AT spot check on an empty table. |
| S11 | exit 0 | Class-list swap only; the active hairline no longer animates height. **Deferred:** visual check on Reports KPI strips. |
| S12-prep | exit 0 | SSR render: default path still yields `<a href="/x" data-slot="pagination-link">`; `asChild` yields three `<button type="button">`, no anchors, exactly one `disabled` (the previous boundary), `aria-current="page"` preserved, no `href`, `data-slot` kept, localized `aria-label` overrides the hardcoded English default. |
| S12 | exit 0 | Full-component SSR render (en i18n): 5 buttons, **no anchors, no `href`**, all `type="button"`; page 1 → Previous disabled / Next enabled; page 3 → Next disabled / Previous enabled; `aria-label="Page N"` on page links with `aria-current="page"` on the active one; only one disabled control per boundary; page-size select + "1 of 3" footer unchanged; no `aria-disabled` anywhere. **Deferred:** keyboard walk of Patients/Drugs pagination + URL-unchanged check. |
| S13 | exit 0 | 4/4 temporary Vitest DOM checks (file deleted before commit, never staged): resolves → `onOpenChange(false)` called; async resolve → same; returns `false` → stays open with zero `[ConfirmDialog]` logs; throws → stays open, exactly one `[ConfirmDialog] onConfirm rejected` log, no unhandled rejection. **Deferred:** forced-reject manual check via devtools offline. |
| S14 | exit 0 | SSR render: toggle `aria-expanded="true"` + `aria-controls="_R_0_-expanded-1"`; region `<div id="_R_0_-expanded-1" role="region" aria-label="Shipments for Panadol">` (id matches controls, named from `expandedLabel`); expanded row has **no** `aria-hidden`; inner button rendered; collapsed → `aria-expanded="false"` and no region node; `expandedAriaHidden` restores `aria-hidden="true"` while keeping the region. **Deferred:** keyboard/AT walk of each expandable consumer. |
| S15a | exit 0 | SSR render row counts: pageSize 10 → 8, 5 → 5, 3 → clamped 5, 100 → clamped 8, no pagination → 8; memo-wrapped `DataTable` still renders header + rows. **Deferred:** visual loading-state check. |
| S15b | exit 0 | SSR render: unfiltered empty → "No data available", no description; filtered empty → "No results found" + "Try adjusting your search or filters."; old patients copy ("Try a different search term.") absent; explicit `emptyTitle`/`emptyDescription` win; empty surface announced as `role="status"`. **Deferred:** visual empty-state check. |
| S16a | exit 0 | jsdom + React client probe: animation `true` by default; flips to `false` when the mocked OS query changes to reduce **without remount**; flips back; snapshot context still forces `false`; listener count returns to 0 on unmount. **Deferred:** Electron check with OS "reduce motion" on/off. |
| S16b | exit 0 | Grep: all 15 `@/components/charts` import sites are `pages/**` chart consumers; `ChartShell` (recharts-free) is imported directly by the chart wrapper modules and by `chartSrTable.spec.tsx`, not via the barrel. Nothing removable without page edits → documentation only. |

### Adoption notes for Phase 2 (what page packages must now pass)

| Primitive | Pages must |
| --- | --- |
| `lib/utils` (S01) | Pass `resolveLocale(language)` to `formatNumber`/`formatCurrency` to localise digits; third `formatCurrency` arg is the currency (default `"EGP"`). Defaults stay `en-US`/Latin digits, so **not** passing a locale keeps old output. |
| `lib/errors` (S02) | Branch on `isNetworkError(error)` (or `statusCode === 0`) for offline copy; `err.message` is the English `"Network request failed"` until the page localises it. |
| `ui/field` (S03) | Wrap each field in `<Field invalid={...}>`, spread `useFieldControlProps({ invalid, hasDescription, required })` onto the control (call it in a component rendered **inside** `Field`), and render `FieldError` inside the same `Field`. Explicit `id`/`htmlFor` still win. |
| `ui/card` (S04) | Pass `as="h2"` / `"h3"` on `CardTitle` where the card is a real heading; never skip levels. |
| `ui/alert` (S06) | Pass `live="polite"` for stock/below-price warnings, `live="off"` for static informational alerts. Default stays assertive. |
| `ui/native-select` (S07) | No call-site change needed; closed control now paints `bg-background`/`text-foreground`. |
| `common/StatCard` (S08) | No call-site change needed; pass `ariaLabel` only when the visible label + value are not a sufficient name (e.g. translated/abbreviated values). |
| `common/PageHeader` (S09) | No call-site change; long titles now balance across lines. |
| `common/EmptyState` (S10) | Pass `live="alert"` for load-failure surfaces and `live="off"` for decorative in-card empties; default `"status"` announces once on mount, so static placeholders should opt out. |
| `common/EditorialKpiCard` (S11) | No call-site change. |
| `common/DataTablePagination` / `ui/pagination` (S12) | No prop changes. Tables already pass `pagination`; pager controls are buttons now, so keyboard walks replace anchor expectations. `PaginationLink asChild` is available for future button-style pagers. |
| `common/ConfirmDialog` (S13) | Stop `throw`-ing for expected failures: return `false` (keeps the dialog open, logs nothing) and keep your own toast. Throwing is now swallowed-and-logged. The dialog closes itself on success, so a redundant `setOpen(false)` is harmless. |
| `common/DataTable` (S14/S15) | Expansion consumers should pass `expandedLabel={(row) => ...}` for a meaningful region name, and must drop row-summary duplication from expanded content (it is now audible). Loading skeletons auto-size from `pagination.pageSize`; empty tables use neutral copy unless `emptyTitle`/`emptyDescription` are passed. `sortKey` remains caller-owned. |
| `components/charts` (S16) | Import chart components directly (`@/components/charts/GroupedBarChart`) or lazily; the barrel pulls `recharts` into the importing chunk. Animation now honours the OS reduced-motion setting — do not hardcode `isAnimationActive`. |

### Phase 2 slice verification log (P2-01, P2-02)

Phase-level after P2-02: `npm run lint` = `✖ 534 problems (495 errors, 39 warnings)` (identical to baseline); `npm run check-i18n` exit 0 — MISSING 26 → **24** (the `patients.fields.admissionNotActive` gap closed), UNUSED 1155 → 1153, used keys 1716; `npx tsc -p src/renderer/tsconfig.json --noEmit` exit 0; `npm run test:renderer` 15 files / 135 tests green after every commit; `git diff --name-only react-refactor..HEAD` touches only `src/renderer/src/pages/Patients/**` (+ locale files + this plan). Manual scenarios (wizard focus/Enter, clear-range keyboard walk, patient-name link, failing-PUT billing, `1.5` money input, settle A→B, `<24h` in both locales, no PHI logs) are **deferred — not executed**.

| Commit | Scoped eslint | Extra evidence |
| --- | --- | --- |
| P2-01/1 wizard | exit 0 (1 pre-existing RHF `watch` warning) | 5/5 temp Vitest DOM checks: `Next` disabled until name ≥ 2 chars + gender; non-numeric national id blocks; advances when valid; Save posts `{name:"Ali Hassan", gender:"male"}` once; `form.requestSubmit()` (Enter) submits on the last step. |
| P2-01/2 filters | exit 0 | 2/2 temp DOM checks: clear button has `aria-label`, has no button ancestor, trigger contains no interactive descendant, click emits `{registeredFrom: undefined, registeredTo: undefined}`, and it is hidden when no range. |
| P2-01/3 list | exit 0 | 4/4 temp DOM checks: name cell renders `<a href="/patients/7">Ali Hassan</a>`, row keeps `tabindex=0` affordance, link navigates to `/patients/7`, date renders `8/15/2026`. |
| P2-02/1 billing save | exit 0 (1 pre-existing RHF `watch` warning) | 4/4 temp hook checks: 2xx → `{ok:true}`, 500 → `{ok:false}` with the `ApiError` in both return and state, fetch rejection normalised, no-bill no-op returns `{ok:false,error:null}` without a request. |
| P2-02/2 money | exit 0 | 3/3 temp DOM checks: input is `type=text` + `inputmode=decimal`; keystrokes `1` → `1.` → `1.5` keep the text and emit `1`, `1`, `1.5` (never `15`); blur keeps `1.5`; parent reset clears the draft. |
| P2-02/3 settle/bill ids | exit 0 (pre-existing warnings only) | 3/3 temp DOM checks: `billId: 0` renders the no-bill note and disables Settle; draft starts from `currentPaid`; re-keying remounts with the new admission's figure. `check-i18n`: no new MISSING. |
| P2-02/4 labels/durations | exit 0 (pre-existing unused-disable warnings) | Duration probe: 30 min → "less than an hour", 90 min → "1 hour", 5 h → "5 hours", 23.5 h → "23 hours", 24 h → "1 day", 36 h → "2 days", 72 h → "3 days", invalid → "—". `check-i18n`: MISSING 26 → 24. |
| P2-02/5 PHI logs | exit 0 | `console.(log|debug|info)` grep over both touched files returns nothing. |

### Phase 2 lane merges

Six lane branches were integrated into `fix/guidelines-audit-remediation` with `--no-ff`, in dependency order, with **zero conflicts** (all lanes are folder-disjoint: own `pages/<Page>/**` + own locale namespaces). Branches/worktrees were left in place for review; nothing was pushed.

| Lane | Tip SHA | Packages | Own commits | Merged as | Verification |
| --- | --- | --- | --- | --- | --- |
| `wt/p2-060708-small` | `faeb80f` | P2-06 Vault ×2, P2-07 PriceLists ×3, P2-08 Services ×2 | 7 | `f4ef544` | clean merge · scoped lane checks green · +3 `priceLists` keys |
| `wt/p2-0910-people` | `8d30fb9` | P2-09 Employees ×3, P2-10 Clocking ×3 | 6 | `2546d40` | clean merge · commit 3 amended and Clocking commits rebased lane-locally (content unchanged, never pushed) · `duplicateActive` key both locales |
| `wt/p2-05-insurance` | `d213141` | P2-05 Insurance ×5 | 5 | `7394b72` | clean merge · new `modals/FieldControls.tsx` adapter · +2 `insurance` keys |
| `wt/p2-1112-appshell` | `b94fd9f` | P2-11 Dashboard ×4, P2-12 Reports ×3 | 7 | `461be97` | clean merge · lazy chart/dashboard split · typed-search-applies-on-Generate is a deliberate behaviour change · +2 `reports` keys |
| `wt/p2-0304-pharmacy` | `1defa6c` | P2-03 Drugs ×4, P2-04 Supplies ×5 | 9 | `54df7fc` | clean merge · supply 5 missing keys closed in both locales (−10 MISSING) |
| `wt/p2-1316-small` | `76af3fa` | P2-13 Login ×2, P2-14 Admin Roles ×1, P2-15 NotFound ×1, P2-16 dev demo ×1 | 5 | `c7059fb` | clean merge · spec battery 4 files / 29 tests green lane-locally · +2 `errors` keys |

**Merged-tree verification (post-merge, all six):** `npx tsc -p src/renderer/tsconfig.json --noEmit` exit 0 · `npm run test:renderer` 15 files / 135 tests passed (no temp specs present) · `npm run check-i18n` exit 0 — MISSING **14** (en 6 / ar 8; down from pre-merge 24 and baseline 26, exactly the 10 supply entries pharmacy closed; all 14 remaining keys are pre-existing at `e4aa33b`, none introduced by a lane), UNUSED 1161, used keys 1723 · `npm run lint` = `✖ 534 problems (495 errors, 39 warnings)` — **byte-identical to baseline, zero delta**.

**Risk note (wizard schema drift):** the composed namespaced `wizardFormSchema` lives in `CreatePatientWizardDialog.tsx` and mirrors rules from `schemas/patient.schema.ts`; that schema file was out of the P2-01 lane's allowed scope, so a future edit to `patient.schema.ts` (gender enum, insurance trio, admission requirements) can silently diverge from the dialog's copy. Reviewers must update both together, or lift the composed schema into `patient.schema.ts` in a follow-up.

**Price-lists disposition (final, 2026-11-16):** the user reviewed the removal-vs-reject options for a priced shipment row and kept the landed inline rejection (`c3866ce` drugs / `53b7c60` supplies, branch tip `5fef7cc`); removal and fallback-to-default pricing were **not** pursued. Known limitation, recorded precisely: sales resolve the **exact** `pricelist_id` only — the server dispense join is `pl.pricelist_id = $2` (`src/app/models/Patient.model.ts` dispense paths) and the client sell/dispense paths resolve the exact `pricelistId` to `0` when absent (`src/renderer/src/pages/Drugs/modals/SellDrugModal.tsx`: `sp ? Number(sp.price) : 0`); there is **no fallback** to default-pricelist pricing. Consequently, if a price row for a list is removed through another path (e.g. the bulk price-lists endpoint), sales against that list price at 0.

### Backlog-sweep wave ledger (`fix/backlog-sweep`, 2026-11-17)

Hashes verified against `git log` at closeout. Branch started from `main` @ `75a5c9c`: lint `✖ 472 problems (439 errors, 33 warnings)`, check-i18n used 1726 / MISSING 14 / UNUSED 1159, renderer suite 15 files / 135 tests.

**Batch A — backlog items 2,3,4,5,6,15,16**

- `966a5d8` `fix(patient-detail): reject empty settlement draft instead of writing zero` — single validation point; a blank draft no longer writes `paidAmount 0`.
- `849ee6b` `fix(drugs): guard formatted shipment dates against invalid input` — NaN guard → em dash in `ShipmentRow` + `WarehouseInventoryDialog`.
- `134abe9` `fix(supplies): guard formatted shipment dates against invalid input` — same guard in `SupplyShipmentRow`.
- `fb6702e` `fix(drugs): decouple detail loading from list loading` — separate `detailsLoading`; paging no longer blanks populated rows.
- `b27b153` `fix(drugs): restore the live over-quantity warning in sell modal` — inline warning restored while typing.
- `844e4ec` `fix(supplies): surface stock-fetch failures and stop superseded runs` — per-warehouse `catch → []` removed (visible load error) + `runIdRef` guard in `.catch`.
- `5a67649` `fix(employees): reuse the shared per-patient pay formatter` — deleted the divergent local copy.
- `b494629` `fix(supplies): give the add-supply quantity field a meaningful label` — "Quantity" instead of "Quantity (—)".

**Batch B — backlog item 11 (network-copy localization)**

- `f45c1f6` `fix(patients): localize network error copy in panels and dialogs` — `isNetworkError` ternary; two duplicate page toasts removed.
- `eae2a33` `fix(patients): localize network error copy in mutation hooks` — seven hooks, state plumbing untouched.
- `1311ac3` / `584f109` / `472e947` / `0dff9d4` / `029ea5e` / `74ca722` / `d83b716` / `13f088e` — same ternary per package (drugs, supplies, employees, clocking, vault, price-lists (`statusCode 400` discriminant replacing the English match), insurance, services).
- `fde0332` `fix(dashboard): surface non-admin statistics load failures` — UserDashboard consumes the role-aware hook and renders the error slot.

**Corrections (post-adjudication)**

- `8b0e980` `fix(employees): render per-patient pay percent at full precision` — Intl percent, 2-decimal cap, Arabic digits.
- `db4eb28` `refactor(ui): extract shared safe date formatting util` — `formatDateSafe` + 4 migrated sites + 6-case spec.

**Batch C — backlog item 19 (identity + clocking)**

- `485982f` `perf(reports): stabilize DataTable prop identities` — memoized columns/callbacks/pagination/footers across 5 tabs + 2 patient tables; zero behaviour change.
- `9948297` `refactor(clocking): remove dead per-render now threading` — dead sortKeys removed; in-cell anomaly snapshot; day-stable `today`.

**Batch D — backlog item 21 (wizard schema drift)**

- `7d7b16b` `refactor(patients): lift wizard form schema into patient.schema` — resolver and gate share one instance; dead exports removed; 5-case spec.

**Batch E — backlog items 1-6 residuals, 16, 22**

- `f4b02d4` `fix(i18n): add missing translation keys` — MISSING 14 → 0.
- `dfcca14` `refactor(server): type query value arrays as unknown` — 27 model/query sites.
- `6be78f1` `refactor(server): narrow caught errors without explicit any` — all 57 catch sites.
- `4a0b81e` `refactor(server): type the authenticated request user` — `req.user!`; augmentation module marker.
- `2582be9` `fix(patient-detail): satisfy hook lint in admissions and supply dialogs` — 3 exhaustive-deps, 6 stale disables, 2 statement ternaries, prefer-const, unused param.
- `3bc6969` `fix(pdfmake): type the virtual file system global` — `Record<string, string>`.

**Closeout**

- `f625cf4` `chore(lint): ignore build output in eslint config` — `dist-electron` added to global ignores; −65 problems from build artifacts.
- this commit `chore(plans): close backlog items 1-6, 15-16, 19, 21-22` — §9 pruning, wave residuals, this ledger.

**Closing gates (final, on `fix/backlog-sweep`):** `npm run lint` **472 → 298** (`282 errors, 16 warnings`) · `npx tsc -p src/renderer/tsconfig.json --noEmit` exit 0 · `npx tsc -p src/app/tsconfig.json --noEmit` exit 0 · `npm run test:renderer` **17 files / 146 tests** passed · `npm run check-i18n` exit 0, used 1726 / **MISSING 0** / UNUSED 1159. Nothing pushed.

**Backlog-numbering correction (this commit):** §9's removal list in `9e3ead4` applied the prioritized-backlog numbering to the plan's original-audit numbering, deleting eight unfixed rows (1-6, 19, 21) and leaving six fixed rows (9, 11, 14, 17, 20, 25) plus one moot row (10) behind. This commit restores the former and removes the latter by content; no other ledger row is rewritten.

## 12. Risks and rollback considerations

| Risk | Mitigation |
| --- | --- |
| S02 changes network-failure semantics for 63 `instanceof ApiError` sites | `NetworkError` carries `statusCode = 0` + `code = "NETWORK_ERROR"`; no call-site edits in Phase 1; pages that print `err.message` switch to localized copy inside their own package. |
| S03/S05/S12/S14/S15 modify primitives used by every page | Each is a separate commit with its own verification; if a regression appears, revert **that** commit only (primitives are independently revertible). |
| S13 removes a rethrow that callers relied on for error propagation | Dialog stays open on failure (unchanged UX); callers keep their own toasts; the mechanical `toast + throw` → `toast + return` sweep happens in **Employees (P2-09)**. Admin Users has no blocking package, so its duplicate `toast + rethrow` chain stays in Backlog and must not be pulled into an unrelated commit. |
| `CardTitle` heading opt-in risks heading-level churn | Default stays `<div>`; heading adoption is per-page and reviewed in that page's commit. |
| `formatNumber` → `Intl` changes digits/locale grouping visibly | Defaults preserve current output; only pages that opt into `ar-EG` change, called out in their commits. |
| Wizard resolver adoption rejects data users previously entered (e.g. phone format) | Step schemas are the source of truth in `schemas/patient.schema.ts`; validate each step manually with realistic inputs before committing; do not weaken the schema silently — if a rule is genuinely wrong, report it. |
| Pagination adoption on Drugs/Supplies changes request volume | Server accepts the smaller page windows; verify no endpoint requires the 100-row fetch; no endpoint changes. |
| Insurance grouping by `patientId` may surface rows with missing ids | Fallback composite key documented in the commit; totals summed, not `max`; manual same-name test. |
| Reports accordion cap hides data users expect | Default-collapsed + explicit "show more", same data set; ownership of the range remains unchanged. |
| Manual-only defects (RTL, Windows dark select, Electron) escape CI | Windows dark-mode check for S07; RTL visual check per package; `test-verifier` runs the package scenarios. |
| Pre-existing dirty tree (90 entries: `.opencode/skills/...` deletions, deleted `skills-lock.json`, modified `src/renderer/vitest.config.ts`, untracked `.agents/skills/*`) pollutes commits | Never stage or revert unrelated paths; verify `git show --stat` per commit; baseline measured on the working tree as-is. |
