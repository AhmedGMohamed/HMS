"use client"

/**
 * Report status badges — Phase 6.11.
 *
 * Every badge pairs colour with text (design.md §8: never colour-only
 * encoding) and resolves its label from the `reports` namespace, so a badge
 * renders identically on screen, in tables and inside the detail dialogs.
 *
 * `variant` choice follows design.md §6.5: soft tones for informational
 * states, `destructive` only for genuine exceptions (missing clock-in,
 * outstanding balance).
 */

import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

function SoftBadge({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("font-medium", className)}>
      {label}
    </Badge>
  )
}

/* ------------------------------------------------------------------ */
/* Payment type                                                        */
/* ------------------------------------------------------------------ */

const PAYMENT_STYLES: Record<string, string> = {
  cash: "border-success/40 bg-success-light text-success-dark",
  credit: "border-warning/40 bg-warning-light text-text-primary",
  insurance: "border-info/40 bg-info-light text-info",
}

export function PaymentTypeBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation()
  const key = value ?? "cash"
  const label = t(`reports.paymentTypes.${key}`, { defaultValue: key })
  return <SoftBadge label={label} className={PAYMENT_STYLES[key] ?? undefined} />
}

/* ------------------------------------------------------------------ */
/* Gender                                                              */
/* ------------------------------------------------------------------ */

export function GenderBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation()
  if (!value) return <span className="text-muted-foreground">—</span>
  return <SoftBadge label={t(`reports.genderTypes.${value}`, { defaultValue: value })} />
}

/* ------------------------------------------------------------------ */
/* Admission                                                           */
/* ------------------------------------------------------------------ */

export function AdmissionStatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return active ? (
    <Badge variant="destructive" className="font-medium">
      {t("reports.enums.admissionStatus.active")}
    </Badge>
  ) : (
    <SoftBadge label={t("reports.enums.admissionStatus.discharged")} />
  )
}

/* ------------------------------------------------------------------ */
/* Doctor type                                                         */
/* ------------------------------------------------------------------ */

export function DoctorTypeBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation()
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <SoftBadge label={t(`reports.enums.doctorType.${value}`, { defaultValue: value })} />
  )
}

/* ------------------------------------------------------------------ */
/* Employee type                                                       */
/* ------------------------------------------------------------------ */

export function EmployeeTypeBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation()
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <SoftBadge
      label={t(`reports.enums.employeeType.${value}`, { defaultValue: value })}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Payroll payment type                                                */
/* ------------------------------------------------------------------ */

/**
 * `salary` / `bonus` / `manual` / `overtime` — the `EmployeePayment.payment_type`
 * values.
 *
 * Kept separate from `PaymentTypeBadge` (which is cash/credit/insurance for a
 * **bill**): the two enums share no values, and reusing one for the other
 * rendered "salary" as an unstyled fallback.
 */
const PAYROLL_PAYMENT_STYLES: Record<string, string> = {
  salary: "border-success/40 bg-success-light text-success-dark",
  bonus: "border-warning/40 bg-warning-light text-text-primary",
  overtime: "border-info/40 bg-info-light text-info",
  manual: "border-border-strong bg-surface-muted text-text-secondary",
}

export function PayrollPaymentTypeBadge({
  value,
}: {
  value: string | null | undefined
}) {
  const { t } = useTranslation()
  const key = value ?? "manual"
  return (
    <SoftBadge
      label={t(`reports.payrollReports.paymentTypes.${key}`, {
        defaultValue: key,
      })}
      className={PAYROLL_PAYMENT_STYLES[key] ?? undefined}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

const ATTENDANCE_VARIANTS: Record<string, { variant: BadgeVariant; className?: string }> = {
  on_time: { variant: "outline", className: "border-success/40 bg-success-light text-success-dark" },
  late: { variant: "outline", className: "border-warning/40 bg-warning-light text-warning" },
  early: { variant: "outline", className: "border-info/40 bg-info-light text-info" },
  incomplete: { variant: "outline", className: "border-border-strong bg-surface-muted text-text-tertiary" },
  missing: { variant: "destructive" },
}

export function AttendanceStatusBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation()
  const key = value ?? "missing"
  const config = ATTENDANCE_VARIANTS[key] ?? { variant: "outline" as BadgeVariant }
  return (
    <Badge variant={config.variant} className={cn("font-medium", config.className)}>
      {t(`reports.enums.attendance.${key}`, { defaultValue: key })}
    </Badge>
  )
}

/* ------------------------------------------------------------------ */
/* Billed item type                                                    */
/* ------------------------------------------------------------------ */

const ITEM_TYPE_STYLES: Record<string, string> = {
  service: "border-primary/30 bg-primary-light text-primary",
  drug: "border-info/40 bg-info-light text-info",
  supply: "border-border-strong bg-surface-muted text-text-secondary",
}

/** `service` / `drug` / `supply` — the three `BillDetail` origin columns. */
export function ItemTypeBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation()
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <SoftBadge
      label={t(`reports.enums.itemType.${value}`, { defaultValue: value })}
      className={ITEM_TYPE_STYLES[value] ?? undefined}
    />
  )
}
