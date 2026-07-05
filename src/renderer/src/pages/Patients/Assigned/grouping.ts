/**
 * Data normalisers for the Assigned tab.
 *
 * Each panel renders one card per unique `service_id` / `drug_id`
 * / `supply_id`, summing quantity / remaining fields. The legacy app
 * inlined this grouping in three separate `<updateAssigned_*Display>`
 * methods; we factor it out so the React components stay declarative.
 *
 * Group inputs come straight from the API endpoints that already
 * return camelCased payloads (through the `lib/api.ts` boundary).
 *
 * Wire shape (T6+):
 *  - `ActivePatientService`: `isActive`, `serviceId`, flat `name` /
 *    `serviceType` (no nested `service` object).
 *  - `DrugUsage`: `usageId`, `drugId`, flat `drugName` /
 *    `unitConversion.{larger, smaller, ratio}` (no nested `drug`).
 *  - `MedicalSupplyUsage`: `usageId`, `supplyId`, flat `supplyName` /
 *    `patientName` / `isActive`.
 */

import type {
  ActivePatientService,
  DrugUsage,
  MedicalSupplyUsage,
} from "@/pages/Patients/types/patient"

export interface AssignedServiceGroup {
  kind: "service"
  /** All rows that share this `service_id` (one per assignment). */
  rows: ActivePatientService[]
  /** Heuristic for "all stopped" vs "active" badge. */
  isFullyStopped: boolean
  isActive: boolean
  /** Sum of `quantity` across rows. Wire doesn't carry quantity on
   *  the assigned endpoint, so we default to 1 per row. The legacy
   *  `addServiceToPatient` defaults the new row to quantity=1. */
  quantity: number
}

export interface AssignedDrugGroup {
  kind: "drug"
  rows: DrugUsage[]
  totalInitial: number
  totalRemaining: number
  /** Smaller-unit string (e.g., "ml") when sample row carries it. */
  unit: string | null
  lastAdministered: string | null
}

export interface AssignedSupplyGroup {
  kind: "supply"
  rows: MedicalSupplyUsage[]
  totalInitial: number
  totalRemaining: number
}

export type AssignedGroup =
  | { kind: "service"; group: AssignedServiceGroup; name: string }
  | { kind: "drug"; group: AssignedDrugGroup; name: string }
  | { kind: "supply"; group: AssignedSupplyGroup; name: string }

export function groupAssignedServices(
  rows: ActivePatientService[]
): Map<number, AssignedServiceGroup> {
  const out = new Map<number, AssignedServiceGroup>()
  for (const row of rows) {
    const existing = out.get(row.serviceId)
    if (!existing) {
      out.set(row.serviceId, {
        kind: "service",
        rows: [row],
        isFullyStopped: !row.isActive,
        isActive: row.isActive,
        quantity: 1,
      })
      continue
    }
    existing.rows.push(row)
    existing.quantity += 1
    if (row.isActive) existing.isActive = true
    if (existing.isFullyStopped && row.isActive) existing.isFullyStopped = false
  }
  return out
}

export function groupAssignedDrugs(
  rows: DrugUsage[]
): Map<number, AssignedDrugGroup> {
  const out = new Map<number, AssignedDrugGroup>()
  for (const row of rows) {
    const existing = out.get(row.drugId)
    const unit = row.unitConversion?.smaller ?? null
    const lastAdministeredTime =
      row.lastAdministered != null
        ? new Date(row.lastAdministered).getTime()
        : null
    if (!existing) {
      out.set(row.drugId, {
        kind: "drug",
        rows: [row],
        totalInitial: row.initialQuantity,
        totalRemaining: row.remainingQuantity,
        unit,
        lastAdministered: row.lastAdministered,
      })
      continue
    }
    existing.rows.push(row)
    existing.totalInitial += row.initialQuantity
    existing.totalRemaining += row.remainingQuantity
    if (!existing.unit && unit) existing.unit = unit
    const existingTs = existing.lastAdministered
      ? new Date(existing.lastAdministered).getTime()
      : null
    if (
      lastAdministeredTime !== null &&
      (existingTs === null || lastAdministeredTime > existingTs)
    ) {
      existing.lastAdministered = row.lastAdministered
    }
  }
  return out
}

export function groupAssignedSupplies(
  rows: MedicalSupplyUsage[]
): Map<number, AssignedSupplyGroup> {
  const out = new Map<number, AssignedSupplyGroup>()
  for (const row of rows) {
    const existing = out.get(row.supplyId)
    if (!existing) {
      out.set(row.supplyId, {
        kind: "supply",
        rows: [row],
        totalInitial: row.initialQuantity,
        totalRemaining: row.remainingQuantity,
      })
      continue
    }
    existing.rows.push(row)
    existing.totalInitial += row.initialQuantity
    existing.totalRemaining += row.remainingQuantity
  }
  return out
}
