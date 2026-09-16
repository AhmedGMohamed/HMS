"use client"

import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"

/**
 * Binds the active employees-page tab to the `?tab=` search param
 * (Phase 6.7 Decision #3) so tabs are deep-linkable and survive
 * refresh. Invalid or missing values fall back to `fallback`.
 */
export function useTabSync<T extends string>(
  validTabs: readonly T[],
  fallback: T
): [T, (tab: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get("tab")
  const tab: T =
    raw && (validTabs as readonly string[]).includes(raw) ? (raw as T) : fallback

  const setTab = useCallback(
    (next: T) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set("tab", next)
          return params
        }
      )
    },
    [setSearchParams]
  )

  return [tab, setTab]
}
