/**
 * Static exports of types that don't depend on runtime-derived
 * inferred types.
 *
 * The `StaticLocale` type was anticipated by `lib/utils.ts` (returns
 * "en-US" | "ar-EG" as literal strings) — we export it here so chart
 * wrappers and any other non-React component can type a locale without
 * pulling in inferred-only types.
 */
export type StaticLocale = "en-US" | "ar-EG"
