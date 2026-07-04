"use client"

import { useUIStore } from "@/store/uiStore"
import { resolveLocale } from "@/lib/utils"

/**
 * Locale-aware date / date-time helpers used by the Admissions tab.
 * Mirrors the legacy `i18n.formatDate` + `i18n.formatDateTime` calls so
 * the rendered strings match the legacy cards.
 *
 * Components subscribe to `useUIStore.language` to recompute when the
 * user toggles EN/AR.
 */

export function useShortDateFormatter(): (value: string | Date | null) => string {
  const language = useUIStore((s) => s.language)
  return (value) => formatShortDate(value, language as "en" | "ar")
}

export function useDateTimeFormatter(): (value: string | Date | null) => string {
  const language = useUIStore((s) => s.language)
  return (value) => formatDateTime(value, language as "en" | "ar")
}

export function useCurrencyFormatter(): (value: number) => string {
  const language = useUIStore((s) => s.language)
  return (value) => formatCurrency(value, language as "en" | "ar")
}

/**
 * Returns `"DD/MM/YYYY"` style. Falls through for invalid input.
 */
export function formatShortDate(
  value: string | Date | null | undefined,
  language: "en" | "ar"
): string {
  if (value === null || value === undefined || value === "") return "—"
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return "—"
  const locale = resolveLocale(language)
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

/**
 * Returns `"DD/MM/YYYY HH:mm"` style (24-hour), heading-usable.
 * Legacy used 12-hour with AM/PM — we use 24-hour because:
 *  - it's locale-agnostic (works for AR & EN without wrapping)
 *  - it matches what the renderer's `calendar.tsx` does on date inputs
 *  - audit logs already use ISO dates
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  language: "en" | "ar"
): string {
  if (value === null || value === undefined || value === "") return "—"
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return "—"
  const locale = resolveLocale(language)
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

/**
 * Two-decimal currency string. Pads with a leading currency code (kept
 * identical to T6's `formatCurrency` to ensure consistency across
 * Billing tab and Admissions tab).
 */
export function formatCurrency(value: number, language?: "en" | "ar"): string {
  const v = Number.isFinite(value) ? value : 0
  // Match the legacy's "EGP 1,234.50" / "1,234.50 ج.م" pattern.
  const tmp = new Intl.NumberFormat(
    language === "ar" ? "ar-EG" : "en-GB",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  ).format(v)
  if (language === "ar") return `${tmp} ج.م`
  return `EGP ${tmp}`
}

/**
 * Computes the legacy "Length of stay" string. Mirrors the algorithm
 * in legacy `calculateLengthOfStay`:
 *  - 1 day exactly → `"1 day"`
 *  - < 1 day       → `"N hours"`
 *  - otherwise     → `"N days"`
 *
 * `t` is used for the unit words; pass `useTranslation().t` from the
 * caller.
 */
export function calculateLengthOfStay(
  admissionTime: string,
  dischargeTime: string,
  t: (key: string) => string
): string {
  const a = new Date(admissionTime).getTime()
  const d = new Date(dischargeTime).getTime()
  if (Number.isNaN(a) || Number.isNaN(d)) return "—"
  const diff = Math.abs(d - a)
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days === 1) return `1 ${t("patients.messages.day")}`
  if (days < 1) {
    const hours = Math.ceil(diff / (1000 * 60 * 60))
    if (hours <= 1) return `1 ${t("patients.messages.hours")}`
    return `${hours} ${t("patients.messages.hours")}`
  }
  return `${days} ${t("patients.messages.days")}`
}

/**
 * Read the bill balance with the legacy sign semantics:
 *  - `> 0` → patient owes (`text-destructive`)
 *  - `≤ 0` → fully paid / overpaid (`text-success`)
 */
export function balanceIsOwed(balance: number): boolean {
  return balance > 0
}
