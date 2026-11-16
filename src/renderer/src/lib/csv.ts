/**
 * Shared CSV export helpers — Phase 6.11 (promoted from Vault 6.9 /
 * Insurance 6.10).
 *
 * Exports are English-only and RFC-4180 quoted, with a UTF-8 BOM and CRLF row
 * endings so Excel opens Arabic patient names and multi-line text correctly.
 * Three surfaces use this module:
 *
 *   - `toCsv(headers, rows)` — the common "one record per row" shape,
 *   - `toSectionedCsv(sections)` — the statistics export, where each dataset
 *     needs its own header row inside one file,
 *   - `downloadCsv(filename, content)` — the browser download trigger.
 *
 * Every previous page-local copy produced the same bytes; this is now the one
 * implementation.
 */

/** Escapes a single CSV cell per RFC-4180 (quote + double internal quotes). */
export function escapeCsvCell(value: unknown): string {
  const str = value == null ? "" : String(value)
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Joins a matrix of already-stringified cells into CRLF rows (no header logic). */
export function toCsvMatrix(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")
}

/**
 * Builds a BOM-prefixed CSV document from records.
 *
 * `headers` doubles as the column order and the record key list, so callers
 * cannot drift between the header row and the body.
 */
export function toCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>
): string {
  const lines: string[] = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","))
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export interface CsvSection {
  /** Optional section title rendered as a single-cell row above the header. */
  title?: string
  /** Column headers for this section. */
  headers: string[]
  /** Rows aligned to `headers`. */
  rows: unknown[][]
}

/**
 * Builds a BOM-prefixed CSV with several datasets separated by a blank line.
 *
 * Used by the statistics export, which is a set of series (KPIs, census,
 * revenue, top services, …) rather than one flat table. A blank line between
 * sections keeps the file readable in Excel while remaining valid CSV.
 */
export function toSectionedCsv(sections: CsvSection[]): string {
  const blocks: string[] = []

  for (const section of sections) {
    const rows: unknown[][] = []
    if (section.title) rows.push([section.title])
    rows.push(section.headers)
    rows.push(...section.rows)
    blocks.push(toCsvMatrix(rows))
  }

  return `\uFEFF${blocks.join("\r\n\r\n")}\r\n`
}

/** Triggers a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/** `2026-10-27` — filename-safe local calendar date (no TZ shifting). */
export function toFileNameDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
