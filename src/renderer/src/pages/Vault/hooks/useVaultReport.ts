/**
 * Report hook — Phase 6.9 plan §3.4 (A5, A8).
 *
 * On-demand report fetching: the Report dialog calls `open(type, range)`
 * and this hook performs the fetch (the 17 report endpoints are never
 * preloaded — legacy parity). Data clears when the dialog closes.
 */
import { useCallback, useRef, useState } from "react"
import { getVaultReport } from "@/pages/Vault/api"
import type { DateRange, ReportRow, ReportType } from "@/pages/Vault/types/vault"

export interface UseVaultReportResult {
	type: ReportType | null
	range: DateRange | null
	data: ReportRow[]
	loading: boolean
	error: unknown
	open: (type: ReportType, range: DateRange) => void
	/** Re-runs the last requested report (error state retry). */
	retry: () => void
	close: () => void
}

export function useVaultReport(): UseVaultReportResult {
	const [type, setType] = useState<ReportType | null>(null)
	const [range, setRange] = useState<DateRange | null>(null)
	const [data, setData] = useState<ReportRow[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<unknown>(null)
	const lastRequestRef = useRef<{ type: ReportType; range: DateRange } | null>(null)
	const requestTokenRef = useRef(0)

	const runReport = useCallback(async (nextType: ReportType, nextRange: DateRange) => {
		const token = requestTokenRef.current + 1
		requestTokenRef.current = token
		setType(nextType)
		setRange(nextRange)
		setLoading(true)
		setError(null)
		// Clears the previous report immediately so its rows never render under
		// the next report's title while the new fetch is in flight.
		setData([])
		try {
			const rows = await getVaultReport(nextType, nextRange)
			if (requestTokenRef.current !== token) return
			setData(rows as ReportRow[])
		} catch (err) {
			if (requestTokenRef.current !== token) return
			setError(err)
			setData([])
		} finally {
			if (requestTokenRef.current === token) setLoading(false)
		}
	}, [])

	const open = useCallback(
		(nextType: ReportType, nextRange: DateRange) => {
			lastRequestRef.current = { type: nextType, range: nextRange }
			void runReport(nextType, nextRange)
		},
		[runReport]
	)

	const retry = useCallback(() => {
		const last = lastRequestRef.current
		if (last) void runReport(last.type, last.range)
	}, [runReport])

	const close = useCallback(() => {
		// Invalidates any in-flight request so it cannot repopulate a closed dialog.
		requestTokenRef.current += 1
		setType(null)
		setRange(null)
		setData([])
		setError(null)
		setLoading(false)
	}, [])

	return { type, range, data, loading, error, open, retry, close }
}
