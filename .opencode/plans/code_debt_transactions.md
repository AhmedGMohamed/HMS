# Code Debt — Transaction Boundaries (`BEGIN` / `COMMIT` on a pooled connection)

**Status:** backlog (deferred out of Phase 6.12 by decision)
**Created:** during Phase 6.12 planning
**Owner:** unassigned
**Related:** `phase_6.12_plan.md` §3.6 (adds the `withTransaction()` helper and converts two models)

---

## 1. The defect

`src/app/models/database/connection.ts` exports a single pooled `query(text, params)` that borrows an arbitrary client from the pool, runs one statement, and returns it. Every model that needs a transaction therefore writes:

```ts
await query("BEGIN");
// ... N statements, each on a possibly different pooled client ...
await query("COMMIT");
```

`BEGIN` acquires a client and returns it to the pool immediately. The following statements may run on **different** clients, and `COMMIT` may run on a third. In practice this means:

- **No atomicity.** A failure mid-sequence leaves the earlier statements committed.
- **Wasted locks.** `BEGIN` on one client opens a transaction nobody ever commits; it is released back to the pool still open, and the pool's next user inherits it.
- **Silent corruption under concurrency.** Two requests interleaving on the pool can see each other's uncommitted rows or deadlock unpredictably.

This is a pre-existing defect, not a regression. Nothing in the current test suite catches it because tests run serially (`random: false`) against a single-process database.

## 2. The fix (helper already exists after 6.12)

`connection.ts` gains:

```ts
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();   // the env-switched pool, NOT pgPool
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* connection already dead */ }
    throw error;
  } finally {
    client.release();
  }
}
```

**`pgPool` must never be used here.** It is constructed without a `database` field and exists only so `createDBIfNotExists` can connect DB-less; `pgPool.connect()` would open a transaction against whatever database the connection defaults to.

Migration recipe per block:

1. Wrap the statements in `withTransaction(async (client) => { ... })`.
2. Replace every `query(` inside the block with `client.query(`.
3. Delete the `BEGIN` / `COMMIT` / `ROLLBACK` statements.
4. Return the value the method previously returned from inside the closure.
5. Keep the `try/catch` that maps errors to domain messages **outside** `withTransaction`, so rollback happens before the message mapping.

## 3. Inventory (post-6.12)

62 `query("BEGIN")` blocks, 64 `COMMIT`, 64 `ROLLBACK` across 17 files. Phase 6.12 converts `Role.model.ts` (6) and `Permission.model.ts` (1). **55 blocks remain:**

| File | Blocks | Notes |
|---|---:|---|
| `src/app/models/Patient.model.ts` | 12 | Largest. Contains a **double-COMMIT** (L231 and L239 on conditional paths). |
| `src/app/cron/patientAutoRenewalCron.ts` | 7 | **Nests `BEGIN` inside loops**; a throw mid-loop leaves earlier iterations' `BEGIN`s open. |
| `src/app/models/Insurance.model.ts` | 7 | Payment posting paths — financial. |
| `src/app/models/Service.model.ts` | 5 | Price/drug association writes. |
| `src/app/models/PriceList.model.ts` | 4 | **Commits twice on one `BEGIN`** (L106 and L119, mutually exclusive branches). Highest-risk file to convert mechanically. |
| `src/app/models/MedicalSupplyShipment.model.ts` | 3 | Inventory + pricing. |
| `src/app/models/Doctor.model.ts` | 3 | |
| `src/app/models/DrugShipment.model.ts` | 3 | Inventory + pricing. |
| `src/app/cron/employeePaymentCron.ts` | 2 | Loop-nested. |
| `src/app/models/DrugUsage.model.ts` | 2 | |
| `src/app/models/MedicalSupplyUsage.model.ts` | 2 | |
| `src/app/models/EmployeePayment.model.ts` | 2 | Financial. |
| `src/app/models/DrugCard.model.ts` | 1 | |
| `src/app/models/MedicalSupply.model.ts` | 1 | |
| `src/app/models/DrugTransaction.model.ts` | 1 | |

The 62-vs-64 mismatch is itself evidence: at least two blocks have conditional `COMMIT`/`ROLLBACK` paths that a naive find-and-replace will get wrong.

## 4. Known hazards

1. **Double commit.** `PriceList.model.ts` (L106/L119) and `Patient.model.ts` (L231/L239) commit on mutually exclusive branches. After conversion, the branch must `return` from the closure rather than commit — otherwise `withTransaction` commits twice and the second `COMMIT` throws `no transaction in progress`.
2. **Loop-nested `BEGIN`.** `patientAutoRenewalCron.ts` and `employeePaymentCron.ts` open a transaction per iteration. Convert the whole loop into one transaction only if the iteration is genuinely atomic; otherwise wrap each iteration body in its own `withTransaction` and keep the loop outside. **Decide per call site; do not blanket-rewrite.**
3. **Nested transactions.** If any block calls a model method that itself opens a transaction, wrapping both produces `WARNING: there is already a transaction in progress`. Audit call graphs before converting.
4. **Error-message contracts.** Controllers switch on `error.message` strings (`"Cannot delete role: ..."`, `"Username already exists"`, …). Keep the `throw` text identical when moving the `try/catch`.
5. **Pool exhaustion.** `withTransaction` holds a client for the whole body. Any block that awaits an HTTP call, a `setTimeout`, or another pooled `query()` inside it will deadlock under load. None are known today, but check each block.

## 5. Suggested execution order

1. **Financial models first** — `Insurance.model.ts`, `EmployeePayment.model.ts`, `PriceList.model.ts`. Money paths benefit most from real atomicity.
2. **Inventory** — `DrugShipment`, `MedicalSupplyShipment`, `DrugCard`, `DrugUsage`, `MedicalSupplyUsage`, `DrugTransaction`, `MedicalSupply`, `Service`, `Doctor`.
3. **`Patient.model.ts`** — largest, do it alone with its own review.
4. **Crons last** — they need the per-iteration vs whole-run decision, and a cron bug is only visible in production.

## 6. Acceptance criteria for the sweep

- `grep -rn 'query("BEGIN")' src/app` returns nothing outside `connection.ts`.
- Every remaining `COMMIT`/`ROLLBACK` string is gone from `src/app/models` and `src/app/cron`.
- Full backend suite green (`241` baseline at the time of writing), plus a new spec proving `withTransaction` rolls back on throw and releases the client.
- A concurrency smoke test: two parallel requests to a converted endpoint that previously raced (e.g. two `POST /api/patients` with the same payload) produce one success and one clean conflict, never a partial write.
- `npx tsc -p ./src/app/tsconfig.json` shows no new errors.

## 7. Explicitly not part of this debt

- Rewriting models to use a query builder or an ORM.
- Connection-pool sizing or `statement_timeout` tuning.
- Adding retry logic on serialization failures.
- Migrating the two converted models any further.
