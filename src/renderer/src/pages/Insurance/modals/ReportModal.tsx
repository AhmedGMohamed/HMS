"use client"

import { useTranslation } from "react-i18next"

import { ReportOptionsModal } from "@/pages/Insurance/modals/ReportOptionsModal"
import type { ReportPayload } from "@/pages/Insurance/types/insurance"

export interface ReportModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  companyName: string
  submitting: boolean
  onSubmit: (payload: ReportPayload) => void | Promise<void>
}

/**
 * Company insurance-report options dialog (Phase 6.10 plan §3).
 *
 * Thin wrapper over the shared options form — the only difference from
 * the patient variant is the copy (no patient banner).
 */
export function ReportModal({
  open,
  onOpenChange,
  companyName,
  submitting,
  onSubmit,
}: ReportModalProps) {
  const { t } = useTranslation()

  return (
    <ReportOptionsModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("insurance.modals.generateReport")}
      description={companyName}
      note={t("insurance.messages.reportNote")}
      submitting={submitting}
      onSubmit={onSubmit}
    />
  )
}
