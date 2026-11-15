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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Badge } from "@/components/ui/badge"

import { supplyShipmentSchema } from "@/pages/Supplies/schemas/supplyShipment.schema"
import type {
  CreateSupplyShipmentPayload,
  MedicalSupply,
  MedicalSupplyShipment,
  PriceList,
  Warehouse,
} from "@/pages/Supplies/types/supply"

interface SupplyShipmentModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  supply: MedicalSupply
  warehouses: Warehouse[]
  priceLists: PriceList[]
  /** When set, edits this shipment; otherwise creates a new one. */
  shipment?:
    | Pick<
        MedicalSupplyShipment,
        | "shipmentId"
        | "warehouseId"
        | "quantity"
        | "buyPrice"
        | "expiryDate"
        | "prices"
      >
    | null
  onSubmit: (payload: CreateSupplyShipmentPayload) => Promise<void>
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
  quantity: number
  buyPrice: number
  expiryDate: string
  prices: PriceField[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Add / Edit Supply Shipment dialog (design plan §6.4).
 *
 * Mirrors `ShipmentModal` from the Drugs page with two material
 * simplifications:
 *  - **No dual-unit quantity.** Supplies have a single integer unit
 *    — one `<Field>` only.
 *  - **Optional expiry date.** Date input has `min={today}` but is
 *    not required; help text explicitly says "Optional".
 */
export function SupplyShipmentModal({
  open,
  onOpenChange,
  supply,
  warehouses,
  priceLists,
  shipment,
  onSubmit,
}: SupplyShipmentModalProps) {
  const { t } = useTranslation()
  const isEdit = shipment != null

  const form = useForm<ShipmentFormValues>({
    mode: "onBlur",
    defaultValues: {
      warehouseId: (warehouses[0]?.warehouseId as number) ?? 0,
      quantity: 0,
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

  useEffect(() => {
    if (!open) return
    const seeded: PriceField[] = priceLists.map((pl) => {
      const existing = shipment?.prices.find(
        (p) => p.pricelistId === pl.pricelistId
      )
      return {
        pricelistId: pl.pricelistId,
        price: existing ? Number(existing.price) : 0,
        requiresPrepayment: existing?.requiresPrepayment ?? false,
        prepaymentType:
          (existing?.prepaymentType as PriceField["prepaymentType"]) ?? "fixed",
        prepaymentAmount:
          existing?.prepaymentAmount != null
            ? Number(existing.prepaymentAmount)
            : 0,
      }
    })
    form.reset({
      warehouseId: shipment?.warehouseId ?? (warehouses[0]?.warehouseId as number) ?? 0,
      quantity: shipment?.quantity ?? 0,
      buyPrice: shipment ? Number(shipment.buyPrice) : 0,
      expiryDate:
        shipment?.expiryDate != null
          ? new Date(shipment.expiryDate).toISOString().slice(0, 10)
          : "",
      prices: seeded,
    })
  }, [open])

  const defaultPricelistId = useMemo(
    () =>
      priceLists.find((pl) => pl.isDefault)?.pricelistId ??
      priceLists[0]?.pricelistId,
    [priceLists]
  )

  const errors = form.formState.errors

  /**
   * Surface the first payload issue inline and put the caret on the
   * offending control. The schema stays the single source of truth.
   */
  function showFirstIssue(issue: { path: PropertyKey[]; message?: string }) {
    const [head, index] = issue.path
    const message = issue.message
    if (head === "warehouseId") {
      form.setError("warehouseId", { type: "manual", message })
      form.setFocus("warehouseId")
      return
    }
    if (head === "quantity") {
      form.setError("quantity", { type: "manual", message })
      form.setFocus("quantity", { shouldSelect: true })
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
    setMatrixError(message ?? null)
    const row = typeof index === "number" ? fields[index] : undefined
    const target = `ssh-price-${row?.pricelistId ?? fields[0]?.pricelistId ?? 0}`
    document.getElementById(target)?.focus()
  }

  async function handleSubmit(values: ShipmentFormValues) {
    // Only priced rows are sent: the matrix seeds every list with 0.
    // The whole matrix is validated so an entirely empty one fails
    // with `defaultPriceRequired` instead of an empty payload.
    const payload: CreateSupplyShipmentPayload = {
      supplyId: supply.supplyId,
      warehouseId: values.warehouseId,
      quantity: values.quantity,
      buyPrice: values.buyPrice,
      expiryDate: values.expiryDate ? values.expiryDate : null,
      // Forward the full price object (including prepayment fields)
      // so the backend can persist any prepayment the user enabled.
      prices: values.prices
        .filter((p) => p.price > 0)
        .map((p) => ({
          pricelistId: p.pricelistId,
          price: p.price,
          requiresPrepayment: p.requiresPrepayment,
          prepaymentType: p.prepaymentType,
          prepaymentAmount: p.prepaymentAmount,
        })),
    }

    form.clearErrors()
    setMatrixError(null)
    const parsed = supplyShipmentSchema.safeParse({
      warehouseId: values.warehouseId,
      quantity: values.quantity,
      buyPrice: values.buyPrice,
      expiryDate: payload.expiryDate,
      prices: values.prices,
    })
    if (!parsed.success) {
      showFirstIssue(parsed.error.issues[0]!)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(payload)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("medicalSupplies.messages.shipmentSaveError")
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
              ? t("medicalSupplies.modals.editShipment")
              : t("medicalSupplies.modals.addShipment")}
            {" — "}
            {supply.name}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-6"
        >
          <Field invalid={!!errors.warehouseId}>
            <FieldLabel htmlFor="ssh-warehouse">
              {t("medicalSupplies.fields.warehouse")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <NativeSelect
              id="ssh-warehouse"
              aria-required
              aria-invalid={errors.warehouseId ? true : undefined}
              aria-describedby={
                errors.warehouseId ? "ssh-warehouse-error" : undefined
              }
              {...form.register("warehouseId", { valueAsNumber: true })}
            >
              {warehouses.length === 0 ? (
                <NativeSelectOption value="">
                  {t("medicalSupplies.warehouses.noWarehouses")}
                </NativeSelectOption>
              ) : (
                warehouses.map((w) => (
                  <NativeSelectOption key={w.warehouseId} value={w.warehouseId}>
                    {w.name}
                  </NativeSelectOption>
                ))
              )}
            </NativeSelect>
            <FieldError id="ssh-warehouse-error">
              {errors.warehouseId?.message
                ? t(errors.warehouseId.message)
                : undefined}
            </FieldError>
          </Field>

          <Field invalid={!!errors.quantity}>
            <FieldLabel htmlFor="ssh-quantity">
              {t("medicalSupplies.fields.quantity")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input
              id="ssh-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-required
              aria-invalid={errors.quantity ? true : undefined}
              aria-describedby={
                errors.quantity ? "ssh-quantity-error" : undefined
              }
              {...form.register("quantity", { valueAsNumber: true })}
            />
            <FieldError id="ssh-quantity-error">
              {errors.quantity?.message
                ? t(errors.quantity.message)
                : undefined}
            </FieldError>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field invalid={!!errors.buyPrice}>
              <FieldLabel htmlFor="ssh-buyPrice">
                {t("medicalSupplies.fields.buyPrice")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="ssh-buyPrice"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0.01}
                aria-required
                aria-invalid={errors.buyPrice ? true : undefined}
                aria-describedby={
                  errors.buyPrice ? "ssh-buyPrice-error" : undefined
                }
                {...form.register("buyPrice", { valueAsNumber: true })}
              />
              <FieldError id="ssh-buyPrice-error">
                {errors.buyPrice?.message
                  ? t(errors.buyPrice.message)
                  : undefined}
              </FieldError>
            </Field>
            <Field invalid={!!errors.expiryDate}>
              <FieldLabel htmlFor="ssh-expiry">
                {t("medicalSupplies.fields.expiryDate")}
                <span className="ms-1 text-xs text-muted-foreground">
                  {t("medicalSupplies.help.expiryDate")}
                </span>
              </FieldLabel>
              <Input
                id="ssh-expiry"
                type="date"
                min={todayIso()}
                aria-invalid={errors.expiryDate ? true : undefined}
                aria-describedby={
                  errors.expiryDate ? "ssh-expiry-error" : undefined
                }
                {...form.register("expiryDate")}
              />
              <FieldError id="ssh-expiry-error">
                {errors.expiryDate?.message
                  ? t(errors.expiryDate.message)
                  : undefined}
              </FieldError>
            </Field>
          </div>

          {/* Price list matrix */}
          <div>
            <h3 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
              {t("medicalSupplies.sections.sellingPrices")}
            </h3>
            <div className="mt-3 flex flex-col gap-3">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("medicalSupplies.messages.loadPriceListsError")}
                </p>
              ) : (
                fields.map((field, index) => {
                  const pl = priceLists.find(
                    (p) => p.pricelistId === field.pricelistId
                  )
                  const isDefault = field.pricelistId === defaultPricelistId
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
                              {t("medicalSupplies.status.default")}
                            </Badge>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <Field className="flex-1">
                          <FieldLabel
                            htmlFor={`ssh-price-${field.pricelistId}`}
                            className="text-xs"
                          >
                            {t("medicalSupplies.fields.unitPrice")}
                          </FieldLabel>
                          <Input
                            id={`ssh-price-${field.pricelistId}`}
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
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <FieldError id="ssh-prices-error">
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
