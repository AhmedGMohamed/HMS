/**
 * English labels for the PDF chart snapshot — Phase 6.11.2.
 *
 * Kept out of `DoctorDistributionChart.tsx` because that module only exports
 * components (`react-refresh/only-export-components`), and the export surface
 * needs constants, not JSX.
 *
 * Exports are English-only (Vault 6.9 / Insurance 6.10 / Patient 6.11.1
 * parity), so these strings are intentionally untranslated.
 */

export const SNAPSHOT_LABELS = {
  patientLabel: "Patients",
  srCaption: "Patients per doctor in the selected period",
  xHeader: "Doctor",
  emptyTitle: "No doctors match the selected criteria",
} as const
