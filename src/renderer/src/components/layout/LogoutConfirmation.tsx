import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { resetVerifyGate } from "@/lib/authVerifyGate"
import { useAuthStore } from "@/store/authStore"

export interface LogoutConfirmationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Blocking confirmation dialog for sign-out.
 *
 * Per design.md §6.4 destructive actions use `<AlertDialog>` rather than
 * `<Dialog>` so that outside-click dismissal is **not** allowed — the
 * user must explicitly cancel or confirm.
 *
 * On confirm:
 *   1. reset the per-session auth-verify gate (see `lib/authVerifyGate.ts`)
 *   2. clear the auth store
 *   3. navigate to /login
 *   4. Sonner success toast using `auth.logoutSuccess*` keys
 */
export function LogoutConfirmation({ open, onOpenChange }: LogoutConfirmationProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  function handleConfirm() {
    resetVerifyGate()
    logout()
    onOpenChange(false)
    navigate("/login", { replace: true })
    toast.success(t("auth.logoutSuccess"), {
      description: t("auth.logoutSuccessText"),
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("auth.logoutConfirmation")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("auth.logoutConfirmText")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
