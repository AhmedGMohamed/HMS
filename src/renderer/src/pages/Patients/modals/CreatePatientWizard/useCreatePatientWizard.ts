"use client"

import { create } from "zustand"

interface CreateWizardState {
  open: boolean
  openDialog: () => void
  closeDialog: () => void
}

/**
 * UI-only store for the Create Patient dialog.
 *
 * Lives outside `<CreatePatientWizardDialog>` so a sibling action
 * (e.g. the page header's `Register New Patient` button) can flip
 * the open state without prop-drilling. The form's own validation
 * lives in RHF; this store holds the dialog lifecycle only.
 */
export const useCreatePatientWizard = create<CreateWizardState>(
  (set) => ({
    open: false,
    openDialog: () => set({ open: true }),
    closeDialog: () => set({ open: false }),
  })
)
