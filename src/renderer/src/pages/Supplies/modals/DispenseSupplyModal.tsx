"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { AlertTriangleIcon } from "lucide-react"

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { getActivePatients } from "@/pages/Supplies/api"
import { dispenseSupplySchema } from "@/pages/Supplies/schemas/dispenseSupply.schema"
import { cn, formatNumber, formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { ApiError } from "@/lib/errors"
import type {
  ActivePatient,
  MedicalSupplyShipment,
  PriceList,
} from "@/pages/Supplies/types/supply"

interface DispenseSupplyModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  shipment: MedicalSupplyShipment
  priceLists: PriceList[]
  onSubmit: (payload: {
    shipmentId: number
    quantity: number
    price: number
    patientId: number
    patientHistoryId: number
  }) => Promise<void>
}

interface DispenseFormValues {
  patientId: number | null
  quantity: number
  price: number
  priceListId: number | null
}

/**
 * Dispense Supply to Inpatient dialog (design plan §6.4).
 *
 * Adapted from `SellDrugModal` with three deliberate changes:
 *  1. **No transaction-type radio.** Supplies dispense only to
 *     admitted inpatients — the radio is removed entirely.
 *  2. **No dual-unit quantity.** Single integer `<Input>`.
 *  3. **No "Sell" button label.** CTA is `Dispense & Charge to Bill`.
 *
 * Visual order top→bottom: shipment readout → patient picker →
 * quantity (1..available) → selling price → below-buy-price
 * warning (when applicable) → [Cancel] [Dispense & Charge to Bill].
 */
export function DispenseSupplyModal({
  open,
  onOpenChange,
  shipment,
  priceLists,
  onSubmit,
}: DispenseSupplyModalProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const available = shipment.quantity
  const buyPrice = Number(shipment.buyPrice)

  const { register, handleSubmit, watch, setValue } = useForm<DispenseFormValues>({
    mode: "onBlur",
    defaultValues: {
      patientId: null,
      quantity: 0,
      price: 0,
      priceListId: priceLists[0]?.pricelistId ?? null,
    },
  })

  const [patients, setPatients] = useState<ActivePatient[]>([])
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const quantity = watch("quantity")
  const priceListId = watch("priceListId")
  const totalPrice = Number(watch("price") ?? 0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingPatients(true)
    getActivePatients()
      .then((rows) => {
        if (cancelled) return
        setPatients(rows)
      })
      .catch(() => {
        if (!cancelled) setPatients([])
      })
      .finally(() => {
        if (!cancelled) setLoadingPatients(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Auto-fill the selling price when the user picks a price list.
  const selectedPrice = useMemo(() => {
    const sp = shipment.prices.find((p) => p.pricelistId === priceListId)
    return sp ? Number(sp.price) : 0
  }, [shipment.prices, priceListId])

  useEffect(() => {
    if (selectedPrice > 0) setValue("price", selectedPrice)
  }, [selectedPrice, setValue])

  const belowBuyPrice = totalPrice > 0 && buyPrice > totalPrice

  async function doSubmit(values: DispenseFormValues) {
    if (values.patientId == null || !Number.isFinite(values.patientId)) {
      toast.error(t("medicalSupplies.dispense.patientRequired"))
      return
    }

    // The admitted-patient list was fetched on modal open; if the
    // modal has been sitting open for a while, the patient we picked
    // could have been discharged in the interim. Re-fetch the list
    // immediately before submit so the `patientHistoryId` we send
    // to the server is fresh — the patient-side dispense endpoint
    // requires a current admission and rejects otherwise.
    let activePatient: ActivePatient | null = null
    try {
      const fresh = await getActivePatients()
      setPatients(fresh)
      activePatient = fresh.find((p) => p.patientId === values.patientId) ?? null
    } catch {
      // Network failure: fall through to the local snapshot and let
      // the server-side 400 (if any) drive the user-facing message.
      activePatient =
        patients.find((p) => p.patientId === values.patientId) ?? null
    }

    const patientHistoryId = activePatient?.activePatientHistoryId ?? null
    if (!patientHistoryId) {
      toast.error(t("medicalSupplies.dispense.patientAdmissionRequired"))
      return
    }
    if (!Number.isFinite(values.quantity) || values.quantity <= 0) {
      toast.error(t("medicalSupplies.dispense.quantityMin"))
      return
    }
    if (values.quantity > available) {
      toast.error(t("medicalSupplies.dispense.insufficientQuantity"))
      return
    }
    if (!Number.isFinite(values.price) || values.price < 0) {
      toast.error(t("medicalSupplies.validation.invalidPrice"))
      return
    }

    const parsed = dispenseSupplySchema.safeParse({
      patientId: values.patientId,
      patientHistoryId,
      quantity: values.quantity,
      price: values.price,
    })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      toast.error(t(first?.message ?? "medicalSupplies.validation.invalidPrice"))
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        shipmentId: shipment.shipmentId,
        quantity: values.quantity,
        price: values.price,
        patientId: values.patientId,
        patientHistoryId,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("medicalSupplies.dispense.error")
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
            {t("medicalSupplies.dispense.title")} — {shipment.warehouseName}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(doSubmit)}
          className="flex flex-col gap-6"
        >
          {/* 1. Shipment readout — visual proof of which shipment is being debited. */}
          <div className="rounded-md border border-border bg-surface-muted/40 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("medicalSupplies.shipment.warehouse")}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground">
              <span className="font-medium">{shipment.warehouseName}</span>
              <span className="tabular-nums text-muted-foreground">
                {t("medicalSupplies.shipment.available")}:{" "}
                <span className="font-medium text-foreground">
                  {formatNumber(available)}
                </span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {t("medicalSupplies.fields.buyPrice")}:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(buyPrice, resolveLocale(language))}
                </span>
              </span>
            </div>
          </div>

          {/* 2. Patient picker */}
          <Field>
            <FieldLabel htmlFor="disp-patient">
              {t("medicalSupplies.dispense.selectPatient")}
              <span className="text-danger">*</span>
            </FieldLabel>
            {loadingPatients ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden className="size-4 animate-spin" />
                {t("medicalSupplies.dispense.loadingPatients")}
              </div>
            ) : patients.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("medicalSupplies.dispense.noAdmittedPatients")}
              </p>
            ) : (
              <NativeSelect
                id="disp-patient"
                {...register("patientId", { valueAsNumber: true })}
              >
                <NativeSelectOption value="">
                  {t("common.select")}
                </NativeSelectOption>
                {patients.map((p) => (
                  <NativeSelectOption key={p.patientId} value={p.patientId}>
                    {p.quickCheck
                      ? `⚡ ${p.name} — ${t("medicalSupplies.labels.quickCheck", { defaultValue: "Quick check" })}`
                      : p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </Field>

          {/* 3. Quantity */}
          <Field>
            <FieldLabel htmlFor="disp-quantity">
              {t("medicalSupplies.dispense.quantity")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input
              id="disp-quantity"
              type="number"
              min={1}
              step={1}
              {...register("quantity", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              {t("medicalSupplies.fields.available")}:{" "}
              <span className="tabular-nums font-medium text-foreground">
                {formatNumber(available)}
              </span>
              {quantity > available ? (
                <span className="ms-2 font-medium text-danger">
                  {t("medicalSupplies.dispense.insufficientQuantity")}
                </span>
              ) : null}
            </p>
          </Field>

          {/* 4. Price list + selling price */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="disp-pricelist">
                {t("medicalSupplies.fields.prices")}
              </FieldLabel>
              <NativeSelect
                id="disp-pricelist"
                {...register("priceListId", { valueAsNumber: true })}
              >
                <NativeSelectOption value="">
                  {t("common.select")}
                </NativeSelectOption>
                {priceLists.map((pl) => (
                  <NativeSelectOption
                    key={pl.pricelistId}
                    value={pl.pricelistId}
                  >
                    {pl.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="disp-price">
                {t("medicalSupplies.fields.unitPrice")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="disp-price"
                type="number"
                step="0.01"
                min={0}
                {...register("price", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                {t("medicalSupplies.dispense.totalAmount")}:{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {formatCurrency(
                    totalPrice * Math.max(quantity, 0),
                    resolveLocale(language)
                  )}
                </span>
              </p>
            </Field>
          </div>

          {/* 5. Below-buy-price safeguard */}
          {belowBuyPrice ? (
            <Alert variant="destructive">
              <AlertTriangleIcon aria-hidden className="size-4" />
              <AlertTitle>
                {t("common.warning", { defaultValue: t("common.warning") })}
              </AlertTitle>
              <AlertDescription>
                {t("medicalSupplies.dispense.belowBuyPriceWarning", {
                  buyPrice: formatCurrency(buyPrice, resolveLocale(language)),
                })}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter
            className={cn("gap-2", belowBuyPrice && "items-center")}
          >
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
                  {t("medicalSupplies.buttons.processing")}
                </>
              ) : (
                t("medicalSupplies.dispense.confirm")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
