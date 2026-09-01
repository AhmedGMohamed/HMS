"use client"

import { useEffect, useState } from "react"
import { HistoryIcon } from "lucide-react"

import { Card, CardHeader, CardTitle } from "@/components/ui/card"

import { usePermission } from "@/hooks/usePermission"
import { usePastAdmissions } from "@/pages/Patients/Admissions/hooks/usePastAdmissions"
import type { PastAdmissionSummary } from "@/pages/Patients/Admissions/hooks/usePastAdmissions"
import { useAdmissionDetails } from "@/pages/Patients/Admissions/hooks/useAdmissionDetails"
import { PastAdmissionsList } from "@/pages/Patients/Admissions/PastAdmissionsList"
import { AdmissionDetailsDialog } from "@/pages/Patients/Admissions/AdmissionDetailsDialog"
import { SettleBillDialog } from "@/pages/Patients/Admissions/SettleBillDialog"

import { useTranslation } from "react-i18next"
import { usePrintBill } from "@/pages/Patients/print/hooks/usePrintBill"
import { PrintBillConfirmDialog } from "@/pages/Patients/print/dialogs/PrintBillConfirmDialog"
import { synthesiseBillFromAdmissionDetails } from "@/pages/Patients/print/lib/buildBillingDetails"
import { getPatient } from "@/pages/Patients/api"
import type { Patient } from "@/pages/Patients/types/patient"

interface AdmissionsPanelProps {
  patientId: number
}

/**
 * Tab content for the Admissions tab (T7, swapped order — done
 * before print bill T8).
 *
 * Renders the past-admissions list with a details dialog on row
 * click, a settle-bill dialog triggered from the details CTA, and
 * a print-bill confirm dialog driven by the top-level pdfShell
 * (T8).
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
  const [printRow, setPrintRow] = useState<PastAdmissionSummary | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const print = usePrintBill()

  /* ---- Lazy admission hydration for the print path ---- */
  const printHistoryId = printRow?.patientHistoryId ?? null
  const printDetailsRes = useAdmissionDetails(patientId, printHistoryId)
  const printDetails = printDetailsRes.details
  const synthResult = printDetails
    ? synthesiseBillFromAdmissionDetails(printDetails)
    : null

  /* ---- Lazy patient fetch for the print header ---- */
  const [printPatient, setPrintPatient] = useState<Patient | null>(null)
  // re-fetch when a different `printRow` is being printed.
  useEffect(() => {
    if (!printRow || printOpen === false) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrintPatient(null)
      return
    }
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrintPatient(null)
    getPatient(patientId)
      .then((p) => {
        if (cancelled) return
        setPrintPatient(p)
      })
      .catch(() => {
        /* lazy failure: dialog still works with the placeholder */
      })
    return () => {
      cancelled = true
    }
  }, [printRow, printOpen, patientId])

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

  function onPrint(row: PastAdmissionSummary) {
    setDetailsOpen(false)
    setPrintRow(row)
    setPrintOpen(true)
  }

  /* Minimal patient placeholder used while the lazy patient fetch
   * completes; the dialog replaces it once `printDetails.patient`
   * resolves. */
  const placeholderPatient: Patient = {
    patientId,
    name: t("common.unknown"),
    nationalId: null,
    gender: "",
    phone: null,
    address: null,
    paymentType: "cash",
    insurance: {
      insuranceId: null,
      insuranceCardId: null,
      insuranceFormId: null,
      pricelistId: null,
      pricelistName: null,
    },
    insuranceCompanyName: null,
    guardianInfo: {
      name: null,
      phone: null,
      nationalId: null,
      address: null,
    },
    guardianName: null,
    guardianPhone: null,
    guardianNationalId: null,
    guardianAddress: null,
    referringDoctorId: null,
    referringDoctorName: null,
    pricelistId: 0,
    isActive: true,
    registrationDate: "",
    isQuickCheck: false,
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
          onPrint={onPrint}
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

      {printRow ? (
        <PrintBillConfirmDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          patient={printPatient ?? placeholderPatient}
          bill={synthResult?.bill ?? null}
          billDetails={synthResult?.billDetails ?? []}
          printing={print.printing}
          onConfirm={() => {
            setPrintOpen(false)
            if (synthResult?.bill == null) return
            void print.trigger({
              patient: printPatient ?? placeholderPatient,
              bill: synthResult.bill,
              billDetails: synthResult.billDetails,
            })
          }}
        />
      ) : null}
    </Card>
  )
}
