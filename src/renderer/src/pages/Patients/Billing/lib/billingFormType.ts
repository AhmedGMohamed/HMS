import type {
  DiscountScope,
  VatScope,
} from "@/pages/Patients/types/patient"

/**
 * Form shape used by the Billing RHF controller. Flat
 * configuration fields; the line-derived subtotals + the
 * server-side paid amount travel separately in
 * `<BillingFormValues>` (`lib/billingInputs.ts`).
 */
export interface BillingFormSchema {
  medicalTestsAmount: number
  discount: number
  discountType: "percent" | "fixed"
  discountScope: DiscountScope
  vatPercentage: number
  vatScope: VatScope
  administrativeExpenses: number
}