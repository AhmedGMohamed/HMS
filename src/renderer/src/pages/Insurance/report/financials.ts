/**
 * Financial engine for insurance reports — Phase 6.10.
 *
 * Verbatim port of the legacy `InsuranceManager.calculateFinancials`
 * (`views/js/insurance/insurance.ts`), which itself mirrors
 * `Bill.model.ts`. It is the single source of truth for the totals shown
 * in both report dialogs, both PDF exports and the per-group footers, so
 * every surface agrees to the piaster.
 *
 * Semantics (per bill, then summed):
 *   - Gross      = services + drugs + supplies (+ medical tests)
 *   - Discount   = scoped (`discountScope`), `percentage` or absolute
 *   - VAT        = scoped (`vatScopeCustom`) on the *post-discount*
 *                  amount of the overlap between VAT and discount scopes,
 *                  plus administrative expenses
 *   - Net        = gross − discount + VAT + admin expenses
 *
 * An empty scope (or one containing `"all"`) means "every category",
 * matching the legacy `Object.keys(categoryTotals)` expansion.
 */
import type { BillFinancials, ReportItem } from "@/pages/Insurance/types/insurance"

const ITEM_TYPE_TO_CATEGORY: Record<string, string> = {
  service: "services",
  drug: "drugs",
  supply: "supplies",
  test: "tests",
}

interface BillMeta {
  billId: number
  discount: number
  discountType: string | null
  discountScope: string[]
  vatPercentage: number
  vatScopeCustom: string[]
  administrativeExpenses: number
  medicalTestsAmount: number
}

function isAllScope(scope: string[]): boolean {
  return scope.length === 0 || scope.includes("all")
}

export function calculateFinancials(items: ReportItem[]): BillFinancials {
  const bills = new Map<number, BillMeta>()
  const billItems = new Map<number, ReportItem[]>()

  for (const item of items) {
    if (!bills.has(item.billId)) {
      bills.set(item.billId, {
        billId: item.billId,
        discount: Number(item.discount) || 0,
        discountType: item.discountType,
        discountScope: item.discountScope ?? [],
        vatPercentage: Number(item.vatPercentage) || 0,
        vatScopeCustom: item.vatScopeCustom ?? [],
        administrativeExpenses: Number(item.administrativeExpenses) || 0,
        medicalTestsAmount: Number(item.medicalTestsAmount) || 0,
      })
      billItems.set(item.billId, [])
    }
    billItems.get(item.billId)!.push(item)
  }

  let totalGross = 0
  let totalDiscount = 0
  let totalVat = 0
  let totalAdmin = 0
  let totalMedicalTests = 0

  for (const [billId, bill] of bills) {
    const itemsOfBill = billItems.get(billId) ?? []

    /* Per-category subtotals — same shape the Bill model computes. */
    const categoryTotals: Record<string, number> = {
      services: 0,
      drugs: 0,
      supplies: 0,
      tests: bill.medicalTestsAmount,
    }

    for (const item of itemsOfBill) {
      const category = ITEM_TYPE_TO_CATEGORY[item.itemType] ?? item.itemType
      if (categoryTotals[category] !== undefined) {
        categoryTotals[category] += item.quantity * item.unitPrice
      }
    }

    const itemsGross =
      categoryTotals.services + categoryTotals.drugs + categoryTotals.supplies
    const totalSubtotal = itemsGross + bill.medicalTestsAmount

    /* ---- Discount (scoped) ---- */
    const discountScope = bill.discountScope
    let discountableAmount = 0
    for (const category of discountScope) {
      if (categoryTotals[category] !== undefined) {
        discountableAmount += categoryTotals[category]
      }
    }
    if (isAllScope(discountScope)) {
      discountableAmount = totalSubtotal
    }

    let discountAmount = 0
    if (discountableAmount > 0) {
      discountAmount =
        bill.discountType === "percentage"
          ? (discountableAmount * bill.discount) / 100
          : bill.discount
    }

    /* ---- VAT (scoped, applied to the post-discount overlap) ---- */
    const vatScope = bill.vatScopeCustom
    let vattableCategoriesTotal = 0
    for (const category of vatScope) {
      if (categoryTotals[category] !== undefined) {
        vattableCategoriesTotal += Number(categoryTotals[category])
      }
    }
    if (isAllScope(vatScope)) {
      vattableCategoriesTotal = totalSubtotal
    }

    let vattableAfterDiscount = vattableCategoriesTotal
    if (
      vattableCategoriesTotal > 0 &&
      discountableAmount > 0 &&
      discountAmount > 0
    ) {
      const effectiveVatScope = isAllScope(vatScope)
        ? Object.keys(categoryTotals)
        : vatScope
      const effectiveDiscountScope = isAllScope(discountScope)
        ? Object.keys(categoryTotals)
        : discountScope

      let vattableAndDiscountableTotal = 0
      for (const category of effectiveVatScope) {
        if (
          effectiveDiscountScope.includes(category) &&
          categoryTotals[category] !== undefined
        ) {
          vattableAndDiscountableTotal += Number(categoryTotals[category])
        }
      }

      if (vattableAndDiscountableTotal > 0) {
        /* Proportional share of the discount that lands on VAT-able items. */
        const vattableDiscount =
          (vattableAndDiscountableTotal / discountableAmount) * discountAmount
        vattableAfterDiscount = vattableCategoriesTotal - vattableDiscount
      }
    }

    const vatAmount =
      ((Number(vattableAfterDiscount) + Number(bill.administrativeExpenses)) *
        Number(bill.vatPercentage)) /
      100

    totalGross += Number(itemsGross)
    totalDiscount += Number(discountAmount)
    totalVat += Number(vatAmount)
    totalAdmin += Number(bill.administrativeExpenses)
    totalMedicalTests += Number(bill.medicalTestsAmount)
  }

  /* Net = (gross incl. tests − discount) + VAT + admin expenses */
  const grossWithTests = Number(totalGross) + Number(totalMedicalTests)
  const netTotal =
    grossWithTests - Number(totalDiscount) + Number(totalVat) + Number(totalAdmin)

  return {
    grossTotal: grossWithTests,
    discountAmount: totalDiscount,
    vatAmount: totalVat,
    adminExpenses: totalAdmin,
    medicalTestsTotal: totalMedicalTests,
    netTotal,
  }
}
