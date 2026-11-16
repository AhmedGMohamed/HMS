/**
 * Report footer rows — Phase 6.10.
 *
 * Ports the legacy `<tfoot>` rules from `createPatientGroupCard`
 * (company report) and `createAdmissionCard` (patient report):
 *
 *   medical tests · discount* · admin expenses* · VAT* · net total
 *   (+ patient paid / outstanding for company groups)
 *
 * `*` rows render only when non-zero, exactly like the legacy markup.
 * Kept in its own module (rather than next to the table components) so
 * the `react-refresh/only-export-components` rule stays happy.
 */
import type { TFunction } from "i18next"

import type {
  BillFinancials,
  ReportItem,
} from "@/pages/Insurance/types/insurance"

export interface DiscountVatMeta {
  discount: number
  discountType: string | null
  discountScope: string[] | null
  vatPercentage: number
  vatScopeCustom: string[] | null
}

export interface FooterRow {
  label: string
  value: string
  tone?: "default" | "danger" | "success" | "warning"
  emphasis?: boolean
}

export interface BuildItemFooterInput {
  items: ReportItem[]
  financials: BillFinancials
  meta: DiscountVatMeta
  t: TFunction
  /** Money formatter bound to the active locale. */
  money: (value: number) => string
  /** Show the "items total" row above the tests row (admission cards). */
  showItemsTotal?: boolean
  /** Show patient-paid + outstanding rows (company patient groups). */
  patientPaid?: number
}

export function buildItemFooter({
  items,
  financials,
  meta,
  t,
  money,
  showItemsTotal = false,
  patientPaid,
}: BuildItemFooterInput): FooterRow[] {
  const rows: FooterRow[] = []

  if (showItemsTotal) {
    const itemsTotal = items.reduce(
      (sum, item) => sum + (Number(item.totalCost) || 0),
      0
    )
    rows.push({
      label: `${t("insurance.report.admissionTotal")}:`,
      value: money(itemsTotal),
    })
  }

  rows.push({
    label: `${t("insurance.patient.medicalTests")}:`,
    value: money(financials.medicalTestsTotal),
  })

  if (financials.discountAmount > 0) {
    const scope = (meta.discountScope ?? []).join("/")
    const percentPrefix =
      meta.discountType === "percentage" ? `${meta.discount}% ` : ""
    rows.push({
      label: `${percentPrefix}${t("insurance.report.discount")}${
        scope ? ` (${scope})` : ""
      }:`,
      value: `-${money(financials.discountAmount)}`,
      tone: "danger",
    })
  }

  if (financials.adminExpenses > 0) {
    rows.push({
      label: `${t("insurance.report.adminExpenses")}:`,
      value: money(financials.adminExpenses),
    })
  }

  if (financials.vatAmount > 0) {
    const scope = (meta.vatScopeCustom ?? []).join("/")
    rows.push({
      label: `${meta.vatPercentage}% ${t("insurance.report.vat")}${
        scope ? ` (${scope})` : ""
      }:`,
      value: money(financials.vatAmount),
    })
  }

  rows.push({
    label: `${t("insurance.report.netTotal")}:`,
    value: money(financials.netTotal),
    emphasis: true,
  })

  if (patientPaid !== undefined) {
    rows.push({
      label: `${t("insurance.statistics.patientPaidAmount")}:`,
      value: money(patientPaid),
      tone: "success",
    })
    const outstanding = financials.netTotal - patientPaid
    rows.push({
      label: `${t("insurance.statistics.outstandingBalance")}:`,
      value: money(outstanding),
      tone: outstanding > 0 ? "warning" : "success",
    })
  }

  return rows
}
