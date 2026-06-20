# HMS Agent Guide

Repository: Hospital Management System (HMS) — Electron + Express + PostgreSQL desktop app.

## Quick Start

- `npm install`
- `.env` exists with values (hidden from the LLM for security purposes), with the variables listed in `.ENV-EXAMPLE` (see [Environment](#environment)).
- Ensure PostgreSQL is running and accessible.

## Build & Run

- `npm run build` — Compiles Electron (`src/electron/tsconfig.json`) **and** copies assets via `copyDist`. Output: `dist-electron/`.
- `npm run dev:e` — Runs Electron from `dist-electron/electron/main.js` (requires build first).
- `npm run dev:te` — Builds, then runs Electron.
- `npm run dist` — Builds and packages Electron app for Windows x64 (MSI) via `electron-builder`.

## Environment

- `.env` is loaded from `src/app/.env` (by `src/app/index.ts`) and from the Electron main process.
- Required variables: `NODE_ENV`, `JWT_SECRET`, `PORT`, `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, and their `_TEST` counterparts.
- The app auto-creates the database if it does not exist and runs schema initialization on first start.

## Architecture

- **Backend entry:** `src/app/index.ts` (Express server, API + page routes, cron jobs).
- **Electron entry:** `src/electron/main.ts` (loads `config.html` or the configured `serverUrl`).
- **Renderer:** Static HTML/JS in `src/app/views/` (no React/Vite bundler for renderer; vanilla JS/TS compiled to `dist-electron/app/views`).
- **API routes:** `src/app/routes/api.routes.ts` — mounts all `/api/*` sub-routers.
- **Page routes:** `src/app/routes/page.routes.ts` — serves HTML files with auth middleware.
- **Database:** `src/app/models/database/connection.ts` uses `pg` Pool. Uses separate env vars for `test` vs default environments.
- **Backend Models** `src/app/models
- **Schema/Seeds:** `src/app/utils/setUpDatabase.ts` and `src/app/tests/helpers/db.helper.ts` contain DDL and seed logic. Tests share the same schema initialization path.

## Linting

- `npm run lint` — ESLint via `eslint.config.js`. Lints `**/*.ts`, ignores `dist/`.

## TypeScript Config

- Root `tsconfig.json` is a solution-style config referencing `tsconfig.app.json` and `tsconfig.node.json`.
- **Electron compile:** `src/electron/tsconfig.json` — outputs to `dist-electron/`, targets `ES2020`, module `NodeNext`, strict **disabled**.
- **App/Renderer type-check:** `tsconfig.app.json` — `strict: true`, `noUnusedLocals: true`, `noEmit: true`.
- **Node type-check:** `tsconfig.node.json` — same strict settings, `noEmit: true`.

## Important Quirks

- **Dual TS configs:** `src/electron/tsconfig.json` is the only one that emits. Do not run `tsc` at the root; it will fail because `tsconfig.app.json` and `tsconfig.node.json` have `noEmit: true`.
- **Build uses `&`** in package.json scripts, which on Windows runs commands in parallel via PowerShell background jobs. If a build seems incomplete, run steps sequentially.
- **Renderer is NOT a modern SPA bundler setup.** Views are plain HTML files with vanilla TS/JS in `src/app/views/js/`. Do not assume Vite/Webpack for the frontend.
- **Asset copying:** `copyDist` copies views, assets, and CSS into `dist-electron/` with `copyfiles`. The Electron builder packages from `dist-electron/`.
- **i18n check:** `npm run check-i18n` audits `src/app/views/locales/en.json` and `ar.json` against keys used in `views/js/**/*.ts` and `views/**/*.html`.
- **Design Style** `design.md` contains all the design principles for future iterations, with the current design principles to be replaced with the contents of that file.

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile Electron TS + copy assets |
| `npm run dev:e` | Run Electron (requires build) |
| `npm run dev:te` | Build then run Electron |
| `npm run dist` | Build + package Windows MSI |
| `npm run lint` | Run ESLint |
| `npm run check-i18n` | Check translation keys |
