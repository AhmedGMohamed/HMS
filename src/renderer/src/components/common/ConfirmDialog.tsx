"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangleIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"

export type ConfirmDialogVariant = "danger" | "warning"

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** Defaults to `common.deleteConfirm` ("Yes, Delete It"). */
  confirmLabel?: string
  /** Defaults to `common.cancel`. */
  cancelLabel?: string
  /** `danger` (destructive red) is the default for destructive actions;
   *  `warning` (default variant) covers reversible confirmations. */
  variant?: ConfirmDialogVariant
  /**
   * Runs the confirmed action.
   *
   * - Resolves (or returns `void`/`true`) → the dialog closes itself.
   * - Returns `false` → the dialog stays open, no error is logged. Use
   *   this for expected validation failures the caller already surfaced.
   * - Throws → reserved for unexpected defects: logged once here and
   *   swallowed (no unhandled rejection); the dialog stays open.
   */
  onConfirm: () => void | boolean | Promise<void | boolean>
  /** Force the spinner even when the onConfirm returned synchronously. */
  loading?: boolean
  /** Render the `AlertTriangleIcon` in the dialog media slot. */
  destructiveIcon?: boolean
}

/**
 * Modal confirmation wrapper around shadcn `<AlertDialog>`.
 *
 * Per design.md §6.4 we always use `<AlertDialog>` (never `<Dialog>`)
 * — these are blocking decisions requiring explicit confirmation.
 *
 * Variants:
 * - `danger` (default) → `<Button variant="destructive">` for the confirm
 *   action. Reserved for irreversible operations.
 * - `warning` → `<Button variant="default">` so destructive red is not
 *   used for reversible actions.
 *
 * `onConfirm` may be async; while the returned promise is in flight the
 * dialog stays open and shows a spinner. On success the dialog closes
 * itself (calls `onOpenChange(false)`); on a thrown error it stays open and
 * the error is logged once here (no rethrow). Returning `false` is the
 * "keep open, no error" escape hatch for expected validation failures —
 * callers must not throw for those.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  onConfirm,
  loading: externalLoading = false,
  destructiveIcon = true,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const loading = busy || externalLoading

  /* Reset busy on close regardless of HOW the dialog closed —
     user-initiated (handleOpenChange) or prop-driven
     (e.g. the parent clearing its target after a successful
     mutation). Without this, a prop-driven close leaves busy
     stuck at true, disabling all buttons the next time the
     dialog opens. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) setBusy(false)
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Reset busy state synchronously on close so the next time the
      // dialog opens it starts clean. Done at the transition boundary,
      // not inside an effect, to avoid cascading renders.
      setBusy(false)
    }
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    setBusy(true)
    try {
      const result = await onConfirm()
      if (result === false) {
        // Expected, already-surfaced failure: stay open, no error.
        setBusy(false)
        return
      }
      handleOpenChange(false)
    } catch (error) {
      // Unexpected defect. Log once and swallow: rethrowing would surface as
      // an unhandled rejection now that this handler is fire-and-forget.
      // Callers keep their own toasts; the dialog stays open so the user can
      // retry or cancel.
      console.error("[ConfirmDialog] onConfirm rejected:", error)
      setBusy(false)
    }
  }

  const confirmClass =
    variant === "danger" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          {destructiveIcon ? (
            <AlertDialogMedia>
              <AlertTriangleIcon aria-hidden className="size-8 text-destructive" />
            </AlertDialogMedia>
          ) : null}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {cancelLabel ?? t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e: React.MouseEvent<HTMLElement>) => {
              e.preventDefault()
              void handleConfirm()
            }}
            disabled={loading}
            className={confirmClass}
          >
            {loading ? (
              <>
                <Spinner aria-hidden className="me-1.5" />
                {confirmLabel ?? t("common.deleteConfirm")}
              </>
            ) : (
              confirmLabel ?? t("common.deleteConfirm")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
