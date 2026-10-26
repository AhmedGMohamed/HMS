/**
 * Patient grouping for the company insurance report — Phase 6.10.
 *
 * Verbatim port of the legacy `groupItemsByPatient`. Two quirks are
 * intentional (legacy parity — see plan §1 Decision #7):
 *
 *   1. `medicalTestsAmount` is summed **once per unique bill** per
 *      patient, because the report query denormalizes the bill-level
 *      tests total onto every item of that bill.
 *   2. `patientPaid` / `patientTotal` take the **maximum** across the
 *      group instead of the sum. A patient with several bills therefore
 *      shows the largest bill's paid/total — replicating the legacy
 *      report rather than "fixing" it mid-migration.
 *
 * Items inside a group are sorted by `serviceDate` ascending.
 */
import type {
  PatientItemGroup,
  ReportItem,
} from "@/pages/Insurance/types/insurance"

export function groupItemsByPatient(
  items: ReportItem[]
): Record<string, PatientItemGroup> {
  const groups: Record<string, PatientItemGroup> = {}
  const processedBills: Record<string, Set<number>> = {}

  for (const item of items) {
    const patientName = item.patientName

    if (!groups[patientName]) {
      groups[patientName] = {
        items: [],
        totalCost: 0,
        patientPaid: item.patientPaidAmount || 0,
        patientTotal: item.patientTotalAmount || 0,
        medicalTestsAmount: 0,
      }
      processedBills[patientName] = new Set<number>()
    }

    const group = groups[patientName]
    group.items.push(item)
    group.totalCost += Number(item.totalCost) || 0

    if (!processedBills[patientName].has(item.billId)) {
      group.medicalTestsAmount += Number(item.medicalTestsAmount) || 0
      processedBills[patientName].add(item.billId)
    }

    if ((item.patientPaidAmount || 0) > group.patientPaid) {
      group.patientPaid = item.patientPaidAmount || 0
    }
    if ((item.patientTotalAmount || 0) > group.patientTotal) {
      group.patientTotal = item.patientTotalAmount || 0
    }
  }

  for (const patientName of Object.keys(groups)) {
    const group = groups[patientName]
    /* Tests are part of what the patient owes for the period. */
    group.totalCost += group.medicalTestsAmount
    group.items.sort(
      (a, b) =>
        new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime()
    )
  }

  return groups
}
