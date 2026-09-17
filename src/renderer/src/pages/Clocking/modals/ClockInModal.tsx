"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { AlertTriangleIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { ApiError } from "@/lib/errors"
import {
  createClockIn,
  nowLocalInputValue,
  toLocalInputValue,
  updateClockIn,
} from "@/pages/Clocking/api"
import {
  clockInFormSchema,
  type ClockInFormValues,
} from "@/pages/Clocking/schemas/clocking.schema"
import type {
  ClockIn,
  CreateClockInPayload,
  EligibleEmployee,
  UpdateClockInPayload,
} from "@/pages/Clocking/types/clocking"

interface ClockInModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create. */
  clockIn: ClockIn | null
  /** Picker options — already filtered to needClockIn && isActive. */
  employees: EligibleEmployee[]
  employeesLoading?: boolean
  /** Employee ids that currently hold an open record (create-mode
   *  duplicate caution — non-blocking, §B8). */
  openEmployeeIds: ReadonlySet<number>
  onSaved: () => void
}

interface SectionHeadingProps {
  children: React.ReactNode
}

function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <h6 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
      {children}
    </h6>
  )
}

function toDefaults(
  clockIn: ClockIn | null,
): ClockInFormValues {
  return {
    employeeId: clockIn ? String(clockIn.employeeId) : "",
    clockInTime: clockIn
      ? toLocalInputValue(clockIn.clockIn)
      : nowLocalInputValue(),
    clockOutTime: clockIn?.clockOut
      ? toLocalInputValue(clockIn.clockOut)
      : "",
    payDeduction: clockIn ? String(clockIn.payDeduction) : "",
  }
}

/**
 * Create / Edit clock-in dialog (§B8 of `phase_6.8_ux_research.md`).
 *
 * Payroll-sensitive corrections: edit mode opens with a consequence
 * description + record id anchor; times are hospital-local wall
 * strings at minute precision (seconds stripped — plan A15; never
 * displayed). Create mode (D2a) hides the pay-deduction field — the
 * server auto-computes it from shift lateness. A duplicate open
 * record for the selected employee surfaces a non-blocking caution
 * (surface, don't police). Payloads differ by mode: create sends
 * `{employeeId, clockIn, clockOut}`; edit sends the full update
 * record (`clockOut: null` re-activates a completed record — plan
 * A12).
 */
export function ClockInModal({
  open,
  onOpenChange,
  clockIn,
  employees,
  employeesLoading = false,
  openEmployeeIds,
  onSaved,
}: ClockInModalProps) {
  const { t } = useTranslation()
  const isEdit = clockIn != null

  const form = useForm<ClockInFormValues>({
    resolver: zodResolver(clockInFormSchema),
    mode: "onBlur",
    defaultValues: toDefaults(clockIn),
  })

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(clockIn))
    }
  }, [open, clockIn, form])

  const employeeId = form.watch("employeeId")

  const duplicateSelected =
    !isEdit &&
    employeeId !== "" &&
    openEmployeeIds.has(Number(employeeId))

  async function onSubmit(values: ClockInFormValues) {
    if (values.employeeId === "") return
    setSubmitting(true)
    try {
      const clockOut = values.clockOutTime ? values.clockOutTime : null
      if (isEdit && clockIn) {
        const payload: UpdateClockInPayload = {
          employeeId: Number(values.employeeId),
          clockIn: values.clockInTime,
          clockOut,
          payDeduction: Number(values.payDeduction.trim() || 0),
        }
        await updateClockIn(clockIn.clockId, payload)
        toast.success(t("clocking.messages.updateSuccess"))
      } else {
        const payload: CreateClockInPayload = {
          employeeId: Number(values.employeeId),
          clockIn: values.clockInTime,
          clockOut,
        }
        await createClockIn(payload)
        toast.success(t("clocking.messages.createSuccess"))
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t("clocking.messages.saveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  function fieldError(path: keyof ClockInFormValues) {
    const error = form.formState.errors[path]
    return error
      ? [{ message: t(error.message ?? "") }]
      : undefined
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("clocking.modals.editClockIn")
              : t("clocking.modals.newClockIn")}
          </DialogTitle>
          {isEdit ? (
            <DialogDescription>
              {t("clocking.modals.editClockInDescription")}
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("clocking.help.editingRecord", {
                  clockId: clockIn?.clockId,
                })}
              </span>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <div className="flex flex-col gap-4">
            <SectionHeading>{t("clocking.fields.employee")}</SectionHeading>
            <Field>
              <FieldLabel htmlFor="clocking-employee">
                {t("clocking.fields.employee")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <NativeSelect
                id="clocking-employee"
                disabled={employeesLoading || submitting}
                aria-required="true"
                {...form.register("employeeId")}
              >
                <NativeSelectOption value="">
                  {t("clocking.placeholders.selectEmployee")}
                </NativeSelectOption>
                {employees.map((employee) => (
                  <NativeSelectOption
                    key={employee.employeeId}
                    value={String(employee.employeeId)}
                  >
                    {employee.name} ({employee.employeeType})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={fieldError("employeeId")} />
              {duplicateSelected ? (
                <p className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-light/40 p-2 text-sm">
                  <AlertTriangleIcon
                    aria-hidden
                    className="size-4 shrink-0 text-warning"
                  />
                  {t("clocking.validation.alreadyClockedIn")}
                </p>
              ) : null}
            </Field>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>{t("clocking.table.duration")}</SectionHeading>
            <div className="grid grid-cols-1 gap-4">
              <Field>
                <FieldLabel htmlFor="clocking-clock-in">
                  {t("clocking.fields.clockInTime")}
                  <span className="text-danger">*</span>
                </FieldLabel>
                <Input
                  id="clocking-clock-in"
                  type="datetime-local"
                  className="tabular-nums"
                  disabled={submitting}
                  aria-required="true"
                  {...form.register("clockInTime")}
                />
                <FieldError errors={fieldError("clockInTime")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="clocking-clock-out">
                  {t("clocking.fields.clockOutTime")}
                </FieldLabel>
                <div className="relative">
                  <Input
                    id="clocking-clock-out"
                    type="datetime-local"
                    className="tabular-nums pe-9"
                    disabled={submitting}
                    {...form.register("clockOutTime")}
                  />
                  {form.watch("clockOutTime") ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("clocking.help.optionalClockOut")}
                      className="absolute inset-e-1.5 top-1/2 -translate-y-1/2"
                      onClick={() =>
                        form.setValue("clockOutTime", "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      <XIcon aria-hidden className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("clocking.help.optionalClockOut")}
                </p>
                <FieldError errors={fieldError("clockOutTime")} />
              </Field>
              <p className="text-xs text-muted-foreground">
                {t("clocking.help.recordedLocalTime")}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>{t("clocking.table.payDeduction")}</SectionHeading>
            {isEdit ? (
              <Field>
                <FieldLabel htmlFor="clocking-deduction">
                  {t("clocking.fields.payDeduction")}
                </FieldLabel>
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 inset-s-3 -translate-y-1/2 text-sm text-muted-foreground"
                  >
                    {t("common.currency")}
                  </span>
                  <Input
                    id="clocking-deduction"
                    type="number"
                    min={0}
                    step={0.01}
                    className="tabular-nums ps-12"
                    disabled={submitting}
                    {...form.register("payDeduction")}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("clocking.help.payDeduction")}
                </p>
                <FieldError errors={fieldError("payDeduction")} />
              </Field>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("clocking.help.autoDeduction")}
              </p>
            )}
          </div>

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
                  {t("clocking.buttons.saving")}
                </>
              ) : (
                t("common.save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
