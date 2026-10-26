import { z } from "zod"

/**
 * Report options schema — shared by the company report and the
 * per-patient report (both endpoints take the same four fields).
 *
 * The server rejects `start >= end`, so the refinement guards it
 * client-side and pins the error to the end-date field.
 */
export const reportSchema = z
  .object({
    startDate: z.string().min(1, "insurance.validation.startDateRequired"),
    endDate: z.string().min(1, "insurance.validation.endDateRequired"),
    includeDrugs: z.boolean(),
    includeClearedItems: z.boolean(),
  })
  .refine(
    (values) => new Date(values.startDate) < new Date(values.endDate),
    {
      message: "insurance.validation.endDateAfterStart",
      path: ["endDate"],
    }
  )

export type ReportValues = z.infer<typeof reportSchema>
