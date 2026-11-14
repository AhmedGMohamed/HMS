# HMS Color & Theme Redesign Plan

Status: Implemented
Scope: Renderer design tokens, component color consumption, PDF palettes, theme switching
Source of truth: `design.md` §4.1 and `src/renderer/src/index.css`

---

## 1. Problem

The original palette drifted between two token layers and produced several
visible defects:

- Duplicate `@theme` hex values were shadowed by a second `@theme inline`
  declaration, so the documented palette was not the rendered palette.
- shadcn's `--accent` was a saturated emerald, turning every menu, select, and
  combobox highlight green with white text.
- Teal `--secondary` (`#00A896`) carried white text at 2.98:1, failing WCAG AA.
- `primary-light` (`#DBEAFE`) was an unrelated blue-100 tint next to a cyan-blue
  primary and teal secondary, making selected rows and avatars feel disconnected.
- The sky-tinted background (`#F0F9FF`) washed the whole workspace blue.
- Sidebar hover and active states shared the same pale tint, so the current page
  was nearly invisible.
- Status colors failed as text on white: success 2.54:1, warning 2.15:1,
  danger 3.76:1.

## 2. Goals

1. One authoritative token source, bridged into Tailwind without duplicated values.
2. A calm clinical identity: deep ocean blue, teal support, neutral paper surfaces.
3. WCAG 2.1 AA for every foreground/background pair used by components.
4. Light, navy dark, and OLED true-dark themes sharing the same semantic contract.
5. Theme selection in the sidebar user menu, persisted and system-aware.
6. No visual regressions in PDF output, which cannot use CSS variables.

## 3. Decisions

### 3.1 Token architecture

- Light values live in `:root` inside `@layer base`.
- Dark values live in `.dark`; OLED values in `.true-dark`.
- `@theme inline` maps every raw variable into Tailwind's `--color-*` namespace.
- Derived aliases (`--card`, `--popover`, `--accent`, `--destructive`, `--input`,
  `--ring`, charts, sidebar) are declared once as `var()` references and follow
  the active theme automatically.
- `@theme` (non-inline) keeps fonts, radius steps, and shadows.
- `.true-dark` is layered on `.dark` so Tailwind `dark:` utilities still apply;
  it is emitted after `.dark` so its raw values win at equal specificity.

### 3.2 Light palette (Deep Ocean + Teal)

| Token | Value | Purpose |
|---|---|---|
| `primary` | `#075985` | Primary actions, active navigation, links |
| `primary-light` | `#DCEBF5` | Selection, hover tint, active sidebar |
| `primary-dark` | `#064663` | Emphasized text on tints |
| `secondary` | `#0F766E` | Secondary actions, wordmark accent |
| `secondary-light` | `#E7F5F3` | Soft teal panels |
| `accent` | `#DCEBF5` | Menu/select highlight (brand tint, not a third hue) |
| `accent-foreground` | `#064663` | Text on accent |
| `success` | `#15803D` | Success text and fills |
| `warning` | `#B45309` | Warning text and fills |
| `warning-foreground` | `#7C2D12` | Text on warning tint |
| `danger` | `#B91C1C` | Destructive actions and errors |
| `info` | `#0369A1` | Informational badges |
| `background` | `#F6F8FB` | Neutral paper workspace |
| `surface` | `#FFFFFF` | Cards, sidebar, top bar |
| `text-primary` | `#0F172A` | Body copy |
| `border` | `#E2E8F0` | Dividers and card rings |

### 3.3 Dark palette (navy)

| Token | Value |
|---|---|
| `background` | `#0B1220` |
| `surface` | `#111A2B` |
| `surface-muted` | `#16202F` |
| `primary` | `#7CC7EA` |
| `primary-light` | `#14344A` |
| `secondary` | `#4FD1C5` |
| `foreground` | `#E6EDF6` |
| `text-secondary` | `#A9B7C9` |
| `border` | `#243244` |

### 3.4 True dark palette (OLED + blue)

| Token | Value |
|---|---|
| `background` | `#000000` |
| `surface` | `#070B0F` |
| `surface-muted` | `#0C1218` |
| `primary` | `#38BDF8` |
| `primary-light` | `#0A2432` |
| `secondary` | `#60A5FA` |
| `info` | `#7DD3FC` |
| `foreground` | `#E8F2FA` |
| `text-secondary` | `#A6B8CB` |
| `border` | `#1A2732` |

### 3.5 Theme switching

- Theme values: `light`, `dark`, `true-dark`, `system`.
- `theme-provider.tsx` persists the choice under the `theme` localStorage key,
  applies `.light` / `.dark` / `.dark .true-dark` to `<html>`, and listens for
  OS changes while in `system` mode.
- The sidebar user menu exposes an inline radio group: Light, Dark, True dark,
  System default.

## 4. Accessibility

All component-used pairs were measured with the WCAG relative-luminance formula.

Light theme highlights:

| Pair | Ratio |
|---|---|
| `text-primary` on `surface` | 17.9:1 |
| `primary` on `surface` | 7.6:1 |
| white on `primary` | 7.6:1 |
| `secondary` / white | 5.5:1 |
| `danger` / white | 6.5:1 |
| `success` / white | 5.0:1 |
| `warning` / white | 5.0:1 |
| `info` / white | 5.9:1 |

Dark and true-dark pairs are documented in `design.md` §4.1.6 and §4.1.7.
Every pair meets AA or better; disabled text is contrast-exempt by WCAG and is
kept recognizably muted.

## 5. Implementation Map

| Area | Files |
|---|---|
| Tokens | `src/renderer/src/index.css` |
| Contract docs | `design.md` §4.1, §4.1.6, §4.1.7, §11.2, §13 |
| Theme state | `src/renderer/src/components/theme-provider.tsx` |
| Theme UI | `src/renderer/src/components/layout/UserMenu.tsx` |
| Translations | `src/renderer/src/locales/userMenu.{en,ar}.json` |
| Contrast regression | `src/renderer/src/components/common/ConfirmDialog.tsx` |
| Hardcoded emerald cleanup | Patient admissions dialogs/cards, print bill dialog |
| PDF parity | `lib/pdf/pdfTheme.ts`, `pages/Patients/print/printBill.ts`, `pages/Vault/print/buildVaultReportPdf.ts` |
| Brand comment | `src/renderer/src/components/icons/HmsLogo.tsx` |

## 6. Verification

- `npm run build` — renderer, Electron, and server compile; Tailwind emits the
  new utilities.
- `npm run typecheck` — renderer and server.
- Targeted ESLint on every touched TS/TSX file.
- Built-CSS inspection: each token appears once, `.dark` precedes `.true-dark`,
  every literal dark token is overridden by `.true-dark`.
- Manual checks: light surfaces, navy dark, OLED true-dark, RTL, menus, tables,
  badges, focus rings, and PDFs.

Repo-wide `npm run lint` still reports pre-existing debt unrelated to this work.

## 7. Follow-ups

- Sonner toasts read `next-themes`, which has no mounted provider; they follow
  the OS rather than the app theme. Fix by sourcing `useTheme` from
  `theme-provider.tsx` and mapping `true-dark` to `dark`.
- PDF palettes are duplicated constants by necessity; keep them synchronized
  with the light `:root` values when the palette changes.
