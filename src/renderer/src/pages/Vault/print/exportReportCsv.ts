/**
 * CSV export for Vault report dialogs — Phase 6.9 plan A11.
 *
 * First CSV util in the codebase (verified: no precedent util exists —
 * only a demo button). RFC-4180 quoting, `\r\n` row separator and a
 * UTF-8 BOM so Excel opens it correctly. English labels + English
 * cell formatting (PDF parity — exports are not localized).
 */
import { formatReportCell } from "@/pages/Vault/report/formatReportCell"
import {
	REPORT_COLUMN_LABELS,
	REPORT_COLUMNS,
} from "@/pages/Vault/report/reportConfig"
import type { DateRange, ReportRow, ReportType } from "@/pages/Vault/types/vault"
import type { TFunction } from "i18next"

function csvEscape(value: string): string {
	if (/[",\r\n]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`
	}
	return value
}

function toCsv(rows: string[][]): string {
	return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")
}

function formatIsoDate(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

export interface ExportReportCsvInputs {
	reportType: ReportType
	range: DateRange
	rows: ReportRow[]
	t: TFunction
}

/** Builds the CSV document string and triggers a browser download. */
export function exportReportCsv(inputs: ExportReportCsvInputs): void {
	const { reportType, range, rows, t } = inputs

	const columns = REPORT_COLUMNS[reportType]
	const table: string[][] = [
		columns.map((column) => REPORT_COLUMN_LABELS[column.id] ?? column.id),
		...rows.map((row) => columns.map((column) => formatReportCell(row, column, t, "en"))),
	]

	// UTF-8 BOM keeps Excel happy with non-ASCII values (e.g. Arabic names).
	const blob = new Blob([`\uFEFF${toCsv(table)}`], { type: "text/csv;charset=utf-8;" })
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = `vault-${reportType}-${formatIsoDate(range.from)}_${formatIsoDate(range.to)}.csv`
	document.body.appendChild(anchor)
	anchor.click()
	document.body.removeChild(anchor)
	URL.revokeObjectURL(url)
}
