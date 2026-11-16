import { useEffect, useState } from "react"

export type UseDebouncedValueOptions = {
  /** Defaults to 200ms — chosen so search inputs feel responsive without flooding the request pipeline. */
  delay?: number
  /** If `value` is null/undefined provide a stable initial. */
  initial?: unknown
}

/**
 * Returns a debounced copy of `value` that only updates after `delay` of
 * stability. Used by DataTable's search input to avoid re-firing server
 * filters on every keystroke (Phase 6 hooks: usePatients/useDrugs/etc).
 *
 * Generic over the value type so callers keep type narrowing (no `any`):
 *
 *   const debounced = useDebouncedValue(query)
 *   // debounced: string
 */
export function useDebouncedValue<T>(
  value: T,
  { delay = 200, initial }: UseDebouncedValueOptions = {}
): T {
  const [debounced, setDebounced] = useState<T>(
    (initial as T | undefined) ?? value
  )

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(handle)
  }, [value, delay])

  return debounced
}
