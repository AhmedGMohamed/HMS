/**
 * Admission-specific grouping with unit-price awareness.
 *
 * The T7 `<AdmissionDetailsDialog>` shows the past admission's
 * services / drugs / supplies rows. The legacy front-end rendered
 * every `BillDetail` row verbatim, which means a single service
 * added twice shows up as two duplicate rows even when both rows
 * carry the same unit price. This file introduces narrow grouping:
 *
 *   - Group by `(id, unitPrice)` — same item id with the same
 *     unit-price collapses; different unit prices stay as separate
 *     lines.
 *   - Sum `quantity` per group; recompute `totalCost` as
 *     `quantity × unitPrice` (authoritative; ignore server's
 *     per-row `totalCost`).
 *   - The first row's `serviceName` / `serviceType` / `generatedAt`
 *     carries forward. For past admissions this is acceptable —
 *     the admission is closed, and downstream rows of the same
 *     group share the bill detail timestamp anyway.
 *
 * All interfaces here read **camelCase only** — no snake_case.
 */

import type {
  ActivePatientService,
  DrugUsage,
  MedicalSupplyUsage,
  ServiceType,
} from "@/pages/Patients/types/patient"

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/* ----------------------------------------------------------------
 * Service groups
 * ---------------------------------------------------------------- */

export interface AdmissionServiceGroup {
  serviceId: number
  serviceName: string
  serviceType: ServiceType | string
  unitPrice: number
  quantity: number
  totalCost: number
  /** Source bill detail ids that contributed to this group. */
  billDetailIds: number[]
}

export function groupAdmissionServices(
  rows: ReadonlyArray<ActivePatientService>
): AdmissionServiceGroup[] {
  const out: AdmissionServiceGroup[] = []
  const byKey = new Map<string, AdmissionServiceGroup>()

  for (const row of rows) {
    const unitPrice = round2(Number(row.unitPrice ?? 0))
    const key = `service_${row.serviceId}_${unitPrice}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        serviceId: row.serviceId,
        serviceName: row.service?.name ?? "—",
        serviceType:
          row.service?.serviceType ??
          "once",
        unitPrice,
        quantity: 0,
        totalCost: 0,
        billDetailIds: [],
      }
      byKey.set(key, group)
      out.push(group)
    }
    group.quantity += Number(row.quantity ?? 0)
    group.billDetailIds.push(row.activeServiceId)
  }

  for (const group of out) {
    group.totalCost = round2(group.quantity * group.unitPrice)
  }
  return out
}

/* ----------------------------------------------------------------
 * Drug groups
 * ---------------------------------------------------------------- */

export interface AdmissionDrugGroup {
  drugId: number
  drugName: string
  unitPrice: number
  quantity: number
  totalCost: number
  /** Source bill detail ids that contributed to this group. */
  billDetailIds: number[]
}

export function groupAdmissionDrugs(
  rows: ReadonlyArray<DrugUsage>
): AdmissionDrugGroup[] {
  const out: AdmissionDrugGroup[] = []
  const byKey = new Map<string, AdmissionDrugGroup>()

  for (const row of rows) {
    const unitPrice = round2(Number(row.unitPrice ?? 0))
    const key = `drug_${row.drugId}_${unitPrice}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        drugId: row.drugId,
        drugName: row.drug?.name ?? "—",
        unitPrice,
        quantity: 0,
        totalCost: 0,
        billDetailIds: [],
      }
      byKey.set(key, group)
      out.push(group)
    }
    group.quantity += Number(row.initialQuantity ?? 0)
    group.billDetailIds.push(row.drugUsageId)
  }

  for (const group of out) {
    group.totalCost = round2(group.quantity * group.unitPrice)
  }
  return out
}

/* ----------------------------------------------------------------
 * Supply groups
 * ---------------------------------------------------------------- */

export interface AdmissionSupplyGroup {
  supplyId: number
  supplyName: string
  unitPrice: number
  quantity: number
  totalCost: number
  /** Source bill detail ids that contributed to this group. */
  billDetailIds: number[]
}

export function groupAdmissionSupplies(
  rows: ReadonlyArray<MedicalSupplyUsage>
): AdmissionSupplyGroup[] {
  const out: AdmissionSupplyGroup[] = []
  const byKey = new Map<string, AdmissionSupplyGroup>()

  for (const row of rows) {
    const unitPrice = round2(Number(row.unitPrice ?? 0))
    const key = `supply_${row.supplyId}_${unitPrice}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        supplyId: row.supplyId,
        supplyName: row.supply?.name ?? "—",
        unitPrice,
        quantity: 0,
        totalCost: 0,
        billDetailIds: [],
      }
      byKey.set(key, group)
      out.push(group)
    }
    group.quantity += Number(row.initialQuantity ?? 0)
    group.billDetailIds.push(row.supplyUsageId)
  }

  for (const group of out) {
    group.totalCost = round2(group.quantity * group.unitPrice)
  }
  return out
}