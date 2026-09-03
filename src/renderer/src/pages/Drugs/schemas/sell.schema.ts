import { z } from "zod"

/**
 * Direct-sale transaction schema.
 *
 * `quantity` is the resolved smaller-unit total derived from the
 * dual-unit inputs (`quantityLarger * ratio + quantitySmaller`). The
 * `<= available` bound is enforced by the modal against the shipment's
 * remaining stock and surfaced via `insufficientQuantity`.
 */

export const sellSchema = z
  .object({
    transactionType: z.enum(["patient", "check", "outside"], {
      error: "pharmacy.validation.transactionTypeRequired",
    }),
    patientId: z.number().int().positive().nullable().optional(),
    quantityLarger: z.number().int().nonnegative(),
    quantitySmaller: z.number().int().nonnegative(),
    ratio: z.number().int().positive(),
    priceListId: z
      .number({ message: "pharmacy.validation.priceListRequired" })
      .int()
      .positive("pharmacy.validation.priceListRequired"),
    totalPrice: z
      .number({ message: "pharmacy.validation.invalidPrice" })
      .positive("pharmacy.validation.invalidPrice"),
  })
  .superRefine((v, ctx) => {
    if (v.transactionType !== "outside" && v.patientId == null) {
      ctx.addIssue({
        code: "custom",
        path: ["patientId"],
        message: "pharmacy.validation.patientRequired",
      })
    }
    const resolvedQty = v.quantityLarger * v.ratio + v.quantitySmaller
    if (resolvedQty <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quantityLarger"],
        message: "pharmacy.validation.quantityMin",
      })
    }
  })

export type SellValues = z.infer<typeof sellSchema>

/** Helper: resolve the smaller-unit total from dual-unit inputs. */
export function resolveQuantity(
  larger: number,
  smaller: number,
  ratio: number
): number {
  return larger * ratio + smaller
}