"use client"

import { HistoryIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

import type { PastAdmissionSummary } from "@/pages/Patients/hooks/admissions/usePastAdmissions"
import { PastAdmissionCard } from "@/pages/Patients/components/Admissions/PastAdmissionCard"
import { EmptyState } from "@/components/common/EmptyState"

interface PastAdmissionsListProps {
  admissions: PastAdmissionSummary[]
  loading: boolean
  onSelect: (row: PastAdmissionSummary) => void
}

/**
 * Vertical list of tappable cards. Renders skeleton rows during the
 * initial load; an empty-state placeholder when the patient has no
 * past admissions.
 */
export function PastAdmissionsList({
  admissions,
  loading,
  onSelect,
}: PastAdmissionsListProps) {
  const { t } = useTranslation()

  if (loading && admissions.length === 0) {
    return (
      <div className="flex flex-col gap-3" aria-label={t("common.loading")}>
        {[0, 1].map((i) => (
          <Card key={`past-skeleton-${i}`} className="self-stretch">
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-5 w-2/3" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (admissions.length === 0) {
    return (
      <EmptyState
        icon={
          <HistoryIcon
            aria-hidden
            className="text-muted-foreground size-12"
          />
        }
        title={t("patients.messages.noPastAdmissions")}
        description={t("patients.messages.noPastAdmissionsText")}
      />
    )
  }

  return (
    <div
      className="scroll-thin flex max-h-[640px] flex-col gap-3 overflow-y-auto pe-1"
      aria-label={t("patients.sections.pastAdmissions")}
    >
      {admissions.map((row) => (
        <PastAdmissionCard
          key={row.patientHistoryId}
          admission={row}
          onClick={() => onSelect(row)}
        />
      ))}
    </div>
  )
}
