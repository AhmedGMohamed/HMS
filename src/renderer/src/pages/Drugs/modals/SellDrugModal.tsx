"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangleIcon } from "lucide-react"

import { getActivePatients } from "@/pages/Drugs/api"
import { resolveQuantity } from "@/pages/Drugs/schemas/sell.schema"
import { cn, formatNumber, formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type {
  ActivePatient,
  DrugShipment,
  PriceList,
  TransactionType,
} from "@/pages/Drugs/types/drug"

interface SellDrugModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  shipment: DrugShipment
  priceLists: PriceList[]
  onSubmit: (payload: {
    shipmentId: number
    transactionType: TransactionType
    quantity: number
    price: number
    patientId?: number | null
    /** Required when `transactionType !== "outside"`. Sourced from
     *  `ActivePatient.activePatientHistoryId` — the backend rejects
     *  the patient-side sell with "Patient is not currently admitted"
     *  if this is null/stale. */
    patientHistoryId?: number | null
  }) => Promise<void>
}

/**
 * Sell Drug dialog (§6.4).
 *
 * Ordered top→bottom as a cashier thinks: transaction type (radio cards)
 * → patient picker (patient/check only) → dual-unit quantity with live
 * available readout → price-list selector with auto-total + override →
 * below-buy-price warning.
 */
export function SellDrugModal({
  open,
  onOpenChange,
  shipment,
  priceLists,
  onSubmit,
}: SellDrugModalProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)

  const ratio = shipment.unitConversion?.ratio ?? 1
  const available = shipment.quantity

  const { register, handleSubmit, watch, setValue } = useForm<{
    transactionType: TransactionType
    patientId: number | null
    quantityLarger: number
    quantitySmaller: number
    priceListId: number | null
    totalPrice: number
  }>({
    mode: "onBlur",
    defaultValues: {
      transactionType: "outside",
      patientId: null,
      quantityLarger: 0,
      quantitySmaller: 0,
      priceListId: priceLists[0]?.pricelistId ?? null,
      totalPrice: 0,
    },
  })

  const [patients, setPatients] = useState<ActivePatient[]>([])
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const transactionType = watch("transactionType")
  const quantityLarger = watch("quantityLarger")
  const quantitySmaller = watch("quantitySmaller")
  const priceListId = watch("priceListId")
  const totalPrice = watch("totalPrice")
  const selectedPatientId = watch("patientId")

  // The patient picker is fed by `/api/patients/active`, which the
  // backend narrows to currently-admitted patients (the `LEFT JOIN
  // PatientHistory … WHERE … discharge_time IS NULL` filter). Each
  // row carries the active admission's `patient_history_id`; the
  // patient-side sell endpoint requires it.
  const selectedPatient = useMemo(
    () => patients.find((p) => p.patientId === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  )

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

  const resolvedQty = resolveQuantity(quantityLarger, quantitySmaller, ratio)

  // Pick the shipment's price for the selected pricelist.
  const selectedPrice = useMemo(() => {
    const sp = shipment.prices.find((p) => p.pricelistId === priceListId)
    return sp ? Number(sp.price) : 0
  }, [shipment.prices, priceListId])

  // Auto-calc total when qty changes (unless the cashier typed an override).
  useEffect(() => {
    const auto = selectedPrice * resolvedQty
    setValue("totalPrice", auto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPrice, resolvedQty])

  const belowBuyPrice =
    selectedPrice > 0 && Number(shipment.buyPrice) > selectedPrice

  async function doSubmit(values: {
    transactionType: TransactionType
    patientId: number | null
    priceListId: number | null
  }) {
    const patientId = Number.isFinite(values.patientId) ? values.patientId : null
    if (values.transactionType !== "outside" && patientId == null) {
      toast.error(t("pharmacy.validation.patientRequired"))
      return
    }
    // For patient/check, the backend requires a current admission.
    // The picker only lists admitted patients, so a missing
    // `activePatientHistoryId` here means the list went stale between
    // fetch and submit (e.g. the patient was just discharged).
    const patientHistoryId =
      values.transactionType !== "outside" && selectedPatient
        ? selectedPatient.activePatientHistoryId
        : null
    if (values.transactionType !== "outside" && !patientHistoryId) {
      toast.error(t("pharmacy.validation.patientAdmissionRequired"))
      return
    }
    const priceListId = values.priceListId
    if (priceListId == null || !Number.isFinite(priceListId) || priceListId <= 0) {
      toast.error(t("pharmacy.validation.priceListRequired"))
      return
    }
    if (resolvedQty <= 0) {
      toast.error(t("pharmacy.validation.quantityMin"))
      return
    }
    if (resolvedQty > available) {
      toast.error(t("pharmacy.validation.insufficientQuantity"))
      return
    }
    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      toast.error(t("pharmacy.validation.invalidPrice"))
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        shipmentId: shipment.shipmentId,
        transactionType: values.transactionType,
        quantity: resolvedQty,
        price: totalPrice,
        patientId:
          values.transactionType === "outside" ? null : patientId,
        patientHistoryId:
          values.transactionType === "outside" ? null : patientHistoryId,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("pharmacy.messages.saleError")
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
            {t("pharmacy.modals.sellDrug")} — {shipment.drugName}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(doSubmit)}
          className="flex flex-col gap-6"
        >
          {/* 1. Transaction type — radio cards so the selected option
              is unmistakable (the bare shadcn radio is easy to miss
              against a card surface). */}
          <Field>
            <FieldLabel>{t("pharmacy.fields.transactionType")}</FieldLabel>
            <RadioGroup
              value={transactionType}
              onValueChange={(v) =>
                setValue("transactionType", v as TransactionType)
              }
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {(["outside", "patient", "check"] as TransactionType[]).map(
                (type) => {
                  const isSelected = transactionType === type
                  return (
                    <label
                      key={type}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                        isSelected
                          ? "border-primary bg-primary-light text-foreground ring-1 ring-inset ring-primary/40"
                          : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <RadioGroupItem
                        value={type}
                        aria-label={t(`pharmacy.transactionTypes.${type}`)}
                      />
                      <span className="font-medium">
                        {t(`pharmacy.transactionTypes.${type}`)}
                      </span>
                    </label>
                  )
                }
              )}
            </RadioGroup>
          </Field>

          {/* 2. Patient picker — only currently-admitted patients
              (backend narrows the list to active admissions). The
              sell uses the patient-side endpoint, which writes a
              BillDetail row onto the patient's active admission
              bill, so a patient without an admission cannot be sold
              to from here. */}
          {transactionType !== "outside" ? (
            <Field>
              <FieldLabel htmlFor="sell-patient">
                {t("pharmacy.fields.selectPatient")}
              </FieldLabel>
              {loadingPatients ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner aria-hidden className="size-4 animate-spin" />
                  {t("pharmacy.placeholders.loadingPatients")}
                </div>
              ) : patients.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("pharmacy.placeholders.noAdmittedPatients")}
                </p>
              ) : (
                <NativeSelect
                  id="sell-patient"
                  {...register("patientId", { valueAsNumber: true })}
                >
                  <NativeSelectOption value="">
                    {t("common.select")}
                  </NativeSelectOption>
                  {patients.map((p) => (
                    <NativeSelectOption key={p.patientId} value={p.patientId}>
                      {p.quickCheck
                        ? `⚡ ${p.name} — ${t("pharmacy.labels.quickCheck")}`
                        : p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
              {selectedPatient?.quickCheck ? (
                <p className="text-xs text-muted-foreground">
                  {t("pharmacy.help.quickCheckAdmission")}
                </p>
              ) : null}
            </Field>
          ) : null}

          {/* 3. Quantity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sell-qtyLarger">
                {shipment.unitConversion?.larger ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sell-qtyLarger"
                type="number"
                min={0}
                {...register("quantityLarger", { valueAsNumber: true })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sell-qtySmaller">
                {shipment.unitConversion?.smaller ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sell-qtySmaller"
                type="number"
                min={0}
                {...register("quantitySmaller", { valueAsNumber: true })}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("pharmacy.fields.available")}:{" "}
            <span className="tabular-nums font-medium text-foreground">
              {formatNumber(available)}
            </span>{" "}
            {shipment.unitConversion?.smaller ?? ""}
            {resolvedQty > available ? (
              <span className="ms-2 font-medium text-danger">
                {t("pharmacy.validation.insufficientQuantity")}
              </span>
            ) : null}
          </p>

          {/* 4. Price list + total */}
          <Field>
            <FieldLabel htmlFor="sell-pricelist">
              {t("pharmacy.fields.priceList")}
            </FieldLabel>
            <NativeSelect
              id="sell-pricelist"
              {...register("priceListId", { valueAsNumber: true })}
            >
              {priceLists.map((pl) => (
                <NativeSelectOption key={pl.pricelistId} value={pl.pricelistId}>
                  {pl.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="sell-total">
              {t("pharmacy.fields.totalPrice")}
            </FieldLabel>
            <Input
              id="sell-total"
              type="number"
              min={0}
              step="0.01"
              {...register("totalPrice", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              {t("pharmacy.fields.available")} {formatNumber(resolvedQty)} ×{" "}
              {formatCurrency(selectedPrice, resolveLocale(language))}
            </p>
          </Field>

          {/* 5. Below-buy-price safeguard */}
          {belowBuyPrice ? (
            <Alert variant="destructive">
              <AlertTriangleIcon aria-hidden className="size-4" />
              <AlertTitle>{t("pharmacy.messages.warning")}</AlertTitle>
              <AlertDescription>
                {t("pharmacy.messages.priceBelowBuyPrice")}
              </AlertDescription>
            </Alert>
          ) : null}

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
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Spinner aria-hidden className="me-1.5" />
                  {t("pharmacy.buttons.processing")}
                </>
              ) : (
                t("pharmacy.buttons.confirmSale")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}