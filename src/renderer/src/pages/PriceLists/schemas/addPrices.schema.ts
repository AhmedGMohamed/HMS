import { z } from "zod"

/**
 * Add Prices per-entry schemas (`PUT /api/price-lists/:id/prices`).
 *
 * The bulk endpoint accepts `price: null` entries (remove that
 * (entity, pricelist) price row) — removal entries skip price
 * validation entirely (nothing else is sent for them). Upsert entries
 * mirror each domain's existing rules: services `price >= 0`,
 * shipments `price > 0`, prepayment required ⇒ type + amount, and
 * percentage 0–100 / fixed ≥ 0 (same rules as
 * `DrugShipment.model.updateShipment`).
 *
 * All messages are `priceLists.validation.*` i18n keys, rendered via
 * `t()` at display time.
 */

const prepaymentRefinements = <T extends { requiresPrepayment: boolean; prepaymentType: "fixed" | "percentage" | null; prepaymentAmount: number | null }>(
  schema: z.ZodType<T>
) =>
  schema
    .refine(
      (e) =>
        !e.requiresPrepayment ||
        (e.prepaymentType != null && e.prepaymentAmount != null),
      { message: "priceLists.validation.prepaymentRequired" }
    )
    .refine(
      (e) =>
        e.prepaymentType !== "percentage" ||
        (e.prepaymentAmount != null &&
          e.prepaymentAmount >= 0 &&
          e.prepaymentAmount <= 100),
      { message: "priceLists.validation.prepaymentPercentage" }
    )
    .refine(
      (e) =>
        e.prepaymentType !== "fixed" ||
        (e.prepaymentAmount != null && e.prepaymentAmount >= 0),
      { message: "priceLists.validation.prepaymentFixed" }
    )

export const servicePriceEntrySchema = prepaymentRefinements(
  z.object({
    serviceId: z.number().int(),
    price: z
      .number({ message: "priceLists.validation.invalidPrice" })
      .min(0, "priceLists.validation.priceMin"),
    requiresPrepayment: z.boolean(),
    prepaymentType: z.enum(["fixed", "percentage"]).nullable(),
    prepaymentAmount: z
      .number({ message: "priceLists.validation.invalidPrice" })
      .nullable(),
  })
)

export const shipmentPriceEntrySchema = prepaymentRefinements(
  z.object({
    shipmentId: z.number().int(),
    price: z
      .number({ message: "priceLists.validation.invalidPrice" })
      .gt(0, "priceLists.validation.shipmentPriceMin"),
    requiresPrepayment: z.boolean(),
    prepaymentType: z.enum(["fixed", "percentage"]).nullable(),
    prepaymentAmount: z
      .number({ message: "priceLists.validation.invalidPrice" })
      .nullable(),
  })
)

export const supplyPriceEntrySchema = z.object({
  shipmentId: z.number().int(),
  price: z
    .number({ message: "priceLists.validation.invalidPrice" })
    .gt(0, "priceLists.validation.shipmentPriceMin"),
})

export const addPricesPayloadSchema = z.object({
  services: z.array(servicePriceEntrySchema).optional(),
  drugShipments: z.array(shipmentPriceEntrySchema).optional(),
  supplyShipments: z.array(supplyPriceEntrySchema).optional(),
})

export type ServicePriceEntryValues = z.infer<typeof servicePriceEntrySchema>
export type ShipmentPriceEntryValues = z.infer<typeof shipmentPriceEntrySchema>
export type SupplyPriceEntryValues = z.infer<typeof supplyPriceEntrySchema>
