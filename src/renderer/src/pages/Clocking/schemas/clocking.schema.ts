import { z } from "zod"

/**
 * Clock-in create/edit form schema (§3.3 of `phase_6.8_plan.md`).
 *
 * Validation messages are i18n keys — rendered via
 * `t("clocking.<key>")` at display time (established convention,
 * mirrors `Services/schemas/service.schema.ts`).
 *
 * Form values stay strings (employee select, `datetime-local`
 * inputs, deduction text) and are coerced at submit — keeps RHF
 * input/output types identical (no zod-transform resolver mismatch).
 */
export const clockInFormSchema = z
  .object({
    /** Native select value — `""` means unselected. */
    employeeId: z.string().min(1, "clocking.validation.employeeRequired"),
    clockInTime: z.string().min(1, "clocking.validation.clockInTimeRequired"),
    /** Optional; `""` (cleared input) is allowed and mapped to `null`
     *  at submit. */
    clockOutTime: z.string().optional().nullable(),
    /** Edit-mode only (create hides the field per D2a); coerced with
     *  `Number()` at submit. */
    payDeduction: z.string(),
  })
  .superRefine((v, ctx) => {
    const parsed = v.payDeduction.trim() === "" ? 0 : Number(v.payDeduction)
    if (!Number.isFinite(parsed) || parsed < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["payDeduction"],
        message: "clocking.validation.payDeductionInvalid",
      })
    }

    // Clock-out must be strictly after clock-in; equality invalid
    // (legacy parity — plan edge matrix).
    if (
      v.clockOutTime &&
      new Date(v.clockOutTime) <= new Date(v.clockInTime)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["clockOutTime"],
        message: "clocking.validation.clockOutAfterClockIn",
      })
    }
  })

export type ClockInFormValues = z.infer<typeof clockInFormSchema>
