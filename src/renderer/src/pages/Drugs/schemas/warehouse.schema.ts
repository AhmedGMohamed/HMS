import { z } from "zod"

/**
 * Warehouse create/update schema.
 */

export const warehouseSchema = z.object({
  name: z.string().trim().min(3, "pharmacy.validation.warehouseNameLength"),
  location: z.string().trim().min(5, "pharmacy.validation.locationLength"),
})

export type WarehouseValues = z.infer<typeof warehouseSchema>