import { z } from "zod"

import type { ServiceType } from "@/pages/_shared/services/types"

/**
 * Service create/edit form schema (§3 of `phase_6.6_plan.md`).
 *
 * Validation messages are i18n keys — rendered via `t()` at display
 * time (established convention). Price rows are kept as raw strings in
 * the form and coerced with `Number()` at submit; a row is required
 * when it is the default list or its "Include Price List" checkbox is
 * on. Prepayment rules mirror the backend (`DrugShipment.model`
 * semantics): type + amount required when toggled, percentage 0–100.
 */

/** One per-price-list row (form-level, strings until submit). */
export const servicePriceRowSchema = z.object({
  pricelistId: z.number(),
  /** The price list is the system default → row is always included
   *  and its price is required. */
  isDefaultList: z.boolean(),
  /** Non-default lists are optional (behind an include checkbox). */
  included: z.boolean(),
  price: z.string(),
  requiresPrepayment: z.boolean(),
  /** "" = none; must be fixed|percentage when `requiresPrepayment`. */
  prepaymentType: z.string(),
  prepaymentAmount: z.string(),
})

export const serviceFormSchema = z.object({
  name: z.string().min(3, "services.validation.serviceNameLength"),
  serviceType: z
    .enum(["once", "hourly", "daily"], {
      error: "services.validation.serviceTypeRequired",
    })
    .or(z.literal("")),
  autoRenew: z.boolean(),
  autoAddOnAdmission: z.boolean(),
  priceRows: z.array(
    servicePriceRowSchema.superRefine((row, ctx) => {
      if (!row.isDefaultList && !row.included) return

      const price = row.price.trim()
      const parsedPrice = Number(price)
      if (price === "" || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["price"],
          message: "services.validation.priceRequired",
        })
      }

      if (!row.requiresPrepayment) return

      if (
        row.prepaymentType !== "fixed" &&
        row.prepaymentType !== "percentage"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["prepaymentType"],
          message: "services.validation.prepaymentAmountRequired",
        })
      }
      const amount = row.prepaymentAmount.trim()
      const parsedAmount = Number(amount)
      if (
        amount === "" ||
        !Number.isFinite(parsedAmount) ||
        parsedAmount < 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["prepaymentAmount"],
          message: "services.validation.prepaymentAmountRequired",
        })
        return
      }
      if (
        row.prepaymentType === "percentage" &&
        (parsedAmount < 0 || parsedAmount > 100)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["prepaymentAmount"],
          message: "services.validation.prepaymentPercentageRange",
        })
      }
    })
  ),
})

export type ServicePriceRowValues = z.infer<typeof servicePriceRowSchema>

/** Form values: `serviceType` keeps "" (unselected) as a valid input
 *  state; the submit path guards it via the schema error. */
export type ServiceFormValues = {
  name: string
  serviceType: ServiceType | ""
  autoRenew: boolean
  autoAddOnAdmission: boolean
  priceRows: ServicePriceRowValues[]
}
