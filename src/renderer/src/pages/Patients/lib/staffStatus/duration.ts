/**
 * T9.2 — Pure duration helpers for the staff status panel.
 *
 * `formatDuration(start, end)` formats a [start, end] interval as a
 * compact human-readable string:
 *   - < 1 hour     → "{{minutes}}m"
 *   - < 24 hours   → "{{hours}}h {{minutes}}m"
 *   - ≥ 24 hours   → "{{days}}d {{hours}}h"
 *
 * Both timestamps are accepted as `string | number | Date`. Strings
 * are parsed verbatim as ISO / locale-aware strings by `new Date()`.
 * Invalid inputs degrade to "—" instead of throwing so the UI never
 * crashes on missing/malformed timestamps.
 *
 * Used only by StaffStatusPanel (T9.2) for "On duty for {{duration}}"
 * (clock-in duration per staff member) and "In for {{duration}}"
 * (admission-so-far duration per patient).
 */

export interface ParsedDuration {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
}

function parseTimestamp(
  input: string | number | Date | null | undefined
): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns the [start, end] interval broken down to whole days/hours/
 * minutes. `end` defaults to `Date.now()` so callers only have to
 * supply their start timestamp.
 */
export function calculateDuration(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined = Date.now()
): ParsedDuration | null {
  const startDate = parseTimestamp(start);
  const endDate = parseTimestamp(end);
  if (!startDate || !endDate) return null;
  const totalMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const totalMinutes = Math.floor(totalMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes - days * 60 * 24 - hours * 60;
  return { totalMs, days, hours, minutes };
}

export function formatDuration(
  start: string | number | Date | null | undefined,
  end?: string | number | Date | null | undefined
): string {
  const dur = calculateDuration(start, end);
  if (!dur || dur.totalMs === 0) return "—";
  if (dur.days >= 1) return `${dur.days}d ${dur.hours}h`;
  if (dur.hours >= 1) return `${dur.hours}h ${dur.minutes}m`;
  if (dur.minutes >= 1) return `${dur.minutes}m`;
  /* < 1 minute (clock-in <=60s ago) — render as "1m" to keep the
     surface visually consistent instead of swapping to "now". */
  return "1m";
}
