/**
 * Tiny mutable module-level flag that gates how often we revalidate the
 * persisted auth cookie against the server. Lives outside React state because
 * it is purely process-local — it never affects rendering.
 *
 * Consumed by:
 *   - useAuthVerify: skip after the first verify per session
 *   - authStore.logout(): reset so the next login runs a fresh verify
 */

let hasVerifiedSession = false

export function consumeVerifyGate(): boolean {
  if (hasVerifiedSession) return false
  hasVerifiedSession = true
  return true
}

export function resetVerifyGate(): void {
  hasVerifiedSession = false
}
