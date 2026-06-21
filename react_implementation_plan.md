# HMS Frontend Refactor — React 19 + Vite 6 + Tailwind v4 + shadcn/ui
> **Product:** Hospital Management System (HMS) — Electron + Express + PostgreSQL desktop app  
> **Scope:** Live UI/UX design system for the React 19 + Vite 6 + Tailwind v4 + shadcn/ui frontend  
> **Companion document:** `design.md` (design system, principles, tokens, and component standards)
> **Date:** June 2026

### Detailed Implementation Plan (Rev 2)

> **Backend:** Express + PostgreSQL — **completely untouched**
> **Frontend target:** React 19 + Vite 6 + TailwindCSS + shadcn/ui (Radix-based)
> **Dev mode:** Vite dev server in browser; Electron only in production build
> **Auth:** JWT in `auth` cookie (HttpOnly); front-end guards pages; back-end guards `/api/*`

---

## Decisions Confirmed

| # | Decision | Answer |
|---|----------|--------|
| 1 | SPA routing | **Client-side only.** Express serves `index.html` catch-all. Back-end enforces auth on all `/api/*`. |
| 2 | i18n library | **`react-i18next`** — existing `en.json`/`ar.json` keys migrated verbatim |
| 3 | Dev mode | **Browser only.** Vite dev server + Express backend. No Electron during development. |
| 4 | Testing | **Deferred.** Jasmine backend tests remain untouched. |
| 5 | Tailwind Version | **Tailwind v4** (CSS-first `@theme` config). |
| 7 | Dev Proxy | Express runs on port **`3000`** (from `.env`). Vite will proxy `/api` requests to `localhost:3000`. |
| 8 | Auth Storage | **Cookie-only**. The API client will rely on the browser sending the `auth` cookie. No `Authorization: Bearer` header. |
| 9 | Reports Architecture | Each report type is a separate lazy-loaded component, avoiding a monolithic `reports.ts` equivalent. |
| 10 | Nurses Page | **Deprecated.** Will be removed from navigation and not migrated. |
| 11 | Employees Page | Employees page contains Employees, Doctors & Nurses. Each in a separate tab. |
| 11 | Global Search | The backend lacks a unified search endpoint. The top-bar search (`Ctrl+K`) will initially only search navigation links/modules. Entity-specific search remains on individual pages. |

---

## Current State: Key Discoveries From Code Analysis

### Auth Flow
- **Login:** `POST /api/auth/login` → sets `auth` HttpOnly cookie + returns `{ user, token }` in JSON body
- **Current client:** Stores `token` + `user` object in `localStorage`; sends `Authorization: Bearer <token>` header
- **Server middleware:** Checks `auth` cookie first → then `Authorization` header as fallback
- **Verify:** `GET /api/auth/verify` — confirms token validity, returns decoded user payload
- **Logout:** Client clears `localStorage`, server cookie expires on its own (or we call a logout endpoint)

### Navigation
The server exposes `GET /navigation` returning a filtered nav tree based on the user's role/permissions. In React, we replicate this logic client-side using the user from the auth store — avoiding an extra network round-trip on every navigation.

### i18n
- Current: Custom `i18n` class with `.t(key)`, `.formatDate()`, `.formatCurrency()`, `.isRTL()`
- Language stored in `localStorage` key `lang`; RTL triggered via `document.dir = 'rtl'`
- All keys in flat dot-notation format (e.g., `"sidebar.dashboard"`, `"common.save"`)
- React migration: `react-i18next`'s `t('sidebar.dashboard')` is a 1-to-1 replacement

---

## Final Architecture

```
d:\Work\HMS\
├── src/
│   ├── app/              ← EXPRESS BACKEND (only index.ts + page.routes.ts change)
│   │   ├── index.ts      ← Add static serve of dist-renderer/ + SPA catch-all
│   │   ├── routes/
│   │   │   └── page.routes.ts  ← Remove individual page routes; keep /navigation
│   │   └── ... (all other files unchanged)
│   ├── electron/         ← UNCHANGED
│   └── renderer/         ← NEW: entire React + Vite frontend
│       ├── index.html
│       ├── vite.config.ts
│       ├── components.json    ← shadcn/ui config
│       ├── tsconfig.json
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── index.css
│           ├── i18n.ts
│           ├── components/
│           │   ├── ui/           ← shadcn/ui auto-generated primitives
│           │   ├── layout/
│           │   │   ├── AppShell.tsx
│           │   │   ├── Sidebar.tsx
│           │   │   └── TopBar.tsx
│           │   └── common/
│           │       ├── DataTable.tsx
│           │       ├── ConfirmDialog.tsx
│           │       ├── EmptyState.tsx
│           │       └── PageHeader.tsx
│           ├── pages/
│           │   ├── Login/LoginPage.tsx
│           │   ├── Dashboard/
│           │   ├── Patients/
│           │   ├── Pharmacy/
│           │   ├── Employees/
│           │   ├── Vault/
│           │   ├── Insurance/
│           │   ├── Reports/      ← Split into lazy-loaded types
│           │   ├── Admin/
│           │   ├── Services/
│           │   └── PriceLists/
│           ├── hooks/
│           │   ├── usePermission.ts
│           │   └── usePDF.ts
│           ├── store/
│           │   ├── authStore.ts    ← Zustand: user, isAuthenticated, token
│           │   └── uiStore.ts      ← Zustand: sidebarCollapsed, language
│           ├── lib/
│           │   ├── api.ts          ← Base fetch wrapper
│           │   ├── navigation.ts   ← Client-side nav config
│           │   └── utils.ts        ← cn(), formatCurrency(), formatDate()
│           ├── types/index.ts
│           └── locales/
│               ├── en.json
│               └── ar.json
└── package.json  ← updated scripts + dependencies
```

---

## Proposed Changes — Phase by Phase

---

### Phase 0 — Tooling & Project Scaffold

#### [MODIFY] package.json

New scripts:
```json
"dev:server": "nodemon src/app/index.ts",
"dev:renderer": "vite --config src/renderer/vite.config.ts",
"build:renderer": "vite build --config src/renderer/vite.config.ts",
"build": "npm run build:renderer && tsc --project ./src/electron/tsconfig.json && npm run copyDist"
```

New **dependencies**
- `react`, `react-dom`
- `react-router-dom`
- `lucide-react`
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `zustand`
- `react-hook-form`, `@hookform/resolvers`, `zod`
- `react-i18next`, `i18next`, `i18next-browser-languagedetector`
- `sonner` (toast notifications)
- `@radix-ui/*` (installed via shadcn CLI)

New **devDependencies:**
- `vite`, `@vitejs/plugin-react`
- `@types/react`, `@types/react-dom`
- `tailwindcss`, `@tailwindcss/vite` (v4)
- `concurrently`

Remove after migration is complete:
- `bootstrap`, `@popperjs/core`, `toastr`, `sweetalert2`

Keep:
- `chart.js`, `pdfmake`, `@digicole/pdfmake-rtl` (wrapped in React components/hooks)

#### [NEW] `src/renderer/` — Vite project root

**`src/renderer/vite.config.ts`**
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:<PORT>', changeOrigin: true },
      '/navigation': { target: 'http://localhost:<PORT>', changeOrigin: true },
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../dist-renderer'),
    emptyOutDir: true,
  }
})
```

**`src/renderer/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

**`src/renderer/components.json`** — generated by `npx shadcn@latest init`

---

### Phase 1 — Design System

#### [NEW] `src/renderer/src/index.css`
```css
@import "tailwindcss";   /* Tailwind v4 */

/* Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap');

@theme {
  /* Colors — from design.md */
  --color-primary: #0077B6;
  --color-primary-light: #DBEAFE;
  --color-primary-dark: #005A8C;
  --color-secondary: #00A896;
  --color-secondary-light: #CCFBF1;
  --color-accent: #059669;
  --color-success: #10B981;
  --color-success-light: #D1FAE5;
  --color-warning: #F59E0B;
  --color-warning-light: #FEF3C7;
  --color-danger: #EF4444;
  --color-danger-light: #FEE2E2;
  --color-background: #F0F9FF;
  --color-surface: #FFFFFF;
  --color-text-primary: #0F172A;
  --color-text-secondary: #475569;
  --color-border: #E2E8F0;
  --color-disabled: #94A3B8;

  /* Typography */
  --font-sans: 'Inter', 'Noto Sans Arabic', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08);
  --shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1);
}

/* shadcn/ui CSS variable overrides */
:root {
  --background: 240 100% 97%;          /* --color-background in HSL */
  --foreground: 222 47% 11%;
  --primary: 201 100% 36%;
  --primary-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --border: 214 32% 91%;
  --radius: 0.5rem;
}

/* RTL support */
[dir="rtl"] {
  font-family: 'Noto Sans Arabic', 'Inter', sans-serif;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

#### [NEW] `src/renderer/src/lib/utils.ts`
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, locale = 'ar-EG'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' }).format(amount)
}

export function formatDate(date: Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US').format(date)
}

export function formatDateTime(date: Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'short', timeStyle: 'short'
  }).format(date)
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
```

#### [NEW] `src/renderer/src/types/index.ts`
```ts
export interface User {
  userId: number;
  username: string;
  role: string;
  permissions: string[];
}

export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  url?: string;
  permission?: string;
  role?: string;
  children?: NavigationItem[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Patient, Bill, Drug, Employee, etc. — extracted from existing .ts files during migration
```

#### shadcn/ui CLI — install all components
```bash
cd src/renderer
npx shadcn@latest init
npx shadcn@latest add button input select dialog table card badge dropdown-menu tooltip tabs separator sheet sonner scroll-area avatar skeleton command popover calendar checkbox radio-group switch progress alert breadcrumb pagination form label textarea collapsible alert-dialog
```

---

### Phase 2 — State Management, API Client & Routing

#### [NEW] `src/renderer/src/store/authStore.ts`
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null;
  token: string | null;       // kept for Option A; null if Option B (cookie-only)
  isAuthenticated: boolean;
  login: (user: User, token?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token: token ?? null, isAuthenticated: true }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    { name: 'hms-auth' }
  )
)
```

#### [NEW] `src/renderer/src/store/uiStore.ts`
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean;
  language: 'en' | 'ar';
  toggleSidebar: () => void;
  setLanguage: (lang: 'en' | 'ar') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      language: 'en',
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setLanguage: (lang) => set({ language: lang }),
    }),
    { name: 'hms-ui' }
  )
)
```

#### [NEW] `src/renderer/src/lib/api.ts`
```ts
import { useAuthStore } from '@/store/authStore'

const BASE = '/api'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',  // sends auth cookie automatically
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...init,
  })

  if (res.status === 401) {
    useAuthStore.getState().logout()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json()
}

export const api = {
  get:    <T>(path: string)                    => request<T>(path),
  post:   <T>(path: string, body: unknown)     => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)     => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)                    => request<T>(path, { method: 'DELETE' }),
}
```

#### [NEW] `src/renderer/src/hooks/usePermission.ts`
```ts
import { useAuthStore } from '@/store/authStore'

export function usePermission() {
  const user = useAuthStore((s) => s.user)

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (user.role === 'Admin') return true
    return user.permissions.includes(permission)
  }

  const isAdmin = (): boolean => user?.role === 'Admin' ?? false

  return { hasPermission, isAdmin, user }
}
```

#### [NEW] `src/renderer/src/i18n.ts`
```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import ar from './locales/ar.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'lang',
    },
    interpolation: { escapeValue: false },
  })

export default i18n
```

#### [NEW] `src/renderer/src/lib/navigation.ts`
```ts
import type { NavigationItem } from '@/types'

// Client-side nav config — mirrors Navigation.controller.ts logic
// Icons use Lucide React component names (string)
export const NAV_CONFIG: NavigationItem[] = [
  { id: 'dashboard',       label: 'sidebar.dashboard',      icon: 'LayoutDashboard', url: '/dashboard' },
  { id: 'user_management', label: 'sidebar.userManagement', icon: 'Users',           role: 'Admin',
    children: [
      { id: 'users', label: 'sidebar.users', icon: 'User',   url: '/admin/users' },
      { id: 'roles', label: 'sidebar.roles', icon: 'Shield', url: '/admin/roles' },
    ]
  },
  { id: 'patients',    label: 'sidebar.patients',    icon: 'Hospital',       url: '/patients',    permission: 'manage_patients'  },
  { id: 'employees',   label: 'sidebar.employees',   icon: 'BadgeCheck',     url: '/employees',   permission: 'manage_employees' },
  { id: 'clocking',    label: 'sidebar.clocking',    icon: 'Clock',          url: '/clocking',    permission: 'manage_clocking'  },
  { id: 'services',    label: 'sidebar.services',    icon: 'ClipboardPulse', url: '/services',    permission: 'manage_services'  },
  { id: 'pharmacy',    label: 'sidebar.pharmacy',    icon: 'Pill',           url: '/drugs',       permission: 'manage_pharmacy'  },
  { id: 'supplies',    label: 'sidebar.supplies',    icon: 'Package',        url: '/supplies',    permission: 'manage_pharmacy'  },
  { id: 'price_lists', label: 'sidebar.priceLists',  icon: 'Tag',            url: '/price-lists', permission: 'manage_prices'    },
  { id: 'insurance',   label: 'sidebar.insurance',   icon: 'ShieldCheck',    url: '/insurance',   permission: 'manage_insurance' },
  { id: 'vault',       label: 'sidebar.vault',       icon: 'Vault',          url: '/vault',       permission: 'view_vault'       },
  { id: 'reports',     label: 'sidebar.reports',     icon: 'FileText',       url: '/reports',     permission: 'view_reports'     },
]
```

#### [NEW] `src/renderer/src/main.tsx`
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import './i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  </React.StrictMode>
)
```

#### [NEW] `src/renderer/src/App.tsx`
```tsx
import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useUIStore } from '@/store/uiStore'
import i18n from './i18n'
// ... lazy imports for all page components

// RTL sync effect
function RTLSync() {
  const language = useUIStore((s) => s.language)
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = language
    i18n.changeLanguage(language)
  }, [language])
  return null
}

export default function App() {
  return (
    <>
      <RTLSync />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<PrivateRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard"   element={<DashboardPage />} />
            <Route path="/patients"    element={<PermissionRoute p="manage_patients"><PatientsPage /></PermissionRoute>} />
            <Route path="/drugs"       element={<PermissionRoute p="manage_pharmacy"><DrugsPage /></PermissionRoute>} />
            <Route path="/supplies"    element={<PermissionRoute p="manage_pharmacy"><SuppliesPage /></PermissionRoute>} />
            <Route path="/employees"   element={<PermissionRoute p="manage_employees"><EmployeesPage /></PermissionRoute>} />
            <Route path="/doctors"     element={<PermissionRoute p="manage_employees"><DoctorsPage /></PermissionRoute>} />
            <Route path="/nurses"      element={<PermissionRoute p="manage_employees"><NursesPage /></PermissionRoute>} />
            <Route path="/clocking"    element={<PermissionRoute p="manage_clocking"><ClockingPage /></PermissionRoute>} />
            <Route path="/vault"       element={<PermissionRoute p="view_vault"><VaultPage /></PermissionRoute>} />
            <Route path="/insurance"   element={<PermissionRoute p="manage_insurance"><InsurancePage /></PermissionRoute>} />
            <Route path="/reports"     element={<PermissionRoute p="view_reports"><ReportsPage /></PermissionRoute>} />
            <Route path="/services"    element={<PermissionRoute p="manage_services"><ServicesPage /></PermissionRoute>} />
            <Route path="/price-lists" element={<PermissionRoute p="manage_prices"><PriceListsPage /></PermissionRoute>} />
            <Route path="/admin/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
            <Route path="/admin/roles" element={<AdminRoute><RolesPage /></AdminRoute>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
```

**Route guard components:**

`PrivateRoute` — Reads `authStore.isAuthenticated`. On app load, calls `GET /api/auth/verify` once to re-validate the stored token. If invalid → `logout()` + redirect to `/login`.

`PermissionRoute` — Uses `usePermission().hasPermission(p)`. If false → redirect to `/dashboard` with a Sonner toast.

`AdminRoute` — Uses `usePermission().isAdmin()`. If false → redirect to `/dashboard`.

---

### Phase 3 — App Shell Components

#### [NEW] `src/renderer/src/components/layout/AppShell.tsx`
```tsx
// Grid layout: sidebar (fixed) | main (flex-col)
// Main: TopBar (sticky h-16) + scrollable content area (<Outlet />)
// Sidebar width transitions: w-64 expanded ↔ w-16 collapsed (icon-only)
// RTL: sidebar switches side via CSS logical properties (inline-start)
```

#### [NEW] `src/renderer/src/components/layout/Sidebar.tsx`

Key implementation details:
- Filters `NAV_CONFIG` using `usePermission()` at render time
- `useLocation()` for active link detection — exact match on `location.pathname`
- shadcn `Collapsible` for "User Management" nested items
- **Collapsed (w-16):** Only icons visible; `Tooltip` on hover shows label
- **Expanded (w-64):** Icon + label; `CollapsibleContent` for nested items
- Mini profile at top: user initials `Avatar`, username + role (hidden when collapsed)
- Collapse button at bottom (`PanelLeftClose` / `PanelLeftOpen` Lucide icon)
- Logout: opens shadcn `AlertDialog` for confirmation → calls `authStore.logout()` → navigate to `/login`
- RTL: uses `ms-` (margin-inline-start) Tailwind classes instead of `ml-`

#### [NEW] `src/renderer/src/components/layout/TopBar.tsx`

Key implementation details:
- **Breadcrumb:** Auto-generated from `useLocation()` + a route-to-label map; uses shadcn `Breadcrumb`
- **Language toggle:** Button with current language flag/code → calls `uiStore.setLanguage()`
- **User menu:** shadcn `DropdownMenu` with username, role badge, "Settings" (stub), "Logout"
- **Search:** (Phase 8) shadcn `Command` dialog; hotkey `Ctrl+K`

---

### Phase 4 — Shared Component Library

#### [NEW] `src/renderer/src/components/common/DataTable.tsx`

```ts
interface ColumnDef<T> {
  key: string;
  header: string;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (p: number) => void };
  onRowClick?: (row: T) => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  actions?: (row: T) => React.ReactNode;
}
```

Internals:
- shadcn `<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableCell>`
- Skeleton rows (shadcn `<Skeleton>`) while `loading = true`
- `<EmptyState>` component when `data.length === 0`
- Sort: `useState` for `{ key, direction }`, local sort for client-side data
- `<Pagination>` from shadcn at bottom-right
- `actions` slot renders on each row (view, edit, delete icon buttons)

#### [NEW] `src/renderer/src/components/common/PageHeader.tsx`
```tsx
// Props: title (string), subtitle?, actions (ReactNode)
// Always renders <h1> for accessibility
// Divider below
```

#### [NEW] `src/renderer/src/components/common/ConfirmDialog.tsx`
```tsx
// Wrapper around shadcn AlertDialog
// Props: open, onOpenChange, title, description, onConfirm, variant
// variant = 'danger' → red confirm button; 'warning' → amber
// Replaces all SweetAlert2 confirm dialogs
```

#### [NEW] `src/renderer/src/components/common/EmptyState.tsx`
```tsx
// Inline SVG illustration + title + optional action button
// Used in DataTable and any empty-list scenario
```

#### Chart wrappers
`src/renderer/src/components/charts/RevenueLineChart.tsx` — Chart.js line chart, typed props, design token colors, RTL-aware legend
`src/renderer/src/components/charts/DonutChart.tsx` — Chart.js doughnut chart wrapper

---

### Phase 5 — i18n Migration

#### [NEW] `src/renderer/src/locales/en.json` + `ar.json`
Copy from `src/app/views/locales/en.json` and `ar.json` verbatim.
No key renaming — `t('sidebar.dashboard')` works identically in `react-i18next`.

Any keys missing for new React-specific UI (e.g., `"auth.sessionExpired"` toasts) are added during page migration.

#### Language toggle implementation
```ts
// In TopBar or wherever the toggle lives:
const handleLanguageChange = (lang: 'en' | 'ar') => {
  uiStore.setLanguage(lang)  // Zustand (persisted to localStorage as 'hms-ui')
  // RTLSync in App.tsx watches this and updates document.dir + i18n.changeLanguage()
}
```

#### Formatting
Replace `i18n.formatCurrency()`, `i18n.formatDate()` etc. with `lib/utils.ts` functions, passing `uiStore.language` as the locale.

---

### Phase 6 — Page Migration

> **Pattern for each page:**
> 1. Define types in `types/index.ts`
> 2. Create page-specific API hook (e.g., `usePatients.ts`) using `api.*` calls
> 3. Build page component with DataTable + Dialogs
> 4. Route already registered in `App.tsx`

---

#### 6.1 Login Page

**Route:** `/login` — public  
**API:** `POST /api/auth/login`  
**Replaces:** `login.html`, `login.ts`, `login.css`

```
LoginPage.tsx
  - Centered full-screen layout, surface card, HMS logo/title
  - react-hook-form + zod: username (required), password (required)
  - Submit → POST /api/auth/login
  - Success: authStore.login(user, token) → navigate('/dashboard')
  - Error: inline error message below form (no modal)
  - Language toggle in top-right corner (no sidebar)
  - Loading spinner on submit button while pending
```

---

#### 6.2 Dashboard Page

**Route:** `/dashboard` — any authenticated user  
**APIs:**
- `GET /api/dashboard/admin-statistics`
- `GET /api/dashboard/user-statistics`
- `GET /api/dashboard/chart-data`
- `GET /api/logs/page/1`

**Replaces:** `dashboard.html`, `dashboard.ts`, `dashboard.css`, `dashboard-rtl.css`

```
DashboardPage.tsx
  └─ if hasPermission('view_dashboard'):
       AdminDashboard.tsx
         - StatCards: active patients, today revenue, today profit, low stock, near expiry
         - RevenueLineChart.tsx (revenue + profit datasets, last 30 days)
         - DonutChart.tsx (patient services vs pharmacy; revenue/profit toggle)
         - RecentActivityTable.tsx (last 10 audit log entries)
  └─ else:
       UserDashboard.tsx
         - StatCards: active patients, low stock, near expiry
         - FeatureGrid.tsx: card links for permitted modules (from NAV_CONFIG filtered by permissions)
```

---

#### 6.3 Patients Page *(Very High Complexity)*

**Route:** `/patients`  
**APIs:**
- `GET /api/patients` (list, search, pagination)
- `POST /api/patients` (create)
- `PUT /api/patients/:id` (update)
- `DELETE /api/patients/:id`
- `GET /api/bills` / `POST /api/bills` / `PUT /api/bills/:id`
- `GET /api/services` (for billing items)
- `GET /api/pharmacy/drugs/shipments` (for billing items)
- `GET /api/pharmacy/medical-supply-shipments` (for billing items)
- `GET /api/insurance-companies`
- `GET /api/price-lists`

**Replaces:** `patients/patients.html` (76K), `js/patients/patients.ts` (173K), `js/patients/printBillManager.ts`, `css/patients.css`, `css/patients-rtl.css`

```
PatientsPage.tsx
  - DataTable: columns: patient ID, name, status badge, room, admission date, actions
  - Search bar (name or ID)
  - "Register Patient" button → opens PatientRegistrationWizard
  - Row actions: View (opens PatientDetailSheet), Edit, Discharge, Bill

PatientRegistrationWizard.tsx
  - shadcn Dialog (full-width, max-w-3xl)
  - Stepper indicator (4 steps shown at top)
  - Step 1: Demographics — name (AR + EN), DOB, gender, national ID
  - Step 2: Contact — phone, address, city
  - Step 3: Emergency Contact — name, relationship, phone
  - Step 4: Insurance — insurance company picker (Select), policy number, expiry date
  - Each step validates independently with zod before Next is enabled
  - Back/Next/Submit navigation; Submit calls POST /api/patients

PatientDetailSheet.tsx
  - shadcn Sheet (right side, wide)
  - Tabs: Info | Bills | Medical History
  - "Edit" button → opens PatientRegistrationWizard in edit mode (pre-filled)

BillingDialog.tsx
  - shadcn Dialog (max-w-5xl, two-pane layout)
  - Left pane: Add bill items (services / drugs / supplies tabs), quantity, price
  - Right pane: patient summary, itemized list, subtotal, discount input, VAT, total (all live-updated)
  - "Payment" step: second screen within dialog (payment method, amount received, change due)
  - "Generate Receipt" → usePDF() → pdfmake-rtl PDF

usePDF.ts hook
  - Wraps pdfmake-rtl for bill receipt generation
  - Accepts structured bill data, generates RTL-compatible PDF
```

---

#### 6.4 Pharmacy — Drugs

**Route:** `/drugs`  
**APIs:** `/api/pharmacy/drugs/cards`, `/shipments`, `/transactions`, `/usages`, `/api/warehouse`  
**Replaces:** `pharmacy/drugs.html`, `js/pharmacy/drugs.ts` (71K), `css/pharmacy.css`, `css/pharmacy-rtl.css`

```
DrugsPage.tsx
  - DataTable: drug name (AR + EN), category, current stock, expiry status badge
  - Low-stock rows highlighted with amber/red dot badge
  - Expandable row or side Sheet for shipment details
  - Actions: Add Drug Card, Add Shipment, Record Usage, View Transactions

ShipmentTimeline.tsx (optional for Phase 7 polish)
  - Visual CSS-based timeline of shipments and expiry dates
```

---

#### 6.5 Pharmacy — Supplies

**Route:** `/supplies`  
**APIs:** `/api/pharmacy/medical-supplies`, `/shipments`, `/usages`  
**Replaces:** `pharmacy/supplies.html`, `js/pharmacy/supplies.ts` (36K)

Similar structure to Drugs page. Shared `DataTable` with different columns.

---

#### 6.6 Employees, Doctors, Nurses

**Routes:** `/employees`, `/doctors`, `/nurses`  
**APIs:** `/api/employees`, `/api/doctors`, `/api/employee-payments`  
**Replaces:** `js/employees/employees.ts` (45K), `doctors.ts` (28K), `css/employees.css`, `css/employees-rtl.css`

```
EmployeesPage.tsx / DoctorsPage.tsx / NursesPage.tsx
  - All three share EmployeeDataTable (slightly different columns per type)
  - Add/Edit Employee Dialog (react-hook-form): name, role, department, salary, hire date
  - Payment History tab in Employee Detail Sheet
```

---

#### 6.7 Clocking

**Route:** `/clocking`  
**APIs:** `/api/clock-ins`  
**Replaces:** `js/employees/clocking.ts` (19K), `css/clocking.css`

```
ClockingPage.tsx
  - Date range filter (DatePicker from shadcn)
  - DataTable: employee, date, clock-in time, clock-out time, hours worked
  - Manual entry dialog for corrections
```

---

#### 6.8 Vault

**Route:** `/vault`  
**APIs:** `/api/vault/*`  
**Replaces:** `js/vault/vault.ts` (41K), `css/vault.css`

```
VaultPage.tsx
  - Summary cards: total revenue, total expenses, net profit
  - Transactions DataTable with date-range filter
  - Category breakdown (services vs pharmacy vs other)
```

---

#### 6.9 Insurance

**Route:** `/insurance`  
**APIs:** `/api/insurance-companies/*`  
**Replaces:** `insurance/insurance.html`, `css/insurance.css`, `css/insurance-rtl.css`

```
InsurancePage.tsx
  - Insurance companies DataTable: name, coverage type, contact, active patients count
  - Add/Edit Dialog: company name (AR + EN), coverage type, discount rate, contact info
  - Detail Sheet: covered patients, claims history
```

---

#### 6.10 Reports *(Very High Complexity)*

**Route:** `/reports`  
**APIs:** `/api/reports/*` (many sub-routes, enumerated during migration)  
**Replaces:** `reports/reports.html`, `js/reports/reports.ts` (242K), `css/reports.css`

```
ReportsPage.tsx
  - Left panel: report type selector (list of report categories)
  - Right panel: ReportLayout.tsx (shared frame for all report types)

ReportLayout.tsx
  - Date range picker (shadcn Calendar / DatePicker)
  - Dynamic filter area (populated by each report type component)
  - Results area (DataTable or Chart depending on report)
  - Export button → usePDF()

Reports/types/ (one file per report type, code-split via React.lazy):
  - PatientReport.tsx
  - RevenueReport.tsx
  - PharmacyReport.tsx
  - EmployeeReport.tsx
  - VaultReport.tsx
  - (additional types discovered from reports.ts analysis during migration)
```

---

#### 6.11 Admin — Users & Roles

**Routes:** `/admin/users`, `/admin/roles`  
**APIs:** `/api/users/*`, `/api/roles/*`, `/api/permissions`  
**Replaces:** `admin/users.html`, `admin/roles.html`, `js/admin/users.ts` (12K), `js/admin/roles.ts` (13K), `css/admin.css`, `css/admin-rtl.css`

```
UsersPage.tsx
  - DataTable: username, role, last login, active status
  - Add/Edit User Dialog: username, password (create only), role Select
  - Deactivate toggle (Switch)

RolesPage.tsx
  - DataTable: role name, permission count, user count
  - Add/Edit Role Dialog: role name + Checkbox group of all permissions
  - Permission list fetched from GET /api/permissions
```

---

#### 6.12 Services & Price Lists

**Routes:** `/services`, `/price-lists`  
**APIs:** `/api/services/*`, `/api/price-lists/*`  
**Replaces:** corresponding HTML/CSS files (no significant JS found)

```
ServicesPage.tsx  — DataTable + Add/Edit Dialog (service name AR+EN, category, base price)
PriceListsPage.tsx — DataTable + Add/Edit Dialog (list name, effective date, pricing rules)
```

---

### Phase 7 — Express Integration

#### [MODIFY] `src/app/index.ts`
```ts
import path from 'path'

// Add BEFORE apiRoutes:
const rendererDist = path.join(__dirname, '../../dist-renderer')
app.use(express.static(rendererDist))

// Replace the old static middlewares for /css, /js, /locales (remove them):
// app.use('/css', ...)  ← DELETE
// app.use('/js', ...)   ← DELETE
// app.use('/locales', ...) ← DELETE

// Replace 404 catch-all with SPA catch-all:
app.get('*', (req, res) => {
  // API routes are handled before this — this only catches page routes
  res.sendFile(path.join(rendererDist, 'index.html'))
})
```

#### [MODIFY] `src/app/routes/page.routes.ts`
Remove all individual `sendFile` page routes. Keep only the `/navigation` route (may still be useful for Electron/direct server usage; can be removed later if fully replaced client-side).

#### [MODIFY] `package.json` — update `copyDist`
```json
"copyDist": "... existing commands ... && copyfiles -u 2 ./dist-renderer/**/* ./dist-electron/renderer"
```

---

### Phase 8 — Polish, Accessibility & Cleanup

#### Animations
- **Page transitions:** `animate-in fade-in-0 duration-150` on page `<main>` wrapper
- **Sidebar:** `transition-all duration-200 ease-in-out` on width classes
- **DataTable rows:** CSS `@keyframes slideIn` with `animation-delay: calc(var(--row-index) * 50ms)`
- **Dialogs:** shadcn Dialog uses built-in `data-[state=open]:animate-in` — already handled
- **Toasts:** Sonner handles slide-in from right (LTR) / left (RTL) automatically
- **Skeleton loaders:** shadcn `<Skeleton>` on all loading states in DataTable and cards

#### Accessibility checklist
- [ ] All Radix/shadcn components: ARIA-compliant by default
- [ ] `PageHeader` always has one `<h1>` per page
- [ ] DataTable: `<caption>`, `<th scope="col">`, `aria-sort` on sortable headers
- [ ] All icon-only buttons have `aria-label`
- [ ] Dialogs: focus trapped; `Escape` closes; focus restored on close
- [ ] `aria-live="polite"` on Sonner toast region (handled by Sonner)
- [ ] All form inputs have associated `<label>` elements

#### Final cleanup
- Delete `src/app/views/css/` (18 CSS files)
- Delete `src/app/views/js/` (all vanilla TS)
- Delete all `*.html` in `src/app/views/`
- Delete `src/app/check-i18n-keys.js` (or port to check React locale files)
- Remove from `package.json`: `bootstrap`, `@popperjs/core`, `toastr`, `sweetalert2`
- Remove `@types/toastr` from devDependencies
- Run `npm run lint` and fix all TypeScript errors

---

## Route Permission Map

| Route | Guard | Required |
|-------|-------|----------|
| `/login` | Public | — |
| `/dashboard` | `PrivateRoute` | any authenticated user |
| `/patients` | `PermissionRoute` | `manage_patients` |
| `/drugs` | `PermissionRoute` | `manage_pharmacy` |
| `/supplies` | `PermissionRoute` | `manage_pharmacy` |
| `/employees` | `PermissionRoute` | `manage_employees` |
| `/doctors` | `PermissionRoute` | `manage_employees` |
| `/nurses` | `PermissionRoute` | `manage_employees` |
| `/clocking` | `PermissionRoute` | `manage_clocking` |
| `/vault` | `PermissionRoute` | `view_vault` |
| `/insurance` | `PermissionRoute` | `manage_insurance` |
| `/reports` | `PermissionRoute` | `view_reports` |
| `/services` | `PermissionRoute` | `manage_services` |
| `/price-lists` | `PermissionRoute` | `manage_prices` |
| `/admin/users` | `AdminRoute` | `role === 'Admin'` |
| `/admin/roles` | `AdminRoute` | `role === 'Admin'` |

---

## Dev Workflow (No Electron Required)

```bash
# Terminal 1 — Express API server
npm run dev:server     # nodemon src/app/index.ts on .env PORT

# Terminal 2 — Vite React dev server
npm run dev:renderer   # http://localhost:5173
                       # /api/* proxied to Express automatically
```

Open `http://localhost:5173` in the browser. Hot module replacement (HMR) is active for all React code changes. Backend changes require nodemon restart (automatic).

## Production Build

```bash
npm run build          # 1) vite build → dist-renderer/
                       # 2) tsc → dist-electron/
                       # 3) copyDist → combines into dist-electron/
npm run dev:e          # Electron loads from configured serverUrl (Express)
                       # Express serves dist-renderer/ as static files
```

---

## Phased Timeline

| Phase | Scope | Estimated Days |
|-------|-------|---------------|
| 0 | Tooling, Vite scaffold, shadcn init | 0.5 |
| 1 | Design system (CSS, tokens, utils, types) | 1 |
| 2 | Auth store, API lib, i18n, routing skeleton | 1.5 |
| 3 | App shell: Sidebar, TopBar, AppShell, route guards | 2 |
| 4 | Shared components: DataTable, PageHeader, charts | 2 |
| 5 | i18n migration (copy + validate all keys) | 0.5 |
| 6a | Login + Dashboard | 1.5 |
| 6b | Patients (wizard + billing — most complex) | 4 |
| 6c | Pharmacy: Drugs + Supplies | 2 |
| 6d | Employees + Clocking | 2 |
| 6e | Vault | 1.5 |
| 6f | Insurance | 1 |
| 6g | Reports (split by type, lazy-loaded) | 3 |
| 6h | Admin: Users + Roles | 1 |
| 6i | Services + Price Lists | 1 |
| 7 | Express integration + production build | 1 |
| 8 | Polish, accessibility, animations, cleanup | 2 |
| **Total** | | **~28 days** |
