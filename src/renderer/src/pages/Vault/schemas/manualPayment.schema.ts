import { z } from "zod"

/**
 * Manual payment form schema (§3.5 of the Phase 6.9 plan; A12).
 *
 * Validation messages are i18n keys — rendered via
 * `t("vault.validation.<key>")` at display time (clocking convention:
 * `Clocking/schemas/clocking.schema.ts`). Form values stay strings
 * (native select, number input) and are coerced at submit — keeps RHF
 * input/output types identical (no zod-transform resolver mismatch).
 *
 * `min 0.01` pre-empts the backend falsy-amount 400 (amount 0 is
 * rejected server-side — backend quirk, plan §1.1).
 */
export const manualPaymentSchema = z
	.object({
		/** Raw number-input text; `""` means empty. */
		amount: z.string().min(1, "vault.validation.validAmount"),
		/** Native select value — `""` means unselected. */
		paymentType: z.string().min(1, "vault.validation.selectPaymentType"),
		/** Optional; trimmed at submit, `""` maps to `null`. */
		description: z.string().optional(),
	})
	.superRefine((v, ctx) => {
		const parsed = Number(v.amount)
		if (!Number.isFinite(parsed) || parsed < 0.01) {
			ctx.addIssue({
				code: "custom",
				path: ["amount"],
				message: "vault.validation.validAmount",
			})
		}

		if (v.paymentType !== "" && v.paymentType !== "addition" && v.paymentType !== "deduction") {
			ctx.addIssue({
				code: "custom",
				path: ["paymentType"],
				message: "vault.validation.selectPaymentType",
			})
		}
	})

export type ManualPaymentFormValues = z.infer<typeof manualPaymentSchema>
