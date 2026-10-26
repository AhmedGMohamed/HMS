"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { TriangleAlertIcon, UserCheckIcon } from "lucide-react"

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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"

import {
  reportSchema,
  type ReportValues,
} from "@/pages/Insurance/schemas/report.schema"
import type { ReportPayload } from "@/pages/Insurance/types/insurance"

export interface ReportOptionsModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  title: string
  description?: string
  /** Patient banner (patient report only). */
  patientName?: string
  /** Explanatory warning text below the options. */
  note: string
  submitting: boolean
  onSubmit: (payload: ReportPayload) => void | Promise<void>
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Current-month range — the legacy default for both report dialogs. */
function currentMonthRange(): { from: string; to: string } {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: toDateInputValue(from), to: toDateInputValue(today) }
}

function toDefaults(): ReportValues {
  const { from, to } = currentMonthRange()
  return {
    startDate: from,
    endDate: to,
    includeDrugs: true,
    includeClearedItems: false,
  }
}

/**
 * Shared report-options form (Phase 6.10 plan §3, Decision #12).
 *
 * Both report entry points ask for the same four values, so the form
 * lives here and the two thin wrappers (`ReportModal`,
 * `PatientReportModal`) only supply copy + the patient banner.
 *
 * Defaults: current month → today, drugs **included**, cleared items
 * **excluded** (legacy parity).
 */
export function ReportOptionsModal({
  open,
  onOpenChange,
  title,
  description,
  patientName,
  note,
  submitting,
  onSubmit,
}: ReportOptionsModalProps) {
  const { t } = useTranslation()
  const form = useForm<ReportValues>({
    resolver: zodResolver(reportSchema),
    mode: "onBlur",
    defaultValues: toDefaults(),
  })

  useEffect(() => {
    if (open) form.reset(toDefaults())
  }, [open, form])

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit({
              startDate: values.startDate,
              endDate: values.endDate,
              includeDrugs: values.includeDrugs,
              includeClearedItems: values.includeClearedItems,
            })
          })}
          className="flex flex-col gap-5"
        >
          {patientName ? (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary-light/40 px-3 py-2 text-sm">
              <UserCheckIcon aria-hidden className="size-4 text-primary" />
              <span className="font-medium text-foreground">
                {t("insurance.fields.patient")}:
              </span>
              <span className="text-foreground">{patientName}</span>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="report-start-date">
                {t("common.startDate")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="report-start-date"
                type="date"
                {...form.register("startDate")}
              />
              <FieldError
                errors={
                  errors.startDate
                    ? [{ message: t(errors.startDate.message ?? "") }]
                    : undefined
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="report-end-date">
                {t("common.endDate")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="report-end-date"
                type="date"
                {...form.register("endDate")}
              />
              <FieldError
                errors={
                  errors.endDate
                    ? [{ message: t(errors.endDate.message ?? "") }]
                    : undefined
                }
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {t("insurance.fields.reportOptions")}
            </p>

            <Controller
              control={form.control}
              name="includeDrugs"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center">
                  <Checkbox
                    id="report-include-drugs"
                    checked={field.value}
                    disabled={submitting}
                    onCheckedChange={(next) => field.onChange(next === true)}
                  />
                  <FieldLabel
                    htmlFor="report-include-drugs"
                    className="font-normal"
                  >
                    {t("insurance.fields.includeDrugs")}
                  </FieldLabel>
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="includeClearedItems"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center">
                  <Checkbox
                    id="report-include-cleared"
                    checked={field.value}
                    disabled={submitting}
                    onCheckedChange={(next) => field.onChange(next === true)}
                  />
                  <FieldLabel
                    htmlFor="report-include-cleared"
                    className="font-normal"
                  >
                    {t("insurance.fields.includeClearedItems")}
                  </FieldLabel>
                </Field>
              )}
            />
          </div>

          <Alert className="border-warning/40 bg-warning-light/40">
            <TriangleAlertIcon aria-hidden className="text-warning" />
            <AlertDescription>{note}</AlertDescription>
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
                  {t("insurance.buttons.generateReport")}
                </>
              ) : (
                t("insurance.buttons.generateReport")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
