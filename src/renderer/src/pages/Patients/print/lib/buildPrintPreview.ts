/**
 * Shared "print preview" computation used by both the
 * `PrintBillConfirmDialog` ((Profile-tab and past-admissions view))
 * and the pdfmake `buildBillBodyContent`. Keeps the dialog and the
 * rendered PDF in lockstep so the user never sees a discrepancy
 * between what's previewed and what's printed.
 *
 * Responsibilities (pure, no DOM):
 *   1. Normalise the Bill's scope fields from server-canonical
 *      `string[]` JSONB → renderer's `DiscountScope` / `VatScope`
 *      booleans, so `recalcBilling` reads `.onServices` etc.
 *   2. Run `groupPrintBillItems` to collapse same
 *      `(kind × id × unitPrice × day)` rows; sort chronologically
 *      (oldest first), then by kind (services → drugs → supplies).
 *   3. Derive services/drugs/supplies subtotals from the raw
 *      `bill_details` (pre-grouping — grouping preserves totals
 *      but calculating from raw matches the server's authoritative
 *      `recalculateTotal` algorithm).
 *   4. Invoke `recalcBilling` to produce `BillingSnapshot`
 *      (discountAmount, vatAmount, totalFee, balance, etc.).
 *
 * Why centralise: the dialog previously rendered RAW `billDetails`
 * + `bill.totalAmount` from the server, while the PDF rendered
 * grouped rows + locally recomputed totals. That split made
 * debugging the "PDF shows different quantities than the dialog"
 * trap invisible. Now both call sites consume the same struct.
 *
 * CamelCase-only — no snake_case.
 */

import type {
  Bill,
  BillDetail,
  BillingSnapshot,
} from "@/pages/Patients/types/patient"
import { recalcBilling } from "@/pages/Patients/lib/billingMath"
import {
  groupPrintBillItems,
  type PrintItemRow,
} from "@/pages/Patients/print/lib/groupPrintBillItems"
import { normalizeBillForPrint } from "@/pages/Patients/print/lib/normalizeBillForPrint"

const KIND_RANK: Record<PrintItemRow["kind"], number> = {
  service: 0,
  drug: 1,
  supply: 2,
  unknown: 3,
}

export interface PrintPreview {
  /** Normalised Bill (booleans scopes). */
  bill: Bill
  /** Grouped + chronologically-sorted printable rows. */
  rows: PrintItemRow[]
  /** Recomputed snapshot — discount, vat, total, balance, etc. */
  snapshot: BillingSnapshot
  /** Discount scope as a string[] for label interpolation. */
  discountScopeArr: string[]
  /** VAT scope as a string[] for label interpolation. */
  vatScopeArr: string[]
}

function scopeToArray(scope: {
  onServices?: boolean
  onDrugs?: boolean
  onSupplies?: boolean
  onTests?: boolean
}): string[] {
  const out: string[] = []
  if (scope.onServices) out.push("services")
  if (scope.onDrugs) out.push("drugs")
  if (scope.onSupplies) out.push("supplies")
  if (scope.onTests) out.push("tests")
  return out
}

function deriveCategoryTotals(details: BillDetail[]): {
  servicesTotal: number
  drugsTotal: number
  suppliesTotal: number
} {
  let servicesTotal = 0
  let drugsTotal = 0
  let suppliesTotal = 0
  for (const d of details) {
    const qty = Number(d.quantity) || 0
    const price = Number(d.unitPrice) || 0
    const line = qty * price
    if (d.serviceId) servicesTotal += line
    else if (d.drugShipmentId) drugsTotal += line
    else if (d.medicalSupplyShipmentId) suppliesTotal += line
  }
  return { servicesTotal, drugsTotal, suppliesTotal }
}

/**
 * Pure: derive the print-preview struct from a `(Bill, BillDetail[])`
 * pair. Both the Profile-tab and the past-admissions tab use this
 * so the dialog and the PDF body agree on quantities, subtotals, and
 * summary rows.
 */
export function buildPrintPreview(
  bill: Bill,
  billDetails: BillDetail[]
): PrintPreview {
  const normalizedBill = normalizeBillForPrint(bill)

  // Group + sort rows.
  const rows = groupPrintBillItems(billDetails)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      const rankDiff = KIND_RANK[a.kind] - KIND_RANK[b.kind]
      if (rankDiff !== 0) return rankDiff
      return (a.itemId ?? 0) - (b.itemId ?? 0)
    })

  // Category subtotals from the raw details (pre-grouping).
  const { servicesTotal, drugsTotal, suppliesTotal } =
    deriveCategoryTotals(billDetails)

  const discountScope = normalizedBill.discountScope
  const vatScope =
    normalizedBill.vatScopeCustom ?? normalizedBill.vatScope

  const snapshot = recalcBilling({
    servicesTotal,
    drugsTotal,
    suppliesTotal,
    medicalTestsAmount: Number(normalizedBill.medicalTestsAmount ?? 0),
    paidAmount: Number(normalizedBill.paidAmount ?? 0),
    discount: Number(normalizedBill.discount ?? 0),
    discountType:
      normalizedBill.discountType === "percentage"
        ? "percentage"
        : "fixed",
    discountScope,
    vatPercentage: Number(normalizedBill.vatPercentage ?? 0),
    vatScope,
    administrativeExpenses: Number(
      normalizedBill.administrativeExpenses ?? 0
    ),
  })

  return {
    bill: normalizedBill,
    rows,
    snapshot,
    discountScopeArr: scopeToArray(discountScope),
    vatScopeArr: scopeToArray(vatScope),
  }
}
