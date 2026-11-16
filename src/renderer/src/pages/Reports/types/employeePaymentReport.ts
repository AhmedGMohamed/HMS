/**
 * Employee payments (payroll) report types — Phase 6.11.5.
 *
 * camelCase mirrors of the payroll slice of
 * `src/app/utils/types/reports.d.ts` (the model emits snake_case; `lib/api.ts`
 * normalizes keys at the boundary).
 *
 * Four shapes:
 *   - the **list** is one row per employee with in-range aggregates, plus the
 *     whole-set summary and both chart series,
 *   - the **detail** is one employee: identity, pay configuration, summary, one
 *     page of payments and every period deduction,
 *   - the **associations** payload is the patient work behind one payment,
 *   - the **export** carries every employee with every payment, every
 *     association and every deduction.
 *
 * ## `totals` is not `summary`
 *
 * An export row's per-employee roll-up is `totals`; only the envelope has a
 * `summary` (contract 36). The two are deliberately different names so a
 * document can never print one where the other belongs.
 *
 * ## The money rules live server-side
 *
 * Deductions are period-scoped **once per employee**, paid/unpaid are gross
 * (`base + extra`) and void payments are excluded. Nothing here re-derives
 * those figures: the renderer only formats what the model returned, so the KPI
 * strip, the table footer and the PDF cannot disagree.
 */

import type {
  EmployeeTypeFilter,
  ReportGrouping,
  ReportRange,
} from "@/pages/Reports/types/reports"

/* ------------------------------------------------------------------ */
/* Envelopes                                                           */
/* ------------------------------------------------------------------ */

export interface EmployeePaymentSummary {
  totalEmployees: number
  totalPayments: number
  totalBasePay: number
  totalExtraPay: number
  totalDeductions: number
  totalPaid: number
  totalUnpaid: number
  totalNet: number
}

/** The two chart series; both are **gross** pay. */
export interface EmployeePaymentCharts {
  timeline: Array<{ period: string; total: number }>
  byType: Array<{ paymentType: string; total: number }>
}

export interface EmployeePaymentListPayload {
  summary: EmployeePaymentSummary
  charts: EmployeePaymentCharts
  data: EmployeePaymentRow[]
  total: number
  page: number
  pageSize: number
}

/** The export envelope echoes the server's own range, not `from`/`to`. */
export interface EmployeePaymentExportRange {
  startDate: string
  endDate: string
}

export interface EmployeePaymentExportPayload {
  generatedAt: string
  range: EmployeePaymentExportRange
  /** The grouping the timeline in the document was bucketed with. */
  grouping: ReportGrouping
  summary: EmployeePaymentSummary
  charts: EmployeePaymentCharts
  /** Every matching employee, each with every payment and deduction. */
  data: EmployeePaymentExportRow[]
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface EmployeePaymentRow {
  employeeId: number
  employeeName: string
  employeeType: string
  hireDate: string | null
  paymentCount: number
  totalBasePay: number
  totalExtraPay: number
  totalDeductions: number
  totalPaid: number
  totalUnpaid: number
  netPayment: number
}

export interface EmployeePaymentDetailRow {
  paymentId: number
  paymentDate: string
  paymentAmount: number
  extraAmount: number
  extraPaymentType: string | null
  paymentType: string
  percentageScope: string | null
  isPaid: boolean
  paidTimestamp: string | null
  paidBy: string | null
  patientCount: number
}

/** One clock-in that reduced pay, with its derived attendance status. */
export interface PeriodDeductionRow {
  clockId: number
  clockIn: string
  clockOut: string | null
  hoursWorked: number
  payDeduction: number
  /** `on_time` | `late` | `early` | `incomplete` | `missing`. */
  status: string
}

/** The employee's configured pay rules — the detail dialog's config card. */
export interface EmployeePaymentBreakdown {
  basePay: number
  baseExtraAmount: number
  baseExtraPaymentType: string | null
  perPatientPaymentType: string | null
  percentageScope: string | null
  needClockIn: boolean
  shiftType: string | null
  shiftStartTime: string | null
  shiftEndTime: string | null
  totalWorkDays: number
  totalPatientsServed: number
}

/** The detail summary has no `totalEmployees` (there is only one employee). */
export interface EmployeePaymentDetailSummary {
  totalPayments: number
  totalBasePay: number
  totalExtraPay: number
  totalDeductions: number
  totalPaid: number
  totalUnpaid: number
  netPayment: number
}

export interface EmployeePaymentDetailPayload {
  employee: {
    employeeId: number
    employeeName: string
    employeeType: string
    hireDate: string | null
  }
  breakdown: EmployeePaymentBreakdown
  summary: EmployeePaymentDetailSummary
  /** One page of payments, newest first. */
  payments: EmployeePaymentDetailRow[]
  /** Every deduction in the period, newest first (never per payment). */
  periodDeductions: PeriodDeductionRow[]
  total: number
  page: number
  pageSize: number
}

/* ------------------------------------------------------------------ */
/* Associations                                                        */
/* ------------------------------------------------------------------ */

export interface PaymentAssociationRow {
  paymentPatientId: number
  patientId: number
  patientName: string
  patientHistoryId: number | null
  admissionTime: string | null
  dischargeTime: string | null
  diagnosis: string | null
  workDate: string
  hoursWorked: number
  paymentAmount: number
  paymentType: string
}

/** `GET /employee-payments/:employeeId/payments/:paymentId`. */
export interface EmployeePaymentAssociationsPayload {
  payment: EmployeePaymentDetailRow
  associations: PaymentAssociationRow[]
}

/* ------------------------------------------------------------------ */
/* Export rows                                                         */
/* ------------------------------------------------------------------ */

export interface EmployeePaymentExportPayment
  extends EmployeePaymentDetailRow {
  associations: PaymentAssociationRow[]
}

export interface EmployeePaymentExportTotals {
  payments: number
  basePay: number
  extraPay: number
  deductions: number
  paid: number
  unpaid: number
  net: number
}

/**
 * One employee in the payroll export.
 *
 * The per-employee roll-up is `totals`, never `summary` (contract 36).
 */
export interface EmployeePaymentExportRow {
  employeeId: number
  employeeName: string
  employeeType: string
  hireDate: string | null
  totals: EmployeePaymentExportTotals
  breakdown: EmployeePaymentBreakdown
  payments: EmployeePaymentExportPayment[]
  periodDeductions: PeriodDeductionRow[]
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

/** Payroll-list sort keys (`?sort=`); the server whitelists the same set. */
export const EMPLOYEE_PAYMENT_SORT_COLUMNS = {
  name: "name",
  payments: "payments",
  base: "base",
  extra: "extra",
  deductions: "deductions",
  net: "net",
} as const

export type EmployeePaymentSortColumn =
  (typeof EMPLOYEE_PAYMENT_SORT_COLUMNS)[keyof typeof EMPLOYEE_PAYMENT_SORT_COLUMNS]

export function isEmployeePaymentSortColumn(
  value: string
): value is EmployeePaymentSortColumn {
  return (Object.values(EMPLOYEE_PAYMENT_SORT_COLUMNS) as string[]).includes(
    value
  )
}

/** Groupings the timeline accepts; the tab sends the generated one. */
export const EMPLOYEE_PAYMENT_GROUPINGS: readonly ReportGrouping[] = [
  "day",
  "month",
  "year",
]

export interface EmployeePaymentQueryFilters {
  range: ReportRange
  /** `all` means "no type filter"; the API omits the param in that case. */
  employeeType: EmployeeTypeFilter
  /** `null` = every employee with a payment in range. */
  employeeId: number | null
  /** Matches the employee's name. */
  search: string
  /** Timeline bucket size. */
  grouping: ReportGrouping
}

export interface EmployeePaymentQueryPaging {
  page: number
  pageSize: number
  sort: { columnId: string; direction: "asc" | "desc" } | null
}
