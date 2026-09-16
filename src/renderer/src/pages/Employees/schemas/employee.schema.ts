import { z } from "zod"

import type {
  EmployeeType,
  ExtraPaymentType,
  PaymentCalculation,
  PercentageScope,
  PerPatientPaymentType,
  ShiftType,
} from "@/pages/Employees/types/employee"

/**
 * Employee create/edit form schema (Phase 6.7, sectioned modal).
 *
 * Validation messages are i18n keys — rendered via `t()` at display
 * time (established convention). Numeric fields are kept as raw
 * strings in the form and coerced with `Number()` at submit.
 * Conditional rules mirror the legacy modal's show/hide logic: a
 * visible field is a required field (design.md §6.3 "required by
 * default").
 */

const optionalMoney = z
  .string()
  .refine(
    (v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
    { message: "employees.validation.invalidNumber" }
  )

export const servicePriceRowSchema = z.object({
  serviceId: z.number(),
  serviceName: z.string(),
  /** Blank = not set; otherwise a non-negative number. */
  price: optionalMoney,
  /** Marks a previously-persisted price as removed on submit. */
  removed: z.boolean(),
})

export const employeeFormSchema = z
  .object({
    employeeType: z.enum(["doctor", "nurse", "other"]),
    name: z.string().min(1, "employees.validation.nameRequired"),
    phone: z.string(),
    hireDate: z.string().min(1, "employees.validation.hireDateRequired"),
    needClockIn: z.boolean(),
    isActive: z.boolean(),
    isFacilityEmployee: z.boolean(),
    shiftType: z.enum(["morning", "night"]).or(z.literal("")),
    shiftStartTime: z.string().min(1, "employees.validation.shiftTimeRequired"),
    shiftEndTime: z.string().min(1, "employees.validation.shiftTimeRequired"),

    /* Compensation — nurse/other variant. */
    basePay: optionalMoney,
    extraPaymentType: z.enum(["none", "per_patient", "income"]),
    extraAmount: optionalMoney,
    perPatientPaymentType: z.enum(["fixed", "percentage"]).or(z.literal("")),
    percentageScope: z
      .enum(["before_deductions", "after_deductions"])
      .or(z.literal("")),

    /* Compensation — doctor variant. */
    doctorType: z
      .enum(["attending", "supervising", "referring", "outside"])
      .or(z.literal("")),
    dailyPay: optionalMoney,
    perPatientPay: optionalMoney,
    referralBonus: optionalMoney,
    paymentCalculation: z.enum(["fixed", "per_patient", "both"]),

    /* Doctor service-price rows. */
    servicePriceRows: z.array(servicePriceRowSchema),
  })
  .superRefine((form, ctx) => {
    const isDoctor = form.employeeType === "doctor"

    if (isDoctor) {
      if (!form.doctorType) {
        ctx.addIssue({
          code: "custom",
          path: ["doctorType"],
          message: "employees.validation.doctorTypeRequired",
        })
      }
    } else {
      /* Legacy show/hide rules → required-when-visible. */
      if (form.extraPaymentType === "per_patient" && !form.perPatientPaymentType) {
        ctx.addIssue({
          code: "custom",
          path: ["perPatientPaymentType"],
          message: "employees.validation.perPatientPaymentTypeRequired",
        })
      }
      const needsScope =
        form.perPatientPaymentType === "percentage" ||
        form.extraPaymentType === "income"
      if (needsScope && !form.percentageScope) {
        ctx.addIssue({
          code: "custom",
          path: ["percentageScope"],
          message: "employees.validation.percentageScopeRequired",
        })
      }
    }

    for (const [index, row] of form.servicePriceRows.entries()) {
      if (row.price.trim() === "" || row.removed) continue
      const parsed = Number(row.price)
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["servicePriceRows", index, "price"],
          message: "employees.validation.invalidNumber",
        })
      }
    }
  })

export type ServicePriceRowValues = z.infer<typeof servicePriceRowSchema>

export interface EmployeeFormValues {
  employeeType: EmployeeType
  name: string
  phone: string
  hireDate: string
  needClockIn: boolean
  isActive: boolean
  isFacilityEmployee: boolean
  shiftType: ShiftType | ""
  shiftStartTime: string
  shiftEndTime: string

  basePay: string
  extraPaymentType: ExtraPaymentType
  extraAmount: string
  perPatientPaymentType: PerPatientPaymentType | ""
  percentageScope: PercentageScope | ""

  doctorType: import("@/pages/Employees/types/employee").DoctorType | ""
  dailyPay: string
  perPatientPay: string
  referralBonus: string
  paymentCalculation: PaymentCalculation

  servicePriceRows: ServicePriceRowValues[]
}

/** Defaults for the create flow (`type` pre-selected from the tab). */
export function emptyEmployeeForm(type: EmployeeType): EmployeeFormValues {
  return {
    employeeType: type,
    name: "",
    phone: "",
    hireDate: "",
    needClockIn: false,
    isActive: true,
    isFacilityEmployee: true,
    shiftType: "",
    shiftStartTime: "",
    shiftEndTime: "",

    basePay: "",
    extraPaymentType: "none",
    extraAmount: "",
    perPatientPaymentType: "",
    percentageScope: "",

    doctorType: "",
    dailyPay: "",
    perPatientPay: "",
    referralBonus: "",
    paymentCalculation: "fixed",

    servicePriceRows: [],
  }
}
