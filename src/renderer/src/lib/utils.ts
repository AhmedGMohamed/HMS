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
export function formatCurrency(amount: number, locale = "en-US"): string {
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
 *
 * Accepts a `number` or a numeric string (e.g. a Postgres `BIGINT`
 * returned by the `pg` driver as `"12345"`); non-numeric input is
 * coerced to `0` so a stray string never crashes a render path. NaN
 * and Infinity are also coerced to `0`.
 */
export function formatNumber(n: number | string, decimals = 0): string {
  const value = Number(n)
  if (!Number.isFinite(value)) {
    return (0).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  }
  return value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
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

/**
 * Raw `frequency` value as it can appear on the wire. The backend
 * stores it as a Postgres `INTERVAL`, but the API has been observed
 * to return either a `"HH:MM:SS"` string (the `pg` default parser) or
 * an object like `{ seconds: 4, minutes: 0, hours: 0 }` (a custom
 * parser or a different `pg` build). Both shapes are accepted and
 * normalised by `parseInterval` below.
 */
export type FrequencyValue =
  | string
  | { hours?: number; minutes?: number; seconds?: number }
  | null
  | undefined

/**
 * Normalises a `FrequencyValue` into `{ hours, minutes, seconds }`.
 *
 * Accepts:
 *   - `"HH:MM:SS"` (and the optional fractional-seconds variant)
 *   - `{ hours?, minutes?, seconds? }` (the object shape some pg
 *     builds / serializers emit)
 *
 * Returns `null` for empty, `null`, `undefined`, or unparsable input.
 */
export function parseInterval(
  value: FrequencyValue
): { hours: number; minutes: number; seconds: number } | null {
  if (value == null) return null
  if (typeof value === "string") {
    if (!value.trim()) return null
    const match = /^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value.trim())
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    const seconds = Number(match[3])
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds)
    ) {
      return null
    }
    return { hours, minutes, seconds }
  }
  if (typeof value === "object") {
    const hours = Number(value.hours ?? 0)
    const minutes = Number(value.minutes ?? 0)
    const seconds = Number(value.seconds ?? 0)
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds)
    ) {
      return null
    }
    return { hours, minutes, seconds }
  }
  return null
}

/**
 * Serialises `{ hours, minutes, seconds }` back into the `"HH:MM:SS"`
 * string the backend's `INTERVAL` column accepts.
 *
 * Returns `null` when every component is zero (mirroring the form's
 * "no frequency set" state) or when input is missing.
 */
export function formatInterval(parts: {
  hours: number
  minutes: number
  seconds: number
} | null | undefined): string | null {
  if (!parts) return null
  const h = Math.max(0, Math.floor(parts.hours))
  const m = Math.max(0, Math.floor(parts.minutes))
  const s = Math.max(0, Math.floor(parts.seconds))
  if (h === 0 && m === 0 && s === 0) return null
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
}

/**
 * Human-readable interval for table cells: "1h 30m 15s".
 * Returns "—" for null/empty input.
 */
export function formatIntervalHuman(value: FrequencyValue): string {
  const parts = parseInterval(value)
  if (!parts) return "—"
  const { hours, minutes, seconds } = parts
  if (hours === 0 && minutes === 0 && seconds === 0) return "—"
  const pieces: string[] = []
  if (hours > 0) pieces.push(`${hours}h`)
  if (minutes > 0) pieces.push(`${minutes}m`)
  if (seconds > 0) pieces.push(`${seconds}s`)
  return pieces.join(" ")
}
