/**
 * Patient grouping for the company insurance report — Phase 6.10.
 *
 * Groups are keyed by `patientId`, falling back to a composite of
 * name + insurance card/form ids **only** when the id is genuinely
 * absent. Keying by `patientName` (the legacy port) merged two patients
 * who happen to share a name and attributed one patient's money to the
 * other.
 *
 * Per-bill columns (`medicalTestsAmount`, `patientPaidAmount`,
 * `patientTotalAmount`) are denormalized onto every item of a bill by the
 * report query, so each is accumulated **once per unique bill** and then
 * **summed across the patient's bills**. The legacy port took the
 * maximum, which understated every patient with more than one bill.
 *
 * `patientName` keeps the display label for headings (the group key is an
 * id and must not leak into the UI). Items inside a group are sorted by
 * `serviceDate` ascending.
 */
import type {
  PatientItemGroup,
  ReportItem,
} from "@/pages/Insurance/types/insurance"

/** Stable group key: the patient id whenever the row carries one. */
function patientKey(item: ReportItem): string {
  if (item.patientId != null) return `id:${item.patientId}`
  return `name:${item.patientName}|${item.insuranceCardId ?? ""}|${item.insuranceFormId ?? ""}`
}

export function groupItemsByPatient(
  items: ReportItem[]
): Record<string, PatientItemGroup> {
  const groups: Record<string, PatientItemGroup> = {}
  const processedBills: Record<string, Set<number>> = {}

  for (const item of items) {
    const key = patientKey(item)

    if (!groups[key]) {
      groups[key] = {
        patientName: item.patientName,
        items: [],
        totalCost: 0,
        patientPaid: 0,
        patientTotal: 0,
        medicalTestsAmount: 0,
      }
      processedBills[key] = new Set<number>()
    }

    const group = groups[key]
    group.items.push(item)
    group.totalCost += Number(item.totalCost) || 0

    if (!processedBills[key].has(item.billId)) {
      group.medicalTestsAmount += Number(item.medicalTestsAmount) || 0
      group.patientPaid += Number(item.patientPaidAmount) || 0
      group.patientTotal += Number(item.patientTotalAmount) || 0
      processedBills[key].add(item.billId)
    }
  }

  for (const key of Object.keys(groups)) {
    const group = groups[key]
    /* Tests are part of what the patient owes for the period. */
    group.totalCost += group.medicalTestsAmount
    group.items.sort(
      (a, b) =>
        new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime()
    )
  }

  return groups
}
