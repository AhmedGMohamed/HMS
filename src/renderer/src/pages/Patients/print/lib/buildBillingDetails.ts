/**
 * Synthesise a `Bill` + `BillDetail[]` from a hydrated past-admission
 * payload.
 *
 * The `/admissions/:historyId/details` endpoint emits flat rows
 * (services, drugs, supplies) but no canonical `bill_details`. We
 * shape the rows into `BillDetail` so the PDF shell renderer can
 * treat current and past admissions uniformly.
 *
 * CamelCase-only — never snake_case.
 */

import type { Bill, BillDetail } from "@/pages/Patients/types/patient"

import type { AdmissionDetailsEnriched } from "@/pages/Patients/Admissions/hooks/useAdmissionDetails"

import {
  groupAdmissionServices,
  groupAdmissionDrugs,
  groupAdmissionSupplies,
} from "@/pages/Patients/Admissions/lib/groupingAdmission"

interface SynthResult {
  bill: Bill
  billDetails: BillDetail[]
}

/**
 * Build a synthetic `Bill` + `billDetails[]` from a past admission
 * payload. The Bill carries the canonical header columns; the
 * billDetails feed the table.
 *
 * Round effects:
 *   - Discount / DiscountScope / VAT / VAT custom scope copy
 *     verbatim from the hydrated admission row.
 *   - `paidAmount`, `totalAmount`, `medical_tests_amount`,
 *     `administrative_expenses` all copied verbatim.
 *   - `bill.paidAt` and `bill.billDetails` remain empty (the past
 *     admission endpoint doesn't expose them) — they don't drive
 *     the PDF body.
 */
export function synthesiseBillFromAdmissionDetails(
  details: AdmissionDetailsEnriched
): SynthResult {
  const bill = details.bill ?? null
  const admission = details.admission ?? null
  const services = details.services ?? []
  const drugs = details.drugs ?? []
  const supplies = details.supplies ?? []

  const groupedServices = groupAdmissionServices(services)
  const groupedDrugs = groupAdmissionDrugs(drugs)
  const groupedSupplies = groupAdmissionSupplies(supplies)

  const billDetails: BillDetail[] = []

  for (const g of groupedServices) {
    const firstRow = g.billDetailIds[0] ?? 0
    const sourceRow =
      services.find((s) => s.billDetailId === firstRow) ?? null
    billDetails.push({
      billDetailId: firstRow,
      chargeType: "service",
      drugName: null,
      drugShipmentId: null,
      generatedAt: sourceRow?.generatedAt ?? "",
      medicalSupplyName: null,
      medicalSupplyShipmentId: null,
      quantity: g.quantity,
      saleType: "admitted",
      serviceId: g.serviceId,
      serviceName: g.serviceName,
      unitPrice: g.unitPrice,
    })
  }

  for (const g of groupedDrugs) {
    const firstRow = g.billDetailIds[0] ?? 0
    const sourceRow = drugs.find((d) => d.billDetailId === firstRow) ?? null
    billDetails.push({
      billDetailId: firstRow,
      chargeType: "drug",
      drugName: g.drugName,
      drugShipmentId: sourceRow?.drugShipmentId ?? null,
      generatedAt: sourceRow?.generatedAt ?? "",
      medicalSupplyName: null,
      medicalSupplyShipmentId: null,
      quantity: g.quantity,
      saleType: "admitted",
      serviceId: null,
      serviceName: null,
      unitPrice: g.unitPrice,
    })
  }

  for (const g of groupedSupplies) {
    const firstRow = g.billDetailIds[0] ?? 0
    const sourceRow =
      supplies.find((s) => s.billDetailId === firstRow) ?? null
    billDetails.push({
      billDetailId: firstRow,
      chargeType: "supply",
      drugName: null,
      drugShipmentId: null,
      generatedAt: sourceRow?.generatedAt ?? "",
      medicalSupplyName: g.medicalSupplyName,
      medicalSupplyShipmentId:
        sourceRow?.medicalSupplyShipmentId ?? null,
      quantity: g.quantity,
      saleType: "admitted",
      serviceId: null,
      serviceName: null,
      unitPrice: g.unitPrice,
    })
  }

  const fallbackScope = {
    onServices: false,
    onDrugs: false,
    onSupplies: false,
    onTests: false,
  }

  const generatedBill: Bill =
    bill != null
      ? {
          ...bill,
          billDetails,
        }
      : {
          billId: admission?.billId ?? 0,
          billDetails,
          patientHistoryId: admission?.patientHistoryId ?? 0,
          totalAmount: 0,
          paidAmount: 0,
          discountType: "fixed",
          discount: 0,
          discountScope: fallbackScope,
          administrativeExpenses: 0,
          medicalTestsAmount: 0,
          vatPercentage: 0,
          vatScope: fallbackScope,
          vatScopeCustom: fallbackScope,
          paidAt: null,
      }

  return { bill: generatedBill, billDetails }
}
