/**
 * Grouping helper dedicated to the printable PDF items table.
 *
 * Mirrors the (id × unitPrice) grouping rule used in T7.6's
 * `groupAdmissionServices/Drugs/Supplies`, but tighten with
 * same-day scope: rows collapse into a single line only when
 * they share:
 *   - kind        (service | drug | supply)
 *   - itemId      (the row's primary id at that kind)
 *   - unitPrice   (rounded to 2 decimals)
 *   - date        (yyyy-mm-dd derived from `generatedAt`)
 *
 * Two rows of the same service at the same unit price on the
 * same day → collapse (quantities sum, first row's description
 * is carried forward). Different day OR different price OR
 * different kind → keep separate.
 *
 * The PDF is the only consumer of this group helper; the UI tabs
 * (Assigned / Bills) use different rules.
 *
 * All inputs are camelCase — no snake_case.
 */

import type { BillDetail } from "@/pages/Patients/types/patient"

export interface PrintItemRow {
  /** id column (mixed kind per row). */
  itemId: number | null
  /** Stripped-down kind for downstream branching. */
  kind: "service" | "drug" | "supply" | "unknown"
  /** Display name chosen by `BillDetail` priority list. */
  description: string
  unitPrice: number
  quantity: number
  /** yyyy-mm-dd of `BillDetail.generatedAt`. */
  date: string
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function describe(d: BillDetail): string {
  if (d.serviceName) return d.serviceName
  if (d.drugName) return d.drugName
  if (d.medicalSupplyName) return d.medicalSupplyName
  return ""
}

function kindOf(d: BillDetail): PrintItemRow["kind"] {
  if (d.serviceId) return "service"
  if (d.drugShipmentId) return "drug"
  if (d.medicalSupplyShipmentId) return "supply"
  return "unknown"
}

function idOf(d: BillDetail): number | null {
  if (d.serviceId) return d.serviceId
  if (d.drugShipmentId) return d.drugShipmentId
  if (d.medicalSupplyShipmentId) return d.medicalSupplyShipmentId
  return null
}

/**
 * Extract a yyyy-mm-dd date from an ISO timestamp. Falls through
 * to "1970-01-01" for invalid input — better than producing
 * empty keys (which would collapse across unrelated rows).
 */
function deriveDate(generatedAt: string | null | undefined): string {
  if (!generatedAt) return "1970-01-01"
  const d = new Date(generatedAt)
  if (Number.isNaN(d.getTime())) return "1970-01-01"
  // en-CA → "yyyy-mm-dd"
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function pickGroupKey(row: PrintItemRow): string {
  return `${row.kind}_${row.itemId ?? 0}_${round2(row.unitPrice)}_${row.date}`
}

/**
 * Group the bill's details into printable lines. Same kind +
 * same id + same (rounded 2-dec) unit price + same day ⇒
 * collapse, sum quantity, keep first row's description.
 */
export function groupPrintBillItems(details: BillDetail[]): PrintItemRow[] {
  const out: PrintItemRow[] = []
  const byKey = new Map<string, PrintItemRow>()

  for (const d of details) {
    const kind = kindOf(d)
    if (kind === "unknown") continue
    const itemId = idOf(d)
    const unitPrice = round2(Number(d.unitPrice ?? 0))
    const quantity = Number(d.quantity ?? 0)
    const description = describe(d)
    const date = deriveDate(d.generatedAt ?? null)
    const candidate: PrintItemRow = {
      kind,
      itemId,
      description,
      unitPrice,
      quantity,
      date,
    }
    const key = pickGroupKey(candidate)
    let group = byKey.get(key)
    if (!group) {
      // Initialize quantity at 0; the unconditional `+= quantity`
      // below accumulates every input row exactly once. (Earlier
      // code reused `candidate` directly, double-counting the
      // first row of every group — see commit history.)
      group = { ...candidate, quantity: 0 }
      byKey.set(key, group)
      out.push(group)
    }
    group.quantity += quantity
  }

  for (const row of out) {
    row.quantity = round2(row.quantity)
  }

  return out
}

/**
 * Locale-aware formatter for the printable PDF date column.
 * Defaults to en-GB ("DD/MM/YYYY") per legacy receipts.
 */
export function formatPrintDate(
  date: string,
  language: "en" | "ar"
): string {
  if (!date || date === "1970-01-01") return "—"
  const d = new Date(date + "T00:00:00Z")
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d)
}

