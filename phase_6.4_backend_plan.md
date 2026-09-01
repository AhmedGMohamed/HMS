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
| 2 | Patient sale semantics | A `patient` sale persists the transaction **and** creates/links a `DrugUsage` row (ties into admission/administration). |
| 3 | Medical check (`check`) | Also requires a patient (picker is mandatory for both `patient` and `check`). Linked via `patient_id`; does **not** create a `DrugUsage` (a check is a one-off, not ongoing administration) — **confirm this assumption before implementing.** |
| 4 | Quantity conversion | **Renderer converts** larger→smaller units and sends a single integer `quantity` in smaller units. **Server validates** (`> 0`, integer, `<= shipment.quantity`). No server-side multiply by ratio. |
| 5 | Scope separation | All here is backend; renderer changes stay in `phase_6.4_plan.md`. |

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

Add the same column to the canonical schema in `src/app/models/database/DB initialization.sql` (the `DrugTransaction` block, currently lines ~239-247), and update `src/app/tests/helpers/db.helper.ts` (and `src/app/utils/setUpDatabase.ts`) so fresh installs and tests match. Do **not** rely on the migration alone.

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
- Validate: for `transaction_type IN ('patient','check')`, `patient_id` is **required** and must reference an existing patient; for `outside`, `patient_id` must be null.
- Insert `patient_id` into the `INSERT INTO DrugTransaction` statement.
- Validate quantity strictly:
  - `Number.isInteger(data.quantity)`, `data.quantity > 0`, `data.quantity <= shipment.quantity` (smaller-unit contract).
- **Patient sale → `DrugUsage`**: when `transaction_type = 'patient'`, after inserting the transaction and decrementing shipment quantity, create a `DrugUsage` row linking patient, drug, transaction, and (optionally) `patient_history_id`:
  - `patient_id`, `drug_id` (from joined shipment), `transaction_id` (new), `remaining_quantity = data.quantity`, `patient_history_id` (resolve active admission if available; else null — **confirm the resolution rule**).
  - Gracefully handle a missing active admission (store null; do not fail the sale).

### 5.3 `getTransactionSummary`

No change required (does not need patient data). Keep as-is.

---

## 6. Controller Changes (`DrugTransaction.controller.ts`)

- `validateTransactionData`: require `patient_id` when `transaction_type` is `patient` or `check`; reject `patient_id` when `outside`.
- `validateNumericValues`: enforce `Number.isInteger(quantity)` and `quantity > 0`.
- Map new "patient not found" model error to `404`, "missing patient" to `400`.

---

## 7. `DrugUsage` Creation (patient sale)

Reference implementation `DrugUsage.controller.ts` + `DrugUsage.model.ts` already expose `createDrugUsage`. Reuse or mirror it from within `DrugTransactionModel.createTransaction` (inside the same transaction so a failed usage creation rolls back the sale). Confirm the desired fields:

- `patient_history_id`: resolve from the patient's active admission (`PatientHistory`); if none, store `null`.
- `remaining_quantity`: set to the sold smaller-unit quantity.
- Do **not** auto-compute dosage frequency here (out of scope).

---

## 8. Validation Tests / Verification

1. **Migration applied**: `psql` shows `patient_id` column on `DrugTransaction`; fresh init (test helper) also creates it.
2. **Create `outside` sale**: no `patient_id`; succeeds.
3. **Create `patient` sale without `patient_id`**: rejected `400`.
4. **Create `patient` sale with valid `patient_id`**: transaction row stores `patient_id`; a `DrugUsage` row is created with correct `remaining_quantity`.
5. **Create `check` sale**: requires `patient_id`; creates transaction but **no** `DrugUsage` (pending the §2 #3 confirmation).
6. **Quantity validation**: non-integer or `<= 0` quantity rejected; `> shipment.quantity` rejected `400` ("Insufficient quantity in shipment").
7. **Transaction SELECTs**: `patient_name` present for patient/check rows, `null` for outside.

---

## 9. Open Questions (resolve before coding)

1. §2 #3 — does `check` create a `DrugUsage` or just link patient? (Current plan: just link.)
2. §5.2 — `patient_history_id` resolution rule when no active admission exists (null vs. error).
3. §3.1 — confirm nothing depends on `DrugTransaction` column order via `SELECT *`.

---

## 10. Delivery Order Relative to Renderer

- Renderer (`phase_6.4_plan.md`) may be built first against the documented contract, guarding `patient`/`check` flows and `patientName` display behind feature flags until this backend phase lands.
- This backend phase should land before enabling patient sales end-to-end in verification.