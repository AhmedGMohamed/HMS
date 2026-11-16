/**
 * Payroll chart labels + snapshot slots — Phase 6.11.5.
 *
 * Exports are English-only (Vault 6.9 / Insurance 6.10 / Reports 6.11.x
 * parity), so the snapshot surface uses a fixed English label set while the
 * on-screen cards take theirs from `reports.payrollReports.*`.
 */

export const PAYROLL_SNAPSHOT_KEYS = {
  timeline: "payroll-timeline",
  typeDistribution: "payroll-type",
} as const

export interface PayrollChartLabels {
  /** Series / donut centre label. */
  grossPay: string
  /** Timeline x axis. */
  period: string
  /** Donut sr caption. */
  paymentType: string
  emptyTitle: string
  emptyDescription: string
}

export const PAYROLL_SNAPSHOT_LABELS: PayrollChartLabels = {
  grossPay: "Gross Pay",
  period: "Period",
  paymentType: "Payment Type",
  emptyTitle: "No data",
  emptyDescription: "No payments in this period.",
}

export const PAYROLL_SNAPSHOT_TITLES = {
  timeline: "Payment Timeline",
  typeDistribution: "Payment Type Distribution",
} as const
