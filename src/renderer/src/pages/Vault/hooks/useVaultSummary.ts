/**
 * Summary hook — Phase 6.9 plan §3.4 (A2, A3, A13).
 *
 * Fetches `GET /api/vault/summary` for the active range on mount and
 * whenever the range identity changes (tracked via a stable string key,
 * not the object identity). Exposes `{ summary, loading, error, refresh }`
 * (Clocking hook shape — `useClockIns` nonce pattern). Errors surface as an
 * `error` state the page renders as a persistent toast + retry EmptyState.
 */
import { useEffect, useState } from "react"
import { getVaultSummary } from "@/pages/Vault/api"
import type { DateRange, VaultSummary } from "@/pages/Vault/types/vault"

/** Stable identity for a range (ISO of both bounds). */
function rangeKey(range: DateRange): string {
	return `${range.from.toISOString()}|${range.to.toISOString()}`
}

export interface UseVaultSummaryResult {
	summary: VaultSummary | null
	loading: boolean
	error: unknown
	refresh: () => void
}

export function useVaultSummary(range: DateRange): UseVaultSummaryResult {
	const [summary, setSummary] = useState<VaultSummary | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<unknown>(null)
	const [nonce, setNonce] = useState(0)
	const key = rangeKey(range)

	useEffect(() => {
		let cancelled = false
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setLoading(true)
		setError(null)
		getVaultSummary(range)
			.then((data) => {
				if (!cancelled) setSummary(data)
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
		// Range identity is tracked via `key`, not the object reference.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, nonce])

	return {
		summary,
		loading,
		error,
		refresh: () => setNonce((n) => n + 1),
	}
}
