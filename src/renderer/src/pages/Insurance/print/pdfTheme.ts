/**
 * Re-export shim — Phase 6.11.
 *
 * The theme moved to `@/lib/pdf/pdfTheme` so the Reports module (and any
 * future report page) shares one implementation. Kept so the existing
 * Insurance imports keep resolving; new code should import from `@/lib/pdf`.
 */
export * from "@/lib/pdf/pdfTheme"
