/**
 * CSV builder for Vault report exports — Phase 6.9 plan §3.5 (A11).
 *
 * RFC-4180 quoting (`"` doubled, `,`/newline enclosed), `\uFEFF` BOM prepended
 * for Excel, CRLF row endings. No CSV util exists elsewhere in the repo; this
 * lives under the Vault print folder and can be promoted to `lib/csv.ts` if
 * another page needs it. Labels stay English (PDF parity — plan A10/A11).
 */

/** Escapes a single CSV cell per RFC-4180 (quote + double internal quotes). */
function escapeCell(value: unknown): string {
	const str = value == null ? "" : String(value)
	if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
		return `"${str.replace(/"/g, '""')}"`
	}
	return str
}

/** Builds a BOM-prefixed CSV document from rows of records. */
export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
	const lines: string[] = [headers.map(escapeCell).join(",")]
	for (const row of rows) {
		lines.push(headers.map((header) => escapeCell(row[header])).join(","))
	}
	return `\uFEFF${lines.join("\r\n")}\r\n`
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
