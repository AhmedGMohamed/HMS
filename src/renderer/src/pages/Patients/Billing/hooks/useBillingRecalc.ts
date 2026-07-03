"use client"

import { useMemo } from "react"

import type { BillingSnapshot } from "@/pages/Patients/types/patient"
import type {
  DiscountScope,
} from "@/pages/Patients/types/patient"

import { recalcBilling } from "@/pages/Patients/Billing/lib/billingMath"

export interface BillingFormValues {
  servicesTotal: number
  drugsTotal: number
  suppliesTotal: number
  medicalTestsAmount: number
  paidAmount: number
  discount: number
  discountType: "percent" | "fixed"
  discountScope: DiscountScope
  vatPercentage: number
  vatScope: import("@/pages/Patients/types/patient").VatScope
  administrativeExpenses: number
}

/**
 * Derives a `BillingSnapshot` from form values + line-derived
 * subtotals. Pure — no API calls. Mirrors legacy's
 * `calculateBilling()` exactly so server and renderer agree on
 * what the displayed numbers say.
 */
export function useBillingRecalc(values: BillingFormValues): BillingSnapshot {
  const servicesTotal = Number(values.servicesTotal) || 0
  const drugsTotal = Number(values.drugsTotal) || 0
  const suppliesTotal = Number(values.suppliesTotal) || 0
  const medicalTestsAmount = Number(values.medicalTestsAmount) || 0
  const paidAmount = Number(values.paidAmount) || 0
  const discount = Number(values.discount) || 0
  const vatPercentage = Number(values.vatPercentage) || 0
  const administrativeExpenses = Number(values.administrativeExpenses) || 0

  // Decompose scope objects into primitive flags so memo identity is
  // primitive-strict. The lint rule would otherwise demand full-object
  // refs which causes spurious recomputes per render.
  return useMemo(() => {
    return recalcBilling({
      servicesTotal,
      drugsTotal,
      suppliesTotal,
      medicalTestsAmount,
      paidAmount,
      discount,
      discountType: values.discountType,
      discountScope: values.discountScope,
      vatPercentage,
      vatScope: values.vatScope,
      administrativeExpenses,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    servicesTotal,
    drugsTotal,
    suppliesTotal,
    medicalTestsAmount,
    paidAmount,
    discount,
    values.discountType,
    values.discountScope.onServices,
    values.discountScope.onDrugs,
    values.discountScope.onSupplies,
    values.discountScope.onTests,
    vatPercentage,
    values.vatScope.onServices,
    values.vatScope.onDrugs,
    values.vatScope.onSupplies,
    values.vatScope.onTests,
    administrativeExpenses,
  ])
}
