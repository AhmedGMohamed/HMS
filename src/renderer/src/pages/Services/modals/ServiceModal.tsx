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
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { DrugPicker } from "@/pages/Services/components/DrugPicker"
import {
  createService,
  listDrugCards,
  updateService,
} from "@/pages/Services/api"
import {
  serviceFormSchema,
  type ServiceFormValues,
  type ServicePriceRowValues,
} from "@/pages/Services/schemas/service.schema"
import type {
  CreateServicePayload,
  NormalizedService,
  ServicePricePayload,
} from "@/pages/Services/types/service"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"
import type { DrugCard } from "@/pages/_shared/pharmacy/types"
import { ApiError } from "@/lib/errors"

interface ServiceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create. */
  service: NormalizedService | null
  priceLists: PriceListWithStats[]
  onSaved: () => void
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
      {children}
    </h6>
  )
}

function toDefaults(
  service: NormalizedService | null,
  priceLists: PriceListWithStats[]
): ServiceFormValues {
  return {
    name: service?.name ?? "",
    serviceType: service?.serviceType ?? "",
    autoRenew: service?.autoRenew ?? false,
    autoAddOnAdmission: service?.autoAddOnAdmission ?? false,
    priceRows: priceLists.map((pl) => {
      const existing =
        service?.prices.find((p) => p.pricelistId === pl.pricelistId) ??
        null
      const isDefaultList = pl.isDefault
      return {
        pricelistId: pl.pricelistId,
        isDefaultList,
        included: isDefaultList || existing != null,
        price: existing != null ? String(existing.price) : "",
        requiresPrepayment: existing?.requiresPrepayment ?? false,
        prepaymentType: existing?.prepaymentType ?? "",
        prepaymentAmount:
          existing?.prepaymentAmount != null
            ? String(existing.prepaymentAmount)
            : "",
      }
    }),
  }
}

/**
 * Defensive create-mode row used when the watched `priceRows` array is
 * shorter than `priceLists` for a render (the modal hook captures
 * `defaultValues` at page mount, while the lists are still loading).
 * The open-effect `form.reset(toDefaults(...))` reconciles immediately
 * after, so this only covers the transient render.
 */
function fallbackPriceRow(pl: PriceListWithStats): ServicePriceRowValues {
  return {
    pricelistId: pl.pricelistId,
    isDefaultList: pl.isDefault,
    included: pl.isDefault,
    price: "",
    requiresPrepayment: false,
    prepaymentType: "",
    prepaymentAmount: "",
  }
}

/**
 * Create / Edit Service dialog (§3 of `phase_6.6_plan.md`).
 *
 * - Per-price-list price rows: the default list is always included
 *  (price required); other lists sit behind an "Include Price List"
 *  checkbox with optional prepayment sub-fields.
 * - `type = once` disables + unchecks auto-renew (server treats it as
 *  non-renewable anyway).
 * - Drug picker: `drugs` is a full replace server-side, so the
 *  selected ids are always sent (an empty selection clears all).
 * - `prices` is UPSERT-only — omitted lists keep their rows untouched.
 */
export function ServiceModal({
  open,
  onOpenChange,
  service,
  priceLists,
  onSaved,
}: ServiceModalProps) {
  const { t } = useTranslation()
  const isEdit = service != null

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    mode: "onBlur",
    defaultValues: toDefaults(service, priceLists),
  })

  const [submitting, setSubmitting] = useState(false)
  const [allDrugs, setAllDrugs] = useState<DrugCard[]>([])
  const [drugsLoading, setDrugsLoading] = useState(false)
  const [drugSearch, setDrugSearch] = useState("")
  const [selectedDrugIds, setSelectedDrugIds] = useState<number[]>([])

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(service, priceLists))
      setSelectedDrugIds(
        service ? service.drugs.map((d) => d.drugId) : []
      )
      setDrugSearch("")
    }
  }, [open, service, priceLists, form])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setDrugsLoading(true)
    listDrugCards()
      .then((res) => {
        if (cancelled) return
        setAllDrugs(res.data)
      })
      .catch(() => {
        if (!cancelled) toast.error(t("services.messages.loadDrugsError"))
      })
      .finally(() => {
        if (!cancelled) setDrugsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, t])

  const serviceType = form.watch("serviceType")
  const priceRows = form.watch("priceRows")
  const autoRenew = form.watch("autoRenew")
  const autoAddOnAdmission = form.watch("autoAddOnAdmission")
  const autoRenewDisabled = serviceType === "once"

  useEffect(() => {
    if (serviceType === "once" && form.getValues("autoRenew")) {
      form.setValue("autoRenew", false)
    }
  }, [serviceType, form])

  const selectedDrugs = allDrugs.filter((drug) =>
    selectedDrugIds.includes(drug.drugId)
  )
  const availableDrugs = allDrugs.filter(
    (drug) => !selectedDrugIds.includes(drug.drugId)
  )

  async function onSubmit(values: ServiceFormValues) {
    if (values.serviceType === "") return
    setSubmitting(true)
    try {
      const prices: ServicePricePayload[] = values.priceRows
        .filter((row) => row.isDefaultList || row.included)
        .map((row) => ({
          pricelistId: row.pricelistId,
          price: Number(row.price),
          requiresPrepayment: row.requiresPrepayment,
          prepaymentType: row.requiresPrepayment
            ? (row.prepaymentType as "fixed" | "percentage")
            : null,
          prepaymentAmount: row.requiresPrepayment
            ? Number(row.prepaymentAmount)
            : null,
        }))
      const payload: CreateServicePayload = {
        name: values.name.trim(),
        serviceType: values.serviceType,
        autoRenew: serviceType === "once" ? false : values.autoRenew,
        autoAddOnAdmission: values.autoAddOnAdmission,
        prices,
        drugs: selectedDrugIds,
      }
      if (isEdit && service) {
        await updateService(service.serviceId, payload)
        toast.success(t("services.messages.updateSuccess"))
      } else {
        await createService(payload)
        toast.success(t("services.messages.createSuccess"))
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t("services.messages.saveError")
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
              ? t("services.modals.editService")
              : t("services.modals.createService")}
          </DialogTitle>
          {isEdit ? (
            <DialogDescription>{service.name}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <Field>
            <FieldLabel htmlFor="svc-name">
              {t("services.fields.serviceName")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="svc-name" {...form.register("name")} />
            <FieldError
              errors={
                form.formState.errors.name
                  ? [
                      {
                        message: t(
                          form.formState.errors.name.message ?? ""
                        ),
                      },
                    ]
                  : undefined
              }
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="svc-type">
                {t("services.fields.serviceType")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <NativeSelect
                id="svc-type"
                {...form.register("serviceType")}
              >
                <NativeSelectOption value="">
                  {t("services.placeholders.selectType")}
                </NativeSelectOption>
                <NativeSelectOption value="once">
                  {t("services.serviceTypes.once")}
                </NativeSelectOption>
                <NativeSelectOption value="hourly">
                  {t("services.serviceTypes.hourly")}
                </NativeSelectOption>
                <NativeSelectOption value="daily">
                  {t("services.serviceTypes.daily")}
                </NativeSelectOption>
              </NativeSelect>
              <FieldError
                errors={
                  form.formState.errors.serviceType
                    ? [
                        {
                          message: t(
                            form.formState.errors.serviceType.message ??
                              ""
                          ),
                        },
                      ]
                    : undefined
                }
              />
            </Field>

            <Field orientation="horizontal" className="items-center self-end">
              <Checkbox
                id="svc-autoRenew"
                checked={autoRenew}
                disabled={autoRenewDisabled}
                onCheckedChange={(v) =>
                  form.setValue("autoRenew", v === true, {
                    shouldDirty: true,
                  })
                }
              />
              <FieldLabel htmlFor="svc-autoRenew">
                {t("services.fields.autoRenew")}
              </FieldLabel>
            </Field>

            <Field orientation="horizontal" className="items-center self-end">
              <Checkbox
                id="svc-autoAdd"
                checked={autoAddOnAdmission}
                onCheckedChange={(v) =>
                  form.setValue("autoAddOnAdmission", v === true, {
                    shouldDirty: true,
                  })
                }
              />
              <FieldLabel htmlFor="svc-autoAdd">
                {t("services.fields.autoAdd")}
              </FieldLabel>
            </Field>
          </div>

          <SectionHeading>{t("services.sections.priceLists")}</SectionHeading>

          <div className="flex flex-col gap-3">
            {priceLists.map((pl, index) => {
              const row = priceRows?.[index] ?? fallbackPriceRow(pl)
              const included = row.isDefaultList || row.included
              const rowError = form.formState.errors.priceRows?.[index]
              return (
                <div
                  key={pl.pricelistId}
                  className="flex flex-col gap-3 rounded-md border border-border p-3"
                >
                  <Field orientation="horizontal" className="items-center">
                    <Checkbox
                      id={`svc-row-${index}-included`}
                      checked={row.included}
                      disabled={row.isDefaultList}
                      onCheckedChange={(v) =>
                        form.setValue(
                          `priceRows.${index}.included`,
                          v === true,
                          { shouldDirty: true }
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`svc-row-${index}-included`}
                      className="m-0 items-center"
                    >
                      {row.isDefaultList ? (
                        <Badge variant="secondary" className="me-2">
                          {t("services.status.default")}
                        </Badge>
                      ) : null}
                      {pl.name}
                    </FieldLabel>
                    <span className="ms-auto text-xs text-muted-foreground">
                      {t("services.fields.includePriceList")}
                    </span>
                  </Field>

                  {included ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor={`svc-row-${index}-price`}>
                          {t("services.fields.price")}
                          <span className="text-danger">*</span>
                        </FieldLabel>
                        <Input
                          id={`svc-row-${index}-price`}
                          type="number"
                          min={0}
                          step={0.01}
                          className="tabular-nums"
                          {...form.register(`priceRows.${index}.price`)}
                        />
                        <FieldError
                          errors={
                            rowError?.price
                              ? [
                                  {
                                    message: t(
                                      rowError.price.message ?? ""
                                    ),
                                  },
                                ]
                              : undefined
                          }
                        />
                      </Field>

                      <Field orientation="horizontal" className="items-center">
                        <Checkbox
                          id={`svc-row-${index}-prep`}
                          checked={row.requiresPrepayment}
                          onCheckedChange={(v) =>
                            form.setValue(
                              `priceRows.${index}.requiresPrepayment`,
                              v === true,
                              { shouldDirty: true }
                            )
                          }
                        />
                        <FieldLabel htmlFor={`svc-row-${index}-prep`}>
                          {t("services.fields.requiresPrepayment")}
                        </FieldLabel>
                      </Field>

                      {row.requiresPrepayment ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Field>
                            <FieldLabel
                              htmlFor={`svc-row-${index}-prepType`}
                            >
                              {t("services.fields.prepaymentRequired")}
                            </FieldLabel>
                            <NativeSelect
                              id={`svc-row-${index}-prepType`}
                              {...form.register(
                                `priceRows.${index}.prepaymentType`
                              )}
                            >
                              <NativeSelectOption value="fixed">
                                {t("services.prepaymentTypes.fixed")}
                              </NativeSelectOption>
                              <NativeSelectOption value="percentage">
                                {t(
                                  "services.prepaymentTypes.percentage"
                                )}
                              </NativeSelectOption>
                            </NativeSelect>
                            <FieldError
                              errors={
                                rowError?.prepaymentType
                                  ? [
                                      {
                                        message: t(
                                          rowError.prepaymentType
                                            .message ?? ""
                                        ),
                                      },
                                    ]
                                  : undefined
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel
                              htmlFor={`svc-row-${index}-prepAmount`}
                            >
                              {t("services.fields.prepaymentAmount")}
                            </FieldLabel>
                            <Input
                              id={`svc-row-${index}-prepAmount`}
                              type="number"
                              min={0}
                              step={0.01}
                              className="tabular-nums"
                              {...form.register(
                                `priceRows.${index}.prepaymentAmount`
                              )}
                            />
                            <FieldError
                              errors={
                                rowError?.prepaymentAmount
                                  ? [
                                      {
                                        message: t(
                                          rowError.prepaymentAmount
                                            .message ?? ""
                                        ),
                                      },
                                    ]
                                  : undefined
                              }
                            />
                          </Field>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>

          <SectionHeading>
            {t("services.sections.associatedDrugs")}
          </SectionHeading>
          <p className="text-xs text-muted-foreground">
            {t("services.help.associatedDrugs")}
          </p>
          {drugsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner aria-hidden className="size-5" />
            </div>
          ) : (
            <DrugPicker
              available={availableDrugs}
              selected={selectedDrugs}
              search={drugSearch}
              onSearchChange={setDrugSearch}
              onSelect={(drug) =>
                setSelectedDrugIds((prev) => [...prev, drug.drugId])
              }
              onRemove={(drug) =>
                setSelectedDrugIds((prev) =>
                  prev.filter((id) => id !== drug.drugId)
                )
              }
            />
          )}

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
                  {t("services.buttons.saving")}
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
