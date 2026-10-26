/**
 * PDF export for Vault report dialogs — Phase 6.9 plan A10 (port of the
 * legacy `createCustomReport` flow via the shared `lib/pdfShell`).
 *
 * English-only labels (legacy parity — PDFs are not localized); the
 * date-range header uses en-GB formatting. Body: a header block with the
 * report period + record count, then the full data table built from the
 * same `REPORT_COLUMNS` config as the on-screen dialog.
 */
import { formatReportCell } from "@/pages/Vault/report/formatReportCell"
import {
	REPORT_COLUMN_LABELS,
	REPORT_COLUMNS,
	REPORT_TITLE_LABELS,
} from "@/pages/Vault/report/reportConfig"
import type { DateRange, ReportRow, ReportType } from "@/pages/Vault/types/vault"
import { openPdfShellDoc } from "@/lib/pdfShell"
import type { TFunction } from "i18next"

/** `d MMM yyyy` en-GB range header (legacy parity). */
function formatEnGb(date: Date): string {
	return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export interface BuildVaultReportPdfInputs {
	reportType: ReportType
	range: DateRange
	rows: ReportRow[]
	t: TFunction
}

export async function buildVaultReportPdf(inputs: BuildVaultReportPdfInputs): Promise<void> {
	const { reportType, range, rows, t } = inputs

	const columns = REPORT_COLUMNS[reportType]
	const headerRow = columns.map((column) => ({
		text: REPORT_COLUMN_LABELS[column.id] ?? column.id,
		bold: true,
		fontSize: 8,
		color: "#ffffff",
		fillColor: "#0077B6",
	}))

	const bodyRows = rows.map((row) =>
		columns.map((column) => ({
			text: formatReportCell(row, column, t, "en"),
			fontSize: 8,
			color: "#0f172a",
		}))
	)

	const table = {
		table: {
			headerRows: 1,
			widths: columns.map(() => "*"),
			body: [headerRow, ...bodyRows],
		},
		layout: {
			fillColor: (rowIndex: number) => (rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc"),
			hLineColor: () => "#e2e8f0",
			vLineColor: () => "#e2e8f0",
			hLineWidth: () => 0.5,
			vLineWidth: () => 0.5,
		},
	}

	const periodLine = {
		text: `${formatEnGb(range.from)} — ${formatEnGb(range.to)}   ·   ${rows.length} ${t("vault.report.totalRecords")}`,
		fontSize: 9,
		color: "#475569",
		margin: [0, 0, 0, 10],
	}

	await openPdfShellDoc(
		{
			title: `${REPORT_TITLE_LABELS[reportType]} Report`,
			content: [periodLine, table],
		},
		{ t, language: "en" }
	)
}
