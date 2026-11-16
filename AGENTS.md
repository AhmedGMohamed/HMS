# HMS Agent Guide

Repository: Hospital Management System (HMS) — Electron client + Express/PostgreSQL server + React renderer.

## Quick Start

- `npm install`
- `.env` exists with values (hidden from the LLM for security purposes), with the variables listed in `.ENV-EXAMPLE` (see [Environment](#environment)).
- Ensure PostgreSQL is running and accessible.

## Build & Run

- `npm run build` — Builds the React renderer, compiles Electron and the Express server, then copies Electron assets. Renderer output: `dist-electron/app/renderer`. Server output: `dist-electron/app`. Electron output: `build/electron`.
- `npm run dev:server` — Runs the Express API/server with nodemon + tsx from `src/app/index.ts`.
- `npm run dev:renderer` — Runs Vite on port 5173 and proxies `/api` to the Express server.
- `npm run dev:e` — Runs Electron from `build/electron/main.js` (requires a build first).
- `npm run dev:te` — Builds, then runs Electron.
- `npm run dist` — Builds and packages the Electron client for Windows x64 (MSI) via `electron-builder`.

## Environment

- `.env` is loaded from `src/app/.env` by `src/app/index.ts`; the Electron main process loads its own config.
- Required variables: `NODE_ENV`, `JWT_SECRET`, `PORT`, `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, and their `_TEST` counterparts.
- The server auto-creates the database if it does not exist and runs schema initialization on first start.

## Architecture

- **Server entry:** `src/app/index.ts` — Express app, API routes, health endpoints, static SPA serving, cron jobs.
- **Electron entry:** `src/electron/main.ts` — loads `config.html` or the configured remote `serverUrl`. The MSI does not bundle the Express server.
- **Renderer:** React 19 + Vite 8 + Tailwind v4 + shadcn/Radix under `src/renderer/`. Entry: `src/renderer/src/main.tsx`; routes: `src/renderer/src/App.tsx`.
- **API routes:** `src/app/routes/api.routes.ts` mounts all `/api/*` sub-routers.
- **SPA serving:** `src/app/index.ts` serves `dist-electron/app/renderer` with an Express 5 catch-all. Unknown `/api/*` paths return JSON 404 before the SPA fallback.
- **Database:** `src/app/models/database/connection.ts` uses a `pg` Pool, with separate env vars for test vs default environments.
- **Backend models:** `src/app/models`.
- **Schema/Seeds:** `src/app/utils/setUpDatabase.ts` and `src/app/tests/helpers/db.helper.ts` contain DDL and seed logic. Tests share the schema initialization path.

## Linting & Type Checking

- `npm run lint` — ESLint via `eslint.config.js`; lints `**/*.ts` and `**/*.tsx`, ignores build output.
- `npm run typecheck` — Runs the renderer and server TypeScript configs separately.
- Do **not** run root `tsc --noEmit`; the root config is solution-style and its references have `noEmit: true`.
- Target commands:
  - `npx tsc -p src/renderer/tsconfig.json --noEmit`
  - `npx tsc -p src/app/tsconfig.json --noEmit`

## TypeScript Config

- Root `tsconfig.json` is a solution-style config referencing `tsconfig.app.json` and `tsconfig.node.json`.
- **Electron compile:** `src/electron/tsconfig.json` — outputs to `build/`, targets ES2020, module NodeNext, strict disabled.
- **Server compile:** `src/app/tsconfig.json` — outputs to `dist-electron/app`, strict disabled, includes server tests.
- **Renderer type-check:** `src/renderer/tsconfig.json` — strict, `noUnusedLocals`, no emit.
- **App alias config:** `tsconfig.app.json` — paths `@/*` → `src/renderer/src/*`, includes the renderer source tree.

## Renderer Conventions

- `src/renderer/src/locales/<ns>.<lang>.json` — one file per (namespace, locale).
- **Baked on boot** (static-imported in `i18n.ts`): `common`, `sidebar`, `navigation`, `topbar`, `breadcrumbs`, `breadcrumb`, `userMenu`, `errors`, `auth`, `success`.
- **Lazy per-page:** `login`, `dashboard`, `patients`, `pharmacy`, `services`, `vault`, `reports`, `insurance`, `users`, `roles`, `employees`, `clocking`, `medicalSupplies`, `priceLists`. Pages opt in via `lazyLoadWithNamespace(callbackFn, namespace)`.
- Client route permissions live in `src/renderer/src/lib/routes.ts`; sidebar navigation and filtering live in `src/renderer/src/lib/navigation.ts`.
- Page access is guarded client-side by `PermissionRoute`/`AdminRoute`; API authorization remains server-side.
- `src/renderer/src/components/common/DataTable.tsx` owns table accessibility, sorting, pagination, expansion, and row motion. Reuse it rather than rebuilding tables.
- See `design.md` for visual, accessibility, and motion rules.

## Important Quirks

- Build scripts are sequential. Do not reintroduce parallel `&` steps; `copyDist` must run after compilation.
- `copyDist` only copies Electron assets/views. The renderer is built directly into `dist-electron/app/renderer` by Vite.
- The Express server serves the SPA; Electron loads the remote server URL. There is no legacy HTML page surface.
- Express 5 does not accept `app.get("*")`; the SPA fallback uses `app.get("/{*splat}")`.
- `npm run check-i18n` audits only the React renderer split files. The legacy checker and `src/app/views` were removed in Phase 8.
- Backend jasmine tests compile to `dist-electron/app/tests`; jasmine reads specs from there.

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Build renderer + Electron + server + copy assets |
| `npm run dev:server` | Run Express server with nodemon |
| `npm run dev:renderer` | Run Vite renderer dev server |
| `npm run dev:e` | Run Electron (requires build) |
| `npm run dev:te` | Build then run Electron |
| `npm run dist` | Build + package Windows MSI |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check renderer and server |
| `npm run test:renderer` | Run renderer Vitest suite |
| `npm run check-i18n` | Check renderer translation keys |
