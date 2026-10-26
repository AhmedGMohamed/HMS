"use client"

/**
 * Manual payment modal — Phase 6.9 plan §3.5 (A12, D7).
 *
 * RHF + zod dialog (ClockInModal pattern): amount (min 0.01 — pre-empts the
 * backend falsy-amount 400), type (addition/deduction), optional
 * description. Entry point is gated on `manage_vault` by the page; the
 * backend re-checks anyway. `ApiError` failures keep the modal open and
 * show a persistent toast.
 */
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select"
import { ApiError } from "@/lib/errors"
import { addManualPayment } from "@/pages/Vault/api"
import {
	manualPaymentSchema,
	type ManualPaymentFormValues,
} from "@/pages/Vault/schemas/manualPayment.schema"

const EMPTY_VALUES: ManualPaymentFormValues = {
	amount: "",
	paymentType: "",
	description: "",
}

export interface ManualPaymentModalProps {
	open: boolean
	onClose: (open: boolean) => void
	/** Called after a successful POST so the page can refresh the summary. */
	onSaved: () => void
}

export function ManualPaymentModal({ open, onClose, onSaved }: ManualPaymentModalProps) {
	const { t } = useTranslation()
	const [submitting, setSubmitting] = useState(false)

	const form = useForm<ManualPaymentFormValues>({
		resolver: zodResolver(manualPaymentSchema),
		mode: "onBlur",
		defaultValues: EMPTY_VALUES,
	})

	useEffect(() => {
		if (open) {
			form.reset(EMPTY_VALUES)
		}
	}, [open, form])

	async function onSubmit(values: ManualPaymentFormValues) {
		setSubmitting(true)
		try {
			await addManualPayment({
				paymentAmount: Number(values.amount),
				paymentType: values.paymentType as "addition" | "deduction",
				description: values.description?.trim() ? values.description.trim() : null,
			})
			toast.success(t("vault.messages.manualPaymentSuccess"))
			onClose(false)
			onSaved()
		} catch (err) {
			// Persistent toast — the modal stays open so the user can retry (plan A12).
			toast.error(
				err instanceof ApiError ? err.message : t("vault.messages.manualPaymentError"),
				{ duration: Number.POSITIVE_INFINITY }
			)
		} finally {
			setSubmitting(false)
		}
	}

	function fieldError(path: "amount" | "paymentType"): string | undefined {
		if (!form.formState.errors[path]) return undefined
		if (path === "amount") return t("vault.validation.validAmount")
		return t("vault.validation.selectPaymentType")
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("vault.modals.addManualPayment")}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col gap-5"
				>
					<Field>
						<FieldLabel htmlFor="vault-payment-amount">
							{t("vault.fields.amount")}
							<span className="text-danger">*</span>
						</FieldLabel>
						<div className="relative">
							<Input
								id="vault-payment-amount"
								type="number"
								min={0.01}
								step={0.01}
								placeholder={t("vault.fields.enterAmount")}
								className="pe-12 tabular-nums"
								disabled={submitting}
								aria-required="true"
								{...form.register("amount")}
							/>
							<span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
								{t("common.currency")}
							</span>
						</div>
						<FieldError>{fieldError("amount")}</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor="vault-payment-type">
							{t("vault.fields.type")}
							<span className="text-danger">*</span>
						</FieldLabel>
						<NativeSelect
							id="vault-payment-type"
							disabled={submitting}
							aria-required="true"
							{...form.register("paymentType")}
						>
							<NativeSelectOption value="">
								{t("vault.fields.selectPaymentType")}
							</NativeSelectOption>
							<NativeSelectOption value="addition">
								{t("vault.paymentTypes.addition")}
							</NativeSelectOption>
							<NativeSelectOption value="deduction">
								{t("vault.paymentTypes.deduction")}
							</NativeSelectOption>
						</NativeSelect>
						<FieldError>{fieldError("paymentType")}</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor="vault-payment-description">
							{t("vault.fields.description")}
						</FieldLabel>
						<Textarea
							id="vault-payment-description"
							rows={3}
							placeholder={t("vault.fields.optionalDescription")}
							disabled={submitting}
							{...form.register("description")}
						/>
					</Field>

					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={() => onClose(false)} disabled={submitting}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? <Spinner className="size-4" /> : null}
							{t("vault.buttons.addPayment")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}
