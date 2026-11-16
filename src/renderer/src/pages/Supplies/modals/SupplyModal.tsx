"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
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
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

import { createSupply, updateSupply } from "@/pages/Supplies/api"
import {
  supplyCardSchema,
  type SupplyCardValues,
} from "@/pages/Supplies/schemas/supply.schema"
import type { MedicalSupply } from "@/pages/Supplies/types/supply"
import { ApiError } from "@/lib/errors"
import { formatInterval, parseInterval } from "@/lib/utils"

interface SupplyModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  supply?: MedicalSupply | null
  onSaved?: () => void
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
      {children}
    </h6>
  )
}

function toDefaults(supply?: MedicalSupply | null): SupplyCardValues {
  const parsed = parseInterval(supply?.frequency ?? null)
  const base: SupplyCardValues = {
    name: "",
    manufacturer: "",
    provider: "",
    isObligatoryContinuous: false,
    saleQuantity: 1,
    frequencyHours: 0,
    minStockAlert: null,
  }
  if (!supply) return base
  return {
    ...base,
    name: supply.name ?? "",
    manufacturer: supply.manufacturer ?? "",
    provider: supply.provider ?? "",
    isObligatoryContinuous: supply.isObligatoryContinuous ?? false,
    saleQuantity: supply.saleQuantity ?? 1,
    frequencyHours: parsed?.hours ?? 0,
    minStockAlert: supply.minStockAlert ?? null,
  }
}

/**
 * Create / Edit Medical Supply card dialog (design plan §6.4).
 *
 * Mirrors `DrugCardModal` with two simplifications:
 *  - No unit-conversion section (supplies have a single integer
 *    unit, never larger + smaller).
 *  - Frequency collected as a single hours-only input (the legacy
 *    supply form didn't ask for minutes/seconds; the renderer
 *    serialises `frequencyHours` into the canonical `"HH:00:00"`
 *    INTERVAL string the backend accepts).
 */
export function SupplyModal({ open, onOpenChange, supply, onSaved }: SupplyModalProps) {
  const { t } = useTranslation()
  const isEdit = supply != null

  const form = useForm<SupplyCardValues>({
    resolver: zodResolver(supplyCardSchema),
    mode: "onBlur",
    defaultValues: toDefaults(supply),
  })

  const [submitting, setSubmitting] = useState(false)
  const isObligatoryContinuous = form.watch("isObligatoryContinuous")

  useEffect(() => {
    if (open) form.reset(toDefaults(supply))
  }, [open, supply, form])

  async function onSubmit(values: SupplyCardValues) {
    setSubmitting(true)
    try {
      const frequency = formatInterval({
        hours: values.frequencyHours ?? 0,
        minutes: 0,
        seconds: 0,
      })
      const payload = {
        name: values.name.trim(),
        manufacturer: values.manufacturer?.trim() || null,
        provider: values.provider?.trim() || null,
        isObligatoryContinuous: values.isObligatoryContinuous,
        saleQuantity: values.saleQuantity,
        frequency,
        minStockAlert: values.minStockAlert ?? null,
      }
      if (isEdit) {
        await updateSupply(supply.supplyId, payload)
        toast.success(t("medicalSupplies.messages.updateSuccess"))
      } else {
        await createSupply(payload)
        toast.success(t("medicalSupplies.messages.createSuccess"))
      }
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("medicalSupplies.messages.saveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("medicalSupplies.modals.editSupply")
              : t("medicalSupplies.modals.createSupply")}
          </DialogTitle>
          {isEdit ? (
            <DialogDescription>{supply.name}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <Field>
            <FieldLabel htmlFor="sc-name">
              {t("medicalSupplies.fields.supplyName")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="sc-name" {...form.register("name")} />
            <FieldError
              errors={
                form.formState.errors.name
                  ? [{ message: t(form.formState.errors.name.message ?? "") }]
                  : undefined
              }
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sc-manufacturer">
                {t("medicalSupplies.fields.manufacturer")}
              </FieldLabel>
              <Input
                id="sc-manufacturer"
                {...form.register("manufacturer")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sc-provider">
                {t("medicalSupplies.fields.provider")}
              </FieldLabel>
              <Input id="sc-provider" {...form.register("provider")} />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="sc-saleQuantity">
              {t("medicalSupplies.fields.saleQuantity")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input
              id="sc-saleQuantity"
              type="number"
              min={1}
              {...form.register("saleQuantity", { valueAsNumber: true })}
            />
            <FieldError
              errors={
                form.formState.errors.saleQuantity
                  ? [
                      {
                        message:
                          t(form.formState.errors.saleQuantity.message ?? ""),
                      },
                    ]
                  : undefined
              }
            />
          </Field>

          <SectionHeading>
            {t("medicalSupplies.sections.additionalSettings")}
          </SectionHeading>

          <Field>
            <FieldLabel htmlFor="sc-minStock">
              {t("medicalSupplies.fields.minStockAlert")}
            </FieldLabel>
            <Input
              id="sc-minStock"
              type="number"
              min={0}
              placeholder="0"
              {...form.register("minStockAlert", {
                setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
              })}
            />
            <FieldError
              errors={
                form.formState.errors.minStockAlert
                  ? [
                      {
                        message:
                          t(form.formState.errors.minStockAlert.message ?? ""),
                      },
                    ]
                  : undefined
              }
            />
          </Field>

          <Field orientation="horizontal" className="items-center">
            <Checkbox
              id="sc-continuous"
              checked={isObligatoryContinuous}
              onCheckedChange={(v) =>
                form.setValue("isObligatoryContinuous", v === true, {
                  shouldDirty: true,
                })
              }
            />
            <FieldLabel htmlFor="sc-continuous">
              {t("medicalSupplies.fields.isObligatoryContinuous")}
            </FieldLabel>
          </Field>

          <Field>
            <FieldLabel htmlFor="sc-frequencyHours">
              {t("medicalSupplies.fields.frequency")}
            </FieldLabel>
            <Input
              id="sc-frequencyHours"
              type="number"
              min={0}
              step={1}
              placeholder="0"
              {...form.register("frequencyHours", {
                setValueAs: (v) => (v === "" || v == null ? 0 : Number(v)),
              })}
            />
          </Field>

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
                  {t("medicalSupplies.buttons.saving")}
                </>
              ) : (
                t("medicalSupplies.buttons.save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
