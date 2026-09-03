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
import { Field, FieldLabel } from "@/components/ui/field"
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

  async function handleSubmit(values: ShipmentFormValues) {
    const payload: CreateSupplyShipmentPayload = {
      supplyId: supply.supplyId,
      warehouseId: values.warehouseId,
      quantity: values.quantity,
      buyPrice: values.buyPrice,
      expiryDate: values.expiryDate ? values.expiryDate : null,
      // Forward the full price object (including prepayment fields)
      // so the backend can persist any prepayment the user enabled.
      // The legacy controller accepts the trimmed `{ pricelistId,
      // price }` shape today; sending the full shape is forward-
      // compatible with the backend DTO.
      prices: values.prices.map((p) => ({
        pricelistId: p.pricelistId,
        price: p.price,
        requiresPrepayment: p.requiresPrepayment,
        prepaymentType: p.prepaymentType,
        prepaymentAmount: p.prepaymentAmount,
      })),
    }

    const parsed = supplyShipmentSchema.safeParse({
      warehouseId: payload.warehouseId,
      quantity: payload.quantity,
      buyPrice: payload.buyPrice,
      expiryDate: payload.expiryDate ?? null,
      prices: values.prices.map((p) => ({
        pricelistId: p.pricelistId,
        price: p.price,
        requiresPrepayment: p.requiresPrepayment,
        prepaymentType: p.prepaymentType,
        prepaymentAmount: p.prepaymentAmount,
      })),
    })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      toast.error(t(first?.message ?? "medicalSupplies.validation.invalidPrice"))
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
          <Field>
            <FieldLabel htmlFor="ssh-warehouse">
              {t("medicalSupplies.fields.warehouse")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <NativeSelect
              id="ssh-warehouse"
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
          </Field>

          <Field>
            <FieldLabel htmlFor="ssh-quantity">
              {t("medicalSupplies.fields.quantity")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input
              id="ssh-quantity"
              type="number"
              min={1}
              step={1}
              {...form.register("quantity", { valueAsNumber: true })}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ssh-buyPrice">
                {t("medicalSupplies.fields.buyPrice")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="ssh-buyPrice"
                type="number"
                step="0.01"
                min={0.01}
                {...form.register("buyPrice", { valueAsNumber: true })}
              />
            </Field>
            <Field>
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
                {...form.register("expiryDate")}
              />
            </Field>
          </div>

          {/* Price list matrix */}
          <div>
            <h6 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
              {t("medicalSupplies.sections.sellingPrices")}
            </h6>
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
                          <FieldLabel className="text-xs">
                            {t("medicalSupplies.fields.unitPrice")}
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
                      </div>
                    </div>
                  )
                })
              )}
            </div>
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
