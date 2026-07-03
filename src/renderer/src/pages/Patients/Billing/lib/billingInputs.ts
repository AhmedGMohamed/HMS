"use client"

import { useMemo } from "react"

import type { Bill, BillDetail } from "@/pages/Patients/types/patient"
import type {
  DiscountScope,
} from "@/pages/Patients/types/patient"
import type { VatScope } from "@/pages/Patients/types/patient"

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100

export interface BillingFormDefaults {
  medicalTestsAmount: number
  discount: number
  discountType: "percent" | "fixed"
  discountScope: DiscountScope
  vatPercentage: number
  vatScope: VatScope
  administrativeExpenses: number
  paidAmount: number
}

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
  vatScope: VatScope
  administrativeExpenses: number
}

export interface BillLineTotals {
  servicesTotal: number
  drugsTotal: number
  suppliesTotal: number
}

/**
 * Reduce the BillDetail rows (`Bill.billDetails[]`) into category
 * subtotals — services / drugs / supplies. Sum of `quantity *
 * unitPrice` over the legacy discriminator (FK NOT NULL on
 * `service_id` / `drug_shipment_id` / `medical_supply_shipment_id`).
 *
 * This is the renderer's mirror of `BillModel.recalculateTotal`
 * (`bill.routes.ts:1181-1203`): the server is authoritative for
 * persistence, but the renderer recomputes for the live UI between
 * refetches.
 */
export function lineTotalsFromBillDetails(
  details: BillDetail[] | null | undefined
): BillLineTotals {
  const init: BillLineTotals = {
    servicesTotal: 0,
    drugsTotal: 0,
    suppliesTotal: 0,
  }
  if (!details || details.length === 0) return init
  return details.reduce<BillLineTotals>((acc, d) => {
    const line = (d.quantity || 0) * (d.unitPrice || 0)
    if (d.serviceId != null) acc.servicesTotal += line
    else if (d.drugShipmentId != null) acc.drugsTotal += line
    else if (d.medicalSupplyShipmentId != null) acc.suppliesTotal += line
    return acc
  }, init)
}

const ALL_SCOPE: DiscountScope = {
  onServices: true,
  onDrugs: true,
  onSupplies: true,
  onTests: true,
}

export function billToFormDefaults(bill: Bill | null): BillingFormDefaults {
  if (!bill) {
    return {
      medicalTestsAmount: 0,
      discount: 0,
      discountType: "fixed",
      discountScope: ALL_SCOPE,
      vatPercentage: 0,
      vatScope: ALL_SCOPE,
      administrativeExpenses: 0,
      paidAmount: 0,
    }
  }
  return {
    medicalTestsAmount: bill.medicalTestsAmount ?? 0,
    discount: bill.discount ?? 0,
    discountType:
      bill.discountType === "percent" || bill.discountType === "fixed"
        ? bill.discountType
        : "fixed",
    discountScope: bill.discountScope ?? ALL_SCOPE,
    vatPercentage: bill.vatPercentage ?? 0,
    vatScope: bill.vatScopeCustom ?? bill.vatScope ?? ALL_SCOPE,
    administrativeExpenses: bill.administrativeExpenses ?? 0,
    paidAmount: bill.paidAmount ?? 0,
  }
}

/**
 * Merge server-side defaults + BillDetail-derived subtotals into the
 * BillingFormValues shape. Subtotals come exclusively from
 * `bill.billDetails`; the assigned-lines endpoints never carry
 * `unitPrice` on the renderer side (and we won't guess).
 */
export function mergeBillingFormValues(bill: Bill | null): BillingFormValues {
  const totals = lineTotalsFromBillDetails(bill?.billDetails)
  const defaults = billToFormDefaults(bill)
  return {
    servicesTotal: round2(totals.servicesTotal),
    drugsTotal: round2(totals.drugsTotal),
    suppliesTotal: round2(totals.suppliesTotal),
    medicalTestsAmount: defaults.medicalTestsAmount,
    paidAmount: defaults.paidAmount,
    discount: defaults.discount,
    discountType: defaults.discountType,
    discountScope: defaults.discountScope,
    vatPercentage: defaults.vatPercentage,
    vatScope: defaults.vatScope,
    administrativeExpenses: defaults.administrativeExpenses,
  }
}

/** Convenience to memoize against bill-id churn. */
export function useStableBillingValues(
  v: BillingFormValues
): BillingFormValues {
  return useMemo(() => v, [v])
}
