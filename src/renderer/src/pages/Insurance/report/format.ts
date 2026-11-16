/**
 * Re-export shim — Phase 6.11.
 *
 * The export formatters moved to `@/lib/pdf/format` so the Reports module
 * shares one implementation. Kept so the existing Insurance imports keep
 * resolving; new code should import from `@/lib/pdf`.
 */
export * from "@/lib/pdf/format"
