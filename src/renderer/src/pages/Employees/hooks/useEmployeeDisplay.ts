"use client"

import { useTranslation } from "react-i18next"

import { formatCurrency, formatNumber, resolveLocale } from "@/lib/utils"
import type {
  Doctor,
  Employee,
  EmployeePayment,
} from "@/pages/Employees/types/employee"

/**
 * Derived-value hooks + pure formatters for the Employees module
 * (Phase 6.7). Kept separate from the presentational components in
 * `components/EmployeeDisplay.tsx` so each file only exports one kind
 * of thing (react-refresh/only-export-components).
 */

export function useEmployeeLocale(): string {
  const { i18n } = useTranslation()
  return resolveLocale(i18n.language)
}

/** Per-patient pay: fixed → currency, percentage → `N%` (legacy rule). */
export function formatPerPatientPay(
  value: number | null | undefined,
  type: string | null | undefined,
  locale: string
): string {
  if (value == null || !Number.isFinite(Number(value))) return "—"
  const amount = Number(value)
  if (type === "percentage") return `${formatNumber(amount, 0)}%`
  return formatCurrency(amount, locale)
}

/** Legacy "Extra Payment" summary: per-patient type + extra type. */
export function useExtraPaymentSummary() {
  const { t } = useTranslation()
  return (employee: Employee | Doctor): string => {
    const per = employee.perPatientPaymentType
      ? t(
          `employees.perPatientPaymentTypes.${employee.perPatientPaymentType}`
        )
      : ""
    const extra =
      employee.extraPaymentType && employee.extraPaymentType !== "none"
        ? t(`employees.paymentTypes.${employee.extraPaymentType}`)
        : t("employees.paymentTypes.none")
    return [per, extra].filter(Boolean).join(" · ")
  }
}

/** Total amount = payment_amount + extra_amount, with breakdown. */
export function usePaymentAmount() {
  const locale = useEmployeeLocale()
  const { t } = useTranslation()
  return (payment: EmployeePayment): { total: string; breakdown: string } => {
    const base = Number(payment.paymentAmount) || 0
    const extra = Number(payment.extraAmount) || 0
    return {
      total: formatCurrency(base + extra, locale),
      breakdown: t("employees.messages.amountBreakdown", {
        base: formatCurrency(base, locale),
        extra: formatCurrency(extra, locale),
      }),
    }
  }
}
