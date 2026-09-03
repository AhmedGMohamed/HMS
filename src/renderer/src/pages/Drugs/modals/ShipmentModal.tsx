"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

import { shipmentSchema } from "@/pages/Drugs/schemas/shipment.schema"
import type {
  CreateShipmentPayload,
  DrugCard,
  PriceList,
  ShipmentPrice,
  Warehouse,
} from "@/pages/Drugs/types/drug"

interface ShipmentModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  drug: DrugCard
  warehouses: Warehouse[]
  priceLists: PriceList[]
  /** When set, edits this shipment; otherwise creates a new one. */
  shipment?: {
    shipmentId: number
    warehouseId: number
    /** Current smaller-unit stock — re-seeded into the dual-unit inputs. */
    quantity: number
    buyPrice: number | string
    expiryDate: string | null
    prices: ShipmentPrice[]
  } | null
  onSubmit: (payload: CreateShipmentPayload) => Promise<void>
}

interface PriceField {
  pricelistId: number
  price: number
  requiresPrepayment: boolean
  prepaymentType: "fixed" | "percentage" | null
  prepaymentAmount: number | null
}

interface ShipmentFormValues {
  warehouseId: number
  quantityLarger: number
  quantitySmaller: number
  buyPrice: number
  expiryDate: string
  prices: PriceField[]
}

/**
 * Add / Edit Shipment dialog (§3.4).
 *
 * Warehouse, dual-unit quantity (larger + smaller → converted to a
 * smaller-unit total), buy price, expiry date, and a dynamic price-list
 * matrix (one price row per price list with prepayment). The default
 * price list is highlighted.
 */
export function ShipmentModal({
  open,
  onOpenChange,
  drug,
  warehouses,
  priceLists,
  shipment,
  onSubmit,
}: ShipmentModalProps) {
  const { t } = useTranslation()
  const ratio = drug.unitConversion?.ratio ?? 1
  const isEdit = shipment != null

  const form = useForm<ShipmentFormValues>({
    mode: "onBlur",
    defaultValues: {
      warehouseId: (warehouses[0]?.warehouseId as number) ?? 0,
      quantityLarger: 0,
      quantitySmaller: 0,
      buyPrice: 0,
      expiryDate: "",
      prices: [],
    },
  })

  const { fields, update } = useFieldArray({
    control: form.control,
    name: "prices",
  })

  const [submitting, setSubmitting] = useState(false)

  // Seed price rows from price lists (or existing shipment prices) on open.
  useEffect(() => {
    if (!open) return
    const seeded: PriceField[] = priceLists.map((pl) => {
      const existing = shipment?.prices.find((p) => p.pricelistId === pl.pricelistId)
      return {
        pricelistId: pl.pricelistId,
        price: existing ? Number(existing.price) : 0,
        requiresPrepayment: existing?.requiresPrepayment ?? false,
        prepaymentType: existing?.prepaymentType ?? "fixed",
        prepaymentAmount:
          existing?.prepaymentAmount != null
            ? Number(existing.prepaymentAmount)
            : 0,
      }
    })
    form.reset({
      warehouseId: shipment?.warehouseId ?? (warehouses[0]?.warehouseId as number) ?? 0,
      quantityLarger: shipment
        ? Math.floor(shipment.quantity / ratio)
        : 0,
      quantitySmaller: shipment ? shipment.quantity % ratio : 0,
      buyPrice: shipment ? Number(shipment.buyPrice) : 0,
      expiryDate: shipment?.expiryDate
        ? new Date(shipment.expiryDate).toISOString().slice(0, 10)
        : "",
      prices: seeded,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const quantityLarger = form.watch("quantityLarger")
  const quantitySmaller = form.watch("quantitySmaller")
  const resolvedQuantity = quantityLarger * ratio + quantitySmaller

  const defaultPricelistId = useMemo(
    () => priceLists.find((pl) => pl.isDefault)?.pricelistId ?? priceLists[0]?.pricelistId,
    [priceLists]
  )

  async function handleSubmit(values: ShipmentFormValues) {
    const payload: CreateShipmentPayload = {
      drugId: drug.drugId,
      warehouseId: values.warehouseId,
      quantity: resolvedQuantity,
      buyPrice: values.buyPrice,
      expiryDate: values.expiryDate,
      prices: values.prices.map((p) => ({
        pricelistId: p.pricelistId,
        price: p.price,
        requiresPrepayment: p.requiresPrepayment,
        prepaymentType: p.requiresPrepayment ? p.prepaymentType : null,
        prepaymentAmount: p.requiresPrepayment ? p.prepaymentAmount : null,
      })),
    }

    const parsed = shipmentSchema.safeParse(payload)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      toast.error(t(first?.message ?? "pharmacy.validation.invalidPrice"))
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(payload)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("pharmacy.messages.shipmentSaveError")
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
              ? t("pharmacy.modals.editShipment")
              : t("pharmacy.modals.addShipment")}
            {" — "}
            {drug.name}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-6"
        >
          <Field>
            <FieldLabel htmlFor="sh-warehouse">
              {t("pharmacy.fields.warehouse")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <NativeSelect
              id="sh-warehouse"
              {...form.register("warehouseId", { valueAsNumber: true })}
            >
              {warehouses.length === 0 ? (
                <NativeSelectOption value="">
                  {t("pharmacy.messages.noWarehouses")}
                </NativeSelectOption>
              ) : (
                warehouses.map((w) => (
                  <NativeSelectOption key={w.warehouseId} value={w.warehouseId}>
                    {w.name}
                  </NativeSelectOption>
                ))
              )}
            </NativeSelect>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sh-qtyLarger">
                {drug.unitConversion?.larger ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sh-qtyLarger"
                type="number"
                min={0}
                {...form.register("quantityLarger", { valueAsNumber: true })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sh-qtySmaller">
                {drug.unitConversion?.smaller ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sh-qtySmaller"
                type="number"
                min={0}
                {...form.register("quantitySmaller", { valueAsNumber: true })}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("pharmacy.fields.quantity")}:{" "}
            <span className="tabular-nums font-medium text-foreground">
              {resolvedQuantity}
            </span>{" "}
            {drug.unitConversion?.smaller ?? ""}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sh-buyPrice">
                {t("pharmacy.fields.buyPrice")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="sh-buyPrice"
                type="number"
                step="0.01"
                min={0.01}
                {...form.register("buyPrice", { valueAsNumber: true })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sh-expiry">
                {t("pharmacy.fields.expiryDate")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="sh-expiry"
                type="date"
                {...form.register("expiryDate")}
              />
            </Field>
          </div>

          {/* Price list matrix */}
          <div>
            <h6 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
              {t("pharmacy.sections.sellingPrices")}
            </h6>
            <div className="mt-3 flex flex-col gap-3">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("pharmacy.messages.noPrices")}
                </p>
              ) : (
                fields.map((field, index) => {
                  const pl = priceLists.find(
                    (p) => p.pricelistId === field.pricelistId
                  )
                  const isDefault = field.pricelistId === defaultPricelistId
                  const requiresPrepayment = field.requiresPrepayment
                  return (
                    <div
                      key={field.id}
                      className={
                        isDefault
                          ? "rounded-lg border border-primary/40 bg-primary-light/40 p-3"
                          : "rounded-lg border border-border p-3"
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {pl?.name ?? field.pricelistId}
                          {isDefault ? (
                            <Badge variant="outline" className="ms-2">
                              {t("pharmacy.status.default")}
                            </Badge>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <Field className="flex-1">
                          <FieldLabel className="text-xs">
                            {t("pharmacy.fields.totalPrice")}
                          </FieldLabel>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={field.price}
                            onChange={(e) =>
                              update(index, {
                                ...field,
                                price: Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.requiresPrepayment}
                            onCheckedChange={(checked) =>
                              update(index, {
                                ...field,
                                requiresPrepayment: Boolean(checked),
                              })
                            }
                          />
                          {t("pharmacy.fields.requiresPrepayment")}
                        </label>
                      </div>
                      {requiresPrepayment ? (
                        <div className="mt-2 flex flex-wrap items-end gap-3">
                          <Field>
                            <FieldLabel className="text-xs">
                              {t("pharmacy.fields.prepayment")}
                            </FieldLabel>
                            <NativeSelect
                              value={field.prepaymentType ?? "fixed"}
                              onChange={(e) =>
                                update(index, {
                                  ...field,
                                  prepaymentType: e.target
                                    .value as PriceField["prepaymentType"],
                                })
                              }
                            >
                              <NativeSelectOption value="fixed">
                                {t("pharmacy.prepaymentTypes.fixed")}
                              </NativeSelectOption>
                              <NativeSelectOption value="percentage">
                                {t("pharmacy.prepaymentTypes.percentage")}
                              </NativeSelectOption>
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel className="text-xs">
                              {t("pharmacy.fields.prepayment")}
                            </FieldLabel>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              value={field.prepaymentAmount ?? 0}
                              onChange={(e) =>
                                update(index, {
                                  ...field,
                                  prepaymentAmount: Number(e.target.value),
                                })
                              }
                            />
                          </Field>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <FieldError
            errors={
              form.formState.errors.prices
                ? [{ message: t("pharmacy.validation.defaultPriceRequired") }]
                : undefined
            }
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting || warehouses.length === 0}
            >
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