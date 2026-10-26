"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { TriangleAlertIcon } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"

import { ApiError } from "@/lib/errors"
import { clearBalance } from "@/pages/Insurance/api"
import {
  clearBalanceSchema,
  type ClearBalanceValues,
} from "@/pages/Insurance/schemas/clearBalance.schema"

export interface ClearBalanceModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  companyId: number | null
  companyName: string
  onSaved: () => void
}

function todayInputValue(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Clear outstanding balance dialog (Phase 6.10 plan §3, Decision #13).
 *
 * Writes `last_cleared_date` on the company. Everything generated on or
 * before that date drops out of future outstanding calculations, so the
 * dialog carries the legacy warning verbatim. Defaults to today.
 */
export function ClearBalanceModal({
  open,
  onOpenChange,
  companyId,
  companyName,
  onSaved,
}: ClearBalanceModalProps) {
  const { t } = useTranslation()
  const form = useForm<ClearBalanceValues>({
    resolver: zodResolver(clearBalanceSchema),
    mode: "onBlur",
    defaultValues: { clearDate: todayInputValue() },
  })

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) form.reset({ clearDate: todayInputValue() })
  }, [open, form])

  async function onSubmit(values: ClearBalanceValues) {
    if (companyId == null) return
    setSubmitting(true)
    try {
      await clearBalance(companyId, values.clearDate)
      toast.success(t("insurance.messages.clearBalanceSuccess"))
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t("insurance.messages.clearBalanceError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("insurance.modals.clearBalance")}</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
        >
          <Field>
            <FieldLabel htmlFor="clear-date">
              {t("insurance.fields.clearDate")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input
              id="clear-date"
              type="date"
              max={todayInputValue()}
              {...form.register("clearDate")}
            />
            <FieldDescription>
              {t("insurance.fields.clearDateHelp")}
            </FieldDescription>
            <FieldError
              errors={
                errors.clearDate
                  ? [{ message: t(errors.clearDate.message ?? "") }]
                  : undefined
              }
            />
          </Field>

          <Alert className="border-warning/40 bg-warning-light/40">
            <TriangleAlertIcon aria-hidden className="text-warning" />
            <AlertDescription>
              {t("insurance.messages.clearBalanceWarning")}
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
                  {t("insurance.buttons.clearBalance")}
                </>
              ) : (
                t("insurance.buttons.clearBalance")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
