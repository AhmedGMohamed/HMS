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
import { Badge } from "@/components/ui/badge"

import { createDrugCard, updateDrugCard } from "@/pages/Drugs/api"
import {
  drugCardSchema,
  type DrugCardValues,
} from "@/pages/Drugs/schemas/drug.schema"
import type { DrugCard } from "@/pages/Drugs/types/drug"
import { ApiError } from "@/lib/errors"
import { formatInterval, parseInterval } from "@/lib/utils"

interface DrugCardModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  drug?: DrugCard | null
  onSaved?: () => void
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
      {children}
    </h6>
  )
}

function toDefaults(drug?: DrugCard | null): DrugCardValues {
  const parsed = parseInterval(drug?.frequency ?? null)
  const base: DrugCardValues = {
    name: "",
    manufacturer: "",
    provider: "",
    isObligatoryContinuous: false,
    saleQuantity: 1,
    frequencyHours: 0,
    frequencyMinutes: 0,
    frequencySeconds: 0,
    minStockAlert: null,
    maxDaysExpiryAlert: null,
    unitConversion: { larger: "", smaller: "", ratio: 1 },
  }
  if (!drug) return base
  return {
    ...base,
    name: drug.name ?? "",
    manufacturer: drug.manufacturer ?? "",
    provider: drug.provider ?? "",
    isObligatoryContinuous: drug.isObligatoryContinuous ?? false,
    saleQuantity: drug.saleQuantity ?? 1,
    frequencyHours: parsed?.hours ?? 0,
    frequencyMinutes: parsed?.minutes ?? 0,
    frequencySeconds: parsed?.seconds ?? 0,
    minStockAlert: drug.minStockAlert ?? null,
    maxDaysExpiryAlert: drug.maxDaysExpiryAlert ?? null,
    unitConversion: {
      larger: drug.unitConversion?.larger ?? "",
      smaller: drug.unitConversion?.smaller ?? "",
      ratio: drug.unitConversion?.ratio ?? 1,
    },
  }
}

/**
 * Create / Edit Drug Card dialog (§6.1 "Create New Drug" entry point).
 *
 * Fields: name, manufacturer, provider, sale quantity, unit-conversion
 * (larger/smaller/ratio with a live preview badge), and the alert /
 * continuous-dosage settings. On submit calls the API and surfaces a
 * Sonner toast; the parent refreshes the list on success.
 */
export function DrugCardModal({
  open,
  onOpenChange,
  drug,
  onSaved,
}: DrugCardModalProps) {
  const { t } = useTranslation()
  const isEdit = drug != null

  const form = useForm<DrugCardValues>({
    resolver: zodResolver(drugCardSchema),
    mode: "onBlur",
    defaultValues: toDefaults(drug),
  })

  const [submitting, setSubmitting] = useState(false)
  const isObligatoryContinuous = form.watch("isObligatoryContinuous")

  useEffect(() => {
    if (open) form.reset(toDefaults(drug))
  }, [open, drug, form])

  const larger = form.watch("unitConversion.larger")
  const smaller = form.watch("unitConversion.smaller")
  const ratio = form.watch("unitConversion.ratio")

  async function onSubmit(values: DrugCardValues) {
    setSubmitting(true)
    try {
      const frequency = formatInterval({
        hours: values.frequencyHours ?? 0,
        minutes: values.frequencyMinutes ?? 0,
        seconds: values.frequencySeconds ?? 0,
      })
      const payload = {
        name: values.name.trim(),
        manufacturer: values.manufacturer?.trim() || null,
        provider: values.provider?.trim() || null,
        isObligatoryContinuous: values.isObligatoryContinuous,
        saleQuantity: values.saleQuantity,
        frequency,
        minStockAlert: values.minStockAlert ?? null,
        maxDaysExpiryAlert: values.maxDaysExpiryAlert ?? null,
        unitConversion: {
          larger: values.unitConversion.larger.trim(),
          smaller: values.unitConversion.smaller.trim(),
          ratio: values.unitConversion.ratio,
        },
      }
      if (isEdit) {
        await updateDrugCard(drug.drugId, payload)
        toast.success(t("pharmacy.messages.updateSuccess"))
      } else {
        await createDrugCard(payload)
        toast.success(t("pharmacy.messages.createSuccess"))
      }
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("pharmacy.messages.saveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("pharmacy.modals.editDrug")
              : t("pharmacy.modals.createDrug")}
          </DialogTitle>
          {isEdit ? (
            <DialogDescription>{drug.name}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <Field>
            <FieldLabel htmlFor="dc-name">
              {t("pharmacy.fields.drugName")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="dc-name" {...form.register("name")} />
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
              <FieldLabel htmlFor="dc-manufacturer">
                {t("pharmacy.fields.manufacturer")}
              </FieldLabel>
              <Input id="dc-manufacturer" {...form.register("manufacturer")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dc-provider">
                {t("pharmacy.fields.provider")}
              </FieldLabel>
              <Input id="dc-provider" {...form.register("provider")} />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="dc-saleQuantity">
              {t("pharmacy.fields.saleQuantity")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input
              id="dc-saleQuantity"
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

          <SectionHeading>{t("pharmacy.sections.unitConversion")}</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="dc-larger">
                {t("pharmacy.fields.largerUnit")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input id="dc-larger" {...form.register("unitConversion.larger")} />
              <FieldError
                errors={
                  form.formState.errors.unitConversion?.larger
                    ? [
                        {
                          message:
                            form.formState.errors.unitConversion.larger
                              .message ?? "",
                        },
                      ]
                    : undefined
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dc-smaller">
                {t("pharmacy.fields.smallerUnit")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input id="dc-smaller" {...form.register("unitConversion.smaller")} />
              <FieldError
                errors={
                  form.formState.errors.unitConversion?.smaller
                    ? [
                        {
                          message:
                            form.formState.errors.unitConversion.smaller
                              .message ?? "",
                        },
                      ]
                    : undefined
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dc-ratio">
                {t("pharmacy.fields.conversionRatio")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="dc-ratio"
                type="number"
                min={1}
                step={1}
                {...form.register("unitConversion.ratio", {
                  valueAsNumber: true,
                })}
              />
              <FieldError
                errors={
                  form.formState.errors.unitConversion?.ratio
                    ? [
                        {
                          message:
                            form.formState.errors.unitConversion.ratio
                              .message ?? "",
                        },
                      ]
                    : undefined
                }
              />
            </Field>
          </div>

          {larger && smaller && ratio > 0 ? (
            <Badge variant="outline" className="w-fit">
              1 {larger} = {ratio} {smaller}
            </Badge>
          ) : null}

          <SectionHeading>
            {t("pharmacy.sections.additionalSettings")}
          </SectionHeading>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dc-minStock">
                {t("pharmacy.fields.minStockAlert")}
              </FieldLabel>
              <Input
                id="dc-minStock"
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
            <Field>
              <FieldLabel htmlFor="dc-expiryDays">
                {t("pharmacy.fields.expiryAlertDays")}
              </FieldLabel>
              <Input
                id="dc-expiryDays"
                type="number"
                min={0}
                placeholder="0"
                {...form.register("maxDaysExpiryAlert", {
                  setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
                })}
              />
              <FieldError
                errors={
                  form.formState.errors.maxDaysExpiryAlert
                    ? [
                        {
                          message:
                            form.formState.errors.maxDaysExpiryAlert.message ??
                            "",
                        },
                      ]
                    : undefined
                }
              />
            </Field>
          </div>

          <Field orientation="horizontal" className="items-center">
            <Checkbox
              id="dc-continuous"
              checked={isObligatoryContinuous}
              onCheckedChange={(v) =>
                form.setValue("isObligatoryContinuous", v === true, {
                  shouldDirty: true,
                })
              }
            />
            <FieldLabel htmlFor="dc-continuous">
              {t("pharmacy.fields.isObligatoryContinuous")}
            </FieldLabel>
          </Field>

          <Field>
            <FieldLabel>
              {t("pharmacy.fields.frequency")}
              <span className="ms-1 text-xs text-muted-foreground">
                {t("pharmacy.fields.frequencyHelper", {
                  defaultValue: "Postgres INTERVAL — HH:MM:SS",
                })}
              </span>
            </FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              <Field>
                <FieldLabel htmlFor="dc-frequencyHours" className="text-xs">
                  {t("pharmacy.fields.frequencyHours")}
                </FieldLabel>
                <Input
                  id="dc-frequencyHours"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  {...form.register("frequencyHours", {
                    setValueAs: (v) =>
                      v === "" || v == null ? 0 : Number(v),
                  })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dc-frequencyMinutes" className="text-xs">
                  {t("pharmacy.fields.frequencyMinutes")}
                </FieldLabel>
                <Input
                  id="dc-frequencyMinutes"
                  type="number"
                  min={0}
                  max={59}
                  step={1}
                  placeholder="0"
                  {...form.register("frequencyMinutes", {
                    setValueAs: (v) =>
                      v === "" || v == null ? 0 : Number(v),
                  })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dc-frequencySeconds" className="text-xs">
                  {t("pharmacy.fields.frequencySeconds")}
                </FieldLabel>
                <Input
                  id="dc-frequencySeconds"
                  type="number"
                  min={0}
                  max={59}
                  step={1}
                  placeholder="0"
                  {...form.register("frequencySeconds", {
                    setValueAs: (v) =>
                      v === "" || v == null ? 0 : Number(v),
                  })}
                />
              </Field>
            </div>
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
                  {t("pharmacy.buttons.saving")}
                </>
              ) : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}