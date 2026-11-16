import { z } from "zod"

/**
 * Medical Supply Shipment create/update schema.
 *
 * Unlike drugs, medical supplies have NO unit conversion — every
 * quantity is an integer. The shipment modal collects a single
 * `quantity` field and posts it directly.
 *
 * The `expiryDate` is OPTIONAL on supplies (the server treats it as
 * nullable; the schema accepts either a non-empty ISO string or
 * `null`/`undefined`). The price-list matrix mirrors the drugs
 * behaviour (each pricelist must have a valid price, prepayment
 * fields are validated when the row is enabled).
 */

export const supplyShipmentPriceSchema = z
  .object({
    pricelistId: z.number().int().positive(),
    // A matrix row may be left at 0 (every list is seeded at 0 and the
    // modal submits only priced rows); the shipment-level refine below
    // requires at least one usable price.
    price: z
      .number({ message: "medicalSupplies.validation.invalidPrice" })
      .nonnegative("medicalSupplies.validation.invalidPrice"),
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
        message: "medicalSupplies.validation.invalidPrice",
      })
    }
  })

export const supplyShipmentSchema = z
  .object({
    warehouseId: z
      .number({ message: "medicalSupplies.validation.warehouseRequired" })
      .int()
      .positive("medicalSupplies.validation.warehouseRequired"),
    quantity: z
      .number({ message: "medicalSupplies.validation.quantityMin" })
      .int("medicalSupplies.validation.quantityMin")
      .positive("medicalSupplies.validation.quantityMin"),
    buyPrice: z
      .number({ message: "medicalSupplies.validation.buyPriceRequired" })
      .positive("medicalSupplies.validation.buyPriceRequired"),
    /** Optional ISO date string; `null` / `undefined` both accepted. */
    expiryDate: z
      .string()
      .nullable()
      .optional()
      .refine(
        (v) => v == null || v === "" || !Number.isNaN(new Date(v).getTime()),
        "medicalSupplies.validation.invalidPrice"
      ),
    prices: z.array(supplyShipmentPriceSchema).min(1),
  })
  .superRefine((v, ctx) => {
    // Resolve the price from the rows actually priced, not from the
    // first element: the seeded 0 row used to match
    // `requiresPrepayment === false` and block creation even when
    // another list carried a price.
    const hasPricedRow = v.prices.some((p) => p.price > 0)
    if (!hasPricedRow) {
      ctx.addIssue({
        code: "custom",
        path: ["prices"],
        message: "medicalSupplies.validation.defaultPriceRequired",
      })
    }
  })

export type SupplyShipmentValues = z.infer<typeof supplyShipmentSchema>
