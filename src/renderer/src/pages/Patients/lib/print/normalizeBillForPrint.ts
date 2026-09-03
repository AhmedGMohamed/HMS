/**
 * Shared Bill normaliser for printable PDFs and any other consumer
 * that needs the renderer-side `DiscountScope` / `VatScope`
 * (booleans) shape regardless of how the Bill was hydrated.
 *
 * Why this exists:
 *   - The `/api/bills/:id` endpoint returns `discount_scope` and
 *     `vat_scope_custom` as **JSONB arrays** (`["services","drugs",...]`).
 *     `lib/api.ts` runs `toCamel` on every response, which only
 *     rewrites property names — values pass through unchanged — so
 *     the renderer sees `bill.discountScope: string[]` at runtime
 *     even though the type declaration claims `DiscountScope`
 *     (booleans).
 *   - Past-admission hydration already runs
 *     `discountScopeFromServer` / `vatScopeFromServer` inside
 *     `admissionsShape.coerceBill`, which is why past-admission
 *     VAT/discount compute correctly. The Billing-tab bill was
 *     never coerced — `recalcBilling` reads `.onServices` on a
 *     `string[]`, gets `undefined`, and returns `discountAmount=0`
 *     + `vatAmount=0`. That is the root cause of the "0 EGP"
 *     bug in the Profile-tab PDF.
 *   - This helper lives under `pages/Patients/lib/` so the PDF
 *     body builder, future print paths, and the Reports tab can
 *     consume it without cross-folder imports.
 *
 * Pure, side-effect free. Returns a new `Bill` with the three
 * scope fields rewritten as booleans; original Bill is untouched.
 *
 * CamelCase-only — no snake_case.
 */

import type { Bill, DiscountScope, VatScope } from "@/pages/Patients/types/patient"
import {
  discountScopeFromServer,
} from "@/pages/Patients/lib/billingTransformers"

/**
 * Coerce a wire-shape scope (string[] | booleans | null) into the
 * booleans object the renderer's `recalcBilling` expects.
 *
 * Tolerates three runtime shapes:
 *   - `string[]` — server-canonical JSONB array form
 *     (`['services','drugs','supplies','tests']`)
 *   - `DiscountScope` booleans object (already-hydrated past-admission
 *     payload, or a renderer form value)
 *   - `null` / `undefined` — falls back to ALL-cats (matches server
 *     `recalculateTotal`'s `bill.discount_scope || [...]` default).
 */
function toBooleanScope(
  raw: unknown,
  fallback:
    | DiscountScope
    | VatScope = {
      onServices: true,
      onDrugs: true,
      onSupplies: true,
      onTests: true,
    }
): DiscountScope {
  if (raw == null) return { ...fallback }
  if (Array.isArray(raw)) {
    return discountScopeFromServer(raw as string[])
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    return {
      onServices: Boolean(obj.onServices),
      onDrugs: Boolean(obj.onDrugs),
      onSupplies: Boolean(obj.onSupplies),
      onTests: Boolean(obj.onTests),
    }
  }
  return { ...fallback }
}

/**
 * Returns a new `Bill` with `discountScope`, `vatScope`, and
 * `vatScopeCustom` rewritten as `DiscountScope` booleans objects
 * so `recalcBilling` (and any other booleans-aware consumer) reads
 * `.onServices` / `.onDrugs` / `.onSupplies` / `.onTests` reliably.
 *
 * All other fields are passed through unchanged. The input Bill
 * is not mutated.
 */
export function normalizeBillForPrint(bill: Bill): Bill {
  return {
    ...bill,
    discountScope: toBooleanScope(bill.discountScope),
    vatScope: toBooleanScope(bill.vatScope) as VatScope,
    vatScopeCustom: (toBooleanScope(bill.vatScopeCustom) as VatScope),
  }
}
