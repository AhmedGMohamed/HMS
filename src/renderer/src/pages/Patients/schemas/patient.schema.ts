import { z } from "zod"

/**
 * Wizard validation schemas for `CreatePatientWizard`.
 *
 * Validation messages reference `patients.validation.*` keys so users
 * see the same English/Arabic copy as the legacy page.
 *
 * The wizard is a 5-position flow:
 *   1. Basic info (always)
 *   2. Guardian info (always; every field optional)
 *   3. Payment (always; insurance fields conditional on type)
 *   4. Admission (only when `admitOnSave=true`)
 *   5. Medical (referring doctor, optional)
 *
 * The Admission position is dropped from the visible flow when the user
 * toggles `admitOnSave` off. The form-level admission schema below skips
 * its requirements in that case, so the same schema instance serves both
 * toggle states.
 */

export const VALIDATION_KEYS = {
  name: "patients.validation.nameRequired",
  gender: "patients.validation.genderRequired",
  paymentType: "patients.validation.paymentTypeRequired",
  insuranceCompany: "patients.validation.insuranceCompanyRequired",
  diagnosis: "patients.validation.diagnosisRequired",
  attendingDoctor: "patients.validation.attendingDoctorRequired",
  nurse: "patients.validation.nurseRequired",
} as const

/**
 * Shared insurance-field validation for `paymentType === "insurance"`.
 * Requires a non-null `insuranceId`, `insuranceCardId`, and
 * `insuranceFormId`. Extracted (DRY) because the same rule is enforced
 * in two places: the wizard's payment schema and the edit-patient schema.
 */
function addInsuranceIssues(
  value: {
    insuranceId?: number | null
    insuranceCardId?: string | null
    insuranceFormId?: string | null
  },
  ctx: z.RefinementCtx
): void {
  if (!value.insuranceId) {
    ctx.addIssue({
      code: "custom",
      path: ["insuranceId"],
      message: VALIDATION_KEYS.insuranceCompany,
    })
  }
  if (!value.insuranceCardId || value.insuranceCardId.trim().length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["insuranceCardId"],
      message: VALIDATION_KEYS.insuranceCompany,
    })
  }
  if (!value.insuranceFormId || value.insuranceFormId.trim().length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["insuranceFormId"],
      message: VALIDATION_KEYS.insuranceCompany,
    })
  }
}

/**
 * Step 1 — Basic info.
 *
 * Name + gender are required. National ID is optional but when
 * present must be digits-only (legacy allowed free-form but treated
 * it as text; we tighten to digits here).
 */
export const wizardBasicSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, VALIDATION_KEYS.name),
  gender: z.enum(["male", "female", "other"], {
    error: VALIDATION_KEYS.gender,
  }),
  nationalId: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^\d+$/.test(v),
      "patients.validation.invalidFormat"
    ),
  phone: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^[+\d\s-]{6,}$/.test(v),
      "patients.validation.invalidPhone"
    ),
  address: z.string().trim().optional(),
})

/** Form-state gender: the select keeps "" as its not-chosen sentinel;
 * the canonical enum in wizardBasicSchema remains the value authority. */
const blankGenderSchema = z.union([
  wizardBasicSchema.shape.gender,
  z.literal(""),
])

function requireGenderSelection(gender: string, ctx: z.RefinementCtx): void {
  if (gender === "") {
    ctx.addIssue({ code: "custom", path: ["gender"], message: VALIDATION_KEYS.gender })
  }
}

/**
 * Form variant of the basic step: identical rules, plus the blank-gender
 * sentinel. The wizard resolver and each step's `Next` gate share this
 * single instance.
 */
export const wizardBasicFormSchema = wizardBasicSchema
  .extend({ gender: blankGenderSchema })
  .superRefine((value, ctx) => requireGenderSelection(value.gender, ctx))

/**
 * Step 2 — Guardian Info.
 *
 * All fields optional; the legacy server accepted empty guardian
 * info (the patient may not have a guardian on file). We collect
 * the four canonical fields but no per-field requirement.
 */
export const wizardGuardianSchema = z.object({
  guardianName: z.string().trim().optional(),
  guardianPhone: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^[+\d\s-]{6,}$/.test(v),
      "patients.validation.invalidPhone"
    ),
  guardianNationalId: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^\d+$/.test(v),
      "patients.validation.invalidFormat"
    ),
  guardianAddress: z.string().trim().optional(),
})

/**
 * Step 3 — Payment.
 *
 * Type is required. Insurance fields are required iff `paymentType`
 * is `insurance`. Pricelist is optional (the server falls back to
 * `defaultPriceList`).
 */
export const wizardPaymentSchema = z
  .object({
    paymentType: z.enum(["cash", "credit", "insurance"], {
      error: VALIDATION_KEYS.paymentType,
    }),
    insuranceId: z.number().int().positive().nullable().optional(),
    insuranceCardId: z.string().trim().optional(),
    insuranceFormId: z.string().trim().optional(),
    pricelistId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.paymentType === "insurance") {
      addInsuranceIssues(v, ctx)
    }
  })

/**
 * Step 4 — Admission (conditional).
 *
 * The same schema instance serves both toggle states: its `superRefine`
 * (in `wizardAdmissionFormSchema` below) skips the requirements while
 * `admitOnSave` is off, so a "next" press does not fail just because the
 * user briefly flipped the toggle off.
 *
 * `quickCheck` is a boolean — flagged for "quick-check admission"
 * rather than free text. The legacy textbox form accepted a date or
 * note here, but the server only ever treats it as a flag (see
 * `Patient.controller.ts:createPatient` `quick_check` param).
 */
export const wizardAdmissionSchema = z.object({
  admitOnSave: z.boolean(),
  diagnosis: z.string().optional(),
  quickCheck: z.boolean(),
  attendingDoctorIds: z.array(z.number().int().positive()),
  attendingNurseIds: z.array(z.number().int().positive()),
})

/** Form variant of the admission step: requirements only while admitting. */
export const wizardAdmissionFormSchema = wizardAdmissionSchema.superRefine(
  (value, ctx) => {
    /* Admission is only required when the user opts into admitting on save;
       `PatientWizardBasicStep` clears these values when the toggle goes off. */
    if (!value.admitOnSave) return
    if (!value.diagnosis || value.diagnosis.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["diagnosis"],
        message: VALIDATION_KEYS.diagnosis,
      })
    }
    if (value.attendingDoctorIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["attendingDoctorIds"],
        message: VALIDATION_KEYS.attendingDoctor,
      })
    }
  }
)

/**
 * Step 5 — Medical.
 *
 * `referringDoctorId` is intentionally optional — outpatient /
 * walk-in patients often have no referring physician. The default
 * select option is `<select>` (empty value) and may be left blank
 * without breaking validation.
 */
export const wizardMedicalSchema = z.object({
  referringDoctorId: z.number().int().positive().nullable().optional(),
})

/**
 * Namespaced composite used by the wizard's single RHF resolver. Each
 * property is the SAME schema instance the per-step `Next` gate parses,
 * so resolver and gate can never diverge.
 */
export const wizardFormSchema = z.object({
  basic: wizardBasicFormSchema,
  guardian: wizardGuardianSchema,
  payment: wizardPaymentSchema,
  admission: wizardAdmissionFormSchema,
  medical: wizardMedicalSchema,
})

export type WizardFormValues = z.infer<typeof wizardFormSchema>

export type WizardBasicValues = z.infer<typeof wizardBasicSchema>
export type WizardGuardianValues = z.infer<typeof wizardGuardianSchema>
export type WizardPaymentValues = z.infer<typeof wizardPaymentSchema>
export type WizardAdmissionValues = z.infer<typeof wizardAdmissionSchema>
export type WizardMedicalValues = z.infer<typeof wizardMedicalSchema>

/**
 * Edit Patient dialog schema (T4).
 *
 * Mirrors the wizard's basic/guardian/payment rules for the fields a
 * non-admission patient edit supports. Diagnosis / quickCheck / attending
 * staff live on the admission record and are intentionally excluded —
 * those land in their own dialogs in T7/T9 alongside their own flow
 * control.
 *
 * Gender accepts the empty string in form state so the dialog can
 * prefill a row whose stored value pre-dates the enum (sentinel: the
 * patient has `gender: ""` rather than null because the server's
 * legacy type never normalized). The shared `requireGenderSelection`
 * refinement enforces the real enum at submit time so we never post a
 * blank gender to the server.
 *
 * Insurance fields stay optional unless `paymentType === "insurance"`,
 * matching the wizard's insurance-rule toggle.
 */
export const editPatientSchema = z
  .object({
    name: wizardBasicSchema.shape.name,
    gender: blankGenderSchema,
    nationalId: wizardBasicSchema.shape.nationalId,
    phone: wizardBasicSchema.shape.phone,
    address: wizardBasicSchema.shape.address,

    guardianName: wizardGuardianSchema.shape.guardianName,
    guardianPhone: wizardGuardianSchema.shape.guardianPhone,
    guardianNationalId: wizardGuardianSchema.shape.guardianNationalId,
    guardianAddress: wizardGuardianSchema.shape.guardianAddress,

    paymentType: wizardPaymentSchema.shape.paymentType,
    insuranceId: wizardPaymentSchema.shape.insuranceId,
    insuranceCardId: wizardPaymentSchema.shape.insuranceCardId,
    insuranceFormId: wizardPaymentSchema.shape.insuranceFormId,
    pricelistId: wizardPaymentSchema.shape.pricelistId,
  })
  .superRefine((value, ctx) => {
    requireGenderSelection(value.gender, ctx)
    if (value.paymentType !== "insurance") return
    addInsuranceIssues(value, ctx)
  })

export type EditPatientValues = z.infer<typeof editPatientSchema>
