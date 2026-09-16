"use client"

import { useTranslation } from "react-i18next"
import { CheckCircle2Icon, XCircleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCurrency } from "@/lib/utils"
import type { EmployeePayment } from "@/pages/Employees/types/employee"

/**
 * Presentational badges/cells shared by the Employees module tables
 * and detail sheet (Phase 6.7). Derived-value hooks live in
 * `hooks/useEmployeeDisplay.ts` — keep this file components-only
 * (react-refresh/only-export-components).
 */

/** Active/inactive badge — icon + text, never bare ✓/✗ (design.md §6.2). */
export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return active ? (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2Icon aria-hidden className="size-3.5" />
      {t("common.yes")}
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <XCircleIcon aria-hidden className="size-3.5" />
      {t("common.no")}
    </Badge>
  )
}

/**
 * Money cell gated behind `manage_payments` (legacy parity): pay
 * figures are sensitive — users without the permission see an em-dash
 * with an explanatory tooltip instead of the amount.
 */
export function GatedMoney({
  value,
  canView,
  format,
}: {
  value: number | null | undefined
  canView: boolean
  /** Pre-formatted string (per-patient % vs currency). */
  format: () => string
}) {
  const { t } = useTranslation()
  if (!canView) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent>
          {t("employees.messages.paymentsPermissionRequired")}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (value == null || !Number.isFinite(Number(value))) {
    return <span className="text-muted-foreground">—</span>
  }
  return <span className="tabular-nums">{format()}</span>
}

/** Currency-formatted gated cell. */
export function GatedCurrency({
  value,
  canView,
  locale,
}: {
  value: number | null | undefined
  canView: boolean
  locale: string
}) {
  return (
    <GatedMoney
      value={value}
      canView={canView}
      format={() => formatCurrency(Number(value), locale)}
    />
  )
}

/** Payment status badge (paid / pending / void) with icon + text. */
export function PaymentStatusBadge({ payment }: { payment: EmployeePayment }) {
  const { t } = useTranslation()
  if (payment.isVoid) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <XCircleIcon aria-hidden className="size-3.5" />
        {t("employees.paymentStatus.void")}
      </Badge>
    )
  }
  if (payment.isPaid) {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2Icon aria-hidden className="size-3.5" />
        {t("employees.paymentStatus.paid")}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-warning text-warning"
    >
      <span
        aria-hidden
        className="size-2 rounded-full bg-warning"
      />
      {t("employees.paymentStatus.pending")}
    </Badge>
  )
}
