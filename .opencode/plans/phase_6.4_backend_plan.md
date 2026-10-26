# Implementation Plan — Phase 6.4 (Backend): Pharmacy Patient Sales & Quantity Validation

**Scope:** Backend changes required by the Pharmacy Drugs renderer (`phase_6.4_plan.md`). Adds patient linkage to drug transactions, patient-sale-driven `DrugUsage` creation, and smaller-unit quantity validation.  
**Target:** Express + PostgreSQL (backend only; no renderer changes here).  
**Companion:** `phase_6.4_plan.md` (renderer) documents the contract this phase fulfills.

---

## 1. Context & Motivation

The renderer's Sell Drug dialog supports three transaction types: `patient`, `check`, and `outside`. Today:

1. **No patient linkage** — the `DrugTransaction` table has no `patient_id` column. The legacy renderer sends `patient_id`, but `CreateDrugTransactionDTO` and `createTransaction` (`DrugTransaction.model.ts:95-110`) silently drop it. "Patient" and "Medical check" sales are recorded only as a `transaction_type` string with no relational link and no effect on the patient's drug usage.
2. **No patient-sale → `DrugUsage` creation** — selling a drug to a patient does not track ongoing administration / remaining quantity.
3. **Quantity contract is implicit** — `createTransaction` stores the raw `quantity` sent (smaller units) and validates `> 0` and `<= shipment.quantity`, but there is no explicit smaller-unit contract and no unit-conversion validation.

This phase resolves all three so the renderer can ship real patient sales.

---

## 2. Decisions (approved)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Patient linkage | Add a nullable `patient_id` column to `DrugTransaction`; add a `Patient` join to transaction SELECTs to emit `patient_name`. |
| 2 | Patient sale semantics | A `patient` sale **requires an active admission**, persists the transaction **and** creates/links a `DrugUsage` row. Reuse the existing admission-based flow in `Patient.model.ts:dispenseDrugToPatient` rather than reimplementing. |
| 3 | Medical check (`check`) | Requires a patient (picker mandatory); **links `patient_id` only, does NOT create a `DrugUsage`**. No admission requirement. |
| 4 | Outside (`outside`) | No patient (`patient_id` null); no DrugUsage; no admission requirement. |
| 5 | Quantity conversion | **Renderer converts** larger→smaller units and sends a single integer `quantity` in smaller units. **Server validates** (`> 0`, `Number.isInteger`, `<= shipment.quantity`). No server-side multiply by ratio. |
| 6 | Scope separation | All here is backend; renderer changes stay in `phase_6.4_plan.md`. |

---

## 3. Database Changes (migration)

### 3.1 `DrugTransaction.patient_id`

Add a nullable FK column:

```sql
ALTER TABLE DrugTransaction
  ADD COLUMN patient_id INTEGER REFERENCES Patient(patient_id);
```

- Nullable (existing `outside` and legacy rows have no patient).
- No default; engine order kept (append at end to preserve any `SELECT *` column order assumptions — **verify** no code relies on column position).

Index (optional but recommended for the filtered-by-patient path):

```sql
CREATE INDEX IF NOT EXISTS idx_drug_transaction_patient
  ON DrugTransaction(patient_id);
```

### 3.2 Schema init parity

Add the same column to **all** schema-definition locations so fresh installs and tests match. Do **not** rely on the migration alone:

1. `src/app/models/database/DB initialization.sql` — `DrugTransaction` block (lines ~239-247).
2. `src/app/utils/setUpDatabase.ts` — `DrugTransaction` block (lines ~257-265).
3. `src/app/tests/helpers/db.helper.ts` — `DrugTransaction` block (lines ~1113-1121).

> **Column-order safety — confirmed.** No code reads `DrugTransaction` via `SELECT * FROM DrugTransaction` (all queries use an explicit alias `dt` + named columns, or `SELECT * FROM Warehouse`-style unrelated tables). Appending `patient_id` at the end is safe.

---

## 4. Type Changes (`src/app/utils/types/drugs.d.ts`)

- `CreateDrugTransactionDTO`: add optional `patient_id?: number`.
- `DrugTransaction` (base): add `patient_id: number | null`.
- `TransactionWithDetails`: add `patient_name: string | null` (from the join).
- Confirm `DrugTransactionFilters` needs no change (patient filtering is not a renderer requirement for 6.4).

---

## 5. Model Changes (`DrugTransaction.model.ts`)

### 5.1 `getAllTransactions` / `getTransactionById` / `getTransactionsByFilters`

Add a `LEFT JOIN Patient p ON dt.patient_id = p.patient_id` and select `p.name as patient_name` (and `dt.patient_id` via `dt.*`). Keep everything else identical (incl. `shipment_buy_price`, `profit`).

### 5.2 `createTransaction`

- Accept `patient_id` from `data`.
- Validate per type:
  - `outside`: `patient_id` must be null.
  - `check`: `patient_id` required (must reference an existing patient); links only — no `DrugUsage`.
  - `patient`: `patient_id` required AND an **active admission** must exist. **Delegate the full patient-sale path to the existing `Patient.model.ts:dispenseDrugToPatient` flow** (FIFO shipment selection, transaction insert with `patient_id`, `DrugUsage` insert with `patient_history_id`, and bill detail) rather than reimplementing here.
- Validate quantity strictly:
  - `Number.isInteger(data.quantity)`, `data.quantity > 0`, `data.quantity <= shipment.quantity` (smaller-unit contract).

> **Reuse decision:** `Patient.model.ts:1816 dispenseDrugToPatient` already implements patient admission-gated drug dispensing (transaction + `DrugUsage` + bill detail, FIFO). The `patient` sale should call into this path so admission rules and bill integration stay in one place. The `DrugTransactionModel.createTransaction` remains the entry for `check`/`outside` (non-admission) sales.

### 5.3 `getTransactionSummary`

No change required (does not need patient data). Keep as-is.

---

## 6. Controller Changes (`DrugTransaction.controller.ts`)

- `validateTransactionData`: require `patient_id` when `transaction_type` is `patient` or `check`; reject `patient_id` when `outside`.
- `validateNumericValues`: enforce `Number.isInteger(quantity)` and `quantity > 0`.
- Map "patient not found" model error to `404`, "missing patient" to `400`, and "Patient is not currently admitted" / "No current admission found" (from the reused `dispenseDrugToPatient`) to `400` with a clear message.

## 7. `DrugUsage` Creation (patient sale)

**Reuse `Patient.model.ts:dispenseDrugToPatient`** — it already:
- Resolves the active admission (`getCurrentAdmission`) and throws when absent (matches the "patient sales require admission" decision).
- Selects FIFO shipments, inserts the `DrugTransaction`, creates `DrugUsage` (with `patient_history_id`), and writes the `BillDetail`.
- Extend it to set `patient_id` on the `DrugTransaction` insert once the column exists.

`check` / `outside` do **not** create a `DrugUsage`; only the transaction row is written (via `DrugTransactionModel.createTransaction`).

> Also note: `patientAutoRenewalCron.ts` (lines ~422, ~612) and `Patient.model.ts:1867` insert into `DrugTransaction` with a hardcoded `'patient'` type. With the column nullable, they remain valid, but consider also setting `patient_id` on those `patient`-type inserts for consistency (renewal cron has patient context available).

---

## 8. Validation Tests / Verification

1. **Migration applied**: `psql` shows `patient_id` column on `DrugTransaction`; fresh init (test helper + `setUpDatabase`) also creates it.
2. **Create `outside` sale**: no `patient_id`; succeeds.
3. **Create `check` sale without `patient_id`**: rejected `400`.
4. **Create `check` sale with valid `patient_id`**: transaction stores `patient_id`; **no** `DrugUsage` created.
5. **Create `patient` sale (admitted patient, valid `patient_id`)**: transaction stores `patient_id`; `DrugUsage` created with correct `patient_history_id` + `remaining_quantity` (via `dispenseDrugToPatient`).
6. **Create `patient` sale (no active admission)**: rejected `400` ("not admitted" / "no current admission").
7. **Quantity validation**: non-integer or `<= 0` rejected; `> shipment.quantity` rejected `400` ("Insufficient quantity in shipment").
8. **Transaction SELECTs**: `patient_name` present for `patient`/`check` rows, `null` for `outside`.
9. **Column-order safety**: confirm no positional consumer of `DrugTransaction` reads by index (already verified — no `SELECT * FROM DrugTransaction`).

## 9. Resolutions

All open questions resolved:

1. **`check` semantics** → links `patient_id` only; no `DrugUsage`; no admission required.
2. **`patient` semantics** → requires active admission; reuses `dispenseDrugToPatient` (transaction + `DrugUsage` + bill detail).
3. **Column-order safety** → confirmed safe (no `SELECT * FROM DrugTransaction`); append `patient_id` at end.

---

## 10. Delivery Order Relative to Renderer

- Renderer (`phase_6.4_plan.md`) may be built first against the documented contract, guarding `patient`/`check` flows and `patientName` display behind feature flags until this backend phase lands.
- This backend phase should land before enabling patient sales end-to-end in verification.