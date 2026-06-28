"use client"

import { useState } from "react"
import { useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { EyeIcon, EyeOffIcon, Loader2Icon, AlertTriangleIcon } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { HmsLogo } from "@/components/icons/HmsLogo"
import { LanguageToggle } from "@/components/layout/LanguageToggle"
import { useLogin } from "@/hooks/useLogin"

interface LocationState {
  from?: string
}

/**
 * /login (Phase 6.1).
 *
 * HMS brand surface card on the existing `bg-background`. The form is
 * rooted at `useLogin` — RHF + zod owns validation; this component
 * renders inputs and inline feedback only.
 *
 * Phase 6.1 deliberately omits "remember me" because the auth cookie
 * already persists 24h, and locale persistence is owned by
 * `uiStore`/`localStorage.lang` (not by this page).
 */
export default function LoginPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const state = location.state as LocationState | null
  const redirectTo = state?.from

  const { form, submit, loading, error, lockedUntilMs, lockedSecondsRemaining } =
    useLogin({ redirectTo })
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="absolute inset-x-0 top-6 flex items-center justify-end px-6">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg ring-1 ring-foreground/5">
        <div className="mb-6 flex items-center gap-3">
          <HmsLogo
            size={40}
            className="shrink-0 text-primary"
          />
          <div className="min-w-0 leading-tight">
            <p className="text-base font-semibold tracking-tight text-foreground">
              {t("login.brandTitle")}
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("login.brandSubtitle")}
            </p>
          </div>
        </div>

        <PageHeader
          title={t("login.title")}
          subtitle={t("login.subtitle")}
        />

        <form
          onSubmit={form.handleSubmit(submit)}
          noValidate
          className="flex flex-col gap-3"
          aria-disabled={loading || lockedUntilMs !== null}
        >
          <Field>
            <FieldLabel htmlFor="login-username">
              {t("login.username")}
              <span aria-hidden className="ms-0.5 text-danger">*</span>
            </FieldLabel>
            <Input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.username)}
              {...form.register("username")}
            />
            <FieldError
              errors={
                form.formState.errors.username
                  ? [{ message: t("auth.loginError") }]
                  : []
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="login-password">
              {t("login.password")}
              <span aria-hidden className="ms-0.5 text-danger">*</span>
            </FieldLabel>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
                className="pe-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={
                  showPassword ? t("login.hidePassword") : t("login.showPassword")
                }
                className="absolute inset-e-1 top-1/2 -translate-y-1/2"
              >
                {showPassword ? (
                  <EyeOffIcon aria-hidden />
                ) : (
                  <EyeIcon aria-hidden />
                )}
              </Button>
            </div>
            <FieldError
              errors={
                form.formState.errors.password
                  ? [{ message: t("auth.loginError") }]
                  : []
              }
            />
          </Field>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-light/40 px-3 py-2 text-sm text-danger"
            >
              <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="leading-snug">{error.message}</span>
            </div>
          ) : null}

          {lockedUntilMs !== null && lockedSecondsRemaining > 0 ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-light/40 px-3 py-2 text-sm text-warning-foreground"
            >
              <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="leading-snug">
                {t("login.lockedOutTitle")} —{" "}
                <span
                  className="tabular-nums font-semibold"
                  aria-live="polite"
                >
                  {lockedSecondsRemaining}s
                </span>
              </span>
            </div>
          ) : null}

          <Button
            type="submit"
            size="default"
            disabled={loading || lockedUntilMs !== null}
          >
            {loading ? (
              <>
                <Loader2Icon aria-hidden className="me-2 size-4 animate-spin" />
                {t("login.submitting")}
              </>
            ) : (
              t("login.submit")
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {t("login.hint")}
          </p>
        </form>
      </div>
    </div>
  )
}
