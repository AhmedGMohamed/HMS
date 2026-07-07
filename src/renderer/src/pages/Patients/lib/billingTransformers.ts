import type {
  DiscountScope,
  VatScope,
} from "@/pages/Patients/types/patient"

/* ----------------------------------------------------------------
 * Transformers — DiscountScope <-> server JSONB array
 *
 * The renderer stores scope as a discriminated booleans object so
 * RHF + checkbox groups land in the same shape, identical to the
 * legacy `discountscope` JSONB array of strings
 *   ['services', 'drugs', 'supplies', 'tests']
 * Legacy default is "all four included".
 * ---------------------------------------------------------------- */

export const ALL_DISCOUNT_SCOPE_KEYS = [
  "services",
  "drugs",
  "supplies",
  "tests",
] as const

export type DiscountScopeKey = (typeof ALL_DISCOUNT_SCOPE_KEYS)[number]

export function discountScopeFromServer(
  arr: string[] | null | undefined
): DiscountScope {
  const set = new Set(arr ?? ALL_DISCOUNT_SCOPE_KEYS)
  return {
    onServices: set.has("services"),
    onDrugs: set.has("drugs"),
    onSupplies: set.has("supplies"),
    onTests: set.has("tests"),
  }
}

export function discountScopeToServer(scope: DiscountScope): string[] {
  const keys: string[] = []
  if (scope.onServices) keys.push("services")
  if (scope.onDrugs) keys.push("drugs")
  if (scope.onSupplies) keys.push("supplies")
  if (scope.onTests) keys.push("tests")
  return keys
}

export function vatScopeFromServer(
  arr: string[] | null | undefined
): VatScope {
  const set = new Set(arr ?? ALL_DISCOUNT_SCOPE_KEYS)
  return {
    onServices: set.has("services"),
    onDrugs: set.has("drugs"),
    onSupplies: set.has("supplies"),
    onTests: set.has("tests"),
  }
}

export function vatScopeToServer(scope: VatScope): string[] {
  const keys: string[] = []
  if (scope.onServices) keys.push("services")
  if (scope.onDrugs) keys.push("drugs")
  if (scope.onSupplies) keys.push("supplies")
  if (scope.onTests) keys.push("tests")
  return keys
}