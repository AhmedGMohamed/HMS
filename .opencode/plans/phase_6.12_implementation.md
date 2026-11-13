# Implementation record — Phase 6.12: Admin — Users & Roles

**Status:** complete
**Plan:** `C:\Users\gamal\.opencode\plan\phase_6.12_plan.md` (superseded by this file where they disagree)
**Deferred work:** `.opencode/plans/code_debt_transactions.md`
**Baseline commit:** `8595585` (post-6.11)

---

## 1. What shipped

Two real pages replace the `ModulePlaceholder` stubs, and the Users/Roles backend
gained the account status, last login, system-principal, filter, sort and guard
support the pages need.

The headline discovery: **both admin pages were unreachable for every role**.
`PermissionRoute` evaluated `public || private || (permission && …)` and had no
branch for `mode: "admin"`, so `/admin/users` and `/admin/roles` always redirected
to `/dashboard`. The stubs had never rendered. That is why `canAccessRoute()`
exists as a pure, unit-tested function instead of an inline expression.

---

## 2. Semantic model (the correction that reshaped the phase)

`is_system` marks an **automation** principal — never an administrator.

| Concept | Column | Seeded | Hidden from | Meaning |
|---|---|---|---|---|
| Automation account | `"User".is_system` | `system` = TRUE | users list + counts | cron/automation principal |
| Automation role | `Role.is_system` | `System` = TRUE | roles list + counts | role owned by automation |
| Administrator | — | `admin` (role `Admin`, both flags FALSE) | nothing | human admin |

`Admin` is **not** a system role. It is visible, its permissions are editable, and
it is protected only because its *name* is a code contract.

### `isPrivilegedRole(name) = name === "Admin" || name === "System"`

One predicate replaced eight scattered `role === "Admin"` checks:

| Site | Before | After |
|---|---|---|
| `middleware/auth.middleware.ts` `checkPermission` | `role === "Admin"` | `isPrivilegedRole(role)` |
| `checkAnyPermission` | same | same |
| `checkPermissions` | same | same |
| `adminOnly` | `role !== "Admin"` → 403 | `!isPrivilegedRole(role)` → 403 |
| `checkSelfOrAdmin` | `role === "Admin" \|\| username == "system" \|\| self` | `isPrivilegedRole(role) \|\| self` (**username hack deleted**) |
| `navigation.controller.ts` `hasPermission` | `role === "Admin"` | `isPrivilegedRole(role)` |
| `Reports.controller.ts` `userHasPermission` | same | same |
| `Reports.controller.ts` `userHasAllPermissions` | same | same |

Renderer mirror: `src/renderer/src/lib/roles.ts`, used by `usePermission`
(`isPrivileged()`, with `isAdmin()` kept as an alias), `lib/navigation.ts` (both
the permission bypass and the `role: "Admin"` nav gate), and `AdminRoute`.

Because the names are load-bearing, `Role.model` refuses to rename or delete
`Admin` or `System` (`ROLE_NAME_IMMUTABLE` / `SYSTEM_ROLE_PROTECTED`), client and
server.

---

## 3. Schema

```sql
Role(role_id, name, is_system BOOLEAN NOT NULL DEFAULT FALSE)
"User"(user_id, username, password_hash, role_id, is_active BOOLEAN NOT NULL DEFAULT TRUE,
       is_system BOOLEAN NOT NULL DEFAULT FALSE, last_login TIMESTAMP, created_at)
```

Seed: `Role('Admin',FALSE), Role('System',TRUE)`; `admin` → role 1, `system` → role 2.
`System` deliberately has **no** `RolePermission` rows — privilege bypasses checks
and the role is not editable.

`initDB()` only runs when the database is first *created*, so existing installs
get the columns from **`ensureAdminSchema()`**, called unconditionally in
`src/app/index.ts` right after `createDBIfNotExists`. Every statement is
re-runnable; the `LOWER(name)='system'` match is a one-time bootstrap only.
`migrations/004_admin_users_roles.sql` documents the same change (there is no
migration runner).

The test helper gets its own `ensureAdminSchema()` that does **columns + indexes
only** — the role row comes from `seedRoles()`. Running the production bootstrap
there would insert a duplicate `System` role.

---

## 4. API contracts

### Users

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | `roleId` (alias `role_id`), `sort`, `order`, `q`, `page`, `pageSize`; system accounts excluded from rows **and** total |
| GET | `/api/users/:id` | now includes `is_active`, `is_system`, `last_login` |
| POST | `/api/users` | optional `is_active`; `is_system` never client-settable |
| PUT | `/api/users/:id` | `is_active` privileged-only; self-guards |
| DELETE | `/api/users/:id` | `23503` → 409, self → 400, system → 400 |

Sorting uses the `Patient.model` whitelist pattern (`SORTABLE_COLUMNS`, never
interpolating input) with `NULLS LAST, u.user_id ASC` so `last_login` sorting is
stable. An unknown column falls back to `username` (verified: `?sort=password_hash`
returns 200, not an injection).

Filtering and counting share one predicate list, so `total` cannot drift from the
rows.

### Roles

`GET /api/roles` returns non-system roles with `user_count` (`::int`, excluding
system users) and `is_system`. The old `LEFT JOIN … GROUP BY json_agg` plus
`permissions[0].permission_id === null` hack was replaced by two LATERAL
subqueries: one aggregate no longer has to fan out across two child tables, and a
role with no permissions now returns `[]` instead of `[null]`.

`GET /api/roles/:id` 404s for the system role. `PUT`/`DELETE` enforce
`ROLE_NAME_IMMUTABLE`, `SYSTEM_ROLE_PROTECTED`, `ROLE_IN_USE`, `ROLE_NAME_EXISTS`.

### Auth

`verifyToken` is now **async** and re-reads the account on every request:

```
raw = cookie ?? bearer → jwt.verify → UserModel.getAuthState(userId)
  null          → 401 "User no longer exists"
  is_active=false → 401 ACCOUNT_DEACTIVATED
  else          → req.user = { ...claims, role: liveRoleName }
```

- `is_active` gates every authenticated request, not just login.
- The live role name defeats stale claims after a demotion or rename (permissions
  stay in the JWT — documented limitation).
- **Drive-by fix:** `TokenExpiredError extends JsonWebTokenError`, so the old
  branch order reported expired tokens as "Invalid token". Expiry is now checked
  first.
- Login returns **403** `ACCOUNT_DEACTIVATED` (the form must explain why); the
  middleware returns **401** because the renderer treats 401 as "session over".
- `recordLogin` stamps `last_login` best-effort inside a try/catch.

### Error codes (client branches on these)

`ACCOUNT_DEACTIVATED` · `USERNAME_EXISTS` · `USER_IN_USE` ·
`SYSTEM_ACCOUNT_PROTECTED` · `CANNOT_DELETE_SELF` · `CANNOT_CHANGE_OWN_ROLE` ·
`CANNOT_DEACTIVATE_SELF` · `ADMIN_ONLY_FIELD` · `ROLE_NAME_EXISTS` · `ROLE_IN_USE` ·
`ROLE_NAME_IMMUTABLE` · `SYSTEM_ROLE_PROTECTED`

`ApiError` gained an optional `code` (populated from the response body) precisely
so a bilingual UI never renders an English server string.

---

## 5. Transactions

`withTransaction(fn)` added to `connection.ts` and applied to **`Role.model`** (6
blocks) and **`Permission.model`** (1 block). Inner calls go through the supplied
`client`.

It must use the module-level `pool`, never `pgPool`: `pgPool` is constructed
without a `database` field so `createDBIfNotExists` can connect DB-less.

The other 55 `query("BEGIN")` blocks across 15 files are inventoried in
`.opencode/plans/code_debt_transactions.md`, including two latent double-COMMITs
(`PriceList.model.ts` L106/L119, `Patient.model.ts` L231/L239) and loop-nested
BEGINs in both crons.

---

## 6. Route fixes (moved into scope)

- **`permission.routes.ts`** — `GET /:id` was registered before `/role/:id` and
  `/unassigned/:id`, so `GET /api/permissions/role/5` matched `/:id` with
  `id="role"` and `validateId` rejected it. Specific routes now come first
  (verified 200, previously 400).
- **`role.routes.ts`** — the permission block was double-prefixed
  (`/roles/:id/permissions` under a router mounted at `/roles` →
  `/api/roles/roles/…`, unreachable). Now `/:id/permissions`. Nothing called the
  old paths.

`GET /api/users/name/:id` was left ungated by explicit decision.

---

## 7. Frontend surface

```
pages/Admin/shared/       permissionKeys.ts  diffPermissions.ts  adminErrors.ts
pages/Admin/Users/        UsersPage  api  types/user  hooks/useUsers
                          components/{UsersTable,UserRoleFilter,UserStatusBadge}
                          modals/UserModal  schemas/user.schema
pages/Admin/Roles/        RolesPage  api  types/role  hooks/useRoles
                          components/{RolesTable,PermissionGrid}
                          modals/RoleModal  schemas/role.schema
lib/roles.ts              isPrivilegedRole mirror
```

- `lib/routes.ts` gained `canAccessRoute(requirement, {hasPermission, isPrivileged})`
  — exhaustive over the mode union, so a new mode without a branch is a type error.
- Users: server-driven search (400 ms debounce — the endpoint writes an audit row
  per call), role filter, sorting and pagination. Columns: username, role, status,
  last login, created, actions.
- Roles: fetch-all table with permission count, user count, and an expandable
  permission-chip row. Delete hidden for privileged names; name input disabled for
  them (permissions remain editable).
- `PermissionGrid` renders `GET /api/permissions`, labelled via
  `roles.permissions.<feature_name>` **with a `feature_name` fallback** — the map
  had silently lagged the seed (19 labels vs 20 permissions; `manage_supplies` was
  missing and has been added).

### Self-protection (client + server)

| Action | Client | Server |
|---|---|---|
| Delete own account | action not rendered | `CANNOT_DELETE_SELF` |
| Change own role | select disabled, field omitted from payload | `CANNOT_CHANGE_OWN_ROLE` |
| Deactivate own account | switch disabled, field omitted | `CANNOT_DEACTIVATE_SELF` |
| Non-privileged sets `is_active` | n/a (page is admin-only) | `ADMIN_ONLY_FIELD` |
| Touch a system account | row not listed | `SYSTEM_ACCOUNT_PROTECTED` |
| Rename/delete `Admin` or `System` | name disabled / delete hidden | `ROLE_NAME_IMMUTABLE` / `SYSTEM_ROLE_PROTECTED` |

Omitting fields from the self payload rather than sending unchanged values matters:
the server rejects *any* self `role_id`, even the current one.

---

## 8. Verification

| Gate | Result |
|---|---|
| `tsc -p src/app/tsconfig.json` | 30 errors — **identical to baseline**, zero new |
| Renderer typecheck (throwaway config with `jsx`) | no errors in any touched file |
| Backend jasmine (full) | **694 specs, 27 failed** vs baseline **640 specs, 30 failed** — the 3 that disappeared are the stale specs this phase rewrote (`UserModel.getAllUsers`, `UserController.getAllUsers`, `RoleModel.syncRolePermissions`). **No new failures.** |
| `npm run test:renderer` | **126 passed** (was 91; +35) |
| `npm run build:renderer` | clean; `UsersPage`/`RolesPage` emitted as lazy chunks |
| `eslint` (touched files only) | 0 errors, 2 warnings (the same `form.watch` "incompatible library" notice `ServiceModal` already emits) |
| EN/AR parity (users, roles, login) | 53/53, 55/55, 20/20 — no empty strings |
| Seed permission coverage | 20/20 labels (was 19) |
| Live API probe (dev DB) | see below |

### Live probe against the running server

```
DB users: #1 admin(Admin) #2 system(System,system) #3 reception #4 limiteduser
"User" columns: … created_at, is_active, is_system, last_login

GET /api/users            → 200 total=3 rows=3, usernames exclude "system"
GET sort=lastLogin&desc   → 200
GET sort=password_hash    → 200 (whitelist fallback, no 500)
GET roleId=abc            → 400 Invalid roleId
GET /api/roles            → Admin(perm=20,users=1,sys=false) Reception(perm=2,users=2)
GET /api/permissions/role/1 → 200 (was 400)
DELETE self               → 400 CANNOT_DELETE_SELF
PUT self role_id          → 400 CANNOT_CHANGE_OWN_ROLE
PUT self is_active=false  → 400 CANNOT_DEACTIVATE_SELF
PUT system account        → 400 SYSTEM_ACCOUNT_PROTECTED
PUT rename Admin          → 400 ROLE_NAME_IMMUTABLE
DELETE Admin role         → 400 ROLE_NAME_IMMUTABLE
GET /api/roles/<system>   → 404
POST /api/roles/1/permissions → 200 (double-prefix fix)
deactivated user GET /api/users → 401 ACCOUNT_DEACTIVATED
```

`Admin` shows `users=1` because the `system` account lives on the `System` role and
is excluded either way.

---

## 9. Known limitations & follow-ups

- **Permission changes still need a re-login** — only the role name is refreshed
  per request. Recorded, not fixed.
- **`last_login` was not exercised over HTTP** in the probe: the seeded admin
  password is not known, so the probe minted a JWT instead of logging in. The
  stamping path is covered by `Auth.controller.spec.ts` ("should stamp last_login
  on a successful login").
- The 27 pre-existing backend failures are untouched (DrugCard/DrugShipment/
  DrugUsage/Employee/Patient/Service/Vault suites) — out of scope.
- The legacy `admin/users.html` + `views/js/admin/users.ts` page remains broken
  against the paginated envelope (pre-existing; kept as a legacy surface).
- `npm run check-i18n` exits non-zero on pre-existing legacy missing keys
  (`medicalSupplies.*`); the renderer namespaces this phase touched are clean.
