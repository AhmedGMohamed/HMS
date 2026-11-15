"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { InfoIcon } from "lucide-react"
import { z } from "zod"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { FieldInput } from "@/pages/Insurance/modals/FieldControls"

import { ApiError } from "@/lib/errors"
import { createPayment } from "@/pages/Insurance/api"
import {
  paymentSchema,
  type PaymentValues,
} from "@/pages/Insurance/schemas/payment.schema"

/** Form-state shape: `z.coerce.number()` widens the input to `unknown`. */
type PaymentFormValues = z.input<typeof paymentSchema>

export interface PaymentModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  companyId: number | null
  companyName: string
  onSaved: () => void
}

/** `yyyy-mm-dd` for `<input type="date">` (local time, no TZ drift). */
function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Previous calendar month bounds — the legacy default for this dialog
 * (`new Date(y, m-1, 1)` → `new Date(y, m, 0)`).
 */
function previousMonthRange(): { from: string; to: string } {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const to = new Date(today.getFullYear(), today.getMonth(), 0)
  return { from: toDateInputValue(from), to: toDateInputValue(to) }
}

function toDefaults(): PaymentFormValues {
  const { from, to } = previousMonthRange()
  return { paymentAmount: 0, paymentFrom: from, paymentTo: to }
}

/**
 * Record insurance payment dialog (Phase 6.10 plan §3, Decision #11).
 *
 * Amount + covered period. Defaults to the previous calendar month
 * (legacy parity). The note explains that the period feeds the report
 * calculations — it does not clear anything by itself.
 */
export function PaymentModal({
  open,
  onOpenChange,
  companyId,
  companyName,
  onSaved,
}: PaymentModalProps) {
  const { t } = useTranslation()
  const form = useForm<PaymentFormValues, unknown, PaymentValues>({
    resolver: zodResolver(paymentSchema),
    mode: "onBlur",
    defaultValues: toDefaults(),
  })

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) form.reset(toDefaults())
  }, [open, form])

  async function onSubmit(values: PaymentValues) {
    if (companyId == null) return
    setSubmitting(true)
    try {
      await createPayment(companyId, {
        paymentAmount: values.paymentAmount,
        paymentFrom: values.paymentFrom,
        paymentTo: values.paymentTo,
      })
      toast.success(t("insurance.messages.paymentSuccess"))
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t("insurance.messages.paymentError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("insurance.modals.recordPayment")}</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit, (fieldErrors) => {
            /* Validation failed — focus the first invalid field
               (design.md §6.3). */
            const firstKey = Object.keys(fieldErrors)[0]
            if (firstKey) form.setFocus(firstKey as keyof PaymentFormValues)
          })}
          className="flex flex-col gap-5"
        >
          <Field invalid={Boolean(errors.paymentAmount)}>
            <FieldLabel>
              {t("insurance.fields.paymentAmount")}
              <span aria-hidden className="text-danger">
                *
              </span>
            </FieldLabel>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("common.currency")}
              </span>
              <FieldInput
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                required
                invalid={Boolean(errors.paymentAmount)}
                {...form.register("paymentAmount")}
              />
            </div>
            <FieldError
              errors={
                errors.paymentAmount
                  ? [{ message: t(errors.paymentAmount.message ?? "") }]
                  : undefined
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field invalid={Boolean(errors.paymentFrom)}>
              <FieldLabel>
                {t("insurance.fields.paymentPeriodFrom")}
                <span aria-hidden className="text-danger">
                  *
                </span>
              </FieldLabel>
              <FieldInput
                type="date"
                required
                invalid={Boolean(errors.paymentFrom)}
                {...form.register("paymentFrom")}
              />
              <FieldError
                errors={
                  errors.paymentFrom
                    ? [{ message: t(errors.paymentFrom.message ?? "") }]
                    : undefined
                }
              />
            </Field>

            <Field invalid={Boolean(errors.paymentTo)}>
              <FieldLabel>
                {t("insurance.fields.paymentPeriodTo")}
                <span aria-hidden className="text-danger">
                  *
                </span>
              </FieldLabel>
              <FieldInput
                type="date"
                required
                invalid={Boolean(errors.paymentTo)}
                {...form.register("paymentTo")}
              />
              <FieldError
                errors={
                  errors.paymentTo
                    ? [{ message: t(errors.paymentTo.message ?? "") }]
                    : undefined
                }
              />
            </Field>
          </div>

          <Alert className="border-primary/30 bg-primary-light/40">
            <InfoIcon aria-hidden className="text-primary" />
            <AlertDescription>
              {t("insurance.messages.paymentNote")}
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner aria-hidden className="me-1.5" />
                  {t("insurance.buttons.recordPayment")}
                </>
              ) : (
                t("insurance.buttons.recordPayment")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
