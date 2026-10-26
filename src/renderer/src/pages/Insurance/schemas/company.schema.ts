import { z } from "zod"

/**
 * Add / Edit insurance company schema.
 *
 * Validation messages are `insurance.validation.*` i18n keys so the
 * dialog renders the same EN/AR copy as the rest of the module.
 * `pricelistId` stays a string in form state (`""` = "no price list")
 * because the shadcn `Select` works with string values; the modal
 * converts it to `number | null` on submit.
 */
export const companySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "insurance.validation.companyNameRequired")
    .max(255, "insurance.validation.companyNameRequired"),
  contactInfo: z
    .string()
    .max(1000, "insurance.validation.contactInfoTooLong"),
  pricelistId: z.string(),
})

export type CompanyValues = z.infer<typeof companySchema>
