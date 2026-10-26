"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  CalendarRangeIcon,
  CreditCardIcon,
  UserIcon,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  resolveLocale,
} from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { listCompanyPayments } from "@/pages/Insurance/api"
import type { InsurancePayment } from "@/pages/Insurance/types/insurance"

export interface PaymentHistoryDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  companyId: number | null
  companyName: string
}

/**
 * Payment history dialog (Phase 6.10 plan §3).
 *
 * Fetches `GET /:id/payments` on open (newest first, server-ordered) and
 * shows the legacy summary strip — count, total and average — above the
 * per-payment rows. The average is computed only when the list is
 * non-empty, so the empty state never divides by zero.
 */
export function PaymentHistoryDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
}: PaymentHistoryDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)

  const [payments, setPayments] = useState<InsurancePayment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!open || companyId == null) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listCompanyPayments(companyId)
      .then((rows) => {
        if (!cancelled) setPayments(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
        setPayments([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, companyId])

  const total = payments.reduce(
    (sum, payment) => sum + (Number(payment.paymentAmount) || 0),
    0
  )
  const average = payments.length > 0 ? total / payments.length : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("insurance.modals.paymentHistory")}</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pe-1">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-md border border-border p-3"
                >
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-3 w-48" />
                </div>
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t("insurance.messages.loadPaymentHistoryError")}
              </AlertDescription>
            </Alert>
          ) : payments.length === 0 ? (
            <EmptyState
              title={t("insurance.paymentHistory.noPayments")}
              icon={<CreditCardIcon className="size-8" />}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t("insurance.statistics.totalPayments")}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatNumber(payments.length)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t("insurance.report.totalAmount")}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(total, locale)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t("insurance.paymentHistory.average")}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(average, locale)}
                  </p>
                </div>
              </div>

              <ul className="space-y-2">
                {payments.map((payment) => (
                  <li
                    key={payment.paymentId}
                    className="rounded-md border border-border bg-card p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-base font-semibold tabular-nums text-foreground">
                        {formatCurrency(payment.paymentAmount, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("insurance.paymentHistory.paymentDate")}:{" "}
                        {formatDate(new Date(payment.issuedTimestamp), language)}
                      </p>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarRangeIcon aria-hidden className="size-3.5" />
                      {t("insurance.fields.paymentPeriodFrom")}:{" "}
                      {formatDate(new Date(payment.paymentFrom), language)} —{" "}
                      {formatDate(new Date(payment.paymentTo), language)}
                    </p>
                    {payment.addedByUsername ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserIcon aria-hidden className="size-3.5" />
                        {t("insurance.paymentHistory.recordedBy")}:{" "}
                        {payment.addedByUsername}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDateTime(new Date(payment.issuedTimestamp), language)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
