/**
 * English labels for the PDF chart snapshot — Phase 6.11.3.
 *
 * Kept out of `NurseDistributionChart.tsx` because that module only exports
 * components (`react-refresh/only-export-components`), and the export surface
 * needs constants, not JSX.
 *
 * Exports are English-only (Vault 6.9 / Insurance 6.10 / Doctor 6.11.2
 * parity), so these strings are intentionally untranslated.
 */

export const NURSE_SNAPSHOT_LABELS = {
  hoursLabel: "Hours",
  srCaption: "Hours per nurse in the selected period",
  xHeader: "Nurse",
  emptyTitle: "No nurses match the selected criteria",
} as const
