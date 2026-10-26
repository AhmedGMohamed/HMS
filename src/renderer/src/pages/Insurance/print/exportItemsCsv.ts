/**
 * CSV export for insurance report dialogs — Phase 6.10 plan §4 Step 11.
 *
 * Exports the flat item list (the same rows the on-screen tables show)
 * using the shared `ITEM_COLUMNS` config, so columns and ordering can
 * never drift from the UI. English labels + `en-GB` dates and grouped
 * two-decimal money — exports are not localized (PDF parity).
 *
 * RFC-4180 quoting, CRLF row endings and a UTF-8 BOM so Excel opens the
 * file correctly (same approach as the Vault exporter).
 */
import {
  ITEM_COLUMNS,
  formatExportCell,
} from "@/pages/Insurance/report/itemColumns"
import type { ReportItem } from "@/pages/Insurance/types/insurance"

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export interface ExportItemsCsvInputs {
  fileName: string
  items: ReportItem[]
  /** Optional preamble rows (summary lines) rendered above the header. */
  preamble?: string[][]
}

/** Builds the CSV and triggers a browser download. */
export function exportItemsCsv({
  fileName,
  items,
  preamble = [],
}: ExportItemsCsvInputs): void {
  const header = ITEM_COLUMNS.map((column) => column.labelEn)
  const body = items.map((item) =>
    ITEM_COLUMNS.map((column) => formatExportCell(column, item))
  )

  const csv = [...preamble, header, ...body]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n")

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/** `2026-10-26` — stable, sortable suffix for export filenames. */
export function isoDateSuffix(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
