"use client"

import { WalletMinimalIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "@/components/common/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"

import type { PatientHistory } from "@/pages/Patients/types/patient"
import { BillingForm } from "@/pages/Patients/components/Billing/BillingForm"
import { useAssignedDrugs } from "@/pages/Patients/hooks/assigned/useAssignedDrugs"
import { useAssignedSupplies } from "@/pages/Patients/hooks/assigned/useAssignedSupplies"

interface BillingPanelProps {
  patientId: number
  admission: PatientHistory | null
}

/**
 * Billing tab content for `<PatientDetailPage>`.
 *
 * Patient not admitted → `<EmptyState>`. Otherwise mounts the
 * `<BillingForm>` which derives subtotals from
 * `Bill.billDetails[]` (the server-authoritative source of
 * `unit_price`). The Assigned-tab's per-card hooks still mount
 * here only so the skeleton gates on lines-loading state — the
 * actual pricing math does NOT use them.
 */
export function BillingPanel({
  patientId,
  admission,
}: BillingPanelProps) {
  const { t } = useTranslation()

  const billId = admission?.billId ?? null
  const isAdmitted = billId != null && Number.isFinite(billId) && billId > 0

  // Hooks still mounted so the skeleton can reflect a loading state.
  // Form values from these hooks are no longer used for pricing.
  const drugs = useAssignedDrugs(patientId, admission)
  const supplies = useAssignedSupplies(patientId, admission)

  if (!isAdmitted) {
    return (
      <EmptyState
        icon={
          <WalletMinimalIcon
            aria-hidden
            className="text-muted-foreground size-12"
          />
        }
        title={t("patients.billing.empty.notAdmittedTitle")}
        description={t("patients.billing.empty.notAdmittedDesc")}
      />
    )
  }

  const linesLoading = drugs.loading || supplies.loading

  if (linesLoading && drugs.drugs.length === 0 && supplies.supplies.length === 0) {
    return (
      <div className="flex flex-col gap-6" aria-label={t("common.loading")}>
        <div className="bg-card animate-pulse space-y-3 rounded-lg border p-6">
          <Skeleton className="mb-2 h-6 w-1/3" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9 sm:col-span-2 lg:col-span-2" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <BillingForm
      patientId={patientId}
      admission={admission}
      drugs={drugs.drugs}
      supplies={supplies.supplies}
      drugsLoading={drugs.loading}
      suppliesLoading={supplies.loading}
    />
  )
}
