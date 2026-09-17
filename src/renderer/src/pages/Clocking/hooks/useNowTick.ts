"use client"

import { useEffect, useState } from "react"

/**
 * Shared 1-second `Date` tick for live duration cells (§3.4 of
 * `phase_6.8_plan.md`).
 *
 * One interval for the whole page — `LiveDuration` cells consume the
 * returned `Date` instead of each owning a `setInterval` (the legacy
 * page leaked a timer per active row; fixed here). Cleared on
 * unmount.
 */
export function useNowTick(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
