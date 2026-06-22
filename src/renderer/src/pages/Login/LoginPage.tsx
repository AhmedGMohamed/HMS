import { useTranslation } from "react-i18next"
import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"

/**
 * Phase 2 placeholder. Phase 6a implements:
 *   - Centered surface card on the existing `bg-background`
 *   - HMS logo + product name in the card header
 *   - react-hook-form + zod login form (username + password)
 *   - POST /api/auth/login → redirect to /dashboard
 *   - Inline error message; session-expired toast on re-visit
 *   - Language toggle in the top-right corner
 */
export default function LoginPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-md">
        <PageHeader title={t("login.title", { defaultValue: "Sign in" })} />
        <EmptyState
          title="Login form"
          description="Phase 6a will implement the auth form. The route is wired so redirects from PrivateRoute land here today."
        />
      </div>
    </div>
  )
}
