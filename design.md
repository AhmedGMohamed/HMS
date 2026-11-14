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
- **Token-driven theming** via one `:root` variable set bridged into Tailwind v4 with `@theme inline`, so every color, font, and shadow is a semantically-named primitive with a single source of truth
- **Light and dark parity** via `.dark` and `.true-dark` variable blocks that brighten brand hues and use navy or true-black surfaces instead of inverting light values; every pair is contrast-verified in all three themes
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

A palette purpose-built for hospital software: **trust** (deep ocean blue), **care** (teal), and a **neutral paper** workspace. The brand family stays blue + teal; surfaces are deliberately neutral so selection tints and status colors carry meaning. Low saturation reduces eye strain during long clinical shifts; color is reserved for semantics — never decoration.

**Implementation:** Colors are declared once as plain CSS variables in `:root` inside `src/renderer/src/index.css`, then bridged into Tailwind v4's utility namespace through `@theme inline` (see §11.2). shadcn's semantic variables (`--background`, `--primary`, `--accent`, …) point at those same values, so there is no second source of truth and no HSL/oklch drift.

#### 4.1.1 Primitive palette (source of truth)

| Token | Hex | Tier | Purpose |
|-------|-----|------|---------|
| `primary` | `#075985` | Brand | Primary actions, active nav, links, focus rings |
| `primary-light` | `#DCEBF5` | Brand tint | Selected rows, active nav, avatars, hover washes |
| `primary-dark` | `#064663` | Brand shade | Pressed/active text, text on `primary-light` |
| `secondary` | `#0F766E` | Brand | Secondary actions, wordmark "Core", chart 2 |
| `secondary-light` | `#E7F5F3` | Brand tint | Soft secondary chips and panels |
| `accent` | `#DCEBF5` | Interaction | Menu/select/combobox highlight, inline emphasis tint (aliases `primary-light`) |
| `accent-foreground` | `#064663` | Interaction | Text/icons on `accent` |
| `success` | `#15803D` | Status | Successful saves, positive indicators, completed badges |
| `success-light` | `#DCFCE7` | Status tint | Success backgrounds and toasts |
| `success-dark` | `#166534` | Status shade | Success text on `success-light` |
| `warning` | `#B45309` | Status | Pending items, near-expiry drugs, low stock |
| `warning-light` | `#FEF3C7` | Status tint | Warning backgrounds |
| `warning-foreground` | `#7C2D12` | Status shade | Warning alert copy on `warning-light` |
| `danger` | `#B91C1C` | Status | Errors, deletions, destructive actions, expired drugs |
| `danger-light` | `#FEE2E2` | Status tint | Error backgrounds |
| `info` | `#0369A1` | Status | Informational banners, neutral toasts |
| `info-light` | `#E0F2FE` | Status tint | Info backgrounds |

> `accent` is intentionally a **brand tint**, not a third hue. shadcn uses `accent` for every menu/select hover, so a saturated accent would paint the whole app green.

#### 4.1.2 Surfaces & text (neutral layer)

| Token | Hex | Purpose |
|-------|-----|---------|
| `background` | `#F6F8FB` | App background — neutral paper, no sky cast |
| `surface` | `#FFFFFF` | Cards, dialogs, sheets, popovers, table backgrounds |
| `surface-muted` | `#F1F5F9` | Striped table rows, sub-surface panels |
| `text-primary` | `#0F172A` | Headings, table data, primary content |
| `text-secondary` | `#475569` | Descriptions, labels, helper text |
| `text-tertiary` | `#64748B` | Captions, placeholders, metadata |
| `border` | `#E2E8F0` | Dividers, table rules, card rings |
| `border-strong` | `#CBD5E1` | Input borders, hover borders, emphasized dividers |
| `disabled` | `#94A3B8` | Disabled text and icons (WCAG-exempt inactive state) |
| `disabled-bg` | `#F1F5F9` | Disabled input/chip backgrounds |
| `shadow-color` | `rgba(15, 23, 42, 0.08)` | Universal shadow tint for elevation |

> The sidebar is `surface` white with a `border` edge; its hover/active tint is `primary-light`, not a separate background color.

#### 4.1.3 Semantic state mapping (recommend to developers)

| State | Background | Border | Icon/Text | shadcn primitive |
|-------|------------|--------|-----------|------------------|
| Default | `surface` | `border` | `text-primary` | `<Button variant="outline">` |
| Hover | `surface` | `border-strong` | `text-primary` | hover overlay utility |
| Focused | `surface` | `primary` (ring) | `text-primary` | shadcn focus ring (default) |
| Active / selected | `primary-light` | `primary` | `primary-dark` | `data-active`, selected rows |
| Disabled | `disabled-bg` | `border` | `disabled` | `disabled:opacity-50` |
| Success | `success-light` | `success` | `success-dark` | `<Alert variant="success">` |
| Warning | `warning-light` | `warning` | `warning-foreground` | `<Alert variant="warning">` |
| Danger | `danger-light` | `danger` | `danger` | `<Alert variant="destructive">` (matches shadcn naming) |
| Info | `info-light` | `info` | `info` | `<Alert>` (info accent) |
| Menu highlight | `accent` | transparent | `accent-foreground` | Dropdown/Select/Combobox focus |

#### 4.1.4 Contrast verification (WCAG 2.1 AA)

All text pairs below were measured against the tokens above (4.5:1 normal text, 3:1 large text and UI boundaries):

| Pair | Ratio | Result |
|------|-------|--------|
| `text-primary` (#0F172A) on `surface` (#FFFFFF) | 17.9 : 1 | AAA |
| `text-primary` on `background` (#F6F8FB) | 16.9 : 1 | AAA |
| `text-secondary` (#475569) on `surface` | 7.5 : 1 | AAA |
| `text-tertiary` (#64748B) on `background` | 4.5 : 1 | AA |
| `primary` (#075985) on `surface` | 7.6 : 1 | AAA |
| `primary` (#075985) on `primary-light` (#DCEBF5) | 6.1 : 1 | AA |
| White on `primary` — primary button label | 7.6 : 1 | AAA |
| White on `primary` at the 80% default-hover mix | 4.8 : 1 | AA |
| `secondary` (#0F766E) on `surface` | 5.5 : 1 | AA |
| White on `secondary` — secondary button label | 5.5 : 1 | AA |
| `accent-foreground` (#064663) on `accent` (#DCEBF5) | 8.2 : 1 | AAA |
| `danger` (#B91C1C) on `danger-light` (#FEE2E2) | 5.3 : 1 | AA |
| White on `danger` — destructive button label | 6.5 : 1 | AA |
| `success` (#15803D) on `surface` | 5.0 : 1 | AA |
| `success-dark` (#166534) on `success-light` (#DCFCE7) | 6.5 : 1 | AA |
| `warning` (#B45309) on `surface` | 5.0 : 1 | AA |
| `warning-foreground` (#7C2D12) on `warning-light` (#FEF3C7) | 8.4 : 1 | AAA |
| `info` (#0369A1) on `surface` | 5.9 : 1 | AA |
| `info` (#0369A1) on `info-light` (#E0F2FE) | 5.2 : 1 | AA |
| `disabled` (#94A3B8) on `surface` | 2.6 : 1 | Exempt (inactive component) |

> **Rule of thumb:** Use `*-light` tokens as backgrounds only. When text sits on a status tint, use the darker status token (`success-dark`, `warning-foreground`, `danger`, `info`) — never the base color on white unless the table above shows the pair passing.

#### 4.1.5 Palette rationale

- **`#075985` Deep Ocean Blue — trust and clinical professionalism.** It replaces the saturated "medical blue" with a deeper, calmer ocean tone. The depth is functional: shadcn's default button hover is `primary` at 80%, which still lands at 4.8:1 on white.
- **`#0F766E` Teal — care, recovery, and the wordmark's second note.** One perceptual step warmer than the primary, yet still 5.5:1 on white, so secondary buttons and "Core" in the wordmark remain readable without a special token.
- **Neutral paper, not a sky tint.** `#F6F8FB` keeps white cards, the sidebar, and the topbar visually distinct without washing the whole screen blue. The workspace recedes; the data leads.
- **A tint, not a third hue.** `accent` aliases `primary-light`, so every shadcn menu/select highlight reads as brand selection instead of an unrelated green.
- **Status colors chosen as text, not fills.** Each base status token clears 4.5:1 on white, so `text-success` / `text-warning` / `text-danger` are safe wherever they already appear; the `-light` / `-dark` pairings cover tinted surfaces.
- **`#0F172A` Deep Slate — strong body text.** Softer than pure black while preserving a 17:1 contrast on white.

> **Design Principle:** Neutral surfaces, one brand family, tint for selection. Every status is paired with an icon or label so color is never the only signal.

#### 4.1.6 Dark themes

Dark mode is a **parallel palette**, not an inversion. Brand hues brighten to stay legible on deep surfaces; backgrounds become navy rather than black so elevation still reads; status colors move to their 300/400 tonal step. Two dark variants share one contract: **Dark** (navy) and **True dark** (OLED black with blue accents, §4.1.7). The provider adds `.dark` to `<html>` for either variant and additionally `.true-dark` for the OLED palette, and the theme is switched from the sidebar user menu (**Theme → Light / Dark / True dark / System default**), with `color-scheme: dark` set so native controls and scrollbars follow.

| Token | Light | Dark | Notes |
|-------|-------|------|-------|
| `primary` | `#075985` | `#7CC7EA` | Brand brightens; 9.3:1 on `surface` |
| `primary-foreground` | `#FFFFFF` | `#052330` | Dark ink on the light-blue button |
| `primary-dark` | `#064663` | `#A9DCF2` | Emphasized text on the tint |
| `primary-light` | `#DCEBF5` | `#14344A` | Selection/active tint becomes deep blue |
| `secondary` | `#0F766E` | `#4FD1C5` | 9.3:1 on `surface` |
| `secondary-foreground` | `#FFFFFF` | `#04211F` | 9.1:1 on `secondary` |
| `secondary-light` | `#E7F5F3` | `#123A38` | Soft teal panel |
| `success` | `#15803D` | `#4ADE80` | 10.0:1 on `surface` |
| `success-light` | `#DCFCE7` | `#0F2E1D` | Deep green tint |
| `success-dark` | `#166534` | `#86EFAC` | 10.5:1 on the tint |
| `warning` | `#B45309` | `#FBBF24` | 10.4:1 on `surface` |
| `warning-light` | `#FEF3C7` | `#3A2A0A` | Deep amber tint |
| `warning-foreground` | `#7C2D12` | `#FDE68A` | 11.1:1 on the tint |
| `danger` | `#B91C1C` | `#F87171` | 6.8:1 on `background` |
| `danger-light` | `#FEE2E2` | `#3B1215` | 5.9:1 vs `danger` |
| `info` | `#0369A1` | `#60A5FA` | 6.9:1 on `surface` |
| `info-light` | `#E0F2FE` | `#102A43` | 5.8:1 vs `info` |
| `background` | `#F6F8FB` | `#0B1220` | Deep navy, never pure black |
| `foreground` | `#0F172A` | `#E6EDF6` | 15.9:1 on `background` |
| `surface` | `#FFFFFF` | `#111A2B` | Cards rise one step, not to black |
| `surface-muted` | `#F1F5F9` | `#16202F` | Sub-surface panels |
| `muted` | `#F1F5F9` | `#18222F` | Hover/disabled wash |
| `muted-foreground` | `#475569` | `#A9B7C9` | 7.9:1 on `muted` |
| `destructive-foreground` | `#FFFFFF` | `#2A0A0C` | 6.6:1 on `danger` |
| `text-primary` | `#0F172A` | `#E6EDF6` | Primary content |
| `text-secondary` | `#475569` | `#A9B7C9` | 8.5:1 on `surface` |
| `text-tertiary` | `#64748B` | `#8494A8` | 6.1:1 on `background` |
| `border` | `#E2E8F0` | `#243244` | Dividers and card rings |
| `border-strong` | `#CBD5E1` | `#33445C` | Inputs and hover borders |
| `input` | `#CBD5E1` | `#33445C` | Aliases `border-strong` |
| `disabled` | `#94A3B8` | `#64748B` | Inactive, contrast-exempt |
| `disabled-bg` | `#F1F5F9` | `#1A2433` | Disabled field background |
| `chart-3` | `#7C3AED` | `#C4B5FD` | 9.4:1 on `surface` |
| `chart-5` | `#BE123C` | `#FB7185` | 6.5:1 on `surface` |

**Contrast verification (dark theme):**

| Pair | Ratio | Result |
|------|-------|--------|
| `foreground` (#E6EDF6) on `background` (#0B1220) | 15.9 : 1 | AAA |
| `foreground` on `surface` (#111A2B) | 14.8 : 1 | AAA |
| `text-secondary` (#A9B7C9) on `surface` | 8.5 : 1 | AAA |
| `text-tertiary` (#8494A8) on `background` | 6.1 : 1 | AA |
| `primary` (#7CC7EA) on `surface` | 9.3 : 1 | AAA |
| `primary` on `primary-light` (#14344A) | 6.9 : 1 | AA |
| `primary-foreground` (#052330) on `primary` | 8.7 : 1 | AAA |
| `secondary` (#4FD1C5) on `surface` | 9.3 : 1 | AAA |
| `secondary-foreground` (#04211F) on `secondary` | 9.1 : 1 | AAA |
| `accent-foreground` (#A9DCF2) on `accent` (#14344A) | 8.8 : 1 | AAA |
| `danger` (#F87171) on `danger-light` (#3B1215) | 5.9 : 1 | AA |
| `destructive-foreground` (#2A0A0C) on `danger` | 6.6 : 1 | AA |
| `success` (#4ADE80) on `surface` | 10.0 : 1 | AAA |
| `success-dark` (#86EFAC) on `success-light` (#0F2E1D) | 10.5 : 1 | AAA |
| `warning` (#FBBF24) on `surface` | 10.4 : 1 | AAA |
| `warning-foreground` (#FDE68A) on `warning-light` (#3A2A0A) | 11.1 : 1 | AAA |
| `info` (#60A5FA) on `surface` | 6.9 : 1 | AA |
| `info` on `info-light` (#102A43) | 5.8 : 1 | AA |
| `muted-foreground` (#A9B7C9) on `muted` (#18222F) | 7.9 : 1 | AAA |
| `disabled` (#64748B) on `surface` | 3.7 : 1 | Exempt (inactive component) |

- **Brighten, don't invert.** `#075985` becomes `#7CC7EA`, not a muddy dark blue: the hue is preserved while luminance flips. The same rule applies to teal and the status triad.
- **Navy, not black.** `#0B1220` background and `#111A2B` cards avoid the halation and crushed-elevation look of pure black. Three surface steps (`background` → `surface` → `surface-muted`) keep depth readable.
- **Soft white text.** `#E6EDF6` reads calmer than `#FFFFFF` and still clears 14:1 on cards.
- **Tints go deep, text goes light.** `primary-light`/`*-light` become desaturated deep versions of their hue; text on them uses the light `-dark`/`-foreground` companion. Never reuse the light-theme tint values.
- **Only raw values are overridden.** Derived aliases (`card`, `popover`, `accent`, `destructive`, `input`, `ring`, `chart-1/2/4`, `sidebar-*`) are `var()` references declared once in `:root`, so they follow the active dark block automatically.

#### 4.1.7 True dark theme

An OLED-oriented alternative for users who want a genuinely black workspace. It is **not** a third brand: the same contract, same semantic token names, with sky blue as the primary accent and a deeper blue as the secondary. The provider sets both `dark` and `true-dark` on `<html>`, so every `dark:` utility still applies; the `.true-dark` block is emitted after `.dark` and overrides only raw values.

| Token | Dark (navy) | True dark | Notes |
|-------|-------------|-----------|-------|
| `primary` | `#7CC7EA` | `#38BDF8` | Sky blue; 9.8:1 on black |
| `primary-foreground` | `#052330` | `#08202E` | 7.8:1 on `primary` |
| `primary-dark` | `#A9DCF2` | `#BAE6FD` | Emphasized text on the tint |
| `primary-light` | `#14344A` | `#0A2432` | Blue selection/active tint |
| `secondary` | `#4FD1C5` | `#60A5FA` | Deeper blue counterweight; 8.3:1 on black |
| `secondary-foreground` | `#04211F` | `#06121F` | 7.4:1 on `secondary` |
| `secondary-light` | `#123A38` | `#0A1B2E` | Blue panel tint |
| `success` | `#4ADE80` | `#34D399` | 10.9:1 on black |
| `success-light` | `#0F2E1D` | `#052E20` | Deep green tint |
| `success-dark` | `#86EFAC` | `#6EE7B7` | 9.7:1 on the tint |
| `warning` | `#FBBF24` | `#FBBF24` | 12.6:1 on black |
| `warning-light` | `#3A2A0A` | `#3A2A0A` | Unchanged from dark |
| `warning-foreground` | `#FDE68A` | `#FDE68A` | 11.1:1 on the tint |
| `danger` | `#F87171` | `#F87171` | 7.6:1 on black |
| `danger-light` | `#3B1215` | `#3B1215` | 5.9:1 vs `danger` |
| `info` | `#60A5FA` | `#7DD3FC` | Sky-300; 12.6:1 on black |
| `info-light` | `#102A43` | `#082F49` | 8.3:1 vs `info` |
| `background` | `#0B1220` | `#000000` | True black |
| `foreground` | `#E6EDF6` | `#E8F2FA` | 18.5:1 on black; blue-tinted white |
| `surface` | `#111A2B` | `#070B0F` | Cards lift just off black |
| `surface-muted` | `#16202F` | `#0C1218` | Sub-surface panels |
| `muted` | `#18222F` | `#0D141B` | Hover/disabled wash |
| `muted-foreground` | `#A9B7C9` | `#A6B8CB` | 9.1:1 on `muted` |
| `destructive-foreground` | `#2A0A0C` | `#2A0A0C` | 6.6:1 on `danger` |
| `text-primary` | `#E6EDF6` | `#E8F2FA` | Primary content |
| `text-secondary` | `#A9B7C9` | `#A6B8CB` | 9.7:1 on `surface` |
| `text-tertiary` | `#8494A8` | `#7E93A8` | 6.6:1 on black |
| `border` | `#243244` | `#1A2732` | Blue-cast dividers |
| `border-strong` | `#33445C` | `#2A3B4A` | Inputs and hover borders |
| `disabled` | `#64748B` | `#5C6E7D` | Inactive, contrast-exempt |
| `disabled-bg` | `#1A2433` | `#111A22` | Disabled field background |
| `chart-3` | `#C4B5FD` | `#C4B5FD` | 11.4:1 on black |
| `chart-5` | `#FB7185` | `#FB7185` | 7.8:1 on black |

**Contrast verification (true dark):**

| Pair | Ratio | Result |
|------|-------|--------|
| `foreground` (#E8F2FA) on `background` (#000000) | 18.5 : 1 | AAA |
| `foreground` on `surface` (#070B0F) | 17.4 : 1 | AAA |
| `text-secondary` (#A6B8CB) on `surface` | 9.7 : 1 | AAA |
| `text-tertiary` (#7E93A8) on `background` | 6.6 : 1 | AA |
| `primary` (#38BDF8) on `background` | 9.8 : 1 | AAA |
| `primary` on `primary-light` (#0A2432) | 7.5 : 1 | AAA |
| `primary-foreground` (#08202E) on `primary` | 7.8 : 1 | AAA |
| `secondary` (#60A5FA) on `background` | 8.3 : 1 | AAA |
| `secondary-foreground` (#06121F) on `secondary` | 7.4 : 1 | AAA |
| `accent-foreground` (#BAE6FD) on `accent` (#0A2432) | 12.1 : 1 | AAA |
| `danger` (#F87171) on `danger-light` (#3B1215) | 5.9 : 1 | AA |
| `destructive-foreground` (#2A0A0C) on `danger` | 6.6 : 1 | AA |
| `success` (#34D399) on `background` | 10.9 : 1 | AAA |
| `success-dark` (#6EE7B7) on `success-light` (#052E20) | 9.7 : 1 | AAA |
| `warning` (#FBBF24) on `background` | 12.6 : 1 | AAA |
| `warning-foreground` (#FDE68A) on `warning-light` (#3A2A0A) | 11.1 : 1 | AAA |
| `info` (#7DD3FC) on `background` | 12.6 : 1 | AAA |
| `info` on `info-light` (#082F49) | 8.3 : 1 | AAA |
| `muted-foreground` (#A6B8CB) on `muted` (#0D141B) | 9.1 : 1 | AAA |
| `disabled` (#5C6E7D) on `surface` | 3.7 : 1 | Exempt (inactive component) |

- **Black is the point.** `#000000` removes the lift of the navy theme for OLED displays and dark rooms. Surfaces step up only a few luminance points (`#070B0D`, `#0C1215`) so cards and sheets still separate from the canvas.
- **Sky-blue primary, deeper blue secondary.** `#38BDF8` is the clinical instrument accent; `#60A5FA` carries secondary actions. Both stay in the blue family, so the theme reads as one deliberate monochrome rather than a mixed palette.
- **Blue-tinted neutrals.** Text, borders, and muted surfaces carry a faint blue cast (`#E8F2FA`, `#A6B8CB`, `#1A2732`) so the theme feels intentional rather than grayscale.
- **Status meaning is stable.** Success/warning/danger keep the same hue family as the navy theme; only the green step shifts. A red badge means the same thing in both dark variants.
- **Layered implementation.** `.dark.true-dark` on `<html>`; `.true-dark` overrides raw tokens only, after `.dark`, so `dark:` utilities and derived aliases continue to work untouched.

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
- Sidebar collapsed width: **64px** (`w-16`); expanded: **256px** (`w-64`).
- TopBar height: **64px** (`h-16`), sticky.
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
| `shadow-focus` | `0 0 0 2px var(--surface), 0 0 0 4px var(--primary)` | Keyboard focus ring on any surface |

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
│ ▸ Header                │ TopBar (TopBar.tsx) — sticky, h-16        │
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
- Active link detection via `useLocation().pathname` (exact match); the active item uses `data-active` with `--sidebar-accent` (#DCEBF5) and `--sidebar-accent-foreground` (#064663), weight 600, plus an inset 2px start rail in `--primary` (mirrored to the right edge in RTL). Hover uses the same tint at lower emphasis so active always reads stronger than hover.
- Nested items ("User Management") use shadcn `<Collapsible>` so they can stay expanded when the sidebar is collapsed.
- Tooltip on collapsed nav: shadcn `<Tooltip>` shows the label on hover/focus.
- HMS logo icon sits at top, with "HealthCore+" next to it. "Health" is in the primary color, while "Core" and "+" in secondary color. The "+" is a superscript on top of "Core". Collapse Button sits on the right side, and replaces the HMS Logo when the sidebar is collapsed.
- Logout uses shadcn `<AlertDialog>` for confirmation → `authStore.logout()` → navigate to `/login`.
- Permission-locked items get a small `Lock` icon and `aria-disabled`.
- User Profile: user profile image (letter placeholder if no image), name & role badge under. user menu on right side on clickable kebab icon
- User menu: shadcn `<DropdownMenu>` with username, role badge, "Settings" stub, an inline **Theme** radio group (Light / Dark / True dark / System default), and "Logout".

**TopBar (TopBar.tsx) behavior**
- Sticky at the top (`sticky top-0 z-30`), 64px tall (`h-16`), `--surface` background with a 1px `--border` bottom edge.
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

Mapped to shadcn `<Button>` variants. Default size is `h-9` (36px); `size="lg"` is `h-10` (40px) for the single primary CTA in dialogs and standalone forms. Icon-only buttons are square and always carry an `aria-label`.

| Variant | Background | Text | Border | Used for |
|---------|------------|------|--------|----------|
| **default** (primary) | `primary` (#075985) | white | none | Save, Submit, Continue (primary CTA) |
| **secondary** | `secondary` (#0F766E) | white | none | Secondary actions, alternative paths |
| **outline** | `background` | `foreground` | `border` | Filter chips, tertiary actions, icon buttons |
| **ghost** | transparent (hover: `muted`) | `foreground` | none | Dropdown triggers, page-level actions, icon buttons |
| **destructive** | `danger`/10 (soft) | `danger` (#B91C1C) | none | Delete, Remove, Discard |
| **link** | transparent | `primary` underline | none | Forgot password, in-text actions |
| **icon** | inherits `outline` / `ghost` | inherits | inherits | Table action buttons — a **size**, not a variant |

- **Hover:** default → `bg-primary/80`; secondary → `color-mix(in oklch, var(--secondary), var(--foreground) 5%)`; outline/ghost → `bg-muted`. Transitions are 150ms, color only.
- **Focus:** 3px `ring-ring/50` with a 1px offset — never removed; keyboard focus must always be visible.
- **Loading:** while a server call is in flight, swap label for `<Loader2 className="animate-spin" />` and disable the button. **Never** rely on color alone to indicate loading.
- **Disabled:** `disabled:opacity-50 disabled:pointer-events-none` (shadcn default). Used for "no permission" and "save with no changes".
- **Destructive separation:** destructive buttons are visually smaller and pushed to the **right** (LTR) of CTA clusters. **Never** the default primary action.
- **Touch target:** minimum `h-9` on desktop; `h-10`/`size="lg"` for touch contexts and primary dialog CTAs.

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

- **Layout:** Centered surface card on `bg-background` (#F6F8FB); HMS logo + product name in the card header; language toggle in the top-right corner of the viewport. The card carries `border-border bg-surface shadow-lg ring-1 ring-foreground/5` — elevation, not a tinted page.
- **Form:** react-hook-form + zod. Two fields: `username` (required), `password` (required, with show/hide toggle using `<Eye>` / `<EyeOff>` Lucide icons). `<FormLabel>` shows red `*` for required; helper text below input.
- **Submit:** `<Button>` with `<Loader2 className="animate-spin" />` while pending; on success, `authStore.login(user, token)` then `navigate('/dashboard')`. **No toast** on success — the route change itself is the confirmation.
- **Error:** Inline `<FormMessage>` below the credential fields; never a modal. The alert uses `border-danger/30 bg-danger-light/40 text-danger`. After 5 failures on the same minute, a Sonner `error` toast is shown ("Account temporarily locked. Try again in a minute.").
- **Background:** flat `bg-background` (#F6F8FB); no gradient or decorative imagery. The white surface card is the only focal layer. Session warnings use `border-warning/40 bg-warning-light/40 text-warning-foreground`.
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

Tailwind v4 replaces `tailwind.config.js` with CSS-first configuration in `src/renderer/src/index.css`. Colors have exactly **one** source of truth: plain CSS variables in `:root`. `@theme inline` only bridges those variables into Tailwind's utility namespace, so `bg-primary` and `--primary` can never drift apart.

```css
@layer base {
  :root {
    --primary: #075985;              /* Deep ocean blue */
    --primary-dark: #064663;
    --primary-light: #DCEBF5;
    --secondary: #0F766E;            /* Teal */
    --accent: var(--primary-light);
    --accent-foreground: var(--primary-dark);
    --background: #F6F8FB;
    --surface: #FFFFFF;
    --border: #E2E8F0;
    --radius: 0.5rem;                /* 8px */
  }
}

@theme inline {
  --color-primary: var(--primary);
  --color-primary-light: var(--primary-light);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-border: var(--border);
}
```

- Core shadcn aliases (`--card`, `--popover`, `--destructive`, `--input`, `--ring`, `--sidebar-*`, charts) are derived from the same variables — never re-declared with their own hex values.
- Status tokens (`--success`, `--warning`, `--danger`, `--info`) and their `-light` / `-dark` / `-foreground` companions live in the same `:root` block.
- Fonts, radius steps, and shadows stay in the non-inline `@theme` block (they are not theme-swapped).
- shadcn primitives consume the semantic variables; application code prefers semantic Tailwind classes (`bg-primary`, `text-secondary`, `border-border`) over raw values. No HSL channel triplets are used — the tokens are hex CSS variables.
- The `.dark` and `.true-dark` blocks re-declare **only raw values** (surfaces, text, brand, status). Aliases defined as `var(--x)` in `:root` — `card`, `popover`, `accent`, `destructive`, `input`, `ring`, `chart-1/2/4`, `sidebar-*` — resolve automatically, so a dark theme never duplicates a hex. Both set `color-scheme: dark`; `.true-dark` is layered after `.dark` so `dark:` utilities keep working.

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
| **0 — Tooling & Scaffold** | Vite + Tailwind v4 + `tsconfig` + `components.json` | Design tokens live in one `:root` block in `index.css`, bridged with `@theme inline`; `cn()` utility canonical |
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
| 9 | **Tailwind v4 health** | `npm run lint` passes; no `red`, `green`, `blue-600`, etc. literals in `.tsx` (only semantic tokens); every color resolves through `:root` with no duplicated declarations between `:root` and `@theme` |
| 10 | **Drop-in maintenance** | Adding a new module is a single new folder under `pages/` + a single entry in `NAV_CONFIG` + a route in `App.tsx`; no global CSS changes |
| 11 | **Dark-mode parity** | Every token pair in §4.1.6 and §4.1.7 meets AA or better; `.dark` / `.true-dark` contain only raw-value overrides (no duplicated aliases or light hexes); charts, borders, menus, and focus rings remain distinguishable in all themes |

---

## 14. Conclusion

This document defines the **design contract** for the HMS frontend: the colors, type, spacing, components, accessibility rules, and motion vocabulary that every page on the React 19 + Tailwind v4 + shadcn/ui renderer must honor. It is paired with **`react_implementation_plan.md`**, which defines the file structure, phases, and engineering sequence that gets us there.

Three principles hold the system together:

1. **Tokens, not literals.** Every color, font, radius, and shadow is named (`primary`, `text-secondary`, `radius-lg`, `shadow-md`). New pages compose tokens — never invent hex codes, paddings, or durations.
2. **Primitives, not custom.** Modal = `<Dialog>` / `<AlertDialog>` / `<Sheet>` (never handcrafted). Toast = Sonner (never `alert()`). Form fields = shadcn `<Form>` + react-hook-form + zod. Customization happens in `components/common/*`, not by forking the shadcn primitive.
3. **Accessibility by default.** Focus rings, color contrast, RTL via logical properties, reduced-motion media query, screen-reader live regions, one `<h1>` per page — every one of these is a guardrail, not a checkbox.

When a page is added, the design review asks: *does it use only tokens from §4, only primitives from §6, and follow the motion and a11y rules from §8–10?* If yes, it ships. The design system is mature not when it's complete (it's never complete), but when adding a new page never requires designing anything new.
