import { describe, expect, it } from "vitest"

import {
  editPatientSchema,
  wizardAdmissionFormSchema,
  wizardBasicFormSchema,
  wizardFormSchema,
} from "@/pages/Patients/schemas/patient.schema"

const GENDER_REQUIRED = "patients.validation.genderRequired"
const DIAGNOSIS_REQUIRED = "patients.validation.diagnosisRequired"
const DOCTOR_REQUIRED = "patients.validation.attendingDoctorRequired"
const INSURANCE_REQUIRED = "patients.validation.insuranceCompanyRequired"

/** A composite input that is valid for every step. */
const validForm = {
  basic: { name: "Ali Hassan", gender: "male" as const },
  guardian: {},
  payment: {
    paymentType: "cash" as const,
    insuranceId: null,
    insuranceCardId: "",
    insuranceFormId: "",
    pricelistId: null,
  },
  admission: {
    admitOnSave: false,
    diagnosis: "",
    quickCheck: false,
    attendingDoctorIds: [],
    attendingNurseIds: [],
  },
  medical: { referringDoctorId: null },
}

describe("wizard form schemas", () => {
  it("rejects the blank gender sentinel with exactly one gender issue", () => {
    const result = wizardBasicFormSchema.safeParse({
      name: "Ali Hassan",
      gender: "",
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toHaveLength(1)
    expect(result.error.issues[0]?.path).toEqual(["gender"])
    expect(result.error.issues[0]?.message).toBe(GENDER_REQUIRED)
  })

  it("skips admission requirements when admitOnSave is false", () => {
    const result = wizardAdmissionFormSchema.safeParse({
      admitOnSave: false,
      diagnosis: "",
      quickCheck: false,
      attendingDoctorIds: [],
      attendingNurseIds: [],
    })
    expect(result.success).toBe(true)
  })

  it("requires diagnosis and an attending doctor when admitting", () => {
    const result = wizardAdmissionFormSchema.safeParse({
      admitOnSave: true,
      diagnosis: "",
      quickCheck: false,
      attendingDoctorIds: [],
      attendingNurseIds: [],
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.map((issue) => issue.path)).toEqual([
      ["diagnosis"],
      ["attendingDoctorIds"],
    ])
    expect(result.error.issues.map((issue) => issue.message)).toEqual([
      DIAGNOSIS_REQUIRED,
      DOCTOR_REQUIRED,
    ])
  })

  it("always enforces the insurance trio, even when not admitting", () => {
    const result = wizardFormSchema.safeParse({
      ...validForm,
      payment: {
        ...validForm.payment,
        paymentType: "insurance",
      },
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toHaveLength(3)
    for (const issue of result.error.issues) {
      expect(issue.message).toBe(INSURANCE_REQUIRED)
      expect(issue.path[0]).toBe("payment")
    }
  })

  it("rejects a blank gender in the edit-patient schema", () => {
    const result = editPatientSchema.safeParse({
      name: "Ali Hassan",
      gender: "",
      paymentType: "cash",
      insuranceId: null,
      insuranceCardId: "",
      insuranceFormId: "",
      pricelistId: null,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toHaveLength(1)
    expect(result.error.issues[0]?.path).toEqual(["gender"])
    expect(result.error.issues[0]?.message).toBe(GENDER_REQUIRED)
  })
})
