# Clocking Page — UI/UX Research Report (Phase 6.8)

> Delivered by the ui-designer research agent (2026-09-17). Adopted into
> `phase_6.8_plan.md` §1.3. This file is the authoritative UX spec for the
> Clocking page implementation. Design constraints honored: design.md §4.1
> (status triad + icon/text pairing), §4.2 (tabular-nums), §6.1–6.7, §8 (a11y),
> §9 (responsive), §10 (motion). Token reality check: `--color-success/
> success-dark/warning/warning-light/danger` exist in `index.css` `@theme`; the
> `.dark` block is currently commented out (light-only runtime) — badge specs
> below are light-surface-safe and degrade predictably if dark ships later.

## A) Page layout wireframe

### lg (1024–1279px, sidebar collapsed to icon rail) and xl+ (full sidebar)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar (h-12, sticky — breadcrumbs "Clocking")                           │
├──────────────────────────────────────────────────────────────────────────┤
│ PageHeader  eyebrow="Staff" (sidebar.employees group label)              │
│             h1 "Clocking"  ·  subtitle "Manage clocking records"         │
│                                          [ + New Clock-In ]  ← primary   │
├──────────────────────────────────────────────────────────────────────────┤
│ KPI strip — grid grid-cols-1 sm:grid-cols-3 gap-4        (see §B2)       │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐               │
│ │ ON SHIFT NOW │ │ MISSING      │ │ SHIFTS OVER 12H      │               │
│ │ 14           │ │ CLOCK-OUT  2 │ │ 1                    │               │
│ │ hint / reset │ │ (warning, ●) │ │ (danger, read-only)  │               │
│ └──────────────┘ └──────────────┘ └──────────────────────┘               │
├──────────────────────────────────────────────────────────────────────────┤
│ [ Active Clock-Ins (2●) ]  [ History ]     ← Tabs, count badge on Active │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Active table card (DataTable, no search)                             │ │
│ │ toolbar:  [chip: ⚠ Missing clock-out only]  ← only when count > 0    │ │
│ │ ┌──────────┬──────────────┬────────────────────┬──────────────────┐  │ │
│ │ │ Employee │ Clock-In     │ Duration           │         Actions  │  │ │
│ │ │ ◉ name   │ 9/16/26,     │ ● 9h 12m           │  ⎋   ✎   🗑      │  │ │
│ │ │   role   │ 9:03 PM      │ [⚠ Extended shift] │ clockOut edit del│  │ │
│ │ └──────────┴──────────────┴────────────────────┴──────────────────┘  │ │
│ │  h-12 rows · sticky header · no pagination · default sort clockIn ↑  │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

History tab is identical anatomy with the toolbar becoming `HistoryFilters`
(search + Popover→Calendar range + Clear) and columns Employee | Clock-In |
Clock-Out | Duration | Pay Deduction | Actions (edit, delete only), pagination
bottom-right (§6.2).

### md (768–1023px — sidebar is a drawer per §9)

Same vertical stack, single column; KPI cards go 3-up from `sm` (each ≈200px
wide — verified against SuppliesKpiStrip's `sm:grid-cols-2 xl:grid-cols-5`
rhythm; 3-up at md is comfortable). Table card enters `overflow-x-auto`
(DataTable's built-in `role="region"` scroller, line 262) — Employee and
Duration columns get `width` hints so identity + the live cell never truncate;
Pay Deduction and Clock-Out scroll.

**Explicit non-goals:** no per-tab deep-linking beyond plan scope, no
row-expansion panels (DataTable supports them, but the modal is the detail
surface here — adding expansion would duplicate it).

## B) Component-level specs

### B1. Page shell — `ClockingPage.tsx`

`useEnsureNamespace("clocking")` → `PageHeader` (exact current props:
`title={t("clocking.title")}` `subtitle={t("clocking.subtitle")}`
`eyebrow={t("sidebar.employees")}` `actions={<Button><PlusIcon aria-hidden
className="me-2 size-4"/> {t("clocking.buttons.newClockIn")}</Button>}`) →
`ClockingKpiStrip` → `Tabs className="flex flex-col gap-4"` (EmployeesPage's
flex-col override, documented at line 327, **must be copied** — the shared Tabs
primitive's horizontal variants are dead classes).

Tab trigger with count badge (no precedent exists in-repo; this establishes it):

```tsx
<TabsTrigger value="active">
  {t("clocking.tabs.active")}
  {activeCount > 0 && (
    <Badge variant="destructive" className="ms-1.5 tabular-nums">{activeCount}</Badge>
  )}
</TabsTrigger>
```

`variant="destructive"` (soft `bg-destructive/10 text-destructive`) — attention
without alarm; **not** solid default (that's reserved for primary actions per
§6.5). Suppress the badge when 0 so the tab doesn't nag.

### B2. KPI strip — 3-card strip (reverses plan A20)

Why: (1) the highest-value signal — a missing clock-out from a prior day — is
invisible today, indistinguishable from a live shift; (2) zero backend cost
(all three metrics derive from the single GET payload); (3) `EditorialKpiCard`
strips with click-to-filter are established on Pharmacy/Supplies/Usage
(`SuppliesKpiStrip.tsx` — tone switches when >0, `active` when its filter is
on, click toggles); (4) legacy parity is not a ceiling. "Total hours today" is
explicitly rejected (overnight-span ambiguity; a number without a decision) —
deferred to §D.

**Spec — `components/ClockingKpiStrip.tsx`** (modeled 1:1 on `SuppliesKpiStrip`):

| Card | Value | Tone | Clickable | Hint logic |
|---|---|---|---|---|
| On shift now | `active.length` | `neutral` | Yes → resets the Active filter (Supplies "all" pattern) | calm/active pair |
| Missing clock-out | count of open rows with `startOfDay(clockIn) < startOfDay(now)` | `warning` when >0 else `neutral` | Yes → Active tab + `missingOnly` filter | `missingClockOutHintActive` / `…Calm` |
| Shifts over 12h | count of open rows with live duration ≥ 12h (re-derived per minute via the shared tick) | **`danger` — additive tone** | **No** — filtering to a live-decaying set is confusing; read-only | `over12hHint` / `…Calm` |

Grid: `grid grid-cols-1 gap-4 sm:grid-cols-3`. Values pre-formatted strings
(EditorialKpiCard contract), `tabular-nums` built in.

**Additive shared-component change (the only one):** extend
`EditorialKpiCard`'s tone maps with a `danger` entry, mirroring `warning`
exactly — `TONE_RAIL: "before:bg-danger group-hover:before:bg-danger"`,
`TONE_RULE: "bg-danger/30 group-hover:bg-danger"`, `TONE_VALUE:
"text-foreground"` (28px light-weight numeral = large text, 3.9:1 passes
AA-large per §4.1.4's white-on-danger row). Common-layer component, not a
`ui/` primitive (§11.3.1 untouched); additive/three-line.

**Flag while in this file:** `EditorialKpiCard` root uses physical `text-left`
(line 80) — latent RTL bug; one-class fix `text-left` → `text-start` (§11.3.4).

### B3. Missing clock-out surfacing — three reinforcing layers, one derivation

Derivation (pure, client-side, from existing payload) — `components/anomaly.ts`:

```ts
const DAY = 86_400_000
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x }
export type Anomaly =
  | { level: "warning" | "danger"; kind: "missingClockOut"; daysOpen: number }
  | { level: "warning"; kind: "extendedShift" }        // live duration ≥ 8h, < 12h
  | { level: "danger";  kind: "fatigueRisk" }          // live duration ≥ 12h
  | { level: "warning"; kind: "futureClockIn" }        // clockIn > now
  | { level: "danger";  kind: "negativeDuration" }     // clockOut && duration < 0
  | { level: "warning"; kind: "duplicateActive" }      // another open row, same employeeId
```

1. **KPI card** (count + click-to-filter) — discovery layer.
2. **Filter chip in the Active table toolbar** — action layer. `ClockingPage`
   holds `missingOnly: boolean`; render inside DataTable's `toolbar` slot:

```tsx
{missingCount > 0 && (
  <Button variant={missingOnly ? "default" : "outline"} size="sm"
          onClick={() => setMissingOnly(v => !v)}
          aria-pressed={missingOnly}>
    <CalendarXIcon aria-hidden className="me-2 size-4" />
    {t("clocking.filters.missingOnly")}
    <Badge variant="secondary" className="ms-1.5 tabular-nums">{missingCount}</Badge>
  </Button>
)}
```

(§6.5 outline = filter chips; `aria-pressed` per §8; matches
`SuppliesKpiStrip`'s toggle pattern.)

3. **Row badge** — the anomaly travels with the row. Escalation: `warning` at
   >24h open, `danger` at ≥72h (three full payroll days).

### B4. Status badge system — exact combos (icon + text, never color alone)

Thresholds: **≥8h → warning "Extended shift"** (Egypt Labor Law 12/2003 norms
the 8h workday; crossing = overtime/second shift — noticeable, routine,
recoverable). **≥12h → danger "Fatigue risk"** (ceiling of planned 12h nursing
shifts; EU WTD 2003/88/EC 11h daily rest already violated for the next day;
Joint Commission Sentinel Event Alert #50 links extended shifts to error
rates). A *watch* signal (badge), not blocking — the correction is one confirm
away.

All badges follow the established in-repo pattern (`DrugsTable`/`SuppliesTable`
low-stock badge): `variant="outline"`, tinted border/bg via alpha, **icon
carries the color, label text stays `text-foreground`**. AA-correct:
`text-warning` (#F59E0B ≈2.2:1) and `text-success` (≈2.5:1) fail 4.5:1 for
12px text. Never set badge label text to `text-warning`/`text-success`/
`text-destructive`.

| State | Trigger | Component (exact) |
|---|---|---|
| Extended shift | live ≥8h <12h | `<Badge variant="outline" className="gap-1 border-warning/40 bg-warning/5"><ClockIcon aria-hidden className="size-3 text-warning" />{t("clocking.status.extendedShift")}</Badge>` |
| Fatigue risk | live ≥12h | `<Badge variant="destructive" className="gap-1 text-foreground"><AlertTriangleIcon aria-hidden className="size-3 text-destructive" />{t("clocking.status.fatigueRisk")}</Badge>` |
| Missing clock-out | open & clockIn < today (>24h) | outline warning + `<CalendarXIcon className="size-3 text-warning" />` |
| Missing clock-out (≥72h) | same, escalated | same structure, `variant="destructive"` + `text-foreground`, icon `text-destructive` |
| Future clock-in | `clockIn > now` | outline warning + `<CalendarClockIcon className="size-3 text-warning" />` |
| Negative duration | computed duration < 0 | destructive + `text-foreground`, icon `text-destructive` |
| Duplicate active | 2nd open row for employeeId | outline warning + `<CopyIcon className="size-3 text-warning" />` |

Normal rows get no badge. Dark mode (if `.dark` ships): add
`dark:border-warning/50 dark:bg-warning/10` / `dark:bg-destructive/20`.

Anomaly badge placement: Duration cell becomes
`flex flex-col items-start gap-1` only when an anomaly exists (`duration`
first, badge under) — one-line rows stay h-12, two-line only on exceptions.

### B5. Live duration — `LiveDuration.tsx`

```tsx
<span className="inline-flex items-center gap-1.5 tabular-nums" aria-label={formatted}>
  <span aria-hidden className="size-1.5 rounded-full bg-success-dark animate-pulse" />
  <span>{formatted}</span>
</span>
```

- Pulsing dot (opacity-only `animate-pulse` → §10-compliant). Reduced motion:
  global neutralizer freezes it to a static green dot — zero extra code.
- Dot color `bg-success-dark` (#047857, ≈5:1), not `bg-success` (2.5:1, fails
  the 3:1 UI-object bar).
- `tabular-nums` mandatory. **`aria-live`: none** — a ticking live region is an
  SR denial-of-service; events announce via Sonner. Dot `aria-hidden`.
- Keep the single `useNowTick(1000)`; the pulse carries "alive" perception
  between minute changes.

### B6. Tables

**Column order — Active** (who → when → how long → act):

| Column | ColumnDef | Notes |
|---|---|---|
| Employee | `cell` → `EmployeeCell` | see B7 |
| Clock-In | `sortable`, `className="tabular-nums"` | `formatDateTime(new Date(row.clockIn), resolveLocale(lang))` |
| Duration | `LiveDuration` + anomaly badge | width hint `min-w-40` |
| Actions | `align: "end"`, `className: "w-28"` | 3 icon buttons — Clock Out (`LogOutIcon`), Edit (`PencilIcon`), Delete (`Trash2Icon` + `text-destructive hover:text-destructive`) — ServicesTable action block (lines 201–229): `variant="ghost" size="icon-sm"`, `e.stopPropagation()`, `aria-label`. No overflow menu (3 = §6.2 ceiling). |

**Active sort:** default **`clockIn` ascending** (longest-on-shift /
forgotten-overnight rows lead); clockIn + duration sortable (`aria-sort`
automatic). History: default `clockIn` desc; sortable employee, clockIn,
clockOut, duration, payDeduction; Actions `w-20`.

**Pay deduction — always shown, deliberately low-emphasis:** `numeric: true`,
`formatCurrency(value, resolveLocale(lang))`, wrapped `text-muted-foreground`
(#475569 — 7.5:1), `0 → "—"`. Never color/badge/hover-gate it — supervisors
auditing payroll need it in the periphery; quiet typography, not occlusion.

**Empty states:** pass explicit `emptyTitle` **and** `emptyDescription`
(DataTable fallback leaks `patients.emptyTableSearchDesc`). Load-error state:
`emptyTitle = messages.loadClockInsError`, `emptyAction = <Button
onClick={refresh}>{t("clocking.messages.retry")}</Button>` (Services pattern).

### B7. Employee identity — `EmployeeCell.tsx` (both tables)

```tsx
<div className="flex items-center gap-2.5">
  <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full
        bg-primary-light text-xs font-semibold text-primary select-none">
    {getInitials(name)}
  </span>
  <span className="flex min-w-0 flex-col">
    <span className="truncate font-medium">{name}</span>
    <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
  </span>
</div>
```

- `getInitials` exists in `lib/utils` (Arabic-aware, "?" fallback). Static
  initials disc on `bg-primary-light`/`text-primary` (4.6:1). No `Avatar`
  (image-oriented; no photos in this module).
- Role as muted caption, not badge: `role.doctor` طبيب / `role.nurse` ممرض /
  `role.staff` موظف.
- Missing employee → initials disc hidden, name `—`, role empty.

### B8. `ClockInModal` — correction & audit UX

- `Dialog` `sm:max-w-md`; RHF + zod as planned.
- **Correction framing (edit mode):** `DialogDescription` =
  `modals.editClockInDescription` ("Changes to this record affect the
  employee's shift duration and pay.") + muted identity line `help.editingRecord`
  ("Record #{{clockId}}").
- **Field grouping (§6.3):** Employee (Select) · Shift times (clock-in,
  clock-out) · Payroll (deduction). `gap-6` between groups, `gap-4` within.
  Labels top-aligned, red `*` on required; Clock-Out "(optional)" via existing
  `help.optionalClockOut`.
- **Time clarity:** `help.recordedLocalTime` ("Times are recorded in the
  hospital's local time.") as one muted line under the times group. Do **not**
  surface seconds precision (A15 strips seconds; showing "21:03:47" next to an
  editable "21:03" invites mismatch tickets).
- **Employee duplicate caution (non-blocking):** on employee change in create
  mode, if that employee has an open record, render warning line under the
  Select (not FormMessage — must not block): `validation.alreadyClockedIn`,
  styled like Login's warning strip (`border-warning/40 bg-warning-light/40
  text-sm` + `AlertTriangleIcon size-4`). Surface, don't police.
- **Create mode (D2a):** deduction hidden + `help.autoDeduction` note.
- **Submit:** loading label `buttons.saving`; idle label `buttons.save`
  ("Save"/"حفظ") — reuse `common` save if present else add scoped. Loading:
  `Loader2 animate-spin` + disabled; on zod failure `form.setFocus(firstInvalid)`.
- **Quick clock-out confirm:** `variant="warning"`, `destructiveIcon={false}`
  (EmployeesPage markPaid pattern). Amend `clockOutConfirmText`: "This will
  clock out the employee with the current time and finalize the duration for
  payroll."
- **Delete confirm:** `variant="danger"` + `destructiveIcon`. Two descriptions
  by row state — completed: "This permanently removes the shift record,
  including its duration and pay deduction. This action cannot be undone." /
  active: "This employee is currently clocked in. Deleting removes the open
  record entirely. This action cannot be undone." Confirm label
  `clocking.buttons.confirmDelete` ("Delete record"/"حذف السجل").
- Both dialogs AlertDialog-based, no outside dismiss; Radix focuses Cancel by
  default (Enter ≈ safe path).

### B9. a11y & RTL checklist

- Contrast pairs: badge labels `text-foreground` on ≤5% tints (≥15:1); icons
  ≥3:1 (warning icon on `warning/5` ≈2.2:1 acceptable only as redundant
  decoration paired with text — the codebase's established pattern); live dot
  `success-dark` ≈5:1. Dark mode: add `dark:*` classes from B4.
- Targets: row icon buttons `size="icon-sm"` (32px floor); page buttons `h-10`.
  Actions always visible (not hover-revealed).
- Live regions: none on cells; toasts carry events; DataTable supplies
  `aria-busy` + sr-only "Loading".
- Table semantics: pass sr-only `caption` per table (`table.activeCaption` /
  `table.historyCaption`).
- RTL: logical utilities only; Actions `align: "end"` mirrors via DataTable's
  `text-end`. Duration strings render correctly under bidi with Latin digits +
  `tabular-nums`; no `dir` overrides. Calendar popover: copy `PatientFilters`
  verbatim (Popover + `Calendar mode="range"` + `align="end"`). `LogOut` icon
  unmirrored (direction-neutral metaphor).

## C) Concrete plan changes

### C1. A-decision amendments

| # | Change |
|---|---|
| **A20 — AMEND** | Replace "No KPI strip" with the 3-card `ClockingKpiStrip` (§B2). "Total hours today" explicitly rejected. |
| **A2 — AMEND (minor)** | Active tab gains conditional `missingOnly` toggle chip when `missingCount > 0`. |
| **A9 — AMEND (minor)** | Active default sort `clockIn` asc; clockIn + duration sortable. History default `clockIn` desc unchanged. |
| **A11 — AMEND (minor)** | Modal adds edit-mode `DialogDescription`, `help.editingRecord`, `help.recordedLocalTime`, non-blocking duplicate-open warning. Keep `sm:max-w-md`, RHF+zod, D2a hidden deduction. |
| **A13 — AMEND (copy)** | `clockOutConfirmText` gains "…and finalize the duration for payroll." |
| **A17 — AMEND (copy)** | Delete confirm = payroll-consequence copy; conditional active-row text; scoped `confirmLabel` "Delete record". |
| **A18 — AMEND (pairs with D1a)** | D1a endpoint returns **all** employees (`need_clock_in` as a returned field, no WHERE filter); picker filters to `needClockIn === true` client-side; name map built from the full list. Without this, records for `needClockIn=false` employees render `—` permanently. |
| A1, A6, A7, A12, A14, A15, A16, D3a | Confirmed as planned (A7 negative-duration rendering stays, paired with the `negativeDuration` badge). |

### C2. §2 file-tree additions

```text
components/
├── ClockingKpiStrip.tsx        # NEW — 3 EditorialKpiCards (§B2)
├── EmployeeCell.tsx            # NEW — initials disc + name + role caption (§B7)
├── anomaly.ts                  # NEW — pure Anomaly derivation (§B3)
├── ClockingTabs.tsx            # (planned) + count-badge trigger markup (§B1)
├── ActiveClockInsTable.tsx     # (planned) + toolbar chip + anomaly badges + sort
├── HistoryTable.tsx            # (planned) + explicit emptyDescription + muted deduction cell
├── HistoryFilters.tsx          # (planned) — PatientFilters calendar-range copy verbatim
└── LiveDuration.tsx            # (planned) + pulse-dot markup (§B5)
```

Shared-infra touch: `EditorialKpiCard` gains `"danger"` tone (3 map entries) +
`text-left`→`text-start` fix; `components/common/` unchanged otherwise.
Backend: only the endpoint's SELECT widens per A18 amendment.

### C3. New translation keys (`clocking.*` — EN / AR)

| Key | EN | AR |
|---|---|---|
| `clocking.kpi.onShift` | On shift now | في العمل حالياً |
| `clocking.kpi.onShiftHint` | Employees currently clocked in | الموظفون المسجل حضورهم حالياً |
| `clocking.kpi.missingClockOut` | Missing clock-out | بدون تسجيل انصراف |
| `clocking.kpi.missingClockOutHintActive` | Open shifts carried over from previous days | ورديات مفتوحة من أيام سابقة |
| `clocking.kpi.missingClockOutHintCalm` | All shifts closed properly | جميع الورديات مغلقة بشكل صحيح |
| `clocking.kpi.over12h` | Shifts over 12h | ورديات تتجاوز 12 ساعة |
| `clocking.kpi.over12hHint` | Fatigue risk — verify and clock out | خطر الإرهاق - يُرجى التحقق وتسجيل الانصراف |
| `clocking.kpi.over12hHintCalm` | No shifts beyond the 12h limit | لا توجد ورديات تتجاوز حد 12 ساعة |
| `clocking.filters.missingOnly` | Missing clock-out only | بدون تسجيل انصراف فقط |
| `clocking.status.extendedShift` | Extended shift | وردية ممتدة |
| `clocking.status.fatigueRisk` | Fatigue risk | خطر الإرهاق |
| `clocking.status.missingClockOut` | Missing clock-out | بدون تسجيل انصراف |
| `clocking.status.futureClockIn` | Future clock-in | حضور بتاريخ مستقبلي |
| `clocking.status.negativeDuration` | Negative duration | مدة سالبة |
| `clocking.status.duplicateEntry` | Duplicate entry | سجل مكرر |
| `clocking.role.doctor` | Doctor | طبيب |
| `clocking.role.nurse` | Nurse | ممرض |
| `clocking.role.staff` | Staff | موظف |
| `clocking.table.activeCaption` | Live list of employees currently clocked in | قائمة حية للموظفين المسجل حضورهم حالياً |
| `clocking.table.historyCaption` | Completed clock-in records with corrections and pay deductions | سجلات الحضور المنتهية مع التعديلات وخصومات الأجر |
| `clocking.help.recordedLocalTime` | Times are recorded in the hospital's local time. | يتم تسجيل الأوقات بتوقيت المستشفى المحلي. |
| `clocking.help.editingRecord` | Record #{{clockId}} | سجل رقم {{clockId}} |
| `clocking.modals.editClockInDescription` | Changes to this record affect the employee's shift duration and pay. | التغييرات على هذا السجل تؤثر على مدة الوردية وأجر الموظف. |
| `clocking.validation.alreadyClockedIn` | This employee already has an open clock-in record. | يوجد بالفعل سجل حضور مفتوح لهذا الموظف. |
| `clocking.buttons.confirmDelete` | Delete record | حذف السجل |
| `clocking.messages.deleteConfirmText` *(amend)* | This permanently removes the shift record, including its duration and pay deduction. This action cannot be undone. | سيتم حذف سجل الوردية نهائياً، بما في ذلك المدة وخصم الأجر. لا يمكن التراجع عن هذا الإجراء. |
| `clocking.messages.deleteActiveConfirmText` *(new)* | This employee is currently clocked in. Deleting removes the open record entirely. This action cannot be undone. | هذا الموظف مسجل حضوره حالياً. الحذف سيزيل السجل المفتوح بالكامل. لا يمكن التراجع عن هذا الإجراء. |
| `clocking.messages.clockOutConfirmText` *(amend)* | This will clock out the employee with the current time and finalize the duration for payroll. | سيتم تسجيل خروج الموظف بالوقت الحالي وتثبيت المدة في نظام الأجور. |
| `clocking.buttons.save` *(only if absent from `common`)* | Save | حفظ |

Plus §3.6 additions (`filters.fromDate/toDate`, `messages.retry`,
`help.autoDeduction`). Verified reusable from `common` (grep-verified in both
locales): `common.edit`, `common.delete`, `common.cancel`, `common.confirm`,
`common.refresh`, `common.currency`, `common.loading`, `common.noData`,
`common.expand/collapse`, `common.active/inactive`.

## D) [future] — deliberately deferred (needs backend beyond approved companions)

1. **Bulk clock-out for shift handover** — N sequential confirms is the friction point at 22:00 handover; needs multi-select rows + a bulk PUT strategy.
2. **Weekly/period hours vs statutory caps** — overlap-aware aggregation; unreliable as pure client math across overnight spans at scale.
3. **Shift-template lateness ("Late vs scheduled")** — the server's deduction math owns the semantics; a client-side "Late" badge could disagree with the computed deduction and mislead payroll.
4. **Audit trail ("last edited by, when")** — needs new DB columns + endpoint; the modal shows current values (`help.editingRecord` id anchoring instead).
5. **Payroll-period export** — needs backend aggregation/PDF.
6. **Server guards from D4b** — duplicate-active and `clock_out > clock_in` enforcement (deferred in D4; the duplicate *warning* in B8 is the client-side mitigation only).

## E) Open questions — RESOLVED by adoption (2026-09-17)

1. A20 reversal → **adopted** (3-card strip).
2. D1a endpoint width → **adopted** (all employees + client-side filtering).
3. Active sort → **adopted** (`clockIn` asc, sortable).
4. Escalation → **adopted** (warning >24h, danger ≥72h).
5. Zero deduction → **adopted** (`—`).
