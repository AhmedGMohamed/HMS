import type { ClockIn } from "@/pages/Clocking/types/clocking"

/**
 * Anomaly derivation for clock-in rows (§B3 of `phase_6.8_ux_research.md`).
 *
 * Pure, client-side, computed from the single `/api/clock-ins` payload —
 * no backend support required. Drives three reinforcing surfaces:
 * KPI cards (discovery), the `missingOnly` filter chip (action), and
 * per-row status badges (context).
 */

const DAY_MS = 86_400_000

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export type Anomaly =
  | {
      /** Open row whose clock-in predates today. Escalates to danger at
       *  ≥72h (three full payroll days). */
      kind: "missingClockOut"
      level: "warning" | "danger"
      daysOpen: number
    }
  /** Live duration ≥ 8h and < 12h (norms the 8h workday; overtime band). */
  | { kind: "extendedShift"; level: "warning" }
  /** Live duration ≥ 12h (fatigue ceiling; Joint Commission SEA #50). */
  | { kind: "fatigueRisk"; level: "danger" }
  /** Clock-in is dated in the future (typo / timezone slip). */
  | { kind: "futureClockIn"; level: "warning" }
  /** Completed row whose clock-out precedes its clock-in (bad data). */
  | { kind: "negativeDuration"; level: "danger" }
  /** A second open record for the same employee. */
  | { kind: "duplicateActive"; level: "warning" }

/** Open rows whose clock-in predates today (missing clock-out). */
export function isMissingClockOut(row: ClockIn, now: Date): boolean {
  return !row.clockOut && startOfDay(new Date(row.clockIn)) < startOfDay(now)
}

/** Live duration in hours for an open row. */
function liveHours(row: ClockIn, now: Date): number {
  return (now.getTime() - new Date(row.clockIn).getTime()) / 3_600_000
}

/** Employee ids that currently have more than one open record. */
export function duplicateActiveEmployeeIds(clockIns: ClockIn[]): Set<number> {
  const open = clockIns.filter((row) => !row.clockOut)
  const counts = new Map<number, number>()
  for (const row of open) {
    counts.set(row.employeeId, (counts.get(row.employeeId) ?? 0) + 1)
  }
  return new Set(
    [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  )
}

/** All anomalies for one row (a row can carry more than one). */
export function deriveAnomalies(
  row: ClockIn,
  now: Date,
  duplicateIds: ReadonlySet<number>,
): Anomaly[] {
  const anomalies: Anomaly[] = []
  const open = !row.clockOut

  if (open && isMissingClockOut(row, now)) {
    const daysOpen = Math.floor(
      (startOfDay(now).getTime() - startOfDay(new Date(row.clockIn)).getTime()) /
        DAY_MS,
    )
    anomalies.push({
      kind: "missingClockOut",
      level: daysOpen >= 3 ? "danger" : "warning",
      daysOpen,
    })
  }

  if (open) {
    const hours = liveHours(row, now)
    if (hours >= 12) {
      anomalies.push({ kind: "fatigueRisk", level: "danger" })
    } else if (hours >= 8) {
      anomalies.push({ kind: "extendedShift", level: "warning" })
    }
  }

  if (new Date(row.clockIn).getTime() > now.getTime()) {
    anomalies.push({ kind: "futureClockIn", level: "warning" })
  }

  if (
    row.clockOut &&
    new Date(row.clockOut).getTime() < new Date(row.clockIn).getTime()
  ) {
    anomalies.push({ kind: "negativeDuration", level: "danger" })
  }

  if (open && duplicateIds.has(row.employeeId)) {
    anomalies.push({ kind: "duplicateActive", level: "warning" })
  }

  return anomalies
}

/** KPI metric — open shifts carried over from previous days. */
export function countMissingClockOut(clockIns: ClockIn[], now: Date): number {
  return clockIns.filter((row) => isMissingClockOut(row, now)).length
}

/** KPI metric — open shifts at or beyond the 12h fatigue ceiling. */
export function countOver12h(clockIns: ClockIn[], now: Date): number {
  return clockIns.filter(
    (row) => !row.clockOut && liveHours(row, now) >= 12,
  ).length
}
