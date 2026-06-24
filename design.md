# HMS UI/UX Design Principles — React 19 + Vite 6 + Tailwind v4 + shadcn/ui

> **Product:** Hospital Management System (HMS) — Electron + Express + PostgreSQL desktop app  
> **Scope:** Live UI/UX design system for the React 19 + Vite 6 + Tailwind v4 + shadcn/ui frontend  
> **Companion document:** `react_implementation_plan.md` (the technical execution plan)  
> **Date:** June 2026

---

## 1. Executive Summary

This document defines the **design principles, tokens, and component standards** that govern the HMS renderer during and after its migration to React 19 + Vite 6 + Tailwind v4 + shadcn/ui. It is the visual & interaction contract for every page, dialog, table, and form in the application.

The technical execution of this design (file structure, phases, scripts) is defined in `react_implementation_plan.md`. This document answers **"what the product should look and feel like"**, while the implementation plan answers **"how to build it"**.

The redesign delivers:
- A **unified, professional healthcare design system** calibrated for the dense, data-heavy nature of clinical workflows
- **WCAG 2.1 AA accessibility** across every interface (focus rings, contrast, keyboard nav, ARIA, reduced motion)
- **Seamless bilingual (EN/AR) support** via CSS logical properties and `dir="rtl"` switching — no separate RTL stylesheets
- **Token-driven theming** via Tailwind v4 CSS-first `@theme` configuration so every color, font, and shadow is a semantically-named primitive
- **Production-ready React patterns**: Zustand stores, sonner toasts, react-hook-form + zod validation, react-i18next, Lucide icons, react-router-dom guards

---

## 2. Current State (Pre-Migration Baseline)

The renderer is currently being migrated. This captures the pre-migration baseline so design decisions remain traceable to the problems they solve.

### Pre-Migration Architecture (being replaced)
- **Renderer:** Multi-page vanilla HTML/TS (no SPA bundler) → **becoming** React 19 SPA via Vite 6
- **Styling:** Bootstrap 5 + module-specific CSS + separate `*-rtl.css` files → **becoming** Tailwind v4 `@theme` + shadcn/ui
- **Layout:** Shared sidebar + top navbar across authenticated pages → **preserved** as React `<AppShell>` with `<Sidebar>` + `<TopBar>`
- **Components:** Ad-hoc Bootstrap overrides → **becoming** shadcn/ui primitives in `src/renderer/src/components/ui/`
- **State:** Vanilla JS/TS direct DOM manipulation → **becoming** Zustand stores (`authStore`, `uiStore`)
- **Forms:** jQuery-style direct binding → **becoming** `react-hook-form` + `zod` schemas
- **Toasts:** `toastr` and `sweetalert2` → **becoming** `sonner` + shadcn `<AlertDialog>`
- **i18n:** Custom `i18n` class → **becoming** `react-i18next` (keys migrated verbatim)

### Pain Points Being Resolved

| # | Pain Point | Impact | Resolution |
|---|-----------|--------|------------|
| 1 | **Visual inconsistency** across modules | Looks dated, hard to maintain | Single token-driven design system; shadcn primitives enforce consistency |
| 2 | **Bootstrap 5 defaults** feel generic | Not befitting a modern healthcare product | Custom Tailwind v4 theme + shadcn |
| 3 | **Manual RTL maintenance** via `*-rtl.css` | Drift between LTR/RTL, double work | CSS logical properties (`ms-*`, `me-*`) + `[dir="rtl"]` overrides |
| 4 | **Accessibility gaps** — no systematic ARIA | Excludes users, compliance risk | Radix-based shadcn primitives are ARIA-correct by default |
| 5 | **Information density** — dense tables with poor hierarchy | Slows scanning work | DataTable component with sort, sticky header, virtualization-ready |
| 6 | **No reusable component system** | Repeated code, inconsistent UX | `components/ui/` (shadcn) + `components/common/` (DataTable, PageHeader, ConfirmDialog, EmptyState) |
| 7 | **Performance** — large CSS, unoptimized assets | Slower load times | Vite tree-shaking, route-level code-splitting (`React.lazy`), reports split per type |

---

## 3. Design Objectives

1. **Modernize visual identity:** Clean, calming, data-dense healthcare aesthetic appropriate for long shifts at a screen
2. **Unify the experience:** Every visual element stems from the same Tailwind v4 token map and the same shadcn primitives
3. **Improve accessibility:** Meet **WCAG 2.1 AA** — contrast ratios, keyboard navigation, focus management, ARIA, reduced motion
4. **Optimize task efficiency:** Multi-step wizards (patient registration), split-pane dialogs (billing), inline validation (forms)
5. **Enhance data presentation:** Chart.js wrappers tied to design tokens, sortable/scrollable DataTable with sticky header, skeleton loading states
6. **Honor RTL as a first-class citizen:** `dir="rtl"` on `<html>`, CSS logical properties, `Noto Sans Arabic` font swap, mirrored shadcn `Sheet`/`DropdownMenu` positions
7. **Stay aligned with the implementation plan:** All tokens, components, and patterns defined here are the source of truth for the implementation plan's CSS and component specs (e.g., `src/renderer/src/index.css` `@theme` block)

---

## 4. Design System

### 4.1 Color Palette — Healthcare Professional

A palette purpose-built for hospital software: **trust** (deep ocean blue), **care** (teal), **healing** (emerald), and **warmth** (sky tinted background). Low saturation reduces eye strain during long clinical shifts; semantic coloring restricts color to meaning — never decoration.

**Implementation:** Tokens are declared in Tailwind v4 `@theme` inside `src/renderer/src/index.css` (see `react_implementation_plan.md` § Phase 1). shadcn's CSS custom properties (`:root { --primary: 201 100% 36%; ... }`) are derived from the same hex values below.

#### 4.1.1 Primitive palette (source of truth)

| Token | Hex | HSL (for shadcn) | Tier | Purpose |
|-------|-----|------------------|------|---------|
| `primary` | `#0077B6` | `201 100% 36%` | Brand | Primary actions, active nav, links, focus rings |
| `primary-light` | `#DBEAFE` | `210 100% 92%` | Brand tint | Hover backgrounds, selected row tint, page subtle wash |
| `primary-dark` | `#005A8C` | `202 100% 34%` | Brand shade | Active/pressed buttons, emphasized links |
| `secondary` | `#00A896` | `172 100% 33%` | Brand | Secondary actions, "balance" semantics, neutral accents |
| `secondary-light` | `#CCFBF1` | `166 100% 87%` | Brand tint | Light backgrounds for secondary zones |
| `accent` | `#059669` | `160 84% 30%` | Brand | Inline emphasis (price highlights, KPI deltas) — distinct from `success` |
| `success` | `#10B981` | `160 74% 45%` | Status | Successful saves, positive indicators, "completed" badges |
| `success-light` | `#D1FAE5` | `149 80% 90%` | Status tint | Success state soft backgrounds, toast backgrounds |
| `warning` | `#F59E0B` | `38 92% 50%` | Status | Pending items, near-expiry drugs, low stock alerts |
| `warning-light` | `#FEF3C7` | `48 100% 88%` | Status tint | Warning state soft backgrounds |
| `danger` | `#EF4444` | `0 84% 60%` | Status | Errors, deletions, destructive confirm button, expired drugs |
| `danger-light` | `#FEE2E2` | `0 93% 94%` | Status tint | Error state soft backgrounds |
| `info` | `#0EA5E9` | `199 89% 48%` | Status | Informational banners, neutral-toasts |
| `info-light` | `#E0F2FE` | `204 100% 94%` | Status tint | Info state soft backgrounds |

#### 4.1.2 Surfaces & text (neutral layer)

| Token | Hex | Purpose |
|-------|-----|---------|
| `background` | `#F0F9FF` | App background — sky-tinted for eye comfort during long shifts |
| `surface` | `#FFFFFF` | Cards, dialogs, sheets, popovers, table backgrounds |
| `surface-muted` | `#F8FAFC` | Striped table rows, sub-surface zebra striping |
| `text-primary` | `#0F172A` | Headings, table data, primary content |
| `text-secondary` | `#475569` | Descriptions, labels, helper text |
| `text-tertiary` | `#64748B` | Captions, placeholders, metadata |
| `border` | `#E2E8F0` | Dividers, input borders, card borders |
| `border-strong` | `#CBD5E1` | Hover borders, focused-but-not-input borders |
| `disabled` | `#94A3B8` | Disabled text and icons |
| `disabled-bg` | `#F1F5F9` | Disabled input/chip backgrounds |
| `shadow-color` | `rgba(15, 23, 42, 0.08)` | Universal shadow tint for elevation |

#### 4.1.3 Semantic state mapping (recommend to developers)

| State | Background | Border | Icon/Text | shadcn primitive |
|-------|------------|--------|-----------|------------------|
| Default | `surface` | `border` | `text-primary` | `<Button variant="outline">` |
| Hover | `surface` | `border-strong` | `text-primary` | hover overlay utility |
| Focused | `surface` | `primary` (ring) | `text-primary` | shadcn focus ring (default) |
| Disabled | `disabled-bg` | `border` | `disabled` | `disabled:opacity-50` |
| Success | `success-light` | `success` | `success` | `<Alert variant="success">` |
| Warning | `warning-light` | `warning` | `warning` | `<Alert variant="warning">` |
| Danger | `danger-light` | `danger` | `danger` | `<Alert variant="destructive">` (match shadcn naming) |
| Info | `info-light` | `info` | `info` | `<Alert>` (info accent) |

#### 4.1.4 Contrast verification (WCAG 2.1 AA)

All foreground/background pairs below were verified to exceed the AA threshold (4.5:1 for body text, 3:1 for large text and UI components):

| Pair | Ratio | Result |
|------|-------|--------|
| `text-primary` (#0F172A) on `surface` (#FFFFFF) | 18.6 : 1 | AAA |
| `text-primary` on `background` (#F0F9FF) | 17.2 : 1 | AAA |
| `text-secondary` (#475569) on `surface` | 7.5 : 1 | AAA for normal, AA |
| `text-tertiary` (#64748B) on `surface` | 4.8 : 1 | AA |
| `primary` (#0077B6) on `surface` | 4.7 : 1 | AA text / 3:1 UI |
| `primary` (#0077B6) on `primary-light` (#DBEAFE) | 4.6 : 1 | AA text |
| White on `primary` (#0077B6) — primary button label | 4.7 : 1 | AA |
| White on `danger` (#EF4444) — danger button label | 4.0 : 1 | AA large text / UI |
| White on `success` (#10B981) — success button label | 2.5 : 1 | UI only — use for non-textual indicators; for text use `success-dark` (#047857) |
| `disabled` (#94A3B8) on `surface` | 3.4 : 1 | UI-component AA, not body text |

> **Rule of thumb:** Use the `*-light` tokens as backgrounds only; never pair two light variants together as foreground/background since they will not meet AA contrast.

#### 4.1.5 Palette rationale

- **`#0077B6` Deep Ocean Blue — Trust & clinical professionalism.** Avoids the over-used "medical blue" of `#2563EB` (Tailwind `blue-600`) which has high saturation and feels generic.
- **`#00A896` Teal — Balance, recovery, secondary emphasis.** Sits one perceptual step warmer than the primary so secondary actions still read affordances and don't compete with the primary CTA.
- **`#059669` Emerald — Health, growth, inline emphasis.** Reserved as an `accent` for inline highlights (price, KPI delta) — semantically different from `success` (status confirmations).
- **`#10B981` / `#F59E0B` / `#EF4444` — Status triad.** Standard accessible status palette. Used **in combination with an icon or text label** in every component (never color alone) to support color-blind users.
- **`#F0F9FF` Sky Tint — Calming app background.** A 5% blue tint to `surface` reduces eye strain versus pure white during long shifts without making the interface feel "colored".
- **`#0F172A` Deep Slate — Strong body text.** Softer than pure black; gives a premium feel while preserving the 18:1 contrast on white.

> **Design Principle:** Low-saturation tones reduce eye strain. High-contrast text ensures readability. Semantic coloring for status, not decoration. Every status uses a paired icon **and** color.

### 4.2 Typography

The shadcn variant pairs a confident, slightly tighter type scale with strong weight hierarchy. Body copy stays at the readable 0.875rem, but headings and labels are deliberately compact to maximize information density in clinical tables.

**Font stack:** `Inter` (latin) + `Noto Sans Arabic` (RTL) + `JetBrains Mono` (numerics, IDs, codes). Loaded once via `@import url(...)` in `src/renderer/src/index.css` with `font-display: swap`. The RTL locale automatically loads `Noto Sans Arabic` because `[dir="rtl"]` set in `App.tsx`'s `RTLSync` swaps the `font-family` on `<html>`.

| Role | Font | Weight | Size | Line-Height | Tracking | shadcn/Tailwind class |
|------|------|--------|------|-------------|----------|-----------------------|
| Display | Inter | 700 | `2rem` (32px) | 1.2 | -0.02em | `text-3xl font-bold tracking-tight` |
| H1 (page title) | Inter | 600 | `1.5rem` (24px) | 1.3 | -0.01em | `text-2xl font-semibold tracking-tight` |
| H2 (section title) | Inter | 600 | `1.25rem` (20px) | 1.35 | -0.01em | `text-xl font-semibold` |
| H3 (card title) | Inter | 500 | `1.125rem` (18px) | 1.4 | 0 | `text-lg font-medium` |
| H4 (sub-section) | Inter | 500 | `1rem` (16px) | 1.5 | 0 | `text-base font-medium` |
| Body | Inter | 400 | `0.875rem` (14px) | 1.6 | 0 | `text-sm` |
| Body large | Inter | 400 | `1rem` (16px) | 1.6 | 0 | `text-base` |
| Caption / meta | Inter | 500 | `0.75rem` (12px) | 1.5 | 0.02em | `text-xs font-medium uppercase tracking-wide` (for labels) |
| Monospace / numeric | JetBrains Mono | 400 | `0.875rem` (14px) | 1.5 | 0 | `font-mono` |
| Button label | Inter | 500 | `0.875rem` (14px) | 1 | 0 | `text-sm font-medium` |
| Tabular figures | Inter (`tabular-nums`) | inherited | inherited | inherited | 0 | Apply `tabular-nums` on tables, KPIs, prices |

**Type-scale rules**
- Base size: **16px (1rem)** on `<html>`; never set body smaller than 16px to support iOS/Safari auto-zoom (relevant for any future browser target).
- Scale ratio: Slight third (1.125) for sizes between H4 and H1; Display jumps to a more dramatic 1.33 to give the dashboard hero visual weight.
- Max line length: **72ch** for descriptive paragraphs in dialogs and forms.
- Tabular figures (`tabular-nums`): Required in **every** table column containing numbers, currency, or sizes. Prevents digits from "jumping" as values update.
- Letter-spacing: Tight on display headings, normal on body, **+0.02em uppercase** for small caps labels (e.g., section eyebrows).

**Arabic-specific rules**
- `[dir="rtl"]` swaps `font-family` to `'Noto Sans Arabic'`, then `'Inter'`, then `system-ui` so Arabic glyphs are first-class.
- Weights are matched: Noto Sans Arabic ships 400/500/600/700 — same hierarchy.
- Avoid letter-spacing tweaks in RTL (negative tracking on Arabic degrades legibility).
- Punctuation (commas, quotes) flips automatically with `dir="rtl"`; explicit `‹ ›` and `« »` should match locale.

### 4.3 Spacing, Radius, & Density 

Spacing is on an **8px grid** (Tailwind v4 default is 0.25rem = 4px increments; we use the 4px base to compose visible 8/16/24/32/48 rhythms). shadcn default tight density is critical for hospital staff who need to scan dozens of rows per minute.

#### Spacing scale

| Token | Value | Common usage |
|-------|-------|--------------|
| `space-0` | 0 | Flush |
| `space-1` | `0.25rem` (4px) | Icon-to-label gap, badge padding |
| `space-2` | `0.5rem` (8px) | Stack between icon + label; dense form field gaps |
| `space-3` | `0.75rem` (12px) | Control vertical padding; form label-to-input gap |
| `space-4` | `1rem` (16px) | Card internal padding (default), between related controls |
| `space-5` | `1.25rem` (20px) | — |
| `space-6` | `1.5rem` (24px) | Section gaps; dialog content padding |
| `space-8` | `2rem` (32px) | Page section spacing |
| `space-10` | `2.5rem` (40px) | Page top/bottom margins |
| `space-12` | `3rem` (48px) | Major layout divisions |
| `space-16` | `4rem` (64px) | Empty state vertical breathing room |

#### Radius scale (synced with `--radius: 0.5rem` in shadcn)
shadcn's `--radius` CSS variable scales all radii. Default `0.5rem` is tuned for shadcn's tight feel; never go below `0.375rem` for interactive elements (too sharp to look like a button).

| Token | Value | Used for |
|-------|-------|----------|
| `radius-none` | 0 | — |
| `radius-sm` | `calc(--radius - 4px)` ≈ `4px` | Badges, chips, small icon buttons |
| `radius-md` | `calc(--radius - 2px)` ≈ `6px` | Inputs, buttons, tabs (`<Button>`, `<Input>`) |
| `radius-lg` | `--radius` (`8px`) | Cards, smaller dialogs, alerts |
| `radius-xl` | `calc(--radius + 4px)` ≈ `12px` | Large modals, sheets, popovers |
| `radius-full` | `9999px` | Avatars, pills, circular buttons |

#### Density rules
- Default control height: **40px** (`h-10`) for buttons & inputs — meets 44pt minimum tap target when paired with 4px padding.
- Table row height: **48px** (`h-12`) — comfortable hover affordance.
- Dialog padding: **24px** for `<DialogContent>` body; **16px** for footer.
- Sidebar collapsed width: **48px** (`w-12`); expanded: **256px** (`w-64`).
- TopBar height: **48px** (`h-12`), sticky.
- Card padding: **16px** (`p-4`); compact variant `p-3` (12px) for KPI cards on the dashboard.

### 4.4 Shadows & Elevation

A four-level elevation scale. Token names map directly to Tailwind v4 `@theme` declarations in `src/renderer/src/index.css`.

| Token | Value | Used for |
|-------|-------|----------|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` | Badges, subtle chips, raised inline labels |
| `shadow-sm` | `0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)` | Small buttons, status pills |
| `shadow-md` | `0 4px 6px -1px rgba(15,23,42,0.06), 0 2px 4px -2px rgba(15,23,42,0.04)` | Cards, dropdowns, popovers, sonner toasts |
| `shadow-lg` | `0 10px 15px -3px rgba(15,23,42,0.08), 0 4px 6px -4px rgba(15,23,42,0.04)` | Modals, datepickers, command palette, sheets |
| `shadow-xl` | `0 20px 25px -5px rgba(15,23,42,0.10), 0 8px 10px -6px rgba(15,23,42,0.04)` | Full-screen overlays, immersive dialogs, wizard steps |
| `shadow-2xl` | `0 25px 50px -12px rgba(15,23,42,0.25)` | Drag preview, drag-and-drop ghosts |
| `shadow-inner` | `inset 0 2px 4px 0 rgba(15,23,42,0.05)` | Selected/active pressed state |
| `shadow-focus` | `0 0 0 2px #FFFFFF, 0 0 0 4px #0077B6` | Keyboard focus ring on dark surfaces (used with `ring-offset-2`) |

**Rules**
- Elevation is **earned** — every elevated surface must justify its shadow by communicating hierarchy (parent vs child) or interactivity (button hover, popped-over dropdown).
- Use `transition-shadow` (`duration-200`) when raising an element on hover to avoid jarring layout.
- Never stack shadows by manually composing multiple `box-shadow` rules; pick the highest elevation you need.

---

## 5. Layout Architecture

### 5.1 Global Layout (AppShell)

The shell is the React component `<AppShell>` at `src/renderer/src/components/layout/AppShell.tsx`. It is a CSS Grid: a fixed-width sidebar (`<Sidebar>`) and a flexible main column containing a sticky `<TopBar>` and scrollable `<Outlet />`.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Sidebar (Sidebar.tsx)   │ Main Column                               │
│ ─────────────────────── │ ──────────────────────────────────────────│
│ ▸ Header                │ TopBar (TopBar.tsx) — sticky, h-12        │
|   LogoIcon+"HealthCore+"|
│   Collapse button       │  Breadcrumb │ Title │ Search │ Lang │ ... │
│ ▸ Nav items(Collapsible)|                                           │
│   · Dashboard           │ <main> page content (routes render here)  │
│   · User Management ▼   │                                           │
│     · Users             │  <PageHeader title actions/>              │
│     · Roles             │  <Card> … </Card>                         │
│   · Patients (locked)   │  <DataTable />                            │
│   · Employees (locked)  │  Pagination/Summary                       │
│   · ...                 │                                           │
│ ──────────────────────  │                                           │
│ ▸ User Profile          │                                           │
│    Profile    kebabIcon │                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Sidebar (Sidebar.tsx) behavior** (see implementation plan § Phase 3)
- Expanded width **256px** (`w-64`); collapsed **64px** (`w-16`, icon-only).
- Width transitions with `transition-all duration-200 ease-in-out`.
- Filters `NAV_CONFIG` using `usePermission()` at render time — no extra API call.
- Active link detection via `useLocation().pathname` (exact match); active item gets `bg-primary-light text-primary border-s-2 border-primary` (uses `border-s` so it mirrors in RTL).
- Nested items ("User Management") use shadcn `<Collapsible>` so they can stay expanded when the sidebar is collapsed.
- Tooltip on collapsed nav: shadcn `<Tooltip>` shows the label on hover/focus.
- HMS logo icon sits at top, with "HealthCore+" next to it. "Health" is in the primary color, while "Core" and "+" in secondary color. The "+" is a superscript on top of "Core". Collapse Button sits on the right side, and replaces the HMS Logo when the sidebar is collapsed.
- Logout uses shadcn `<AlertDialog>` for confirmation → `authStore.logout()` → navigate to `/login`.
- Permission-locked items get a small `Lock` icon and `aria-disabled`.
- User Profile: user profile image (letter placeholder if no image), name & role badge under. user menu on right side on clickable kebab icon
- User menu: shadcn `<DropdownMenu>` with username, role badge, "Settings" stub, "Logout".

**TopBar (TopBar.tsx) behavior**
- Sticky at the top (`sticky top-0 z-30`), 48px tall, `--surface` background with `shadow-sm`.
- Breadcrumb: auto-generated from `useLocation()` + a route-to-label map; uses shadcn `<Breadcrumb>`. Ellipsizes middle segments past depth 4.
- Global search (`Ctrl+K` / `Cmd+K`): shadcn `<Command>` dialog (Phase 8). Initially navigates to module pages only (entity search deferred).
- Language toggle: button → `uiStore.setLanguage()`; `RTLSync` updates `<html dir>` and `i18n.changeLanguage()`.


**RTL behavior**
- Sidebar automatically shifts to the right edge because the layout uses `inline-start` positioning via `border-s` and `ms-*` utilities — never `ml-*`/`mr-*`.
- TopBar mirror handled by `dir="rtl"`; iconography (arrows, breadcrumbs) uses Lucide's `rtl` variants where available (`ChevronLeft` ↔ `ChevronRight` flip automatically via CSS).

---

## 6. Component Design Specifications

Every component in HMS belongs to one of two layers:

1. **Primitives layer** (`src/renderer/src/components/ui/`) — Auto-generated by the shadcn CLI during `npx shadcn@latest add ...`. Treat them as design-system primitives — add a thin local wrapper rather than customizing the primitive in place.
2. **Common layer** (`src/renderer/src/components/common/`) — Composed wrappers that enforce HMS conventions (`DataTable`, `ConfirmDialog`, `EmptyState`, `PageHeader`, `RevenueLineChart`, `DonutChart`).

### 6.1 Cards & Surfaces (`<Card>`)

Built on shadcn `<Card>`. Used for grouped content (KPI tiles, panels on details, dashboard widgets).

- **Style:** `--surface` background, `shadow-md`, **`radius-lg` (8px)** corners, `p-4` padding; KPI variant `p-3` for density.
- **Header:** flex row with `<CardTitle>` (H3) and `<CardDescription>` + actions slot.
- **Hover (interactive cards only):** `shadow-lg` + `transition-shadow duration-200`. **No vertical translate** — preserves grid alignment.
- **Dividers:** `<Separator>` between header and body when needed (1px, `--border`).
- **KPI Stat Card variant:** large number (`text-3xl font-bold tabular-nums`), eyebrow label (`text-xs uppercase tracking-wide text-secondary`); delta pill (`success` / `danger` icon + percentage).

### 6.2 Data Tables (`<DataTable>` — common layer)

The single most-used component. Composes shadcn `<Table>`, `<Skeleton>`, `<Pagination>`, `<EmptyState>`, and `<DropdownMenu>`.

- **Container:** `<Card>` wrapper with `overflow-x-auto` for horizontal scroll on narrow viewports.
- **Sticky header:** sticky `<thead>` with `bg-surface-muted` so column labels stay visible while scrolling.
- **Row height:** `h-12` (48px) — comfortable touch target.
- **Row hover:** `bg-primary-light` / `hover:bg-primary-light/60` — distinct but not loud.
- **Selected row:** `bg-primary-light` + `ring-1 ring-inset ring-primary` so selection reads on top of zebra striping.
- **Zebra striping:** opt-in via `density="compact"` prop; otherwise solid.
- **Sortable columns:** click header → `aria-sort` flips (none / ascending / descending); icon: `ArrowUpDown` / `ArrowUp` / `ArrowDown` (Lucide).
- **Actions column:** right-aligned (LTR) / left-aligned (RTL); icon buttons reveal always on touch, only on hover on desktop. Three slots: view, edit, delete (`MoreHorizontal` overflow menu for >3 actions).
- **Empty state:** `<EmptyState>` (illustration + title + primary CTA) — never blank.
- **Loading state:** 5–8 skeleton rows inside `<tr>` with `<Skeleton className="h-4 w-full" />`; never a centered spinner.
- **Pagination:** shadcn `<Pagination>` at bottom-right of table card; page-size select (`10`, `25`, `50`, `100`) left of pagination.
- **Tabular figures:** every numeric column uses `font-variant-numeric: tabular-nums` so digits don't shift.
- **Inline status badges:** `<Badge variant="default|secondary|destructive|outline">` plus an accompanying icon and text — never a colored chip alone.

### 6.3 Forms & Inputs (`react-hook-form` + `zod`)

Form state is managed by **react-hook-form**; validation schemas live alongside as **zod** objects and are exported for reuse. The shadcn `<Form>` primitive wires them together.

- **Labels:** always visible above the input (top-aligned). **Never** placeholder-only.
- **Input height:** `h-10` (40px).
- **Border:** `--border` default → `border-primary` on focus + Tailwind `ring-2 ring-primary/30` glow (shadcn default).
- **Validation messages:** below the field, `text-danger text-xs`. Use the shadcn `<FormMessage>` component.
- **Required markers:** red `*` next to label; `aria-required="true"` on the input.
- **Required vs optional:** required by default; optional fields explicitly show "(optional)" to reduce cognitive load.
- **Field grouping:** `<fieldset>` + `<legend>` via shadcn `<FormField>`; visually grouped with whitespace.
- **Multi-step (wizard pattern):** shadcn `<Dialog>` with internal stepper state; each step has its own zod schema; `Next` disabled until current step validates (inline, never blocking modal).
- **Auto-save on long forms:** planned (out of scope for v1).
- **Submission:** button shows `<Loader2 className="animate-spin" />` while `isSubmitting`; the button is disabled during the request; on error, focus the first invalid field via `form.setFocus(...)`.
- **Error recovery:** form errors are inline; only category-level errors (e.g., "Service unavailable") show as Sonner toast.

### 6.4 Modals, Sheets, Popovers (shadcn primitives)

HMS uses the right primitive for the right job. **Do not** force everything into `<Dialog>`.

| Need | shadcn primitive | Notes |
|------|------------------|-------|
| Confirm / alert destructive action | `<AlertDialog>` (modal, no outside-click dismiss) | Required for deletes, logouts, billing finalization |
| Standard modal form (add/edit user, role) | `<Dialog>` (modal) | ESC + outside click dismisses |
| Patient bill review (large content, split pane) | `<Dialog>` with `max-w-5xl` and inner 2-column grid | Avoid `<Sheet>` for content > 600px wide |
| Patient detail / long-form inspection | `<Sheet>` from inline-start (right in LTR, left in RTL), `sm:max-w-xl` | Swipe-to-close on touch; full-screen below `sm` |
| Quick action on a row | `<DropdownMenu>` for actions; `<Popover>` for inline pickers | Triggered by icon button; focus restored on close |
| Date pickers, command palette | `<Popover>` host for `<Calendar>` or `<Command>` | Inside `<PopoverContent>` with `w-auto p-0` |

**Sizing & motion rules**
- `<DialogContent>` default: `sm:max-w-md`, `max-h-[90vh]`.
- Modal variants: `sm` (400px), `md` (600px — default), `lg` (900px), `xl` (1100px — wizard), `2xl` (1400px — bill builder).
- Backdrop: `bg-black/50 backdrop-blur-sm` — strong enough to isolate foreground without feeling pitch-black.
- Entry/Exit: shadcn `<Dialog>` uses `data-[state=open]:animate-in fade-in-0 zoom-in-95`; **don't override unless measured to feel laggy**.
- Focus trap: shadcn `<Dialog>` handles it — focus first focusable on open, restore focus to trigger on close.
- Mobile: `<Sheet>` becomes full-screen below `sm`; `<Dialog>` becomes near-full-screen with a top close button.

### 6.5 Buttons (`<Button>`)

Mapped to shadcn `<Button>` variants. Always 40px tall (`h-10`) for comfortable hit targets; icon-only buttons use `h-10 w-10` square with `aria-label`.

| Variant | Background | Text | Border | Used for |
|---------|------------|------|--------|----------|
| **default** (primary) | `primary` (#0077B6) | white | none | Save, Submit, Continue (primary CTA) |
| **secondary** | `surface` | `text-primary` | `border` | Cancel, Back, secondary actions |
| **outline** | transparent | `text-primary` | `border-strong` | Filter chips, tertiary actions |
| **ghost** | transparent (hover: `primary-light`) | `text-primary` (hover: `primary`) | none | Dropdown triggers, page-level actions |
| **destructive** | `danger` (#EF4444) | white | none | Delete, Remove, Discard |
| **link** | transparent | `primary` underline | none | Forgot password, in-text actions |
| **icon** (square variant) | `surface` | `text-secondary` | `border` | Table action buttons |

- **Loading:** while a server call is in flight, swap label for `<Loader2 className="animate-spin" />` and disable the button. **Never** rely on color alone to indicate loading.
- **Disabled:** `disabled:opacity-50 disabled:pointer-events-none` (shadcn default). Used for "no permission" and "save with no changes".
- **Destructive separation:** destructive buttons are visually smaller and pushed to the **right** (LTR) of CTA clusters. **Never** the default primary action.
- **Touch target:** minimum `h-10` (40px); icon-only uses `h-10 w-10 p-0` with `aria-label`.

### 6.6 Toasts & Confirmations (Sonner + AlertDialog)

- **Sonner** is mounted in `main.tsx` with `<Toaster richColors position="top-right" />`. Mirrored to top-left in RTL automatically.
- Variants: `success`, `error`, `warning`, `info` (`richColors` adds semantic color tint).
- Auto-dismiss: **5s** for `info` / `success`; **persistent** for `error` (user must acknowledge) until clicked × or pressed Enter.
- **Sonner is for non-blocking notifications only.** All destructive, irreversible, or blocking decisions use `<AlertDialog>` (always modal, requires explicit confirmation).
- For "Undo delete" patterns, action toasts expose a visible `Undo` button that remains until the toast auto-dismisses; after dismissal the action is permanent.
- `aria-live="polite"` (Sonner default) handles screen-reader announcement — non-confirmation toasts never steal focus.

### 6.7 Icons (Lucide React)

- All icons are **Lucide React** (`lucide-react`) — the same library shadcn/ui installs.
- Default size: **20px** (`size-5`) for inline UI, **16px** (`size-4`) for table actions, **24px** (`size-6`) for empty-state illustrations.
- Stroke width: default Lucide 2px (or `strokeWidth={1.5}` for hero illustrations).
- Icon-only buttons **always** get `aria-label`; never rely on visual alone.
- No emoji used in place of icons anywhere in UI — including breadcrumbs, status indicators, and notifications.

### 6.8 Charts (shadcn/ui Chart + Recharts v3)

HMS uses **shadcn/ui Chart** (built on **Recharts v3**) wrapped in app-level React components: `<RevenueLineChart>`, `<PatientServicesDonut>`, plus per-report chart wrappers in `components/charts/`. Rule: **never** let a page render a raw Recharts primitive — always go through the wrappers so design tokens drive chart color and accessibility guarantees (skeleton/empty/srSummary) are enforced.

- All chart colors derive from semantic tokens (e.g., `success`, `primary`, `warning`).
- Tabular figures in axis labels; legend below chart; tooltip on hover includes the unit ("EGP", "patients", "days").
- Loading: skeleton placeholder takes the chart's exact box dimensions (no CLS).
- Empty: render `<EmptyState>` in place of chart; never an empty axis frame.
- Colorblind users: every dataset has an associated `pattern` or unique marker; **legend labels** accompany color.

---

## 7. Critical User Flows

These are the **highest-frequency, highest-stakes workflows** in HMS — the ones we design against as we build. Each flow references the exact component(s) it consumes; every component honors §4 (tokens), §6 (primitives), §8 (a11y), and §10 (motion).

### 7.1 Login

Route: `/login` (public). Replaces the legacy `login.html` + `login.ts` + `login.css`.

- **Layout:** Centered surface card on the existing `bg-background` (`#F0F9FF`); HMS logo + product name in the card header; language toggle in the top-right corner of the viewport.
- **Form:** react-hook-form + zod. Two fields: `username` (required), `password` (required, with show/hide toggle using `<Eye>` / `<EyeOff>` Lucide icons). `<FormLabel>` shows red `*` for required; helper text below input.
- **Submit:** `<Button>` with `<Loader2 className="animate-spin" />` while pending; on success, `authStore.login(user, token)` then `navigate('/dashboard')`. **No toast** on success — the route change itself is the confirmation.
- **Error:** Inline `<FormMessage>` below the credential fields; never a modal. After 5 failures on the same minute, a Sonner `error` toast is shown ("Account temporarily locked. Try again in a minute.").
- **Background:** subtle brand-aligned gradient (`bg-gradient-to-br from-primary-light via-background to-background`) — never decorative imagery.
- **Session expired (existing session):** When `authStore.verify()` 401s, navigate to `/login` with a Sonner `warning` toast "Session expired, please sign in again."

### 7.2 Patient Registration & Lookup

Route: `/patients`. Replaces the 76K `patients.html` + 173K `patients.ts`.

- **Omni-search:** the existing inline search uses `<Input>` with a leading `<Search>` icon. Backend lacks a unified search endpoint today (per `react_implementation_plan.md` decision #11); we surface our own fuzzy match against loaded data and add a "+ Register new patient" affordance when no match is found. Global Ctrl+K is navigation-only.
- **Registration wizard (`<PatientRegistrationWizard>`):** shadcn `<Dialog>` with `max-w-3xl`. Four steps with an inline stepper:
  1. **Demographics** — full name (AR + EN), DOB, gender, national ID
  2. **Contact** — phone, address, city
  3. **Emergency contact** — name, relationship, phone
  4. **Insurance** — insurance company `<Select>`, policy number, expiry date
- Each step has its own zod schema; `Next` is disabled until current step validates inline. The user **cannot** submit until the final step is valid; on submit, `<Button>` shows spinner → POST `/api/patients` → success closes the dialog and the new patient is pre-selected.
- **Duplicate prevention:** as the user types the national ID, fuzzy-match against existing patients is shown below the field (shadcn `<Alert variant="warning">`) with a one-click "Use existing patient" action.
- **Patient detail (`<PatientDetailSheet>`):** shadcn `<Sheet>` from inline-start. Tabs (`<Tabs>`) for Info / Bills / Medical History. "Edit" reopens `<PatientRegistrationWizard>` in edit mode.
- **Bill (`<BillingDialog>`):** see §7.3.

### 7.3 Billing & Checkout

Route: `/patients/:id/bill` (modal launch). The single most complex dialog in the app.

- **Layout:** shadcn `<Dialog>` with `max-w-5xl`; two-pane grid (`lg:grid-cols-[2fr_1fr]`).
- **Left pane — Build bill:** `<Tabs>` for **Services** / **Drugs** / **Supplies**. Each tab has an autocomplete item-picker (`<Command>`-style), quantity `<Input>`, and per-row total. Items render below in a sortable list with `<Trash2>` remove actions.
- **Right pane — Live summary:** patient summary card, itemized list, subtotal, discount `<Input>` (percentage), VAT (computed), **grand total** (`text-2xl font-bold tabular-nums`).
- **Real-time totals:** every change recalculates the right pane immediately; subtotal/VAT/total use `tabular-nums` so digits don't shake the layout.
- **Payment step:** clicking **Continue to Payment** swaps the right pane for `<RadioGroup>` payment method (Cash / Card / Insurance), amount received `<Input>` (cash), change due (computed). Disabled `Confirm` until amount covers total.
- **Receipt:** **Generate Receipt** invokes `usePDF()` → pdfmake-rtl → blob download + inline preview using `<iframe>`. Success closes the dialog with a Sonner `success` toast.

### 7.4 Dashboard Insights

Route: `/dashboard`. Adapts to role:
- **Admins (`role === 'Admin'`):** Full **AdminDashboard** — revenue/profit KPI strip (today / 7d / 30d), active patients count, low-stock count, near-expiry count, `<RevenueLineChart>` (last 30 days, revenue + profit datasets), `<DonutChart>` (services vs pharmacy with toggle between revenue view and profit view), and "Recent Activity" table showing the last 10 audit log entries.
- **Other roles:** Compact **UserDashboard** — KPI tiles for active patients, low stock, near expiry; `<FeatureGrid>` showing quick-link cards for the modules the user has permission for.

Design rules: every chart has an `srSummary` prop rendered as a screen-reader-only `<table>`; skeleton placeholder matches exact chart dimensions while loading; no chart shows a blank axis frame on error — it shows `<EmptyState>` with retry.

### 7.5 Pharmacy & Inventory

Routes: `/drugs` and `/supplies`. Same DataTable pattern, different column sets.

- Drugs DataTable: name (AR + EN), category, current stock, expiry status badge (success/warning/destructive), actions menu.
- Low-stock rows render an `<AlertTriangle>` badge next to the stock number with `text-warning` text and **paired text "Low stock"** (not color alone — colorblind safety).
- Shipment timeline is a CSS-based component inside `<Sheet>` (deferred to Phase 7 polish per implementation plan but documented here for design reference).
- Add Drug / Add Shipment / Record Usage each open as separate `<Dialog>`s with zod-validated forms.

---

## 8. Accessibility (a11y)

HMS targets **WCAG 2.1 AA**. Because most primitives come from shadcn/ui (Radix UI under the hood), keyboard and ARIA correctness come for free — the design system's job is to **preserve** that correctness by avoiding common regression patterns.

| Concern | Standard | HMS implementation |
|---------|----------|--------------------|
| **Keyboard navigation** | All interactive elements reachable via Tab; logical tab order | shadcn primitives are keyboard-correct; verify tab order in `<PatientRegistrationWizard>` and `<BillingDialog>` |
| **Focus indicators** | ≥2px high-contrast ring with 2px offset | Tailwind `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`; never `outline: none` without replacement |
| **Modal focus trap** | First focusable on open; ESC closes; focus restored to trigger | All shadcn `<Dialog>` / `<AlertDialog>` / `<Sheet>` handle this automatically |
| **Screen readers** | Landmarks + table semantics + live regions | `<PageHeader>` always emits one `<h1>`; `<DataTable>` uses `<caption>`, `<th scope="col">`, `aria-sort`, `aria-busy` while loading |
| **Form labels** | Visible label + `for` association; never placeholder-only | shadcn `<Form>` field includes `<FormLabel>`; required fields add `aria-required="true"` |
| **aria-live regions** | `polite` for non-blocking status (`Sonner`); `assertive` only for blocking alerts | Sonner configures `aria-live="polite"` natively; AssertDialog focuses focus on content |
| **Color contrast** | AA: 4.5:1 normal text, 3:1 large text & UI | Verified in §4.1.4 contrast table; full AA; key pairs reach AAA |
| **Color is not the only signal** | Pair a status color with text + icon | `<Badge>` variants **must** include `variant` text + icon (e.g., `<Badge variant="warning"><AlertTriangle /> Low stock</Badge>`); charts overlay patterns on datasets |
| **Touch targets** | ≥40 × 40px (we slightly relax to HMS desktop) — but never below 32px even for table icon buttons; row actions wrap in `<DropdownMenu>` if cramped | shadcn `<Button>` `h-10` default; icon-only `<Button>` `h-10 w-10 p-0` |
| **Reduced motion** | Respect `prefers-reduced-motion` | Global rule in `index.css`: `@media (prefers-reduced-motion: reduce) { … duration 0.01ms }`; applies to shadcn animations and DataTable row stagger |
| **RTL as first-class** | No layout breaks when `dir="rtl"` toggles | CSS logical utilities everywhere (`ms-*`, `me-*`, `ps-*`, `pe-*`, `border-s-*`); `[dir="rtl"]` swaps font + iconography; no separate RTL stylesheets |
| **Skip link** | "Skip to content" target for keyboard users | Optional in plan but recommended: render a visually-hidden `<a href="#main">` skip-link at top of `<AppShell>`, visible on focus |
| **Heading hierarchy** | One `<h1>` per page, sequential levels below | `<PageHeader>` always uses `<h1>`; section titles are `<h2>`; card titles are `<h3>` — never skip levels |
| **Charts & data** | Charts need text alternative | Every `<RevenueLineChart>` / `<DonutChart>` accepts a `srSummary` prop rendered into `<table className="sr-only">` so screen readers get a tabular equivalent |

---

## 9. Responsive Strategy

HMS is an Electron desktop app, so the **primary target is desktop and tablet**. Browser-based dev mode (Vite, port 5173) does not constrain the design — but breaking layouts beyond 768px would cripple Epic workstations with smaller monitors, so all common sizes are tested.

### Breakpoints

| Name | Width | Target |
|------|-------|--------|
| `sm` | 640px | — |
| `md` | 768px | Tablet (portrait) |
| `lg` | 1024px | Small desktop — sidebar collapses to icon-only, single-column content |
| `xl` | 1280px | Standard desktop — full sidebar (256px), single-column main content |
| `2xl` | 1536px | Wide desktop — multi-column dashboard grids, side-by-side dialog panels |

### Behavior per breakpoint

- **`2xl` and up (≥1536px):** Full sidebar (256px), dashboard KPI grid is **4 columns**, billing dialog uses side-by-side panes (max-w-5xl)
- **`xl` (1280–1535px):** Full sidebar (256px), dashboard grid is **3 columns**, dialogs remain centered
- **`lg` (1024–1279px):** **Collapsed sidebar by default** (icon-only `w-16`); main column is single-column; tables remain full-width with horizontal scroll if needed
- **`md` (768–1023px):** Sidebar becomes a Sheet drawer triggered by a hamburger in the TopBar; tables become card lists or horizontally scrollable
- **< `md`:** Content goes full-bleed, sidebar in drawer; dialogs become full-screen bottom sheets

### Implementation guidance

- Tailwind's `md:` / `lg:` / `xl:` prefixes would be confusing in a desktop-first app; we use Tailwind's default breakpoints **plus** the Tailwind v4 `@theme` to redefine if needed. Layout switching is handled by the Breakpoint consumer (`useMediaQuery`) or CSS-only via `min-width` containers.
- The sidebar uses **explicit `w-16` / `w-64` classes** (not responsive prefixes) — collapse state is user-controlled and persisted in `uiStore` (`hms-ui` localStorage key), not viewport-driven. This keeps the user's preference stable across resizes.

---

## 10. Animation & Micro-interactions

Animation in HMS provides **feedback and continuity**, never decoration. Every animation must express a cause-effect relationship (button press → tap confirms input; modal opens → focus arrives; data loads → content appears). All durations are tuned to feel **invisible when working as expected** and only noticeable when there's a problem.

| Animation | Duration | Easing | Notes |
|-----------|----------|--------|-------|
| **Page transitions** | 150ms | `ease-out` | `<main>` content uses `animate-in fade-in-0 duration-150` on route change |
| **Sidebar collapse/expand** | 200ms | `ease-in-out` | `transition-all duration-200 ease-in-out` on width classes |
| **Button press** | 80ms | spring | Subtle 0.97 scale via `active:scale-[0.97]` + `transition-transform` |
| **Button loading** | instant | — | Label swaps to `<Loader2 className="animate-spin" />` (Lucide's built-in 1s rotation) |
| **Dialog/Sheet entry** | shadcn default | shadcn defaults | `data-[state=open]:animate-in fade-in-0 zoom-in-95`; do not override unless measured |
| **Dialog/Sheet exit** | shadcn default | shadcn defaults | Out is ~30% faster than in for snappy dismissal |
| **Table row stagger** | 50ms per row | `ease-out` | `animation-delay: calc(var(--row-index) * 50ms)` |
| **Toast (Sonner)** | ~300ms slide-in | RichColors | Slides from right (LTR) or left (RTL); auto-dismiss in 5s (`info`/`success`), persistent for `error` |
| **Skeleton shimmer** | 1.5s | `ease-in-out infinite` | shadcn `<Skeleton>` built-in |
| **Hover states** | 150ms | `ease-out` | All color/shadow/border transitions capped at 150ms |

**Reduced motion**

The following global rule in `src/renderer/src/index.css` neutralizes all the above for users who enable `prefers-reduced-motion` at the OS level:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

This is required — handing clinic staff who must use the app for long shifts, some of whom experience vestibular issues from animations.

**Animation rules**

- **Transform & opacity only.** Never animate `width`, `height`, `top`, `left` (causes layout thrash / CLS).
- **Stagger ≤ 10 visible rows** at a time (50ms × 10 = 500ms ceiling) — beyond that, paginate.
- **No animated decorative elements.** Empty-state illustrations are static.
- **Continuous animations are opt-in** (e.g., a 3s skeleton shimmer is fine; auto-rotating carousels are not).

---

## 11. Technology Stack & Mapping

### 11.1 Confirmed Stack (per `react_implementation_plan.md`)

| Layer | Choice | Notes |
|-------|--------|-------|
| **Framework** | **React 19** + **Vite 6** | Dev server on `:5173`, production builds to `dist-electron/renderer/` |
| **Routing** | `react-router-dom` v7+ | Client-side SPA, Express catch-all serves `index.html` |
| **Styling** | **TailwindCSS v4** (CSS-first `@theme`) | Tailwind v4 Vite plugin (`@tailwindcss/vite`), no `tailwind.config.js` |
| **UI primitives** | **shadcn/ui** | Owned by HMS (`src/renderer/src/components/ui/`), not a dependency |
| **State** | **Zustand** | `authStore` (`hms-auth` localStorage), `uiStore` (`hms-ui` localStorage) |
| **Forms** | `react-hook-form` + `zod` (@hookform/resolvers) | Schemas exported for reuse, validated per step in wizards |
| **i18n** | `react-i18next` + `i18next-browser-languagedetector` | All `en.json` / `ar.json` keys migrated verbatim |
| **Toasts** | `sonner` (`richColors`, `top-right`) | Replaces `toastr` and `sweetalert2` |
| **Icons** | `lucide-react` | Same icon family used inside shadcn |
| **Charts** | `recharts` v3 (via shadcn/ui `Chart` + app-level wrappers `<RevenueLineChart>` / `<PatientServicesDonut>`) | Design tokens drive palette; lazy-loaded on Dashboard and Reports only |
| **PDF** | `pdfmake` + `@digicole/pdfmake-rtl` (via the `usePDF()` hook) | Bill receipts |
| **Class merging** | `class-variance-authority`, `clsx`, `tailwind-merge` (the `cn()` util) | — |

### 11.2 Design tokens live in `index.css`

Tailwind v4 replaces `tailwind.config.js` with a CSS-first `@theme` block in `src/renderer/src/index.css`. The implementation plan defines the source of truth for tokens (colors, fonts, shadows); this document is the authority on **semantics** (which tokens to use for which UI fragments).

The CSS custom properties are kept in lock-step:

```css
:root {
  --background: 210 100% 97%;   /* #F0F9FF */
  --foreground: 222 47% 11%;    /* #0F172A */
  --primary: 201 100% 36%;      /* #0077B6 */
  --primary-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;     /* #EF4444 */
  --border: 214 32% 91%;        /* #E2E8F0 */
  --radius: 0.5rem;             /* 8px */
}
```

Developers prefer the **semantic Tailwind class names** (`bg-primary`, `text-secondary`, `border-border`) over raw HSL values. The HSL is only used by shadcn primitives internally.

### 11.3 Component-layer rules

1. **Never** edit files inside `components/ui/` unless synchronizing an upstream shadcn change. Add a wrapper instead.
2. **Prefer** composing primitives over restyling them — `<Button variant="destructive">` over `<Button className="bg-red-500">`.
3. **Shorthand first**: `text-sm font-medium text-text-primary` over `text-[14px] font-[500] text-[#0F172A]` — design tokens make the codebase the design system.
4. **RTL-safe by default**: use `ms-*`, `me-*`, `ps-*`, `pe-*`, `border-s-*`, `border-e-*`, `start-*`, `end-*`; never `ml-*`/`mr-*`/`pl-*`/`pr-*` for directional spacing.
5. **Conditional classes** use the `cn()` utility (`clsx` + `tailwind-merge`), never string concatenation.

### 11.4 Performance principles

- **Vite tree-shaking + route-level splitting**: every page is `React.lazy()`-loaded. The 242K-line `reports.ts` becomes a folder of lazy-loaded report components (`/Reports/types/*`).
- **Per-phase bundle budget**: shell + login < 150KB gzipped; per-page route < 80KB gzipped.
- **Virtualization-ready**: `<DataTable>` is built so swapping `<tbody>` for an explicit `react-virtual` window is a low-risk migration when needed.
- **Asset optimization**:
  - Replace raster icons with Lucide SVG icons.
  - Inline small SVGs to reduce HTTP requests in Electron.
  - Fonts load with `font-display: swap`; preload only Latin Inter (4 weights) and `Noto Sans Arabic` (4 weights); JetBrains Mono is **lazy** until a page needs it.
  - Use Vite's image optimizations for any user-uploaded logos (rare in v1).

### 11.5 Removed dependencies (post-migration)

Once every page is React, the following can be removed from `package.json`:
- `bootstrap`, `@popperjs/core`
- `toastr`, `@types/toastr`
- `sweetalert2`

These were ad-hoc bridges used by the pre-migration vanilla pages; once those pages are gone, the shadcn primitives replace their functionality entirely.

---

## 12. Implementation Roadmap

The full phase-by-phase execution plan, scripts, file structure, and route map lives in **`react_implementation_plan.md`**. This section is the **design-track** mirror — milestones a designer uses to confirm the design contract is being honored as pages land.

| Implementation Phase | What ships (technical) | Design-track sign-off |
|----------------------|------------------------|------------------------|
| **0 — Tooling & Scaffold** | Vite + Tailwind v4 + `tsconfig` + `components.json` | Design tokens compiled into `index.css` `@theme` block; `cn()` utility canonical |
| **1 — Design System** | `index.css`, `lib/utils.ts`, `types/index.ts`, full shadcn primitive install | All 30+ shadcn primitives render correctly in light theme; confirms color palette in §4.1 against actual pixels |
| **2 — State / API / Routing / i18n** | `authStore`, `uiStore`, `lib/api.ts`, `i18n.ts`, `navigation.ts`, `App.tsx` (route skeleton + guards) | Sidebar renders nav with proper permission-locked states; `dir="rtl"` swaps font cleanly; no FOUC on language change |
| **3 — App Shell** | `AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx` | Sidebar collapse/expand polish; tooltip-on-hover-for-collapsed nav verified; breadcrumb generation correct across all routes |
| **4 — Shared Components** | `DataTable`, `PageHeader`, `ConfirmDialog`, `EmptyState`, `RevenueLineChart`, `DonutChart` | Two pages consume `DataTable` before any patient page to validate the API — never invent once-in-a-blue-moon `DataTable` variants |
| **5 — i18n Migration** | `en.json`, `ar.json` checked against existing locales via `npm run check-i18n` | New translation keys for `auth.sessionExpired`, "undo delete" toasts, wizard step labels, report-type picker |
| **6a — Login + Dashboard** | `LoginPage`, `AdminDashboard`, `UserDashboard` | Login page is the visual benchmark for future pages (spacing, type scale, button hierarchy) |
| **6b — Patients** | Patients page, registration wizard, billing dialog, `usePDF()` hook | The most-complex flow in the app; sign-off here means the design system is mature enough for every other page |
| **6c — Pharmacy: Drugs + Supplies** | Drugs page, supplies page | Low-stock + expiry badges verified colorblind-safe with paired icons |
| **6d — Employees + Clocking** | Employees, doctors, nurses, clocking | Deprecate `nurses` route per implementation decision; keep data table layout consistent with pharmacy |
| **6e — Vault** | Vault page | Three summary KPIs + DataTable; same density rules |
| **6f — Insurance** | Insurance page | — |
| **6g — Reports** | `ReportsPage` orchestrator + `Reports/types/*` lazy-loaded components | The big-bundle page; this is the moment bundle budget is enforced |
| **6h — Admin: Users + Roles** | Users, Roles | — |
| **6i — Services + Price Lists** | Services, Price Lists | Final CRUD pair — confirms `Dialog` form pattern works everywhere |
| **7 — Express Integration** | `src/app/index.ts` static-serve of `dist-electron/renderer/`; SPA catch-all | Verify `index.html` loads from Electron-built `.exe` on a clean profile |
| **8 — Polish, Accessibility, Cleanup** | Reduced-motion media query; animations; a11y audit; delete `views/`; remove bootstrap/toastr/sweetalert2 | Pass axe + Lighthouse a11y with **0 critical/serious issues**; visually unified across all 14 pages; Smoke test in RTL mode for every page |

**Total estimated duration:** ~28 working days (per implementation plan § Timeline).

> Designer involvement is highest in **Phases 1, 4, and 8**; the rest are mechanical rebuilds guided by this document and the implementation plan.

---

## 13. Success Metrics

These are the bar by which the new HMS frontend is judged. All metrics are measured against pre-migration baseline data (where available) and against the WCAG 2.1 AA spec.

| # | Dimension | Target |
|---|-----------|--------|
| 1 | **Usability — patient registration** | Reduce average time to register a patient by **30%** (from baseline measured in 6a) |
| 2 | **Error rate — billing** | Reduce billing input errors by **25%** via split-pane dialog + live totals + inline validation |
| 3 | **Accessibility** | **WCAG 2.1 AA** compliance; pass automated axe + Lighthouse checks with **0 critical / 0 serious issues** |
| 4 | **Visual consistency** | Every page uses only the design tokens in §4 — no ad-hoc hex values, no shadow stacking, no missing font weights |
| 5 | **Responsiveness** | Initial route renders in < 2s on standard hardware; UI remains responsive during data fetches (no jank > 100ms) |
| 6 | **Performance budget** | Shell + login < 150KB gzipped; per-page route < 80KB gzipped; total app < 600KB gzipped (excluding fonts) |
| 7 | **Bilingual parity** | Every page renders correctly in both `en` (LTR) and `ar` (RTL) with no separate RTL stylesheets |
| 8 | **Form & toast consistency** | 0 occurrences of ad-hoc `alert()`, 0 occurrences of remaining `toastr` / `sweetalert2` calls |
| 9 | **Tailwind v4 health** | `npm run lint` passes; no `red`, `green`, `blue-600`, etc. literals in `.tsx` (only semantic tokens) |
| 10 | **Drop-in maintenance** | Adding a new module is a single new folder under `pages/` + a single entry in `NAV_CONFIG` + a route in `App.tsx`; no global CSS changes |

---

## 14. Conclusion

This document defines the **design contract** for the HMS frontend: the colors, type, spacing, components, accessibility rules, and motion vocabulary that every page on the React 19 + Tailwind v4 + shadcn/ui renderer must honor. It is paired with **`react_implementation_plan.md`**, which defines the file structure, phases, and engineering sequence that gets us there.

Three principles hold the system together:

1. **Tokens, not literals.** Every color, font, radius, and shadow is named (`primary`, `text-secondary`, `radius-lg`, `shadow-md`). New pages compose tokens — never invent hex codes, paddings, or durations.
2. **Primitives, not custom.** Modal = `<Dialog>` / `<AlertDialog>` / `<Sheet>` (never handcrafted). Toast = Sonner (never `alert()`). Form fields = shadcn `<Form>` + react-hook-form + zod. Customization happens in `components/common/*`, not by forking the shadcn primitive.
3. **Accessibility by default.** Focus rings, color contrast, RTL via logical properties, reduced-motion media query, screen-reader live regions, one `<h1>` per page — every one of these is a guardrail, not a checkbox.

When a page is added, the design review asks: *does it use only tokens from §4, only primitives from §6, and follow the motion and a11y rules from §8–10?* If yes, it ships. The design system is mature not when it's complete (it's never complete), but when adding a new page never requires designing anything new.
