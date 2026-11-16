/**
 * Client-side login lockout (Phase 6.1).
 *
 * The server has no rate-limit on `POST /api/auth/login` today. HMS
 * doesn't ship an IP-level lockout; we don't introduce one in this
 * phase (it's a routing/Express middleware change that crosses the
 * "backend untouched" promise). The lockout here is purely a UX
 * guard that prevents hammering the endpoint after repeated
 * failures — `5 failures in 60s` mirrors design.md §7.1.
 *
 * Persisted in module state only (resets on app reload). Multiple
 * `useLogin` consumers in the same session all see the same counter
 * via this module-level closure.
 */

const WINDOW_MS = 60_000
const MAX_FAILURES = 5

let failureTimestamps: number[] = []
let lockedUntilMs: number | null = null

/**
 * Mark a failed attempt. Returns whether the user has hit the
 * cap with the time until the cap is cleared.
 */
export function recordFailure(now = Date.now()): {
  locked: boolean
  retryAfterMs: number
} {
  failureTimestamps = failureTimestamps.filter((t) => now - t < WINDOW_MS)
  failureTimestamps.push(now)

  if (failureTimestamps.length >= MAX_FAILURES) {
    const oldest = failureTimestamps[0] ?? now
    const retry = Math.max(0, WINDOW_MS - (now - oldest))
    lockedUntilMs = now + retry
    return { locked: true, retryAfterMs: retry }
  }
  return { locked: false, retryAfterMs: 0 }
}

/** Clear the failure window. Called after a successful login. */
export function resetLockout(): void {
  failureTimestamps = []
  lockedUntilMs = null
}

/**
 * Returns an epoch-ms deadline by which the user may retry, or
 * `null` if not currently locked. Re-evaluates with `now` so the
 * caller can render a live countdown.
 */
export function getLockedUntilMs(now = Date.now()): number | null {
  if (lockedUntilMs === null) return null
  if (now >= lockedUntilMs) {
    // Old lockout expired — prune the count window so a future
    // round of failures starts from zero rather than the stale
    // history it inherited.
    failureTimestamps = failureTimestamps.filter(
      (t) => now - t < WINDOW_MS
    )
    if (failureTimestamps.length === 0) {
      lockedUntilMs = null
      return null
    }
    // Still buried under the cap → extend the deadline to the
    // freshness boundary implied by the remaining failures.
    if (failureTimestamps.length >= MAX_FAILURES) {
      const oldest = failureTimestamps[0] ?? now
      lockedUntilMs = oldest + WINDOW_MS
      return lockedUntilMs
    }
    lockedUntilMs = null
    return null
  }
  return lockedUntilMs
}

/** Diagnostic hint for tests. */
export function _getFailureCount(): number {
  return failureTimestamps.length
}
