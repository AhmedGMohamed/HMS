/**
 * Drugs module — type re-exports.
 *
 * The canonical pharmacy types live in `pages/_shared/pharmacy/types.ts`
 * (shared with the `Patients` module conceptually, though `Patients`
 * currently keeps its own pre-existing inline shapes for its billing /
 * assigned flows). This barrel gives the `Drugs` module a single,
 * discoverable import target.
 */

export * from "@/pages/_shared/pharmacy/types"