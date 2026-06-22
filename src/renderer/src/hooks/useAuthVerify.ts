import { useEffect } from "react"
import { useAuthStore } from "@/store/authStore"
import { consumeVerifyGate } from "@/lib/authVerifyGate"

/**
 * One-shot `GET /api/auth/verify` per app session.
 *
 * Behaviour:
 *   - First mount with persisted state: dispatch verify (handles token
 *     expiry between sessions). The persisted state is shown optimistically
 *     while the verify resolves; on failure the auth store is cleared and
 *     `PrivateRoute` redirects to /login.
 *   - Subsequent remounts (e.g. child component re-mounts): skipped — the
 *     cookie's lifetime is the source of truth, and another verify would
 *     only be useful after a logout/login cycle which resets the gate.
 *   - `authStore.logout()` calls `resetVerifyGate()` so the next login
 *     runs a fresh verify.
 */
export function useAuthVerify() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isVerifying = useAuthStore((s) => s.isVerifying)
  const verify = useAuthStore((s) => s.verify)

  useEffect(() => {
    if (!isAuthenticated) return
    if (!consumeVerifyGate()) return
    void verify()
  }, [isAuthenticated, verify])

  return { isVerifying }
}
