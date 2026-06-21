import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Localised currency formatter.
 *
 * Default uses Arabic locale (per plan §Phase 1) — the app is bilingual
 * (EN/AR) but pricing is consistently quoted in Arabic-locale EGP for
 * the Egyptian deployment. Pass `locale` to override per-page.
 */
export function formatCurrency(amount: number, locale = "ar-EG"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
  }).format(amount)
}

export function formatDate(date: Date, locale = "en"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US").format(date)
}

export function formatDateTime(date: Date, locale = "en"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

/**
 * Grouped-thousands number (e.g. 12,345). Used in tables and KPIs where
 * decimals are unnecessary.
 */
export function formatNumber(n: number, decimals = 0): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Maps the active UI language key ("en" | "ar") to an Intl locale.
 * Centralised so all formatters agree on a single locale per language.
 */
export function resolveLocale(language: string): string {
  return language === "ar" ? "ar-EG" : "en-US"
}

/**
 * Initial-capitals for avatar placeholders.
 * Handles Arabic by accepting a single glyph and falling back to "?" only
 * for empty input.
 */
export function getInitials(name: string): string {
  if (!name) return "?"
  const trimmed = name.trim()
  if (!trimmed) return "?"
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}
