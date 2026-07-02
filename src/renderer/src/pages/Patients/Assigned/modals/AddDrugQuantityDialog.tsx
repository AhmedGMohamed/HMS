"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

import type {
  DrugCard,
  DrugShipment,
} from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"

interface AddDrugQuantityDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  drug: DrugCard
  shipment: DrugShipment | null
  onConfirm: (quantity: number, total: number) => Promise<unknown>
}

/**
 * Two-unit quantity picker for drugs.
 *
 * Matches legacy's NumericInput form: a "larger" input (boxes / bottles)
 * capped at `floor(available / ratio)`, and a "smaller" input (e.g.
 * tablets) capped at `available`. Total quantity resolves to
 * `larger * ratio + smaller`. Server-side validation matches via
 * `available_quantity`.
 *
 * On confirm we resolve to a single integer `quantity` for the wire
 * (server's `quantity` is in smaller-units). We also return `total`
 * (raw quantity) for the dialog's gross-price computation, but only
 * send integer `quantity` to the server.
 */
export function AddDrugQuantityDialog({
  open,
  onOpenChange,
  drug,
  shipment,
  onConfirm,
}: AddDrugQuantityDialogProps) {
  const { t } = useTranslation()
  const unit = drug.unitConversion
  const available = shipment?.remainingQuantity ?? 0
  const ratio = unit?.ratio ?? 1
  const smallerUnit = unit?.smallerUnit ?? ""
  const largerUnit = unit?.largerUnit ?? ""

  const maxLarger = Math.floor(available / ratio)
  const maxSmaller = available

  const [larger, setLarger] = useState(0)
  const [smaller, setSmaller] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLarger(0)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSmaller(0)
    }
  }, [open])

  const total = useMemo(
    () => larger * ratio + smaller,
    [larger, smaller, ratio]
  )

  const valid = total > 0 && total <= available

  async function onSubmit() {
    if (!valid) {
      toast.error(
        total <= 0
          ? t("patients.messages.enterValidQuantity")
          : t("patients.messages.quantityExceedsAvailable")
      )
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(smaller + larger * ratio, total)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("patients.messages.addDrugTitle", { drugName: drug.name })}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="add-drug-larger">
              {largerUnit
                ? `${largerUnit} (×${ratio} ${smallerUnit})`
                : t("patients.table.quantity")}
              :{" "}
              {t("patients.messages.quantityLabel", {
                unit: largerUnit || "—",
              })}
            </FieldLabel>
            <Input
              id="add-drug-larger"
              type="number"
              min={0}
              max={maxLarger}
              step={1}
              value={larger}
              onChange={(e) =>
                setLarger(Math.max(0, Number(e.target.value) || 0))
              }
            />
            <FieldError
              errors={
                larger > maxLarger
                  ? [
                      {
                        message: t(
                          "patients.messages.quantityExceedsAvailable"
                        ),
                      },
                    ]
                  : undefined
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="add-drug-smaller">
              {t("patients.messages.quantityLabel", {
                unit: smallerUnit || "—",
              })}
            </FieldLabel>
            <Input
              id="add-drug-smaller"
              type="number"
              min={0}
              max={maxSmaller}
              step={1}
              value={smaller}
              onChange={(e) =>
                setSmaller(Math.max(0, Number(e.target.value) || 0))
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("patients.messages.availableQuantity", {
                quantity: available,
                unit: smallerUnit || "—",
              })}
            </p>
          </Field>

          <p className="text-sm text-foreground">
            {t("patients.table.quantity")}:{" "}
            <span className="font-semibold tabular-nums">{total}</span>{" "}
            {smallerUnit}
          </p>
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
            type="button"
            onClick={onSubmit}
            disabled={submitting || !valid}
          >
            {submitting ? t("common.loading") : t("common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
