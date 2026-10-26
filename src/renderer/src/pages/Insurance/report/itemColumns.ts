/**
 * Report item table columns — Phase 6.10.
 *
 * One column config feeds three surfaces so they can never drift:
 *   - the on-screen item tables in both report dialogs,
 *   - the CSV exports (`formatExportCell`),
 *   - the PDF builders (labels + `formatExportCell`).
 *
 * `labelKey` is the localized on-screen header; `labelEn` is the fixed
 * English header used by exports (PDFs/CSVs are not localized).
 */
import { formatEnGbDate, formatMoneyEn } from "@/pages/Insurance/report/format"
import type { ReportItem } from "@/pages/Insurance/types/insurance"

export interface ItemColumn {
  id: string
  labelKey: string
  labelEn: string
  align: "start" | "center" | "end"
  numeric?: boolean
  raw: (item: ReportItem) => string | number
}

/** Legacy `item_type` → name fallback chain (service → supply → drug). */
export function itemDisplayName(item: ReportItem): string {
  if (item.itemType === "service") return item.serviceName || "-"
  if (item.itemType === "supply") return item.medicalSupplyName || "-"
  return item.drugName || "-"
}

export const ITEM_COLUMNS: ItemColumn[] = [
  {
    id: "name",
    labelKey: "insurance.report.itemName",
    labelEn: "Item Name",
    align: "start",
    raw: itemDisplayName,
  },
  {
    id: "type",
    labelKey: "insurance.report.serviceType",
    labelEn: "Type",
    align: "start",
    raw: (item) => item.itemType,
  },
  {
    id: "date",
    labelKey: "insurance.report.date",
    labelEn: "Date",
    align: "start",
    raw: (item) => item.serviceDate,
  },
  {
    id: "quantity",
    labelKey: "insurance.report.quantity",
    labelEn: "Quantity",
    align: "center",
    numeric: true,
    raw: (item) => item.quantity,
  },
  {
    id: "unitPrice",
    labelKey: "insurance.report.unitPrice",
    labelEn: "Unit Price",
    align: "end",
    numeric: true,
    raw: (item) => item.unitPrice,
  },
  {
    id: "totalCost",
    labelKey: "insurance.report.totalPrice",
    labelEn: "Total Price",
    align: "end",
    numeric: true,
    raw: (item) => item.totalCost,
  },
]

/** English-only cell text for CSV / PDF output. */
export function formatExportCell(
  column: ItemColumn,
  item: ReportItem
): string {
  const value = column.raw(item)
  if (column.id === "date") return formatEnGbDate(String(value))
  if (column.id === "type") return String(value).toUpperCase()
  if (column.id === "unitPrice" || column.id === "totalCost") {
    return formatMoneyEn(Number(value))
  }
  if (value == null) return ""
  return String(value)
}
