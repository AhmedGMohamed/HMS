"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { BanknoteIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

import { updateBill } from "@/pages/Patients/api"

import { formatCurrency } from "@/pages/Patients/lib/admissions/admissionFormat"
import { useUIStore } from "@/store/uiStore"

interface SettleBillDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  billId: number
  totalAmount: number
  currentPaid: number
  admissionId: number
  /** Callback to refresh the details dialog once the settle succeeds. */
  onSettled: () => void
}

/**
 * Mirrors the legacy `#settleBillModal`. Reads a new. intended
 * paid amount, shows a reactive preview (new balance / difference),
 * and guards with `<AlertDialog>` if the amount exceeds the total.
 * On submit calls T6's `updateBill({ paidAmount })` then
 * invokes the refresh callback.
 */
export function SettleBillDialog({
  open,
  onOpenChange,
  billId,
  totalAmount,
  currentPaid,
  admissionId,
  onSettled,
}: SettleBillDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) as "en" | "ar"
  const [newPaid, setNewPaid] = useState(() => currentPaid)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState(false)

  const newBalance = totalAmount - newPaid
  const difference = newPaid - currentPaid
  const exceedsTotal = newPaid > totalAmount

  function handleSettle() {
    if (newPaid < 0) {
      toast.error(t("patients.validation.invalidAmount"))
      return
    }
    if (exceedsTotal) {
      setPendingSubmit(true)
      setConfirmOpen(true)
      return
    }
    doSubmit()
  }

  async function doSubmit() {
    if (newPaid < 0) return
    setConfirmOpen(false)
    setSubmitting(true)
    try {
      await updateBill(billId, { paidAmount: newPaid })
      toast.success(t("patients.messages.billSettled"), { id: "settle-bill-toast" })
      onSettled()
      onOpenChange(false)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(
        e?.message ?? t("patients.messages.settleBillError"),
        { id: "settle-bill-error" }
      )
    } finally {
      setSubmitting(false)
      setPendingSubmit(false)
    }
  }

  function onConfirmClose(next: boolean) {
    if (!next) {
      setConfirmOpen(false)
      setPendingSubmit(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("patients.modals.settleBill")}</DialogTitle>
          <DialogDescription>
            {t("patients.messages.admissionId")} #{admissionId}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground leading-tight text-start">
            {t("patients.help.settleBillInfo")}
          </div>

          {/* Bill summary — current state */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">
                {t("patients.billing.totalAmount")}
              </span>
              <p className="font-medium tabular-nums">
                {formatCurrency(totalAmount, language)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">
                {t("patients.billing.currentPaid")}
              </span>
              <p className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                {formatCurrency(currentPaid, language)}
              </p>
            </div>
            <div className="col-span-2 border-t pt-1.5">
              <span className="text-muted-foreground text-xs">
                {t("patients.billing.currentBalance")}
              </span>
              <p
                className={
                  (totalAmount - currentPaid > 0
                    ? "text-destructive"
                    : "text-emerald-600 dark:text-emerald-400") +
                  " tabular-nums font-medium"
                }
              >
                {formatCurrency(Math.abs(totalAmount - currentPaid), language)}{" "}
                <span className="text-muted-foreground text-xs">
                  {totalAmount - currentPaid > 0
                    ? t("patients.messages.due")
                    : t("patients.messages.credit")}
                </span>
              </p>
            </div>
          </div>

          <Separator />

          {/* Input */}
          <div>
            <label
              htmlFor="settle-new-paid"
              className="block text-sm font-medium"
            >
              {t("patients.billing.newPaidAmount")}
            </label>
            <InputGroup className="mt-1">
              <InputGroupAddon align="inline-start">
                <InputGroupText>EGP</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="settle-new-paid"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={newPaid === 0 ? "" : String(newPaid)}
                onChange={(e) => {
                  const raw = e.target.value
                  setNewPaid(raw === "" ? 0 : Number(raw))
                }}
                disabled={submitting}
              />
            </InputGroup>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("patients.help.settleBillAmountInfo")}
            </p>
          </div>

          {/* Preview */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">
                {t("patients.billing.newBalance")}
              </span>
              <p
                className={
                  (newBalance > 0
                    ? "text-destructive"
                    : "text-emerald-600 dark:text-emerald-400") +
                  " tabular-nums font-medium"
                }
              >
                {formatCurrency(Math.abs(newBalance), language)}{" "}
                <span className="text-muted-foreground text-xs">
                  {newBalance > 0
                    ? t("patients.messages.due")
                    : t("patients.messages.credit")}
                </span>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">
                {t("patients.billing.difference")}
              </span>
              <p
                className={
                  (difference >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive") +
                  " tabular-nums font-medium"
                }
              >
                {formatCurrency(Math.abs(difference), language)}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2">
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
            variant="default"
            onClick={handleSettle}
            disabled={submitting || newPaid < 0}
          >
            {submitting ? (
              <Spinner aria-hidden className="me-1.5 size-3" />
            ) : (
              <BanknoteIcon aria-hidden className="me-1.5 size-4" />
            )}
            {t("patients.buttons.settleBill")}
          </Button>
        </DialogFooter>

        {pendingSubmit ? (
          <AlertDialog open={confirmOpen} onOpenChange={onConfirmClose}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("patients.messages.paidExceedsTotal")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("patients.help.settleBillAmountInfo")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={doSubmit}>
                  {t("common.yes")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}