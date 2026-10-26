import { z } from "zod"

/**
 * Clear-outstanding-balance schema.
 *
 * The model rejects future dates (`clearInsuranceBalance`), so the
 * refinement mirrors that guard before the request is sent.
 */
export const clearBalanceSchema = z.object({
  clearDate: z
    .string()
    .min(1, "insurance.validation.clearDateRequired")
    .refine(
      (value) => new Date(value) <= new Date(),
      "insurance.validation.clearDateNotFuture"
    ),
})

export type ClearBalanceValues = z.infer<typeof clearBalanceSchema>
