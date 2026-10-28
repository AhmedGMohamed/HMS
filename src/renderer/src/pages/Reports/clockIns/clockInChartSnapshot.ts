/**
 * Clock-in chart labels + snapshot slots — Phase 6.11.6.
 *
 * Exports are English-only (Vault 6.9 / Insurance 6.10 / Reports 6.11.x
 * parity), so the snapshot surface uses a fixed English label set while the
 * on-screen cards take theirs from `reports.clockInReports.*`.
 */

export const CLOCK_IN_SNAPSHOT_KEYS = {
  hours: "clockin-hours",
  status: "clockin-status",
} as const

export interface ClockInChartLabels {
  /** Bar series / axis metric. */
  hours: string
  /** Horizontal bar axis (the employee names). */
  employee: string
  /** Donut centre label. */
  status: string
  emptyTitle: string
  emptyDescription: string
}

export const CLOCK_IN_SNAPSHOT_LABELS: ClockInChartLabels = {
  hours: "Hours Worked",
  employee: "Employee",
  status: "Attendance Status",
  emptyTitle: "No data",
  emptyDescription: "No clock-ins in this period.",
}

export const CLOCK_IN_SNAPSHOT_TITLES = {
  hours: "Hours Worked by Employee",
  status: "Attendance Status Distribution",
} as const
