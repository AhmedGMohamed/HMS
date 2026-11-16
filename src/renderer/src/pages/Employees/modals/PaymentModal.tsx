"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { ApiError } from "@/lib/errors"
import { createPayment, markPaymentPaid } from "@/pages/Employees/api"
import {
  emptyPaymentForm,
  paymentFormSchema,
  type PaymentFormValues,
} from "@/pages/Employees/schemas/payment.schema"
import type { PercentageScope } from "@/pages/Employees/types/employee"
import type { StaffSubject } from "@/pages/Employees/components/EmployeeDetailSheet"

export interface PaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The employee/doctor receiving the payment. */
  employee: StaffSubject | null
  onSaved: () => void
}

/**
 * Manual payment modal (Phase 6.7). Legacy parity on semantics:
 * creating a manual payment immediately marks it paid (Decision #7) —
 * `POST /api/employee-payments` stamps `paid_by_user_id` from the
 * token, so an un-paid manual payment would be invisible in the work
 * queue (which lists `paid_by_user_id IS NULL` rows only).
 */
export function PaymentModal({
  open,
  onOpenChange,
  employee,
  onSaved,
}: PaymentModalProps) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: emptyPaymentForm(),
    mode: "onSubmit",
  })
  const { register, handleSubmit, reset, watch, formState } = form
  const { errors } = formState

  const extraPaymentType = watch("extraPaymentType")

  useEffect(() => {
    if (!open) return
    setError(null)
    reset(emptyPaymentForm())
  }, [open, reset])

  const onSubmit = handleSubmit(async (values) => {
    if (!employee) return
    setSaving(true)
    setError(null)
    try {
      const payment = await createPayment({
        employeeId: employee.employeeId,
        paymentAmount: Number(values.paymentAmount),
        paymentType: values.paymentType,
        extraPaymentType: values.extraPaymentType,
        extraAmount:
          values.extraPaymentType !== "none" && values.extraAmount.trim() !== ""
            ? Number(values.extraAmount)
            : undefined,
        percentageScope:
          values.extraPaymentType === "income"
            ? (values.percentageScope as PercentageScope)
            : undefined,
      })
      /* Decision #7: manual payments are marked paid on creation. */
      await markPaymentPaid(payment.paymentId)
      toast.success(t("employees.messages.paymentCreateSuccess"))
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("employees.messages.paymentCreateError")
      )
    } finally {
      setSaving(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {employee
              ? t("employees.createManualPaymentFor", {
                  name: employee.name,
                })
              : t("employees.createManualPayment")}
          </DialogTitle>
          <DialogDescription>
            {t("employees.messages.paymentModalHint")}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">
              {t("employees.fields.paymentAmount")}
              <span aria-hidden className="text-destructive">
                {" "}
                *
              </span>
            </Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0"
              {...register("paymentAmount")}
            />
            {errors.paymentAmount ? (
              <p className="text-xs text-destructive">
                {t(errors.paymentAmount.message ?? "")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-type">
              {t("employees.fields.paymentType")}
              <span aria-hidden className="text-destructive">
                {" "}
                *
              </span>
            </Label>
            <NativeSelect id="payment-type" {...register("paymentType")}>
              <NativeSelectOption value="manual">
                {t("employees.paymentTypes.manual")}
              </NativeSelectOption>
              <NativeSelectOption value="bonus">
                {t("employees.paymentTypes.bonus")}
              </NativeSelectOption>
              <NativeSelectOption value="overtime">
                {t("employees.paymentTypes.overtime")}
              </NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-extra-payment-type">
              {t("employees.fields.extraPaymentType")}
              <span className="text-muted-foreground">
                {" "}
                ({t("common.optional")})
              </span>
            </Label>
            <NativeSelect
              id="payment-extra-payment-type"
              {...register("extraPaymentType")}
            >
              <NativeSelectOption value="none">
                {t("employees.paymentTypes.none")}
              </NativeSelectOption>
              <NativeSelectOption value="per_patient">
                {t("employees.paymentTypes.per_patient")}
              </NativeSelectOption>
              <NativeSelectOption value="income">
                {t("employees.paymentTypes.income")}
              </NativeSelectOption>
            </NativeSelect>
          </div>

          {extraPaymentType !== "none" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-extra-amount">
                {t("employees.fields.extraAmount")}
                <span aria-hidden className="text-destructive">
                  {" "}
                  *
                </span>
              </Label>
              <Input
                id="payment-extra-amount"
                type="number"
                step="0.01"
                min="0"
                {...register("extraAmount")}
              />
              {errors.extraAmount ? (
                <p className="text-xs text-destructive">
                  {t(errors.extraAmount.message ?? "")}
                </p>
              ) : null}
            </div>
          ) : null}

          {extraPaymentType === "income" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-percentage-scope">
                {t("employees.fields.percentageScope")}
                <span aria-hidden className="text-destructive">
                  {" "}
                  *
                </span>
              </Label>
              <NativeSelect
                id="payment-percentage-scope"
                {...register("percentageScope")}
              >
                <NativeSelectOption value="">
                  {t("employees.percentageScopes.select")}
                </NativeSelectOption>
                <NativeSelectOption value="before_deductions">
                  {t("employees.percentageScopes.before_deductions")}
                </NativeSelectOption>
                <NativeSelectOption value="after_deductions">
                  {t("employees.percentageScopes.after_deductions")}
                </NativeSelectOption>
              </NativeSelect>
              {errors.percentageScope ? (
                <p className="text-xs text-destructive">
                  {t(errors.percentageScope.message ?? "")}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2Icon aria-hidden className="me-2 size-4 animate-spin" />
                  {t("employees.buttons.savingPayment")}
                </>
              ) : (
                t("employees.savePayment")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
