/**
 * Duration math for clock-in records (§3.5 of `phase_6.8_plan.md`).
 *
 * Pure functions only — i18n formatting happens in `LiveDuration`
 * (`clocking.duration.hoursMinutes` / `duration.minutes` keys).
 * Legacy parity: whole floor hours/minutes, and negative spans
 * (clock-out before clock-in in existing data) render as computed —
 * no clamping.
 */

export interface DurationParts {
  hours: number
  minutes: number
  /** Raw signed span in milliseconds. */
  totalMs: number
  /** True when the end precedes the start (bad data / future clock-in). */
  negative: boolean
}

/**
 * Span between `startIso` and `endIso` (a completed record) or `now`
 * (a live, still-active record when `endIso` is `null`).
 */
export function computeDurationParts(
  startIso: string,
  endIso: string | null,
  now: Date = new Date(),
): DurationParts {
  const startMs = new Date(startIso).getTime()
  const endMs = endIso ? new Date(endIso).getTime() : now.getTime()
  const totalMs = endMs - startMs
  const absMs = Math.abs(totalMs)
  return {
    hours: Math.floor(absMs / 3_600_000),
    minutes: Math.floor(absMs / 60_000) % 60,
    totalMs,
    negative: totalMs < 0,
  }
}

/** Whole elapsed minutes — quick clock-out guard uses this to detect
 *  non-positive spans client-side (legacy allowed negative durations). */
export function isNonPositiveDuration(parts: DurationParts): boolean {
  return parts.totalMs <= 0
}
