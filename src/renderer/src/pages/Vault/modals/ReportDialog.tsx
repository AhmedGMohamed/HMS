"use client"

/**
 * Report dialog — Phase 6.9 plan §3.5 (A8, A9, D4, D5).
 *
 * Shows one Vault report (on-demand fetch by `useVaultReport`): header with
 * the report title + date range + record count, a summary strip (ported
 * `calculateReportSummary` chips), and a client-side sortable + paginated
 * DataTable (legacy modal was unpaginated — improvement). Footer: Close +
 * Export PDF + Export CSV (English-only exports; disabled on empty data).
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { DownloadIcon, PrinterIcon } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/DataTable"
import { EmptyState } from "@/components/common/EmptyState"
import { ApiError } from "@/lib/errors"
import { formatCurrency, formatDate, formatNumber, resolveLocale } from "@/lib/utils"
import { formatReportCell } from "@/pages/Vault/report/formatReportCell"
import {
	REPORT_COLUMNS,
	reportTitleKey,
} from "@/pages/Vault/report/reportConfig"
import { calculateReportSummary } from "@/pages/Vault/report/calculateReportSummary"
import { buildVaultReportPdf } from "@/pages/Vault/print/buildVaultReportPdf"
import { exportReportCsv } from "@/pages/Vault/print/exportReportCsv"
import type { DateRange, ReportRow, ReportType } from "@/pages/Vault/types/vault"

export interface ReportDialogProps {
	open: boolean
	reportType: ReportType | null
	range: DateRange | null
	data: ReportRow[] | null
	loading: boolean
	language: string
	onClose: () => void
}

const REPORT_PAGE_SIZES = [10, 25, 50, 100]
const DEFAULT_REPORT_PAGE_SIZE = 25

/** Sorts raw values: dates by epoch, numbers numerically, strings locale-aware. */
function compareValues(a: unknown, b: unknown, kind: string): number {
	if (kind === "date") {
		const av = a ? new Date(String(a)).getTime() : 0
		const bv = b ? new Date(String(b)).getTime() : 0
		return av - bv
	}
	if (kind === "currency" || kind === "number") {
		return (Number(a) || 0) - (Number(b) || 0)
	}
	return String(a ?? "").localeCompare(String(b ?? ""))
}

export function ReportDialog({ open, reportType, range, data, loading, language, onClose }: ReportDialogProps) {
	const { t } = useTranslation()
	const locale = resolveLocale(language)
	const [sortState, setSortState] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null)
	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(DEFAULT_REPORT_PAGE_SIZE)
	const [exporting, setExporting] = useState(false)

	const memoColumns = useMemo(() => (reportType ? REPORT_COLUMNS[reportType] : []), [reportType]) // stable per report type
	const rows = useMemo(() => {
		if (!data) return []
		if (!sortState) return data
		const column = memoColumns.find((c) => c.id === sortState.columnId)
		const sorted = [...data].sort((a, b) => {
			const record = (row: ReportRow) => row as unknown as Record<string, unknown>
			const result = compareValues(record(a)[sortState.columnId], record(b)[sortState.columnId], column?.kind ?? "text")
			return sortState.direction === "asc" ? result : -result
		})
		return sorted
	}, [data, sortState, memoColumns])

	const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
	const currentPage = Math.min(page, pageCount)
	const pagedRows = useMemo(
		() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[rows, currentPage, pageSize]
	)

	const chips = useMemo(
		() => (reportType && data ? calculateReportSummary(reportType, data) : []),
		[reportType, data]
	)

	// Resets paging/sort state when a new report opens.
	useEffect(() => {
		if (open && reportType) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setPage(1)
			setSortState(null)
		}
	}, [open, reportType])

	if (!reportType || !range) return null

	const hasData = Boolean(data && data.length > 0)

	const handleExport = async (exporter: () => void | Promise<void>) => {
		setExporting(true)
		try {
			await exporter()
			toast.success(t("vault.messages.reportGeneratedSuccess"))
		} catch (error) {
			const message = error instanceof ApiError ? error.message : t("vault.messages.exportError")
			toast.error(message, { duration: Number.POSITIVE_INFINITY })
		} finally {
			setExporting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-7xl">
				<DialogHeader>
					<DialogTitle>{t(reportTitleKey(reportType))}</DialogTitle>
				</DialogHeader>

				<div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
					<span>
						{t("vault.report.dateRange")}: {formatDate(range.from, language)} – {formatDate(range.to, language)}
					</span>
					<span>
						{t("vault.report.totalRecords")}: {formatNumber(data?.length ?? 0, 0)}
					</span>
				</div>

				{chips.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{chips.map((chip) => (
							<div key={chip.titleKey} className="rounded-lg border bg-surface-muted/40 px-3 py-1.5 text-sm">
								<span className="text-muted-foreground">{t(chip.titleKey)}: </span>
								<span className="font-semibold tabular-nums">
									{chip.kind === "count" ? formatNumber(chip.value, 0) : formatCurrency(chip.value, locale)}
								</span>
							</div>
						))}
					</div>
				) : null}

				{!hasData && !loading ? (
					<EmptyState
						title={t("vault.report.noDataFound")}
						description={t("vault.report.noRecordsForDateRange")}
					/>
				) : (
					<DataTable<ReportRow>
						data={pagedRows}
						columns={memoColumns.map((column) => ({
							id: column.id,
							header: t(column.headerKey),
							cell: (row) => formatReportCell(row as unknown as Record<string, unknown>, column, t, language),							sortable: true,
							sortKey: (row) => String((row as unknown as Record<string, unknown>)[column.id] ?? ""),
							numeric: column.kind === "currency" || column.kind === "number",
							align: column.kind === "currency" || column.kind === "number" ? "end" : undefined,
						}))}
						loading={loading}
						emptyTitle={t("vault.report.noDataFound")}
						emptyDescription={t("vault.report.noRecordsForDateRange")}
						ariaLabel={t(reportTitleKey(reportType))}
						sort={sortState}
						onSortToggle={(_columnId, next) => setSortState(next)}
						pagination={{
							page: currentPage,
							pageSize,
							total: rows.length,
							onPageChange: setPage,
							onPageSizeChange: (next) => {
								setPageSize(next)
								setPage(1)
							},
							pageSizes: REPORT_PAGE_SIZES,
						}}
					/>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						{t("common.close")}
					</Button>
					<Button
						variant="outline"
						disabled={!hasData || exporting}
						onClick={() => void handleExport(() => exportReportCsv({ reportType: reportType, range, rows: data ?? [], t }))}
					>
						<DownloadIcon aria-hidden className="size-4" />
						{t("vault.buttons.exportCsv")}
					</Button>
					<Button
						disabled={!hasData || exporting}
						onClick={() => void handleExport(() => buildVaultReportPdf({ reportType: reportType, range, rows: data ?? [], t }))}
					>
						<PrinterIcon aria-hidden className="size-4" />
						{t("vault.buttons.exportPdf")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

