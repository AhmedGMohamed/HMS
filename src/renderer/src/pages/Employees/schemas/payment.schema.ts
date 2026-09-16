import { z } from "zod"

import type { ManualPaymentType } from "@/pages/Employees/types/employee"

/**
 * Manual payment form schema (Phase 6.7). Messages are i18n keys;
 * the amount is a form-level string coerced at submit. Conditional
 * fields follow the legacy show/hide logic — visible ⇒ required.
 */
export const paymentFormSchema = z
  .object({
    paymentAmount: z
      .string()
      .min(1, "employees.validation.paymentAmountRequired")
      .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, {
        message: "employees.validation.paymentAmountRequired",
      }),
    paymentType: z.enum(["manual", "bonus", "overtime"]),
    extraPaymentType: z.enum(["none", "per_patient", "income"]),
    extraAmount: z.string(),
    percentageScope: z
      .enum(["before_deductions", "after_deductions"])
      .or(z.literal("")),
  })
  .superRefine((form, ctx) => {
    if (form.extraPaymentType === "none") return

    /* extraAmount becomes visible → required (design.md §6.3). */
    const amount = form.extraAmount.trim()
    if (amount === "" || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraAmount"],
        message: "employees.validation.extraAmountRequired",
      })
    }

    /* percentageScope visible when income (legacy rule). */
    if (form.extraPaymentType === "income" && !form.percentageScope) {
      ctx.addIssue({
        code: "custom",
        path: ["percentageScope"],
        message: "employees.validation.percentageScopeRequired",
      })
    }
  })

export interface PaymentFormValues {
  paymentAmount: string
  paymentType: ManualPaymentType
  extraPaymentType: "none" | "per_patient" | "income"
  extraAmount: string
  percentageScope: "before_deductions" | "after_deductions" | ""
}

export function emptyPaymentForm(): PaymentFormValues {
  return {
    paymentAmount: "",
    paymentType: "manual",
    extraPaymentType: "none",
    extraAmount: "",
    percentageScope: "",
  }
}
