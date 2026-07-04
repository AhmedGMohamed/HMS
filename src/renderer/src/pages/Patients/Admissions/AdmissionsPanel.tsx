"use client"

import { useState } from "react"
import { HistoryIcon } from "lucide-react"

import { Card, CardHeader, CardTitle } from "@/components/ui/card"

import { usePermission } from "@/hooks/usePermission"
import { usePastAdmissions } from "@/pages/Patients/Admissions/hooks/usePastAdmissions"
import type { PastAdmissionSummary } from "@/pages/Patients/Admissions/hooks/usePastAdmissions"
import { PastAdmissionsList } from "@/pages/Patients/Admissions/PastAdmissionsList"
import { AdmissionDetailsDialog } from "@/pages/Patients/Admissions/AdmissionDetailsDialog"
import { SettleBillDialog } from "@/pages/Patients/Admissions/SettleBillDialog"

import { useTranslation } from "react-i18next"

interface AdmissionsPanelProps {
  patientId: number
}

/**
 * Tab content for the Admissions tab (T7, swapped order — done
 * before print bill T8).
 *
 * Renders the past-admissions list with a details dialog on row
 * click and a settle-bill dialog triggered from the details CTA.
 */
export function AdmissionsPanel({ patientId }: AdmissionsPanelProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")

  const listRes = usePastAdmissions(patientId)
  const [selected, setSelected] = useState<PastAdmissionSummary | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [settleRow, setSettleRow] = useState<PastAdmissionSummary | null>(null)
  const [settleOpen, setSettleOpen] = useState(false)

  function onSelect(row: PastAdmissionSummary) {
    setSelected(row)
    setDetailsOpen(true)
  }

  function onSettle(row: PastAdmissionSummary) {
    setDetailsOpen(false)
    setSettleRow(row)
    setSettleOpen(true)
  }

  function onSettledRefresh() {
    listRes.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon aria-hidden className="size-4" />
          {t("patients.modals.pastAdmissions")}
          {listRes.admissions.length > 0 ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              ({listRes.admissions.length})
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>

      <div className="px-6 pb-6">
        <PastAdmissionsList
          admissions={listRes.admissions}
          loading={listRes.loading}
          onSelect={onSelect}
        />
      </div>

      {selected ? (
        <AdmissionDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          patientId={patientId}
          row={selected}
          onSettle={canManage ? onSettle : undefined}
        />
      ) : null}

      {settleRow ? (
        <SettleBillDialog
          open={settleOpen}
          onOpenChange={setSettleOpen}
          billId={settleRow.billId ?? 0}
          totalAmount={settleRow.totalAmount ?? 0}
          currentPaid={settleRow.paidAmount ?? 0}
          admissionId={settleRow.patientHistoryId ?? 0}
          onSettled={onSettledRefresh}
        />
      ) : null}
    </Card>
  )
}