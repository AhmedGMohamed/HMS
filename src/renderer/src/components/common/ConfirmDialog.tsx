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
  /** Trigger handler — may return a Promise. Loading state is auto-tracked. */
  onConfirm: () => void | Promise<void>
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
 * dialog stays open and shows a spinner. Internal failure does not
 * close the dialog; callers must explicitly call `onOpenChange(false)`
 * on the success path.
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
      await onConfirm()
    } catch (error) {
      // Phase 6 introduces a centralised toast helper; for now we log
      // so the dialog stays open and the parent can react. Errors that
      // escape here are a developer signal — a properly-implemented
      // onConfirm should not throw on the user-blocking path.
      console.error("[ConfirmDialog] onConfirm rejected:", error)
      setBusy(false)
      throw error
    }
  }

  const confirmClass =
    variant === "danger" ? "bg-destructive text-white hover:bg-destructive/90" : undefined

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
