import { z } from "zod"

/**
 * Price List create/update schema.
 *
 * Validation messages reference the `priceLists.validation.*` i18n
 * keys so users see the same English/Arabic copy as the legacy
 * price-lists page.
 */
export const priceListSchema = z.object({
  name: z.string().trim().min(3, "priceLists.validation.nameLength"),
  isDefault: z.boolean(),
})

export type PriceListValues = z.infer<typeof priceListSchema>
