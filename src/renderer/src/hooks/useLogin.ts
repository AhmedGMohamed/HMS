"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { api } from "@/lib/api"
import { ApiError } from "@/lib/errors"
import {
  getLockedUntilMs,
  recordFailure,
  resetLockout,
} from "@/lib/authLockout"
import { useAuthStore } from "@/store/authStore"

export const loginSchema = z.object({
  username: z.string().min(1, "required"),
  password: z.string().min(1, "required"),
})

export type LoginInputs = z.infer<typeof loginSchema>

export interface UseLoginOptions {
  /** Returning URL captured by `PrivateRoute` before redirect. */
  redirectTo?: string
}

export interface UseLoginResult {
  form: ReturnType<typeof useForm<LoginInputs>>
  submit: (values: LoginInputs) => Promise<void>
  loading: boolean
  /** Server error / 401 token. Null when the form is clean. */
  error: { kind: "invalid" | "server" | "network"; message: string } | null
  /** Epoch-ms deadline until which the submit button is disabled. */
  lockedUntilMs: number | null
  /** Live countdown (seconds). Drops to 0 when the deadline ends. */
  lockedSecondsRemaining: number
}

/**
 * Login form controller (Phase 6.1).
 *
 * Combines `react-hook-form` + `zod` validation with the axios-style
 * `api` client, while keeping the `authStore` as the single source of
 * truth for authentication.
 *
 * Behaviour:
 *   - 200 → populate authStore, reset lockout, navigate.
 *   - 401 → surface inline error, increment lockout counter.
 *   - 5xx / network → surface error without touching the counter.
 *   - Lockout countdown ticks once per second via internal interval.
 */
export function useLogin(options: UseLoginOptions = {}): UseLoginResult {
  const { redirectTo } = options
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const form = useForm<LoginInputs>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
    mode: "onSubmit",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<UseLoginResult["error"]>(null)
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())

  // Tick once per second while locked so the countdown label degrades
  // smoothly. Resets when the lockout window closes.
  useEffect(() => {
    if (lockedUntilMs === null) return
    const tick = (): void => {
      const deadline = getLockedUntilMs()
      setNow(Date.now())
      if (deadline === null) {
        setLockedUntilMs(null)
      } else if (deadline !== lockedUntilMs) {
        setLockedUntilMs(deadline)
      }
    }
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [lockedUntilMs])

  const { t } = useTranslation()

  const submit = useCallback(
    async (values: LoginInputs) => {
      if (lockedUntilMs !== null && lockedUntilMs > Date.now()) return
      setLoading(true)
      setError(null)
      try {
        const res = await api.post<{
          user: {
            user_id: number
            username: string
            role: string
            permissions: string[]
          }
          token?: string
        }>("/auth/login", values)

        resetLockout()
        setLockedUntilMs(null)
        login({ user: res.user, token: res.token })
        navigate(redirectTo ?? "/dashboard", { replace: true })
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.statusCode === 401) {
            setError({ kind: "invalid", message: t("login.invalidCredentials") })
            const state = recordFailure()
            if (state.locked) {
              setLockedUntilMs(Date.now() + state.retryAfterMs)
            }
          } else if (err.statusCode >= 500) {
            setError({
              kind: "server",
              message: t("login.serverErrorTitle") + " " + t("login.serverErrorText"),
            })
          } else {
            setError({
              kind: "server",
              message: err.message || t("login.serverErrorText"),
            })
          }
        } else {
          setError({
            kind: "network",
            message: t("errors.networkError"),
          })
        }
      } finally {
        setLoading(false)
      }
    },
    [lockedUntilMs, login, navigate, redirectTo, t]
  )

  return {
    form,
    submit,
    loading,
    error,
    lockedUntilMs,
    lockedSecondsRemaining:
      lockedUntilMs !== null
        ? Math.max(0, Math.ceil((lockedUntilMs - now) / 1000))
        : 0,
  }
}
