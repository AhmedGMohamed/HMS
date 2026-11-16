"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, type FieldErrors } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangleIcon } from "lucide-react"

import { getActivePatients } from "@/pages/Drugs/api"
import {
  resolveQuantity,
  sellSchema,
  type SellValues,
} from "@/pages/Drugs/schemas/sell.schema"
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

  const { register, handleSubmit, watch, setValue, setError, setFocus,
    formState: { errors } } = useForm<SellValues>({
    mode: "onBlur",
    resolver: zodResolver(sellSchema),
    defaultValues: {
      transactionType: "outside",
      patientId: null,
      quantityLarger: 0,
      quantitySmaller: 0,
      ratio,
      priceListId: priceLists[0]?.pricelistId ?? null,
      totalPrice: 0,
    },
  })

  const [patients, setPatients] = useState<ActivePatient[]>([])
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /**
   * True once the cashier edits the total by hand. The auto-total effect
   * then stops writing `totalPrice` — it used to clobber the manual
   * override on every unrelated re-render.
   */
  const totalOverridden = useRef(false)

  const transactionType = watch("transactionType")
  const quantityLarger = watch("quantityLarger")
  const quantitySmaller = watch("quantitySmaller")
  const priceListId = watch("priceListId")
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

  // Auto-calc total from quantity × selected price unless the cashier
  // typed an override (sticky for this dialog instance — a manual total
  // must survive quantity/price-list re-renders).
  useEffect(() => {
    if (totalOverridden.current) return
    setValue("totalPrice", selectedPrice * resolvedQty)
  }, [selectedPrice, resolvedQty, setValue])

  const belowBuyPrice =
    selectedPrice > 0 && Number(shipment.buyPrice) > selectedPrice

  const fieldMessage = (message?: string) => (message ? t(message) : undefined)

  /** Focus the first field flagged by the resolver, in visual order. */
  function focusFirstError(fieldErrors: FieldErrors<SellValues>) {
    const order: (keyof SellValues)[] = [
      "patientId",
      "quantityLarger",
      "quantitySmaller",
      "priceListId",
      "totalPrice",
    ]
    const first = order.find((name) => fieldErrors[name])
    if (first) setFocus(first, { shouldSelect: true })
  }

  async function doSubmit(values: SellValues) {
    // The resolver already covered patient/quantity/price-list/price.
    // Two rules depend on live data and are surfaced inline here.
    const patientHistoryId =
      values.transactionType !== "outside" && selectedPatient
        ? selectedPatient.activePatientHistoryId
        : null
    if (values.transactionType !== "outside" && !patientHistoryId) {
      setError("patientId", {
        type: "manual",
        message: "pharmacy.validation.patientAdmissionRequired",
      })
      setFocus("patientId")
      return
    }
    const resolvedQty = resolveQuantity(
      values.quantityLarger,
      values.quantitySmaller,
      ratio
    )
    if (resolvedQty > available) {
      setError("quantityLarger", {
        type: "manual",
        message: "pharmacy.validation.insufficientQuantity",
      })
      setFocus("quantityLarger", { shouldSelect: true })
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        shipmentId: shipment.shipmentId,
        transactionType: values.transactionType,
        quantity: resolvedQty,
        price: values.totalPrice,
        patientId:
          values.transactionType === "outside" ? null : values.patientId ?? null,
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
          onSubmit={handleSubmit(doSubmit, focusFirstError)}
          className="flex flex-col gap-6"
          noValidate
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
            <Field invalid={!!errors.patientId}>
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
                  aria-invalid={errors.patientId ? true : undefined}
                  aria-describedby={
                    errors.patientId ? "sell-patient-error" : undefined
                  }
                  {...register("patientId", {
                    setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
                  })}
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
              <FieldError id="sell-patient-error">
                {fieldMessage(errors.patientId?.message)}
              </FieldError>
              {selectedPatient?.quickCheck ? (
                <p className="text-xs text-muted-foreground">
                  {t("pharmacy.help.quickCheckAdmission")}
                </p>
              ) : null}
            </Field>
          ) : null}

          {/* 3. Quantity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field invalid={!!errors.quantityLarger}>
              <FieldLabel htmlFor="sell-qtyLarger">
                {shipment.unitConversion?.larger ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sell-qtyLarger"
                type="number"
                inputMode="numeric"
                min={0}
                aria-invalid={errors.quantityLarger ? true : undefined}
                aria-describedby={
                  errors.quantityLarger ? "sell-qtyLarger-error" : undefined
                }
                {...register("quantityLarger", {
                  setValueAs: (v) => (v === "" || v == null ? 0 : Number(v)),
                })}
              />
              <FieldError id="sell-qtyLarger-error">
                {fieldMessage(errors.quantityLarger?.message)}
              </FieldError>
            </Field>
            <Field invalid={!!errors.quantitySmaller}>
              <FieldLabel htmlFor="sell-qtySmaller">
                {shipment.unitConversion?.smaller ?? t("pharmacy.fields.quantity")}
              </FieldLabel>
              <Input
                id="sell-qtySmaller"
                type="number"
                inputMode="numeric"
                min={0}
                aria-invalid={errors.quantitySmaller ? true : undefined}
                aria-describedby={
                  errors.quantitySmaller ? "sell-qtySmaller-error" : undefined
                }
                {...register("quantitySmaller", {
                  setValueAs: (v) => (v === "" || v == null ? 0 : Number(v)),
                })}
              />
              <FieldError id="sell-qtySmaller-error">
                {fieldMessage(errors.quantitySmaller?.message)}
              </FieldError>
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("pharmacy.fields.available")}:{" "}
            <span className="tabular-nums font-medium text-foreground">
              {formatNumber(available)}
            </span>{" "}
            {shipment.unitConversion?.smaller ?? ""}
          </p>

          {/* 4. Price list + total */}
          <Field invalid={!!errors.priceListId}>
            <FieldLabel htmlFor="sell-pricelist">
              {t("pharmacy.fields.priceList")}
            </FieldLabel>
            <NativeSelect
              id="sell-pricelist"
              aria-invalid={errors.priceListId ? true : undefined}
              aria-describedby={
                errors.priceListId ? "sell-pricelist-error" : undefined
              }
              {...register("priceListId", {
                setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
              })}
            >
              {priceLists.map((pl) => (
                <NativeSelectOption key={pl.pricelistId} value={pl.pricelistId}>
                  {pl.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="sell-pricelist-error">
              {fieldMessage(errors.priceListId?.message)}
            </FieldError>
          </Field>

          <Field invalid={!!errors.totalPrice}>
            <FieldLabel htmlFor="sell-total">
              {t("pharmacy.fields.totalPrice")}
            </FieldLabel>
            <Input
              id="sell-total"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              aria-invalid={errors.totalPrice ? true : undefined}
              aria-describedby={
                errors.totalPrice ? "sell-total-error" : undefined
              }
              {...register("totalPrice", {
                setValueAs: (v) => (v === "" || v == null ? 0 : Number(v)),
                onChange: () => {
                  totalOverridden.current = true
                },
              })}
            />
            <FieldError id="sell-total-error">
              {fieldMessage(errors.totalPrice?.message)}
            </FieldError>
            <p className="text-xs text-muted-foreground">
              {t("pharmacy.fields.available")} {formatNumber(resolvedQty)} ×{" "}
              {formatCurrency(selectedPrice, resolveLocale(language))}
            </p>
          </Field>

          {/* 5. Below-buy-price safeguard */}
          {belowBuyPrice ? (
            <Alert variant="destructive" live="polite">
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