/**
 * Bilingual labels used by `printBill.ts` to render the patient's
 * bill PDF body. The shell (`src/renderer/src/lib/pdfShell.ts`) wraps
 * the body with the brand header + page-number footer.
 *
 * All strings are sourced from `patients.billingPrint.*` + `sidebar.brand`
 * (last one already exists) and resolved via the typed `t()` function
 * passed in. Translate the keys once and the same call renders Arabic.
 */

import type { TFunction } from "i18next"

import type { BillPrintLabels } from "@/pages/Patients/print/printBill"

/**
 * Pull a fully-typed `BillPrintLabels` struct from i18next's `t`.
 * Pure — caller passes `t` directly.
 */
export function extractBillPrintLabels(t: TFunction): BillPrintLabels {
  const sep =
    (t("patients.billingPrint.scopeSeparator") as string | undefined) ?? ", "
  return {
    billDetailsHeader: t("patients.billingPrint.billDetailsHeader"),
    patient: t("patients.billingPrint.patient"),
    phone: t("patients.billingPrint.phone"),
    paymentType: t("patients.billingPrint.paymentType"),
    billId: t("patients.billingPrint.billId"),
    billDate: t("patients.billingPrint.billDate"),
    statusPaid: t("patients.billingPrint.statusPaid"),
    statusPending: t("patients.billingPrint.statusPending"),

    description: t("patients.billingPrint.description"),
    date: t("patients.billingPrint.date"),
    type: t("patients.billingPrint.type"),
    quantity: t("patients.billingPrint.quantity"),
    unitPrice: t("patients.billingPrint.unitPrice"),
    total: t("patients.billingPrint.total"),

    typeService: t("patients.billingPrint.typeService"),
    typeDrug: t("patients.billingPrint.typeDrug"),
    typeSupply: t("patients.billingPrint.typeSupply"),
    typeTest: t("patients.billingPrint.typeTest"),
    typeUnknown: t("patients.billingPrint.typeUnknown"),
    unknownItem: t("patients.billingPrint.unknownItem"),

    subtotal: t("patients.billingPrint.subtotal"),
    admin: t("patients.billingPrint.admin"),
    medicalTests: t("patients.billingPrint.medicalTests"),
    paid: t("patients.billingPrint.paidRow"),
    totalRow: t("patients.billingPrint.totalRow"),
    balance: t("patients.billingPrint.balance"),
    scopeSeparator: sep,

    discount: (scope: string) => {
      const trimmed = scope.trim()
      const label = t("patients.billingPrint.discount")
      return trimmed.length > 0 ? `${label} (${trimmed}):` : `${label}:`
    },
    vat: (pct: number, scope: string) => {
      const trimmed = scope.trim()
      const label = t("patients.billingPrint.vat")
      return trimmed.length > 0
        ? `${pct}% ${label} (${trimmed}):`
        : `${pct}% ${label}:`
    },
    paymentTypeValue: (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return ""
      return (
        trimmed
          .charAt(0)
          .toUpperCase() + trimmed.slice(1)
      )
    },
  }
}
