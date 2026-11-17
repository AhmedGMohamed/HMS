"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { isNetworkError } from "@/lib/errors"

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
  /** Inline matrix-level error (payload `prices` issues have no RHF field). */
  const [matrixError, setMatrixError] = useState<string | null>(null)

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
  const errors = form.formState.errors

  const defaultPricelistId = useMemo(
    () => priceLists.find((pl) => pl.isDefault)?.pricelistId ?? priceLists[0]?.pricelistId,
    [priceLists]
  )

  /* Price lists that already carry a price on the shipment being edited.
     Clearing one of these is rejected: the server only upserts rows present
     in the payload, so filtering a zeroed row out would silently keep the
     old price while the dialog reports success. */
  const previouslyPricedIds = useMemo(
    () =>
      new Set(
        (shipment?.prices ?? [])
          .filter((p) => Number(p.price) > 0)
          .map((p) => p.pricelistId)
      ),
    [shipment]
  )

  /**
   * Surface the first payload issue inline and put the caret on the
   * offending control. The schema stays the single source of truth
   * (the form shape differs only by the dual-unit split).
   */
  function showFirstIssue(issue: { path: PropertyKey[]; message?: string }) {
    const [head, index, leaf] = issue.path
    const message = issue.message
    if (head === "warehouseId") {
      form.setError("warehouseId", { type: "manual", message })
      form.setFocus("warehouseId")
      return
    }
    if (head === "quantity") {
      form.setError("quantityLarger", { type: "manual", message })
      form.setFocus("quantityLarger", { shouldSelect: true })
      return
    }
    if (head === "buyPrice") {
      form.setError("buyPrice", { type: "manual", message })
      form.setFocus("buyPrice", { shouldSelect: true })
      return
    }
    if (head === "expiryDate") {
      form.setError("expiryDate", { type: "manual", message })
      form.setFocus("expiryDate")
      return
    }
    // Price matrix: focus the row the issue points at (if any) and show
    // the message under the matrix.
    setMatrixError(message ?? null)
    const row = typeof index === "number" ? fields[index] : undefined
    const suffix = leaf === "prepaymentAmount" ? "prepayAmount" : "price"
    const target =
      row != null
        ? `sh-${suffix}-${row.pricelistId}`
        : `sh-price-${fields[0]?.pricelistId ?? "0"}`
    document.getElementById(target)?.focus()
  }

  async function handleSubmit(values: ShipmentFormValues) {
    // Only priced rows are sent — the payload contract is "rows with a
    // price". Unpriced rows are filtered below, but a row that had a price
    // and was zeroed is rejected first (see the check after validation):
    // the server upserts only the rows it receives.
    const payload: CreateShipmentPayload = {
      drugId: drug.drugId,
      warehouseId: values.warehouseId,
      quantity: resolvedQuantity,
      buyPrice: values.buyPrice,
      expiryDate: values.expiryDate,
      prices: values.prices
        .filter((p) => p.price > 0)
        .map((p) => ({
          pricelistId: p.pricelistId,
          price: p.price,
          requiresPrepayment: p.requiresPrepayment,
          prepaymentType: p.requiresPrepayment ? p.prepaymentType : null,
          prepaymentAmount: p.requiresPrepayment ? p.prepaymentAmount : null,
        })),
    }

    form.clearErrors()
    setMatrixError(null)
    const parsed = shipmentSchema.safeParse({
      warehouseId: values.warehouseId,
      quantity: resolvedQuantity,
      buyPrice: values.buyPrice,
      expiryDate: values.expiryDate,
      prices: values.prices,
    })
    if (!parsed.success) {
      showFirstIssue(parsed.error.issues[0]!)
      return
    }

    /* Reject clearing a price this shipment already had. Filtering it out of
       the payload would leave the server-side price untouched while the
       dialog reported success. Rows that were never priced stay filterable. */
    const zeroedExistingPrice = values.prices.find(
      (p) => p.price <= 0 && previouslyPricedIds.has(p.pricelistId)
    )
    if (zeroedExistingPrice) {
      setMatrixError("pharmacy.validation.existingPriceRequired")
      document
        .getElementById(`sh-price-${zeroedExistingPrice.pricelistId}`)
        ?.focus()
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(payload)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        isNetworkError(err)
          ? t("errors.networkError")
          : err instanceof Error
            ? err.message
            : t("pharmacy.messages.shipmentSaveError")
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
          <Field invalid={!!errors.warehouseId}>
            <FieldLabel htmlFor="sh-warehouse">
              {t("pharmacy.fields.warehouse")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <NativeSelect
              id="sh-warehouse"
              aria-required
              aria-invalid={errors.warehouseId ? true : undefined}
              aria-describedby={
                errors.warehouseId ? "sh-warehouse-error" : undefined
              }
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
            <FieldError id="sh-warehouse-error">
              {errors.warehouseId?.message
                ? t(errors.warehouseId.message)
                : undefined}
            </FieldError>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field invalid={!!errors.quantityLarger}>
              <FieldLabel htmlFor="sh-qtyLarger">
                {drug.unitConversion?.larger ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sh-qtyLarger"
                type="number"
                inputMode="numeric"
                min={0}
                aria-invalid={errors.quantityLarger ? true : undefined}
                aria-describedby={
                  errors.quantityLarger ? "sh-qtyLarger-error" : undefined
                }
                {...form.register("quantityLarger", { valueAsNumber: true })}
              />
              <FieldError id="sh-qtyLarger-error">
                {errors.quantityLarger?.message
                  ? t(errors.quantityLarger.message)
                  : undefined}
              </FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="sh-qtySmaller">
                {drug.unitConversion?.smaller ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sh-qtySmaller"
                type="number"
                inputMode="numeric"
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
            <Field invalid={!!errors.buyPrice}>
              <FieldLabel htmlFor="sh-buyPrice">
                {t("pharmacy.fields.buyPrice")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="sh-buyPrice"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0.01}
                aria-required
                aria-invalid={errors.buyPrice ? true : undefined}
                aria-describedby={
                  errors.buyPrice ? "sh-buyPrice-error" : undefined
                }
                {...form.register("buyPrice", { valueAsNumber: true })}
              />
              <FieldError id="sh-buyPrice-error">
                {errors.buyPrice?.message
                  ? t(errors.buyPrice.message)
                  : undefined}
              </FieldError>
            </Field>
            <Field invalid={!!errors.expiryDate}>
              <FieldLabel htmlFor="sh-expiry">
                {t("pharmacy.fields.expiryDate")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="sh-expiry"
                type="date"
                aria-required
                aria-invalid={errors.expiryDate ? true : undefined}
                aria-describedby={
                  errors.expiryDate ? "sh-expiry-error" : undefined
                }
                {...form.register("expiryDate")}
              />
              <FieldError id="sh-expiry-error">
                {errors.expiryDate?.message
                  ? t(errors.expiryDate.message)
                  : undefined}
              </FieldError>
            </Field>
          </div>

          {/* Price list matrix */}
          <div>
            <h3 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
              {t("pharmacy.sections.sellingPrices")}
            </h3>
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
                          <FieldLabel
                            htmlFor={`sh-price-${field.pricelistId}`}
                            className="text-xs"
                          >
                            {t("pharmacy.fields.totalPrice")}
                          </FieldLabel>
                          <Input
                            id={`sh-price-${field.pricelistId}`}
                            type="number"
                            inputMode="decimal"
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
                            <FieldLabel
                              htmlFor={`sh-prepayType-${field.pricelistId}`}
                              className="text-xs"
                            >
                              {t("pharmacy.fields.prepayment")}
                            </FieldLabel>
                            <NativeSelect
                              id={`sh-prepayType-${field.pricelistId}`}
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
                            <FieldLabel
                              htmlFor={`sh-prepayAmount-${field.pricelistId}`}
                              className="text-xs"
                            >
                              {t("pharmacy.fields.prepayment")}
                            </FieldLabel>
                            <Input
                              id={`sh-prepayAmount-${field.pricelistId}`}
                              type="number"
                              inputMode="decimal"
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

          <FieldError id="sh-prices-error">
            {matrixError ? t(matrixError) : undefined}
          </FieldError>

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