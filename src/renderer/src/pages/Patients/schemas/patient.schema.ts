import { z } from "zod"

/**
 * Wizard validation schemas for `CreatePatientWizard`.
 *
 * Validation messages reference `patients.validation.*` keys so users
 * see the same English/Arabic copy as the legacy page.
 *
 * The wizard is a 4-step flow:
 *   1. Basic info (always)
 *   2. Payment (always; insurance fields conditional)
 *   3. Admission (only when `admitOnSave=true`)
 *   4. Medical (referring doctor + free diagnosis)
 *
 * Step 3 is dropped from the visible flow when the user toggles
 * `admitOnSave` off — the wizard itself still validates the underlying
 * fields so re-toggling on later doesn't accommodate stale data.
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
      if (!v.insuranceId) {
        ctx.addIssue({
          code: "custom",
          path: ["insuranceId"],
          message: VALIDATION_KEYS.insuranceCompany,
        })
      }
      if (!v.insuranceCardId || v.insuranceCardId.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["insuranceCardId"],
          message: VALIDATION_KEYS.insuranceCompany,
        })
      }
      if (!v.insuranceFormId || v.insuranceFormId.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["insuranceFormId"],
          message: VALIDATION_KEYS.insuranceCompany,
        })
      }
    }
  })

/**
 * Step 4 — Admission (conditional).
 *
 * Only validated when `admitOnSave=true`. The wizard swaps the schema
 * based on the toggle so the user's "next" press doesn't fail just
 * because they briefly flipped the toggle off.
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
 * Combined wizard schema. Discriminated by `admitOnSave` so admit
 * paths require `attendingDoctorIds` and `diagnosis`.
 *
 * We use a flat object shape so `superRefine` can traverse fields
 * directly; the wizard form itself uses namespaced paths (basic.*,
 * payment.*, …) and resolves the dotpathed RHF `trigger()` against
 * each per-step schema separately.
 */
export const wizardSchema = z
  .object({
    name: wizardBasicSchema.shape.name,
    gender: wizardBasicSchema.shape.gender,
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

    admitOnSave: wizardAdmissionSchema.shape.admitOnSave,
    diagnosis: wizardAdmissionSchema.shape.diagnosis,
    quickCheck: wizardAdmissionSchema.shape.quickCheck,
    attendingDoctorIds: wizardAdmissionSchema.shape.attendingDoctorIds,
    attendingNurseIds: wizardAdmissionSchema.shape.attendingNurseIds,

    referringDoctorId: wizardMedicalSchema.shape.referringDoctorId,
  })
  .superRefine((value, ctx) => {
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
    if (value.paymentType === "insurance") {
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
  })

export type WizardBasicValues = z.infer<typeof wizardBasicSchema>
export type WizardGuardianValues = z.infer<typeof wizardGuardianSchema>
export type WizardPaymentValues = z.infer<typeof wizardPaymentSchema>
export type WizardAdmissionValues = z.infer<typeof wizardAdmissionSchema>
export type WizardMedicalValues = z.infer<typeof wizardMedicalSchema>
export type WizardValues = z.infer<typeof wizardSchema>

/**
 * Edit Patient dialog schema (T4).
 *
 * Slices the master `wizardSchema` down to fields a non-admission
 * patient edit supports. Diagnosis / quickCheck / attending staff
 * live on the admission record and are intentionally excluded —
 * those land in their own dialogs in T7/T9 alongside their own
 * flow control.
 *
 * Gender accepts the empty string in form state so the dialog can
 * prefill a row whose stored value pre-dates the enum (sentinel: the
 * patient has `gender: ""` rather than null because the server's
 * legacy type never normalized). A `superRefine` enforces the real
 * enum at submit time so we never post a blank gender to the server.
 *
 * Insurance fields stay optional unless `paymentType === "insurance"`,
 * matching the wizard's insurance-rule toggle.
 */
export const editPatientSchema = z
  .object({
    name: wizardBasicSchema.shape.name,
    gender: z.union([
      z.literal("male"),
      z.literal("female"),
      z.literal("other"),
      z.literal(""),
    ]),
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
    if (value.gender === "") {
      ctx.addIssue({
        code: "custom",
        path: ["gender"],
        message: VALIDATION_KEYS.gender,
      })
    }
    if (value.paymentType !== "insurance") return
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
  })

export type EditPatientValues = z.infer<typeof editPatientSchema>

/** Per-step schemas in wizard-render order. */
export const wizardStepSchemas = [
  wizardBasicSchema,
  wizardGuardianSchema,
  wizardPaymentSchema,
  wizardAdmissionSchema,
  wizardMedicalSchema,
] as const

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4
