"use client"

import { useTranslation } from "react-i18next"

import { ReportOptionsModal } from "@/pages/Insurance/modals/ReportOptionsModal"
import type { ReportPayload } from "@/pages/Insurance/types/insurance"

export interface PatientReportModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patientName: string
  submitting: boolean
  onSubmit: (payload: ReportPayload) => void | Promise<void>
}

/**
 * Per-patient report options dialog (Phase 6.10 plan §3).
 *
 * Same four options as the company report, plus the patient banner the
 * legacy dialog showed so the operator can confirm the target before
 * running a potentially large query.
 */
export function PatientReportModal({
  open,
  onOpenChange,
  patientName,
  submitting,
  onSubmit,
}: PatientReportModalProps) {
  const { t } = useTranslation()

  return (
    <ReportOptionsModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("insurance.modals.generatePatientReport")}
      patientName={patientName}
      note={t("insurance.messages.patientReportNote")}
      submitting={submitting}
      onSubmit={onSubmit}
    />
  )
}
