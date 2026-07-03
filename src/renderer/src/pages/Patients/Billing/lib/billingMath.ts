import type { BillingSnapshot } from "@/pages/Patients/types/patient"
import type {
  DiscountScope,
  VatScope,
} from "@/pages/Patients/types/patient"

export interface RecalcInputs {
  servicesTotal: number
  drugsTotal: number
  suppliesTotal: number
  medicalTestsAmount: number
  paidAmount: number
  discount: number
  discountType: "percent" | "fixed"
  discountScope: DiscountScope
  vatPercentage: number
  vatScope: VatScope
  administrativeExpenses: number
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Pure recalculation that mirrors legacy `calculateBilling()`
 * (`patients.ts:1896-1987`) 1:1 but exposes a single entry point.
 *
 * Steps:
 *  1. Subtotals by category
 *  2. Discount computed only on selected discount-scope categories
 *  3. VAT computed on selected vat-scope categories, with proportional
 *     discount allocation when the vattable subset overlaps with the
 *     discountable subset (legacy algorithm)
 *  4. Total fee = subtotal-after-discount + vat + admin
 *  5. Balance = totalFee - paidAmount; sign flips legacy UI's
 *     facility/patient labels (positive = remaining for facility,
 *     negative = overpayment displayed as remaining-for-patient).
 */
export function recalcBilling(input: RecalcInputs): BillingSnapshot {
  const services = round2(Number(input.servicesTotal) || 0)
  const drugs = round2(Number(input.drugsTotal) || 0)
  const supplies = round2(Number(input.suppliesTotal) || 0)
  const tests = round2(Number(input.medicalTestsAmount) || 0)
  const paid = round2(Number(input.paidAmount) || 0)
  const discountValue = Number(input.discount) || 0
  const vatPct = Number(input.vatPercentage) || 0
  const admin = round2(Number(input.administrativeExpenses) || 0)

  const subtotal = services + drugs + supplies + tests

  let discountableAmount = 0
  if (input.discountScope.onServices) discountableAmount += services
  if (input.discountScope.onDrugs) discountableAmount += drugs
  if (input.discountScope.onSupplies) discountableAmount += supplies
  if (input.discountScope.onTests) discountableAmount += tests

  let discountAmount = 0
  if (discountableAmount > 0 && discountValue > 0) {
    if (input.discountType === "percent") {
      discountAmount = (discountableAmount * discountValue) / 100
    } else {
      discountAmount = discountValue
    }
  }
  discountAmount = round2(discountAmount)

  const totalAfterDiscount = round2(subtotal - discountAmount)

  let vattableCategoriesTotal = 0
  if (input.vatScope.onServices) vattableCategoriesTotal += services
  if (input.vatScope.onDrugs) vattableCategoriesTotal += drugs
  if (input.vatScope.onSupplies) vattableCategoriesTotal += supplies
  if (input.vatScope.onTests) vattableCategoriesTotal += tests

  let vattableAfterDiscount = vattableCategoriesTotal
  if (vattableCategoriesTotal > 0 && discountableAmount > 0 && discountAmount > 0) {
    let vattableAndDiscountableTotal = 0
    if (input.vatScope.onServices && input.discountScope.onServices)
      vattableAndDiscountableTotal += services
    if (input.vatScope.onDrugs && input.discountScope.onDrugs)
      vattableAndDiscountableTotal += drugs
    if (input.vatScope.onSupplies && input.discountScope.onSupplies)
      vattableAndDiscountableTotal += supplies
    if (input.vatScope.onTests && input.discountScope.onTests)
      vattableAndDiscountableTotal += tests
    const vattableDiscount =
      (vattableAndDiscountableTotal / discountableAmount) * discountAmount
    vattableAfterDiscount = vattableCategoriesTotal - vattableDiscount
  }

  const vatAmount = round2(
    ((vattableAfterDiscount + admin) * vatPct) / 100
  )

  const totalFee = round2(totalAfterDiscount + vatAmount + admin)
  const balance = round2(totalFee - paid)
  const remainingFacility = balance > 0 ? balance : 0
  const remainingPatient = balance < 0 ? Math.abs(balance) : 0

  return {
    servicesTotal: services,
    drugsTotal: drugs,
    suppliesTotal: supplies,
    medicalTestsAmount: tests,
    discountAmount,
    vatAmount,
    administrativeExpenses: admin,
    totalAfterDiscount,
    totalFee,
    paidAmount: paid,
    balance,
    remainingFacility,
    remainingPatient,
  }
}
