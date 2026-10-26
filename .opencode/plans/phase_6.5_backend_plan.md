# Implementation Plan — Phase 6.5 (Backend): Medical Supplies Usage History & Endpoints Parity

**Scope:** Backend enhancements, route alignments, and bug fixes required by the Medical Supplies renderer (`phase_6.5_plan.md`). Adds query-filtered usage history, fixes SQL parameterized search syntax across three models, aligns permissions to `manage_supplies` OR `manage_pharmacy`, implements 30-day usage metrics for turnover calculation, and adds missing indexes for the new aggregation queries.  
**Target:** Express + PostgreSQL (backend only; companion to `phase_6.5_plan.md`).  
**Companion:** `phase_6.5_plan.md` (renderer) documents the frontend components and hooks depending on this contract.

---

## 1. Context & Motivation

During the design analysis of Phase 6.5 (Medical Supplies), several backend gaps, route mismatches, a critical SQL bug, missing indexes, and missing `auditLogger` route descriptions were identified:

1. **Usage History Endpoint Gap:**
   - `MedicalSupplyUsage.model.ts` already has a method `getMedicalSupplyUsageHistory(patientId?, supplyId?)` which joins `MedicalSupplyUsage`, `MedicalSupply`, `Patient`, and `MedicalSupplyTransaction`.
   - However, `medicalSupplyUsage.routes.ts` only mounts parameterized routes: `/history/:patientId/:supplyId` and `/patient-history/:patientId`.
   - There is **no route** for general usage history (across all patients, or filtered by date range, specific supply, or active/completed status), which is required for the new **Usage History** auditing tab.

2. **Critical SQL Syntax Bug in Search (THREE occurrences):**
   - `MedicalSupplyModel.getAllMedicalSupplies` (`src/app/models/MedicalSupply.model.ts:22, 29`)
   - `DrugCardModel.getAllDrugCards` (`src/app/models/DrugCard.model.ts:30`)
   - `UserModel` search method (`src/app/models/User.model.ts:240`)
   - All three contain the pattern: `` WHERE name ILIKE %$1% ``
   - In PostgreSQL parameterized queries, `%$1%` causes a syntax error (`error: syntax error at or near "$1"`). It must be `WHERE name ILIKE $1` with parameter `\`%${q}%\``.

3. **Permission Discrepancy:**
   - `Permission` table defines both `manage_supplies` ("Can manage medical supplies and inventory") and `manage_pharmacy` ("Can manage pharmacy").
   - `medicalSupply.routes.ts` enforces `checkPermission("manage_supplies")`.
   - However, `medicalSupplyShipment.routes.ts` currently enforces `checkPermission("manage_pharmacy")`.
   - Users assigned the dedicated `manage_supplies` role permission cannot manage supply shipments unless granted both permissions.

4. **30-Day Turnover Rate & KPI Support:**
   - The renderer's KPI strip features a **Monthly Turnover Rate** metric: `(Units Dispensed in Last 30 Days / Total Inventory in Last 30 Days) * 100%`.
   - An aggregate usage summary endpoint is needed to fetch total units dispensed in the last 30 days without loading unbounded client-side historical rows.

5. **Missing Indexes for New Aggregation Queries:**
   - No index on `MedicalSupplyTransaction.timestamp` — used by both `/history` (date range filter) and `/summary` (30-day filter).
   - No index on `MedicalSupplyTransaction.shipment_id` — used by the enriched `/history` join.
   - No index on `MedicalSupplyUsage.transaction_id` — used by the join in `/summary` and the existing usage history.

6. **Missing `auditLogger` Route Descriptions:**
   - `auditLogger.middleware.ts` has no entries for medical-supply routes.
   - All existing and new medical-supply routes currently log with `description: "Unknown"`.
   - Phase 6.5 adds full coverage.

---

## 2. Decisions (Approved)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Usage History URL** | **Replace** legacy routes. Mount only `GET /api/pharmacy/medical-supply-usages/history` (query-param-based) and `GET /api/pharmacy/medical-supply-usages/summary`. Delete `GET /history/:patientId/:supplyId` and `GET /patient-history/:patientId`. |
| 2 | **Pagination Envelope** | `{ data, total, page, pageSize }` via existing `parsePagination` + `buildPage` helpers (matches Phase 6 convention). |
| 3 | **Summary Metric Semantics** | `SUM(MedicalSupplyTransaction.quantity)` across **all** transaction types. All-time + 30-day windows. |
| 4 | **SQL Syntax Fix Scope** | All three occurrences: `MedicalSupply.model.ts`, `DrugCard.model.ts`, `User.model.ts`. |
| 5 | **Permission Helper** | New shared middleware `checkAnyPermission(perms: string[])` in `src/app/middleware/auth.middleware.ts`. Accepts any-of semantics; `Admin` role bypasses. |
| 6 | **Permission Alignment** | `medicalSupplyShipment.routes.ts` POST/PUT/DELETE use `checkAnyPermission(["manage_supplies", "manage_pharmacy"])`. |
| 7 | **Dispensing Contract** | No code change required; `POST /patient/:patientId` delegates to `PatientModel.addMedicalSupplyToPatient` which already writes `MedicalSupplyTransaction`, `MedicalSupplyUsage`, and a `BillDetail` atomically. |
| 8 | **History Model Signature** | Refactor `getMedicalSupplyUsageHistory(patientId?, supplyId?)` → `getMedicalSupplyUsageHistory(filters: MedicalSupplyUsageFilters)`. |
| 9 | **Indexes** | Add to production schema: `idx_medical_supply_transaction_timestamp`, `idx_medical_supply_transaction_shipment`, `idx_medical_supply_usage_transaction`. Add to test schema in `db.helper.ts` for parity. |
| 10 | **auditLogger** | Add route descriptions for the two new endpoints **and** all existing medical-supply routes (currently all log as `"Unknown"`). |
| 11 | **Tests** | **No tests this phase.** Manual verification per §8. |

---

## 3. Database & Query Specifications

No schema **migrations** in the strict sense — the application uses `setUpDatabase.ts` to create all tables on first start (with `CREATE TABLE IF NOT EXISTS`). All three new indexes are added to that block so they apply on fresh databases and remain idempotent.

### 3.1 New Indexes (in `setUpDatabase.ts`)

Append to the existing `CREATE INDEX IF NOT EXISTS` block (near lines 499–505):

```sql
CREATE INDEX IF NOT EXISTS idx_medical_supply_transaction_timestamp
    ON MedicalSupplyTransaction(timestamp);
CREATE INDEX IF NOT EXISTS idx_medical_supply_transaction_shipment
    ON MedicalSupplyTransaction(shipment_id);
CREATE INDEX IF NOT EXISTS idx_medical_supply_usage_transaction
    ON MedicalSupplyUsage(transaction_id);
```

Add the same three statements to `src/app/tests/helpers/db.helper.ts` `initDB()` so tests benefit from them.

### 3.2 SQL Fix: `MedicalSupply.model.ts`

In `MedicalSupplyModel.getAllMedicalSupplies`:
```typescript
// Replace:
if (q) {
    sql = `SELECT * FROM MedicalSupply WHERE name ILIKE %$1% ORDER BY name LIMIT $2 OFFSET $3`
    params.push(q, limit, offset)
} else { ... }
const countSql = q
    ? `SELECT COUNT(*) AS c FROM MedicalSupply WHERE name ILIKE %$1%`
    : `SELECT COUNT(*) AS c FROM MedicalSupply`

// With:
if (q) {
    sql = `SELECT * FROM MedicalSupply WHERE name ILIKE $1 ORDER BY name LIMIT $2 OFFSET $3`
    params.push(`%${q}%`, limit, offset)
} else {
    sql = `SELECT * FROM MedicalSupply ORDER BY name LIMIT $1 OFFSET $2`
    params.push(limit, offset)
}
const countSql = q
    ? `SELECT COUNT(*) AS c FROM MedicalSupply WHERE name ILIKE $1`
    : `SELECT COUNT(*) AS c FROM MedicalSupply`
```

The `countSql` execution call (line 36) also needs updating: `q ? [\`%${q}%\`] : []` instead of `q ? [q] : []`.

### 3.3 SQL Fix: `DrugCard.model.ts:30`

Same pattern — fix the `name ILIKE %$1%` query and push `\`%${q}%\`` for the parameter.

### 3.4 SQL Fix: `User.model.ts:240`

Same pattern — fix the `name ILIKE %$1%` query and push `\`%${q}%\`` for the parameter.

---

## 4. Type Changes (`src/app/utils/types/medicalSupplies.d.ts`)

Add the following filter and summary interfaces:

```typescript
export interface MedicalSupplyUsageFilters {
    startDate?: string;
    endDate?: string;
    patientId?: number;
    supplyId?: number;
    isActive?: boolean;
    offset?: number;
    limit?: number;
}

export interface MedicalSupplyUsageSummary {
    totalUnitsDispensedAllTime: number;
    totalUnitsDispensedLast30Days: number;
    activeUsagesCount: number;
    totalPatientsServed: number;
}
```

**Extend the existing `MedicalSupplyUsageHistory` interface (line 217) to include the new columns returned by the enriched query:**

```typescript
export interface MedicalSupplyUsageHistory {
    usage_id: number;
    patient_id: number;
    patient_name: string;
    supply_id: number;
    supply_name: string;
    transaction_id: number;
    initial_quantity: number;
    remaining_quantity: number;
    start_date: Date;
    last_administered: Date | null;
    is_active: boolean;
    warehouse_name: string | null;
    unit_price: number | null;
}
```

---

## 5. Model Changes (`MedicalSupplyUsage.model.ts`)

### 5.1 Refactor `getMedicalSupplyUsageHistory` to accept `MedicalSupplyUsageFilters`

Build a dynamic `whereClause` and return `{ rows, total }`:

```typescript
async getMedicalSupplyUsageHistory(
    filters: MedicalSupplyUsageFilters
): Promise<{ rows: MedicalSupplyUsageHistory[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.startDate) {
        conditions.push(`mst.timestamp >= $${paramCount++}`);
        values.push(filters.startDate);
    }
    if (filters.endDate) {
        conditions.push(`mst.timestamp <= $${paramCount++}`);
        values.push(filters.endDate);
    }
    if (filters.patientId !== undefined) {
        conditions.push(`msu.patient_id = $${paramCount++}`);
        values.push(filters.patientId);
    }
    if (filters.supplyId !== undefined) {
        conditions.push(`msu.supply_id = $${paramCount++}`);
        values.push(filters.supplyId);
    }
    if (filters.isActive !== undefined) {
        conditions.push(`(msu.remaining_quantity > 0) = $${paramCount++}`);
        values.push(filters.isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 25;
    const offset = filters.offset ?? 0;

    const dataSql = `
        SELECT
            msu.usage_id, msu.patient_id, p.name AS patient_name,
            msu.supply_id, ms.name AS supply_name,
            msu.transaction_id, mst.quantity AS initial_quantity,
            msu.remaining_quantity, mst.timestamp AS start_date,
            msu.last_administered,
            msu.remaining_quantity > 0 AS is_active,
            w.name AS warehouse_name,
            mst.price AS unit_price
        FROM MedicalSupplyUsage msu
        JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
        JOIN Patient p ON msu.patient_id = p.patient_id
        JOIN MedicalSupplyTransaction mst ON msu.transaction_id = mst.transaction_id
        LEFT JOIN MedicalSupplyShipment mss ON mst.shipment_id = mss.shipment_id
        LEFT JOIN Warehouse w ON mss.warehouse_id = w.warehouse_id
        ${whereClause}
        ORDER BY mst.timestamp DESC
        LIMIT $${paramCount++} OFFSET $${paramCount++};
    `;
    const countSql = `
        SELECT COUNT(*) AS c
        FROM MedicalSupplyUsage msu
        JOIN MedicalSupplyTransaction mst ON msu.transaction_id = mst.transaction_id
        ${whereClause};
    `;

    const [result, countRes] = await Promise.all([
        query(dataSql, [...values, limit, offset]),
        query(countSql, values)
    ]);

    return {
        rows: result.rows,
        total: Number(countRes.rows[0]?.c ?? 0),
    };
}
```

### 5.2 Add `getUsageSummary()`

```typescript
async getUsageSummary(): Promise<MedicalSupplyUsageSummary> {
    const sql = `
        SELECT
            COALESCE(SUM(mst.quantity), 0) AS total_units_all_time,
            COALESCE(SUM(CASE WHEN mst.timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN mst.quantity ELSE 0 END), 0) AS total_units_last_30_days,
            COUNT(DISTINCT msu.patient_id) AS total_patients_served,
            COUNT(CASE WHEN msu.remaining_quantity > 0 THEN 1 END) AS active_usages_count
        FROM MedicalSupplyUsage msu
        JOIN MedicalSupplyTransaction mst ON msu.transaction_id = mst.transaction_id;
    `;
    const result = await query(sql);
    const row = result.rows[0] || {};
    return {
        totalUnitsDispensedAllTime: parseInt(row.total_units_all_time) || 0,
        totalUnitsDispensedLast30Days: parseInt(row.total_units_last_30_days) || 0,
        activeUsagesCount: parseInt(row.active_usages_count) || 0,
        totalPatientsServed: parseInt(row.total_patients_served) || 0,
    };
}
```

---

## 6. Controller Changes (`MedicalSupplyUsage.controller.ts`)

### 6.1 Rewrite `getMedicalSupplyUsageHistory`

- Use `parsePagination(req)` for `page`/`pageSize`/`offset`/`limit`.
- Parse query params: `startDate`, `endDate` (strings), `patientId`, `supplyId` (parseInt if present), `isActive` (boolean coercion: `String(isActiveRaw) === "true"`).
- Build `MedicalSupplyUsageFilters`.
- Call `MedicalSupplyUsageModel.getMedicalSupplyUsageHistory(filters)`.
- Return `buildPage(rows, total, pagination)`.

### 6.2 Add `getUsageSummary`

```typescript
async getUsageSummary(_req: Request, res: Response) {
    try {
        const summary = await MedicalSupplyUsageModel.getUsageSummary();
        res.json(summary);
    } catch (error) {
        console.error("Error fetching medical supply usage summary:", error);
        res.status(500).json({ error: "Failed to fetch medical supply usage summary" });
    }
}
```

### 6.3 No change to `addMedicalSupplyToPatient` / `removeMedicalSupplyFromPatient`

These already work via `PatientModel` in a transaction. Plan §2.5 verification confirmed by audit; no code change required.

---

## 7. Middleware Changes

### 7.1 New `checkAnyPermission` Factory (`auth.middleware.ts`)

Add alongside the existing `checkPermission`:

```typescript
export const checkAnyPermission = (required: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            res.status(401).json({ error: "Authentication required" });
            return;
        }
        if (req.user.role === "Admin") {
            next();
            return;
        }
        const has = required.some(p => req.user!.permissions.includes(p));
        if (!has) {
            res.status(403).json({ error: "Insufficient permissions" });
            return;
        }
        next();
    };
};
```

---

## 8. Route & Middleware Changes

### 8.1 `medicalSupplyUsage.routes.ts`

**Delete** (the two legacy endpoints):
- `router.get("/history/:patientId/:supplyId", ...)`
- `router.get("/patient-history/:patientId", ...)`

**Add** (mounted **before** `router.get("/:id", ...)` to avoid the param route swallowing `/history` and `/summary`):
```typescript
router.get("/history", auditLogger, (req, res) =>
    MedicalSupplyUsageController.getMedicalSupplyUsageHistory(req, res)
);

router.get("/summary", auditLogger, (req, res) =>
    MedicalSupplyUsageController.getUsageSummary(req, res)
);
```

Both run under the existing `router.use(verifyToken)` (line 10). No `checkPermission` — matches existing `/pending/administrations` pattern (any authenticated user can view).

### 8.2 `medicalSupplyShipment.routes.ts`

**Update import** to add `checkAnyPermission`:
```typescript
import { verifyToken, checkPermission, checkAnyPermission } from "../middleware/auth.middleware.js";
```

**Replace** the three `checkPermission("manage_pharmacy")` calls (lines 21, 27, 35) on POST/PUT/DELETE with:
```typescript
checkAnyPermission(["manage_supplies", "manage_pharmacy"])
```

### 8.3 `auditLogger.middleware.ts` — Route Descriptions

Add entries for every medical-supply route (existing + new). Inserted into the existing `routeDetails` map under matching `GET:`, `POST:`, `PUT:`, `DELETE:` method blocks, using param-replaced URL keys (matching drug-route conventions):

| Method | URL template | Description |
|--------|--------------|-------------|
| `GET` | `/api/pharmacy/medical-supplies` | "Fetched medical supplies list" |
| `GET` | `/api/pharmacy/medical-supplies/:id` | "Fetched medical supply details" |
| `POST` | `/api/pharmacy/medical-supplies` | "Created a medical supply" |
| `PUT` | `/api/pharmacy/medical-supplies/:id` | "Updated a medical supply" |
| `DELETE` | `/api/pharmacy/medical-supplies/:id` | "Deleted a medical supply" |
| `GET` | `/api/pharmacy/medical-supplies/search/supplies` | "Searched medical supplies" |
| `GET` | `/api/pharmacy/medical-supplies/search/suggestions` | "Fetched medical supply suggestions" |
| `GET` | `/api/pharmacy/medical-supplies/monitor/low-stock` | "Fetched low-stock medical supplies" |
| `GET` | `/api/pharmacy/medical-supply-usages` | "Fetched medical supply usages" |
| `GET` | `/api/pharmacy/medical-supply-usages/:id` | "Fetched medical supply usage details" |
| `POST` | `/api/pharmacy/medical-supply-usages/patient/:patientId` | "Dispensed medical supply to patient" |
| `DELETE` | `/api/pharmacy/medical-supply-usages/patient/:patientId/:usageId` | "Removed medical supply from patient" |
| `GET` | `/api/pharmacy/medical-supply-usages/pending/administrations` | "Fetched pending medical supply administrations" |
| `GET` | `/api/pharmacy/medical-supply-usages/history` | "Fetched medical supply usage history" |
| `GET` | `/api/pharmacy/medical-supply-usages/summary` | "Fetched medical supply usage summary" |
| `GET` | `/api/pharmacy/medical-supply-usages/available-shipments/:supplyId` | "Fetched available medical supply shipments" |
| `GET` | `/api/pharmacy/medical-supply-shipments` | "Fetched medical supply shipments" |
| `GET` | `/api/pharmacy/medical-supply-shipments/:id` | "Fetched medical supply shipment details" |
| `POST` | `/api/pharmacy/medical-supply-shipments` | "Created a medical supply shipment" |
| `PUT` | `/api/pharmacy/medical-supply-shipments/:id` | "Updated a medical supply shipment" |
| `DELETE` | `/api/pharmacy/medical-supply-shipments/:id` | "Deleted a medical supply shipment" |
| `GET` | `/api/pharmacy/medical-supply-shipments/supply/:id` | "Fetched shipments by medical supply" |
| `GET` | `/api/pharmacy/medical-supply-shipments/warehouse/:id` | "Fetched shipments by warehouse" |

---

## 9. Files Touched — Final Manifest

| # | File | Change Type |
|---|------|-------------|
| 1 | `src/app/middleware/auth.middleware.ts` | **Modify** — add `checkAnyPermission` factory. |
| 2 | `src/app/middleware/auditLogger.middleware.ts` | **Modify** — add medical-supply route descriptions. |
| 3 | `src/app/utils/types/medicalSupplies.d.ts` | **Modify** — add `MedicalSupplyUsageFilters`, `MedicalSupplyUsageSummary`; extend `MedicalSupplyUsageHistory` with `warehouse_name`, `unit_price`. |
| 4 | `src/app/models/MedicalSupply.model.ts` | **Modify** — fix `ILIKE %$1%` SQL bug. |
| 5 | `src/app/models/DrugCard.model.ts` | **Modify** — fix same `ILIKE` SQL bug. |
| 6 | `src/app/models/User.model.ts` | **Modify** — fix same `ILIKE` SQL bug. |
| 7 | `src/app/models/MedicalSupplyUsage.model.ts` | **Modify** — refactor `getMedicalSupplyUsageHistory` to accept filters + return `{ rows, total }`; add `getUsageSummary`. |
| 8 | `src/app/controllers/MedicalSupplyUsage.controller.ts` | **Modify** — rewrite `getMedicalSupplyUsageHistory` (query-param parsing + `buildPage`); add `getUsageSummary`. |
| 9 | `src/app/routes/medicalSupplyUsage.routes.ts` | **Modify** — remove legacy `/history/:patientId/:supplyId` and `/patient-history/:patientId`; add `/history` and `/summary`. |
| 10 | `src/app/routes/medicalSupplyShipment.routes.ts` | **Modify** — swap `checkPermission("manage_pharmacy")` → `checkAnyPermission(["manage_supplies", "manage_pharmacy"])` on POST/PUT/DELETE. |
| 11 | `src/app/utils/setUpDatabase.ts` | **Modify** — add 3 new indexes. |
| 12 | `src/app/tests/helpers/db.helper.ts` | **Modify** — add 3 new indexes to `initDB()` (medical-supply tables are not yet in test init, so this is forward-compatible prep). |

No schema migrations. No new dependencies. No new files. No tests (deferred per Decision #11).

---

## 10. Verification Plan

### Automated / Build Checks
1. `npm run lint` — must pass with no errors.
2. Boot Express with `npm run dev:server`; no route-mounting warnings.

### Endpoint Tests
1. `GET /api/pharmacy/medical-supplies?q=bandage` → 200 with matching items (tests SQL bug fix).
2. `GET /api/pharmacy/drugs/cards?q=para` → 200 (tests DrugCard SQL fix).
3. `GET /api/users?q=admin` (if such endpoint exists; else hit the user search method directly) → 200 (tests User SQL fix).
4. `GET /api/pharmacy/medical-supply-usages/history?startDate=2026-01-01&endDate=2026-12-31&limit=10` → 200 with paginated envelope.
5. `GET /api/pharmacy/medical-supply-usages/history?patientId=1` → 200 (single-filter case).
6. `GET /api/pharmacy/medical-supply-usages/history?isActive=true` → 200 (boolean coercion).
7. `GET /api/pharmacy/medical-supply-usages/summary` → 200, returns `MedicalSupplyUsageSummary`.
8. `POST /api/pharmacy/medical-supply-shipments` as user with `manage_supplies` only (no `manage_pharmacy`) → 201 Created.
9. Same `POST` as user with `manage_pharmacy` only (no `manage_supplies`) → 201.
10. Same `POST` as user with neither → 403.
11. Verify legacy routes return 404: `GET /api/pharmacy/medical-supply-usages/history/1/1` and `GET /api/pharmacy/medical-supply-usages/patient-history/1`.
12. Confirm `auditLogger` entries land with non-`"Unknown"` descriptions in the `AuditLog` table for at least the new `/history` and `/summary` routes.

---

## 11. Open Items / Out-of-Scope (Flagged for Follow-Up)

- **Tests:** Zero medical-supply test coverage today, and this phase adds none. The renderer's consumption is untested at the integration level. Test `db.helper.ts` still lacks medical-supply table creation; even adding tests in a follow-up phase will require the test schema to be backfilled.
- **Audit logger entries for drugs/warehouse routes:** Not addressed in this phase. Can be added as a follow-up.
- **Composite permission helper genericization:** `checkAnyPermission` is a clean general utility. If a third composite case arises, it should be promoted / kept here.
- **`isActive` boolean coercion:** Implemented in the controller as `String(isActiveRaw) === "true"`. Any client sending `1`/`0` or `yes`/`no` will not match. Documented in the route description; can be widened later.
