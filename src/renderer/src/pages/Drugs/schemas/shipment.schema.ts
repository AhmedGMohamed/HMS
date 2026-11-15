import { z } from "zod"

/**
 * Shipment create/update schema.
 *
 * The renderer converts larger-unit input to a smaller-unit total before
 * submit (the submitted `quantity` payload is always smaller units). At
 * the form level we accept `quantityLarger` + `quantitySmaller` and
 * derive the resolved total in the modal; `quantity` below is the
 * already-resolved smaller-unit integer.
 */

export const shipmentPriceSchema = z
  .object({
    pricelistId: z.number().int().positive(),
    // A price-list row may legitimately be left at 0 (the matrix seeds
    // every list with 0 and the modal only submits priced rows); the
    // shipment-level refine below requires at least one usable price.
    price: z
      .number({ message: "pharmacy.validation.invalidPrice" })
      .nonnegative("pharmacy.validation.invalidPrice"),
    requiresPrepayment: z.boolean(),
    prepaymentType: z.enum(["fixed", "percentage"]).nullable(),
    prepaymentAmount: z.number().nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.requiresPrepayment) return
    if (v.prepaymentAmount == null || v.prepaymentAmount < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["prepaymentAmount"],
        message: "pharmacy.validation.prepaymentAmountRequired",
      })
    }
    if (
      v.prepaymentType === "percentage" &&
      v.prepaymentAmount != null &&
      v.prepaymentAmount > 100
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["prepaymentAmount"],
        message: "pharmacy.validation.prepaymentPercentageMax",
      })
    }
  })

export const shipmentSchema = z
  .object({
    warehouseId: z
      .number({ message: "pharmacy.validation.warehouseRequired" })
      .int()
      .positive("pharmacy.validation.warehouseRequired"),
    quantity: z
      .number({ message: "pharmacy.validation.quantityRequired" })
      .int("pharmacy.validation.quantityMin")
      .positive("pharmacy.validation.quantityMin"),
    buyPrice: z
      .number({ message: "pharmacy.validation.buyPriceRequired" })
      .positive("pharmacy.validation.buyPriceMin"),
    expiryDate: z
      .string({ message: "pharmacy.validation.expiryDateRequired" })
      .min(1, "pharmacy.validation.expiryDateRequired"),
    receivedDate: z.string().optional(),
    prices: z.array(shipmentPriceSchema).min(1),
  })
  .superRefine((v, ctx) => {
    // Resolve the default from the rows actually priced, not from the
    // first array element: the matrix seeds every price list with 0, so
    // "first row with requiresPrepayment === false" was always the 0
    // row and blocked creation even when another list had a price.
    const hasPricedRow = v.prices.some((p) => p.price > 0)
    if (!hasPricedRow) {
      ctx.addIssue({
        code: "custom",
        path: ["prices"],
        message: "pharmacy.validation.defaultPriceRequired",
      })
    }
  })

export type ShipmentValues = z.infer<typeof shipmentSchema>