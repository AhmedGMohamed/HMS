import { z } from "zod"

/**
 * Drug Card create/update schema.
 *
 * Validation messages reference the `pharmacy.validation.*` i18n keys so
 * users see the same English/Arabic copy as the legacy drugs page.
 */

export const unitConversionSchema = z.object({
  larger: z.string().trim().min(1, "pharmacy.validation.largerUnitRequired"),
  smaller: z.string().trim().min(1, "pharmacy.validation.smallerUnitRequired"),
  ratio: z
    .number({ message: "pharmacy.validation.conversionRatioMin" })
    .int("pharmacy.validation.conversionRatioMin")
    .positive("pharmacy.validation.conversionRatioMin"),
})

export const drugCardSchema = z.object({
  name: z.string().trim().min(3, "pharmacy.validation.drugNameLength"),
  manufacturer: z.string().trim().optional(),
  provider: z.string().trim().optional(),
  isObligatoryContinuous: z.boolean(),
  saleQuantity: z
    .number({ message: "pharmacy.validation.saleQuantityMin" })
    .int("pharmacy.validation.saleQuantityMin")
    .positive("pharmacy.validation.saleQuantityMin"),
  /**
   * Frequency split into three numeric components. The form exposes
   * separate "hours / minutes / seconds" inputs; on submit the
   * renderer serialises them to the canonical `"HH:MM:SS"` string the
   * backend's `INTERVAL` column accepts.
   *
   * Validation: each part is a non-negative integer; the minutes and
   * seconds parts must be < 60 to match the PostgreSQL `INTERVAL` form.
   */
  frequencyHours: z
    .number({ message: "pharmacy.validation.frequencyInvalid" })
    .int("pharmacy.validation.frequencyInvalid")
    .nonnegative("pharmacy.validation.frequencyInvalid")
    .optional(),
  frequencyMinutes: z
    .number({ message: "pharmacy.validation.frequencyInvalid" })
    .int("pharmacy.validation.frequencyInvalid")
    .nonnegative("pharmacy.validation.frequencyInvalid")
    .max(59, "pharmacy.validation.frequencyInvalid")
    .optional(),
  frequencySeconds: z
    .number({ message: "pharmacy.validation.frequencyInvalid" })
    .int("pharmacy.validation.frequencyInvalid")
    .nonnegative("pharmacy.validation.frequencyInvalid")
    .max(59, "pharmacy.validation.frequencyInvalid")
    .optional(),
  minStockAlert: z
    .number({ message: "pharmacy.validation.minStockNegative" })
    .int("pharmacy.validation.minStockNegative")
    .nonnegative("pharmacy.validation.minStockNegative")
    .nullable()
    .optional(),
  maxDaysExpiryAlert: z
    .number({ message: "pharmacy.validation.expiryDaysNegative" })
    .int("pharmacy.validation.expiryDaysNegative")
    .nonnegative("pharmacy.validation.expiryDaysNegative")
    .nullable()
    .optional(),
  unitConversion: unitConversionSchema,
})

export type DrugCardValues = z.infer<typeof drugCardSchema>