/**
 * Local-calendar date-range helpers — Phase 6.11 (promoted from Vault 6.9).
 *
 * The legacy Reports page built its default range with
 * `new Date().toISOString().slice(0, 10)`, which is UTC and therefore shifted
 * a day backwards for any user east of Greenwich late in the evening. Every
 * helper here works on **local** calendar components instead, and
 * `toDateParam` produces the `YYYY-MM-DD` string the API expects.
 */

export interface DateRange {
  from: Date
  to: Date
}

/** Formats a Date as a local `YYYY-MM-DD` (never UTC-shifted). */
export function toDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parses a `YYYY-MM-DD` string into a local-midnight Date. */
export function fromDateParam(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/** First day of the current month → today (default range). */
export function currentMonthRange(): DateRange {
  const now = new Date()
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
}

/** Today → today. */
export function todayRange(): DateRange {
  const now = new Date()
  return { from: now, to: now }
}

/** Monday of the current ISO week → today. */
export function thisWeekRange(): DateRange {
  const now = new Date()
  const day = now.getDay()
  // getDay(): 0 = Sunday. Shift so Monday is 0, Sunday is 6.
  const offset = (day + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
  return { from: monday, to: now }
}

/** First day → last day of the current month. */
export function thisMonthRange(): DateRange {
  const now = new Date()
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  }
}

/** First day → last day of the current year. */
export function thisYearRange(): DateRange {
  const now = new Date()
  return {
    from: new Date(now.getFullYear(), 0, 1),
    to: new Date(now.getFullYear(), 11, 31),
  }
}

export type DateRangePreset = "today" | "week" | "month" | "year"

/** Resolves a preset id to a concrete range. */
export function rangeForPreset(preset: DateRangePreset): DateRange {
  switch (preset) {
    case "today":
      return todayRange()
    case "week":
      return thisWeekRange()
    case "month":
      return thisMonthRange()
    case "year":
      return thisYearRange()
  }
}

/** True when `from` is on or before `to` (compares calendar days only). */
export function isValidRange(range: DateRange): boolean {
  return toDateParam(range.from) <= toDateParam(range.to)
}
