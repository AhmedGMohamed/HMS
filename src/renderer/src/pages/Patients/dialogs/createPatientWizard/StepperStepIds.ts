/**
 * Wizard step indices used by `CreatePatientWizardDialog`.
 *
 * The patient-wizard has 5 positions; the Admission step is dropped
 * from the visible flow when the user toggles `admitOnSave=false`.
 *
 *   0  Basic    — name, gender, contact, address, "[ ] Admit on register"
 *   1  Guardian — guardian name / phone / national-id / address
 *   2  Payment  — type (cash | credit | insurance) + insurance fields + pricelist
 *   3  Admission (conditional) — diagnosis, attending staff, quick-check flag
 *   4  Medical  — referring-doctor picker (optional)
 *
 * `as const` makes the object a literal-typed record so members can
 * serve as both type and value.
 */
export const StepperStepIds = {
  Basic: 0,
  Guardian: 1,
  Payment: 2,
  Admission: 3,
  Medical: 4,
} as const satisfies Record<string, number>

export type StepperStepId = (typeof StepperStepIds)[keyof typeof StepperStepIds]
