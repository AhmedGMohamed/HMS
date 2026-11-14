"use client"

import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatDateTime } from "@/lib/utils"
import { PaymentStatusBadge } from "@/pages/Employees/components/EmployeeDisplay"
import {
  useEmployeeLocale,
  usePaymentAmount,
} from "@/pages/Employees/hooks/useEmployeeDisplay"
import { usePendingPaymentsForEmployee } from "@/pages/Employees/hooks/usePendingPaymentsForEmployee"
import type { EmployeePayment } from "@/pages/Employees/types/employee"

export interface PaymentGroupDetailsProps {
  employeeId: number
  /** Same queue date filter as the collapsed row's aggregate. */
  from: string
  to: string
  onMarkPaid: (payment: EmployeePayment) => void
  onVoid: (payment: EmployeePayment) => void
}

/**
 * Expanded content of one pending-payments queue row.
 *
 * Mounted only while the row is open (`DataTable` renders
 * `renderExpanded` for expanded rows alone), so the per-employee request
 * fires exactly when the user asks for it — the queue itself never
 * downloads payment rows.
 */
export function PaymentGroupDetails({
  employeeId,
  from,
  to,
  onMarkPaid,
  onVoid,
}: PaymentGroupDetailsProps) {
  const { t } = useTranslation()
  const locale = useEmployeeLocale()
  const paymentAmount = usePaymentAmount()
  const { payments, loading, error, refresh } = usePendingPaymentsForEmployee(
    employeeId,
    from,
    to
  )

  if (loading && payments.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Spinner aria-hidden className="size-4" />
        {t("employees.messages.loadingPayments")}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 p-3 text-sm text-destructive">
        {t("employees.messages.loadError")}
        <Button type="button" variant="outline" size="sm" onClick={refresh}>
          {t("employees.buttons.retry")}
        </Button>
      </div>
    )
  }

  if (payments.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {t("employees.messages.noPendingPayments")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {payments.map((payment) => {
        const { total, breakdown } = paymentAmount(payment)
        return (
          <div
            key={payment.paymentId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground tabular-nums">
                #{payment.paymentId}
              </span>
              <span className="font-medium tabular-nums">{total}</span>
              <span className="text-xs text-muted-foreground">{breakdown}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(new Date(payment.issuedTimestamp), locale)}
              </span>
              <PaymentStatusBadge payment={payment} />
            </div>
            <div className="flex items-center gap-1.5">
              {!payment.isPaid && !payment.isVoid ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onMarkPaid(payment)}
                >
                  {t("employees.buttons.markPaid")}
                </Button>
              ) : null}
              {!payment.isVoid ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => onVoid(payment)}
                >
                  {t("employees.buttons.void")}
                </Button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
