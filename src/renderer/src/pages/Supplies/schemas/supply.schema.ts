import { z } from "zod"

/**
 * Medical Supply Card create/update schema.
 *
 * Validation messages reference the `medicalSupplies.validation.*`
 * i18n keys so users see the same English/Arabic copy as the legacy
 * supplies page. `frequency` is serialised by the modal into a
 * `HH:MM:SS` INTERVAL string before submit (the backend accepts the
 * same `INTERVAL` shape as drugs, but the supply modal collects
 * `frequencyHours` only — supplies don't need minutes/seconds
 * granularity per the legacy form).
 */

export const supplyCardSchema = z.object({
  name: z.string().trim().min(3, "medicalSupplies.validation.supplyNameLength"),
  manufacturer: z.string().trim().optional(),
  provider: z.string().trim().optional(),
  isObligatoryContinuous: z.boolean(),
  saleQuantity: z
    .number({ message: "medicalSupplies.validation.saleQuantityMin" })
    .int("medicalSupplies.validation.saleQuantityMin")
    .positive("medicalSupplies.validation.saleQuantityMin"),
  /**
   * Frequency split into a single non-negative integer (hours). The
   * legacy supply form collected just hours, unlike drugs which split
   * hours/minutes/seconds. The renderer serialises this directly into
   * the `"HH:00:00"` INTERVAL string on submit.
   */
  frequencyHours: z
    .number()
    .int()
    .nonnegative()
    .optional(),
  minStockAlert: z
    .number({ message: "medicalSupplies.validation.minStockNegative" })
    .int("medicalSupplies.validation.minStockNegative")
    .nonnegative("medicalSupplies.validation.minStockNegative")
    .nullable()
    .optional(),
})

export type SupplyCardValues = z.infer<typeof supplyCardSchema>
