import { z } from "zod"

/**
 * Record-insurance-payment schema.
 *
 * Mirrors the server-side checks in `insurance.controller.ts`:
 *   - amount > 0
 *   - both period bounds present
 *   - from strictly before to
 *   - to not in the future
 *
 * `z.coerce.number()` lets the `<input type="number">` string flow
 * straight into the form; an empty field becomes `0` and fails
 * `.positive()`, which is the message we want.
 */
export const paymentSchema = z
  .object({
    paymentAmount: z.coerce
      .number()
      .positive("insurance.validation.paymentAmountRequired"),
    paymentFrom: z.string().min(1, "insurance.validation.fromDateRequired"),
    paymentTo: z.string().min(1, "insurance.validation.toDateRequired"),
  })
  .refine(
    (values) => new Date(values.paymentFrom) < new Date(values.paymentTo),
    {
      message: "insurance.validation.toDateAfterFrom",
      path: ["paymentTo"],
    }
  )
  .refine((values) => new Date(values.paymentTo) <= new Date(), {
    message: "insurance.validation.toDateNotFuture",
    path: ["paymentTo"],
  })

export type PaymentValues = z.infer<typeof paymentSchema>
